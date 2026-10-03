package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/user/android-browser-stream/backend/domain"
)

type SQLiteSessionRepository struct {
	db *sql.DB
}

// NewSQLiteSessionRepository constructs a new SQLite-backed session repository.
func NewSQLiteSessionRepository(db *sql.DB) *SQLiteSessionRepository {
	return &SQLiteSessionRepository{db: db}
}

// Migrate ensures the sessions table exists.
func (r *SQLiteSessionRepository) Migrate(ctx context.Context) error {
	query := `
	CREATE TABLE IF NOT EXISTS sessions (
		id TEXT PRIMARY KEY,
		container_id TEXT NOT NULL,
		adb_port INTEGER NOT NULL,
		status TEXT NOT NULL,
		device_width INTEGER NOT NULL,
		device_height INTEGER NOT NULL,
		kiosk_enabled INTEGER NOT NULL DEFAULT 0,
		target_package TEXT NOT NULL DEFAULT '',
		target_activity TEXT NOT NULL DEFAULT '',
		recording INTEGER NOT NULL DEFAULT 0,
		recording_path TEXT NOT NULL DEFAULT '',
		created_at DATETIME NOT NULL,
		last_active_at DATETIME NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
	CREATE INDEX IF NOT EXISTS idx_sessions_last_active ON sessions(last_active_at);
	`
	if _, err := r.db.ExecContext(ctx, query); err != nil {
		return err
	}

	// Idempotent column migrations for existing SQLite databases
	cols := []string{
		"ALTER TABLE sessions ADD COLUMN kiosk_enabled INTEGER NOT NULL DEFAULT 0;",
		"ALTER TABLE sessions ADD COLUMN target_package TEXT NOT NULL DEFAULT '';",
		"ALTER TABLE sessions ADD COLUMN target_activity TEXT NOT NULL DEFAULT '';",
		"ALTER TABLE sessions ADD COLUMN recording INTEGER NOT NULL DEFAULT 0;",
		"ALTER TABLE sessions ADD COLUMN recording_path TEXT NOT NULL DEFAULT '';",
	}
	for _, colStmt := range cols {
		_, _ = r.db.ExecContext(ctx, colStmt)
	}
	return nil
}

