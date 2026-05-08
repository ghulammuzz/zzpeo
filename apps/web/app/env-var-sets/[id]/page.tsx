"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/use-toast"
import { Pencil, Trash2, KeyRound, X, Plus, ExternalLink } from "lucide-react"
import { EnvVarsEditor } from "@/components/shared/EnvVarsEditor"
import type { EnvVarSet, GlobalService, LinkedEnvVarSet } from "@/lib/types"

interface PageProps {
  params: { id: string }
}

const DEPLOY_MODE_LABEL: Record<string, string> = {
  all: "both",
  build_arg: "build_arg",
  runtime: "runtime",
  both: "both",
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

  // Linked services
  const [linkedServices, setLinkedServices] = useState<Array<{ service: GlobalService; deploy_mode: string }>>([])
  const [allServices, setAllServices] = useState<GlobalService[]>([])
  const [loadingServices, setLoadingServices] = useState(false)
  const [linkServiceId, setLinkServiceId] = useState("")
  const [linkDeployMode, setLinkDeployMode] = useState("all")
  const [linkingService, setLinkingService] = useState(false)
  const [unlinkingServiceId, setUnlinkingServiceId] = useState<string | null>(null)

  const loadSet = useCallback(async () => {
    try {
      setSet(await api.envVarSets.get(params.id))
    } catch {
      router.push("/env-var-sets")
    } finally {
      setLoading(false)
    }
  }, [params.id, router])

  const loadLinkedServices = useCallback(async () => {
    setLoadingServices(true)
    try {
      const allSvcs = await api.global.listServices()
      setAllServices(allSvcs)
      const byService = await Promise.all(
        allSvcs.map((svc) =>
          api.envVarSets.listLinkedSets(svc.id)
            .then((linked) => ({ svc, linked }))
            .catch(() => ({ svc, linked: [] as LinkedEnvVarSet[] }))
        )
      )
      const linked: Array<{ service: GlobalService; deploy_mode: string }> = []
      for (const { svc, linked: sets } of byService) {
        const match = sets.find((s) => s.id === params.id)
        if (match) linked.push({ service: svc, deploy_mode: match.deploy_mode })
      }
      setLinkedServices(linked)
    } catch {} finally {
      setLoadingServices(false)
    }
  }, [params.id])

  useEffect(() => {
    loadSet()
    loadLinkedServices()
  }, [loadSet, loadLinkedServices])

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

  const handleLinkService = async () => {
    if (!linkServiceId) return
    setLinkingService(true)
    try {
      await api.envVarSets.linkService(linkServiceId, params.id, linkDeployMode)
      setLinkServiceId("")
      await loadLinkedServices()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to link", variant: "destructive" })
    } finally {
      setLinkingService(false)
    }
  }

  const handleUnlinkService = async (serviceId: string) => {
    setUnlinkingServiceId(serviceId)
    try {
      await api.envVarSets.unlinkService(serviceId, params.id)
      await loadLinkedServices()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to unlink", variant: "destructive" })
    } finally {
      setUnlinkingServiceId(null)
    }
  }

  const handleUpdateMode = async (serviceId: string, newMode: string) => {
    try {
      await api.envVarSets.updateLinkMode(serviceId, params.id, newMode)
      setLinkedServices((prev) =>
        prev.map((ls) => ls.service.id === serviceId ? { ...ls, deploy_mode: newMode } : ls)
      )
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to update mode", variant: "destructive" })
    }
  }

  if (loading || !set) return (
    <div className="flex items-center gap-2 py-12 text-muted-foreground font-mono text-sm">
      <span className="animate-pulse">▌</span><span>loading...</span>
    </div>
  )

  const linkedServiceIds = new Set(linkedServices.map((ls) => ls.service.id))
  const availableServices = allServices.filter((s) => !linkedServiceIds.has(s.id))

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-mono tracking-[0.15em] text-neon-cyan/50 uppercase mb-1">// ENV VAR SET</p>
          <div className="flex items-center gap-2.5">
            <KeyRound className="h-5 w-5 text-neon-cyan/60" />
            <h1 className="text-xl font-bold">{set.name}</h1>
          </div>
          {set.description && (
            <p className="text-xs text-muted-foreground/60 font-mono mt-1 ml-7">{set.description}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => { setEditName(set.name); setEditDesc(set.description ?? ""); setEditingMeta(true) }}
          >
            <Pencil className="h-3.5 w-3.5 mr-1" />
            Edit
          </Button>
          <Button
            variant="destructive" size="sm"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
        </div>
      </div>

      {/* Two-column layout: vars + linked services */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">

        {/* Env vars — wider column */}
        <div className="lg:col-span-3">
          <Card>
            <CardContent className="pt-5">
              <p className="text-[10px] font-mono tracking-[0.15em] text-neon-cyan/50 uppercase mb-4">// VARIABLES</p>
              <EnvVarsEditor
                loadFn={loadRows}
                revealFn={revealRows}
                saveFn={saveRows}
                deleteFn={deleteRow}
              />
            </CardContent>
          </Card>
        </div>

        {/* Linked services — narrower column */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-mono tracking-[0.15em] text-neon-cyan/50 uppercase">// LINKED SERVICES</p>
                {linkedServices.length > 0 && (
                  <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm border border-neon-cyan/30 bg-neon-cyan/8 text-neon-cyan/70">
                    {linkedServices.length}
                  </span>
                )}
              </div>

              {loadingServices ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-14 rounded-sm bg-muted/30 animate-pulse" />
                  ))}
                </div>
              ) : linkedServices.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {linkedServices.map(({ service: svc, deploy_mode }) => (
                    <div
                      key={svc.id}
                      className="flex items-start gap-2 rounded-sm border border-border bg-secondary/20 px-3 py-2.5"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-foreground truncate">{svc.name}</p>
                          <Link
                            href={`/projects/${svc.project_id}/environments/${svc.env_id}/servers/${svc.server_id}/services/${svc.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground/30 hover:text-neon-cyan/60 transition-colors flex-shrink-0"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </div>
                        <p className="text-[10px] font-mono text-muted-foreground/40 truncate mt-0.5">
                          {svc.project_name} / {svc.env_name}
                        </p>
                        <div className="mt-1.5">
                          <Select value={deploy_mode} onValueChange={(v) => handleUpdateMode(svc.id, v)}>
                            <SelectTrigger className="h-6 w-[110px] text-[10px] font-mono">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">both</SelectItem>
                              <SelectItem value="runtime">runtime</SelectItem>
                              <SelectItem value="build_arg">build_arg</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <button
                        disabled={unlinkingServiceId === svc.id}
                        onClick={() => handleUnlinkService(svc.id)}
                        className="flex-shrink-0 mt-0.5 p-1 rounded-sm text-muted-foreground/30 hover:text-neon-magenta hover:bg-neon-magenta/8 disabled:opacity-30 transition-all"
                        title="Unlink"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs font-mono text-muted-foreground/30 mb-4">// no services linked</p>
              )}

              {/* Link to service */}
              <div className={`space-y-2 ${linkedServices.length > 0 ? "pt-3 border-t border-border/50" : ""}`}>
                <p className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-wider">attach to service</p>
                {availableServices.length === 0 && !loadingServices ? (
                  <p className="text-[10px] font-mono text-muted-foreground/30">
                    {allServices.length === 0 ? "// no services found" : "// all services linked"}
                  </p>
                ) : (
                  <div className="space-y-2">
                    <Select value={linkServiceId} onValueChange={setLinkServiceId} disabled={loadingServices}>
                      <SelectTrigger className="w-full text-xs">
                        <SelectValue placeholder="select service..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableServices.map((svc) => (
                          <SelectItem key={svc.id} value={svc.id}>
                            <span className="text-muted-foreground/50 text-xs mr-1">
                              {svc.project_name}/{svc.env_name}:
                            </span>
                            {svc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Select value={linkDeployMode} onValueChange={setLinkDeployMode}>
                        <SelectTrigger className="flex-1 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">both</SelectItem>
                          <SelectItem value="runtime">runtime</SelectItem>
                          <SelectItem value="build_arg">build_arg</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        onClick={handleLinkService}
                        disabled={!linkServiceId || linkingService}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        {linkingService ? "linking..." : "link"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

            </CardContent>
          </Card>
        </div>
      </div>

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
