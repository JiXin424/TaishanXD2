package model

type User struct {
	ID          int    `json:"id"`
	Username    string `json:"username"`
	RealName    string `json:"realName"`
	CompanyID   int    `json:"companyId"`
	CompanyName string `json:"companyName"`
	DataScope   int    `json:"dataScope"`
	DisplayName string `json:"displayName"`
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type HealthResponse struct {
	Postgres string `json:"postgres"`
	Redis    string `json:"redis"`
	Mongo    string `json:"mongo"`
}

type SystemInfo struct {
	Version     string `json:"version"`
	GoVersion   string `json:"goVersion"`
	StartedAt   string `json:"startedAt"`
	Environment string `json:"environment"`
}

type Company struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
	Code string `json:"code"`
}

type CompanyResponse struct {
	ID       int      `json:"id"`
	Name     string   `json:"name"`
	Code     string   `json:"code"`
	Channels []string `json:"channels"`
}

type WecomUser struct {
	ID             int    `json:"id"`
	UserID         string `json:"userId"`
	Name           string `json:"name"`
	Mobile         string `json:"mobile"`
	JobTitle       string `json:"jobTitle"`
	DepartmentPath string `json:"departmentPath"`
	CompanyID      int    `json:"companyId"`
}

type WecomStats struct {
	TotalUsers    int `json:"totalUsers"`
	TotalMessages int `json:"totalMessages"`
	TotalChats    int `json:"totalChats"`
}
