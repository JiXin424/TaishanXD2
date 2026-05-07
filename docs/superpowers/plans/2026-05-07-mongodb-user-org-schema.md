# MongoDB 用户与组织架构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate MongoDB into the Go backend with 4 collections (companies, organizations, users, positions) supporting dynamic org hierarchies, multi-position users, and scope-based access control.

**Architecture:** MongoDB stores platform-owned data (users, orgs, positions, companies). PostgreSQL continues storing third-party channel data (wecom/dingtalk/feishu). The Go server connects to both via repository pattern. API routes under `/api/org/` prefix. Materialized path pattern for tree queries with `orgNodePath` denormalized into positions for single-collection scope lookups.

**Tech Stack:** Go 1.26 + Gin + go.mongodb.org/mongo-driver/v2 (already in go.mod) + MongoDB 7 (already in docker-compose)

---

## File Structure

**New files:**
- `server/internal/repository/mongo.go` — MongoDB client init, collection helpers, health check
- `server/internal/model/mongo.go` — 4 document models + request/response DTOs
- `server/internal/handler/mongo_companies.go` — Companies CRUD routes
- `server/internal/handler/mongo_organizations.go` — Organizations CRUD + tree route
- `server/internal/handler/mongo_users.go` — Users CRUD + managed users + access check routes
- `server/internal/handler/mongo_positions.go` — Positions CRUD routes

**Modified files:**
- `server/internal/config/config.go` — Add MongoDB config fields
- `server/internal/handler/handler.go` — Register `/api/org` routes, update health check
- `server/cmd/server/main.go` — Init MongoDB, defer close
- `server/go.mod` — Promote mongo-driver from indirect to direct
- `.env.example` — Add MongoDB env vars
- `docker-compose.yml` — Add MongoDB env to server service
- `CLAUDE.md` — Update docs

---

### Task 1: Infrastructure — env vars, config, go.mod

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `server/internal/config/config.go`
- Modify: `server/go.mod`

- [ ] **Step 1: Add MongoDB env vars to .env.example**

Append after the Redis section:

```env
# ── MongoDB ────────────────────────────────────────────────────
MONGO_HOST=localhost
MONGO_PORT=27017
MONGO_USER=taishan
MONGO_PASSWORD=taishan_dev
MONGO_DB=taishan
# 完整连接串
MONGO_URI=mongodb://${MONGO_USER}:${MONGO_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}?authSource=admin
```

- [ ] **Step 2: Add MongoDB env to docker-compose server service**

In `docker-compose.yml`, add to the `server` service `environment` block (after `REDIS_PASSWORD`):

```yaml
      MONGO_HOST: mongo
      MONGO_PORT: "27017"
      MONGO_USER: ${MONGO_USER:-taishan}
      MONGO_PASSWORD: ${MONGO_PASSWORD:-taishan_dev}
      MONGO_DB: ${MONGO_DB:-taishan}
```

Also add `mongo` to `server.depends_on`:

```yaml
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      mongo:
        condition: service_healthy
```

- [ ] **Step 3: Add MongoDB fields to config.go**

Add to `Config` struct in `server/internal/config/config.go`:

```go
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
	MongoHost   string
	MongoPort   string
	MongoUser   string
	MongoPass   string
	MongoDB     string
	SessionKey  string
	FrontendURL string
}
```

Add to `Load()` function:

```go
		MongoHost:   getEnv("MONGO_HOST", "localhost"),
		MongoPort:   getEnv("MONGO_PORT", "27017"),
		MongoUser:   getEnv("MONGO_USER", "taishan"),
		MongoPass:   getEnv("MONGO_PASSWORD", "taishan_dev"),
		MongoDB:     getEnv("MONGO_DB", "taishan"),
```

Add method:

```go
func (c *Config) MongoURI() string {
	return fmt.Sprintf("mongodb://%s:%s@%s:%s/%s?authSource=admin",
		c.MongoUser, c.MongoPass, c.MongoHost, c.MongoPort, c.MongoDB)
}
```

- [ ] **Step 4: Promote mongo-driver to direct dependency**

Run: `cd server && go get go.mongodb.org/mongo-driver/v2`

This moves it from `// indirect` to the `require` block.

- [ ] **Step 5: Commit**

```bash
git add .env.example docker-compose.yml server/internal/config/config.go server/go.mod server/go.sum
git commit -m "feat: add MongoDB config and infrastructure"
```

---

### Task 2: MongoDB connection + document models

**Files:**
- Create: `server/internal/repository/mongo.go`
- Create: `server/internal/model/mongo.go`

- [ ] **Step 1: Create repository/mongo.go — MongoDB client init**

