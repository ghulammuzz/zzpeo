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

// TestConnection verifies the base URL is reachable and the API token is valid
// by calling docker.getContainers and returning the container count.
func (c *Client) TestConnection(ctx context.Context) (containerCount int, err error) {
	data, status, err := c.do(ctx, http.MethodGet, "/api/docker.getContainers", nil)
	if err != nil {
		return 0, fmt.Errorf("connection failed: %w", err)
	}
	if status == 401 {
		return 0, fmt.Errorf("invalid API token (HTTP 401)")
	}
	if status >= 400 {
		return 0, fmt.Errorf("Dokploy returned HTTP %d: %s", status, string(data))
	}
	var containers []Container
	if err := json.Unmarshal(data, &containers); err != nil {
		return 0, fmt.Errorf("unexpected response (not a Dokploy instance?): %w", err)
	}
	return len(containers), nil
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

	// Git source — populated depending on which provider is used.
	SourceType string `json:"sourceType"` // "git" | "docker" | etc.

	// Custom/SSH git
	CustomGitURL    string `json:"customGitUrl"`
	CustomGitBranch string `json:"customGitBranch"`

	// GitHub
	Repository string `json:"repository"`
	Owner      string `json:"owner"`
	Branch     string `json:"branch"`

	// GitLab
	GitlabBranch string `json:"gitlabBranch"`

	// Gitea
	GiteaBranch string `json:"giteaBranch"`

	// Bitbucket
	BitbucketBranch     string `json:"bitbucketBranch"`
	BitbucketRepository string `json:"bitbucketRepository"`
}

// GitInfo returns resolved branch name and git remote URL for an application.
func (a *Application) GitInfo() (branch, remote string) {
	// Priority: customGit > github > gitlab > gitea > bitbucket
	switch {
	case a.CustomGitBranch != "":
		branch = a.CustomGitBranch
		remote = a.CustomGitURL
	case a.Branch != "":
		branch = a.Branch
		if a.Owner != "" && a.Repository != "" {
			remote = "github.com/" + a.Owner + "/" + a.Repository
		}
	case a.GitlabBranch != "":
		branch = a.GitlabBranch
	case a.GiteaBranch != "":
		branch = a.GiteaBranch
	case a.BitbucketBranch != "":
		branch = a.BitbucketBranch
		remote = a.BitbucketRepository
	}
	return
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

// Container is a Docker container as returned by Dokploy's docker.getContainers.
// NOTE: Dokploy wraps Docker Engine API with its own field names.
type Container struct {
	ContainerID string `json:"containerId"` // short hash e.g. "d8b98486e3a4"
	Name        string `json:"name"`        // e.g. "shortie-webhook-csxlc3.1.gpvs2..."
	State       string `json:"state"`       // "running" | "exited" | ...
}

// GetContainers returns all containers from the Dokploy instance.
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

// FindContainerID lists running containers and returns (containerId, fullName) of
// the first one whose name matches prefix exactly or starts with "<prefix>." / "<prefix>_"
// (Docker Swarm task naming: "<service>.<replica>.<taskId>").
func (c *Client) FindContainerID(ctx context.Context, prefix string) (string, string, error) {
	containers, err := c.GetContainers(ctx)
	if err != nil {
		return "", "", err
	}
	for _, ct := range containers {
		if ct.State != "running" {
			continue
		}
		name := ct.Name
		if name == prefix ||
			strings.HasPrefix(name, prefix+".") ||
			strings.HasPrefix(name, prefix+"_") {
			return ct.ContainerID, name, nil
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
	onLine(fmt.Sprintf("// container: %s (id: %s)", fullName, containerID))

	// Fetch initial batch — note: docker.getContainerLogs returns 404 for Docker
	// Swarm task containers. Add an SSH key to this server to enable `docker service
	// logs` streaming which works for Swarm.
	prev, err := c.GetContainerLogs(ctx, containerID, tail)
	if err != nil {
		return fmt.Errorf("Dokploy API does not support log streaming for Docker Swarm containers.\n// Add an SSH key to this Dokploy server in zzpeo Settings → Edit Server → SSH Private Key.\n// Then log streaming will use `docker service logs %s` via SSH.", appName)
	}

	for _, line := range strings.Split(prev, "\n") {
		line = strings.TrimRight(line, "\r")
		if line != "" {
			onLine(line)
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
