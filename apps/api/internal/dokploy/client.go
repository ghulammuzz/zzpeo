package dokploy

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Client calls the Dokploy REST API with a Bearer token.
type Client struct {
	baseURL string
	token   string
	http    *http.Client
}

// NewClient creates a Dokploy API client.
// baseURL example: "https://dokploy.example.com" or "http://1.2.3.4:3000"
func NewClient(baseURL, token string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		token:   token,
		http:    &http.Client{Timeout: 30 * time.Second},
	}
}

// Deployment is a single Dokploy deployment record.
type Deployment struct {
	DeploymentID string `json:"deploymentId"`
	ApplicationID string `json:"applicationId"`
	Status       string `json:"status"` // "running" | "done" | "error"
	Log          string `json:"log"`
	CreatedAt    string `json:"createdAt"`
}

func (c *Client) do(ctx context.Context, method, path string, body any) ([]byte, int, error) {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, 0, fmt.Errorf("marshal: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bodyReader)
	if err != nil {
		return nil, 0, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("x-api-key", c.token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)
	return data, resp.StatusCode, nil
}

// TriggerDeploy triggers a new deployment for the given application.
func (c *Client) TriggerDeploy(ctx context.Context, applicationID string) error {
	_, status, err := c.do(ctx, http.MethodPost, "/api/application.deploy", map[string]string{
		"applicationId": applicationID,
	})
	if err != nil {
		return err
	}
	if status >= 400 {
		return fmt.Errorf("dokploy deploy returned HTTP %d", status)
	}
	return nil
}

// ListDeployments returns recent deployments for an application, newest first.
func (c *Client) ListDeployments(ctx context.Context, applicationID string) ([]Deployment, error) {
	data, status, err := c.do(ctx, http.MethodGet,
		"/api/deployment.all?applicationId="+applicationID, nil)
	if err != nil {
		return nil, err
	}
	if status >= 400 {
		return nil, fmt.Errorf("deployment.all returned HTTP %d: %s", status, string(data))
	}
	var deps []Deployment
	if err := json.Unmarshal(data, &deps); err != nil {
		return nil, fmt.Errorf("parse deployments: %w", err)
	}
	return deps, nil
}

// StreamDeployLogs triggers a deploy then polls the latest deployment's log,
// calling onLine for each new line. Blocks until the deploy finishes or ctx is done.
func (c *Client) StreamDeployLogs(ctx context.Context, applicationID string, onLine func(string)) error {
	if err := c.TriggerDeploy(ctx, applicationID); err != nil {
		return fmt.Errorf("trigger deploy: %w", err)
	}

	onLine("// Dokploy deploy triggered — waiting for deployment to start...")

	// Give Dokploy a moment to create the deployment record.
	select {
	case <-time.After(2 * time.Second):
	case <-ctx.Done():
		return ctx.Err()
	}

	var seenLines int
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}

		deps, err := c.ListDeployments(ctx, applicationID)
		if err != nil {
			onLine(fmt.Sprintf("// poll error: %v", err))
			continue
		}
		if len(deps) == 0 {
			continue
		}

		latest := deps[0] // newest first
		log := latest.Log

		// Stream only new lines since last poll.
		lines := strings.Split(log, "\n")
		for i := seenLines; i < len(lines); i++ {
			line := strings.TrimRight(lines[i], "\r")
			if line != "" {
				onLine(line)
			}
		}
		seenLines = len(lines)

		switch latest.Status {
		case "done":
			onLine("// ✓ Deployment completed successfully.")
			return nil
		case "error":
			return fmt.Errorf("dokploy deployment failed")
		}
		// "running" → keep polling
	}
}
