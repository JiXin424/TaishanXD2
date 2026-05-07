package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/taishanxd/v2/internal/model"
	"github.com/taishanxd/v2/internal/repository"
)

func listMongoPositions(c *gin.Context) {
	filter := bson.M{"status": "active"}
	if uid := c.Query("user_id"); uid != "" {
		userID, err := bson.ObjectIDFromHex(uid)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user_id"})
			return
		}
		filter["userId"] = userID
	}
	if cid := c.Query("company_id"); cid != "" {
		companyID, err := bson.ObjectIDFromHex(cid)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid company_id"})
			return
		}
		filter["companyId"] = companyID
	}
	if oid := c.Query("org_node_id"); oid != "" {
		orgNodeID, err := bson.ObjectIDFromHex(oid)
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
	id, err := bson.ObjectIDFromHex(c.Param("id"))
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

	userID, err := bson.ObjectIDFromHex(req.UserID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid userId"})
		return
	}
	orgNodeID, err := bson.ObjectIDFromHex(req.OrgNodeID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid orgNodeId"})
		return
	}

	var orgDoc model.OrgDoc
	if err := repository.OrgsColl().FindOne(c.Request.Context(), bson.M{"_id": orgNodeID}).Decode(&orgDoc); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "org node not found"})
		return
	}

	var userDoc model.UserDoc
	if err := repository.UsersColl().FindOne(c.Request.Context(), bson.M{"_id": userID}).Decode(&userDoc); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user not found"})
		return
	}

	now := time.Now()
	doc := model.PositionDoc{
		ID:          bson.NewObjectID(),
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
	id, err := bson.ObjectIDFromHex(c.Param("id"))
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
	id, err := bson.ObjectIDFromHex(c.Param("id"))
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
