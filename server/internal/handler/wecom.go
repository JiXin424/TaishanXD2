package handler

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/taishanxd/v2/internal/model"
	"github.com/taishanxd/v2/internal/repository"
)

func RegisterWecomRoutes(r *gin.Engine) {
	r.GET("/api/companies", listCompanies)
	r.GET("/api/wecom/users", listWecomUsers)
	r.GET("/api/wecom/stats", getWecomStats)
	r.GET("/api/wecom/messages", listWecomMessages)
	r.POST("/api/wecom/kefu-messages/export", exportKefuMessages)
	r.GET("/api/wecom/kefu-customers", listKefuCustomers)
	r.GET("/api/wecom/kefu-messages", listKefuMessages)
}

func listCompanies(c *gin.Context) {
	cursor, err := repository.CompaniesColl().Find(c.Request.Context(), bson.M{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer cursor.Close(c.Request.Context())

	var companies []model.CompanyDoc
	if err := cursor.All(c.Request.Context(), &companies); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	channels := []string{"wecom", "dingtalk", "feishu"}
	type companyItem struct {
		ID       string   `json:"id"`
		Name     string   `json:"name"`
		Code     string   `json:"code"`
		Channel  string   `json:"channel"`
		Channels []string `json:"channels"`
	}
	var result []companyItem
	for _, co := range companies {
		ch := co.Channel
		if ch == "" {
			ch = "wecom"
		}
		result = append(result, companyItem{
			ID:       co.ID.Hex(),
			Name:     co.Name,
			Code:     co.Code,
			Channel:  ch,
			Channels: channels,
		})
	}
	if result == nil {
		result = []companyItem{}
	}
	c.JSON(http.StatusOK, result)
}

// resolvePgCompanyID maps a MongoDB company ObjectID to a PostgreSQL company integer ID via the code field
func resolvePgCompanyID(mongoID string) (int, error) {
	objID, err := bson.ObjectIDFromHex(mongoID)
	if err != nil {
		return 0, err
	}
	var company model.CompanyDoc
	if err := repository.CompaniesColl().FindOne(nil, bson.M{"_id": objID}).Decode(&company); err != nil {
		return 0, err
	}
	var pgID int
	err = repository.DB.QueryRow("SELECT id FROM companies WHERE code = $1", company.Code).Scan(&pgID)
	return pgID, err
}

func listWecomUsers(c *gin.Context) {
	var query string
	var args []interface{}

	pgID, err := resolvePgCompanyID(c.Query("company_id"))
	if err == nil {
		query = `
			SELECT id, user_id, COALESCE(name, ''), COALESCE(mobile, ''),
			       COALESCE(job_title, ''), COALESCE(department_path, ''), COALESCE(company_id, 0)
			FROM wecom_users
			WHERE company_id = $1
			ORDER BY id
		`
		args = []interface{}{pgID}
	} else {
		query = `
			SELECT id, user_id, COALESCE(name, ''), COALESCE(mobile, ''),
			       COALESCE(job_title, ''), COALESCE(department_path, ''), COALESCE(company_id, 0)
			FROM wecom_users
			ORDER BY id
		`
	}

	rows, err := repository.DB.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var users []model.WecomUser
	for rows.Next() {
		var u model.WecomUser
		if err := rows.Scan(&u.ID, &u.UserID, &u.Name, &u.Mobile, &u.JobTitle, &u.DepartmentPath, &u.CompanyID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		users = append(users, u)
	}

	c.JSON(http.StatusOK, users)
}

// channelTableConfig maps a channel to its PostgreSQL tables and column characteristics.
type channelTableConfig struct {
	UsersTable       string // table for user count
	MessagesTable    string // table for message count
	ChatsTable       string // table for chat/session count; empty = derive from messages
	UserCountCol     string // column for distinct user counting in messages, e.g. "sender_id" or "external_userid"
	TimeColumn       string // "create_time" (bigint ms) or "created_at" (timestamp)
	TimeIsTimestamp  bool   // true → use time.Time directly; false → use UnixMilli()
	HasScope         bool   // whether group/private filtering applies
	HasCompanyFilter bool   // whether the PostgreSQL tables have a company_id column
}

var channelRegistry = map[string]channelTableConfig{
	"wecom": {
		UsersTable:       "wecom_users",
		MessagesTable:    "wecom_messages",
		ChatsTable:       "wecom_chats",
		UserCountCol:     "sender_id",
		TimeColumn:       "create_time",
		HasScope:         true,
		HasCompanyFilter: true,
	},
	"wecom_kefu": {
		UsersTable:       "wecom_kefu_customers",
		MessagesTable:    "wecom_kefu_messages",
		ChatsTable:       "",
		UserCountCol:     "external_userid",
		TimeColumn:       "created_at",
		TimeIsTimestamp:  true,
		HasScope:         false,
		HasCompanyFilter: false,
	},
	"feishu": {
		UsersTable:       "feishu_users",
		MessagesTable:    "feishu_messages",
		ChatsTable:       "feishu_chats",
		UserCountCol:     "sender_id",
		TimeColumn:       "create_time",
		HasScope:         true,
		HasCompanyFilter: true,
	},
	"dingtalk": {
		UsersTable:       "dingtalk_users",
		MessagesTable:    "dingtalk_messages",
		ChatsTable:       "dingtalk_chats",
		UserCountCol:     "sender_id",
		TimeColumn:       "create_time",
		HasScope:         true,
		HasCompanyFilter: true,
	},
}

func getWecomStats(c *gin.Context) {
	channel := c.Query("channel")
	cfg, ok := channelRegistry[channel]
	if !ok {
		cfg = channelRegistry["wecom"]
	}

	var stats model.WecomStats
	pgID, pgErr := resolvePgCompanyID(c.Query("company_id"))
	timeRange := c.Query("time_range")
	startDate := c.Query("start_date")
	endDate := c.Query("end_date")
	scope := c.Query("scope")

	useCompanyFilter := cfg.HasCompanyFilter && pgErr == nil

	startTime, endTime, timeErr := resolveTimeRange(timeRange, startDate, endDate)

	if timeErr == nil {
		// --- Time-filtered path: query from messages table ---
		args := []interface{}{}
		argIdx := 0
		conds := []string{}

		if useCompanyFilter {
			argIdx++
			conds = append(conds, fmt.Sprintf("company_id = $%d", argIdx))
			args = append(args, pgID)
		}

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

		if cfg.HasScope {
			if scope == "group" {
				argIdx++
				conds = append(conds, fmt.Sprintf("receive_id_type = $%d", argIdx))
				args = append(args, "chatid")
			} else if scope == "private" {
				argIdx++
				conds = append(conds, fmt.Sprintf("receive_id_type = $%d", argIdx))
				args = append(args, "userid")
			}
		}

		where := ""
		if len(conds) > 0 {
			where = " WHERE " + strings.Join(conds, " AND ")
		}

		repository.DB.QueryRow(
			fmt.Sprintf("SELECT count(DISTINCT %s) FROM %s%s", cfg.UserCountCol, cfg.MessagesTable, where),
			args...,
		).Scan(&stats.TotalUsers)
		repository.DB.QueryRow(
			fmt.Sprintf("SELECT count(*) FROM %s%s", cfg.MessagesTable, where),
			args...,
		).Scan(&stats.TotalMessages)

		if cfg.ChatsTable != "" {
			repository.DB.QueryRow(
				fmt.Sprintf("SELECT count(DISTINCT chat_id) FROM %s%s", cfg.MessagesTable, where),
				args...,
			).Scan(&stats.TotalChats)
		} else {
			repository.DB.QueryRow(
				fmt.Sprintf("SELECT count(DISTINCT %s) FROM %s%s", cfg.UserCountCol, cfg.MessagesTable, where),
				args...,
			).Scan(&stats.TotalChats)
		}
	} else {
		// --- No time filter: use aggregate tables ---
		if useCompanyFilter {
			repository.DB.QueryRow(
				fmt.Sprintf("SELECT count(*) FROM %s WHERE company_id = $1", cfg.UsersTable), pgID,
			).Scan(&stats.TotalUsers)

			scopeCond := ""
			if cfg.HasScope {
				if scope == "group" {
					scopeCond = " AND receive_id_type = 'chatid'"
				} else if scope == "private" {
					scopeCond = " AND receive_id_type = 'userid'"
				}
			}
			repository.DB.QueryRow(
				fmt.Sprintf("SELECT count(*) FROM %s WHERE company_id = $1%s", cfg.MessagesTable, scopeCond), pgID,
			).Scan(&stats.TotalMessages)

			if cfg.ChatsTable != "" {
				chatScopeCond := ""
				if cfg.HasScope {
					if scope == "group" {
						chatScopeCond = " AND chat_type = 'group'"
					} else if scope == "private" {
						chatScopeCond = " AND chat_type = 'single'"
					}
				}
				repository.DB.QueryRow(
					fmt.Sprintf("SELECT count(*) FROM %s WHERE company_id = $1%s", cfg.ChatsTable, chatScopeCond), pgID,
				).Scan(&stats.TotalChats)
			} else {
				repository.DB.QueryRow(
					fmt.Sprintf("SELECT count(DISTINCT %s) FROM %s WHERE company_id = $1", cfg.UserCountCol, cfg.MessagesTable), pgID,
				).Scan(&stats.TotalChats)
			}
		} else {
			repository.DB.QueryRow(
				fmt.Sprintf("SELECT count(*) FROM %s", cfg.UsersTable),
			).Scan(&stats.TotalUsers)

			scopeCond := ""
			if cfg.HasScope {
				if scope == "group" {
					scopeCond = " WHERE receive_id_type = 'chatid'"
				} else if scope == "private" {
					scopeCond = " WHERE receive_id_type = 'userid'"
				}
			}
			repository.DB.QueryRow(
				fmt.Sprintf("SELECT count(*) FROM %s%s", cfg.MessagesTable, scopeCond),
			).Scan(&stats.TotalMessages)

			if cfg.ChatsTable != "" {
				chatScopeCond := ""
				if cfg.HasScope {
					if scope == "group" {
						chatScopeCond = " WHERE chat_type = 'group'"
					} else if scope == "private" {
						chatScopeCond = " WHERE chat_type = 'single'"
					}
				}
				repository.DB.QueryRow(
					fmt.Sprintf("SELECT count(*) FROM %s%s", cfg.ChatsTable, chatScopeCond),
				).Scan(&stats.TotalChats)
			} else {
				repository.DB.QueryRow(
					fmt.Sprintf("SELECT count(DISTINCT %s) FROM %s", cfg.UserCountCol, cfg.MessagesTable),
				).Scan(&stats.TotalChats)
			}
		}
	}

	c.JSON(http.StatusOK, stats)
}

// listWecomMessages godoc
// @Summary      查询用户聊天记录
// @Description  根据企业微信 platform_user_id 查询该用户相关的所有消息（作为发送者或接收者），支持时间范围和会话类型筛选
// @Tags         企业微信
// @Produce      json
// @Param        platform_user_id  query     string  true   "企业微信用户ID（如 GuoTongJia）"
// @Param        company_id        query     string  false  "MongoDB 公司 ID（可选，不传则不过滤公司）"
// @Param        start_time        query     string  false  "起始时间（毫秒时间戳）"
// @Param        end_time          query     string  false  "截止时间（毫秒时间戳）"
// @Param        scope             query     string  false  "会话类型：all / group / private"  default(all)
// @Param        limit             query     int     false  "返回条数（最大 500）"  default(100)
// @Success      200  {array}   model.WecomMessage
// @Failure      400  {object}  map[string]string
// @Router       /api/wecom/messages [get]
func listWecomMessages(c *gin.Context) {
	platformUserID := c.Query("platform_user_id")
	if platformUserID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "platform_user_id is required"})
		return
	}

	args := []interface{}{platformUserID, platformUserID}
	argIdx := 2

	// company_id is optional — if provided and resolvable, filter by it
	whereExtra := ""
	if cid := c.Query("company_id"); cid != "" {
		pgID, err := resolvePgCompanyID(cid)
		if err == nil {
			argIdx++
			whereExtra += fmt.Sprintf(" AND m.company_id = $%d", argIdx)
			args = append(args, pgID)
		}
	}

	if startTime := c.Query("start_time"); startTime != "" {
		argIdx++
		whereExtra += fmt.Sprintf(" AND m.create_time >= $%d", argIdx)
		args = append(args, startTime)
	}
	if endTime := c.Query("end_time"); endTime != "" {
		argIdx++
		whereExtra += fmt.Sprintf(" AND m.create_time <= $%d", argIdx)
		args = append(args, endTime)
	}

	// chat scope: all / group / private
	if scope := c.Query("scope"); scope == "group" {
		argIdx++
		whereExtra += fmt.Sprintf(" AND m.receive_id_type = $%d", argIdx)
		args = append(args, "chatid")
	} else if scope == "private" {
		argIdx++
		whereExtra += fmt.Sprintf(" AND m.receive_id_type = $%d", argIdx)
		args = append(args, "userid")
	}

	limit := 100
	if l := c.Query("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 500 {
			limit = v
		}
	}
	argIdx++
	args = append(args, limit)

	query := fmt.Sprintf(`
		SELECT m.id, COALESCE(m.message_id,''), COALESCE(m.chat_id,''),
		       COALESCE(m.msg_type,''), COALESCE(m.content,''),
		       COALESCE(m.sender_id,''), COALESCE(m.sender_id_type,''),
		       COALESCE(m.receive_id,''), COALESCE(m.receive_id_type,''),
		       COALESCE(m.direction,''), COALESCE(m.create_time,0),
		       COALESCE(ch.name,'')
		FROM wecom_messages m
		LEFT JOIN wecom_chats ch ON m.chat_id = ch.chat_id
		WHERE (m.sender_id = $1 OR m.receive_id = $2)
		%s
		ORDER BY m.create_time DESC
		LIMIT $%d
	`, whereExtra, argIdx)

	rows, err := repository.DB.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var messages []model.WecomMessage
	for rows.Next() {
		var msg model.WecomMessage
		if err := rows.Scan(
			&msg.ID, &msg.MessageID, &msg.ChatID,
			&msg.MsgType, &msg.Content,
			&msg.SenderID, &msg.SenderIDType,
			&msg.ReceiveID, &msg.ReceiveIDType,
			&msg.Direction, &msg.CreateTime,
			&msg.ChatName,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		messages = append(messages, msg)
	}
	if messages == nil {
		messages = []model.WecomMessage{}
	}

	c.JSON(http.StatusOK, messages)
}

