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

// Application holds the fields we need from Dokploy's application.one response.
type Application struct {
	AppName       string `json:"appName"`
	ContainerName string `json:"containerName"`
}

// GetApplication returns basic info for an application by ID.
func (c *Client) GetApplication(ctx context.Context, applicationID string) (*Application, error) {
	data, status, err := c.do(ctx, http.MethodGet,
		"/api/application.one?applicationId="+applicationID, nil)
	if err != nil {
		return nil, err
	}
	if status >= 400 {
		return nil, fmt.Errorf("application.one returned HTTP %d: %s", status, string(data))
	}
	var app Application
	if err := json.Unmarshal(data, &app); err != nil {
		return nil, fmt.Errorf("parse application: %w", err)
	}
	return &app, nil
}

// Container is a Docker container as returned by docker.getContainers.
type Container struct {
	ID    string   `json:"Id"`
	Names []string `json:"Names"` // e.g. ["/shortie-webhook-csxlc3.1.abc123"]
}

// GetContainers returns all running containers from the Dokploy instance.
func (c *Client) GetContainers(ctx context.Context) ([]Container, error) {
	data, status, err := c.do(ctx, http.MethodGet, "/api/docker.getContainers", nil)
	if err != nil {
		return nil, err
	}
	if status >= 400 {
		return nil, fmt.Errorf("docker.getContainers returned HTTP %d: %s", status, string(data))
	}
	var containers []Container
	if err := json.Unmarshal(data, &containers); err != nil {
		return nil, fmt.Errorf("parse containers: %w", err)
	}
	return containers, nil
}

// FindContainerID lists all containers and returns the ID of the first one
// whose name starts with prefix (Docker Swarm names the task container
// "<service_name>.<replica>.<task_id>", so prefix = app/service name).
func (c *Client) FindContainerID(ctx context.Context, prefix string) (string, string, error) {
	containers, err := c.GetContainers(ctx)
	if err != nil {
		return "", "", err
	}
	for _, ct := range containers {
		for _, name := range ct.Names {
			// Docker prepends "/" to container names.
			clean := strings.TrimPrefix(name, "/")
			if clean == prefix || strings.HasPrefix(clean, prefix+".") || strings.HasPrefix(clean, prefix+"_") {
				return ct.ID, clean, nil
			}
		}
	}
	return "", "", fmt.Errorf("no running container found with name prefix %q", prefix)
}

// ContainerLogs holds a raw log string from Dokploy's docker log endpoint.
type ContainerLogs struct {
	Logs string `json:"logs"`
}

// GetContainerLogs fetches recent logs for a container by its ID.
func (c *Client) GetContainerLogs(ctx context.Context, containerID string, tail int) (string, error) {
	path := fmt.Sprintf("/api/docker.getContainerLogs?containerId=%s&tail=%d", containerID, tail)
	data, status, err := c.do(ctx, http.MethodGet, path, nil)
	if err != nil {
		return "", err
	}
	if status >= 400 {
		return "", fmt.Errorf("docker.getContainerLogs returned HTTP %d: %s", status, string(data))
	}
	// Response may be {"logs":"..."} or raw text.
	var cl ContainerLogs
	if json.Unmarshal(data, &cl) == nil && cl.Logs != "" {
		return cl.Logs, nil
	}
	return strings.TrimSpace(string(data)), nil
}

// StreamContainerLogs resolves the running container for applicationID via the
// Dokploy API (listing containers and prefix-matching against the app name),
// then polls container logs every 2 s and calls onLine for each new line.
// Blocks until ctx is cancelled.
func (c *Client) StreamContainerLogs(ctx context.Context, applicationID string, tail int, onLine func(string)) error {
	app, err := c.GetApplication(ctx, applicationID)
	if err != nil {
		return fmt.Errorf("resolve application: %w", err)
	}

	// appName is the Dokploy/Swarm service name prefix used to match the container.
	appName := app.AppName
	if appName == "" {
		appName = app.ContainerName
	}
	if appName == "" {
		return fmt.Errorf("dokploy: could not resolve app name for application %s", applicationID)
	}

	// Resolve the full Docker container ID by listing containers and prefix-matching.
	containerID, fullName, err := c.FindContainerID(ctx, appName)
	if err != nil {
		return fmt.Errorf("find container: %w", err)
	}
	onLine(fmt.Sprintf("// container: %s", fullName))

	// Fetch initial batch.
	prev, err := c.GetContainerLogs(ctx, containerID, tail)
	if err != nil {
		onLine(fmt.Sprintf("// log fetch error: %v", err))
		prev = ""
	} else {
		for _, line := range strings.Split(prev, "\n") {
			line = strings.TrimRight(line, "\r")
			if line != "" {
				onLine(line)
			}
		}
	}
	seenLen := len(prev)

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}

		logs, err := c.GetContainerLogs(ctx, containerID, tail)
		if err != nil {
			onLine(fmt.Sprintf("// poll error: %v", err))
			continue
		}
		if len(logs) > seenLen {
			newPart := logs[seenLen:]
			for _, line := range strings.Split(newPart, "\n") {
				line = strings.TrimRight(line, "\r")
				if line != "" {
					onLine(line)
				}
			}
			seenLen = len(logs)
		}
	}
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
