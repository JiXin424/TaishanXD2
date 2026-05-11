package model

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// ── Companies ──────────────────────────────────────────────────

type CompanyDoc struct {
	ID        bson.ObjectID `bson:"_id"      json:"id"`
	Name      string             `bson:"name"     json:"name"`
	Code      string             `bson:"code"     json:"code"`
	Channel   string             `bson:"channel"  json:"channel"`
	Status    string             `bson:"status"   json:"status"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time          `bson:"updatedAt" json:"updatedAt"`
}

type CreateCompanyReq struct {
	Name string `json:"name" binding:"required"`
	Code string `json:"code"  binding:"required"`
}

type UpdateCompanyReq struct {
	Name    *string `json:"name"`
	Code    *string `json:"code"`
	Status  *string `json:"status"`
	Channel *string `json:"channel"`
}

// ── Organizations ──────────────────────────────────────────────

type OrgDoc struct {
	ID        bson.ObjectID  `bson:"_id"       json:"id"`
	CompanyID bson.ObjectID  `bson:"companyId"  json:"companyId"`
	Name      string              `bson:"name"       json:"name"`
	ParentID  *bson.ObjectID `bson:"parentId"   json:"parentId"`
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
	ID              bson.ObjectID `bson:"_id"              json:"id"`
	CompanyID       bson.ObjectID `bson:"companyId"        json:"companyId"`
	Username        string             `bson:"username"         json:"username"`
	PasswordHash    string             `bson:"passwordHash"     json:"-"`
	Role            string             `bson:"role"             json:"role"`
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
	CompanyID       string           `json:"companyId"       binding:"required"`
	Username        string           `json:"username"        binding:"required"`
	Password        string           `json:"password"        binding:"required"`
	Name            string           `json:"name"            binding:"required"`
	Phone           string           `json:"phone"`
	Email           string           `json:"email"`
	Avatar          string           `json:"avatar"`
	ChannelBindings []ChannelBinding `json:"channelBindings"`
}

type UpdateUserReq struct {
	Username        *string          `json:"username"`
	Password        *string          `json:"password"`
	Name            *string          `json:"name"`
	Phone           *string          `json:"phone"`
	Email           *string          `json:"email"`
	Avatar          *string          `json:"avatar"`
	Status          *string          `json:"status"`
	ChannelBindings []ChannelBinding `json:"channelBindings"`
}

// ── Positions ──────────────────────────────────────────────────

type PositionDoc struct {
	ID          bson.ObjectID `bson:"_id"          json:"id"`
	UserID      bson.ObjectID `bson:"userId"       json:"userId"`
	CompanyID   bson.ObjectID `bson:"companyId"    json:"companyId"`
	OrgNodeID   bson.ObjectID `bson:"orgNodeId"    json:"orgNodeId"`
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

// ── Analysis Logs ──────────────────────────────────────────────

type AnalysisLogDoc struct {
	ID              bson.ObjectID `bson:"_id"              json:"id"`
	AppID           string             `bson:"appId"            json:"app_id"`
	CompanyID       string             `bson:"companyId"        json:"company_id"`
	AnalysisTarget  string             `bson:"analysisTarget"   json:"analysis_target"`
	DataCount       int                `bson:"dataCount"        json:"data_count"`
	CoverageDisplay string             `bson:"coverageDisplay"  json:"coverage_display"`
	TimeRange       string             `bson:"timeRange"        json:"time_range"`
	Success         bool               `bson:"success"          json:"success"`
	ErrorMsg        string             `bson:"errorMsg"         json:"error_msg,omitempty"`
	Summary         string             `bson:"summary"          json:"summary"`
	CoreIntents     []string           `bson:"coreIntents"      json:"core_intents"`
	QualityIssues   []string           `bson:"qualityIssues"    json:"quality_issues"`
	Report          interface{}        `bson:"report"           json:"report"`
	CreatedAt       time.Time          `bson:"createdAt"        json:"created_at"`
}
