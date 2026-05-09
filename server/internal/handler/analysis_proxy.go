package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/taishanxd/v2/internal/repository"
)

const llmAnalysisURL = "http://llm-analysis:8000"

// AnalysisProxyRequest is what the frontend sends.
type AnalysisProxyRequest struct {
	CompanyID string `json:"company_id"`
	Channel   string `json:"channel"`
	AppID     string `json:"app_id"`
	AppName   string `json:"app_name"`
	TimeRange string `json:"time_range"`
}

// dialogueItem matches the Python DialogueItem model.
type dialogueItem struct {
	Time     string `json:"time"`
	UserID   string `json:"user_id"`
	UserName string `json:"user_name"`
	Status   string `json:"status"`
	Latency  int    `json:"latency_ms"`
	Dialogue struct {
		User string `json:"user"`
		AI   string `json:"ai"`
	} `json:"dialogue"`
}

// llmAnalyzeRequest matches the Python AnalysisRequest model.
type llmAnalyzeRequest struct {
	AppID           string         `json:"app_id"`
	CompanyID       int            `json:"company_id"`
	AppName         string         `json:"app_name"`
	AnalysisTarget  string         `json:"analysis_target"`
	DataList        []dialogueItem `json:"data_list"`
	DateRange       string         `json:"date_range"`
	TimeRange       string         `json:"time_range"`
	CoverageDisplay string         `json:"coverage_display"`
}

func RegisterAnalysisProxyRoutes(r *gin.Engine) {
	r.POST("/api/analysis/analyze", handleAnalyze)
	r.GET("/api/analysis/history", handleAnalysisHistory)
}

func handleAnalyze(c *gin.Context) {
	var req AnalysisProxyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	cfg, ok := channelRegistry[req.Channel]
	if !ok {
		cfg = channelRegistry["wecom"]
	}

	// Resolve time range
	startTime, endTime, timeErr := resolveTimeRange(req.TimeRange, "", "")
	var dateRangeStr, coverageStr string
	if timeErr == nil {
		dateRangeStr = fmt.Sprintf("%s 至 %s", startTime.Format("2006-01-02"), endTime.Format("2006-01-02"))
		coverageStr = fmt.Sprintf("%s年%s月%s日 - %s年%s月%s日",
			startTime.Format("2006"), startTime.Format("1"), startTime.Format("2"),
			endTime.Format("2006"), endTime.Format("1"), endTime.Format("2"))
	} else {
		dateRangeStr = "全部时间"
		coverageStr = "全部数据"
	}

	// Query messages from PostgreSQL based on channel config
	dataList, pgID, err := fetchDialogueData(req.CompanyID, req.Channel, cfg, timeErr, startTime, endTime)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("查询数据失败: %v", err)})
		return
	}

	if len(dataList) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"error":   "所选时间范围内没有对话数据",
			"data":    nil,
		})
		return
	}

	// Resolve company_id for the Python service (integer PG ID)
	companyIDInt := 0
	if pgID > 0 {
		companyIDInt = pgID
	}

	// Build the Python service request
	appName := req.AppName
	if appName == "" {
		appName = "微信客服"
	}

	analysisTarget := fmt.Sprintf("分析%s的AI工具使用情况，包含%d条对话记录", appName, len(dataList))

	llmReq := llmAnalyzeRequest{
		AppID:           req.AppID,
		CompanyID:       companyIDInt,
		AppName:         appName,
		AnalysisTarget:  analysisTarget,
		DataList:        dataList,
		DateRange:       dateRangeStr,
		TimeRange:       req.TimeRange,
		CoverageDisplay: coverageStr,
	}

	body, err := json.Marshal(llmReq)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "序列化请求失败"})
		return
	}

	// Forward to Python service
	resp, err := http.Post(llmAnalysisURL+"/api/v1/analyze", "application/json", bytes.NewReader(body))
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("分析服务不可达: %v", err)})
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取分析结果失败"})
		return
	}

	c.Data(resp.StatusCode, "application/json", respBody)
}

func handleAnalysisHistory(c *gin.Context) {
	appID := c.Query("app_id")
	companyID := c.Query("company_id")
	limit := c.DefaultQuery("limit", "20")

	url := fmt.Sprintf("%s/api/v1/analysis/history?app_id=%s&company_id=%s&limit=%s",
		llmAnalysisURL, appID, companyID, limit)

	resp, err := http.Get(url)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "分析服务不可达"})
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取历史记录失败"})
		return
	}

	c.Data(resp.StatusCode, "application/json", respBody)
}

