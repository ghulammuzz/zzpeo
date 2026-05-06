package repository

import (
	"context"
	"time"

	"github.com/ghulammuzz/zzpeo/api/internal/model"
	"github.com/google/uuid"
)

// ProjectRepo is the data-access contract for projects.
type ProjectRepo interface {
	List(ctx context.Context) ([]model.Project, error)
	Create(ctx context.Context, in CreateProjectInput) (*model.Project, error)
	GetByID(ctx context.Context, id uuid.UUID) (*model.Project, error)
	Update(ctx context.Context, id uuid.UUID, in UpdateProjectInput) (*model.Project, error)
	Delete(ctx context.Context, id uuid.UUID) error
}

// EnvironmentRepo is the data-access contract for environments and their env-vars.
type EnvironmentRepo interface {
	List(ctx context.Context, projectID uuid.UUID) ([]model.Environment, error)
	Create(ctx context.Context, in CreateEnvironmentInput) (*model.Environment, error)
	GetByID(ctx context.Context, id uuid.UUID) (*model.Environment, error)
	Update(ctx context.Context, id uuid.UUID, in UpdateEnvironmentInput) (*model.Environment, error)
	Delete(ctx context.Context, id uuid.UUID) error
	ListEnvVars(ctx context.Context, envID uuid.UUID) ([]model.EnvVar, error)
	UpsertEnvVar(ctx context.Context, envID uuid.UUID, key string, valueEnc []byte) (*model.EnvVar, error)
	DeleteEnvVar(ctx context.Context, envID uuid.UUID, key string) error
}

// ServerRepo is the data-access contract for servers.
type ServerRepo interface {
	List(ctx context.Context, envID uuid.UUID) ([]model.Server, error)
	Create(ctx context.Context, in CreateServerInput) (*model.Server, error)
	GetByID(ctx context.Context, id uuid.UUID) (*model.Server, error)
	GetByIDWithCredentials(ctx context.Context, id uuid.UUID) (*model.Server, error)
	Update(ctx context.Context, id uuid.UUID, in UpdateServerInput) (*model.Server, error)
	Delete(ctx context.Context, id uuid.UUID) error
	ExistsByHost(ctx context.Context, envID uuid.UUID, host string, excludeID *uuid.UUID) (bool, error)
	UpdateFingerprint(ctx context.Context, id uuid.UUID, fingerprint string) error
}

// ServiceRepo is the data-access contract for services, their linked objects, and their env-vars.
type ServiceRepo interface {
	List(ctx context.Context, serverID uuid.UUID) ([]model.Service, error)
	Create(ctx context.Context, in CreateServiceInput) (*model.Service, error)
	GetByID(ctx context.Context, id uuid.UUID) (*model.Service, error)
	Update(ctx context.Context, id uuid.UUID, in UpdateServiceInput) (*model.Service, error)
	Delete(ctx context.Context, id uuid.UUID) error
	LinkObject(ctx context.Context, serviceID, objectID uuid.UUID) error
	UnlinkObject(ctx context.Context, serviceID, objectID uuid.UUID) error
	ListLinkedObjects(ctx context.Context, serviceID uuid.UUID) ([]model.Object, error)
	ListServiceEnvVars(ctx context.Context, serviceID uuid.UUID) ([]model.ServiceEnvVar, error)
	UpsertServiceEnvVar(ctx context.Context, serviceID uuid.UUID, key string, valueEnc []byte, deployMode string) (*model.ServiceEnvVar, error)
	UpdateServiceEnvVarMode(ctx context.Context, serviceID uuid.UUID, key string, deployMode string) error
	DeleteServiceEnvVar(ctx context.Context, serviceID uuid.UUID, key string) error
}

// ObjectRepo is the data-access contract for objects and object types.
type ObjectRepo interface {
	ListObjectTypes(ctx context.Context) ([]model.ObjectType, error)
	List(ctx context.Context, envID uuid.UUID) ([]model.Object, error)
	Create(ctx context.Context, in CreateObjectInput) (*model.Object, error)
	GetByID(ctx context.Context, id uuid.UUID) (*model.Object, error)
	Update(ctx context.Context, id uuid.UUID, in UpdateObjectInput) (*model.Object, error)
	Delete(ctx context.Context, id uuid.UUID) error
}

// DeploymentRepo is the data-access contract for deployments.
type DeploymentRepo interface {
	Create(ctx context.Context, serviceID uuid.UUID, triggeredBy *string) (*model.Deployment, error)
	UpdateStatus(ctx context.Context, id uuid.UUID, status model.DeployStatus, log *string, containerLog *string, finishedAt *time.Time) (*model.Deployment, error)
	ListByService(ctx context.Context, serviceID uuid.UUID) ([]model.Deployment, error)
	GetByID(ctx context.Context, id uuid.UUID) (*model.Deployment, error)
}

// GlobalRepo is the data-access contract for cross-table sidebar list queries.
type GlobalRepo interface {
	ListServers(ctx context.Context) ([]GlobalServer, error)
	ListServices(ctx context.Context) ([]GlobalService, error)
	ListObjects(ctx context.Context) ([]GlobalObject, error)
}

// EnvVarSetRepo is the data-access contract for env-var sets and their service links.
type EnvVarSetRepo interface {
	List(ctx context.Context) ([]model.EnvVarSet, error)
	Create(ctx context.Context, name string, description *string) (*model.EnvVarSet, error)
	GetByID(ctx context.Context, id uuid.UUID) (*model.EnvVarSet, error)
	Update(ctx context.Context, id uuid.UUID, name string, description *string) (*model.EnvVarSet, error)
	Delete(ctx context.Context, id uuid.UUID) error
	ListItems(ctx context.Context, setID uuid.UUID) ([]model.EnvVarSetItem, error)
	UpsertItem(ctx context.Context, setID uuid.UUID, key string, valueEnc []byte) (*model.EnvVarSetItem, error)
	DeleteItem(ctx context.Context, setID uuid.UUID, key string) error
	LinkService(ctx context.Context, serviceID, setID uuid.UUID, deployMode string) error
	UpdateLinkDeployMode(ctx context.Context, serviceID, setID uuid.UUID, deployMode string) error
	UnlinkService(ctx context.Context, serviceID, setID uuid.UUID) error
	ListLinkedSets(ctx context.Context, serviceID uuid.UUID) ([]model.LinkedEnvVarSet, error)
	ListLinkedServiceIDs(ctx context.Context, setID uuid.UUID) ([]uuid.UUID, error)
}
