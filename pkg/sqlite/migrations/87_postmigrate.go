package migrations

import (
	"context"
	"fmt"

	"github.com/jmoiron/sqlx"
	"github.com/stashapp/stash/internal/manager/config"
	"github.com/stashapp/stash/pkg/logger"
	"github.com/stashapp/stash/pkg/sqlite"
)

func post87(ctx context.Context, db *sqlx.DB) error {
	logger.Info("Running post-migration for schema version 87 (Multi-User & Activity Isolation)")

	// 1. Check if users table already has records
	var userCount int
	if err := db.GetContext(ctx, &userCount, "SELECT COUNT(*) FROM users"); err != nil {
		return fmt.Errorf("checking users count: %w", err)
	}

	if userCount == 0 {
		cfg := config.GetInstance()
		username := cfg.GetUsername()
		pwHash := cfg.GetPasswordHash()

		if username == "" {
			username = "admin"
		}
		// If no password set, set empty string
		logger.Infof("Initializing primary administrator user '%s' (ID: 1)", username)
		insertUserSQL := `INSERT INTO users (id, username, password_hash, is_admin, created_at)
			VALUES (1, ?, ?, 1, CURRENT_TIMESTAMP)`
		if _, err := db.ExecContext(ctx, insertUserSQL, username, pwHash); err != nil {
			return fmt.Errorf("inserting initial admin user: %w", err)
		}

		// 2. Migrate existing global views into users_scenes_views for user 1
		migrateViewsSQL := `INSERT OR IGNORE INTO users_scenes_views (user_id, scene_id, view_date)
			SELECT 1, scene_id, view_date FROM scenes_view_dates WHERE scene_id IS NOT NULL`
		if _, err := db.ExecContext(ctx, migrateViewsSQL); err != nil {
			logger.Warnf("Migrating existing view dates to user 1: %v", err)
		}

		// 3. Migrate existing global resume times and play duration to users_scenes_activity for user 1
		migrateActivitySQL := `INSERT OR IGNORE INTO users_scenes_activity (user_id, scene_id, resume_time, play_duration, last_played_at)
			SELECT 1, id, resume_time, play_duration, NULL FROM scenes WHERE resume_time > 0 OR play_duration > 0`
		if _, err := db.ExecContext(ctx, migrateActivitySQL); err != nil {
			logger.Warnf("Migrating existing scene activities to user 1: %v", err)
		}

		// 4. Update play_count and last_played_at for user 1
		updateCountsSQL := `UPDATE users_scenes_activity
			SET play_count = (SELECT COUNT(*) FROM users_scenes_views WHERE users_scenes_views.user_id = users_scenes_activity.user_id AND users_scenes_views.scene_id = users_scenes_activity.scene_id),
			    last_played_at = (SELECT MAX(view_date) FROM users_scenes_views WHERE users_scenes_views.user_id = users_scenes_activity.user_id AND users_scenes_views.scene_id = users_scenes_activity.scene_id)
			WHERE user_id = 1`
		if _, err := db.ExecContext(ctx, updateCountsSQL); err != nil {
			logger.Warnf("Updating activity counts for user 1: %v", err)
		}
	}

	return nil
}

func init() {
	sqlite.RegisterPostMigration(87, post87)
}
