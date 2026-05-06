package repository

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/taishanxd/v2/internal/config"
)

var RDB *redis.Client

func InitRedis(cfg *config.Config) error {
	RDB = redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr(),
		Password: cfg.RedisPass,
		DB:       cfg.RedisDB,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return RDB.Ping(ctx).Err()
}

func CheckRedis() error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return RDB.Ping(ctx).Err()
}

func SetSession(ctx context.Context, token string, data []byte, ttl time.Duration) error {
	return RDB.Set(ctx, "session:"+token, data, ttl).Err()
}

func GetSession(ctx context.Context, token string) (string, error) {
	return RDB.Get(ctx, "session:"+token).Result()
}

func DeleteSession(ctx context.Context, token string) error {
	return RDB.Del(ctx, "session:"+token).Err()
}
