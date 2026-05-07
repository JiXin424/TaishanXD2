package repository

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
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

func CreateIndexes() error {
	ctx := context.Background()

	type indexOp struct {
		coll   *mongo.Collection
		name   string
		keys   bson.D
		unique bool
	}

	indexes := []indexOp{
		// Companies
		{CompaniesColl(), "code_unique", bson.D{{Key: "code", Value: 1}}, true},

		// Organizations
		{OrgsColl(), "company_path", bson.D{{Key: "companyId", Value: 1}, {Key: "path", Value: 1}}, false},
		{OrgsColl(), "parent", bson.D{{Key: "parentId", Value: 1}}, false},
		{OrgsColl(), "company_level", bson.D{{Key: "companyId", Value: 1}, {Key: "level", Value: 1}}, false},

		// Users
		{UsersColl(), "company_status", bson.D{{Key: "companyId", Value: 1}, {Key: "status", Value: 1}}, false},
		{UsersColl(), "channel_binding", bson.D{{Key: "channelBindings.platform", Value: 1}, {Key: "channelBindings.platformUserId", Value: 1}}, false},
		{UsersColl(), "phone_sparse", bson.D{{Key: "phone", Value: 1}}, false},
		{UsersColl(), "email_sparse", bson.D{{Key: "email", Value: 1}}, false},

		// Positions
		{PositionsColl(), "user_leader", bson.D{{Key: "userId", Value: 1}, {Key: "isLeader", Value: 1}}, false},
		{PositionsColl(), "org_node", bson.D{{Key: "orgNodeId", Value: 1}}, false},
		{PositionsColl(), "company_path", bson.D{{Key: "companyId", Value: 1}, {Key: "orgNodePath", Value: 1}}, false},
		{PositionsColl(), "path_prefix", bson.D{{Key: "orgNodePath", Value: 1}}, false},
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
