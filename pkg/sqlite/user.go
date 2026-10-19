package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/jmoiron/sqlx"
	"github.com/stashapp/stash/pkg/models"
	"golang.org/x/crypto/bcrypt"
)

type UserStore struct {
	db *sqlx.DB
}

func NewUserStore(db *sqlx.DB) *UserStore {
	return &UserStore{db: db}
}

func (s *UserStore) GetByUsername(ctx context.Context, username string) (*models.User, error) {
	var u models.User
	query := "SELECT id, username, password_hash, is_admin, created_at FROM users WHERE username = ?"
	err := s.db.GetContext(ctx, &u, query, username)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

func (s *UserStore) GetByID(ctx context.Context, id int) (*models.User, error) {
	var u models.User
	query := "SELECT id, username, password_hash, is_admin, created_at FROM users WHERE id = ?"
	err := s.db.GetContext(ctx, &u, query, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

func (s *UserStore) ListAll(ctx context.Context) ([]*models.User, error) {
	var users []*models.User
	query := "SELECT id, username, is_admin, created_at FROM users ORDER BY id ASC"
	err := s.db.SelectContext(ctx, &users, query)
	if err != nil {
		return nil, err
	}
	return users, nil
}

func (s *UserStore) Create(ctx context.Context, username, password string) (*models.User, error) {
	// Check if already exists
	existing, err := s.GetByUsername(ctx, username)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, fmt.Errorf("user with username '%s' already exists", username)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	if err != nil {
		return nil, fmt.Errorf("hashing password: %w", err)
	}

	query := "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, 0, CURRENT_TIMESTAMP)"
	res, err := s.db.ExecContext(ctx, query, username, string(hash))
	if err != nil {
		return nil, fmt.Errorf("creating user: %w", err)
	}

	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}

	return s.GetByID(ctx, int(id))
}

func (s *UserStore) Delete(ctx context.Context, id int) error {
	if id == 1 {
		return errors.New("cannot delete primary administrator account")
	}
	_, err := s.db.ExecContext(ctx, "DELETE FROM users WHERE id = ?", id)
	return err
}

func (s *UserStore) UpdatePassword(ctx context.Context, id int, newPassword string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.MinCost)
	if err != nil {
		return fmt.Errorf("hashing password: %w", err)
	}
	_, err = s.db.ExecContext(ctx, "UPDATE users SET password_hash = ? WHERE id = ?", string(hash), id)
	return err
}

func (s *UserStore) Count(ctx context.Context) (int, error) {
	var count int
	err := s.db.GetContext(ctx, &count, "SELECT COUNT(*) FROM users")
	return count, err
}
