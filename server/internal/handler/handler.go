package handler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"runtime"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"

	"github.com/taishanxd/v2/internal/middleware"
	"github.com/taishanxd/v2/internal/model"
	"github.com/taishanxd/v2/internal/repository"
)

var startTime = time.Now()

func RegisterRoutes(r *gin.Engine, sessionKey string) {
	r.GET("/api/health", healthCheck)
	r.GET("/api/system/info", systemInfo)
	r.POST("/api/auth/login", login(sessionKey))
	r.POST("/api/auth/logout", logout)

	auth := r.Group("/api")
	auth.Use(middleware.AuthRequired())
	{
		auth.GET("/auth/session", currentSession)
	}
}

// healthCheck godoc
// @Summary      健康检查
// @Description  检查 PostgreSQL、Redis 和 MongoDB 连接状态
// @Tags         系统
// @Produce      json
// @Success      200  {object}  model.HealthResponse
// @Failure      503  {object}  model.HealthResponse
// @Router       /api/health [get]
func healthCheck(c *gin.Context) {
	pgStatus := "ok"
	if err := repository.CheckPG(); err != nil {
		pgStatus = fmt.Sprintf("error: %v", err)
	}

	redisStatus := "ok"
	if err := repository.CheckRedis(); err != nil {
		redisStatus = fmt.Sprintf("error: %v", err)
	}

	mongoStatus := "ok"
	if err := repository.CheckMongo(); err != nil {
		mongoStatus = fmt.Sprintf("error: %v", err)
	}

	code := http.StatusOK
	if pgStatus != "ok" || redisStatus != "ok" || mongoStatus != "ok" {
		code = http.StatusServiceUnavailable
	}

	c.JSON(code, model.HealthResponse{
		Postgres: pgStatus,
		Redis:    redisStatus,
		Mongo:    mongoStatus,
	})
}

// systemInfo godoc
// @Summary      系统信息
// @Description  获取服务版本、Go 版本、启动时间等信息
// @Tags         系统
// @Produce      json
// @Success      200  {object}  model.SystemInfo
// @Router       /api/system/info [get]
func systemInfo(c *gin.Context) {
	c.JSON(http.StatusOK, model.SystemInfo{
		Version:     "2.0.0-demo",
		GoVersion:   runtime.Version(),
		StartedAt:   startTime.Format(time.RFC3339),
		Environment: "development",
	})
}

// login godoc
// @Summary      用户登录
// @Description  通过用户名密码登录，成功后设置 HttpOnly Cookie 并将 Session 写入 Redis
// @Tags         认证
// @Accept       json
// @Produce      json
// @Param        body  body      model.LoginRequest  true  "登录凭据"
// @Success      200   {object}  map[string]interface{}  "ok=true, user=AuthUser"
// @Failure      400   {object}  map[string]string       "error"
// @Failure      401   {object}  map[string]string       "error"
// @Router       /api/auth/login [post]
func login(sessionKey string) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req model.LoginRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
			return
		}

		var user model.User
		var hash string
		query := `
			SELECT u.id, u.username, COALESCE(u.real_name, u.username),
			       u.company_id, c.name,
			       COALESCE(r.data_scope, 4)
			FROM users u
			JOIN companies c ON c.id = u.company_id
			LEFT JOIN user_roles ur ON ur.user_id = u.id
			LEFT JOIN roles r ON r.id = ur.role_id
			WHERE u.username = $1 AND u.is_active = true
			LIMIT 1
		`
		err := repository.DB.QueryRow(query, req.Username).Scan(
			&user.ID, &user.Username, &user.RealName,
			&user.CompanyID, &user.CompanyName, &user.DataScope,
		)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
			return
		}

		err = repository.DB.QueryRow(
			"SELECT password_hash FROM users WHERE id = $1", user.ID,
		).Scan(&hash)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
			return
		}

		user.DisplayName = user.RealName

		token := generateToken()
		sessionData, _ := json.Marshal(user)
		ctx := context.Background()
		repository.SetSession(ctx, token, sessionData, 12*time.Hour)

		c.SetCookie("taishan_session", token, 12*3600, "/", "", false, true)
		c.JSON(http.StatusOK, gin.H{"ok": true, "user": user})
	}
}

// logout godoc
// @Summary      退出登录
// @Description  清除 Session Cookie 和 Redis 中的 Session 记录
// @Tags         认证
// @Produce      json
// @Success      200  {object}  map[string]bool  "ok=true"
// @Router       /api/auth/logout [post]
func logout(c *gin.Context) {
	if token, err := c.Cookie("taishan_session"); err == nil {
		repository.DeleteSession(context.Background(), token)
	}
	c.SetCookie("taishan_session", "", -1, "/", "", false, true)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// currentSession godoc
// @Summary      获取当前会话
// @Description  通过 Cookie 或 Bearer Token 获取当前登录用户信息（需认证）
// @Tags         认证
// @Produce      json
// @Param        Cookie  header  string  false  "taishan_session=xxx"
// @Param        Authorization  header  string  false  "Bearer xxx"
// @Success      200   {object}  model.User
// @Failure      401   {object}  map[string]string  "error"
// @Security     BearerAuth
// @Router       /api/auth/session [get]
func currentSession(c *gin.Context) {
	data, exists := c.Get("session_data")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var user model.User
	if err := json.Unmarshal([]byte(data.(string)), &user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "session parse error"})
		return
	}

	c.JSON(http.StatusOK, user)
}

func generateToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func RegisterMongoRoutes(r *gin.Engine) {
	org := r.Group("/api/org")
	RegisterMongoCompanyRoutes(org)
	RegisterMongoOrgRoutes(org)
	RegisterMongoUserRoutes(org)
	RegisterMongoPositionRoutes(org)
}
