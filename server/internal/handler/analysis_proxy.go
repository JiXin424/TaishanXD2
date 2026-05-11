package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/taishanxd/v2/internal/model"
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

// llmAnalyzeResponse matches the Python AnalyzeResponse model.
type llmAnalyzeResponse struct {
	Success     bool        `json:"success"`
	Data        interface{} `json:"data"`
	Error       *string     `json:"error"`
	AnalysisID  *int        `json:"analysis_id"`
}

// checkAnalysisCache looks for a recent successful analysis in MongoDB.
// Cache is valid for 30 minutes to avoid redundant LLM calls.
const analysisCacheTTL = 7 * 24 * time.Hour

func checkAnalysisCache(appID, companyID, timeRange string) *model.AnalysisLogDoc {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	cutoff := time.Now().Add(-analysisCacheTTL)
	filter := bson.M{
		"appId":     appID,
		"companyId": companyID,
		"timeRange": timeRange,
		"success":   true,
		"createdAt": bson.M{"$gte": cutoff},
	}

	var doc model.AnalysisLogDoc
	err := repository.AnalysisLogsColl().FindOne(ctx, filter).Decode(&doc)
	if err != nil {
		return nil
	}
	return &doc
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

	// Check cache: if a successful report exists for the same app+company+timeRange, return it directly
	cached := checkAnalysisCache(req.AppID, req.CompanyID, req.TimeRange)
	if cached != nil {
		log.Printf("[analysis] 命中缓存: app=%s company=%s timeRange=%s id=%s", req.AppID, req.CompanyID, req.TimeRange, cached.ID.Hex())
		c.JSON(http.StatusOK, gin.H{
			"success":     true,
			"data":        cached.Report,
			"error":       nil,
			"analysis_id": cached.ID.Hex(),
			"cached":      true,
		})
		return
	}

	// Query messages from PostgreSQL based on channel config
	dataList, pgID, err := fetchDialogueData(req.CompanyID, req.Channel, cfg, timeErr, startTime, endTime)
	if err != nil {
		log.Printf("[analysis] 查询数据失败: company=%s channel=%s timeRange=%s err=%v", req.CompanyID, req.Channel, req.TimeRange, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("查询数据失败: %v", err)})
		return
	}

	log.Printf("[analysis] 查询到 %d 条对话数据 company=%s channel=%s timeRange=%s pgID=%d", len(dataList), req.CompanyID, req.Channel, req.TimeRange, pgID)

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

	log.Printf("[analysis] 转发到 Python 服务: url=%s bodySize=%d bytes", llmAnalysisURL+"/api/v1/analyze", len(body))

	// Forward to Python service
	httpClient := &http.Client{Timeout: 600 * time.Second}
	resp, err := httpClient.Post(llmAnalysisURL+"/api/v1/analyze", "application/json", bytes.NewReader(body))
	if err != nil {
		log.Printf("[analysis] Python 服务请求失败: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("分析服务不可达: %v", err)})
		return
	}
	defer resp.Body.Close()

	log.Printf("[analysis] Python 服务响应: status=%d", resp.StatusCode)

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取分析结果失败"})
		return
	}

	// Save to MongoDB
	var llmResp llmAnalyzeResponse
	if jsonErr := json.Unmarshal(respBody, &llmResp); jsonErr == nil {
		go saveAnalysisLog(req, llmResp, coverageStr)
	}

	c.Data(resp.StatusCode, "application/json", respBody)
}

