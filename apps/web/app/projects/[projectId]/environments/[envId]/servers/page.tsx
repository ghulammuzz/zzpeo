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
import { toast } from "@/components/ui/use-toast"
import { Plus, Server as ServerIcon, ArrowRight, Pencil, Trash2 } from "lucide-react"
import type { Server } from "@/lib/types"

interface PageProps {
  params: { projectId: string; envId: string }
}

export default function ServersPage({ params }: PageProps) {
  const router = useRouter()
  const [servers, setServers] = useState<Server[]>([])
  const [loading, setLoading] = useState(true)

  const [editServer, setEditServer] = useState<Server | null>(null)
  const [srvName, setSrvName] = useState("")
  const [srvHost, setSrvHost] = useState("")
  const [srvPort, setSrvPort] = useState("")
  const [srvUser, setSrvUser] = useState("")
  const [saving, setSaving] = useState(false)

  const [deleteServer, setDeleteServer] = useState<Server | null>(null)
  const [deleting, setDeleting] = useState(false)

  const basePath = `/projects/${params.projectId}/environments/${params.envId}`

  const load = async () => {
    try {
      setServers((await api.servers.list(params.envId)) ?? [])
    } catch {
      setServers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [params.envId])

  const openEdit = (srv: Server, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditServer(srv)
    setSrvName(srv.name)
    setSrvHost(srv.host)
    setSrvPort(String(srv.port))
    setSrvUser(srv.user)
  }

  const handleSaveEdit = async () => {
    if (!editServer) return
    setSaving(true)
    try {
      await api.servers.update(params.envId, editServer.id, {
        name: srvName,
        host: srvHost,
        port: parseInt(srvPort) || editServer.port,
        user: srvUser,
      })
      toast({ title: "Server updated" })
      setEditServer(null)
      await load()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteServer) return
    setDeleting(true)
    try {
      await api.servers.delete(params.envId, deleteServer.id)
      toast({ title: "Server deleted" })
      setDeleteServer(null)
      await load()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" })
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <div className="text-muted-foreground py-8">Loading servers...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Servers</h1>
          <p className="text-muted-foreground text-sm mt-1">SSH-connected servers in this environment</p>
        </div>
        <Button asChild>
          <Link href={`${basePath}/servers/new`}>
            <Plus className="h-4 w-4 mr-2" />
            Add Server
          </Link>
        </Button>
      </div>

      {servers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <ServerIcon className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-semibold">No servers yet</h3>
          <p className="text-muted-foreground text-sm mt-1 mb-4">
            Add a server to start deploying services.
          </p>
          <Button asChild>
            <Link href={`${basePath}/servers/new`}>
              <Plus className="h-4 w-4 mr-2" />
              Add Server
            </Link>
          </Button>
        </div>
      ) : (
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
                  {server.fingerprint && (
                    <Badge variant="secondary" className="text-xs">verified</Badge>
                  )}
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    onClick={(e) => openEdit(server, e)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
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
      )}

      {/* Edit dialog */}
      <Dialog open={!!editServer} onOpenChange={(open) => !open && setEditServer(null)}>
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
            <Button variant="outline" onClick={() => setEditServer(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleteServer} onOpenChange={(open) => !open && setDeleteServer(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Server</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <strong>{deleteServer?.name}</strong>? All services will be removed. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteServer(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
