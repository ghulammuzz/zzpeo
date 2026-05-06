"use client"

import { useState, useEffect } from "react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/use-toast"
import { Plus, Trash2, Pencil, Package } from "lucide-react"
import type { ObjectItem, ObjectType } from "@/lib/types"

interface PageProps {
  params: { projectId: string; envId: string }
}

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

  const handleDelete = async (objectId: string) => {
    try {
      await api.objects.delete(params.envId, objectId)
      toast({ title: "Object deleted" })
      await load()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to delete", variant: "destructive" })
    }
  }

  if (loading) return <div className="text-muted-foreground py-8">Loading objects...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Objects</h1>
          <p className="text-muted-foreground text-sm mt-1">Databases, queues, caches and other external resources.</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Object
        </Button>
      </div>

      {objects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Package className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-semibold">No objects yet</h3>
          <p className="text-muted-foreground text-sm mt-1 mb-4">Add databases, message queues, and other external resources.</p>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-2" />Add Object
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>Port</TableHead>
                <TableHead>Database</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {objects.map((obj) => (
                <TableRow key={obj.id}>
                  <TableCell className="font-medium">{obj.name}</TableCell>
                  <TableCell><Badge variant="secondary">{obj.object_type_name}</Badge></TableCell>
                  <TableCell className="font-mono text-sm">{obj.host ?? "-"}</TableCell>
                  <TableCell className="font-mono text-sm">{obj.port ?? "-"}</TableCell>
                  <TableCell className="font-mono text-sm">{obj.database_name ?? "-"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(obj)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(obj.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Object</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="My Database" required />
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
                <Input value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} placeholder="localhost" className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label>Port</Label>
                <Input value={form.port} onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))} placeholder="5432" type="number" className="font-mono" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Database Name</Label>
              <Input value={form.database_name} onChange={(e) => setForm((f) => ({ ...f, database_name: e.target.value }))} placeholder="mydb" className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." rows={2} />
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
              <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
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
                <Input value={editForm.host} onChange={(e) => setEditForm((f) => ({ ...f, host: e.target.value }))} className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label>Port</Label>
                <Input value={editForm.port} onChange={(e) => setEditForm((f) => ({ ...f, port: e.target.value }))} type="number" className="font-mono" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Database Name</Label>
              <Input value={editForm.database_name} onChange={(e) => setEditForm((f) => ({ ...f, database_name: e.target.value }))} className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditObject(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
