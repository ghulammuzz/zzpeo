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

  if (loading || !project) return <div className="text-muted-foreground py-8">Loading...</div>

  return (
    <div className="space-y-6">
      {/* Project header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <p className="font-mono text-sm text-muted-foreground mt-0.5">{project.slug}</p>
          {project.description && (
            <p className="text-sm text-muted-foreground mt-2">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
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
        <h2 className="text-lg font-semibold mb-3">Environments</h2>
        {environments.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
            <Globe className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold">No environments yet</h3>
            <p className="text-muted-foreground text-sm mt-1 mb-4">
              Add environments like production, staging, or custom setups.
            </p>
            <Button asChild>
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
                className="h-full transition-shadow hover:shadow-md cursor-pointer"
                onClick={() => router.push(`/projects/${params.projectId}/environments/${env.id}`)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{env.name}</CardTitle>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={(e) => openEditEnv(env, e)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteEnv(env) }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <ArrowRight className="h-4 w-4 text-muted-foreground ml-1" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Badge variant={ENV_TYPE_VARIANTS[env.type]}>{env.type}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{env.slug}</span>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Metadata */}
      <Card>
        <CardContent className="pt-6">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground font-medium">Project ID</dt>
              <dd className="font-mono text-xs mt-1">{project.id}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground font-medium">Environments</dt>
              <dd className="mt-1">{environments.length}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground font-medium">Created</dt>
              <dd className="mt-1">{new Date(project.created_at).toLocaleDateString()}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground font-medium">Updated</dt>
              <dd className="mt-1">{new Date(project.updated_at).toLocaleDateString()}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

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

      {/* Delete project dialog */}
      <Dialog open={confirmDeleteProject} onOpenChange={(open) => !open && setConfirmDeleteProject(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Project</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <strong>{project.name}</strong>? All environments and data will be lost. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteProject(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteProject} disabled={deletingProject}>
              {deletingProject ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
