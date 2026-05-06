"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "@/components/ui/use-toast"
import { Pencil, Trash2, KeyRound, Link2 } from "lucide-react"
import { EnvVarsEditor } from "@/components/shared/EnvVarsEditor"
import type { EnvVarSet } from "@/lib/types"

interface PageProps {
  params: { id: string }
}

export default function EnvVarSetDetailPage({ params }: PageProps) {
  const router = useRouter()
  const [set, setSet] = useState<EnvVarSet | null>(null)
  const [loading, setLoading] = useState(true)

  // Edit meta
  const [editingMeta, setEditingMeta] = useState(false)
  const [editName, setEditName] = useState("")
  const [editDesc, setEditDesc] = useState("")
  const [savingMeta, setSavingMeta] = useState(false)

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const loadSet = useCallback(async () => {
    try {
      setSet(await api.envVarSets.get(params.id))
    } catch {
      router.push("/env-var-sets")
    } finally {
      setLoading(false)
    }
  }, [params.id, router])

  useEffect(() => { loadSet() }, [loadSet])

  // EnvVarsEditor bindings
  const loadRows = useCallback(
    () => api.envVarSets.listItems(params.id),
    [params.id],
  )
  const revealRows = useCallback(
    () => api.envVarSets.revealItems(params.id),
    [params.id],
  )
  const saveRows = useCallback(
    (items: { key: string; value: string }[]) =>
      api.envVarSets.upsertItems(params.id, items) as Promise<void>,
    [params.id],
  )
  const deleteRow = useCallback(
    (key: string) => api.envVarSets.deleteItem(params.id, key),
    [params.id],
  )

  const handleSaveMeta = async () => {
    if (!set) return
    setSavingMeta(true)
    try {
      await api.envVarSets.update(params.id, { name: editName, description: editDesc || undefined })
      toast({ title: "Updated" })
      setEditingMeta(false)
      await loadSet()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" })
    } finally {
      setSavingMeta(false)
    }
  }

  const handleDeleteSet = async () => {
    setDeleting(true)
    try {
      await api.envVarSets.delete(params.id)
      toast({ title: "Deleted" })
      router.push("/env-var-sets")
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" })
      setDeleting(false)
    }
  }

  if (loading || !set) return <div className="text-muted-foreground py-8">Loading...</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <KeyRound className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-bold">{set.name}</h1>
            {set.description && (
              <p className="text-muted-foreground text-sm mt-0.5">{set.description}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => { setEditName(set.name); setEditDesc(set.description ?? ""); setEditingMeta(true) }}
          >
            <Pencil className="h-3.5 w-3.5 mr-1" />
            Edit
          </Button>
          <Button
            variant="outline" size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
        </div>
      </div>

      {/* Variables */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Environment Variables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EnvVarsEditor
            loadFn={loadRows}
            revealFn={revealRows}
            saveFn={saveRows}
            deleteFn={deleteRow}
          />
        </CardContent>
      </Card>

      {/* Usage hint */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Linking to Services
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Link this set to services from the service detail page. All variables will be injected at deploy time. Service-level variables take precedence on key conflicts.
          </p>
        </CardContent>
      </Card>

      {/* Edit meta dialog */}
      <Dialog open={editingMeta} onOpenChange={(o) => !o && setEditingMeta(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Env Var Set</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMeta(false)}>Cancel</Button>
            <Button onClick={handleSaveMeta} disabled={savingMeta}>{savingMeta ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Env Var Set</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <strong>{set.name}</strong>? All variables and service links will be removed. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteSet} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
