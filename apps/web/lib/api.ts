import type {
  Project,
  Environment,
  EnvVar,
  ServiceEnvVar,
  Server,
  Service,
  Deployment,
  ObjectType,
  ObjectItem,
  NginxBlock,
  EnvVarSet,
  EnvVarSetItem,
  LinkedEnvVarSet,
  GlobalServer,
  GlobalService,
  GlobalObject,
} from "./types";

// Relative URL — requests go through Next.js rewrite proxy, backend never exposed to client.
// Set NEXT_PUBLIC_API_URL only to override (e.g. for direct access during local dev without proxy).
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {}
  const token = localStorage.getItem("zzpeo_token")
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function handleUnauthorized() {
  if (typeof window === "undefined") return
  localStorage.removeItem("zzpeo_token")
  document.cookie = "zzpeo_session=; path=/; max-age=0"
  window.location.href = "/login"
}

async function parseError(res: Response, method: string, path: string): Promise<Error> {
  try {
    const data = await res.json()
    const msg = data?.error ?? data?.message ?? res.statusText
    return new Error(msg)
  } catch {
    return new Error(`${method} ${path} failed: ${res.status} ${res.statusText}`)
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    headers: authHeaders(),
  })
  if (res.status === 401) { handleUnauthorized(); throw new Error("Unauthorized") }
  if (!res.ok) throw await parseError(res, "GET", path)
  return res.json() as Promise<T>
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  })
  if (res.status === 401) { handleUnauthorized(); throw new Error("Unauthorized") }
  if (!res.ok) throw await parseError(res, "POST", path)
  return res.json() as Promise<T>
}

async function patch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  })
  if (res.status === 401) { handleUnauthorized(); throw new Error("Unauthorized") }
  if (!res.ok) throw await parseError(res, "PATCH", path)
  return res.json() as Promise<T>
}

async function put<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  })
  if (res.status === 401) { handleUnauthorized(); throw new Error("Unauthorized") }
  if (!res.ok) throw await parseError(res, "PUT", path)
  return res.json() as Promise<T>
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "DELETE",
    cache: "no-store",
    headers: authHeaders(),
  })
  if (res.status === 401) { handleUnauthorized(); return }
  if (!res.ok) throw await parseError(res, "DELETE", path)
}

// ── Auth ──────────────────────────────────────────────────────────

async function postPublic<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  })
  if (!res.ok) throw await parseError(res, "POST", path)
  return res.json() as Promise<T>
}

async function getPublic<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store" })
  if (!res.ok) throw await parseError(res, "GET", path)
  return res.json() as Promise<T>
}

export interface AuthResponse {
  token: string
  user: { id: string; username: string; role: "admin" | "user" }
}

export interface MeResponse {
  id: string
  username: string
  role: "admin" | "user"
  project_ids: string[]
}

export interface AdminUser {
  id: string
  username: string
  role: "admin" | "user"
  registered: boolean
  created_at: string
  reg_url?: string
}

export interface UserPermission {
  id: string
  user_id: string
  project_id: string
  project_name: string
  created_at: string
}

// ── API client ────────────────────────────────────────────────────