```go
package repository

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/taishanxd/v2/internal/config"
)

var (
	MongoClient *mongo.Client
	MongoDB     *mongo.Database
)

func InitMongo(cfg *config.Config) error {
	clientOpts := options.Client().ApplyURI(cfg.MongoURI())
	clientOpts.SetMaxPoolSize(25)
	clientOpts.SetMinPoolSize(5)

	var err error
	MongoClient, err = mongo.Connect(clientOpts)
	if err != nil {
		return fmt.Errorf("mongo connect: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := MongoClient.Ping(ctx, nil); err != nil {
		return fmt.Errorf("mongo ping: %w", err)
	}

	MongoDB = MongoClient.Database(cfg.MongoDB)
	return nil
}

func CheckMongo() error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return MongoClient.Ping(ctx, nil)
}

func CloseMongo() {
	if MongoClient != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		MongoClient.Disconnect(ctx)
	}
}

// Collection helpers
func CompaniesColl() *mongo.Collection {
	return MongoDB.Collection("companies")
}

func OrgsColl() *mongo.Collection {
	return MongoDB.Collection("organizations")
}

func UsersColl() *mongo.Collection {
	return MongoDB.Collection("users")
}

func PositionsColl() *mongo.Collection {
	return MongoDB.Collection("positions")
}
```

- [ ] **Step 2: Create model/mongo.go — all document models + DTOs**

```go
package model

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson/primitive"
)

// ── Companies ──────────────────────────────────────────────────

type CompanyDoc struct {
	ID        primitive.ObjectID `bson:"_id"      json:"id"`
	Name      string             `bson:"name"     json:"name"`
	Code      string             `bson:"code"     json:"code"`
	Status    string             `bson:"status"   json:"status"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time          `bson:"updatedAt" json:"updatedAt"`
}

type CreateCompanyReq struct {
	Name string `json:"name" binding:"required"`
	Code string `json:"code"  binding:"required"`
}

type UpdateCompanyReq struct {
	Name   *string `json:"name"`
	Code   *string `json:"code"`
	Status *string `json:"status"`
}

// ── Organizations ──────────────────────────────────────────────

type OrgDoc struct {
	ID        primitive.ObjectID  `bson:"_id"       json:"id"`
	CompanyID primitive.ObjectID  `bson:"companyId"  json:"companyId"`
	Name      string              `bson:"name"       json:"name"`
	ParentID  *primitive.ObjectID `bson:"parentId"   json:"parentId"`
	Path      string              `bson:"path"       json:"path"`
	Level     int                 `bson:"level"      json:"level"`
	Order     int                 `bson:"order"      json:"order"`
	Status    string              `bson:"status"     json:"status"`
	CreatedAt time.Time           `bson:"createdAt"  json:"createdAt"`
	UpdatedAt time.Time           `bson:"updatedAt"  json:"updatedAt"`
}

type CreateOrgReq struct {
	CompanyID string `json:"companyId" binding:"required"`
	ParentID  string `json:"parentId"`
	Name      string `json:"name"      binding:"required"`
	Order     int    `json:"order"`
}

type UpdateOrgReq struct {
	Name   *string `json:"name"`
	Order  *int    `json:"order"`
	Status *string `json:"status"`
}

type OrgTreeNode struct {
	OrgDoc
	Children []*OrgTreeNode `json:"children"`
}

// ── Users ──────────────────────────────────────────────────────

type ChannelBinding struct {
	Platform         string    `bson:"platform"         json:"platform"`
	PlatformUserID   string    `bson:"platformUserId"   json:"platformUserId"`
	PlatformUserName string    `bson:"platformUserName" json:"platformUserName"`
	SyncedAt         time.Time `bson:"syncedAt"         json:"syncedAt"`
}

type UserDoc struct {
	ID              primitive.ObjectID `bson:"_id"              json:"id"`
	CompanyID       primitive.ObjectID `bson:"companyId"        json:"companyId"`
	Name            string             `bson:"name"             json:"name"`
	Phone           string             `bson:"phone"            json:"phone"`
	Email           string             `bson:"email"            json:"email"`
	Avatar          string             `bson:"avatar"           json:"avatar"`
	Status          string             `bson:"status"           json:"status"`
	ChannelBindings []ChannelBinding   `bson:"channelBindings"  json:"channelBindings"`
	CreatedAt       time.Time          `bson:"createdAt"        json:"createdAt"`
	UpdatedAt       time.Time          `bson:"updatedAt"        json:"updatedAt"`
}

type CreateUserReq struct {
	CompanyID       string             `json:"companyId"       binding:"required"`
	Name            string             `json:"name"            binding:"required"`
	Phone           string             `json:"phone"`
	Email           string             `json:"email"`
	Avatar          string             `json:"avatar"`
	ChannelBindings []ChannelBinding   `json:"channelBindings"`
}

type UpdateUserReq struct {
	Name            *string           `json:"name"`
	Phone           *string           `json:"phone"`
	Email           *string           `json:"email"`
	Avatar          *string           `json:"avatar"`
	Status          *string           `json:"status"`
	ChannelBindings []ChannelBinding  `json:"channelBindings"`
}

