package handler

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/ghulammuzz/zzpeo/api/internal/model"
	"github.com/ghulammuzz/zzpeo/api/internal/repository"
	"github.com/ghulammuzz/zzpeo/api/internal/service"
	appssh "github.com/ghulammuzz/zzpeo/api/internal/ssh"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/valyala/fasthttp"
)

// logEvent carries a line of output and which SSE event type it belongs to.
type logEvent struct {
	event string // "log" or "container_log"
	data  string
}

// deployBroadcast fans out log events to multiple SSE subscribers and buffers
// all events so late-joining clients (e.g. after page navigation) get full replay.
type deployBroadcast struct {
	mu   sync.Mutex
	buf  []logEvent
	subs []chan logEvent
	done bool
}

func (b *deployBroadcast) send(ev logEvent) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.buf = append(b.buf, ev)
	for _, sub := range b.subs {
		select {
		case sub <- ev:
		default: // slow subscriber — drop rather than block the deploy goroutine
		}
	}
}

// subscribe atomically snapshots the buffer and registers a new subscriber.
// Returns (snapshot, live-channel, already-done). Caller must call unsubscribe
// when finished consuming the live channel.
func (b *deployBroadcast) subscribe() ([]logEvent, chan logEvent, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	snap := make([]logEvent, len(b.buf))
	copy(snap, b.buf)
	if b.done {
		return snap, nil, true
	}
	ch := make(chan logEvent, 512)
	b.subs = append(b.subs, ch)
	return snap, ch, false
}

func (b *deployBroadcast) unsubscribe(ch chan logEvent) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for i, sub := range b.subs {
		if sub == ch {
			b.subs = append(b.subs[:i], b.subs[i+1:]...)
			return
		}
	}
}

func (b *deployBroadcast) close() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.done = true
	for _, sub := range b.subs {
		close(sub)
	}
	b.subs = nil
}

// deployBroadcasters maps deploymentID (string) → *deployBroadcast for active deploys.
var deployBroadcasters sync.Map

// activeServices maps serviceID (string) → deploymentID to guard against
// concurrent deploys of the same service.
var activeServices sync.Map

// DeployHandler wires deploy-related routes.
type DeployHandler struct {
	svcRepo    repository.ServiceRepo
	serverRepo repository.ServerRepo
	deployRepo repository.DeploymentRepo
	evsRepo    repository.EnvVarSetRepo
	ks         *appssh.KeyStore
}

// NewDeployHandler wires up a DeployHandler with injected repos.
func NewDeployHandler(
	svcRepo repository.ServiceRepo,
	serverRepo repository.ServerRepo,
	deployRepo repository.DeploymentRepo,
	evsRepo repository.EnvVarSetRepo,
	ks *appssh.KeyStore,
) *DeployHandler {
	return &DeployHandler{
		svcRepo:    svcRepo,
		serverRepo: serverRepo,
		deployRepo: deployRepo,
		evsRepo:    evsRepo,
		ks:         ks,
	}
}

// TriggerDeploy handles POST /services/:serviceId/deploy
func (h *DeployHandler) TriggerDeploy(c *fiber.Ctx) error {
	serviceID, err := uuid.Parse(c.Params("serviceId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid service id"})
	}

	ctx := c.Context()

	svc, err := h.svcRepo.GetByID(ctx, serviceID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "service not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	srv, err := h.serverRepo.GetByIDWithCredentials(ctx, svc.ServerID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "server not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	rawEnvVars, err := h.svcRepo.ListServiceEnvVars(ctx, serviceID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load env vars"})
	}
	resolvedVars := make([]service.ResolvedEnvVar, 0, len(rawEnvVars))
	for _, v := range rawEnvVars {
		plain, err := h.ks.Decrypt(v.ValueEnc, serviceID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "env var decryption failed"})
		}
		resolvedVars = append(resolvedVars, service.ResolvedEnvVar{
			Key:        v.Key,
			Value:      string(plain),
			DeployMode: v.DeployMode,
		})
	}

	// Merge linked env var set items (set items use deploy_mode="all"; service-level vars take precedence).
	linkedSets, err := h.evsRepo.ListLinkedSets(ctx, serviceID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load linked env var sets"})
	}
	existingKeys := make(map[string]struct{}, len(resolvedVars))
	for _, v := range resolvedVars {
		existingKeys[v.Key] = struct{}{}
	}
	for _, set := range linkedSets {
		items, err := h.evsRepo.ListItems(ctx, set.ID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load env var set items"})
		}
		for _, item := range items {
			if _, exists := existingKeys[item.Key]; exists {
				continue
			}
			plain, err := h.ks.Decrypt(item.ValueEnc, set.ID)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "env var set item decryption failed"})
			}
			resolvedVars = append(resolvedVars, service.ResolvedEnvVar{
				Key:        item.Key,
				Value:      string(plain),
				DeployMode: set.DeployMode,
			})
			existingKeys[item.Key] = struct{}{}
		}
	}

	plan, err := service.BuildDeployPlan(svc, resolvedVars)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": fmt.Sprintf("build deploy plan: %v", err)})
	}

	if _, loaded := activeServices.LoadOrStore(serviceID.String(), "pending"); loaded {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "deployment already in progress for this service"})
	}

	triggeredBy := "api"
	dep, err := h.deployRepo.Create(ctx, serviceID, &triggeredBy)
	if err != nil {
		activeServices.Delete(serviceID.String())
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create deployment"})
	}
	activeServices.Store(serviceID.String(), dep.ID.String())

	bc := &deployBroadcast{}
	deployBroadcasters.Store(dep.ID.String(), bc)

	go func() {
		bgCtx := context.Background()

		defer func() {
			bc.close()
			deployBroadcasters.Delete(dep.ID.String())
			activeServices.Delete(serviceID.String())
		}()

		_, _ = h.deployRepo.UpdateStatus(bgCtx, dep.ID, model.StatusRunning, nil, nil, nil)

		client, err := appssh.NewClientFromServer(srv, h.ks)
		if err != nil {
			msg := fmt.Sprintf("SSH connect failed: %v", err)
			bc.send(logEvent{"log", msg})
			finished := time.Now()
			_, _ = h.deployRepo.UpdateStatus(bgCtx, dep.ID, model.StatusFailed, &msg, nil, &finished)
			return
		}
		defer client.Close()

		runAsUser := ""
		if svc.RunAsUser != nil {
			runAsUser = *svc.RunAsUser
		}
		executor := appssh.NewExecutor(client)

		// runPhase executes commands, broadcasts output, and accumulates lines into logBuf.
		runPhase := func(eventType string, cmds []string, logBuf *strings.Builder) error {
			if len(cmds) == 0 {
				return nil
			}
			ch := make(chan string, 256)
			done := make(chan struct{})
			go func() {
				defer close(done)
				for line := range ch {
					bc.send(logEvent{eventType, line})
					logBuf.WriteString(line + "\n")
				}
			}()
			runErr := executor.RunCommands(bgCtx, svc.Workdir, runAsUser, cmds, ch)
			close(ch)
			<-done
			return runErr
		}

		var buildLogBuf strings.Builder
		var containerLogBuf strings.Builder

		// Phase 1: main deploy steps (build, stop, rm, run, sleep).
		stepsErr := runPhase("log", plan.Steps, &buildLogBuf)

		// Phase 2: container logs — always attempt so user sees crash reason.
		if plan.ContainerLogsCmd != "" {
			_ = runPhase("container_log", []string{plan.ContainerLogsCmd}, &containerLogBuf)
		}

		// Phase 3: health check — only run if steps succeeded.
		var checkErr error
		if stepsErr == nil && plan.CheckCmd != "" {
			checkErr = runPhase("log", []string{plan.CheckCmd}, &buildLogBuf)
		}

		finalErr := stepsErr
		if finalErr == nil {
			finalErr = checkErr
		}

		buildLog := buildLogBuf.String()
		containerLog := containerLogBuf.String()
		finished := time.Now()
		status := model.StatusSuccess

		if finalErr != nil {
			status = model.StatusFailed
			buildLog += fmt.Sprintf("\nERROR: %v", finalErr)
		}

		var pContainerLog *string
		if containerLog != "" {
			pContainerLog = &containerLog
		}

		_, _ = h.deployRepo.UpdateStatus(bgCtx, dep.ID, status, &buildLog, pContainerLog, &finished)
	}()

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"deployment_id": dep.ID,
		"status":        string(dep.Status),
	})
}

