"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/use-toast"
import { Server as ServerIcon, ArrowRight, Pencil, Trash2 } from "lucide-react"
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

  if (loading || !environment) return (
    <div className="flex items-center gap-2 py-12 text-muted-foreground font-mono text-sm">
      <span className="animate-pulse">▌</span><span>loading...</span>
    </div>
  )

  const basePath = `/projects/${params.projectId}/environments/${params.envId}`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold">{environment.name}</h1>
            <Badge variant={ENV_TYPE_VARIANTS[environment.type]}>
              {environment.type}
            </Badge>
          </div>
          <p className="font-mono text-xs text-muted-foreground/60 mt-1">{environment.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={openEditEnv}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Button>
          <Button
            variant="outline" size="sm"
            className="text-neon-magenta border-neon-magenta/30 hover:bg-neon-magenta/8 hover:text-neon-magenta"
            onClick={() => setConfirmDeleteEnv(true)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Delete
          </Button>
          <Button variant="default" size="sm" asChild>
            <Link href={`${basePath}/servers/new`}>+ Add Server</Link>
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link href={`${basePath}/servers`}>
          <div className="relative rounded-sm border border-border bg-card px-4 py-3 overflow-hidden hover:border-neon-cyan/30 transition-colors cursor-pointer">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neon-cyan/30 to-transparent" />
            <p className="text-2xl font-bold font-mono text-neon-cyan">{servers.length}</p>
            <p className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase mt-0.5">Servers</p>
          </div>
        </Link>

        <div className="relative rounded-sm border border-border bg-card px-4 py-3 overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neon-cyan/30 to-transparent" />
          <p className="text-2xl font-bold font-mono text-neon-cyan">{serviceCount}</p>
          <p className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase mt-0.5">Services</p>
        </div>

        <Link href={`${basePath}/objects`}>
          <div className="relative rounded-sm border border-border bg-card px-4 py-3 overflow-hidden hover:border-neon-cyan/30 transition-colors cursor-pointer">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neon-cyan/30 to-transparent" />
            <p className="text-2xl font-bold font-mono text-neon-cyan">{objects.length}</p>
            <p className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase mt-0.5">Objects</p>
          </div>
        </Link>

        <Link href={`${basePath}/env-vars`}>
          <div className="relative rounded-sm border border-border bg-card px-4 py-3 overflow-hidden hover:border-neon-cyan/30 transition-colors cursor-pointer">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neon-cyan/30 to-transparent" />
            <p className="text-2xl font-bold font-mono text-neon-cyan">→</p>
            <p className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase mt-0.5">Env Vars</p>
          </div>
        </Link>
      </div>

      {/* Server list */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-mono tracking-[0.15em] text-neon-cyan/50 uppercase">// SERVERS</p>
          <Button variant="outline" size="sm" asChild>
            <Link href={`${basePath}/servers/new`}>+ Add Server</Link>
          </Button>
        </div>

        {servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-sm border border-dashed border-border/50 py-16 text-center">
            <ServerIcon className="h-8 w-8 text-muted-foreground/20 mb-4" />
            <p className="text-sm font-mono text-muted-foreground/50">// empty</p>
            <p className="text-xs text-muted-foreground/30 mt-1">no servers configured for this environment</p>
            <Button variant="outline" size="sm" className="mt-5" asChild>
              <Link href={`${basePath}/servers/new`}>Add Server</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {servers.map((server) => (
              <Card
                key={server.id}
                className="cursor-pointer hover:border-neon-cyan/20 transition-colors"
                onClick={() => router.push(`${basePath}/servers/${server.id}`)}
              >
                <CardContent className="flex items-center justify-between py-3.5 px-4">
                  <div>
                    <p className="font-medium text-sm text-foreground">{server.name}</p>
                    <p className="font-mono text-xs text-muted-foreground/60 mt-0.5">
                      {server.user}@{server.host}:{server.port}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Badge variant="secondary">{server.auth_type}</Badge>
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 text-neon-magenta/60 hover:text-neon-magenta hover:bg-neon-magenta/8"
                      onClick={(e) => { e.stopPropagation(); setDeleteServer(server) }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <ArrowRight className="h-4 w-4 text-neon-cyan/50" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

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
