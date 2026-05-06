"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/use-toast"
import { Server as ServerIcon, Package, ArrowRight, Pencil, Trash2 } from "lucide-react"
import type { Server, ObjectItem, EnvironmentType, Environment } from "@/lib/types"

function slugify(str: string): string {
  return str.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "")
}

const ENV_TYPE_VARIANTS: Record<EnvironmentType, "default" | "secondary" | "destructive" | "warning"> = {
  prod: "destructive",
  stg: "warning",
  custom: "secondary",
}

interface PageProps {
  params: { projectId: string; envId: string }
}

export default function EnvironmentOverviewPage({ params }: PageProps) {
  const router = useRouter()
  const [environment, setEnvironment] = useState<Environment | null>(null)
  const [servers, setServers] = useState<Server[]>([])
  const [objects, setObjects] = useState<ObjectItem[]>([])
  const [serviceCount, setServiceCount] = useState(0)
  const [loading, setLoading] = useState(true)

  // Env edit
  const [editingEnv, setEditingEnv] = useState(false)
  const [envName, setEnvName] = useState("")
  const [envSlug, setEnvSlug] = useState("")
  const [envSlugManual, setEnvSlugManual] = useState(false)
  const [envType, setEnvType] = useState("")
  const [savingEnv, setSavingEnv] = useState(false)

  // Env delete
  const [confirmDeleteEnv, setConfirmDeleteEnv] = useState(false)
  const [deletingEnv, setDeletingEnv] = useState(false)

  // Server delete
  const [deleteServer, setDeleteServer] = useState<Server | null>(null)
  const [deletingServer, setDeletingServer] = useState(false)

  const load = async () => {
    try {
      const env = await api.environments.get(params.projectId, params.envId)
      setEnvironment(env)
      const [srvs, objs] = await Promise.all([
        api.servers.list(params.envId).catch(() => []),
        api.objects.list(params.envId).catch(() => []),
      ])
      setServers(srvs ?? [])
      setObjects(objs ?? [])
      const svcLists = await Promise.all(srvs.map((s: Server) => api.services.list(s.id).catch(() => [])))
      setServiceCount(svcLists.reduce((acc: number, list: unknown[]) => acc + list.length, 0))
    } catch {
      router.push(`/projects/${params.projectId}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [params.envId])

  const openEditEnv = () => {
    if (!environment) return
    setEnvName(environment.name)
    setEnvSlug(environment.slug)
    setEnvType(environment.type)
    setEnvSlugManual(false)
    setEditingEnv(true)
  }

  const handleSaveEnv = async () => {
    if (!environment) return
    setSavingEnv(true)
    try {
      await api.environments.update(params.projectId, environment.id, {
        name: envName, slug: envSlug, type: envType as EnvironmentType,
      })
      toast({ title: "Environment updated" })
      setEditingEnv(false)
      await load()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" })
    } finally {
      setSavingEnv(false)
    }
  }

  const handleDeleteEnv = async () => {
    if (!environment) return
    setDeletingEnv(true)
    try {
      await api.environments.delete(params.projectId, environment.id)
      toast({ title: "Environment deleted" })
      router.push(`/projects/${params.projectId}`)
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" })
      setDeletingEnv(false)
    }
  }

  const handleDeleteServer = async () => {
    if (!deleteServer) return
    setDeletingServer(true)
    try {
      await api.servers.delete(params.envId, deleteServer.id)
      toast({ title: "Server deleted" })
      setDeleteServer(null)
      await load()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" })
    } finally {
      setDeletingServer(false)
    }
  }

  if (loading || !environment) return <div className="text-muted-foreground py-8">Loading...</div>

  const basePath = `/projects/${params.projectId}/environments/${params.envId}`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{environment.name}</h1>
            <Badge variant={ENV_TYPE_VARIANTS[environment.type] as "default" | "secondary" | "destructive"}>
              {environment.type}
            </Badge>
          </div>
          <p className="font-mono text-sm text-muted-foreground mt-0.5">{environment.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={openEditEnv}>
            <Pencil className="h-3.5 w-3.5 mr-1" />
            Edit
          </Button>
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDeleteEnv(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">{servers.length}</div>
            <div className="text-sm text-muted-foreground mt-1">Servers</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">{serviceCount}</div>
            <div className="text-sm text-muted-foreground mt-1">Services</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">{objects.length}</div>
            <div className="text-sm text-muted-foreground mt-1">Objects</div>
          </CardContent>
        </Card>
      </div>

      {/* Nav links */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href={`${basePath}/servers`}>
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ServerIcon className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">Servers</CardTitle>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
          </Card>
        </Link>
        <Link href={`${basePath}/objects`}>
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">Objects</CardTitle>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
          </Card>
        </Link>
      </div>

      {/* Server list */}
      {servers.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Servers</h2>
            <Button variant="outline" size="sm" asChild>
              <Link href={`${basePath}/servers/new`}>Add Server</Link>
            </Button>
          </div>
          <div className="space-y-2">
            {servers.map((server) => (
              <Card
                key={server.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(`${basePath}/servers/${server.id}`)}
              >
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium">{server.name}</p>
                    <p className="text-sm text-muted-foreground font-mono">
                      {server.user}@{server.host}:{server.port}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{server.auth_type}</Badge>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); setDeleteServer(server) }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <ServerIcon className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-semibold">No servers yet</h3>
          <p className="text-muted-foreground text-sm mt-1 mb-4">Add a server to start deploying services.</p>
          <Button asChild>
            <Link href={`${basePath}/servers/new`}>Add Server</Link>
          </Button>
        </div>
      )}

      {/* Edit env dialog */}
      <Dialog open={editingEnv} onOpenChange={(open) => !open && setEditingEnv(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Environment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={envName}
                onChange={(e) => { setEnvName(e.target.value); if (!envSlugManual) setEnvSlug(slugify(e.target.value)) }}
              />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input
                value={envSlug}
                onChange={(e) => { setEnvSlugManual(true); setEnvSlug(e.target.value) }}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={envType} onValueChange={setEnvType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="prod">Production</SelectItem>
                  <SelectItem value="stg">Staging</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEnv(false)}>Cancel</Button>
            <Button onClick={handleSaveEnv} disabled={savingEnv}>{savingEnv ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete env dialog */}
      <Dialog open={confirmDeleteEnv} onOpenChange={(open) => !open && setConfirmDeleteEnv(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Environment</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <strong>{environment.name}</strong>? All servers and data will be removed. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteEnv(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteEnv} disabled={deletingEnv}>
              {deletingEnv ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete server dialog */}
      <Dialog open={!!deleteServer} onOpenChange={(open) => !open && setDeleteServer(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Server</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <strong>{deleteServer?.name}</strong>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteServer(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteServer} disabled={deletingServer}>
              {deletingServer ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
