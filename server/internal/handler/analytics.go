package handler

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/taishanxd/v2/internal/model"
	"github.com/taishanxd/v2/internal/repository"
)

// getAnalytics godoc
// @Summary      使用分析数据
// @Description  根据筛选条件（渠道、时间范围、聊天类型）返回 4 组聚合数据：各用户会话数、各用户 Token 消耗、总对话量趋势、使用时段分布
// @Tags         分析
// @Produce      json
// @Param        channel      query     string  true   "渠道：wecom / wecom_kefu"  default(wecom)
// @Param        time_range   query     string  true   "时间范围：yesterday / last_week / last_month / custom"
// @Param        chat_scope   query     string  true   "聊天类型：all / group / private"
// @Param        start_date   query     string  false  "自定义起始日期（YYYY-MM-DD）"
// @Param        end_date     query     string  false  "自定义截止日期（YYYY-MM-DD）"
// @Success      200  {object}  model.AnalyticsResponse
// @Failure      400  {object}  map[string]string
// @Router       /api/analytics/usage [get]
func getAnalytics(c *gin.Context) {
	channel := c.DefaultQuery("channel", "wecom")
	timeRange := c.DefaultQuery("time_range", "yesterday")
	chatScope := c.DefaultQuery("chat_scope", "all")

	if channel != "wecom" && channel != "wecom_kefu" {
		c.JSON(http.StatusOK, emptyAnalytics())
		return
	}

	start, end, err := resolveTimeRange(timeRange, c.Query("start_date"), c.Query("end_date"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	dateFmt := "MM-DD"
	if timeRange == "yesterday" {
		dateFmt = "HH24:MI"
	}

	var resp model.AnalyticsResponse

	if channel == "wecom_kefu" {
		resp = queryKefuAnalytics(start, end, dateFmt)
	} else if chatScope == "private" {
		resp = queryKefuAnalytics(start, end, dateFmt)
	} else {
		scopeType := ""
		if chatScope == "group" {
			scopeType = "chatid"
		}
		resp = queryMessageAnalytics(start, end, scopeType, dateFmt)
	}

	c.JSON(http.StatusOK, resp)
}

func emptyAnalytics() model.AnalyticsResponse {
	return model.AnalyticsResponse{
		UserConversations:  []model.UserCount{},
		UserTokens:         []model.UserToken{},
		ConversationVolume: []model.TimeBucket{},
		TimeDistribution:   []model.HourBucket{},
	}
}

func resolveTimeRange(timeRange, startStr, endStr string) (start, end time.Time, err error) {
	loc, _ := time.LoadLocation("Asia/Shanghai")
	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)

	switch timeRange {
	case "yesterday":
		start = today.AddDate(0, 0, -1)
		end = today
	case "last_week":
		start = today.AddDate(0, 0, -7)
		end = today
	case "last_month":
		start = today.AddDate(0, -1, 0)
		end = today
	case "custom":
		if startStr == "" || endStr == "" {
			return time.Time{}, time.Time{}, fmt.Errorf("custom range requires start_date and end_date")
		}
		start, err = time.ParseInLocation("2006-01-02", startStr, loc)
		if err != nil {
			return time.Time{}, time.Time{}, fmt.Errorf("invalid start_date format")
		}
		end, err = time.ParseInLocation("2006-01-02", endStr, loc)
		if err != nil {
			return time.Time{}, time.Time{}, fmt.Errorf("invalid end_date format")
		}
		end = end.AddDate(0, 0, 1)
	default:
		return time.Time{}, time.Time{}, fmt.Errorf("invalid time_range: %s", timeRange)
	}
	return
}

func queryKefuAnalytics(start, end time.Time, dateFmt string) model.AnalyticsResponse {
	uc := kefuUserConversations(start, end)
	ut := kefuUserTokens(start, end)
	// names already resolved via SQL JOIN with wecom_kefu_customers
	return model.AnalyticsResponse{
		UserConversations:  uc,
		UserTokens:         ut,
		ConversationVolume: kefuConversationVolume(start, end, dateFmt),
		TimeDistribution:   kefuTimeDistribution(start, end),
	}
}

func queryMessageAnalytics(start, end time.Time, scopeType, dateFmt string) model.AnalyticsResponse {
	startMs := start.UnixMilli()
	endMs := end.UnixMilli()
	uc := msgUserConversations(startMs, endMs, scopeType)
	ut := msgUserTokens(startMs, endMs, scopeType)
	resolveUserNames(uc, ut)
	return model.AnalyticsResponse{
		UserConversations:  uc,
		UserTokens:         ut,
		ConversationVolume: msgConversationVolume(startMs, endMs, scopeType, dateFmt),
		TimeDistribution:   msgTimeDistribution(startMs, endMs, scopeType),
	}
}

func resolveUserNames(uc []model.UserCount, ut []model.UserToken) {
	idSet := make(map[string]bool)
	for _, u := range uc {
		if u.UserID != "" {
			idSet[u.UserID] = true
		}
	}
	for _, u := range ut {
		if u.UserID != "" {
			idSet[u.UserID] = true
		}
	}
	if len(idSet) == 0 {
		return
	}

	ids := make([]string, 0, len(idSet))
	for id := range idSet {
		ids = append(ids, id)
	}

	cursor, err := repository.UsersColl().Find(
		context.Background(),
		bson.M{"channelBindings.platformUserId": bson.M{"$in": ids}},
	)
	if err != nil {
		return
	}
	defer cursor.Close(context.Background())

	nameMap := make(map[string]string)
	for cursor.Next(context.Background()) {
		var user model.UserDoc
		if err := cursor.Decode(&user); err != nil {
			continue
		}
		for _, b := range user.ChannelBindings {
			if _, exists := nameMap[b.PlatformUserID]; !exists && b.PlatformUserID != "" {
				name := b.PlatformUserName
				if name == "" {
					name = user.Name
				}
				nameMap[b.PlatformUserID] = name
			}
		}
	}

	for i := range uc {
		if n, ok := nameMap[uc[i].UserID]; ok {
			uc[i].UserName = n
		} else {
			uc[i].UserName = uc[i].UserID
		}
	}
	for i := range ut {
		if n, ok := nameMap[ut[i].UserID]; ok {
			ut[i].UserName = n
		} else {
			ut[i].UserName = ut[i].UserID
		}
	}
}

// --- Kefu query helpers ---

func kefuUserConversations(start, end time.Time) []model.UserCount {
	rows, err := repository.DB.Query(`
		SELECT m.external_userid, COALESCE(c.nickname, m.external_userid), COUNT(*)::int AS count
		FROM wecom_kefu_messages m
		LEFT JOIN wecom_kefu_customers c ON m.external_userid = c.external_userid
		WHERE m.created_at >= $1 AND m.created_at < $2 AND m.external_userid != ''
		GROUP BY m.external_userid, c.nickname
		ORDER BY count DESC
		LIMIT 20
	`, start, end)
	if err != nil {
		log.Printf("kefuUserConversations query error: %v", err)
		return nil
	}
	defer rows.Close()

	var result []model.UserCount
	for rows.Next() {
		var uc model.UserCount
		if err := rows.Scan(&uc.UserID, &uc.UserName, &uc.Count); err != nil {
			log.Printf("kefuUserConversations scan error: %v", err)
			return nil
		}
		result = append(result, uc)
	}
	if err := rows.Err(); err != nil {
		log.Printf("kefuUserConversations rows error: %v", err)
		return nil
	}
	return result
}

func kefuUserTokens(start, end time.Time) []model.UserToken {
	rows, err := repository.DB.Query(`
		SELECT m.external_userid, COALESCE(c.nickname, m.external_userid), COALESCE(SUM(LENGTH(m.content::text)), 0)::int / 2 AS tokens
		FROM wecom_kefu_messages m
		LEFT JOIN wecom_kefu_customers c ON m.external_userid = c.external_userid
		WHERE m.created_at >= $1 AND m.created_at < $2 AND m.external_userid != ''
		GROUP BY m.external_userid, c.nickname
		ORDER BY tokens DESC
		LIMIT 20
	`, start, end)
	if err != nil {
		log.Printf("kefuUserTokens query error: %v", err)
		return nil
	}
	defer rows.Close()

	var result []model.UserToken
	for rows.Next() {
		var ut model.UserToken
		if err := rows.Scan(&ut.UserID, &ut.UserName, &ut.Tokens); err != nil {
			log.Printf("kefuUserTokens scan error: %v", err)
			return nil
		}
		result = append(result, ut)
	}
	if err := rows.Err(); err != nil {
		log.Printf("kefuUserTokens rows error: %v", err)
		return nil
	}
	return result
}

func kefuConversationVolume(start, end time.Time, dateFmt string) []model.TimeBucket {
	query := fmt.Sprintf(`
		SELECT to_char(created_at AT TIME ZONE 'Asia/Shanghai', '%s') AS label,
		       COUNT(*)::int AS count
		FROM wecom_kefu_messages
		WHERE created_at >= $1 AND created_at < $2 AND external_userid != ''
		GROUP BY label
		ORDER BY label
	`, dateFmt)
	rows, err := repository.DB.Query(query, start, end)
	if err != nil {
		log.Printf("kefuConversationVolume query error: %v", err)
		return nil
	}
	defer rows.Close()

	var result []model.TimeBucket
	for rows.Next() {
		var tb model.TimeBucket
		if err := rows.Scan(&tb.Label, &tb.Count); err != nil {
			log.Printf("kefuConversationVolume scan error: %v", err)
			return nil
		}
		result = append(result, tb)
	}
	if err := rows.Err(); err != nil {
		log.Printf("kefuConversationVolume rows error: %v", err)
		return nil
	}
	return result
}

func kefuTimeDistribution(start, end time.Time) []model.HourBucket {
	rows, err := repository.DB.Query(`
		SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Shanghai')::int AS hour,
		       COUNT(*)::int AS count
		FROM wecom_kefu_messages
		WHERE created_at >= $1 AND created_at < $2 AND external_userid != ''
		GROUP BY hour
		ORDER BY hour
	`, start, end)
	if err != nil {
		log.Printf("kefuTimeDistribution query error: %v", err)
		return nil
	}
	defer rows.Close()

	var result []model.HourBucket
	for rows.Next() {
		var hb model.HourBucket
		if err := rows.Scan(&hb.Hour, &hb.Count); err != nil {
			log.Printf("kefuTimeDistribution scan error: %v", err)
			return nil
		}
		result = append(result, hb)
	}
	if err := rows.Err(); err != nil {
		log.Printf("kefuTimeDistribution rows error: %v", err)
		return nil
	}
	return result
}

// --- Message query helpers ---

func msgScopeClause(scopeType string) (string, int) {
	if scopeType != "" {
		return " AND receive_id_type = $3", 1
	}
	return "", 0
}

func msgQueryArgs(startMs, endMs int64, scopeType string) []interface{} {
	args := []interface{}{startMs, endMs}
	if scopeType != "" {
		args = append(args, scopeType)
	}
	return args
}

func msgUserConversations(startMs, endMs int64, scopeType string) []model.UserCount {
	scopeClause, _ := msgScopeClause(scopeType)
	query := fmt.Sprintf(`
		SELECT COALESCE(sender_id, ''), COUNT(*)::int AS count
		FROM wecom_messages
		WHERE create_time >= $1 AND create_time < $2%s
		GROUP BY sender_id
		ORDER BY count DESC
		LIMIT 20
	`, scopeClause)

	rows, err := repository.DB.Query(query, msgQueryArgs(startMs, endMs, scopeType)...)
	if err != nil {
		log.Printf("msgUserConversations query error: %v", err)
		return nil
	}
	defer rows.Close()

	var result []model.UserCount
	for rows.Next() {
		var uc model.UserCount
		if err := rows.Scan(&uc.UserID, &uc.Count); err != nil {
			log.Printf("msgUserConversations scan error: %v", err)
			return nil
		}
		result = append(result, uc)
	}
	if err := rows.Err(); err != nil {
		log.Printf("msgUserConversations rows error: %v", err)
		return nil
	}
	return result
}

func msgUserTokens(startMs, endMs int64, scopeType string) []model.UserToken {
	scopeClause, _ := msgScopeClause(scopeType)
	query := fmt.Sprintf(`
		SELECT COALESCE(sender_id, ''), COALESCE(SUM(LENGTH(content)), 0)::int / 2 AS tokens
		FROM wecom_messages
		WHERE create_time >= $1 AND create_time < $2%s
		GROUP BY sender_id
		ORDER BY tokens DESC
		LIMIT 20
	`, scopeClause)

	rows, err := repository.DB.Query(query, msgQueryArgs(startMs, endMs, scopeType)...)
	if err != nil {
		log.Printf("msgUserTokens query error: %v", err)
		return nil
	}
	defer rows.Close()

	var result []model.UserToken
	for rows.Next() {
		var ut model.UserToken
		if err := rows.Scan(&ut.UserID, &ut.Tokens); err != nil {
			log.Printf("msgUserTokens scan error: %v", err)
			return nil
		}
		result = append(result, ut)
	}
	if err := rows.Err(); err != nil {
		log.Printf("msgUserTokens rows error: %v", err)
		return nil
	}
	return result
}

func msgConversationVolume(startMs, endMs int64, scopeType, dateFmt string) []model.TimeBucket {
	scopeClause, _ := msgScopeClause(scopeType)
	query := fmt.Sprintf(`
		SELECT to_char(to_timestamp(create_time / 1000.0) AT TIME ZONE 'Asia/Shanghai', '%s') AS label,
		       COUNT(*)::int AS count
		FROM wecom_messages
		WHERE create_time >= $1 AND create_time < $2%s
		GROUP BY label
		ORDER BY label
	`, dateFmt, scopeClause)

	rows, err := repository.DB.Query(query, msgQueryArgs(startMs, endMs, scopeType)...)
	if err != nil {
		log.Printf("msgConversationVolume query error: %v", err)
		return nil
	}
	defer rows.Close()

	var result []model.TimeBucket
	for rows.Next() {
		var tb model.TimeBucket
		if err := rows.Scan(&tb.Label, &tb.Count); err != nil {
			log.Printf("msgConversationVolume scan error: %v", err)
			return nil
		}
		result = append(result, tb)
	}
	if err := rows.Err(); err != nil {
		log.Printf("msgConversationVolume rows error: %v", err)
		return nil
	}
	return result
}

func msgTimeDistribution(startMs, endMs int64, scopeType string) []model.HourBucket {
	scopeClause, _ := msgScopeClause(scopeType)
	query := fmt.Sprintf(`
		SELECT EXTRACT(HOUR FROM to_timestamp(create_time / 1000.0) AT TIME ZONE 'Asia/Shanghai')::int AS hour,
		       COUNT(*)::int AS count
		FROM wecom_messages
		WHERE create_time >= $1 AND create_time < $2%s
		GROUP BY hour
		ORDER BY hour
	`, scopeClause)

	rows, err := repository.DB.Query(query, msgQueryArgs(startMs, endMs, scopeType)...)
	if err != nil {
		log.Printf("msgTimeDistribution query error: %v", err)
		return nil
	}
	defer rows.Close()

	var result []model.HourBucket
	for rows.Next() {
		var hb model.HourBucket
		if err := rows.Scan(&hb.Hour, &hb.Count); err != nil {
			log.Printf("msgTimeDistribution scan error: %v", err)
			return nil
		}
		result = append(result, hb)
	}
	if err := rows.Err(); err != nil {
		log.Printf("msgTimeDistribution rows error: %v", err)
		return nil
	}
	return result
}
