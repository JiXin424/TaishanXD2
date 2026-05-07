package main

import (
	"fmt"
	"log"

	"github.com/gin-gonic/gin"
	swagFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"

	_ "github.com/taishanxd/v2/docs"
	"github.com/taishanxd/v2/internal/config"
	"github.com/taishanxd/v2/internal/handler"
	"github.com/taishanxd/v2/internal/repository"
)

// @title           TaishanXD V2 API
// @version         2.0.0
// @description     销售赋能中心后端 API 文档
// @host            localhost:4007
// @BasePath        /
// @securityDefinitions.apikey BearerAuth
// @in              header
// @name            Authorization
func main() {
	cfg := config.Load()

	if err := repository.InitDB(cfg); err != nil {
		log.Fatalf("Failed to connect PostgreSQL: %v", err)
	}
	defer repository.DB.Close()
	fmt.Println("PostgreSQL connected")

	if err := repository.InitRedis(cfg); err != nil {
		log.Fatalf("Failed to connect Redis: %v", err)
	}
	fmt.Println("Redis connected")

	if err := repository.InitMongo(cfg); err != nil {
		log.Fatalf("Failed to connect MongoDB: %v", err)
	}
	defer repository.CloseMongo()
	fmt.Println("MongoDB connected")

	if err := repository.CreateIndexes(); err != nil {
		log.Printf("Warning: MongoDB index creation failed: %v", err)
	} else {
		fmt.Println("MongoDB indexes created")
	}

	gin.SetMode(gin.DebugMode)
	r := gin.Default()

	handler.RegisterRoutes(r, cfg.SessionKey)
	handler.RegisterWecomRoutes(r)
	handler.RegisterMongoRoutes(r)

	r.GET("/swagger/*any", ginSwagger.WrapHandler(swagFiles.Handler))

	addr := fmt.Sprintf(":%s", cfg.Port)
	fmt.Printf("TaishanXD V2 server starting on %s\n", addr)
	fmt.Printf("Swagger UI: http://localhost:%s/swagger/index.html\n", cfg.Port)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
