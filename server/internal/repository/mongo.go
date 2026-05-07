package repository

import (
	"context"
	"fmt"
	"time"

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