// listKefuMessages godoc
// @Summary      查询客服聊天记录
// @Description  根据 external_userid 查询微信客服消息，包含用户提问（received）和机器人回复（sent），支持时间范围筛选
// @Tags         企业微信
// @Produce      json
// @Param        external_userid  query     string  true   "外部用户ID"
// @Param        start_time       query     string  false  "起始时间（RFC3339 格式，如 2026-05-01T00:00:00Z）"
// @Param        end_time         query     string  false  "截止时间（RFC3339 格式）"
// @Param        limit            query     int     false  "返回条数（最大 500）"  default(100)
// @Success      200  {array}   model.KefuMessage
// @Failure      400  {object}  map[string]string
// @Router       /api/wecom/kefu-messages [get]
func listKefuMessages(c *gin.Context) {
	externalUserID := c.Query("external_userid")
	if externalUserID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "external_userid is required"})
		return
	}

	args := []interface{}{externalUserID}
	argIdx := 1
	whereExtra := ""

	if startTime := c.Query("start_time"); startTime != "" {
		argIdx++
		whereExtra += fmt.Sprintf(" AND created_at >= $%d", argIdx)
		args = append(args, startTime)
	}
	if endTime := c.Query("end_time"); endTime != "" {
		argIdx++
		whereExtra += fmt.Sprintf(" AND created_at <= $%d", argIdx)
		args = append(args, endTime)
	}

	limit := 100
	if l := c.Query("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 500 {
			limit = v
		}
	}
	argIdx++
	args = append(args, limit)

	query := fmt.Sprintf(`
		SELECT id, COALESCE(message_id,''), COALESCE(external_userid,''),
		       COALESCE(open_kfid,''), COALESCE(msg_type,''),
		       COALESCE(content::text,''), COALESCE(direction,''),
		       COALESCE(to_char(created_at, 'YYYY-MM-DD HH24:MI:SS'),'')
		FROM wecom_kefu_messages
		WHERE external_userid = $1
		%s
		ORDER BY created_at ASC
		LIMIT $%d
	`, whereExtra, argIdx)

	rows, err := repository.DB.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var messages []model.KefuMessage
	for rows.Next() {
		var msg model.KefuMessage
		if err := rows.Scan(
			&msg.ID, &msg.MessageID, &msg.ExternalUserID,
			&msg.OpenKfID, &msg.MsgType, &msg.Content,
			&msg.Direction, &msg.CreatedAt,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		messages = append(messages, msg)
	}
	if messages == nil {
		messages = []model.KefuMessage{}
	}

	c.JSON(http.StatusOK, messages)
}

