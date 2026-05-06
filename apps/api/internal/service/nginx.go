package service

import (
	"bufio"
	"bytes"
	"fmt"
	"regexp"
	"strings"

	"github.com/ghulammuzz/zzpeo/api/internal/model"
	appssh "github.com/ghulammuzz/zzpeo/api/internal/ssh"
)

// NginxBlock holds the parsed fields from a single nginx server {} block.
type NginxBlock struct {
	ServerNames []string `json:"server_names"`
	Listen      []string `json:"listen"`
	RootDir     *string  `json:"root_dir,omitempty"`
	ProxyPass   *string  `json:"proxy_pass,omitempty"`
	SSLEnabled  bool     `json:"ssl_enabled"`
}

// ReadNginxConfig connects to server, reads all active nginx site configs, and
// returns a slice of parsed NginxBlock values.
func ReadNginxConfig(server *model.Server, ks *appssh.KeyStore) ([]NginxBlock, error) {
	client, err := appssh.NewClientFromServer(server, ks)
	if err != nil {
		return nil, err
	}
	defer client.Close()

	// Try sites-enabled first, then conf.d as a fallback.
	output, err := runSSHCommand(client,
		"cat /etc/nginx/sites-enabled/* 2>/dev/null || cat /etc/nginx/conf.d/* 2>/dev/null",
	)
	if err != nil {
		return nil, err
	}

	return parseNginxConfig(output), nil
}

// ListNginxConfigFiles returns absolute paths of all regular files and symlinks
// in /etc/nginx/sites-enabled and /etc/nginx/conf.d on the server.
// Uses `find` to avoid ls alias issues (e.g. trailing @ on symlinks).
func ListNginxConfigFiles(server *model.Server, ks *appssh.KeyStore) ([]string, error) {
	client, err := appssh.NewClientFromServer(server, ks)
	if err != nil {
		return nil, err
	}
	defer client.Close()

	// -maxdepth 1 avoids recursing into sub-dirs; \( -type f -o -type l \) gets
	// both regular files and symlinks (sites-enabled entries are symlinks).
	const cmd = `find /etc/nginx/sites-enabled /etc/nginx/conf.d \
		-maxdepth 1 \( -type f -o -type l \) 2>/dev/null | sort`
	out, _ := runSSHCommand(client, cmd)

	var paths []string
	for _, line := range strings.Split(out, "\n") {
		p := strings.TrimSpace(line)
		if p != "" {
			paths = append(paths, p)
		}
	}
	return paths, nil
}

// ReadNginxFile returns the raw content of a specific config file path.
func ReadNginxFile(server *model.Server, ks *appssh.KeyStore, filePath string) (string, error) {
	client, err := appssh.NewClientFromServer(server, ks)
	if err != nil {
		return "", err
	}
	defer client.Close()

	content, err := runSSHCommand(client, "cat "+filePath)
	if err != nil {
		return "", fmt.Errorf("read %s: %w", filePath, err)
	}
	return content, nil
}

// NginxTestResult holds the output and success flag from `nginx -t`.
type NginxTestResult struct {
	Output  string `json:"output"`
	Success bool   `json:"success"`
}

// WriteNginxConfig writes content to filePath on the server, tests the config,
// and reloads nginx if the test passes. Returns the test output.
func WriteNginxConfig(server *model.Server, ks *appssh.KeyStore, filePath, content string) (*NginxTestResult, error) {
	client, err := appssh.NewClientFromServer(server, ks)
	if err != nil {
		return nil, err
	}
	defer client.Close()

	if err := client.WriteFile(filePath, content); err != nil {
		return nil, fmt.Errorf("write config: %w", err)
	}

	// nginx -t writes to stderr; RunCommand captures stderr too.
	testOut, testErr := runSSHCommand(client, "nginx -t 2>&1")
	result := &NginxTestResult{Output: testOut, Success: testErr == nil}

	if testErr != nil {
		return result, nil // return test output without error so caller can show it
	}

	// Test passed — reload.
	_, _ = runSSHCommand(client, "nginx -s reload 2>&1")
	return result, nil
}

// runSSHCommand runs a single command on the SSH client and returns combined output.
func runSSHCommand(client *appssh.Client, cmd string) (string, error) {
	var buf bytes.Buffer
	if err := client.RunCommand(cmd, &buf); err != nil {
		return "", err
	}
	return buf.String(), nil
}

var (
	// reServerBlock matches a server { ... } block with up to 3 levels of brace nesting
	// (server > location > if), which covers typical Certbot-managed configs.
	reServerBlock = regexp.MustCompile(`(?s)server\s*\{([^{}]*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}[^{}]*)*)\}`)
	reServerName  = regexp.MustCompile(`server_name\s+([^;]+);`)
	reListen      = regexp.MustCompile(`listen\s+([^;]+);`)
	reRoot        = regexp.MustCompile(`root\s+([^;]+);`)
	reProxyPass   = regexp.MustCompile(`proxy_pass\s+([^;]+);`)
)

// parseNginxConfig extracts NginxBlock values from raw nginx config text.
func parseNginxConfig(content string) []NginxBlock {
	var blocks []NginxBlock

	matches := reServerBlock.FindAllStringSubmatch(content, -1)
	for _, m := range matches {
		body := m[1]
		nb := NginxBlock{}

		if sm := reServerName.FindStringSubmatch(body); sm != nil {
			for _, name := range strings.Fields(sm[1]) {
				nb.ServerNames = append(nb.ServerNames, name)
			}
		}

		for _, lm := range reListen.FindAllStringSubmatch(body, -1) {
			nb.Listen = append(nb.Listen, strings.TrimSpace(lm[1]))
		}

		for _, listen := range nb.Listen {
			if strings.Contains(listen, "ssl") {
				nb.SSLEnabled = true
				break
			}
		}

		if rm := reRoot.FindStringSubmatch(body); rm != nil {
			v := strings.TrimSpace(rm[1])
			nb.RootDir = &v
		}

		if pm := reProxyPass.FindStringSubmatch(body); pm != nil {
			v := strings.TrimSpace(pm[1])
			nb.ProxyPass = &v
		}

		// Skip pure redirect/catch-all blocks (Certbot HTTP→HTTPS) — no proxy_pass and no root.
		if nb.ProxyPass == nil && nb.RootDir == nil {
			continue
		}

		blocks = append(blocks, nb)
	}
	return blocks
}

// scanNginxLines iterates over each line of nginx config content.
// Exported for use by callers that need line-level processing.
func scanNginxLines(content string, fn func(string)) {
	scanner := bufio.NewScanner(strings.NewReader(content))
	for scanner.Scan() {
		fn(scanner.Text())
	}
}
