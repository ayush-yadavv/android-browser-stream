package bootstrap

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/user/android-browser-stream/backend/repository"
	_ "modernc.org/sqlite"
)

// NewSQLiteDatabase establishes a connection to the SQLite database and executes migrations.
func NewSQLiteDatabase(env *Env) (*sql.DB, error) {
	dir := filepath.Dir(env.DBPath)
	if dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, fmt.Errorf("create db directory %s: %w", dir, err)
		}
	}

	db, err := sql.Open("sqlite", env.DBPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite db: %w", err)
	}

	// Optimize connection pooling for SQLite
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(time.Hour)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("ping sqlite db: %w", err)
	}

	repo := repository.NewSQLiteSessionRepository(db)
	if err := repo.Migrate(ctx); err != nil {
		return nil, fmt.Errorf("migrate session schema: %w", err)
	}

	return db, nil
}
