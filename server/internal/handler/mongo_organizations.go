package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/taishanxd/v2/internal/model"
	"github.com/taishanxd/v2/internal/repository"
)

func listMongoOrgs(c *gin.Context) {
	companyID, err := bson.ObjectIDFromHex(c.Query("company_id"))
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
	id, err := bson.ObjectIDFromHex(c.Param("id"))
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

	companyID, err := bson.ObjectIDFromHex(req.CompanyID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid companyId"})
		return
	}

	now := time.Now()
	id := bson.NewObjectID()

	var path string
	var level int
	var parentID *bson.ObjectID

	if req.ParentID != "" {
		pid, err := bson.ObjectIDFromHex(req.ParentID)
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
	id, err := bson.ObjectIDFromHex(c.Param("id"))
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
	id, err := bson.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

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
	companyID, err := bson.ObjectIDFromHex(c.Param("companyId"))
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