export const api = {
  auth: {
    login: (body: { username: string; password: string }) =>
      postPublic<AuthResponse>("/auth/login", body),
    register: (token: string, body: { password: string }) =>
      postPublic<AuthResponse>(`/auth/register/${token}`, body),
    registerInfo: (token: string) =>
      getPublic<{ username: string; expires_at: string }>(`/auth/register-info/${token}`),
    me: () => get<MeResponse>("/auth/me"),
  },
  admin: {
    listUsers: () => get<AdminUser[]>("/admin/users"),
    createUser: (body: { username: string; role: string }) =>
      post<AdminUser>("/admin/users", body),
    deleteUser: (id: string) => del(`/admin/users/${id}`),
    regenerateToken: (id: string) => post<{ reg_url: string }>(`/admin/users/${id}/reg-token`),
    listPermissions: (userId: string) => get<UserPermission[]>(`/admin/users/${userId}/permissions`),
    setPermissions: (userId: string, projectIds: string[]) =>
      put<void>(`/admin/users/${userId}/permissions`, { project_ids: projectIds }),
  },
  projects: {
    list: () => get<Project[]>("/projects"),
    create: (body: { name: string; slug: string; description?: string }) =>
      post<Project>("/projects", body),
    get: (id: string) => get<Project>(`/projects/${id}`),
    update: (id: string, body: Partial<Project>) =>
      patch<Project>(`/projects/${id}`, body),
    delete: (id: string) => del(`/projects/${id}`),
  },
  environments: {
    list: (projectId: string) =>
      get<Environment[]>(`/projects/${projectId}/environments`),
    create: (projectId: string, body: { name: string; slug: string; type: string }) =>
      post<Environment>(`/projects/${projectId}/environments`, body),
    get: (projectId: string, envId: string) =>
      get<Environment>(`/projects/${projectId}/environments/${envId}`),
    update: (projectId: string, envId: string, body: Partial<Environment>) =>
      patch<Environment>(`/projects/${projectId}/environments/${envId}`, body),
    delete: (projectId: string, envId: string) =>
      del(`/projects/${projectId}/environments/${envId}`),
  },
  envVars: {
    list: (envId: string) => get<EnvVar[]>(`/environments/${envId}/env-vars`),
    upsert: (envId: string, vars: { key: string; value: string }[]) =>
      put<EnvVar[]>(`/environments/${envId}/env-vars`, vars),
    delete: (envId: string, key: string) =>
      del(`/environments/${envId}/env-vars/${key}`),
  },
  servers: {
    list: (envId: string) => get<Server[]>(`/environments/${envId}/servers`),
    create: (envId: string, body: unknown) =>
      post<Server>(`/environments/${envId}/servers`, body),
    get: (envId: string, serverId: string) =>
      get<Server>(`/environments/${envId}/servers/${serverId}`),
    update: (envId: string, serverId: string, body: unknown) =>
      patch<Server>(`/environments/${envId}/servers/${serverId}`, body),
    delete: (envId: string, serverId: string) =>
      del(`/environments/${envId}/servers/${serverId}`),
    testConnection: (envId: string, serverId: string, body?: { confirm?: boolean }) =>
      post<{ fingerprint: string; latency_ms: number }>(
        `/environments/${envId}/servers/${serverId}/test-connection`, body,
      ),
  },
  services: {
    list: (serverId: string) => get<Service[]>(`/servers/${serverId}/services`),
    create: (serverId: string, body: unknown) =>
      post<Service>(`/servers/${serverId}/services`, body),
    get: (serverId: string, serviceId: string) =>
      get<Service>(`/servers/${serverId}/services/${serviceId}`),
    update: (serverId: string, serviceId: string, body: unknown) =>
      patch<Service>(`/servers/${serverId}/services/${serviceId}`, body),
    delete: (serverId: string, serviceId: string) =>
      del(`/servers/${serverId}/services/${serviceId}`),
    listObjects: (serviceId: string) =>
      get<ObjectItem[]>(`/services/${serviceId}/objects`),
    linkObject: (serviceId: string, objectId: string) =>
      post<void>(`/services/${serviceId}/objects/${objectId}`),
    unlinkObject: (serviceId: string, objectId: string) =>
      del(`/services/${serviceId}/objects/${objectId}`),
    gitInfo: (serviceId: string) =>
      get<{ branch: string; commit_hash: string; commit_message: string }>(`/services/${serviceId}/git-info`),
    gitPull: (serviceId: string) =>
      post<{ success: boolean; output: string; error?: string }>(`/services/${serviceId}/git-pull`),
  },
  serviceEnvVars: {
    list: (serviceId: string) =>
      get<ServiceEnvVar[]>(`/services/${serviceId}/env-vars`),
    reveal: (serviceId: string) =>
      get<{ key: string; value: string; deploy_mode: string }[]>(`/services/${serviceId}/env-vars/reveal`),
    upsert: (serviceId: string, vars: { key: string; value: string; deploy_mode: string }[]) =>
      put<unknown>(`/services/${serviceId}/env-vars`, vars),
    delete: (serviceId: string, key: string) =>
      del(`/services/${serviceId}/env-vars/${key}`),
  },
  objects: {
    list: (envId: string) => get<ObjectItem[]>(`/environments/${envId}/objects`),
    create: (envId: string, body: unknown) =>
      post<ObjectItem>(`/environments/${envId}/objects`, body),
    get: (envId: string, objectId: string) =>
      get<ObjectItem>(`/environments/${envId}/objects/${objectId}`),
    update: (envId: string, objectId: string, body: unknown) =>
      patch<ObjectItem>(`/environments/${envId}/objects/${objectId}`, body),
    delete: (envId: string, objectId: string) =>
      del(`/environments/${envId}/objects/${objectId}`),
    types: () => get<ObjectType[]>("/object-types"),
  },
  deployments: {
    trigger: (serviceId: string) =>
      post<{ deployment_id: string; status: string }>(`/services/${serviceId}/deploy`),
    list: (serviceId: string) =>
      get<Deployment[]>(`/services/${serviceId}/deployments`),
    get: (deploymentId: string) =>
      get<Deployment>(`/deployments/${deploymentId}`),
    stream: (deploymentId: string) => {
      const token = typeof window !== "undefined" ? localStorage.getItem("zzpeo_token") : null
      const url = token
        ? `${API_URL}/deployments/${deploymentId}/stream?token=${encodeURIComponent(token)}`
        : `${API_URL}/deployments/${deploymentId}/stream`
      return new EventSource(url)
    },
  },
  logs: {
    stream: (serviceId: string, tail?: number, since?: string) => {
      const params = new URLSearchParams()
      if (tail) params.set("tail", String(tail))
      if (since) params.set("since", since)
      const token = typeof window !== "undefined" ? localStorage.getItem("zzpeo_token") : null
      if (token) params.set("token", token)
      const qs = params.toString()
      return new EventSource(`${API_URL}/services/${serviceId}/logs${qs ? "?" + qs : ""}`)
    },
  },
  nginx: {
    get: (serverId: string) => get<NginxBlock[]>(`/servers/${serverId}/nginx`),
    listFiles: (serverId: string) => get<string[]>(`/servers/${serverId}/nginx/files`),
    getFile: (serverId: string, filePath: string) =>
      get<{ content: string; file_path: string }>(`/servers/${serverId}/nginx/raw?file=${encodeURIComponent(filePath)}`),
    updateRaw: (serverId: string, content: string, filePath: string) =>
      put<{ output: string; success: boolean }>(`/servers/${serverId}/nginx/raw`, { content, file_path: filePath }),
  },
  envVarSets: {
    list: () => get<EnvVarSet[]>("/env-var-sets"),
    create: (body: { name: string; description?: string }) => post<EnvVarSet>("/env-var-sets", body),
    get: (id: string) => get<EnvVarSet>(`/env-var-sets/${id}`),
    update: (id: string, body: { name: string; description?: string }) => patch<EnvVarSet>(`/env-var-sets/${id}`, body),
    delete: (id: string) => del(`/env-var-sets/${id}`),
    listItems: (id: string) => get<EnvVarSetItem[]>(`/env-var-sets/${id}/items`),
    revealItems: (id: string) => get<{ key: string; value: string }[]>(`/env-var-sets/${id}/items/reveal`),
    upsertItems: (id: string, items: { key: string; value: string }[]) =>
      put<unknown>(`/env-var-sets/${id}/items`, items),
    deleteItem: (id: string, key: string) => del(`/env-var-sets/${id}/items/${key}`),
    listLinkedSets: (serviceId: string) => get<LinkedEnvVarSet[]>(`/services/${serviceId}/env-var-sets`),
    linkService: (serviceId: string, setId: string, deployMode?: string) =>
      post<unknown>(`/services/${serviceId}/env-var-sets/${setId}`, { deploy_mode: deployMode ?? "all" }),
    updateLinkMode: (serviceId: string, setId: string, deployMode: string) =>
      patch<unknown>(`/services/${serviceId}/env-var-sets/${setId}`, { deploy_mode: deployMode }),
    unlinkService: (serviceId: string, setId: string) => del(`/services/${serviceId}/env-var-sets/${setId}`),
  },
  global: {
    listServers: () => get<GlobalServer[]>("/servers"),
    listServices: () => get<GlobalService[]>("/services"),
    listObjects: () => get<GlobalObject[]>("/objects"),
  },
}
