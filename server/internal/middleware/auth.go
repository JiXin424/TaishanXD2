package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/taishanxd/v2/internal/repository"
)

func AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := ""

		// Cookie first
		if cookie, err := c.Cookie("taishan_session"); err == nil {
			token = cookie
		}

		// Authorization header fallback
		if token == "" {
			auth := c.GetHeader("Authorization")
			if strings.HasPrefix(auth, "Bearer ") {
				token = strings.TrimPrefix(auth, "Bearer ")
			}
		}

		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		ctx := context.Background()
		data, err := repository.GetSession(ctx, token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid session"})
			return
		}

		c.Set("session_token", token)
		c.Set("session_data", data)
		c.Next()
	}
}
