package handler

import (
	"errors"

	"github.com/ghulammuzz/zzpeo/api/internal/model"
	"github.com/ghulammuzz/zzpeo/api/internal/repository"
	appssh "github.com/ghulammuzz/zzpeo/api/internal/ssh"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ServerHandler handles all server-related routes.
type ServerHandler struct {
	repo repository.ServerRepo
	ks   *appssh.KeyStore
}

// NewServerHandler wires up a ServerHandler with the given repo.
func NewServerHandler(repo repository.ServerRepo, ks *appssh.KeyStore) *ServerHandler {
	return &ServerHandler{repo: repo, ks: ks}
}

// List handles GET /environments/:envId/servers
func (h *ServerHandler) List(c *fiber.Ctx) error {
	envID, err := uuid.Parse(c.Params("envId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid environment id"})
	}

	servers, err := h.repo.List(c.Context(), envID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if servers == nil {
		servers = []model.Server{}
	}
	return c.JSON(servers)
}

type createServerRequest struct {
	Name       string `json:"name"`
	Host       string `json:"host"`
	Port       int    `json:"port"`
	User       string `json:"user"`
	AuthType   string `json:"auth_type"`  // "key" | "password"
	SSHKey     string `json:"ssh_key"`    // PEM private key (plain text)
	Passphrase string `json:"passphrase"` // optional passphrase for encrypted key
	Password   string `json:"password"`   // plain text SSH password
}

// Create handles POST /environments/:envId/servers
// Credentials are encrypted with AES-256-GCM using the DB-generated server UUID
// as the HKDF record salt (two-step: insert → get ID → encrypt → update).
func (h *ServerHandler) Create(c *fiber.Ctx) error {
	envID, err := uuid.Parse(c.Params("envId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid environment id"})
	}

	var req createServerRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if req.Name == "" || req.Host == "" || req.AuthType == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name, host, and auth_type are required"})
	}
	if req.AuthType != "dokploy" && req.User == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "user is required for SSH servers"})
	}
	if req.Port == 0 {
		req.Port = 22
	}
	// Dokploy servers default to port 3000.
	if req.AuthType == "dokploy" && req.Port == 22 {
		req.Port = 3000
	}

	// Reject duplicate host within the same environment.
	exists, err := h.repo.ExistsByHost(c.Context(), envID, req.Host, nil)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if exists {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "this ip is already registered"})
	}

	// Validate credential fields before touching the DB.
	switch req.AuthType {
	case "key":
		if req.SSHKey == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ssh_key is required for auth_type=key"})
		}
	case "password":
		if req.Password == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "password is required for auth_type=password"})
		}
	case "dokploy":
		if req.Password == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "password (API token) is required for auth_type=dokploy"})
		}
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "auth_type must be 'key', 'password', or 'dokploy'"})
	}

	// Step 1: Insert the server record without credentials to obtain its DB-generated UUID.
	srv, err := h.repo.Create(c.Context(), repository.CreateServerInput{
		EnvironmentID: envID,
		Name:          req.Name,
		Host:          req.Host,
		Port:          req.Port,
		User:          req.User,
		AuthType:      req.AuthType,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Step 2: Encrypt credentials using the real server UUID as the HKDF salt.
	var sshKeyEnc, passwordEnc, keyPassphraseEnc []byte
	switch req.AuthType {
	case "key":
		sshKeyEnc, err = h.ks.Encrypt([]byte(req.SSHKey), srv.ID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to encrypt ssh key"})
		}
		if req.Passphrase != "" {
			keyPassphraseEnc, err = h.ks.Encrypt([]byte(req.Passphrase), srv.ID)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to encrypt passphrase"})
			}
		}
	case "password", "dokploy":
		// Dokploy stores its API token in the same password_enc column.
		passwordEnc, err = h.ks.Encrypt([]byte(req.Password), srv.ID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to encrypt password"})
		}
		// Dokploy servers may optionally provide an SSH key for log streaming.
		if req.SSHKey != "" {
			sshKeyEnc, err = h.ks.Encrypt([]byte(req.SSHKey), srv.ID)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to encrypt ssh key"})
			}
		}
	}

	// Step 3: Update the server row with the encrypted credential blobs.
	srv, err = h.repo.Update(c.Context(), srv.ID, repository.UpdateServerInput{
		Name:             srv.Name,
		Host:             srv.Host,
		Port:             srv.Port,
		User:             srv.User,
		AuthType:         srv.AuthType,
		SSHKeyEnc:        sshKeyEnc,
		PasswordEnc:      passwordEnc,
		KeyPassphraseEnc: keyPassphraseEnc,
		Fingerprint:      srv.Fingerprint,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(srv)
}

// GetByID handles GET /environments/:envId/servers/:serverId
func (h *ServerHandler) GetByID(c *fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("serverId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server id"})
	}

	srv, err := h.repo.GetByID(c.Context(), serverID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "server not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(srv)
}