func (r *SQLiteSessionRepository) Create(ctx context.Context, s *domain.Session) error {
	query := `
	INSERT INTO sessions (id, container_id, adb_port, status, device_width, device_height,
		kiosk_enabled, target_package, target_activity, recording, recording_path,
		created_at, last_active_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	kioskVal := 0
	if s.KioskEnabled {
		kioskVal = 1
	}
	recVal := 0
	if s.Recording {
		recVal = 1
	}

	_, err := r.db.ExecContext(ctx, query,
		s.ID,
		s.ContainerID,
		s.ADBPort,
		string(s.Status),
		s.DeviceWidth,
		s.DeviceHeight,
		kioskVal,
		s.TargetPackage,
		s.TargetActivity,
		recVal,
		s.RecordingPath,
		s.CreatedAt.UTC().Format(time.RFC3339),
		s.LastActiveAt.UTC().Format(time.RFC3339),
	)
	if err != nil {
		return fmt.Errorf("create session: %w", err)
	}
	return nil
}

func (r *SQLiteSessionRepository) GetByID(ctx context.Context, id string) (*domain.Session, error) {
	query := `
	SELECT id, container_id, adb_port, status, device_width, device_height,
		kiosk_enabled, target_package, target_activity, recording, recording_path,
		created_at, last_active_at
	FROM sessions WHERE id = ?
	`
	var s domain.Session
	var statusStr, createdAtStr, lastActiveAtStr string
	var kioskVal, recVal int

	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&s.ID,
		&s.ContainerID,
		&s.ADBPort,
		&statusStr,
		&s.DeviceWidth,
		&s.DeviceHeight,
		&kioskVal,
		&s.TargetPackage,
		&s.TargetActivity,
		&recVal,
		&s.RecordingPath,
		&createdAtStr,
		&lastActiveAtStr,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrSessionNotFound
		}
		return nil, fmt.Errorf("get session: %w", err)
	}

	s.Status = domain.SessionStatus(statusStr)
	s.KioskEnabled = kioskVal == 1
	s.Recording = recVal == 1
	s.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)
	s.LastActiveAt, _ = time.Parse(time.RFC3339, lastActiveAtStr)

	return &s, nil
}

func (r *SQLiteSessionRepository) List(ctx context.Context) ([]*domain.Session, error) {
	query := `
	SELECT id, container_id, adb_port, status, device_width, device_height,
		kiosk_enabled, target_package, target_activity, recording, recording_path,
		created_at, last_active_at
	FROM sessions ORDER BY datetime(created_at) DESC, created_at DESC
	`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	defer rows.Close()

	var sessions []*domain.Session
	for rows.Next() {
		var s domain.Session
		var statusStr, createdAtStr, lastActiveAtStr string
		var kioskVal, recVal int

		if err := rows.Scan(
			&s.ID,
			&s.ContainerID,
			&s.ADBPort,
			&statusStr,
			&s.DeviceWidth,
			&s.DeviceHeight,
			&kioskVal,
			&s.TargetPackage,
			&s.TargetActivity,
			&recVal,
			&s.RecordingPath,
			&createdAtStr,
			&lastActiveAtStr,
		); err != nil {
			return nil, fmt.Errorf("scan session: %w", err)
		}

		s.Status = domain.SessionStatus(statusStr)
		s.KioskEnabled = kioskVal == 1
		s.Recording = recVal == 1
		s.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)
		s.LastActiveAt, _ = time.Parse(time.RFC3339, lastActiveAtStr)
		sessions = append(sessions, &s)
	}

	if rows.Err() != nil {
		return nil, rows.Err()
	}

	sort.SliceStable(sessions, func(i, j int) bool {
		return sessions[i].CreatedAt.After(sessions[j].CreatedAt)
	})

	return sessions, nil
}

func (r *SQLiteSessionRepository) UpdateStatus(ctx context.Context, id string, status domain.SessionStatus) error {
	query := `UPDATE sessions SET status = ? WHERE id = ?`
	res, err := r.db.ExecContext(ctx, query, string(status), id)
	if err != nil {
		return fmt.Errorf("update session status: %w", err)
	}
	rows, err := res.RowsAffected()
	if err == nil && rows == 0 {
		return domain.ErrSessionNotFound
	}
	return nil
}

func (r *SQLiteSessionRepository) UpdateContainerID(ctx context.Context, id string, containerID string) error {
	query := `UPDATE sessions SET container_id = ? WHERE id = ?`
	res, err := r.db.ExecContext(ctx, query, containerID, id)
	if err != nil {
		return fmt.Errorf("update container id: %w", err)
	}
	rows, err := res.RowsAffected()
	if err == nil && rows == 0 {
		return domain.ErrSessionNotFound
	}
	return nil
}

func (r *SQLiteSessionRepository) UpdateLastActive(ctx context.Context, id string, t time.Time) error {
	query := `UPDATE sessions SET last_active_at = ? WHERE id = ?`
	res, err := r.db.ExecContext(ctx, query, t.UTC().Format(time.RFC3339), id)
	if err != nil {
		return fmt.Errorf("update last active: %w", err)
	}
	rows, err := res.RowsAffected()
	if err == nil && rows == 0 {
		return domain.ErrSessionNotFound
	}
	return nil
}

func (r *SQLiteSessionRepository) UpdateRecordingPath(ctx context.Context, id string, path string) error {
	query := `UPDATE sessions SET recording_path = ? WHERE id = ?`
	res, err := r.db.ExecContext(ctx, query, path, id)
	if err != nil {
		return fmt.Errorf("update recording path: %w", err)
	}
	rows, err := res.RowsAffected()
	if err == nil && rows == 0 {
		return domain.ErrSessionNotFound
	}
	return nil
}

func (r *SQLiteSessionRepository) Delete(ctx context.Context, id string) error {
	query := `DELETE FROM sessions WHERE id = ?`
	_, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}

func (r *SQLiteSessionRepository) GetStale(ctx context.Context, olderThan time.Duration) ([]*domain.Session, error) {
	threshold := time.Now().UTC().Add(-olderThan).Format(time.RFC3339)
	query := `
	SELECT id, container_id, adb_port, status, device_width, device_height,
		kiosk_enabled, target_package, target_activity, recording, recording_path,
		created_at, last_active_at
	FROM sessions
	WHERE last_active_at < ? AND status != ?
	`
	rows, err := r.db.QueryContext(ctx, query, threshold, string(domain.SessionStatusTerminated))
	if err != nil {
		return nil, fmt.Errorf("get stale sessions: %w", err)
	}
	defer rows.Close()

	var sessions []*domain.Session
	for rows.Next() {
		var s domain.Session
		var statusStr, createdAtStr, lastActiveAtStr string
		var kioskVal, recVal int

		if err := rows.Scan(
			&s.ID,
			&s.ContainerID,
			&s.ADBPort,
			&statusStr,
			&s.DeviceWidth,
			&s.DeviceHeight,
			&kioskVal,
			&s.TargetPackage,
			&s.TargetActivity,
			&recVal,
			&s.RecordingPath,
			&createdAtStr,
			&lastActiveAtStr,
		); err != nil {
			return nil, fmt.Errorf("scan stale session: %w", err)
		}

		s.Status = domain.SessionStatus(statusStr)
		s.KioskEnabled = kioskVal == 1
		s.Recording = recVal == 1
		s.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)
		s.LastActiveAt, _ = time.Parse(time.RFC3339, lastActiveAtStr)
		sessions = append(sessions, &s)
	}

	return sessions, rows.Err()
}