// fetchDialogueData queries the appropriate messages table and returns dialogue items.
func fetchDialogueData(mongoCompanyID, channel string, cfg channelTableConfig, timeErr error, startTime, endTime time.Time) ([]dialogueItem, int, error) {
	pgID, pgErr := resolvePgCompanyID(mongoCompanyID)
	useCompanyFilter := cfg.HasCompanyFilter && pgErr == nil

	args := []interface{}{}
	argIdx := 0
	conds := []string{}

	if useCompanyFilter {
		argIdx++
		conds = append(conds, fmt.Sprintf("company_id = $%d", argIdx))
		args = append(args, pgID)
	}

	if timeErr == nil {
		argIdx++
		conds = append(conds, fmt.Sprintf("%s >= $%d", cfg.TimeColumn, argIdx))
		if cfg.TimeIsTimestamp {
			args = append(args, startTime)
		} else {
			args = append(args, startTime.UnixMilli())
		}
		argIdx++
		conds = append(conds, fmt.Sprintf("%s < $%d", cfg.TimeColumn, argIdx))
		if cfg.TimeIsTimestamp {
			args = append(args, endTime)
		} else {
			args = append(args, endTime.UnixMilli())
		}
	}

	where := ""
	if len(conds) > 0 {
		where = " WHERE " + joinStrings(conds, " AND ")
	}

	pgIDInt := 0
	if pgErr == nil {
		pgIDInt = pgID
	}

	// Different query per channel
	switch channel {
	case "wecom_kefu":
		return fetchKefuDialogue(where, args, pgIDInt)
	default:
		return fetchWecomDialogue(where, args, pgIDInt)
	}
}

func fetchKefuDialogue(where string, args []interface{}, pgID int) ([]dialogueItem, int, error) {
	query := fmt.Sprintf(`
		SELECT m.external_userid, COALESCE(c.nickname, m.external_userid),
		       m.content, m.direction, m.created_at
		FROM wecom_kefu_messages m
		LEFT JOIN wecom_kefu_customers c ON m.external_userid = c.external_userid
		%s
		ORDER BY m.created_at ASC
		LIMIT 500
	`, where)

	rows, err := repository.DB.Query(query, args...)
	if err != nil {
		return nil, pgID, err
	}
	defer rows.Close()

	// Group by user to build conversation pairs
	type userMsg struct {
		userID   string
		userName string
		content  string
		dir      string
		time     time.Time
	}
	var msgs []userMsg
	for rows.Next() {
		var uid, name, content, dir string
		var t time.Time
		if err := rows.Scan(&uid, &name, &content, &dir, &t); err != nil {
			continue
		}
		msgs = append(msgs, userMsg{uid, name, content, dir, t})
	}

	// Build dialogue items: pair received (user) + sent (AI)
	var items []dialogueItem
	i := 0
	for i < len(msgs) {
		if msgs[i].dir == "received" {
			item := dialogueItem{
				Time:     msgs[i].time.Format("2006-01-02 15:04"),
				UserID:   msgs[i].userID,
				UserName: msgs[i].userName,
				Status:   "处理成功",
				Latency:  500,
			}
			item.Dialogue.User = msgs[i].content
			// Look for AI reply
			if i+1 < len(msgs) && msgs[i+1].dir == "sent" {
				item.Dialogue.AI = msgs[i+1].content
				i += 2
			} else {
				item.Dialogue.AI = ""
				i++
			}
			items = append(items, item)
		} else {
			i++
		}
	}

	return items, pgID, nil
}

func fetchWecomDialogue(where string, args []interface{}, pgID int) ([]dialogueItem, int, error) {
	query := fmt.Sprintf(`
		SELECT m.sender_id, COALESCE(u.name, m.sender_id),
		       m.content, m.create_time
		FROM wecom_messages m
		LEFT JOIN wecom_users u ON m.sender_id = u.user_id
		%s
		ORDER BY m.create_time ASC
		LIMIT 500
	`, where)

	rows, err := repository.DB.Query(query, args...)
	if err != nil {
		return nil, pgID, err
	}
	defer rows.Close()

	var items []dialogueItem
	for rows.Next() {
		var uid, name, content string
		var createMs int64
		if err := rows.Scan(&uid, &name, &content, &createMs); err != nil {
			continue
		}
		item := dialogueItem{
			Time:     time.UnixMilli(createMs).Format("2006-01-02 15:04"),
			UserID:   uid,
			UserName: name,
			Status:   "处理成功",
			Latency:  500,
		}
		item.Dialogue.User = content
		item.Dialogue.AI = ""
		items = append(items, item)
	}

	return items, pgID, nil
}

func joinStrings(ss []string, sep string) string {
	if len(ss) == 0 {
		return ""
	}
	result := ss[0]
	for _, s := range ss[1:] {
		result += sep + s
	}
	return result
}
