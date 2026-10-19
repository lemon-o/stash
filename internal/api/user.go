package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/stashapp/stash/internal/manager"
	"github.com/stashapp/stash/pkg/session"
)

func (s *Server) getUserRoutes() chi.Router {
	r := chi.NewRouter()

	r.Get("/", s.handleListUsers)
	r.Get("/current", s.handleGetCurrentUser)
	r.Post("/", s.handleCreateUser)
	r.Delete("/{id}", s.handleDeleteUser)
	r.Post("/{id}/password", s.handleChangeUserPassword)

	return r
}

func (s *Server) handleGetCurrentUser(w http.ResponseWriter, r *http.Request) {
	userInfo := session.GetCurrentUserInfo(r.Context())
	if userInfo == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(userInfo)
}

func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	userInfo := session.GetCurrentUserInfo(r.Context())
	if userInfo == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	mgr := manager.GetInstance()
	if mgr.UserStore == nil {
		// Fallback to single user if store not ready
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]*session.UserAuthInfo{userInfo})
		return
	}

	// Regular users only see themselves
	if !userInfo.IsAdmin {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]*session.UserAuthInfo{userInfo})
		return
	}

	users, err := mgr.UserStore.ListAll(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(users)
}

type createUserInput struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (s *Server) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	userInfo := session.GetCurrentUserInfo(r.Context())
	if userInfo == nil || !userInfo.IsAdmin {
		http.Error(w, "Forbidden: Only administrator can create new accounts", http.StatusForbidden)
		return
	}

	var input createUserInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	input.Username = strings.TrimSpace(input.Username)
	if input.Username == "" || input.Password == "" {
		http.Error(w, "Username and password cannot be empty", http.StatusBadRequest)
		return
	}

	mgr := manager.GetInstance()
	if mgr.UserStore == nil {
		http.Error(w, "User storage not initialized", http.StatusInternalServerError)
		return
	}

	u, err := mgr.UserStore.Create(r.Context(), input.Username, input.Password)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(u)
}

func (s *Server) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	userInfo := session.GetCurrentUserInfo(r.Context())
	if userInfo == nil || !userInfo.IsAdmin {
		http.Error(w, "Forbidden: Only administrator can delete accounts", http.StatusForbidden)
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	if id == 1 {
		http.Error(w, "Forbidden: Cannot delete primary administrator account", http.StatusBadRequest)
		return
	}


	mgr := manager.GetInstance()
	if mgr.UserStore == nil {
		http.Error(w, "User storage not initialized", http.StatusInternalServerError)
		return
	}

	if err := mgr.UserStore.Delete(r.Context(), id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

type changePasswordInput struct {
	Password string `json:"password"`
}

func (s *Server) handleChangeUserPassword(w http.ResponseWriter, r *http.Request) {
	userInfo := session.GetCurrentUserInfo(r.Context())
	if userInfo == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	idStr := chi.URLParam(r, "id")
	targetID, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	// Only admin or the user themselves can change password
	if !userInfo.IsAdmin && targetID != userInfo.ID {
		http.Error(w, "Forbidden: You cannot change another user's password", http.StatusForbidden)
		return
	}

	var input changePasswordInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if input.Password == "" {
		http.Error(w, "Password cannot be empty", http.StatusBadRequest)
		return
	}

	mgr := manager.GetInstance()
	if mgr.UserStore == nil {
		http.Error(w, "User storage not initialized", http.StatusInternalServerError)
		return
	}

	if err := mgr.UserStore.UpdatePassword(r.Context(), targetID, input.Password); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
}
