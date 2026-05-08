"use client"

import { useState, useEffect } from "react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/use-toast"
import { Plus, Trash2, Pencil, Package } from "lucide-react"
import type { ObjectItem, ObjectType } from "@/lib/types"

interface PageProps { params: { projectId: string; envId: string } }
const emptyForm = { name: "", object_type_id: "", host: "", port: "", database_name: "", notes: "" }

export default function ObjectsPage({ params }: PageProps) {
  const [objects, setObjects] = useState<ObjectItem[]>([])
  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([])
  const [loading, setLoading] = useState(true)

  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [submitting, setSubmitting] = useState(false)

  const [editObject, setEditObject] = useState<ObjectItem | null>(null)
  const [editForm, setEditForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)

  const [deleteObject, setDeleteObject] = useState<ObjectItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [obs, types] = await Promise.all([
        api.objects.list(params.envId),
        api.objects.types(),
      ])
      setObjects(obs)
      setObjectTypes(types)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [params.envId])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await api.objects.create(params.envId, {
        name: form.name,
        object_type_id: form.object_type_id,
        host: form.host || undefined,
        port: form.port ? parseInt(form.port) : undefined,
        database_name: form.database_name || undefined,
        notes: form.notes || undefined,
      })
      toast({ title: "Object created" })
      setShowAdd(false)
      setForm({ ...emptyForm })
      await load()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to create object", variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  const openEdit = (obj: ObjectItem) => {
    setEditObject(obj)
    setEditForm({
      name: obj.name,
      object_type_id: obj.object_type_id,
      host: obj.host ?? "",
      port: obj.port != null ? String(obj.port) : "",
      database_name: obj.database_name ?? "",
      notes: obj.notes ?? "",
    })
  }

  const handleSaveEdit = async () => {
    if (!editObject) return
    setSaving(true)
    try {
      await api.objects.update(params.envId, editObject.id, {
        name: editForm.name,
        object_type_id: editForm.object_type_id,
        host: editForm.host || undefined,
        port: editForm.port ? parseInt(editForm.port) : undefined,
        database_name: editForm.database_name || undefined,
        notes: editForm.notes || undefined,
      })
      toast({ title: "Object updated" })
      setEditObject(null)
      await load()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to update", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteObject) return
    setDeleting(true)
    try {
      await api.objects.delete(params.envId, deleteObject.id)
      toast({ title: "Object deleted" })
      setDeleteObject(null)
      await load()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to delete", variant: "destructive" })
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-muted-foreground font-mono text-sm">
        <span className="animate-pulse">▌</span><span>loading...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-mono tracking-[0.15em] text-neon-cyan/50 uppercase mb-1">// OBJECTS</p>
          <h1 className="text-xl font-bold">Objects</h1>
          <p className="text-xs text-muted-foreground/60 font-mono mt-0.5">
            databases, queues, caches · external resources
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Object
        </Button>
      </div>

      {/* Card grid or empty state */}
      {objects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-sm border border-dashed border-border/50 py-16 text-center">
          <Package className="h-8 w-8 text-muted-foreground/20 mb-4" />
          <p className="text-sm font-mono text-muted-foreground/50">// no objects</p>
          <p className="text-xs text-muted-foreground/30 mt-1">add databases, message queues, and other external resources</p>
          <Button variant="outline" size="sm" className="mt-5" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Object
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {objects.map((obj) => (
            <div
              key={obj.id}
              className="group relative rounded-sm border border-border bg-card overflow-hidden hover:border-neon-green/30 transition-colors cursor-default"
            >
              {/* Top accent line */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neon-green/30 to-transparent" />
              <div className="p-4">
                {/* Top row: name + type badge + actions */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="font-semibold text-sm text-foreground">{obj.name}</p>
                    <Badge variant="success" className="mt-1">{obj.object_type_name}</Badge>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEdit(obj)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-neon-magenta hover:text-neon-magenta hover:bg-neon-magenta/8"
                      onClick={() => setDeleteObject(obj)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {/* Connection info */}
                {(obj.host || obj.port) && (
                  <p className="font-mono text-xs text-neon-cyan/70 mb-1">
                    {obj.host}{obj.port ? `:${obj.port}` : ""}
                  </p>
                )}
                {obj.database_name && (
                  <p className="font-mono text-xs text-muted-foreground/50">{obj.database_name}</p>
                )}
                {obj.notes && (
                  <p className="text-xs text-muted-foreground/40 mt-2 line-clamp-2">{obj.notes}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Object</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="My Database"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.object_type_id} onValueChange={(v) => setForm((f) => ({ ...f, object_type_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                <SelectContent>
                  {objectTypes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label>Host</Label>
                <Input
                  value={form.host}
                  onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                  placeholder="localhost"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Port</Label>
                <Input
                  value={form.port}
                  onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
                  placeholder="5432"
                  type="number"
                  className="font-mono"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Database Name</Label>
              <Input
                value={form.database_name}
                onChange={(e) => setForm((f) => ({ ...f, database_name: e.target.value }))}
                placeholder="mydb"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes..."
                rows={2}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>{submitting ? "Creating..." : "Create Object"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editObject} onOpenChange={(open) => !open && setEditObject(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Object</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={editForm.object_type_id} onValueChange={(v) => setEditForm((f) => ({ ...f, object_type_id: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {objectTypes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label>Host</Label>
                <Input
                  value={editForm.host}
                  onChange={(e) => setEditForm((f) => ({ ...f, host: e.target.value }))}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Port</Label>
                <Input
                  value={editForm.port}
                  onChange={(e) => setEditForm((f) => ({ ...f, port: e.target.value }))}
                  type="number"
                  className="font-mono"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Database Name</Label>
              <Input
                value={editForm.database_name}
                onChange={(e) => setEditForm((f) => ({ ...f, database_name: e.target.value }))}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditObject(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteObject}
        onOpenChange={(open) => !open && setDeleteObject(null)}
        title="// DELETE OBJECT"
        description={<>Delete object <strong className="text-foreground">{deleteObject?.name}</strong>? All service links to this object will be removed.</>}
        confirmText="Delete Object"
        variant="destructive"
        loading={deleting}
        loadingText="Deleting..."
        onConfirm={handleDelete}
      />
    </div>
  )
}