// ── Positions ──────────────────────────────────────────────────

type PositionDoc struct {
	ID          primitive.ObjectID `bson:"_id"          json:"id"`
	UserID      primitive.ObjectID `bson:"userId"       json:"userId"`
	CompanyID   primitive.ObjectID `bson:"companyId"    json:"companyId"`
	OrgNodeID   primitive.ObjectID `bson:"orgNodeId"    json:"orgNodeId"`
	OrgNodePath string             `bson:"orgNodePath"  json:"orgNodePath"`
	Title       string             `bson:"title"        json:"title"`
	IsLeader    bool               `bson:"isLeader"     json:"isLeader"`
	Status      string             `bson:"status"       json:"status"`
	CreatedAt   time.Time          `bson:"createdAt"    json:"createdAt"`
	UpdatedAt   time.Time          `bson:"updatedAt"    json:"updatedAt"`
}

type CreatePositionReq struct {
	UserID    string `json:"userId"    binding:"required"`
	OrgNodeID string `json:"orgNodeId" binding:"required"`
	Title     string `json:"title"     binding:"required"`
	IsLeader  bool   `json:"isLeader"`
}

type UpdatePositionReq struct {
	Title    *string `json:"title"`
	IsLeader *bool   `json:"isLeader"`
	Status   *string `json:"status"`
}
```

- [ ] **Step 3: Commit**

```bash
git add server/internal/repository/mongo.go server/internal/model/mongo.go
git commit -m "feat: add MongoDB client init and document models"
```

---

### Task 3: Companies CRUD

**Files:**
- Create: `server/internal/handler/mongo_companies.go`

- [ ] **Step 1: Create handler file with all CRUD operations**

```go
package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/bson/primitive"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/taishanxd/v2/internal/model"
	"github.com/taishanxd/v2/internal/repository"
)

func listMongoCompanies(c *gin.Context) {
	ctx := c.Request.Context()
	cursor, err := repository.CompaniesColl().Find(ctx, bson.M{"status": "active"})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var results []model.CompanyDoc
	if err := cursor.All(ctx, &results); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if results == nil {
		results = []model.CompanyDoc{}
	}
	c.JSON(http.StatusOK, results)
}

func getMongoCompany(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var doc model.CompanyDoc
	if err := repository.CompaniesColl().FindOne(c.Request.Context(), bson.M{"_id": id}).Decode(&doc); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, doc)
}

func createMongoCompany(c *gin.Context) {
	var req model.CreateCompanyReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	now := time.Now()
	doc := model.CompanyDoc{
		ID:        primitive.NewObjectID(),
		Name:      req.Name,
		Code:      req.Code,
		Status:    "active",
		CreatedAt: now,
		UpdatedAt: now,
	}

	if _, err := repository.CompaniesColl().InsertOne(c.Request.Context(), doc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, doc)
}

func updateMongoCompany(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req model.UpdateCompanyReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	update := bson.M{"updatedAt": time.Now()}
	if req.Name != nil {
		update["name"] = *req.Name
	}
	if req.Code != nil {
		update["code"] = *req.Code
	}
	if req.Status != nil {
		update["status"] = *req.Status
	}

	result, err := repository.CompaniesColl().UpdateOne(
		c.Request.Context(),
		bson.M{"_id": id},
		bson.M{"$set": update},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if result.MatchedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func deleteMongoCompany(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	result, err := repository.CompaniesColl().DeleteOne(c.Request.Context(), bson.M{"_id": id})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if result.DeletedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func RegisterMongoCompanyRoutes(r *gin.RouterGroup) {
	r.GET("/companies", listMongoCompanies)
	r.GET("/companies/:id", getMongoCompany)
	r.POST("/companies", createMongoCompany)
	r.PUT("/companies/:id", updateMongoCompany)
	r.DELETE("/companies/:id", deleteMongoCompany)
}
```

- [ ] **Step 2: Commit**

```bash
git add server/internal/handler/mongo_companies.go
git commit -m "feat: add MongoDB companies CRUD endpoints"
```

---

### Task 4: Organizations CRUD + tree

**Files:**
- Create: `server/internal/handler/mongo_organizations.go`

This is the most complex collection because of the path-based tree structure.

- [ ] **Step 1: Create handler file with CRUD + tree endpoint**

```go
package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/bson/primitive"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/taishanxd/v2/internal/model"
	"github.com/taishanxd/v2/internal/repository"
)

func listMongoOrgs(c *gin.Context) {
	companyID, err := primitive.ObjectIDFromHex(c.Query("company_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "company_id required"})
		return
	}

	filter := bson.M{"companyId": companyID, "status": "active"}
	ctx := c.Request.Context()
	cursor, err := repository.OrgsColl().Find(ctx, filter,
		options.Find().SetSort(bson.D{{"level", 1}, {"order", 1}}),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var results []model.OrgDoc
	if err := cursor.All(ctx, &results); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if results == nil {
		results = []model.OrgDoc{}
	}
	c.JSON(http.StatusOK, results)
}

func getMongoOrg(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var doc model.OrgDoc
	if err := repository.OrgsColl().FindOne(c.Request.Context(), bson.M{"_id": id}).Decode(&doc); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, doc)
}

func createMongoOrg(c *gin.Context) {
	var req model.CreateOrgReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	companyID, err := primitive.ObjectIDFromHex(req.CompanyID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid companyId"})
		return
	}

	now := time.Now()
	id := primitive.NewObjectID()

	var path string
	var level int
	var parentID *primitive.ObjectID

	if req.ParentID != "" {
		pid, err := primitive.ObjectIDFromHex(req.ParentID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid parentId"})
			return
		}

		var parent model.OrgDoc
		if err := repository.OrgsColl().FindOne(c.Request.Context(), bson.M{"_id": pid}).Decode(&parent); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "parent not found"})
			return
		}
		parentID = &pid
		path = parent.Path + "." + id.Hex()
		level = parent.Level + 1
	} else {
		path = id.Hex()
		level = 0
	}

	doc := model.OrgDoc{
		ID:        id,
		CompanyID: companyID,
		Name:      req.Name,
		ParentID:  parentID,
		Path:      path,
		Level:     level,
		Order:     req.Order,
		Status:    "active",
		CreatedAt: now,
		UpdatedAt: now,
	}

	if _, err := repository.OrgsColl().InsertOne(c.Request.Context(), doc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, doc)
}

