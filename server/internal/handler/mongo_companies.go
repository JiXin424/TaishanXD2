package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"

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
	id, err := bson.ObjectIDFromHex(c.Param("id"))
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
		ID:        bson.NewObjectID(),
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
	id, err := bson.ObjectIDFromHex(c.Param("id"))
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
	id, err := bson.ObjectIDFromHex(c.Param("id"))
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
