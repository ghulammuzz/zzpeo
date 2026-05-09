export type DeployType = "php" | "pm2" | "shell" | "docker" | "dokploy";
export type DeployStatus = "pending" | "running" | "success" | "failed" | "cancelled";
export type EnvVarDeployMode = "all" | "build_arg" | "runtime" | "both";
export type EnvironmentType = "prod" | "stg" | "custom";
export type AuthType = "key" | "password";

export interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface Environment {
  id: string;
  project_id: string;
  name: string;
  slug: string;
  type: EnvironmentType;
  created_at: string;
  updated_at: string;
}

export interface EnvVar {
  id: string;
  environment_id: string;
  key: string;
  // value is masked in list responses
  created_at: string;
  updated_at: string;
}

export interface Server {
  id: string;
  environment_id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  auth_type: AuthType;
  fingerprint?: string;
  created_at: string;
  updated_at: string;
}

export type LogSourceType = "docker_logs" | "pm2" | "file" | "docker_exec_file" | "journalctl";

export interface LogConfig {
  type: LogSourceType;
  container_name?: string;
  app_name?: string;
  path?: string;
  unit?: string;
}

export interface Service {
  id: string;
  server_id: string;
  name: string;
  workdir: string;
  run_as_user?: string;
  local_port?: number;
  domain?: string;
  log_config?: LogConfig;
  deploy_type: DeployType;
  deploy_config:
    | PHPDeployConfig
    | PM2DeployConfig
    | ShellDeployConfig
    | DockerDeployConfig
    | DokployDeployConfig;
  created_at: string;
  updated_at: string;
}

export interface PHPDeployConfig {
  git_branch: string;
  post_pull_cmds: string[];
  env_mode: "inline" | "file";
  env_file_path?: string;
}

export interface PM2DeployConfig {
  git_branch: string;
  npm_install: boolean;
  build_cmd: string;
  pm2_app_name: string;
  env_mode: "inline" | "file";
  env_file_path?: string;
}

export interface ShellDeployConfig {
  script_path: string;
  args: string[];
}

export interface DockerDeployConfig {
  build_args: string[];
  container_name: string;
  run_args: string[];
  compose_file: string;
  dockerfile?: string;
}

export interface DokployDeployConfig {
  application_id: string;
}

export interface ServiceEnvVar {
  id: string;
  service_id: string;
  key: string;
  value: string; // always "****" in list responses
  deploy_mode: EnvVarDeployMode;
  created_at: string;
  updated_at: string;
}

export interface Deployment {
  id: string;
  service_id: string;
  triggered_by?: string;
  status: DeployStatus;
  log?: string;
  container_log?: string;
  started_at?: string;
  finished_at?: string;
  created_at: string;
}

export interface ObjectType {
  id: string;
  name: string;
}

export interface ObjectItem {
  id: string;
  environment_id: string;
  object_type_id: string;
  object_type_name: string;
  name: string;
  host?: string;
  port?: number;
  database_name?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface NginxBlock {
  server_names: string[];
  listen: string[];
  root_dir?: string;
  proxy_pass?: string;
  ssl_enabled: boolean;
}

// ─── Env Var Sets ─────────────────────────────────────────────

export interface EnvVarSet {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface LinkedEnvVarSet extends EnvVarSet {
  deploy_mode: string;
}

export interface EnvVarSetItem {
  id: string;
  set_id: string;
  key: string;
  value: string; // "****" in list responses
  created_at: string;
  updated_at: string;
}

// ─── Global list types (for sidebar) ─────────────────────────

export interface GlobalServer {
  id: string;
  name: string;
  host: string;
  env_id: string;
  env_name: string;
  project_id: string;
  project_name: string;
  created_at: string;
}

export interface GlobalService {
  id: string;
  name: string;
  deploy_type: DeployType;
  server_id: string;
  server_name: string;
  env_id: string;
  env_name: string;
  project_id: string;
  project_name: string;
  created_at: string;
}

export interface GlobalObject {
  id: string;
  name: string;
  object_type_name: string;
  env_id: string;
  env_name: string;
  project_id: string;
  project_name: string;
  created_at: string;
}