// StreamDeployment handles GET /deployments/:deploymentId/stream (SSE)
func (h *DeployHandler) StreamDeployment(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("deploymentId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid deployment id"})
	}

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("Transfer-Encoding", "chunked")
	c.Set("X-Accel-Buffering", "no")

	val, active := deployBroadcasters.Load(id.String())

	if active {
		b := val.(*deployBroadcast)
		snapshot, live, alreadyDone := b.subscribe()

		c.Context().SetBodyStreamWriter(fasthttp.StreamWriter(func(w *bufio.Writer) {
			// Replay all buffered lines so late-joining clients see full history.
			for _, ev := range snapshot {
				fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.event, ev.data)
				_ = w.Flush()
			}

			if alreadyDone {
				// Broadcaster closed between Load and subscribe — fetch status from DB.
				dep, err := h.deployRepo.GetByID(context.Background(), id)
				if err == nil {
					fmt.Fprintf(w, "event: status\ndata: {\"status\":\"%s\"}\n\n", string(dep.Status))
					_ = w.Flush()
				}
				return
			}

			defer b.unsubscribe(live)
			for ev := range live {
				fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.event, ev.data)
				_ = w.Flush()
			}
			dep, err := h.deployRepo.GetByID(context.Background(), id)
			if err == nil {
				fmt.Fprintf(w, "event: status\ndata: {\"status\":\"%s\"}\n\n", string(dep.Status))
				_ = w.Flush()
			}
		}))
	} else {
		dep, err := h.deployRepo.GetByID(c.Context(), id)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "deployment not found"})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		c.Context().SetBodyStreamWriter(fasthttp.StreamWriter(func(w *bufio.Writer) {
			if dep.Log != nil {
				for _, line := range strings.Split(*dep.Log, "\n") {
					if line == "" {
						continue
					}
					fmt.Fprintf(w, "event: log\ndata: %s\n\n", line)
					_ = w.Flush()
				}
			}
			if dep.ContainerLog != nil {
				for _, line := range strings.Split(*dep.ContainerLog, "\n") {
					if line == "" {
						continue
					}
					fmt.Fprintf(w, "event: container_log\ndata: %s\n\n", line)
					_ = w.Flush()
				}
			}
			fmt.Fprintf(w, "event: status\ndata: {\"status\":\"%s\"}\n\n", string(dep.Status))
			_ = w.Flush()
		}))
	}

	return nil
}

// ListDeployments handles GET /services/:serviceId/deployments
func (h *DeployHandler) ListDeployments(c *fiber.Ctx) error {
	serviceID, err := uuid.Parse(c.Params("serviceId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid service id"})
	}

	deps, err := h.deployRepo.ListByService(c.Context(), serviceID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if deps == nil {
		deps = []model.Deployment{}
	}
	return c.JSON(deps)
}

// GetDeployment handles GET /deployments/:deploymentId
func (h *DeployHandler) GetDeployment(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("deploymentId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid deployment id"})
	}

	dep, err := h.deployRepo.GetByID(c.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "deployment not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(dep)
}
