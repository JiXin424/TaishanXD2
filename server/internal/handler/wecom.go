package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/taishanxd/v2/internal/model"
	"github.com/taishanxd/v2/internal/repository"
)

func RegisterWecomRoutes(r *gin.Engine) {
	r.GET("/api/companies", listCompanies)
	r.GET("/api/wecom/users", listWecomUsers)
	r.GET("/api/wecom/stats", getWecomStats)
}

func listCompanies(c *gin.Context) {
	cursor, err := repository.CompaniesColl().Find(c.Request.Context(), bson.M{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer cursor.Close(c.Request.Context())

	var companies []model.CompanyDoc
	if err := cursor.All(c.Request.Context(), &companies); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	channels := []string{"wecom", "dingtalk", "feishu"}
	type companyItem struct {
		ID       string   `json:"id"`
		Name     string   `json:"name"`
		Code     string   `json:"code"`
		Channels []string `json:"channels"`
	}
	var result []companyItem
	for _, co := range companies {
		result = append(result, companyItem{
			ID:       co.ID.Hex(),
			Name:     co.Name,
			Code:     co.Code,
			Channels: channels,
		})
	}
	if result == nil {
		result = []companyItem{}
	}
	c.JSON(http.StatusOK, result)
}

// resolvePgCompanyID maps a MongoDB company ObjectID to a PostgreSQL company integer ID via the code field
func resolvePgCompanyID(mongoID string) (int, error) {
	objID, err := bson.ObjectIDFromHex(mongoID)
	if err != nil {
		return 0, err
	}
	var company model.CompanyDoc
	if err := repository.CompaniesColl().FindOne(nil, bson.M{"_id": objID}).Decode(&company); err != nil {
		return 0, err
	}
	var pgID int
	err = repository.DB.QueryRow("SELECT id FROM companies WHERE code = $1", company.Code).Scan(&pgID)
	return pgID, err
}

func listWecomUsers(c *gin.Context) {
	pgID, err := resolvePgCompanyID(c.Query("company_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid company_id"})
		return
	}

	query := `
		SELECT id, user_id, COALESCE(name, ''), COALESCE(mobile, ''),
		       COALESCE(job_title, ''), COALESCE(department_path, ''), company_id
		FROM wecom_users
		WHERE company_id = $1
		ORDER BY id
	`
	rows, err := repository.DB.Query(query, pgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var users []model.WecomUser
	for rows.Next() {
		var u model.WecomUser
		if err := rows.Scan(&u.ID, &u.UserID, &u.Name, &u.Mobile, &u.JobTitle, &u.DepartmentPath, &u.CompanyID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		users = append(users, u)
	}

	c.JSON(http.StatusOK, users)
}

func getWecomStats(c *gin.Context) {
	pgID, err := resolvePgCompanyID(c.Query("company_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid company_id"})
		return
	}

	var stats model.WecomStats
	repository.DB.QueryRow("SELECT count(*) FROM wecom_users WHERE company_id = $1", pgID).Scan(&stats.TotalUsers)
	repository.DB.QueryRow("SELECT count(*) FROM wecom_messages WHERE company_id = $1", pgID).Scan(&stats.TotalMessages)
	repository.DB.QueryRow("SELECT count(*) FROM wecom_chats WHERE company_id = $1", pgID).Scan(&stats.TotalChats)

	c.JSON(http.StatusOK, stats)
}