func updateMongoOrg(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req model.UpdateOrgReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	update := bson.M{"updatedAt": time.Now()}
	if req.Name != nil {
		update["name"] = *req.Name
	}
	if req.Order != nil {
		update["order"] = *req.Order
	}
	if req.Status != nil {
		update["status"] = *req.Status
	}

	result, err := repository.OrgsColl().UpdateOne(
		c.Request.Context(),
		bson.M{"_id": id},
		bson.M{"$set": update},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if result.MatchedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func deleteMongoOrg(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	// Prevent delete if node has children
	var doc model.OrgDoc
	if err := repository.OrgsColl().FindOne(c.Request.Context(), bson.M{"_id": id}).Decode(&doc); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	childCount, _ := repository.OrgsColl().CountDocuments(c.Request.Context(), bson.M{"parentId": id})
	if childCount > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "has children, remove them first"})
		return
	}

	repository.OrgsColl().DeleteOne(c.Request.Context(), bson.M{"_id": id})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// getMongoOrgTree builds the full org tree for a company
func getMongoOrgTree(c *gin.Context) {
	companyID, err := primitive.ObjectIDFromHex(c.Param("companyId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid companyId"})
		return
	}

	cursor, err := repository.OrgsColl().Find(c.Request.Context(),
		bson.M{"companyId": companyID, "status": "active"},
		options.Find().SetSort(bson.D{{"level", 1}, {"order", 1}}),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer cursor.Close(c.Request.Context())

	var nodes []model.OrgDoc
	if err := cursor.All(c.Request.Context(), &nodes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	nodeMap := make(map[string]*model.OrgTreeNode, len(nodes))
	for i := range nodes {
		nodeMap[nodes[i].ID.Hex()] = &model.OrgTreeNode{OrgDoc: nodes[i]}
	}

	var roots []*model.OrgTreeNode
	for _, node := range nodes {
		treeNode := nodeMap[node.ID.Hex()]
		if node.ParentID != nil {
			if parent, ok := nodeMap[node.ParentID.Hex()]; ok {
				parent.Children = append(parent.Children, treeNode)
			}
		} else {
			roots = append(roots, treeNode)
		}
	}

	if roots == nil {
		roots = []*model.OrgTreeNode{}
	}
	c.JSON(http.StatusOK, roots)
}

func RegisterMongoOrgRoutes(r *gin.RouterGroup) {
	r.GET("/organizations", listMongoOrgs)
	r.GET("/organizations/tree/:companyId", getMongoOrgTree)
	r.GET("/organizations/:id", getMongoOrg)
	r.POST("/organizations", createMongoOrg)
	r.PUT("/organizations/:id", updateMongoOrg)
	r.DELETE("/organizations/:id", deleteMongoOrg)
}
```

- [ ] **Step 2: Commit**

```bash
git add server/internal/handler/mongo_organizations.go
git commit -m "feat: add MongoDB organizations CRUD + tree endpoint"
```

---

### Task 5: Users CRUD + channelBindings

**Files:**
- Create: `server/internal/handler/mongo_users.go`

- [ ] **Step 1: Create handler file with CRUD + managed users + access check**

```go
package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/bson/primitive"

	"github.com/taishanxd/v2/internal/model"
	"github.com/taishanxd/v2/internal/repository"
)