// listKefuCustomers godoc
// @Summary      客服客户列表
// @Description  返回所有客服客户，包含消息统计和最后活跃时间
// @Tags         企业微信
// @Produce      json
// @Success      200  {array}  model.KefuCustomer
// @Router       /api/wecom/kefu-customers [get]
func listKefuCustomers(c *gin.Context) {
	timeCond := ""
	timeRange := c.Query("time_range")
	var timeArgs []interface{}

	if timeRange != "" {
		start, end, err := resolveTimeRange(timeRange, c.Query("start_date"), c.Query("end_date"))
		if err == nil {
			timeCond = " AND created_at >= $1 AND created_at < $2"
			timeArgs = []interface{}{start, end}
		}
	}

	query := fmt.Sprintf(`
		SELECT c.external_userid,
		       COALESCE(c.nickname, ''),
		       COALESCE(c.avatar, ''),
		       COALESCE(c.gender::text, ''),
		       COALESCE(s.sent_count, 0),
		       COALESCE(r.recv_count, 0),
		       COALESCE(to_char(m.last_active, 'YYYY-MM-DD HH24:MI:SS'), '')
		FROM wecom_kefu_customers c
		LEFT JOIN (SELECT external_userid, COUNT(*) as sent_count FROM wecom_kefu_messages WHERE direction = 'sent' AND external_userid != ''%s GROUP BY external_userid) s
		  ON c.external_userid = s.external_userid
		LEFT JOIN (SELECT external_userid, COUNT(*) as recv_count FROM wecom_kefu_messages WHERE direction = 'received' AND external_userid != ''%s GROUP BY external_userid) r
		  ON c.external_userid = r.external_userid
		LEFT JOIN (SELECT external_userid, MAX(created_at) as last_active FROM wecom_kefu_messages WHERE external_userid != ''%s GROUP BY external_userid) m
		  ON c.external_userid = m.external_userid
		ORDER BY m.last_active DESC NULLS LAST
	`, timeCond, timeCond, timeCond)
	rows, err := repository.DB.Query(query, timeArgs...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var customers []model.KefuCustomer
	for rows.Next() {
		var cu model.KefuCustomer
		if err := rows.Scan(&cu.ExternalUserID, &cu.Nickname, &cu.Avatar, &cu.Gender,
			&cu.TotalSent, &cu.TotalReceived, &cu.LastActiveAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		customers = append(customers, cu)
	}
	if customers == nil {
		customers = []model.KefuCustomer{}
	}
	c.JSON(http.StatusOK, customers)
}

// exportKefuMessages godoc
// @Summary      批量导出客服聊天记录
// @Description  根据多个 external_userid 导出聊天记录为 CSV，受时间范围约束
// @Tags         企业微信
// @Accept       json
// @Produce      text/csv
// @Param        body  body  object  true  "导出参数"
// @Success      200  {file}  binary
// @Failure      400  {object}  map[string]string
// @Router       /api/wecom/kefu-messages/export [post]
func exportKefuMessages(c *gin.Context) {
	var req struct {
		ExternalUserIDs []string `json:"external_userids" binding:"required"`
		StartTime       string   `json:"start_time"`
		EndTime         string   `json:"end_time"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	placeholders := make([]string, len(req.ExternalUserIDs))
	args := make([]interface{}, len(req.ExternalUserIDs))
	for i, id := range req.ExternalUserIDs {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}
	argIdx := len(req.ExternalUserIDs)

	whereExtra := ""
	if req.StartTime != "" {
		argIdx++
		whereExtra += fmt.Sprintf(" AND m.created_at >= $%d", argIdx)
		args = append(args, req.StartTime)
	}
	if req.EndTime != "" {
		argIdx++
		whereExtra += fmt.Sprintf(" AND m.created_at <= $%d", argIdx)
		args = append(args, req.EndTime)
	}

	query := fmt.Sprintf(`
		SELECT COALESCE(c.nickname, m.external_userid),
		       COALESCE(m.external_userid,''),
		       COALESCE(m.direction,''),
		       COALESCE(m.content::text,''),
		       COALESCE(to_char(m.created_at, 'YYYY-MM-DD HH24:MI:SS'),'')
		FROM wecom_kefu_messages m
		LEFT JOIN wecom_kefu_customers c ON m.external_userid = c.external_userid
		WHERE m.external_userid = ANY(ARRAY[%s])
		%s
		ORDER BY m.external_userid, m.created_at ASC
	`, strings.Join(placeholders, ","), whereExtra)

	rows, err := repository.DB.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	now := time.Now().Format("20060102_150405")
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="kefu-export-%s.csv"`, now))

	writer := csv.NewWriter(c.Writer)
	c.Writer.Write([]byte{0xEF, 0xBB, 0xBF})
	writer.Write([]string{"客户昵称", "方向", "内容", "时间"})

	for rows.Next() {
		var nickname, externalID, direction, content, createdAt string
		if err := rows.Scan(&nickname, &externalID, &direction, &content, &createdAt); err != nil {
			continue
		}
		dirLabel := "用户"
		if direction == "sent" {
			dirLabel = "AI助手"
		}
		cleanContent := strings.ReplaceAll(content, "\n", " ")
		cleanContent = strings.ReplaceAll(cleanContent, "\r", "")
		writer.Write([]string{nickname, dirLabel, cleanContent, createdAt})
	}
	writer.Flush()
}
