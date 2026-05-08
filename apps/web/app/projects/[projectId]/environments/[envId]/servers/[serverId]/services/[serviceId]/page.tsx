"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/use-toast"
import { DeploymentTypeSelector } from "@/components/services/DeploymentTypeSelector"
import { LogSourceEditor } from "@/components/services/LogSourceEditor"
import { Rocket, Package, Pencil, Trash2, X, Plus, KeyRound, ScrollText, ArrowUpRight, GitBranch, RefreshCw } from "lucide-react"
import { ServiceLogs } from "@/components/services/ServiceLogs"
import { EnvVarsEditor } from "@/components/shared/EnvVarsEditor"
import type { DeployType, ObjectItem, Service, LogConfig, EnvVarSet, LinkedEnvVarSet } from "@/lib/types"
import type { PHPDeployConfig, PM2DeployConfig, ShellDeployConfig, DockerDeployConfig } from "@/lib/types"

const DEPLOY_STYLE: Record<string, { bg: string; text: string }> = {
  php:    { bg: "rgba(77,159,255,0.12)",  text: "#4d9fff" },
  pm2:    { bg: "rgba(61,255,110,0.12)",  text: "#3dff6e" },
  shell:  { bg: "rgba(255,230,0,0.12)",   text: "#ffe600" },
  docker: { bg: "rgba(255,0,85,0.12)",    text: "#ff4499" },
}

interface PageProps {
  params: { projectId: string; envId: string; serverId: string; serviceId: string }
}