func listMongoUsers(c *gin.Context) {
	filter := bson.M{"status": "active"}
	if cid := c.Query("company_id"); cid != "" {
		companyID, err := primitive.ObjectIDFromHex(cid)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid company_id"})
			return
		}
		filter["companyId"] = companyID
	}

	cursor, err := repository.UsersColl().Find(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer cursor.Close(c.Request.Context())

	var results []model.UserDoc
	if err := cursor.All(c.Request.Context(), &results); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if results == nil {
		results = []model.UserDoc{}
	}
	c.JSON(http.StatusOK, results)
}

func getMongoUser(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var doc model.UserDoc
	if err := repository.UsersColl().FindOne(c.Request.Context(), bson.M{"_id": id}).Decode(&doc); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, doc)
}

func createMongoUser(c *gin.Context) {
	var req model.CreateUserReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	companyID, err := primitive.ObjectIDFromHex(req.CompanyID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid companyId"})
		return
	}

	now := time.Now()
	bindings := req.ChannelBindings
	if bindings == nil {
		bindings = []model.ChannelBinding{}
	}
	for i := range bindings {
		if bindings[i].SyncedAt.IsZero() {
			bindings[i].SyncedAt = now
		}
	}

	doc := model.UserDoc{
		ID:              primitive.NewObjectID(),
		CompanyID:       companyID,
		Name:            req.Name,
		Phone:           req.Phone,
		Email:           req.Email,
		Avatar:          req.Avatar,
		Status:          "active",
		ChannelBindings: bindings,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	if _, err := repository.UsersColl().InsertOne(c.Request.Context(), doc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, doc)
}

func updateMongoUser(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req model.UpdateUserReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	update := bson.M{"updatedAt": time.Now()}
	if req.Name != nil {
		update["name"] = *req.Name
	}
	if req.Phone != nil {
		update["phone"] = *req.Phone
	}
	if req.Email != nil {
		update["email"] = *req.Email
	}
	if req.Avatar != nil {
		update["avatar"] = *req.Avatar
	}
	if req.Status != nil {
		update["status"] = *req.Status
	}
	if req.ChannelBindings != nil {
		update["channelBindings"] = req.ChannelBindings
	}

	result, err := repository.UsersColl().UpdateOne(
		c.Request.Context(),
		bson.M{"_id": id},
		bson.M{"$set": update},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if result.MatchedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func deleteMongoUser(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	repository.UsersColl().DeleteOne(c.Request.Context(), bson.M{"_id": id})
	repository.PositionsColl().DeleteMany(c.Request.Context(), bson.M{"userId": id})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// getManagedUsers returns all users under the given manager's scope
func getManagedUsers(c *gin.Context) {
	managerID, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	ctx := c.Request.Context()

	// Find all leader positions for this user
	cursor, err := repository.PositionsColl().Find(ctx, bson.M{
		"userId":   managerID,
		"isLeader": true,
		"status":   "active",
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var leaderPositions []model.PositionDoc
	if err := cursor.All(ctx, &leaderPositions); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if len(leaderPositions) == 0 {
		c.JSON(http.StatusOK, []model.UserDoc{})
		return
	}

	// Build regex conditions for path prefix matching
	orConditions := make([]bson.M, len(leaderPositions))
	for i, p := range leaderPositions {
		orConditions[i] = bson.M{"orgNodePath": primitive.Regex{Pattern: "^" + p.OrgNodePath}}
	}

	// Find all user IDs within scope
	managedUserIDs, err := repository.PositionsColl().Distinct(ctx, "userId", bson.M{
		"$or":  orConditions,
		"status": "active",
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	objectIDs := make([]primitive.ObjectID, len(managedUserIDs))
	for i, id := range managedUserIDs {
		objectIDs[i] = id.(primitive.ObjectID)
	}

	if len(objectIDs) == 0 {
		c.JSON(http.StatusOK, []model.UserDoc{})
		return
	}

	userCursor, err := repository.UsersColl().Find(ctx, bson.M{
		"_id":    bson.M{"$in": objectIDs},
		"status": "active",
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer userCursor.Close(ctx)

	var users []model.UserDoc
	if err := userCursor.All(ctx, &users); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if users == nil {
		users = []model.UserDoc{}
	}
	c.JSON(http.StatusOK, users)
}

// canAccess checks if a manager can access a target user
func canAccess(c *gin.Context) {
	managerID, err := primitive.ObjectIDFromHex(c.Query("manager_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid manager_id"})
		return
	}
	targetID, err := primitive.ObjectIDFromHex(c.Query("target_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid target_id"})
		return
	}
	ctx := c.Request.Context()

	leaderCursor, err := repository.PositionsColl().Find(ctx, bson.M{
		"userId": managerID, "isLeader": true, "status": "active",
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer leaderCursor.Close(ctx)

	var leaderPositions []model.PositionDoc
	leaderCursor.All(ctx, &leaderPositions)
	if len(leaderPositions) == 0 {
		c.JSON(http.StatusOK, gin.H{"canAccess": false})
		return
	}

	targetCursor, err := repository.PositionsColl().Find(ctx, bson.M{
		"userId": targetID, "status": "active",
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer targetCursor.Close(ctx)

	var targetPositions []model.PositionDoc
	targetCursor.All(ctx, &targetPositions)

	allowed := false
	for _, lp := range leaderPositions {
		for _, tp := range targetPositions {
			if len(tp.OrgNodePath) >= len(lp.OrgNodePath) &&
				tp.OrgNodePath[:len(lp.OrgNodePath)] == lp.OrgNodePath {
				allowed = true
				break
			}
		}
		if allowed {
			break
		}
	}

	c.JSON(http.StatusOK, gin.H{"canAccess": allowed})
}

func RegisterMongoUserRoutes(r *gin.RouterGroup) {
	r.GET("/users", listMongoUsers)
	r.GET("/users/managed/:id", getManagedUsers)
	r.GET("/users/can-access", canAccess)
	r.GET("/users/:id", getMongoUser)
	r.POST("/users", createMongoUser)
	r.PUT("/users/:id", updateMongoUser)
	r.DELETE("/users/:id", deleteMongoUser)
}
```

- [ ] **Step 2: Commit**

```bash
git add server/internal/handler/mongo_users.go
git commit -m "feat: add MongoDB users CRUD + managed users + access check"
```

---

### Task 6: Positions CRUD

**Files:**
- Create: `server/internal/handler/mongo_positions.go`

- [ ] **Step 1: Create handler file with CRUD**

```go
package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/bson/primitive"

	"github.com/taishanxd/v2/internal/model"
	"github.com/taishanxd/v2/internal/repository"
)

func listMongoPositions(c *gin.Context) {
	filter := bson.M{"status": "active"}
	if uid := c.Query("user_id"); uid != "" {
		userID, err := primitive.ObjectIDFromHex(uid)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user_id"})
			return
		}
		filter["userId"] = userID
	}
	if cid := c.Query("company_id"); cid != "" {
		companyID, err := primitive.ObjectIDFromHex(cid)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid company_id"})
			return
		}
		filter["companyId"] = companyID
	}
	if oid := c.Query("org_node_id"); oid != "" {
		orgNodeID, err := primitive.ObjectIDFromHex(oid)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid org_node_id"})
			return
		}
		filter["orgNodeId"] = orgNodeID
	}

	cursor, err := repository.PositionsColl().Find(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer cursor.Close(c.Request.Context())

	var results []model.PositionDoc
	if err := cursor.All(c.Request.Context(), &results); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if results == nil {
		results = []model.PositionDoc{}
	}
	c.JSON(http.StatusOK, results)
}

func getMongoPosition(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var doc model.PositionDoc
	if err := repository.PositionsColl().FindOne(c.Request.Context(), bson.M{"_id": id}).Decode(&doc); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, doc)
}

func createMongoPosition(c *gin.Context) {
	var req model.CreatePositionReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, err := primitive.ObjectIDFromHex(req.UserID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid userId"})
		return
	}
	orgNodeID, err := primitive.ObjectIDFromHex(req.OrgNodeID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid orgNodeId"})
		return
	}

	// Fetch org node to get path and companyID
	var orgDoc model.OrgDoc
	if err := repository.OrgsColl().FindOne(c.Request.Context(), bson.M{"_id": orgNodeID}).Decode(&orgDoc); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "org node not found"})
		return
	}

	// Fetch user to get companyID
	var userDoc model.UserDoc
	if err := repository.UsersColl().FindOne(c.Request.Context(), bson.M{"_id": userID}).Decode(&userDoc); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user not found"})
		return
	}

	now := time.Now()
	doc := model.PositionDoc{
		ID:          primitive.NewObjectID(),
		UserID:      userID,
		CompanyID:   userDoc.CompanyID,
		OrgNodeID:   orgNodeID,
		OrgNodePath: orgDoc.Path,
		Title:       req.Title,
		IsLeader:    req.IsLeader,
		Status:      "active",
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	if _, err := repository.PositionsColl().InsertOne(c.Request.Context(), doc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, doc)
}

func updateMongoPosition(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req model.UpdatePositionReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	update := bson.M{"updatedAt": time.Now()}
	if req.Title != nil {
		update["title"] = *req.Title
	}
	if req.IsLeader != nil {
		update["isLeader"] = *req.IsLeader
	}
	if req.Status != nil {
		update["status"] = *req.Status
	}

	result, err := repository.PositionsColl().UpdateOne(
		c.Request.Context(),
		bson.M{"_id": id},
		bson.M{"$set": update},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if result.MatchedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func deleteMongoPosition(c *gin.Context) {
	id, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	repository.PositionsColl().DeleteOne(c.Request.Context(), bson.M{"_id": id})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func RegisterMongoPositionRoutes(r *gin.RouterGroup) {
	r.GET("/positions", listMongoPositions)
	r.GET("/positions/:id", getMongoPosition)
	r.POST("/positions", createMongoPosition)
	r.PUT("/positions/:id", updateMongoPosition)
	r.DELETE("/positions/:id", deleteMongoPosition)
}
```

- [ ] **Step 2: Commit**

```bash
git add server/internal/handler/mongo_positions.go
git commit -m "feat: add MongoDB positions CRUD"
```

---

### Task 7: Wire routes + update health check + main.go

**Files:**
- Modify: `server/internal/handler/handler.go`
- Modify: `server/cmd/server/main.go`

- [ ] **Step 1: Update handler.go — register /api/org routes + health check**

In `handler.go`, update `healthCheck` to include MongoDB:

```go
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
```

Update `model.HealthResponse` in `model/models.go` to add the `Mongo` field:

```go
type HealthResponse struct {
	Postgres string `json:"postgres"`
	Redis    string `json:"redis"`
	Mongo    string `json:"mongo"`
}
```

Add a new registration function in `handler.go`:

```go
func RegisterMongoRoutes(r *gin.Engine) {
	org := r.Group("/api/org")
	RegisterMongoCompanyRoutes(org)
	RegisterMongoOrgRoutes(org)
	RegisterMongoUserRoutes(org)
	RegisterMongoPositionRoutes(org)
}
```

- [ ] **Step 2: Update main.go — init MongoDB, defer close**

Update `server/cmd/server/main.go`:

```go
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
```

- [ ] **Step 3: Commit**

```bash
git add server/internal/handler/handler.go server/internal/model/models.go server/cmd/server/main.go
git commit -m "feat: wire MongoDB routes, health check, and main.go init"
```

---

### Task 8: Database indexes

**Files:**
- Modify: `server/internal/repository/mongo.go`

- [ ] **Step 1: Add CreateIndexes function to mongo.go**

Append to `server/internal/repository/mongo.go`:

```go
func CreateIndexes() error {
	ctx := context.Background()

	type indexOp struct {
		coll *mongo.Collection
		name string
		keys bson.D
		unique bool
	}

	indexes := []indexOp{
		// Companies
		{CompaniesColl(), "code_unique", bson.D{{"code", 1}}, true},

		// Organizations
		{OrgsColl(), "company_path", bson.D{{"companyId", 1}, {"path", 1}}, false},
		{OrgsColl(), "parent", bson.D{{"parentId", 1}}, false},
		{OrgsColl(), "company_level", bson.D{{"companyId", 1}, {"level", 1}}, false},

		// Users
		{UsersColl(), "company_status", bson.D{{"companyId", 1}, {"status", 1}}, false},
		{UsersColl(), "channel_binding", bson.D{{"channelBindings.platform", 1}, {"channelBindings.platformUserId", 1}}, false},
		{UsersColl(), "phone_sparse", bson.D{{"phone", 1}}, false},
		{UsersColl(), "email_sparse", bson.D{{"email", 1}}, false},

		// Positions
		{PositionsColl(), "user_leader", bson.D{{"userId", 1}, {"isLeader", 1}}, false},
		{PositionsColl(), "org_node", bson.D{{"orgNodeId", 1}}, false},
		{PositionsColl(), "company_path", bson.D{{"companyId", 1}, {"orgNodePath", 1}}, false},
		{PositionsColl(), "path_prefix", bson.D{{"orgNodePath", 1}}, false},
	}

	for _, ix := range indexes {
		opts := options.Index().SetName(ix.name)
		if ix.unique {
			opts.SetUnique(true)
		}
		_, err := ix.coll.Indexes().CreateOne(ctx, mongo.IndexModel{Keys: ix.keys, Options: opts})
		if err != nil {
			return fmt.Errorf("create index %s: %w", ix.name, err)
		}
	}
	return nil
}
```

Requires imports: `"go.mongodb.org/mongo-driver/v2/bson"` and `"go.mongodb.org/mongo-driver/v2/mongo/options"`

- [ ] **Step 2: Call CreateIndexes in main.go after InitMongo**

Add after `fmt.Println("MongoDB connected")` in `main.go`:

```go
	if err := repository.CreateIndexes(); err != nil {
		log.Printf("Warning: MongoDB index creation failed: %v", err)
	} else {
		fmt.Println("MongoDB indexes created")
	}
```

Use a warning instead of fatal — indexes are idempotent and the app can function without them.

- [ ] **Step 3: Commit**

```bash
git add server/internal/repository/mongo.go server/cmd/server/main.go
git commit -m "feat: add MongoDB collection indexes"
```

---

### Task 9: Build verification

- [ ] **Step 1: Compile check**

Run: `cd server && go build ./...`

Expected: no errors

- [ ] **Step 2: Start services and test health check**

Run: `cd /Users/jixin/CODE/TaishanXD2 && docker compose up -d`

Wait for all services healthy, then: `curl http://localhost:4007/api/health`

Expected: `{"postgres":"ok","redis":"ok","mongo":"ok"}`

- [ ] **Step 3: Test company CRUD**

```bash
# Create
curl -X POST http://localhost:4007/api/org/companies \
  -H "Content-Type: application/json" \
  -d '{"name":"福多多","code":"fuduo"}'

# List
curl http://localhost:4007/api/org/companies
```

- [ ] **Step 4: Test org + user + position flow**

```bash
# Create org root
curl -X POST http://localhost:4007/api/org/organizations \
  -H "Content-Type: application/json" \
  -d '{"companyId":"<company_id>","name":"福多多"}'

# Create child org
curl -X POST http://localhost:4007/api/org/organizations \
  -H "Content-Type: application/json" \
  -d '{"companyId":"<company_id>","parentId":"<root_id>","name":"华东分公司"}'

# Create user
curl -X POST http://localhost:4007/api/org/users \
  -H "Content-Type: application/json" \
  -d '{"companyId":"<company_id>","name":"张三","phone":"13800138000"}'

# Create position
curl -X POST http://localhost:4007/api/org/positions \
  -H "Content-Type: application/json" \
  -d '{"userId":"<user_id>","orgNodeId":"<org_id>","title":"分公司总经理","isLeader":true}'

# Get managed users
curl http://localhost:4007/api/org/users/managed/<manager_id>

# Check access
curl "http://localhost:4007/api/org/users/can-access?manager_id=<id>&target_id=<id>"

# Get org tree
curl http://localhost:4007/api/org/organizations/tree/<company_id>
```

---

### Task 10: Documentation updates

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md with new API routes and MongoDB info**

Add MongoDB to the tech stack table:

```markdown
| MongoDB | 7 (mongo-driver/v2) | 用户、组织架构、权限数据 |
```

Add new API routes to the route table:

```markdown
| GET    | `/api/org/companies`           | 否 | MongoDB 公司列表 |
| GET    | `/api/org/companies/:id`       | 否 | 获取单个公司 |
| POST   | `/api/org/companies`           | 否 | 创建公司 |
| PUT    | `/api/org/companies/:id`       | 否 | 更新公司 |
| DELETE | `/api/org/companies/:id`       | 否 | 删除公司 |
| GET    | `/api/org/organizations`       | 否 | 组织节点列表（?company_id=） |
| GET    | `/api/org/organizations/:id`   | 否 | 获取单个组织节点 |
| GET    | `/api/org/organizations/tree/:companyId` | 否 | 获取组织架构树 |
| POST   | `/api/org/organizations`       | 否 | 创建组织节点 |
| PUT    | `/api/org/organizations/:id`   | 否 | 更新组织节点 |
| DELETE | `/api/org/organizations/:id`   | 否 | 删除组织节点 |
| GET    | `/api/org/users`               | 否 | MongoDB 用户列表（?company_id=） |
| GET    | `/api/org/users/:id`           | 否 | 获取单个用户 |
| GET    | `/api/org/users/managed/:id`   | 否 | 获取该用户管辖的所有人员 |
| GET    | `/api/org/users/can-access`    | 否 | 判断能否访问（?manager_id=&target_id=） |
| POST   | `/api/org/users`               | 否 | 创建用户 |
| PUT    | `/api/org/users/:id`           | 否 | 更新用户 |
| DELETE | `/api/org/users/:id`           | 否 | 删除用户（同时删除 positions） |
| GET    | `/api/org/positions`           | 否 | 职位列表（?user_id=&company_id=&org_node_id=） |
| GET    | `/api/org/positions/:id`       | 否 | 获取单个职位 |
| POST   | `/api/org/positions`           | 否 | 创建职位 |
| PUT    | `/api/org/positions/:id`       | 否 | 更新职位 |
| DELETE | `/api/org/positions/:id`       | 否 | 删除职位 |
```

Update the directory structure section to include new files.

Update the "数据库设计" section to add:

```markdown
**MongoDB 集合**（用户与组织架构）：
- `companies` — 公司信息（name, code, status）
- `organizations` — 组织节点树（companyId, parentId, path, level, order），物化路径模式
- `users` — 平台用户（companyId, name, channelBindings[]）
- `positions` — 用户职位（userId, orgNodeId, orgNodePath, title, isLeader），支持多重身份

MongoDB 用户与 PostgreSQL 渠道用户关系：`users.channelBindings` 中的 `platform + platformUserId` 对应 PostgreSQL 的 `wecom_users.user_id` 等字段。
```

Update port table:

```markdown
| MongoDB | 27017 |
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with MongoDB schema and API routes"
```
