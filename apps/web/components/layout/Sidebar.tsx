"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  FolderKanban, Globe, Server, Terminal, Package,
  Rocket, ChevronLeft, ChevronRight, X, Plus, KeyRound, Search,
  LogOut, Shield,
} from "lucide-react"
import type {
  Project, GlobalServer, GlobalService, GlobalObject, EnvVarSet,
} from "@/lib/types"
import { getCurrentUser, logout } from "@/lib/auth"

const PAGE_SIZE = 10

type TabKey = "projects" | "servers" | "services" | "env-var-sets" | "objects"

interface Tab {
  key: TabKey
  label: string
  icon: React.ReactNode
}

const TABS: Tab[] = [
  { key: "projects",      label: "Projects",      icon: <FolderKanban className="h-[18px] w-[18px]" /> },
  { key: "servers",       label: "Servers",        icon: <Server className="h-[18px] w-[18px]" /> },
  { key: "services",      label: "Services",       icon: <Terminal className="h-[18px] w-[18px]" /> },
  { key: "env-var-sets",  label: "Env Var Sets",   icon: <KeyRound className="h-[18px] w-[18px]" /> },
  { key: "objects",       label: "Objects",        icon: <Package className="h-[18px] w-[18px]" /> },
]

interface ListItem {
  id: string
  primary: string
  secondary?: string
  href: string
  badge?: string
}

