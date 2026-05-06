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
}

type SystemInfo struct {
	Version     string `json:"version"`
	GoVersion   string `json:"goVersion"`
	StartedAt   string `json:"startedAt"`
	Environment string `json:"environment"`
}
