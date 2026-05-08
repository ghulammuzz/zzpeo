"use client"

import { useState, useEffect } from "react"
import { api, type AdminUser, type UserPermission } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "@/components/ui/use-toast"
import { Plus, Trash2, Copy, Check, RefreshCw, Shield, User, KeyRound, Lock } from "lucide-react"
import type { Project } from "@/lib/types"

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  // Create
  const [showCreate, setShowCreate] = useState(false)
  const [newUsername, setNewUsername] = useState("")
  const [newRole, setNewRole] = useState("user")
  const [creating, setCreating] = useState(false)
  const [createdRegUrl, setCreatedRegUrl] = useState<string | null>(null)

  // Permissions
  const [permUser, setPermUser] = useState<AdminUser | null>(null)
  const [perms, setPerms] = useState<UserPermission[]>([])
  const [permProjectIds, setPermProjectIds] = useState<Set<string>>(new Set())
  const [savingPerms, setSavingPerms] = useState(false)

  // Copy tracking
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [u, p] = await Promise.all([api.admin.listUsers(), api.projects.list()])
      setUsers(u)
      setProjects(p)
    } catch {
      toast({ title: "Failed to load", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openPerms = async (user: AdminUser) => {
    setPermUser(user)
    const p = await api.admin.listPermissions(user.id).catch(() => [])
    setPerms(p)
    setPermProjectIds(new Set(p.map((x) => x.project_id)))
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUsername.trim()) return
    setCreating(true)
    try {
      const user = await api.admin.createUser({ username: newUsername.trim(), role: newRole })
      setCreatedRegUrl(user.reg_url ?? null)
      setNewUsername("")
      setNewRole("user")
      await load()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.admin.deleteUser(id)
      await load()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" })
    }
  }

  const handleRegen = async (id: string) => {
    try {
      const res = await api.admin.regenerateToken(id)
      await load()
      setCreatedRegUrl(res.reg_url)
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" })
    }
  }

  const handleSavePerms = async () => {
    if (!permUser) return
    setSavingPerms(true)
    try {
      await api.admin.setPermissions(permUser.id, Array.from(permProjectIds))
      toast({ title: "Permissions saved" })
      setPermUser(null)
      await load()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" })
    } finally {
      setSavingPerms(false)
    }
  }

  const copyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const toggleProject = (pid: string) => {
    setPermProjectIds((prev) => {
      const next = new Set(prev)
      if (next.has(pid)) next.delete(pid)
      else next.add(pid)
      return next
    })
  }

  if (loading) return (
    <div className="flex items-center gap-2 py-12 text-muted-foreground font-mono text-sm">
      <span className="animate-pulse">▌</span><span>loading...</span>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-mono tracking-[0.15em] text-neon-cyan/50 uppercase mb-1">// ADMIN</p>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Shield className="h-5 w-5 text-neon-cyan/60" />
            User Management
          </h1>
          <p className="text-xs text-muted-foreground/60 font-mono mt-0.5">
            {users.length} user{users.length !== 1 ? "s" : ""} · manage access and permissions
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add User
        </Button>
      </div>

      {/* Registration URL banner */}
      {createdRegUrl && (
        <div
          className="rounded-sm border p-4 space-y-2"
          style={{ borderColor: "rgba(0,229,255,0.3)", background: "rgba(0,229,255,0.05)" }}
        >
          <p className="text-xs font-mono text-neon-cyan/70">// registration link — share with user</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-xs text-neon-cyan/80 truncate bg-background/50 border border-border/50 rounded-sm px-2 py-1">
              {createdRegUrl}
            </code>
            <Button size="sm" variant="outline" onClick={() => copyUrl(createdRegUrl, "banner")}>
              {copiedId === "banner" ? <Check className="h-3.5 w-3.5 text-neon-green" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreatedRegUrl(null)}>
              ✕
            </Button>
          </div>
        </div>
      )}

      {/* Users list */}
      <div className="space-y-2">
        {users.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-sm border border-dashed border-border/50 py-16 text-center">
            <User className="h-8 w-8 text-muted-foreground/20 mb-4" />
            <p className="text-sm font-mono text-muted-foreground/50">// no users</p>
          </div>
        ) : users.map((u) => (
          <Card key={u.id} className="hover:border-neon-cyan/20 transition-colors">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                {/* User icon */}
                <div
                  className="flex-shrink-0 w-8 h-8 rounded-sm flex items-center justify-center"
                  style={{
                    background: u.role === "admin" ? "rgba(0,229,255,0.1)" : "rgba(77,159,255,0.1)",
                    border: `1px solid ${u.role === "admin" ? "rgba(0,229,255,0.3)" : "rgba(77,159,255,0.2)"}`,
                  }}
                >
                  {u.role === "admin"
                    ? <Shield className="h-4 w-4" style={{ color: "#00e5ff" }} />
                    : <User className="h-4 w-4" style={{ color: "#4d9fff" }} />
                  }
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">{u.username}</span>
                    <span
                      className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm border tracking-wider uppercase"
                      style={{
                        borderColor: u.role === "admin" ? "rgba(0,229,255,0.4)" : "rgba(77,159,255,0.3)",
                        color: u.role === "admin" ? "#00e5ff" : "#4d9fff",
                        background: u.role === "admin" ? "rgba(0,229,255,0.08)" : "rgba(77,159,255,0.08)",
                      }}
                    >
                      {u.role}
                    </span>
                    {u.registered ? (
                      <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm border border-neon-green/30 bg-neon-green/8 text-neon-green tracking-wider">
                        active
                      </span>
                    ) : (
                      <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm border border-neon-yellow/30 bg-neon-yellow/8 text-neon-yellow tracking-wider">
                        pending
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-[10px] text-muted-foreground/40 mt-0.5">
                    {new Date(u.created_at).toLocaleDateString()}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Permissions (user role only) */}
                  {u.role === "user" && (
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => openPerms(u)}
                      title="Manage permissions"
                    >
                      <Lock className="h-3.5 w-3.5 text-neon-cyan/60" />
                    </Button>
                  )}

                  {/* Registration link */}
                  {!u.registered && u.reg_url && (
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => copyUrl(u.reg_url!, u.id)}
                      title="Copy registration link"
                    >
                      {copiedId === u.id
                        ? <Check className="h-3.5 w-3.5 text-neon-green" />
                        : <Copy className="h-3.5 w-3.5 text-muted-foreground/50" />
                      }
                    </Button>
                  )}
                  {!u.registered && (
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => handleRegen(u.id)}
                      title="Regenerate registration link"
                    >
                      <RefreshCw className="h-3.5 w-3.5 text-muted-foreground/50" />
                    </Button>
                  )}
                  {u.registered && (
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => handleRegen(u.id)}
                      title="Generate new registration link (reset password)"
                    >
                      <KeyRound className="h-3.5 w-3.5 text-muted-foreground/50" />
                    </Button>
                  )}

                  {/* Delete */}
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-neon-magenta/40 hover:text-neon-magenta hover:bg-neon-magenta/8"
                    onClick={() => handleDelete(u.id)}
                    title="Delete user"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create user dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) { setNewUsername(""); setNewRole("user") } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm tracking-wide">// ADD USER</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label className="font-mono text-[10px] tracking-widest text-muted-foreground/60 uppercase">Username</Label>
              <Input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="username"
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <Label className="font-mono text-[10px] tracking-widest text-muted-foreground/60 uppercase">Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">user — view assigned resources</SelectItem>
                  <SelectItem value="admin">admin — full access</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs font-mono text-muted-foreground/40">
              // a registration link will be generated for the user to set their password
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={creating}>
                {creating ? "creating..." : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Permissions dialog */}
      <Dialog open={!!permUser} onOpenChange={(open) => !open && setPermUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm tracking-wide">
              // PERMISSIONS · <span className="text-neon-cyan">{permUser?.username}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs font-mono text-muted-foreground/50">
              // select projects this user can access
            </p>
            {projects.length === 0 ? (
              <p className="text-xs font-mono text-muted-foreground/40">// no projects found</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {projects.map((p) => {
                  const checked = permProjectIds.has(p.id)
                  return (
                    <label
                      key={p.id}
                      className="flex items-center gap-3 rounded-sm border px-3 py-2 cursor-pointer transition-colors"
                      style={{
                        borderColor: checked ? "rgba(0,229,255,0.3)" : "hsl(218,38%,12%)",
                        background: checked ? "rgba(0,229,255,0.05)" : "transparent",
                      }}
                    >
                      <div
                        className="w-4 h-4 rounded-sm flex-shrink-0 flex items-center justify-center border transition-all"
                        style={{
                          borderColor: checked ? "#00e5ff" : "hsl(218,38%,18%)",
                          background: checked ? "rgba(0,229,255,0.15)" : "transparent",
                        }}
                      >
                        {checked && <Check className="h-2.5 w-2.5" style={{ color: "#00e5ff" }} />}
                      </div>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() => toggleProject(p.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                        <p className="font-mono text-[10px] text-muted-foreground/40">{p.slug}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermUser(null)}>Cancel</Button>
            <Button onClick={handleSavePerms} disabled={savingPerms}>
              {savingPerms ? "saving..." : "Save Permissions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
