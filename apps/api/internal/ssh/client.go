package ssh

import (
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/ghulammuzz/zzpeo/api/internal/model"
	gossh "golang.org/x/crypto/ssh"
)

// Client wraps a golang.org/x/crypto/ssh.Client.
type Client struct {
	sshClient     *gossh.Client
	keepaliveDone chan struct{}
	closeOnce     sync.Once
}

// NewClientFromServer dials the SSH server described by s, verifying the host
// fingerprint stored on the model (TOFU: fingerprint must already be set).
func NewClientFromServer(s *model.Server, ks *KeyStore) (*Client, error) {
	authMethod, err := buildAuthMethod(s, ks)
	if err != nil {
		return nil, err
	}

	hostKeyCallback := func(hostname string, remote net.Addr, key gossh.PublicKey) error {
		fp := fingerprint(key)
		if s.Fingerprint == nil || *s.Fingerprint == "" {
			return fmt.Errorf(
				"fingerprint not set: run test-connection first to confirm the host (got: %s)", fp,
			)
		}
		if *s.Fingerprint != fp {
			return fmt.Errorf("SSH host key mismatch: expected %s, got %s", *s.Fingerprint, fp)
		}
		return nil
	}

	config := &gossh.ClientConfig{
		User:            s.User,
		Auth:            []gossh.AuthMethod{authMethod},
		HostKeyCallback: hostKeyCallback,
		Timeout:         15 * time.Second,
	}

	addr := fmt.Sprintf("%s:%d", s.Host, s.Port)
	client, err := gossh.Dial("tcp", addr, config)
	if err != nil {
		return nil, fmt.Errorf("SSH dial failed: %w", err)
	}
	c := &Client{
		sshClient:     client,
		keepaliveDone: make(chan struct{}),
	}
	go c.keepalive()
	return c, nil
}

// keepalive sends periodic no-op requests so NAT mappings and firewalls do not
// drop the connection during long-running commands (e.g. docker build).
func (c *Client) keepalive() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			// "keepalive@openssh.com" is recognised by OpenSSH; other servers
			// may ignore it — either way the TCP traffic keeps the NAT alive.
			_, _, _ = c.sshClient.SendRequest("keepalive@openssh.com", true, nil)
		case <-c.keepaliveDone:
			return
		}
	}
}

// TestConnection dials the server without fingerprint verification, captures
// the presented fingerprint, and measures the round-trip latency. The caller
// may then persist the fingerprint after user confirmation (TOFU flow).
func TestConnection(s *model.Server, ks *KeyStore) (fp string, latency time.Duration, err error) {
	authMethod, err := buildAuthMethod(s, ks)
	if err != nil {
		return "", 0, err
	}

	var capturedFP string
	config := &gossh.ClientConfig{
		User: s.User,
		Auth: []gossh.AuthMethod{authMethod},
		HostKeyCallback: func(hostname string, remote net.Addr, key gossh.PublicKey) error {
			capturedFP = fingerprint(key)
			return nil
		},
		Timeout: 15 * time.Second,
	}

	addr := fmt.Sprintf("%s:%d", s.Host, s.Port)
	start := time.Now()
	client, err := gossh.Dial("tcp", addr, config)
	latency = time.Since(start)
	if err != nil {
		return "", latency, fmt.Errorf("SSH dial failed: %w", err)
	}
	client.Close()
	return capturedFP, latency, nil
}

// Close stops the keepalive goroutine and closes the underlying SSH connection.
func (c *Client) Close() error {
	c.closeOnce.Do(func() { close(c.keepaliveDone) })
	return c.sshClient.Close()
}

// RunCaptured executes a single command in workdir (optionally as runAsUser)
// and returns combined stdout+stderr as a string. A non-zero exit is returned
// as an error but the partial output is still available to the caller.
func (c *Client) RunCaptured(workdir, runAsUser, cmd string) (string, error) {
	session, err := c.sshClient.NewSession()
	if err != nil {
		return "", fmt.Errorf("new session: %w", err)
	}
	defer session.Close()
	var buf strings.Builder
	session.Stdout = &buf
	session.Stderr = &buf
	fullCmd := buildFullCmd(workdir, runAsUser, cmd)
	err = session.Run(fullCmd)
	return buf.String(), err
}

// RunCommand executes a single command on the remote host and writes combined
// stdout + stderr to w. Returns an error if the command exits non-zero.
func (c *Client) RunCommand(cmd string, w io.Writer) error {
	session, err := c.sshClient.NewSession()
	if err != nil {
		return fmt.Errorf("new session: %w", err)
	}
	defer session.Close()
	session.Stdout = w
	session.Stderr = w
	if err := session.Run(cmd); err != nil {
		return fmt.Errorf("run command [%s]: %w", cmd, err)
	}
	return nil
}

