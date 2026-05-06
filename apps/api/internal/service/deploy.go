package service

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/ghulammuzz/zzpeo/api/internal/model"
)

// PHPDeployConfig describes a git-pull + composer / artisan style deploy.
type PHPDeployConfig struct {
	GitBranch    string   `json:"git_branch"`
	PostPullCmds []string `json:"post_pull_cmds"`
}

// PM2DeployConfig describes a Node.js app managed by PM2.
type PM2DeployConfig struct {
	GitBranch  string `json:"git_branch"`
	NpmInstall bool   `json:"npm_install"`
	BuildCmd   string `json:"build_cmd"`
	PM2AppName string `json:"pm2_app_name"`
}

// ShellDeployConfig runs an arbitrary script with optional arguments.
type ShellDeployConfig struct {
	ScriptPath string   `json:"script_path"`
	Args       []string `json:"args"`
}

// DockerDeployConfig builds and runs a Docker image, or uses Compose.
type DockerDeployConfig struct {
	BuildArgs     []string `json:"build_args"`
	ContainerName string   `json:"container_name"`
	RunArgs       []string `json:"run_args"`
	ComposeFile   string   `json:"compose_file"`
	Dockerfile    string   `json:"dockerfile"`
}

// DeployPlan holds the ordered commands for a deployment, split into three
// logical phases so the handler can stream them to separate log channels.
//
//   - Steps: build/start commands emitted as "build log" events.
//   - ContainerLogsCmd: `docker logs` — emitted as "container log" events.
//     Empty for non-Docker or Compose deployments.
//   - CheckCmd: final health check — emitted as "build log" events.
//     A non-zero exit marks the deployment as failed.
//     Empty for non-Docker or Compose deployments.
type DeployPlan struct {
	Steps            []string
	ContainerLogsCmd string
	CheckCmd         string
}

// ResolvedEnvVar is a decrypted service env var ready for injection into deploy commands.
type ResolvedEnvVar struct {
	Key        string
	Value      string
	DeployMode string // "build_arg" | "runtime" | "both" | "all"
}

// BuildDeployPlan translates a Service's DeployType + DeployConfig into a
// DeployPlan ready for execution. envVars are injected into Docker commands
// according to their DeployMode; pass nil for non-Docker types or when no vars exist.
func BuildDeployPlan(svc *model.Service, envVars []ResolvedEnvVar) (*DeployPlan, error) {
	switch svc.DeployType {
	case model.DeployPHP:
		var cfg PHPDeployConfig
		if err := json.Unmarshal(svc.DeployConfig, &cfg); err != nil {
			return nil, fmt.Errorf("parse php deploy config: %w", err)
		}
		cmds := []string{fmt.Sprintf("git pull origin %s", cfg.GitBranch)}
		return &DeployPlan{Steps: append(cmds, cfg.PostPullCmds...)}, nil

	case model.DeployPM2:
		var cfg PM2DeployConfig
		if err := json.Unmarshal(svc.DeployConfig, &cfg); err != nil {
			return nil, fmt.Errorf("parse pm2 deploy config: %w", err)
		}
		cmds := []string{fmt.Sprintf("git pull origin %s", cfg.GitBranch)}
		if cfg.NpmInstall {
			cmds = append(cmds, "npm install")
		}
		if cfg.BuildCmd != "" {
			cmds = append(cmds, cfg.BuildCmd)
		}
		return &DeployPlan{Steps: append(cmds, fmt.Sprintf("pm2 restart %s", cfg.PM2AppName))}, nil

	case model.DeployShell:
		var cfg ShellDeployConfig
		if err := json.Unmarshal(svc.DeployConfig, &cfg); err != nil {
			return nil, fmt.Errorf("parse shell deploy config: %w", err)
		}
		parts := append([]string{cfg.ScriptPath}, cfg.Args...)
		return &DeployPlan{Steps: []string{strings.Join(parts, " ")}}, nil

	case model.DeployDocker:
		var cfg DockerDeployConfig
		if err := json.Unmarshal(svc.DeployConfig, &cfg); err != nil {
			return nil, fmt.Errorf("parse docker deploy config: %w", err)
		}

		// Compose mode: single command, no separate log/check phases.
		if cfg.ComposeFile != "" {
			return &DeployPlan{
				Steps: []string{
					fmt.Sprintf("docker compose -f %s up -d --build", cfg.ComposeFile),
				},
			}, nil
		}

		// --- Direct image mode ---
		image := cfg.ContainerName + ":latest"

		buildCmd := "docker build"
		if cfg.Dockerfile != "" {
			buildCmd += fmt.Sprintf(" -f %s", cfg.Dockerfile)
		}
		if len(cfg.BuildArgs) > 0 {
			buildCmd += " " + strings.Join(cfg.BuildArgs, " ")
		}
		// Inject env vars with build_arg or both/all modes.
		for _, v := range envVars {
			if v.DeployMode == "build_arg" || v.DeployMode == "both" || v.DeployMode == "all" {
				buildCmd += fmt.Sprintf(" --build-arg %s=%s", v.Key, shellQuote(v.Value))
			}
		}
		buildCmd += fmt.Sprintf(" -t %s .", image)

		stopCmd := fmt.Sprintf("docker stop %s || true", cfg.ContainerName)
		rmCmd := fmt.Sprintf("docker rm %s || true", cfg.ContainerName)

		runCmd := fmt.Sprintf("docker run -d --name %s", cfg.ContainerName)
		if len(cfg.RunArgs) > 0 {
			runCmd += " " + strings.Join(cfg.RunArgs, " ")
		}
		// Inject env vars with runtime or both/all modes.
		for _, v := range envVars {
			if v.DeployMode == "runtime" || v.DeployMode == "both" || v.DeployMode == "all" {
				runCmd += fmt.Sprintf(" --env %s=%s", v.Key, shellQuote(v.Value))
			}
		}
		runCmd += " " + image

		return &DeployPlan{
			Steps: []string{buildCmd, stopCmd, rmCmd, runCmd, "sleep 10"},
			ContainerLogsCmd: fmt.Sprintf(
				"docker logs --tail 100 %s 2>&1 || true",
				cfg.ContainerName,
			),
			CheckCmd: fmt.Sprintf(
				"docker inspect -f '{{.State.Running}}' %s | grep -qx true",
				cfg.ContainerName,
			),
		}, nil
	}

	return nil, fmt.Errorf("unknown deploy_type: %s", svc.DeployType)
}

// shellQuote wraps a value in single quotes and escapes any embedded single quotes.
// Ensures values with spaces or special chars are safe for shell injection.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'"
}