function PaginatedList({ items, loading, newHref }: { items: ListItem[]; loading: boolean; newHref?: string }) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")

  useEffect(() => { setPage(1) }, [items.length])
  useEffect(() => { setPage(1) }, [search])

  const filtered = search
    ? items.filter((item) => {
        const q = search.toLowerCase()
        return (
          item.primary.toLowerCase().includes(q) ||
          (item.secondary ?? "").toLowerCase().includes(q) ||
          (item.badge ?? "").toLowerCase().includes(q)
        )
      })
    : items

  const total = Math.ceil(filtered.length / PAGE_SIZE)
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (loading) {
    return (
      <div className="space-y-1 p-2 pt-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-9 rounded-sm bg-muted/40 animate-pulse" />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
        <p className="text-xs text-muted-foreground font-mono">// empty</p>
        {newHref && (
          <Link
            href={newHref}
            className="flex items-center gap-1 text-xs text-neon-cyan hover:text-glow-cyan font-mono transition-all"
          >
            <Plus className="h-3 w-3" />
            init new
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 pt-2 pb-1 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search..."
            className="w-full rounded-sm bg-background/60 border border-border pl-6 pr-2 py-1.5 text-xs font-mono placeholder:text-muted-foreground/30 focus:outline-none focus:border-neon-cyan/50 focus:shadow-[0_0_6px_rgba(0,229,255,0.15)] transition-all"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-px p-2">
          {visible.length === 0 && (
            <p className="px-2.5 py-4 text-center text-xs text-muted-foreground font-mono">// no match</p>
          )}
          {visible.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="group flex flex-col rounded-sm px-2.5 py-2 text-xs transition-all hover:bg-neon-cyan/5 border border-transparent hover:border-neon-cyan/15"
            >
              <div className="flex items-center justify-between gap-1 min-w-0">
                <span className="font-medium truncate text-foreground/80 group-hover:text-neon-cyan transition-colors">
                  {item.primary}
                </span>
                {item.badge && (
                  <span className="flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded-sm border border-neon-cyan/20 bg-neon-cyan/5 text-neon-cyan/60 font-mono tracking-wider uppercase">
                    {item.badge}
                  </span>
                )}
              </div>
              {item.secondary && (
                <span className="truncate text-muted-foreground/60 text-[10px] mt-0.5 font-mono">
                  {item.secondary}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>

      {total > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-border/50 flex-shrink-0">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:text-neon-cyan hover:bg-neon-cyan/8 disabled:opacity-20 transition-all"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <span className="text-[10px] text-muted-foreground tabular-nums font-mono">
            {page} / {total}
          </span>
          <button
            disabled={page === total}
            onClick={() => setPage((p) => p + 1)}
            className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:text-neon-cyan hover:bg-neon-cyan/8 disabled:opacity-20 transition-all"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  )
}

function ProjectsPanel({ pathname }: { pathname: string }) {
  const [items, setItems] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.projects.list()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [pathname])

  return (
    <PaginatedList
      loading={loading}
      newHref="/projects/new"
      items={items.map((p) => ({
        id: p.id,
        primary: p.name,
        secondary: p.description,
        href: `/projects/${p.id}`,
      }))}
    />
  )
}

function ServersPanel({ pathname }: { pathname: string }) {
  const [items, setItems] = useState<GlobalServer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.global.listServers()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [pathname])

  return (
    <PaginatedList
      loading={loading}
      items={items.map((s) => ({
        id: s.id,
        primary: s.name,
        secondary: `${s.project_name} / ${s.env_name}`,
        href: `/projects/${s.project_id}/environments/${s.env_id}/servers/${s.id}`,
        badge: s.host,
      }))}
    />
  )
}

function ServicesPanel({ pathname }: { pathname: string }) {
  const [items, setItems] = useState<GlobalService[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.global.listServices()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [pathname])

  return (
    <PaginatedList
      loading={loading}
      items={items.map((s) => ({
        id: s.id,
        primary: s.name,
        secondary: `${s.project_name} / ${s.env_name} / ${s.server_name}`,
        href: `/projects/${s.project_id}/environments/${s.env_id}/servers/${s.server_id}/services/${s.id}`,
        badge: s.deploy_type,
      }))}
    />
  )
}

function EnvVarSetsPanel({ pathname }: { pathname: string }) {
  const [items, setItems] = useState<EnvVarSet[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.envVarSets.list()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [pathname])

  return (
    <PaginatedList
      loading={loading}
      newHref="/env-var-sets/new"
      items={items.map((s) => ({
        id: s.id,
        primary: s.name,
        secondary: s.description,
        href: `/env-var-sets/${s.id}`,
      }))}
    />
  )
}

function ObjectsPanel({ pathname }: { pathname: string }) {
  const [items, setItems] = useState<GlobalObject[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.global.listObjects()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [pathname])

  return (
    <PaginatedList
      loading={loading}
      items={items.map((o) => ({
        id: o.id,
        primary: o.name,
        secondary: `${o.project_name} / ${o.env_name}`,
        href: `/projects/${o.project_id}/environments/${o.env_id}/objects`,
        badge: o.object_type_name,
      }))}
    />
  )
}

function TabPanel({ tab, pathname }: { tab: TabKey; pathname: string }) {
  switch (tab) {
    case "projects":     return <ProjectsPanel pathname={pathname} />
    case "servers":      return <ServersPanel pathname={pathname} />
    case "services":     return <ServicesPanel pathname={pathname} />
    case "env-var-sets": return <EnvVarSetsPanel pathname={pathname} />
    case "objects":      return <ObjectsPanel pathname={pathname} />
  }
}

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const [activeTab, setActiveTab] = useState<TabKey | null>(null)
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getCurrentUser>>(null)

  useEffect(() => {
    setCurrentUser(getCurrentUser())
  }, [])

  // Close panel when navigating on mobile
  useEffect(() => {
    if (mobileOpen) onMobileClose?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const toggle = (key: TabKey) =>
    setActiveTab((prev) => (prev === key ? null : key))

  const panelOpen = activeTab !== null
  const activeTabMeta = TABS.find((t) => t.key === activeTab)

  return (
    <aside className={cn(
      "flex h-screen flex-shrink-0 overflow-hidden z-50",
      // Mobile: fixed overlay, slides in/out
      "fixed inset-y-0 left-0 transition-transform duration-200 ease-in-out",
      mobileOpen ? "translate-x-0" : "-translate-x-full",
      // Desktop: relative, always visible
      "md:relative md:translate-x-0",
    )}>
      <TooltipProvider delayDuration={400}>
        {/* Activity strip */}
        <div className="flex w-12 flex-shrink-0 flex-col items-center border-r border-border bg-background py-3 gap-0.5">
          {/* Logo */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/dashboard"
                className="flex h-9 w-9 items-center justify-center rounded-sm mb-3 text-neon-cyan hover:shadow-[0_0_12px_rgba(0,229,255,0.4)] transition-all"
              >
                <Rocket className="h-[18px] w-[18px]" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-mono text-xs">dashboard</TooltipContent>
          </Tooltip>

          {/* Divider */}
          <div className="w-6 h-px bg-border mb-1" />

          {/* Tab icons */}
          {TABS.map((tab) => (
            <Tooltip key={tab.key}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => toggle(tab.key)}
                  className={cn(
                    "relative flex h-9 w-9 items-center justify-center rounded-sm transition-all duration-150",
                    activeTab === tab.key
                      ? "text-neon-cyan bg-neon-cyan/8 shadow-[0_0_10px_rgba(0,229,255,0.2)]"
                      : "text-muted-foreground/60 hover:text-foreground hover:bg-accent"
                  )}
                >
                  {activeTab === tab.key && (
                    <span className="absolute right-0 top-1/2 -translate-y-1/2 w-px h-4 bg-neon-cyan shadow-[0_0_4px_var(--neon-cyan)]" />
                  )}
                  {tab.icon}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-mono text-xs">{tab.label}</TooltipContent>
            </Tooltip>
          ))}

          <div className="flex-1" />

          {/* Admin link */}
          {currentUser?.role === "admin" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/admin/users"
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-sm transition-all duration-150 mb-0.5",
                    pathname.startsWith("/admin")
                      ? "text-neon-cyan bg-neon-cyan/8"
                      : "text-muted-foreground/40 hover:text-neon-cyan hover:bg-neon-cyan/8"
                  )}
                >
                  <Shield className="h-[16px] w-[16px]" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-mono text-xs">Admin</TooltipContent>
            </Tooltip>
          )}

          {/* User + Logout */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={logout}
                className="flex h-9 w-9 items-center justify-center rounded-sm text-muted-foreground/40 hover:text-neon-magenta hover:bg-neon-magenta/8 transition-all mb-1"
              >
                <LogOut className="h-[16px] w-[16px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-mono text-xs">
              {currentUser?.username ?? "logout"}
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      {/* Slide-out panel */}
      <div
        className={cn(
          "flex flex-col overflow-hidden transition-[width] duration-200 ease-in-out border-r border-border bg-card",
          panelOpen ? "w-60" : "w-0"
        )}
      >
        {activeTabMeta && (
          <>
            {/* Panel header */}
            <div className="flex h-10 items-center justify-between px-3 border-b border-border flex-shrink-0 bg-background/40">
              <span className="text-[10px] font-semibold tracking-widest text-neon-cyan/70 font-mono uppercase truncate">
                // {activeTabMeta.label}
              </span>
              <div className="flex items-center gap-1 flex-shrink-0">
                {activeTab === "env-var-sets" && (
                  <Link
                    href="/env-var-sets/new"
                    title="New env var set"
                    className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground/50 hover:text-neon-cyan hover:bg-neon-cyan/8 transition-all"
                  >
                    <Plus className="h-3 w-3" />
                  </Link>
                )}
                <button
                  onClick={() => setActiveTab(null)}
                  className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground/50 hover:text-neon-magenta hover:bg-neon-magenta/8 transition-all"
                  title="Close"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-hidden min-w-0">
              <TabPanel tab={activeTab!} pathname={pathname} />
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
