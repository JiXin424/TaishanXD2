package config

import (
	"fmt"
	"os"
)

type Config struct {
	Port        string
	PGHost      string
	PGPort      string
	PGUser      string
	PGPassword  string
	PGDB        string
	RedisHost   string
	RedisPort   string
	RedisPass   string
	RedisDB     int
	SessionKey  string
	FrontendURL string
}

func Load() *Config {
	return &Config{
		Port:        getEnv("PORT", "4007"),
		PGHost:      getEnv("PG_HOST", "localhost"),
		PGPort:      getEnv("PG_PORT", "5433"),
		PGUser:      getEnv("PG_USER", "taishan"),
		PGPassword:  getEnv("PG_PASSWORD", "taishan_dev"),
		PGDB:        getEnv("PG_DB", "taishan"),
		RedisHost:   getEnv("REDIS_HOST", "localhost"),
		RedisPort:   getEnv("REDIS_PORT", "6379"),
		RedisPass:   getEnv("REDIS_PASSWORD", "taishan_dev"),
		RedisDB:     0,
		SessionKey:  getEnv("SESSION_SECRET", "dev-session-secret-change-me"),
		FrontendURL: getEnv("FRONTEND_URL", "http://localhost:3000"),
	}
}

func (c *Config) DSN() string {
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		c.PGHost, c.PGPort, c.PGUser, c.PGPassword, c.PGDB,
	)
}

func (c *Config) RedisAddr() string {
	return fmt.Sprintf("%s:%s", c.RedisHost, c.RedisPort)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
