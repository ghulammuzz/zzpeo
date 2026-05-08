"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/use-toast"
import { Plus, Terminal, FileCode2, ArrowRight, Pencil, Trash2, GitBranch, RefreshCw } from "lucide-react"
import type { Server, Service, DeployType, NginxBlock, ObjectItem } from "@/lib/types"
import { TrafficFlowDiagram } from "@/components/servers/TrafficFlowDiagram"

const DEPLOY_STYLE: Record<string, { bg: string; text: string }> = {
  php:    { bg: "rgba(77,159,255,0.12)",   text: "#4d9fff" },
  pm2:    { bg: "rgba(61,255,110,0.12)",   text: "#3dff6e" },
  shell:  { bg: "rgba(255,230,0,0.12)",    text: "#ffe600" },
  docker: { bg: "rgba(255,0,85,0.12)",     text: "#ff4499" },
}

interface PageProps {
  params: { projectId: string; envId: string; serverId: string }
}

export default function ServerDetailPage({ params }: PageProps) {
  const router = useRouter()
  const [server, setServer] = useState<Server | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [nginxBlocks, setNginxBlocks] = useState<NginxBlock[]>([])
  const [nginxLoading, setNginxLoading] = useState(true)
  const [serviceObjects, setServiceObjects] = useState<Record<string, ObjectItem[]>>({})

  // Edit server
  const [editingServer, setEditingServer] = useState(false)
  const [srvName, setSrvName] = useState("")
  const [srvHost, setSrvHost] = useState("")
  const [srvPort, setSrvPort] = useState("")
  const [srvUser, setSrvUser] = useState("")
  const [savingServer, setSavingServer] = useState(false)

  // Delete server
  const [confirmDeleteServer, setConfirmDeleteServer] = useState(false)
  const [deletingServer, setDeletingServer] = useState(false)

  const loadNginx = async () => {
    setNginxLoading(true)
    api.nginx.get(params.serverId)
      .then(setNginxBlocks)
      .catch(() => {})
      .finally(() => setNginxLoading(false))
  }

  const load = async () => {
    try {
      const [srv, svcs] = await Promise.all([
        api.servers.get(params.envId, params.serverId),
        api.services.list(params.serverId).catch(() => []),
      ])
      setServer(srv)
      setServices(svcs)

      // Load nginx blocks + per-service objects in the background (non-blocking).
      loadNginx();
      Promise.all(
        (svcs as Service[]).map((svc) =>
          api.services.listObjects(svc.id)
            .then((objs) => ({ id: svc.id, objs }))
            .catch(() => ({ id: svc.id, objs: [] as ObjectItem[] }))
        )
      ).then((results) => {
        const map: Record<string, ObjectItem[]> = {}
        for (const r of results) map[r.id] = r.objs
        setServiceObjects(map)
      })
    } catch {
      router.push(`/projects/${params.projectId}/environments/${params.envId}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [params.serverId])

  const openEditServer = () => {
    if (!server) return
    setSrvName(server.name)
    setSrvHost(server.host)
    setSrvPort(String(server.port))
    setSrvUser(server.user)
    setEditingServer(true)
  }

  const handleSaveServer = async () => {
    if (!server) return
    setSavingServer(true)
    try {
      await api.servers.update(params.envId, server.id, {
        name: srvName,
        host: srvHost,
        port: parseInt(srvPort) || server.port,
        user: srvUser,
      })
      toast({ title: "Server updated" })
      setEditingServer(false)
      await load()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" })
    } finally {
      setSavingServer(false)
    }
  }

  const handleDeleteServer = async () => {
    if (!server) return
    setDeletingServer(true)
    try {
      await api.servers.delete(params.envId, server.id)
      toast({ title: "Server deleted" })
      router.push(`/projects/${params.projectId}/environments/${params.envId}`)
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" })
      setDeletingServer(false)
    }
  }

  if (loading || !server) return (
    <div className="flex items-center gap-2 py-12 text-muted-foreground font-mono text-sm">
      <span className="animate-pulse">▌</span><span>loading...</span>
    </div>
  )

  const basePath = `/projects/${params.projectId}/environments/${params.envId}/servers/${params.serverId}`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{server.name}</h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="font-mono text-xs bg-secondary/60 border border-border px-2 py-0.5 rounded-sm text-neon-cyan/70">
              {server.host}:{server.port}
            </span>
            <span className="font-mono text-xs bg-secondary/60 border border-border px-2 py-0.5 rounded-sm text-muted-foreground">
              {server.user}
            </span>
            <Badge variant="secondary">{server.auth_type}</Badge>
            {server.fingerprint && (
              <span className="font-mono text-[10px] text-muted-foreground/40 truncate max-w-[160px] sm:max-w-[200px]">
                {server.fingerprint}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={openEditServer}>
            <Pencil className="h-3.5 w-3.5 mr-1" />
            Edit
          </Button>
          <Button
            variant="outline" size="sm"
            className="text-neon-magenta border-neon-magenta/30 hover:bg-neon-magenta/8 hover:text-neon-magenta"
            onClick={() => setConfirmDeleteServer(true)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
          <Button variant="outline" asChild>
            <Link href={`${basePath}/nginx`}>
              <FileCode2 className="h-4 w-4 mr-2" />
              Nginx
            </Link>
          </Button>
          <Button asChild>
            <Link href={`${basePath}/services/new`}>
              <Plus className="h-4 w-4 mr-2" />
              Add Service
            </Link>
          </Button>
        </div>
      </div>

      {/* Traffic flow visualization */}
      {services.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                Traffic Flow
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={loadNginx} disabled={nginxLoading}>
                <RefreshCw className={`h-3.5 w-3.5 ${nginxLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {nginxLoading ? (
              <div className="h-[160px] w-full rounded-sm border border-border bg-muted/20 animate-pulse" />
            ) : (
              <TrafficFlowDiagram
                serverHost={server.host}
                nginxBlocks={nginxBlocks}
                services={services}
                serviceObjects={serviceObjects}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Services */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-mono tracking-[0.15em] text-neon-cyan/50 uppercase">// SERVICES</p>
          <Button size="sm" asChild>
            <Link href={`${basePath}/services/new`}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add Service
            </Link>
          </Button>
        </div>

        {services.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-sm border border-dashed border-border/50 py-16 text-center">
            <Terminal className="h-8 w-8 text-muted-foreground/20 mb-4" />
            <p className="text-sm font-mono text-muted-foreground/50">// empty</p>
            <p className="text-xs text-muted-foreground/30 mt-1">no services deployed on this server</p>
            <Button variant="outline" size="sm" className="mt-5" asChild>
              <Link href={`${basePath}/services/new`}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add Service
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {services.map((service) => {
              const style = DEPLOY_STYLE[service.deploy_type as DeployType] ?? { bg: "rgba(255,255,255,0.06)", text: "#888" }
              return (
                <Link key={service.id} href={`${basePath}/services/${service.id}`}>
                  <Card className="cursor-pointer hover:border-neon-cyan/25 transition-colors h-full">
                    <CardContent className="flex flex-col justify-between gap-3 py-4 px-4 h-full">
                      <div>
                        <p className="font-semibold text-sm text-foreground">{service.name}</p>
                        <p className="font-mono text-xs text-muted-foreground/60 truncate mt-0.5">{service.workdir}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-mono font-semibold"
                            style={{ background: style.bg, color: style.text }}
                          >
                            {service.deploy_type}
                          </span>
                          {service.local_port && (
                            <span className="font-mono text-xs bg-secondary/60 border border-border px-2 py-0.5 rounded-sm text-muted-foreground">
                              :{service.local_port}
                            </span>
                          )}
                          {service.domain && (
                            <span className="font-mono text-xs bg-secondary/60 border border-border px-2 py-0.5 rounded-sm text-muted-foreground truncate max-w-[120px]">
                              {service.domain}
                            </span>
                          )}
                        </div>
                        <ArrowRight className="h-4 w-4 text-neon-cyan/50 shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Edit server dialog */}
      <Dialog open={editingServer} onOpenChange={(open) => !open && setEditingServer(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Server</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={srvName} onChange={(e) => setSrvName(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label>Host</Label>
                <Input value={srvHost} onChange={(e) => setSrvHost(e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label>Port</Label>
                <Input value={srvPort} onChange={(e) => setSrvPort(e.target.value)} type="number" className="font-mono" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>SSH User</Label>
              <Input value={srvUser} onChange={(e) => setSrvUser(e.target.value)} className="font-mono" />
            </div>
            <p className="text-xs text-muted-foreground">SSH credentials are preserved. Re-add the server to rotate keys.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingServer(false)}>Cancel</Button>
            <Button onClick={handleSaveServer} disabled={savingServer}>{savingServer ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete server dialog */}
      <Dialog open={confirmDeleteServer} onOpenChange={(open) => !open && setConfirmDeleteServer(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Server</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <strong>{server.name}</strong>? All services will be removed. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteServer(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteServer} disabled={deletingServer}>
              {deletingServer ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
