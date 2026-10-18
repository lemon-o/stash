// Package session provides session authentication and management for the application.
package session

import (
	"context"
	"errors"
	"net/http"

	"github.com/gorilla/sessions"
	"github.com/stashapp/stash/pkg/logger"
)

type key int

const (
	contextUser key = iota
	contextVisitedPlugins
	contextLocalRequest
)

const (
	userIDKey             = "userID"
	visitedPluginHooksKey = "visitedPluginsHooks"
)

const (
	ApiKeyHeader    = "ApiKey"
	ApiKeyParameter = "apikey"
)

const (
	cookieName      = "session"
	usernameFormKey = "username"
	passwordFormKey = "password"
)

type InvalidCredentialsError struct {
	Username string
}

func (e InvalidCredentialsError) Error() string {
	// don't leak the username
	return "invalid credentials"
}

var ErrUnauthorized = errors.New("unauthorized")

type UserAuthInfo struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
	IsAdmin  bool   `json:"is_admin"`
}

type UserValidatorFunc func(username string, password string) (*UserAuthInfo, bool)

type Store struct {
	sessionStore  *sessions.CookieStore
	config        SessionConfig
	userValidator UserValidatorFunc
}

func (s *Store) SetUserValidator(fn UserValidatorFunc) {
	s.userValidator = fn
}

func NewStore(c SessionConfig) *Store {
	ret := &Store{
		sessionStore: sessions.NewCookieStore(c.GetSessionStoreKey()),
		config:       c,
	}

	ret.sessionStore.MaxAge(c.GetMaxSessionAge())
	ret.sessionStore.Options.SameSite = http.SameSiteLaxMode

	return ret
}

func (s *Store) Login(w http.ResponseWriter, r *http.Request) error {
	// ignore error - we want a new session regardless
	newSession, _ := s.sessionStore.Get(r, cookieName)

	username := r.FormValue(usernameFormKey)
	password := r.FormValue(passwordFormKey)

	var authInfo *UserAuthInfo
	if s.userValidator != nil {
		info, valid := s.userValidator(username, password)
		if !valid {
			return &InvalidCredentialsError{Username: username}
		}
		authInfo = info
	} else {
		if !s.config.ValidateCredentials(username, password) {
			return &InvalidCredentialsError{Username: username}
		}
		authInfo = &UserAuthInfo{
			ID:       1,
			Username: username,
			IsAdmin:  true,
		}
	}

	logger.Infof("User '%s' logged in", username)

	newSession.Values[userIDKey] = username
	newSession.Values["dbUserID"] = authInfo.ID
	newSession.Values["isAdmin"] = authInfo.IsAdmin

	err := newSession.Save(r, w)
	if err != nil {
		return err
	}

	return nil
}

func (s *Store) Logout(w http.ResponseWriter, r *http.Request) error {
	session, err := s.sessionStore.Get(r, cookieName)
	if err != nil {
		return err
	}

	delete(session.Values, userIDKey)
	delete(session.Values, "dbUserID")
	delete(session.Values, "isAdmin")
	session.Options.MaxAge = -1

	err = session.Save(r, w)
	if err != nil {
		return err
	}

	logger.Infof("User logged out")

	return nil
}

func (s *Store) GetSessionUserInfo(w http.ResponseWriter, r *http.Request) (*UserAuthInfo, error) {
	session, err := s.sessionStore.Get(r, cookieName)
	if err != nil {
		return nil, nil
	}

	if !session.IsNew {
		val := session.Values[userIDKey]
		if val == nil {
			return nil, nil
		}
		username, _ := val.(string)
		if username == "" {
			return nil, nil
		}

		dbUserID, _ := session.Values["dbUserID"].(int)
		isAdmin, _ := session.Values["isAdmin"].(bool)
		if dbUserID == 0 {
			dbUserID = 1
		}

		// refresh cookie
		_ = session.Save(r, w)

		return &UserAuthInfo{
			ID:       dbUserID,
			Username: username,
			IsAdmin:  isAdmin,
		}, nil
	}

	return nil, nil
}

func (s *Store) GetSessionUserID(w http.ResponseWriter, r *http.Request) (string, error) {
	info, err := s.GetSessionUserInfo(w, r)
	if err != nil || info == nil {
		return "", err
	}
	return info.Username, nil
}

const contextUserInfo key = 10

func SetCurrentUserInfo(ctx context.Context, info *UserAuthInfo) context.Context {
	return context.WithValue(ctx, contextUserInfo, info)
}

func GetCurrentUserInfo(ctx context.Context) *UserAuthInfo {
	val := ctx.Value(contextUserInfo)
	if val != nil {
		if info, ok := val.(*UserAuthInfo); ok {
			return info
		}
	}
	uID := GetCurrentUserID(ctx)
	if uID != nil {
		return &UserAuthInfo{
			ID:       1,
			Username: *uID,
			IsAdmin:  true,
		}
	}
	return nil
}

func SetCurrentUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, contextUser, userID)
}

// GetCurrentUserID gets the current user id from the provided context
func GetCurrentUserID(ctx context.Context) *string {
	userCtxVal := ctx.Value(contextUser)
	if userCtxVal != nil {
		currentUser := userCtxVal.(string)
		return &currentUser
	}

	return nil
}

func (s *Store) AuthenticateUserInfo(w http.ResponseWriter, r *http.Request) (info *UserAuthInfo, err error) {
	c := s.config

	apiKey := r.Header.Get(ApiKeyHeader)
	if apiKey == "" {
		apiKey = r.URL.Query().Get(ApiKeyParameter)
	}

	if apiKey != "" {
		if c.GetAPIKey() != apiKey {
			return nil, ErrUnauthorized
		}

		return &UserAuthInfo{
			ID:       1,
			Username: c.GetUsername(),
			IsAdmin:  true,
		}, nil
	}

	return s.GetSessionUserInfo(w, r)
}

func (s *Store) Authenticate(w http.ResponseWriter, r *http.Request) (userID string, err error) {
	info, err := s.AuthenticateUserInfo(w, r)
	if err != nil || info == nil {
		return "", err
	}
	return info.Username, nil
}
