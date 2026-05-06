"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"
import { api } from "@/lib/api"
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  FolderKanban, Globe, Server, Terminal, Package,
  Rocket, ChevronLeft, ChevronRight, X, Plus, KeyRound,
} from "lucide-react"
import type {
  Project, GlobalServer, GlobalService, GlobalObject, EnvVarSet,
} from "@/lib/types"

const PAGE_SIZE = 10

// ─── Tab types ────────────────────────────────────────────────

type TabKey = "projects" | "servers" | "services" | "env-var-sets" | "objects"

interface Tab {
  key: TabKey
  label: string
  icon: React.ReactNode
}

const TABS: Tab[] = [
  { key: "projects",      label: "Projects",      icon: <FolderKanban className="h-5 w-5" /> },
  { key: "servers",       label: "Servers",        icon: <Server className="h-5 w-5" /> },
  { key: "services",      label: "Services",       icon: <Terminal className="h-5 w-5" /> },
  { key: "env-var-sets",  label: "Env Var Sets",   icon: <KeyRound className="h-5 w-5" /> },
  { key: "objects",       label: "Objects",        icon: <Package className="h-5 w-5" /> },
]

// ─── Generic paginated list panel ─────────────────────────────

interface ListItem {
  id: string
  primary: string
  secondary?: string
  href: string
  badge?: string
}

function PaginatedList({ items, loading, newHref }: { items: ListItem[]; loading: boolean; newHref?: string }) {
  const [page, setPage] = useState(1)

  useEffect(() => { setPage(1) }, [items.length])

  const total = Math.ceil(items.length / PAGE_SIZE)
  const visible = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (loading) {
    return (
      <div className="space-y-1 p-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 px-4 text-center">
        <p className="text-xs text-muted-foreground">None yet</p>
        {newHref && (
          <Link
            href={newHref}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="h-3 w-3" />
            Create
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-0.5 p-2">
          {visible.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="flex flex-col rounded-md px-2.5 py-2 text-xs hover:bg-muted transition-colors group"
            >
              <div className="flex items-center justify-between gap-1 min-w-0">
                <span className="font-medium truncate text-foreground group-hover:text-foreground">
                  {item.primary}
                </span>
                {item.badge && (
                  <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-muted-foreground/15 text-muted-foreground font-mono">
                    {item.badge}
                  </span>
                )}
              </div>
              {item.secondary && (
                <span className="truncate text-muted-foreground text-[11px] mt-0.5">
                  {item.secondary}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>

      {total > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t flex-shrink-0">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {page} / {total}
          </span>
          <button
            disabled={page === total}
            onClick={() => setPage((p) => p + 1)}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Tab panels ───────────────────────────────────────────────

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

// ─── Main sidebar ─────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname()
  const [activeTab, setActiveTab] = useState<TabKey | null>(null)

  const toggle = (key: TabKey) =>
    setActiveTab((prev) => (prev === key ? null : key))

  const panelOpen = activeTab !== null
  const activeTabMeta = TABS.find((t) => t.key === activeTab)

  return (
    <aside className="flex h-screen flex-shrink-0 border-r bg-background overflow-hidden">
      {/* Activity strip */}
      <TooltipProvider delayDuration={400}>
      <div className="flex w-12 flex-shrink-0 flex-col items-center border-r bg-background py-2 gap-0.5">
        {/* Logo */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/projects"
              className="flex h-10 w-10 items-center justify-center rounded-md mb-2"
            >
              <Rocket className="h-5 w-5 text-primary" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">Home</TooltipContent>
        </Tooltip>

        {/* Tab icons */}
        {TABS.map((tab) => (
          <Tooltip key={tab.key}>
            <TooltipTrigger asChild>
              <button
                onClick={() => toggle(tab.key)}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-md transition-colors",
                  activeTab === tab.key
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {tab.icon}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{tab.label}</TooltipContent>
          </Tooltip>
        ))}

        {/* Spacer + theme toggle at bottom */}
        <div className="flex-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <div><ThemeToggle /></div>
          </TooltipTrigger>
          <TooltipContent side="right">Toggle theme</TooltipContent>
        </Tooltip>
      </div>
      </TooltipProvider>

      {/* Slide-out panel */}
      <div
        className={cn(
          "flex flex-col overflow-hidden transition-[width] duration-200 ease-in-out border-r",
          panelOpen ? "w-60" : "w-0"
        )}
      >
        {activeTabMeta && (
          <>
            {/* Panel header */}
            <div className="flex h-11 items-center justify-between px-3 border-b flex-shrink-0 bg-muted/30">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
                {activeTabMeta.label}
              </span>
              <div className="flex items-center gap-1 flex-shrink-0">
                {activeTab === "env-var-sets" && (
                  <Link
                    href="/env-var-sets/new"
                    title="New env var set"
                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Link>
                )}
                <button
                  onClick={() => setActiveTab(null)}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Close"
                >
                  <X className="h-3.5 w-3.5" />
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
