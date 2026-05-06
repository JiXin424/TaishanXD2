package main

import (
	"database/sql"
	"fmt"
	"log"

	"golang.org/x/crypto/bcrypt"
	_ "github.com/lib/pq"
)

func main() {
	hash, err := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
	if err != nil {
		log.Fatal(err)
	}

	db, err := sql.Open("postgres", "host=localhost port=5433 user=taishan password=taishan_dev dbname=taishan sslmode=disable")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	_, err = db.Exec(`INSERT INTO users (company_id, dept_id, username, password_hash, real_name, is_active)
		VALUES (1, 1, 'admin', $1, '管理员', true) ON CONFLICT DO NOTHING`, string(hash))
	if err != nil {
		log.Fatal("insert user:", err)
	}

	_, err = db.Exec(`INSERT INTO user_roles (user_id, role_id) VALUES (1, 1) ON CONFLICT DO NOTHING`)
	if err != nil {
		log.Fatal("insert role:", err)
	}

	fmt.Println("Bootstrap complete: admin/admin123")
}