type updateServerRequest struct {
	Name       string `json:"name"`
	Host       string `json:"host"`
	Port       int    `json:"port"`
	User       string `json:"user"`
	AuthType   string `json:"auth_type"`
	SSHKey     string `json:"ssh_key"`    // optional — provide to replace existing key
	Passphrase string `json:"passphrase"` // optional — provide to replace existing passphrase
	Password   string `json:"password"`   // optional — provide to replace existing password
}

// Update handles PATCH /environments/:envId/servers/:serverId
func (h *ServerHandler) Update(c *fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("serverId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server id"})
	}

	var req updateServerRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	// Fetch existing server (with credentials) so we can preserve them if not replaced.
	existing, err := h.repo.GetByIDWithCredentials(c.Context(), serverID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "server not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	sshKeyEnc := existing.SSHKeyEnc
	passwordEnc := existing.PasswordEnc
	keyPassphraseEnc := existing.KeyPassphraseEnc

	if req.SSHKey != "" {
		sshKeyEnc, err = h.ks.Encrypt([]byte(req.SSHKey), serverID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to encrypt ssh key"})
		}
	}
	if req.Passphrase != "" {
		keyPassphraseEnc, err = h.ks.Encrypt([]byte(req.Passphrase), serverID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to encrypt passphrase"})
		}
	}
	if req.Password != "" {
		passwordEnc, err = h.ks.Encrypt([]byte(req.Password), serverID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to encrypt password"})
		}
	}

	port := req.Port
	if port == 0 {
		port = existing.Port
	}

	// Use empty strings from req as-is; if caller omits them, they'll replace existing values.
	name := req.Name
	if name == "" {
		name = existing.Name
	}
	host := req.Host
	if host == "" {
		host = existing.Host
	}
	user := req.User
	if user == "" {
		user = existing.User
	}
	authType := req.AuthType
	if authType == "" {
		authType = existing.AuthType
	}

	srv, err := h.repo.Update(c.Context(), serverID, repository.UpdateServerInput{
		Name:             name,
		Host:             host,
		Port:             port,
		User:             user,
		AuthType:         authType,
		SSHKeyEnc:        sshKeyEnc,
		PasswordEnc:      passwordEnc,
		KeyPassphraseEnc: keyPassphraseEnc,
		Fingerprint:      existing.Fingerprint,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "server not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(srv)
}

// Delete handles DELETE /environments/:envId/servers/:serverId
func (h *ServerHandler) Delete(c *fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("serverId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server id"})
	}

	if err := h.repo.Delete(c.Context(), serverID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "server not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

type testConnectionRequest struct {
	Confirm bool `json:"confirm"` // if true, persist the fingerprint in DB
}

// TestConnection handles POST /environments/:envId/servers/:serverId/test-connection
// Dials the server, captures its fingerprint, and optionally persists it (TOFU).
func (h *ServerHandler) TestConnection(c *fiber.Ctx) error {
	serverID, err := uuid.Parse(c.Params("serverId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid server id"})
	}

	var req testConnectionRequest
	// Body is optional — ignore parse errors
	_ = c.BodyParser(&req)

	// Need decrypted credentials for the test dial.
	srv, err := h.repo.GetByIDWithCredentials(c.Context(), serverID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "server not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Dokploy servers use HTTP API — no SSH test.
	if srv.AuthType == "dokploy" {
		return c.JSON(fiber.Map{
			"fingerprint": "dokploy-api",
			"latency_ms":  0,
			"confirmed":   false,
		})
	}

	fp, latency, err := appssh.TestConnection(srv, h.ks)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
	}

	if req.Confirm {
		if err := h.repo.UpdateFingerprint(c.Context(), serverID, fp); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save fingerprint"})
		}
	}

	return c.JSON(fiber.Map{
		"fingerprint": fp,
		"latency_ms":  latency.Milliseconds(),
		"confirmed":   req.Confirm,
	})
}

type testRawSSHRequest struct {
	Host       string `json:"host"`
	Port       int    `json:"port"`
	User       string `json:"user"`
	AuthType   string `json:"auth_type"`
	SSHKey     string `json:"ssh_key"`
	Password   string `json:"password"`
	Passphrase string `json:"passphrase"`
}

// TestRawSSH handles POST /servers/test-ssh
// Tests SSH connectivity with raw (unencrypted) credentials before a server is created.
func (h *ServerHandler) TestRawSSH(c *fiber.Ctx) error {
	var req testRawSSHRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if req.Host == "" || req.User == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "host and user are required"})
	}
	if req.Port == 0 {
		req.Port = 22
	}

	fp, latency, err := appssh.TestRawConnection(req.Host, req.Port, req.User, req.AuthType, req.SSHKey, req.Password, req.Passphrase)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{
		"fingerprint": fp,
		"latency_ms":  latency.Milliseconds(),
	})
}
