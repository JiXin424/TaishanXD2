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

type WecomMessage struct {
	ID            int    `json:"id"`
	MessageID     string `json:"messageId"`
	ChatID        string `json:"chatId"`
	MsgType       string `json:"msgType"`
	Content       string `json:"content"`
	SenderID      string `json:"senderId"`
	SenderIDType  string `json:"senderIdType"`
	ReceiveID     string `json:"receiveId"`
	ReceiveIDType string `json:"receiveIdType"`
	Direction     string `json:"direction"`
	CreateTime    int64  `json:"createTime"`
	ChatName      string `json:"chatName"`
}

type KefuMessage struct {
	ID             int    `json:"id"`
	MessageID      string `json:"messageId"`
	ExternalUserID string `json:"externalUserId"`
	OpenKfID       string `json:"openKfId"`
	MsgType        string `json:"msgType"`
	Content        string `json:"content"`
	Direction      string `json:"direction"`
	CreatedAt      string `json:"createdAt"`
}

type KefuCustomer struct {
	ExternalUserID string `json:"externalUserId"`
	Nickname       string `json:"nickname"`
	Avatar         string `json:"avatar"`
	Gender         string `json:"gender"`
	TotalSent      int    `json:"totalSent"`
	TotalReceived  int    `json:"totalReceived"`
	LastActiveAt   string `json:"lastActiveAt"`
}

// --- Analytics ---

type UserCount struct {
	UserID   string `json:"userId"`
	UserName string `json:"userName"`
	Count    int    `json:"count"`
}

type UserToken struct {
	UserID   string `json:"userId"`
	UserName string `json:"userName"`
	Tokens   int    `json:"tokens"`
}

type TimeBucket struct {
	Label string `json:"label"`
	Count int    `json:"count"`
}

type HourBucket struct {
	Hour  int `json:"hour"`
	Count int `json:"count"`
}

type AnalyticsResponse struct {
	UserConversations  []UserCount  `json:"userConversations"`
	UserTokens         []UserToken  `json:"userTokens"`
	ConversationVolume []TimeBucket `json:"conversationVolume"`
	TimeDistribution   []HourBucket `json:"timeDistribution"`
}