// saveAnalysisLog persists the analysis result to MongoDB (async).
func saveAnalysisLog(req AnalysisProxyRequest, llmResp llmAnalyzeResponse, coverageDisplay string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Extract summary info from report data
	var summary string
	var coreIntents []string
	var qualityIssues []string

	if reportMap, ok := llmResp.Data.(map[string]interface{}); ok {
		if cats, ok := reportMap["categories"].([]interface{}); ok {
			for _, c := range cats {
				if cm, ok := c.(map[string]interface{}); ok {
					if name, ok := cm["name"].(string); ok {
						coreIntents = append(coreIntents, name)
					}
				}
			}
		}
		if patterns, ok := reportMap["common_patterns"].([]interface{}); ok {
			for _, p := range patterns {
				if pm, ok := p.(map[string]interface{}); ok {
					if title, ok := pm["title"].(string); ok {
						qualityIssues = append(qualityIssues, title)
					}
				}
			}
		}
		if spotlight, ok := reportMap["spotlight"].(map[string]interface{}); ok {
			if title, ok := spotlight["title"].(string); ok {
				summary = title
			}
		}
		if insights, ok := reportMap["key_insights"].([]interface{}); ok && len(insights) > 0 {
			parts := []string{}
			if summary != "" {
				parts = append(parts, summary)
			}
			for i := 0; i < 3 && i < len(insights); i++ {
				if im, ok := insights[i].(map[string]interface{}); ok {
					if title, ok := im["title"].(string); ok {
						parts = append(parts, title)
					}
				}
			}
			summary = ""
			for i, p := range parts {
				if i > 0 {
					summary += "；"
				}
				summary += p
			}
		}
	}

	errMsg := ""
	if llmResp.Error != nil {
		errMsg = *llmResp.Error
	}

	doc := model.AnalysisLogDoc{
		ID:              bson.NewObjectID(),
		AppID:           req.AppID,
		CompanyID:       req.CompanyID,
		AnalysisTarget:  fmt.Sprintf("分析%s的AI工具使用情况", req.AppName),
		DataCount:       0, // will be filled from report header
		CoverageDisplay: coverageDisplay,
		TimeRange:       req.TimeRange,
		Success:         llmResp.Success,
		ErrorMsg:        errMsg,
		Summary:         summary,
		CoreIntents:     coreIntents,
		QualityIssues:   qualityIssues,
		Report:          llmResp.Data,
		CreatedAt:       time.Now(),
	}

	// Get data_count from report header
	if reportMap, ok := llmResp.Data.(map[string]interface{}); ok {
		if header, ok := reportMap["header"].(map[string]interface{}); ok {
			if tc, ok := header["total_conversations"].(float64); ok {
				doc.DataCount = int(tc)
			}
		}
	}

	_, err := repository.AnalysisLogsColl().InsertOne(ctx, doc)
	if err != nil {
		log.Printf("[analysis] 保存分析日志到 MongoDB 失败: %v", err)
	} else {
		log.Printf("[analysis] 分析日志已保存到 MongoDB: id=%s company=%s", doc.ID.Hex(), req.CompanyID)
	}
}

func handleAnalysisHistory(c *gin.Context) {
	appID := c.Query("app_id")
	companyID := c.Query("company_id")
	limit := 20

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{"success": true}
	if appID != "" {
		filter["appId"] = appID
	}
	if companyID != "" {
		filter["companyId"] = companyID
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "createdAt", Value: -1}}).
		SetLimit(int64(limit))

	cursor, err := repository.AnalysisLogsColl().Find(ctx, filter, opts)
	if err != nil {
		log.Printf("[analysis] 查询历史失败: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询历史记录失败"})
		return
	}
	defer cursor.Close(ctx)

	var results []model.AnalysisLogDoc
	if err := cursor.All(ctx, &results); err != nil {
		log.Printf("[analysis] 解析历史记录失败: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "解析历史记录失败"})
		return
	}

	if results == nil {
		results = []model.AnalysisLogDoc{}
	}

	c.JSON(http.StatusOK, results)
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

	// Use table alias prefix for JOIN queries to avoid ambiguous column references
	tableAlias := ""
	if channel == "wecom_kefu" {
		tableAlias = "m."
	}

	if timeErr == nil {
		argIdx++
		conds = append(conds, fmt.Sprintf("%s%s >= $%d", tableAlias, cfg.TimeColumn, argIdx))
		if cfg.TimeIsTimestamp {
			args = append(args, startTime)
		} else {
			args = append(args, startTime.UnixMilli())
		}
		argIdx++
		conds = append(conds, fmt.Sprintf("%s%s < $%d", tableAlias, cfg.TimeColumn, argIdx))
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
		if uid == "" {
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
