package service

import (
	"encoding/json"
	"testing"

	"github.com/ghulammuzz/zzpeo/api/internal/model"
)

func assertPlan(t *testing.T, got *DeployPlan, wantSteps []string, wantContainerLogsCmd, wantCheckCmd string) {
	t.Helper()
	if len(got.Steps) != len(wantSteps) {
		t.Fatalf("Steps len: got %d, want %d\n  got:  %v\n  want: %v", len(got.Steps), len(wantSteps), got.Steps, wantSteps)
	}
	for i := range wantSteps {
		if got.Steps[i] != wantSteps[i] {
			t.Errorf("Steps[%d]: got %q, want %q", i, got.Steps[i], wantSteps[i])
		}
	}
	if got.ContainerLogsCmd != wantContainerLogsCmd {
		t.Errorf("ContainerLogsCmd: got %q, want %q", got.ContainerLogsCmd, wantContainerLogsCmd)
	}
	if got.CheckCmd != wantCheckCmd {
		t.Errorf("CheckCmd: got %q, want %q", got.CheckCmd, wantCheckCmd)
	}
}

func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	return b
}

// ---------------------------------------------------------------------------
// PHP
// ---------------------------------------------------------------------------

func TestBuildDeployPlanPHP_Basic(t *testing.T) {
	cfg := PHPDeployConfig{GitBranch: "main", PostPullCmds: []string{"composer install", "php artisan migrate"}}
	svc := &model.Service{DeployType: model.DeployPHP, DeployConfig: mustJSON(t, cfg)}
	plan, err := BuildDeployPlan(svc, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertPlan(t, plan, []string{"git pull origin main", "composer install", "php artisan migrate"}, "", "")
}

func TestBuildDeployPlanPHP_NoPostCmds(t *testing.T) {
	cfg := PHPDeployConfig{GitBranch: "develop"}
	svc := &model.Service{DeployType: model.DeployPHP, DeployConfig: mustJSON(t, cfg)}
	plan, err := BuildDeployPlan(svc, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertPlan(t, plan, []string{"git pull origin develop"}, "", "")
}

// ---------------------------------------------------------------------------
// PM2
// ---------------------------------------------------------------------------

func TestBuildDeployPlanPM2_Full(t *testing.T) {
	cfg := PM2DeployConfig{GitBranch: "main", NpmInstall: true, BuildCmd: "npm run build", PM2AppName: "my-app"}
	svc := &model.Service{DeployType: model.DeployPM2, DeployConfig: mustJSON(t, cfg)}
	plan, err := BuildDeployPlan(svc, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertPlan(t, plan, []string{"git pull origin main", "npm install", "npm run build", "pm2 restart my-app"}, "", "")
}

func TestBuildDeployPlanPM2_NoBuild(t *testing.T) {
	cfg := PM2DeployConfig{GitBranch: "release", NpmInstall: false, PM2AppName: "api"}
	svc := &model.Service{DeployType: model.DeployPM2, DeployConfig: mustJSON(t, cfg)}
	plan, err := BuildDeployPlan(svc, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertPlan(t, plan, []string{"git pull origin release", "pm2 restart api"}, "", "")
}

func TestBuildDeployPlanPM2_NpmInstallNoBuildCmd(t *testing.T) {
	cfg := PM2DeployConfig{GitBranch: "main", NpmInstall: true, BuildCmd: "", PM2AppName: "worker"}
	svc := &model.Service{DeployType: model.DeployPM2, DeployConfig: mustJSON(t, cfg)}
	plan, err := BuildDeployPlan(svc, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertPlan(t, plan, []string{"git pull origin main", "npm install", "pm2 restart worker"}, "", "")
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

func TestBuildDeployPlanShell_WithArgs(t *testing.T) {
	cfg := ShellDeployConfig{ScriptPath: "./deploy.sh", Args: []string{"--env", "prod", "--force"}}
	svc := &model.Service{DeployType: model.DeployShell, DeployConfig: mustJSON(t, cfg)}
	plan, err := BuildDeployPlan(svc, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertPlan(t, plan, []string{"./deploy.sh --env prod --force"}, "", "")
}

func TestBuildDeployPlanShell_NoArgs(t *testing.T) {
	cfg := ShellDeployConfig{ScriptPath: "/opt/scripts/release.sh"}
	svc := &model.Service{DeployType: model.DeployShell, DeployConfig: mustJSON(t, cfg)}
	plan, err := BuildDeployPlan(svc, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertPlan(t, plan, []string{"/opt/scripts/release.sh"}, "", "")
}

// ---------------------------------------------------------------------------
// Docker — direct image mode
// ---------------------------------------------------------------------------

func TestBuildDeployPlanDocker_ImageMode(t *testing.T) {
	cfg := DockerDeployConfig{
		BuildArgs:     []string{"--no-cache", "--build-arg", "VERSION=1.2"},
		ContainerName: "myapp",
		RunArgs:       []string{"-p", "8080:8080"},
	}
	svc := &model.Service{DeployType: model.DeployDocker, DeployConfig: mustJSON(t, cfg)}
	plan, err := BuildDeployPlan(svc, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertPlan(t, plan,
		[]string{
			"docker build --no-cache --build-arg VERSION=1.2 -t myapp:latest .",
			"docker stop myapp || true",
			"docker rm myapp || true",
			"docker run -d --name myapp -p 8080:8080 myapp:latest",
			"sleep 10",
		},
		"docker logs --tail 100 myapp 2>&1 || true",
		"docker inspect -f '{{.State.Running}}' myapp | grep -qx true",
	)
}

func TestBuildDeployPlanDocker_NoBuildArgs(t *testing.T) {
	cfg := DockerDeployConfig{ContainerName: "svc", RunArgs: []string{"-p", "3000:3000", "--env-file", ".env"}}
	svc := &model.Service{DeployType: model.DeployDocker, DeployConfig: mustJSON(t, cfg)}
	plan, err := BuildDeployPlan(svc, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertPlan(t, plan,
		[]string{
			"docker build -t svc:latest .",
			"docker stop svc || true",
			"docker rm svc || true",
			"docker run -d --name svc -p 3000:3000 --env-file .env svc:latest",
			"sleep 10",
		},
		"docker logs --tail 100 svc 2>&1 || true",
		"docker inspect -f '{{.State.Running}}' svc | grep -qx true",
	)
}

func TestBuildDeployPlanDocker_WithDockerfile(t *testing.T) {
	cfg := DockerDeployConfig{ContainerName: "api", Dockerfile: "./docker/Dockerfile.prod", RunArgs: []string{"-p", "8000:8000"}}
	svc := &model.Service{DeployType: model.DeployDocker, DeployConfig: mustJSON(t, cfg)}
	plan, err := BuildDeployPlan(svc, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertPlan(t, plan,
		[]string{
			"docker build -f ./docker/Dockerfile.prod -t api:latest .",
			"docker stop api || true",
			"docker rm api || true",
			"docker run -d --name api -p 8000:8000 api:latest",
			"sleep 10",
		},
		"docker logs --tail 100 api 2>&1 || true",
		"docker inspect -f '{{.State.Running}}' api | grep -qx true",
	)
}

// ---------------------------------------------------------------------------
// Docker — Compose mode
// ---------------------------------------------------------------------------

func TestBuildDeployPlanDocker_ComposeMode(t *testing.T) {
	cfg := DockerDeployConfig{ComposeFile: "docker-compose.prod.yml"}
	svc := &model.Service{DeployType: model.DeployDocker, DeployConfig: mustJSON(t, cfg)}
	plan, err := BuildDeployPlan(svc, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertPlan(t, plan,
		[]string{"docker compose -f docker-compose.prod.yml up -d --build"},
		"", "",
	)
}

// ---------------------------------------------------------------------------
// Unknown / bad JSON
// ---------------------------------------------------------------------------

func TestBuildDeployPlanUnknownType(t *testing.T) {
	svc := &model.Service{DeployType: model.DeployType("unknown"), DeployConfig: []byte(`{}`)}
	_, err := BuildDeployPlan(svc, nil)
	if err == nil {
		t.Fatal("expected error for unknown deploy type, got nil")
	}
}

func TestBuildDeployPlanBadJSON(t *testing.T) {
	svc := &model.Service{DeployType: model.DeployPHP, DeployConfig: []byte(`{not valid json`)}
	_, err := BuildDeployPlan(svc, nil)
	if err == nil {
		t.Fatal("expected error for invalid JSON, got nil")
	}
}
