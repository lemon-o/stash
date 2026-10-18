package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/jmoiron/sqlx"
)

type UserSceneActivity struct {
	UserID       int        `db:"user_id"`
	SceneID      int        `db:"scene_id"`
	ResumeTime   float64    `db:"resume_time"`
	PlayDuration float64    `db:"play_duration"`
	PlayCount    int        `db:"play_count"`
	LastPlayedAt *time.Time `db:"last_played_at"`
}

type UserActivityStore struct {
	db *sqlx.DB
}

func NewUserActivityStore(db *sqlx.DB) *UserActivityStore {
	return &UserActivityStore{db: db}
}

func (s *UserActivityStore) SaveActivity(ctx context.Context, userID, sceneID int, resumeTime *float64, playDuration *float64) error {
	rTime := 0.0
	if resumeTime != nil {
		rTime = *resumeTime
	}
	pDur := 0.0
	if playDuration != nil {
		pDur = *playDuration
	}

	query := `
		INSERT INTO users_scenes_activity (user_id, scene_id, resume_time, play_duration, last_played_at)
		VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(user_id, scene_id) DO UPDATE SET
			resume_time = CASE WHEN ? IS NOT NULL THEN ? ELSE resume_time END,
			play_duration = play_duration + ?,
			last_played_at = CURRENT_TIMESTAMP
	`
	if s.db != nil {
		_, err := s.db.ExecContext(ctx, query, userID, sceneID, rTime, pDur, resumeTime, rTime, pDur)
		return err
	}
	_, err := dbWrapper.Exec(ctx, query, userID, sceneID, rTime, pDur, resumeTime, rTime, pDur)
	return err
}

func (s *UserActivityStore) AddView(ctx context.Context, userID, sceneID int, viewDate time.Time) error {
	if s.db != nil {
		if _, err := s.db.ExecContext(ctx, "INSERT INTO users_scenes_views (user_id, scene_id, view_date) VALUES (?, ?, ?)", userID, sceneID, viewDate); err != nil {
			return err
		}
	} else {
		if _, err := dbWrapper.Exec(ctx, "INSERT INTO users_scenes_views (user_id, scene_id, view_date) VALUES (?, ?, ?)", userID, sceneID, viewDate); err != nil {
			return err
		}
	}

	updateQuery := `
		INSERT INTO users_scenes_activity (user_id, scene_id, play_count, last_played_at)
		VALUES (?, ?, 1, ?)
		ON CONFLICT(user_id, scene_id) DO UPDATE SET
			play_count = play_count + 1,
			last_played_at = ?
	`
	if s.db != nil {
		_, err := s.db.ExecContext(ctx, updateQuery, userID, sceneID, viewDate, viewDate)
		return err
	}
	_, err := dbWrapper.Exec(ctx, updateQuery, userID, sceneID, viewDate, viewDate)
	return err
}

func (s *UserActivityStore) GetActivity(ctx context.Context, userID, sceneID int) (*UserSceneActivity, error) {
	var act UserSceneActivity
	query := "SELECT user_id, scene_id, resume_time, play_duration, play_count, last_played_at FROM users_scenes_activity WHERE user_id = ? AND scene_id = ?"
	var err error
	if s.db != nil {
		err = s.db.GetContext(ctx, &act, query, userID, sceneID)
	} else {
		err = dbWrapper.Get(ctx, &act, query, userID, sceneID)
	}
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &act, nil
}

func (s *UserActivityStore) GetActivitiesForScenes(ctx context.Context, userID int, sceneIDs []int) (map[int]*UserSceneActivity, error) {
	if len(sceneIDs) == 0 {
		return map[int]*UserSceneActivity{}, nil
	}
	query, args, err := sqlx.In("SELECT user_id, scene_id, resume_time, play_duration, play_count, last_played_at FROM users_scenes_activity WHERE user_id = ? AND scene_id IN (?)", userID, sceneIDs)
	if err != nil {
		return nil, err
	}

	var acts []UserSceneActivity
	if s.db != nil {
		query = s.db.Rebind(query)
		err = s.db.SelectContext(ctx, &acts, query, args...)
	} else {
		err = dbWrapper.Select(ctx, &acts, query, args...)
	}
	if err != nil {
		return nil, err
	}

	ret := make(map[int]*UserSceneActivity, len(acts))
	for i := range acts {
		ret[acts[i].SceneID] = &acts[i]
	}
	return ret, nil
}

func (s *UserActivityStore) ResetActivity(ctx context.Context, userID, sceneID int, resetResume, resetDuration bool) error {
	var query string
	if resetResume && resetDuration {
		query = "UPDATE users_scenes_activity SET resume_time = 0, play_duration = 0 WHERE user_id = ? AND scene_id = ?"
	} else if resetResume {
		query = "UPDATE users_scenes_activity SET resume_time = 0 WHERE user_id = ? AND scene_id = ?"
	} else if resetDuration {
		query = "UPDATE users_scenes_activity SET play_duration = 0 WHERE user_id = ? AND scene_id = ?"
	} else {
		return nil
	}

	if s.db != nil {
		_, err := s.db.ExecContext(ctx, query, userID, sceneID)
		return err
	}
	_, err := dbWrapper.Exec(ctx, query, userID, sceneID)
	return err
}

func (s *UserActivityStore) GetManyViewCount(ctx context.Context, userID int, sceneIDs []int) ([]int, error) {
	acts, err := s.GetActivitiesForScenes(ctx, userID, sceneIDs)
	if err != nil {
		return nil, err
	}
	ret := make([]int, len(sceneIDs))
	for i, id := range sceneIDs {
		if act, ok := acts[id]; ok {
			ret[i] = act.PlayCount
		} else {
			ret[i] = 0
		}
	}
	return ret, nil
}

func (s *UserActivityStore) GetManyLastViewed(ctx context.Context, userID int, sceneIDs []int) ([]*time.Time, error) {
	acts, err := s.GetActivitiesForScenes(ctx, userID, sceneIDs)
	if err != nil {
		return nil, err
	}
	ret := make([]*time.Time, len(sceneIDs))
	for i, id := range sceneIDs {
		if act, ok := acts[id]; ok {
			ret[i] = act.LastPlayedAt
		} else {
			ret[i] = nil
		}
	}
	return ret, nil
}

func (s *UserActivityStore) GetManyViewDates(ctx context.Context, userID int, sceneIDs []int) ([][]time.Time, error) {
	if len(sceneIDs) == 0 {
		return [][]time.Time{}, nil
	}
	query, args, err := sqlx.In("SELECT scene_id, view_date FROM users_scenes_views WHERE user_id = ? AND scene_id IN (?) ORDER BY view_date ASC", userID, sceneIDs)
	if err != nil {
		return nil, err
	}

	type row struct {
		SceneID  int       `db:"scene_id"`
		ViewDate time.Time `db:"view_date"`
	}
	var rows []row
	if s.db != nil {
		query = s.db.Rebind(query)
		err = s.db.SelectContext(ctx, &rows, query, args...)
	} else {
		err = dbWrapper.Select(ctx, &rows, query, args...)
	}
	if err != nil {
		return nil, err
	}

	dateMap := make(map[int][]time.Time)
	for _, r := range rows {
		dateMap[r.SceneID] = append(dateMap[r.SceneID], r.ViewDate)
	}

	ret := make([][]time.Time, len(sceneIDs))
	for i, id := range sceneIDs {
		ret[i] = dateMap[id]
	}
	return ret, nil
}
