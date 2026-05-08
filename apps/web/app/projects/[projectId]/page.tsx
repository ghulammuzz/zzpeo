"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/use-toast"
import { Plus, Globe, ArrowRight, Pencil, Trash2 } from "lucide-react"
import type { Project, Environment, EnvironmentType } from "@/lib/types"

function slugify(str: string): string {
  return str.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "")
}

const ENV_TYPE_VARIANTS: Record<EnvironmentType, "default" | "secondary" | "outline" | "destructive" | "success" | "warning"> = {
  prod: "destructive",
  stg: "warning",
  custom: "secondary",
}

const ENV_TYPE_HOVER: Record<EnvironmentType, string> = {
  prod: "hover:border-neon-magenta/40",
  stg: "hover:border-neon-yellow/40",
  custom: "hover:border-neon-cyan/30",
}

interface PageProps {
  params: { projectId: string }
}

export default function ProjectDetailPage({ params }: PageProps) {
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [loading, setLoading] = useState(true)

  // Project edit
  const [editingProject, setEditingProject] = useState(false)
  const [projName, setProjName] = useState("")
  const [projSlug, setProjSlug] = useState("")
  const [projSlugManual, setProjSlugManual] = useState(false)
  const [projDesc, setProjDesc] = useState("")
  const [savingProject, setSavingProject] = useState(false)

  // Project delete
  const [deletingProject, setDeletingProject] = useState(false)
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(false)

  // Env edit
  const [editEnv, setEditEnv] = useState<Environment | null>(null)
  const [envName, setEnvName] = useState("")
  const [envSlug, setEnvSlug] = useState("")
  const [envSlugManual, setEnvSlugManual] = useState(false)
  const [envType, setEnvType] = useState("")
  const [savingEnv, setSavingEnv] = useState(false)

  // Env delete
  const [deleteEnv, setDeleteEnv] = useState<Environment | null>(null)
  const [deletingEnv, setDeletingEnv] = useState(false)

  const load = async () => {
    try {
      const [proj, envs] = await Promise.all([
        api.projects.get(params.projectId),
        api.environments.list(params.projectId).catch(() => []),
      ])
      setProject(proj)
      setEnvironments(envs)
    } catch {
      router.push("/projects")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [params.projectId])

  const openEditProject = () => {
    if (!project) return
    setProjName(project.name)
    setProjSlug(project.slug)
    setProjDesc(project.description ?? "")
    setProjSlugManual(false)
    setEditingProject(true)
  }

  const handleSaveProject = async () => {
    if (!project) return
    setSavingProject(true)
    try {
      await api.projects.update(project.id, { name: projName, slug: projSlug, description: projDesc || undefined })
      toast({ title: "Project updated" })
      setEditingProject(false)
      await load()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" })
    } finally {
      setSavingProject(false)
    }
  }

  const handleDeleteProject = async () => {
    if (!project) return
    setDeletingProject(true)
    try {
      await api.projects.delete(project.id)
      toast({ title: "Project deleted" })
      router.push("/projects")
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" })
      setDeletingProject(false)
    }
  }

  const openEditEnv = (env: Environment, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditEnv(env)
    setEnvName(env.name)
    setEnvSlug(env.slug)
    setEnvType(env.type)
    setEnvSlugManual(false)
  }

  const handleSaveEnv = async () => {
    if (!editEnv) return
    setSavingEnv(true)
    try {
      await api.environments.update(params.projectId, editEnv.id, { name: envName, slug: envSlug, type: envType as EnvironmentType })
      toast({ title: "Environment updated" })
      setEditEnv(null)
      await load()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" })
    } finally {
      setSavingEnv(false)
    }
  }

  const handleDeleteEnv = async () => {
    if (!deleteEnv) return
    setDeletingEnv(true)
    try {
      await api.environments.delete(params.projectId, deleteEnv.id)
      toast({ title: "Environment deleted" })
      setDeleteEnv(null)
      await load()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" })
    } finally {
      setDeletingEnv(false)
    }
  }

  if (loading || !project) return (
    <div className="flex items-center gap-2 py-12 text-muted-foreground font-mono text-sm">
      <span className="animate-pulse">▌</span>
      <span>loading...</span>
    </div>
  )

  return (
    <div className="space-y-8">
      {/* Project header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-mono tracking-[0.15em] text-neon-cyan/50 uppercase mb-1">// PROJECT</p>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <div className="mt-1.5">
            <span className="font-mono text-xs bg-secondary/60 border border-border px-2 py-0.5 rounded-sm text-muted-foreground">
              {project.slug}
            </span>
          </div>
          {project.description && (
            <p className="text-sm text-muted-foreground/70 mt-2">{project.description}</p>
          )}
          <p className="font-mono text-xs text-muted-foreground/40 mt-2">
            created {new Date(project.created_at).toLocaleDateString()} · updated {new Date(project.updated_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={openEditProject}>
            <Pencil className="h-3.5 w-3.5 mr-1" />
            Edit
          </Button>
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDeleteProject(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
          <Button asChild>
            <Link href={`/projects/${params.projectId}/environments/new`}>
              <Plus className="h-4 w-4 mr-2" />
              New Environment
            </Link>
          </Button>
        </div>
      </div>

      {/* Environments */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <p className="text-[10px] font-mono tracking-[0.15em] text-neon-cyan/50 uppercase">// ENVIRONMENTS</p>
          <span className="font-mono text-xs text-muted-foreground/50">({environments.length})</span>
        </div>

        {environments.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-sm border border-dashed border-border/50 py-16 text-center">
            <Globe className="h-8 w-8 text-muted-foreground/20 mb-4" />
            <p className="text-sm font-mono text-muted-foreground/50">// empty</p>
            <p className="text-xs text-muted-foreground/30 mt-1">No environments yet — add prod, staging, or custom</p>
            <Button variant="outline" size="sm" className="mt-5" asChild>
              <Link href={`/projects/${params.projectId}/environments/new`}>
                <Plus className="h-4 w-4 mr-2" />Create Environment
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {environments.map((env) => (
              <Card
                key={env.id}
                className={`relative group cursor-pointer transition-colors p-4 flex flex-col gap-3 ${ENV_TYPE_HOVER[env.type]}`}
                onClick={() => router.push(`/projects/${params.projectId}/environments/${env.id}`)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">{env.name}</p>
                    <p className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">{env.slug}</p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Badge variant={ENV_TYPE_VARIANTS[env.type]} className="text-[10px] px-1.5 py-0 h-4">{env.type}</Badge>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/50 hover:text-foreground"
                      onClick={(e) => openEditEnv(env, e)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/50 hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); setDeleteEnv(env) }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-end mt-auto pt-1 border-t border-border/40">
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-neon-cyan/60 transition-colors" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit project dialog */}
      <Dialog open={editingProject} onOpenChange={(open) => !open && setEditingProject(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Project</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={projName}
                onChange={(e) => { setProjName(e.target.value); if (!projSlugManual) setProjSlug(slugify(e.target.value)) }}
              />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input
                value={projSlug}
                onChange={(e) => { setProjSlugManual(true); setProjSlug(e.target.value) }}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={projDesc} onChange={(e) => setProjDesc(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProject(false)}>Cancel</Button>
            <Button onClick={handleSaveProject} disabled={savingProject}>{savingProject ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeleteProject}
        onOpenChange={(open) => !open && setConfirmDeleteProject(false)}
        title="// DELETE PROJECT"
        description={<>Delete <strong className="text-foreground">{project.name}</strong>? All environments, servers, services, and deployments will be lost. This cannot be undone.</>}
        confirmText="Delete Project"
        variant="destructive"
        loading={deletingProject}
        loadingText="Deleting..."
        onConfirm={handleDeleteProject}
      />

      {/* Edit env dialog */}
      <Dialog open={!!editEnv} onOpenChange={(open) => !open && setEditEnv(null)}>
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
            <Button variant="outline" onClick={() => setEditEnv(null)}>Cancel</Button>
            <Button onClick={handleSaveEnv} disabled={savingEnv}>{savingEnv ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete env dialog */}
      <Dialog open={!!deleteEnv} onOpenChange={(open) => !open && setDeleteEnv(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Environment</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <strong>{deleteEnv?.name}</strong>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteEnv(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteEnv} disabled={deletingEnv}>
              {deletingEnv ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
