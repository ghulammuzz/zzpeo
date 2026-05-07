"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/use-toast"
import { Plus, FolderKanban, ArrowRight, Pencil, Trash2 } from "lucide-react"
import type { Project } from "@/lib/types"

function slugify(str: string): string {
  return str.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "")
}

export default function ProjectListPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  const [editProject, setEditProject] = useState<Project | null>(null)
  const [editName, setEditName] = useState("")
  const [editSlug, setEditSlug] = useState("")
  const [editSlugManual, setEditSlugManual] = useState(false)
  const [editDescription, setEditDescription] = useState("")
  const [saving, setSaving] = useState(false)

  const [deleteProject, setDeleteProject] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = async () => {
    try {
      setProjects(await api.projects.list())
    } catch {
      setProjects([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openEdit = (p: Project, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditProject(p)
    setEditName(p.name)
    setEditSlug(p.slug)
    setEditDescription(p.description ?? "")
    setEditSlugManual(false)
  }

  const handleEditSave = async () => {
    if (!editProject) return
    setSaving(true)
    try {
      await api.projects.update(editProject.id, { name: editName, slug: editSlug, description: editDescription || undefined })
      toast({ title: "Project updated" })
      setEditProject(null)
      await load()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteProject) return
    setDeleting(true)
    try {
      await api.projects.delete(deleteProject.id)
      toast({ title: "Project deleted" })
      setDeleteProject(null)
      await load()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" })
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return (
    <div className="flex items-center gap-2 py-12 text-muted-foreground font-mono text-sm">
      <span className="animate-pulse">▌</span>
      <span>loading...</span>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-mono tracking-[0.15em] text-neon-cyan/50 uppercase mb-1">// PROJECTS</p>
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-bold">Projects</h1>
            <span className="font-mono text-sm text-muted-foreground/60">({projects.length})</span>
          </div>
          <p className="text-xs text-muted-foreground/70 mt-0.5">Manage your deployment projects</p>
        </div>
        <Button asChild>
          <Link href="/projects/new">
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Link>
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-sm border border-dashed border-border/50 py-16 text-center">
          <FolderKanban className="h-8 w-8 text-muted-foreground/20 mb-4" />
          <p className="text-sm font-mono text-muted-foreground/50">// empty</p>
          <p className="text-xs text-muted-foreground/30 mt-1">No projects yet — create one to get started</p>
          <Button variant="outline" size="sm" className="mt-5" asChild>
            <Link href="/projects/new"><Plus className="h-4 w-4 mr-2" />Create Project</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="relative group cursor-pointer transition-colors hover:border-neon-cyan/30 p-4 flex flex-col gap-3"
              onClick={() => router.push(`/projects/${project.id}`)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-base text-foreground truncate">{project.name}</p>
                  <p className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">{project.slug}</p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/50 hover:text-foreground"
                    onClick={(e) => openEdit(project, e)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/50 hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); setDeleteProject(project) }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {project.description && (
                <p className="text-xs text-muted-foreground/70 line-clamp-2">{project.description}</p>
              )}

              <div className="flex items-center justify-between mt-auto pt-1 border-t border-border/40">
                <span className="text-[10px] font-mono text-muted-foreground/40">
                  {new Date(project.created_at).toLocaleDateString()}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-neon-cyan/40 group-hover:text-neon-cyan/70 transition-colors" />
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editProject} onOpenChange={(open) => !open && setEditProject(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Project</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={editName}
                onChange={(e) => { setEditName(e.target.value); if (!editSlugManual) setEditSlug(slugify(e.target.value)) }}
              />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input
                value={editSlug}
                onChange={(e) => { setEditSlugManual(true); setEditSlug(e.target.value) }}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProject(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteProject} onOpenChange={(open) => !open && setDeleteProject(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Project</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <strong>{deleteProject?.name}</strong>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteProject(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
