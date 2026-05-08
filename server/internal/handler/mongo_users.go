package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
	"golang.org/x/crypto/bcrypt"

	"github.com/taishanxd/v2/internal/model"
	"github.com/taishanxd/v2/internal/repository"
)

func listMongoUsers(c *gin.Context) {
	filter := bson.M{"status": "active"}
	if cid := c.Query("company_id"); cid != "" {
		companyID, err := bson.ObjectIDFromHex(cid)
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
	id, err := bson.ObjectIDFromHex(c.Param("id"))
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

	companyID, err := bson.ObjectIDFromHex(req.CompanyID)
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

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "password hash failed"})
		return
	}

	doc := model.UserDoc{
		ID:              bson.NewObjectID(),
		CompanyID:       companyID,
		Username:        req.Username,
		PasswordHash:    string(hash),
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
	id, err := bson.ObjectIDFromHex(c.Param("id"))
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
	if req.Username != nil {
		update["username"] = *req.Username
	}
	if req.Password != nil {
		hash, err := bcrypt.GenerateFromPassword([]byte(*req.Password), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "password hash failed"})
			return
		}
		update["passwordHash"] = string(hash)
	}
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
	id, err := bson.ObjectIDFromHex(c.Param("id"))
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
	managerID, err := bson.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	ctx := c.Request.Context()

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

	orConditions := make([]bson.M, len(leaderPositions))
	for i, p := range leaderPositions {
		orConditions[i] = bson.M{"orgNodePath": bson.Regex{Pattern: "^" + p.OrgNodePath}}
	}

	var managedUserIDs []bson.ObjectID
	distinctResult := repository.PositionsColl().Distinct(ctx, "userId", bson.M{
		"$or":    orConditions,
		"status": "active",
	})
	if err := distinctResult.Decode(&managedUserIDs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	objectIDs := managedUserIDs

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
	managerID, err := bson.ObjectIDFromHex(c.Query("manager_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid manager_id"})
		return
	}
	targetID, err := bson.ObjectIDFromHex(c.Query("target_id"))
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
