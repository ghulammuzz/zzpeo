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

const DEPLOY_TYPE_COLORS: Record<DeployType, string> = {
  php:    "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  pm2:    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  shell:  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  docker: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
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

  if (loading || !server) return <div className="text-muted-foreground py-8">Loading...</div>

  const basePath = `/projects/${params.projectId}/environments/${params.envId}/servers/${params.serverId}`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{server.name}</h1>
          <p className="font-mono text-sm text-muted-foreground mt-0.5">
            {server.user}@{server.host}:{server.port}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openEditServer}>
            <Pencil className="h-3.5 w-3.5 mr-1" />
            Edit
          </Button>
          <Button
            variant="outline" size="sm"
            className="text-destructive hover:text-destructive"
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

      {/* Server info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connection Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground font-medium">Host</dt>
              <dd className="font-mono mt-1">{server.host}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground font-medium">Port</dt>
              <dd className="font-mono mt-1">{server.port}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground font-medium">User</dt>
              <dd className="font-mono mt-1">{server.user}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground font-medium">Auth</dt>
              <dd className="mt-1"><Badge variant="outline">{server.auth_type}</Badge></dd>
            </div>
            {server.fingerprint && (
              <div className="col-span-2 sm:col-span-4">
                <dt className="text-muted-foreground font-medium">Fingerprint</dt>
                <dd className="font-mono text-xs mt-1 break-all">{server.fingerprint}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

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
              <div className="h-[160px] w-full rounded-lg border bg-muted/20 animate-pulse" />
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
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Services</h2>
          <Button size="sm" asChild>
            <Link href={`${basePath}/services/new`}>
              <Plus className="h-4 w-4 mr-2" />
              Add Service
            </Link>
          </Button>
        </div>

        {services.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
            <Terminal className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold">No services yet</h3>
            <p className="text-muted-foreground text-sm mt-1 mb-4">Add a service to start deploying applications.</p>
            <Button asChild>
              <Link href={`${basePath}/services/new`}>
                <Plus className="h-4 w-4 mr-2" />
                Add Service
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {services.map((service) => (
              <Link key={service.id} href={`${basePath}/services/${service.id}`}>
                <Card className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium">{service.name}</p>
                      <p className="text-sm text-muted-foreground font-mono">{service.workdir}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${DEPLOY_TYPE_COLORS[service.deploy_type as DeployType] ?? ""}`}>
                        {service.deploy_type}
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
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