// WriteFile writes content to a remote file path via `cat >`.
// The remote directory must already exist.
func (c *Client) WriteFile(remotePath, content string) error {
	session, err := c.sshClient.NewSession()
	if err != nil {
		return fmt.Errorf("new session: %w", err)
	}
	defer session.Close()
	session.Stdin = strings.NewReader(content)
	var errBuf strings.Builder
	session.Stderr = &errBuf
	if err := session.Run("cat > " + remotePath); err != nil {
		return fmt.Errorf("write file %s: %s: %w", remotePath, errBuf.String(), err)
	}
	return nil
}

// buildAuthMethod selects the correct gossh.AuthMethod based on the server's
// AuthType and decrypts the stored credential blob.
func buildAuthMethod(s *model.Server, ks *KeyStore) (gossh.AuthMethod, error) {
	switch s.AuthType {
	case "key":
		if len(s.SSHKeyEnc) == 0 {
			return nil, fmt.Errorf("ssh_key_enc is empty")
		}
		pemBytes, err := ks.Decrypt(s.SSHKeyEnc, s.ID)
		if err != nil {
			return nil, fmt.Errorf("decrypt ssh key: %w", err)
		}

		signer, err := gossh.ParsePrivateKey(pemBytes)
		if err != nil {
			// Key is passphrase-protected — try with passphrase if we have one.
			var missingErr *gossh.PassphraseMissingError
			if errors.As(err, &missingErr) {
				if len(s.KeyPassphraseEnc) == 0 {
					return nil, fmt.Errorf("private key is passphrase-protected but no passphrase was provided")
				}
				passphrase, decErr := ks.Decrypt(s.KeyPassphraseEnc, s.ID)
				if decErr != nil {
					return nil, fmt.Errorf("decrypt key passphrase: %w", decErr)
				}
				signer, err = gossh.ParsePrivateKeyWithPassphrase(pemBytes, passphrase)
				if err != nil {
					return nil, fmt.Errorf("parse private key with passphrase: %w", err)
				}
			} else {
				return nil, fmt.Errorf("parse private key: %w", err)
			}
		}
		return gossh.PublicKeys(signer), nil

	case "password":
		if len(s.PasswordEnc) == 0 {
			return nil, fmt.Errorf("password_enc is empty")
		}
		pass, err := ks.Decrypt(s.PasswordEnc, s.ID)
		if err != nil {
			return nil, fmt.Errorf("decrypt password: %w", err)
		}
		return gossh.Password(string(pass)), nil

	default:
		return nil, fmt.Errorf("unknown auth_type: %s", s.AuthType)
	}
}

// TestRawConnection dials a host with raw (unencrypted) credentials — used to
// verify SSH access before a server record is created in the database.
func TestRawConnection(host string, port int, user, authType, sshKey, password, passphrase string) (fp string, latency time.Duration, err error) {
	var authMethod gossh.AuthMethod
	switch authType {
	case "key":
		pemBytes := []byte(sshKey)
		signer, parseErr := gossh.ParsePrivateKey(pemBytes)
		if parseErr != nil {
			var missingErr *gossh.PassphraseMissingError
			if errors.As(parseErr, &missingErr) && passphrase != "" {
				signer, parseErr = gossh.ParsePrivateKeyWithPassphrase(pemBytes, []byte(passphrase))
				if parseErr != nil {
					return "", 0, fmt.Errorf("parse private key with passphrase: %w", parseErr)
				}
			} else {
				return "", 0, fmt.Errorf("parse private key: %w", parseErr)
			}
		}
		authMethod = gossh.PublicKeys(signer)
	case "password":
		authMethod = gossh.Password(password)
	default:
		return "", 0, fmt.Errorf("unsupported auth_type for test: %s", authType)
	}

	var capturedFP string
	config := &gossh.ClientConfig{
		User: user,
		Auth: []gossh.AuthMethod{authMethod},
		HostKeyCallback: func(_ string, _ net.Addr, key gossh.PublicKey) error {
			capturedFP = fingerprint(key)
			return nil
		},
		Timeout: 15 * time.Second,
	}

	addr := fmt.Sprintf("%s:%d", host, port)
	start := time.Now()
	client, dialErr := gossh.Dial("tcp", addr, config)
	latency = time.Since(start)
	if dialErr != nil {
		return "", latency, fmt.Errorf("SSH dial failed: %w", dialErr)
	}
	client.Close()
	return capturedFP, latency, nil
}

// fingerprint returns a "SHA256:<base64>" string matching the OpenSSH format.
func fingerprint(key gossh.PublicKey) string {
	hash := sha256.Sum256(key.Marshal())
	return "SHA256:" + base64.StdEncoding.EncodeToString(hash[:])
}
