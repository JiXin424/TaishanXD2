package repository

import (
	"database/sql"
	"fmt"
	"time"

	_ "github.com/lib/pq"

	"github.com/taishanxd/v2/internal/config"
)

var DB *sql.DB

func InitDB(cfg *config.Config) error {
	var err error
	DB, err = sql.Open("postgres", cfg.DSN())
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	DB.SetMaxOpenConns(25)
	DB.SetMaxIdleConns(5)
	DB.SetConnMaxLifetime(5 * time.Minute)
	return DB.Ping()
}

func CheckPG() error {
	return DB.Ping()
}