export default function ServiceDetailPage({ params }: PageProps) {
  const router = useRouter()
  const [service, setService] = useState<Service | null>(null)
  const [connectedObjects, setConnectedObjects] = useState<ObjectItem[]>([])
  const [availableObjects, setAvailableObjects] = useState<ObjectItem[]>([])
  const [loading, setLoading] = useState(true)

  // Edit mode
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState("")
  const [editWorkdir, setEditWorkdir] = useState("")
  const [editRunAsUser, setEditRunAsUser] = useState("")
  const [editLocalPort, setEditLocalPort] = useState("")
  const [editDomain, setEditDomain] = useState("")
  const [editLogConfig, setEditLogConfig] = useState<LogConfig | undefined>(undefined)
  const [editDeployType, setEditDeployType] = useState<DeployType>("php")
  const [editDeployConfig, setEditDeployConfig] = useState<unknown>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Object linking
  const [linkObjectId, setLinkObjectId] = useState("")
  const [linking, setLinking] = useState(false)

  // Env var sets
  const [linkedSets, setLinkedSets] = useState<LinkedEnvVarSet[]>([])
  const [allSets, setAllSets] = useState<EnvVarSet[]>([])
  const [linkSetId, setLinkSetId] = useState("")
  const [linkingSet, setLinkingSet] = useState(false)

  // Git info
  const [gitInfo, setGitInfo] = useState<{ branch: string; commit_hash: string; commit_message: string } | null>(null)
  const [gitPulling, setGitPulling] = useState(false)
  const [gitPullOutput, setGitPullOutput] = useState<{ success: boolean; output: string } | null>(null)

  const basePath = `/projects/${params.projectId}/environments/${params.envId}/servers/${params.serverId}`
  const deployPath = `${basePath}/services/${params.serviceId}/deploy`

  const load = async () => {
    try {
      const [svc, linked, all, lSets, aSets] = await Promise.all([
        api.services.get(params.serverId, params.serviceId),
        api.services.listObjects(params.serviceId).catch(() => []),
        api.objects.list(params.envId).catch(() => []),
        api.envVarSets.listLinkedSets(params.serviceId).catch(() => []),
        api.envVarSets.list().catch(() => []),
      ])
      setService(svc)
      setConnectedObjects(linked)
      setAvailableObjects(all)
      setLinkedSets(lSets as LinkedEnvVarSet[])
      setAllSets(aSets as EnvVarSet[])
    } catch {
      router.push(basePath)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // Fetch git info in background — don't block page load
    api.services.gitInfo(params.serviceId)
      .then(setGitInfo)
      .catch(() => {}) // not a git repo or SSH fail — show nothing
  }, [params.serviceId])

  const handleGitPull = async () => {
    setGitPulling(true)
    setGitPullOutput(null)
    try {
      const result = await api.services.gitPull(params.serviceId)
      setGitPullOutput(result)
      if (result.success) {
        // Refresh git info to reflect new HEAD
        api.services.gitInfo(params.serviceId).then(setGitInfo).catch(() => {})
      }
    } catch (err) {
      setGitPullOutput({ success: false, output: err instanceof Error ? err.message : "Failed" })
    } finally {
      setGitPulling(false)
    }
  }

  const openEdit = () => {
    if (!service) return
    setEditName(service.name)
    setEditWorkdir(service.workdir)
    setEditRunAsUser(service.run_as_user ?? "")
    setEditLocalPort(service.local_port ? String(service.local_port) : "")
    setEditDomain(service.domain ?? "")
    setEditLogConfig(service.log_config as LogConfig | undefined)
    setEditDeployType(service.deploy_type)
    setEditDeployConfig(service.deploy_config)
    setSaveError(null)
    setEditing(true)
  }

  const handleSave = async () => {
    if (!service) return
    setSaving(true)
    setSaveError(null)
    try {
      await api.services.update(params.serverId, service.id, {
        name: editName,
        workdir: editWorkdir,
        run_as_user: editRunAsUser || undefined,
        local_port: editLocalPort ? parseInt(editLocalPort) : undefined,
        domain: editDomain || undefined,
        log_config: editLogConfig ?? null,
        deploy_type: editDeployType,
        deploy_config: editDeployConfig,
      })
      toast({ title: "Service updated" })
      setEditing(false)
      await load()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!service) return
    setDeleting(true)
    try {
      await api.services.delete(params.serverId, service.id)
      toast({ title: "Service deleted" })
      router.push(basePath)
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" })
      setDeleting(false)
    }
  }

  const handleLinkObject = async () => {
    if (!linkObjectId) return
    setLinking(true)
    try {
      await api.services.linkObject(params.serviceId, linkObjectId)
      setLinkObjectId("")
      await load()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to link", variant: "destructive" })
    } finally {
      setLinking(false)
    }
  }

  const handleUnlinkObject = async (objectId: string) => {
    try {
      await api.services.unlinkObject(params.serviceId, objectId)
      await load()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to unlink", variant: "destructive" })
    }
  }

  const handleLinkSet = async () => {
    if (!linkSetId) return
    setLinkingSet(true)
    try {
      await api.envVarSets.linkService(params.serviceId, linkSetId, "all")
      setLinkSetId("")
      await load()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to link", variant: "destructive" })
    } finally {
      setLinkingSet(false)
    }
  }

  const handleUpdateLinkMode = async (setId: string, deployMode: string) => {
    try {
      await api.envVarSets.updateLinkMode(params.serviceId, setId, deployMode)
      setLinkedSets((prev) => prev.map((s) => s.id === setId ? { ...s, deploy_mode: deployMode } : s))
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to update mode", variant: "destructive" })
    }
  }

  const handleUnlinkSet = async (setId: string) => {
    try {
      await api.envVarSets.unlinkService(params.serviceId, setId)
      await load()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to unlink", variant: "destructive" })
    }
  }

  // EnvVarsEditor stable callbacks
  const loadEnvVars = useCallback(
    () => api.serviceEnvVars.list(params.serviceId),
    [params.serviceId],
  )
  const revealEnvVars = useCallback(
    () => api.serviceEnvVars.reveal(params.serviceId),
    [params.serviceId],
  )
  const saveEnvVars = useCallback(
    async (items: { key: string; value: string; deploy_mode?: string }[]) => {
      await api.serviceEnvVars.upsert(
        params.serviceId,
        items.map((r) => ({ key: r.key, value: r.value, deploy_mode: r.deploy_mode ?? "all" })),
      )
    },
    [params.serviceId],
  )
  const deleteEnvVar = useCallback(
    (key: string) => api.serviceEnvVars.delete(params.serviceId, key),
    [params.serviceId],
  )

  if (loading || !service) {
    return (
      <div className="flex items-center gap-2 py-12 text-muted-foreground font-mono text-sm">
        <span className="animate-pulse">▌</span><span>loading...</span>
      </div>
    )
  }

  const linkedIds = new Set(connectedObjects.map((o) => o.id))
  const unlinkable = availableObjects.filter((o) => !linkedIds.has(o.id))

  if (editing) {
    return (
      <div className="max-w-2xl space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Edit Service</h1>
          <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              <p className="text-[10px] font-mono tracking-[0.15em] text-neon-cyan/50 uppercase mb-0">// SERVICE DETAILS</p>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Service Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="frontend-app" />
            </div>
            <div className="space-y-2">
              <Label>Working Directory</Label>
              <Input value={editWorkdir} onChange={(e) => setEditWorkdir(e.target.value)} placeholder="/var/www/app" className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>
                Run As User{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input value={editRunAsUser} onChange={(e) => setEditRunAsUser(e.target.value)} placeholder="shortie" className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>
                Local Port{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input value={editLocalPort} onChange={(e) => setEditLocalPort(e.target.value)} placeholder="3000" type="number" className="font-mono w-32" />
              <p className="text-xs text-muted-foreground">Port this service listens on locally — used to link nginx proxy_pass in the traffic flow diagram.</p>
            </div>
            <div className="space-y-2">
              <Label>
                Domain{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input value={editDomain} onChange={(e) => setEditDomain(e.target.value)} placeholder="app.example.com" className="font-mono" />
              <p className="text-xs text-muted-foreground">Domain or subdomain associated with this service.</p>
            </div>
            <div className="space-y-2">
              <Label>
                Log Source{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <LogSourceEditor value={editLogConfig} onChange={setEditLogConfig} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <p className="text-[10px] font-mono tracking-[0.15em] text-neon-cyan/50 uppercase mb-0">// DEPLOYMENT CONFIGURATION</p>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DeploymentTypeSelector
              key={`edit-${service.id}`}
              value={{ type: editDeployType, config: editDeployConfig }}
              onChange={(type, config) => { setEditDeployType(type); setEditDeployConfig(config) }}
            />
          </CardContent>
        </Card>

        {saveError && (
          <div className="rounded-sm border border-neon-magenta/30 bg-neon-magenta/5 px-4 py-3 text-sm text-neon-magenta font-mono">
            {saveError}
          </div>
        )}

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </div>
    )
  }

  const ds = DEPLOY_STYLE[service.deploy_type] ?? { bg: "rgba(255,255,255,0.08)", text: "rgba(255,255,255,0.7)" }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {/* Row 1: name + deploy type badge */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold">{service.name}</h1>
            <span
              className="inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-mono font-semibold tracking-wider"
              style={{ background: ds.bg, color: ds.text }}
            >
              {service.deploy_type}
            </span>
          </div>

          {/* Row 2: workdir + port + domain + run_as_user chips */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="font-mono text-xs bg-secondary/60 border border-border px-2 py-0.5 rounded-sm text-muted-foreground/70 break-all">
              {service.workdir}
            </span>
            {service.local_port && (
              <span className="font-mono text-xs bg-secondary/60 border border-border px-2 py-0.5 rounded-sm text-neon-cyan/60">
                :{service.local_port}
              </span>
            )}
            {service.domain && (
              <span className="font-mono text-xs bg-secondary/60 border border-border px-2 py-0.5 rounded-sm text-neon-blue/70 break-all">
                {service.domain}
              </span>
            )}
            {service.run_as_user && (
              <span className="font-mono text-xs bg-secondary/60 border border-border px-2 py-0.5 rounded-sm text-muted-foreground/60">
                su: {service.run_as_user}
              </span>
            )}
          </div>

          {/* Row 3: git info */}
          {gitInfo && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <GitBranch className="h-3 w-3 text-neon-green/60 flex-shrink-0" />
              <span className="font-mono text-xs bg-neon-green/8 border border-neon-green/20 px-2 py-0.5 rounded-sm text-neon-green/80">
                {gitInfo.branch}
              </span>
              {gitInfo.commit_hash && (
                <span className="font-mono text-[10px] text-muted-foreground/40">{gitInfo.commit_hash}</span>
              )}
              {gitInfo.commit_message && (
                <span className="text-xs text-muted-foreground/50 truncate max-w-[240px] sm:max-w-[300px]">{gitInfo.commit_message}</span>
              )}
            </div>
          )}
        </div>

        {/* Action buttons — wrap on mobile */}
        <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:shrink-0">
          <Button variant="outline" size="sm" onClick={handleGitPull} disabled={gitPulling}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${gitPulling ? "animate-spin" : ""}`} />
            {gitPulling ? "Pulling..." : "Git Pull"}
          </Button>
          <Button variant="outline" size="sm" onClick={openEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1" />
            Edit
          </Button>
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
          <Button asChild>
            <Link href={deployPath}>
              <Rocket className="h-4 w-4 mr-2" />
              Deploy
            </Link>
          </Button>
        </div>
      </div>

      {/* Git pull output — terminal style */}
      {gitPullOutput && (
        <div className={`rounded-sm border px-4 py-3 ${gitPullOutput.success ? "border-neon-green/30 bg-neon-green/5" : "border-neon-magenta/30 bg-neon-magenta/5"}`}>
          <div className="flex items-start justify-between gap-3">
            <pre className={`font-mono text-xs whitespace-pre-wrap break-all flex-1 ${gitPullOutput.success ? "text-neon-green/80" : "text-neon-magenta/80"}`}>
              {gitPullOutput.output || (gitPullOutput.success ? "Already up to date." : "Pull failed.")}
            </pre>
            <button onClick={() => setGitPullOutput(null)} className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Info panel — 2-column grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Col 1: Deploy Configuration */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle>
              <p className="text-[10px] font-mono tracking-[0.15em] text-neon-cyan/50 uppercase mb-0">// DEPLOY CONFIG</p>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ConfigView type={service.deploy_type} config={service.deploy_config} />
          </CardContent>
        </Card>

        {/* Col 2: Connected Objects */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle>
              <p className="text-[10px] font-mono tracking-[0.15em] text-neon-cyan/50 uppercase mb-0">// CONNECTED OBJECTS</p>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {connectedObjects.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {connectedObjects.map((obj) => (
                  <Badge key={obj.id} variant="secondary" className="gap-1 pr-1">
                    <span className="text-muted-foreground">{obj.object_type_name}:</span>
                    {obj.name}
                    <button
                      className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                      onClick={() => handleUnlinkObject(obj.id)}
                      title="Unlink"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground/50 font-mono text-xs">no objects linked.</p>
            )}
            <div className="flex gap-2 items-center">
              <Select value={linkObjectId} onValueChange={setLinkObjectId} disabled={unlinkable.length === 0}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={unlinkable.length === 0 ? "No objects to link" : "Link object..."} />
                </SelectTrigger>
                <SelectContent>
                  {unlinkable.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      <span className="text-muted-foreground text-xs mr-1">{o.object_type_name}:</span>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleLinkObject} disabled={!linkObjectId || linking || unlinkable.length === 0}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Metadata strip */}
      <div className="flex items-center gap-4 mt-1 pt-3 border-t border-border/50">
        <span className="text-xs text-muted-foreground/40 font-mono">id: {service.id}</span>
        <span className="text-xs text-muted-foreground/40">created {new Date(service.created_at).toLocaleDateString()}</span>
      </div>

      {/* Live Logs */}
      {(service.deploy_type === "docker" || service.deploy_type === "pm2" || service.log_config != null) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-neon-cyan/60" />
              <p className="text-[10px] font-mono tracking-[0.15em] text-neon-cyan/50 uppercase mb-0">// LIVE LOGS</p>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ServiceLogs
              serviceId={service.id}
              deployType={service.deploy_type}
              logConfigType={(service.log_config as LogConfig | undefined)?.type}
            />
          </CardContent>
        </Card>
      )}

      {/* Environment Variables (service vars + linked sets) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-neon-cyan/60" />
            <p className="text-[10px] font-mono tracking-[0.15em] text-neon-cyan/50 uppercase mb-0">// ENVIRONMENT VARIABLES</p>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Linked sets subsection */}
          <div className="space-y-3">
            <p className="text-[10px] font-mono tracking-[0.15em] text-neon-cyan/50 uppercase mb-3">// LINKED SETS</p>
            {linkedSets.length > 0 ? (
              <div className="space-y-2">
                {linkedSets.map((s) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <Badge variant="secondary" className="gap-1 pr-1 shrink-0">
                      <Link href={`/env-var-sets/${s.id}`} className="hover:underline">
                        {s.name}
                      </Link>
                      <button
                        className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                        onClick={() => handleUnlinkSet(s.id)}
                        title="Unlink"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                    <Select value={s.deploy_mode} onValueChange={(v) => handleUpdateLinkMode(s.id, v)}>
                      <SelectTrigger className="h-7 w-[120px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Both</SelectItem>
                        <SelectItem value="runtime">Runtime</SelectItem>
                        <SelectItem value="build_arg">Build arg</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/50 font-mono">no sets linked.</p>
            )}
            {allSets.filter((s) => !linkedSets.find((l) => l.id === s.id)).length > 0 && (
              <div className="flex gap-2 items-center">
                <Select value={linkSetId} onValueChange={setLinkSetId}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Link a set..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allSets
                      .filter((s) => !linkedSets.find((l) => l.id === s.id))
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={handleLinkSet} disabled={!linkSetId || linkingSet}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Link
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/env-var-sets">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground/50">
              Set vars injected at deploy time. Service vars override on conflict.
            </p>
          </div>

          {/* Service-specific env vars */}
          <div className="space-y-2">
            <p className="text-[10px] font-mono tracking-[0.15em] text-neon-cyan/50 uppercase mb-3">// SERVICE VARS</p>
            <EnvVarsEditor
              loadFn={loadEnvVars}
              revealFn={revealEnvVars}
              saveFn={saveEnvVars}
              deleteFn={deleteEnvVar}
              showDeployMode={service.deploy_type === "docker"}
              collapsible
              hint={
                service.deploy_type === "docker"
                  ? <>Per-variable: choose <strong>build arg</strong>, <strong>runtime</strong>, or <strong>both</strong>.</>
                  : (service.deploy_type === "php" || service.deploy_type === "pm2")
                  ? <>Written to <code className="bg-muted px-1 rounded">.env</code> on deploy.</>
                  : undefined
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Delete dialog */}
      <Dialog open={confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Service</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <strong>{service.name}</strong>? All deployments will be removed. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Read-only config display
// ---------------------------------------------------------------------------

function ConfigView({ type, config }: { type: DeployType; config: unknown }) {
  if (type === "php") {
    const cfg = config as PHPDeployConfig
    return (
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-muted-foreground text-xs font-medium uppercase">Git Branch</dt>
          <dd className="font-mono mt-0.5">{cfg.git_branch}</dd>
        </div>
        {cfg.post_pull_cmds?.length > 0 && (
          <div>
            <dt className="text-muted-foreground text-xs font-medium uppercase">Post-Pull Commands</dt>
            <dd className="mt-0.5 space-y-1">
              {cfg.post_pull_cmds.map((cmd, i) => (
                <p key={i} className="font-mono text-xs bg-muted rounded px-2 py-1">{cmd}</p>
              ))}
            </dd>
          </div>
        )}
      </dl>
    )
  }

  if (type === "pm2") {
    const cfg = config as PM2DeployConfig
    return (
      <dl className="space-y-2 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-muted-foreground text-xs font-medium uppercase">Git Branch</dt>
            <dd className="font-mono mt-0.5">{cfg.git_branch}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs font-medium uppercase">PM2 App</dt>
            <dd className="font-mono mt-0.5">{cfg.pm2_app_name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs font-medium uppercase">npm install</dt>
            <dd className="mt-0.5">{cfg.npm_install ? "Yes" : "No"}</dd>
          </div>
          {cfg.build_cmd && (
            <div>
              <dt className="text-muted-foreground text-xs font-medium uppercase">Build Command</dt>
              <dd className="font-mono mt-0.5">{cfg.build_cmd}</dd>
            </div>
          )}
        </div>
      </dl>
    )
  }

  if (type === "shell") {
    const cfg = config as ShellDeployConfig
    return (
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-muted-foreground text-xs font-medium uppercase">Script Path</dt>
          <dd className="font-mono mt-0.5">{cfg.script_path}</dd>
        </div>
        {cfg.args?.length > 0 && (
          <div>
            <dt className="text-muted-foreground text-xs font-medium uppercase">Args</dt>
            <dd className="font-mono mt-0.5">{cfg.args.join(" ")}</dd>
          </div>
        )}
      </dl>
    )
  }

  if (type === "docker") {
    const cfg = config as DockerDeployConfig
    return (
      <dl className="space-y-2 text-sm">
        {cfg.compose_file ? (
          <div>
            <dt className="text-muted-foreground text-xs font-medium uppercase">Compose File</dt>
            <dd className="font-mono mt-0.5">{cfg.compose_file}</dd>
          </div>
        ) : (
          <>
            <div>
              <dt className="text-muted-foreground text-xs font-medium uppercase">Container Name</dt>
              <dd className="font-mono mt-0.5">{cfg.container_name}</dd>
            </div>
            {cfg.build_args?.length > 0 && (
              <div>
                <dt className="text-muted-foreground text-xs font-medium uppercase">Build Args</dt>
                <dd className="font-mono mt-0.5">{cfg.build_args.join(", ")}</dd>
              </div>
            )}
            {cfg.run_args?.length > 0 && (
              <div>
                <dt className="text-muted-foreground text-xs font-medium uppercase">Run Args</dt>
                <dd className="font-mono mt-0.5">{cfg.run_args.join(" ")}</dd>
              </div>
            )}
          </>
        )}
      </dl>
    )
  }

  return <pre className="text-xs font-mono">{JSON.stringify(config, null, 2)}</pre>
}
