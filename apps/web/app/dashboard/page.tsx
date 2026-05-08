"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { api } from "@/lib/api"
import { getCurrentUser } from "@/lib/auth"
import { Card, CardContent } from "@/components/ui/card"
import {
  FolderKanban, Server, Terminal, Package, KeyRound,
  ArrowRight,
} from "lucide-react"
import type { Project, EnvVarSet, GlobalServer, GlobalService, GlobalObject } from "@/lib/types"

const LIMIT = 5

const DEPLOY_STYLE: Record<string, { bg: string; text: string }> = {
  php:    { bg: "rgba(77,159,255,0.12)",  text: "#4d9fff" },
  pm2:    { bg: "rgba(61,255,110,0.12)",  text: "#3dff6e" },
  shell:  { bg: "rgba(255,230,0,0.12)",   text: "#ffe600" },
  docker: { bg: "rgba(255,0,85,0.12)",    text: "#ff4499" },
}

// ── Reusable section card ─────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  count,
  href,
  loading,
  empty,
  children,
}: {
  icon: React.ElementType
  title: string
  count: number
  href: string
  loading: boolean
  empty: boolean
  children: React.ReactNode
}) {
  return (
    <Card className="flex flex-col">
      <CardContent className="pt-4 pb-3 flex flex-col flex-1">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon className="h-3.5 w-3.5 text-neon-cyan/50" />
            <p className="text-[10px] font-mono tracking-[0.15em] text-neon-cyan/50 uppercase">
              // {title}
            </p>
            {!loading && (
              <span className="font-mono text-[9px] px-1 py-0.5 rounded-sm border border-neon-cyan/20 bg-neon-cyan/5 text-neon-cyan/50">
                {count}
              </span>
            )}
          </div>
          <Link
            href={href}
            className="font-mono text-[9px] text-muted-foreground/30 hover:text-neon-cyan/70 transition-colors tracking-wider flex items-center gap-1"
          >
            all <ArrowRight className="h-2.5 w-2.5" />
          </Link>
        </div>

        {/* Body */}
        <div className="flex-1">
          {loading ? (
            <div className="space-y-1.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-7 rounded-sm bg-muted/20 animate-pulse" />
              ))}
            </div>
          ) : empty ? (
            <p className="text-[10px] font-mono text-muted-foreground/30 py-3">// empty</p>
          ) : (
            children
          )}
        </div>

        {/* Footer overflow hint */}
        {!loading && count > LIMIT && (
          <Link
            href={href}
            className="mt-2 pt-2 border-t border-border/40 block font-mono text-[9px] text-muted-foreground/30 hover:text-neon-cyan/50 transition-colors"
          >
            // +{count - LIMIT} more →
          </Link>
        )}
      </CardContent>
    </Card>
  )
}

// ── Row components ────────────────────────────────────────────────

function ItemRow({ href, left, right, badge }: {
  href: string
  left: string
  right?: string
  badge?: { label: string; style?: { bg: string; text: string } }
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 py-1.5 px-2 rounded-sm hover:bg-neon-cyan/5 transition-colors group"
    >
      {badge && (
        <span
          className="flex-shrink-0 font-mono text-[9px] px-1.5 py-0.5 rounded-sm tracking-wider uppercase"
          style={badge.style
            ? { background: badge.style.bg, color: badge.style.text }
            : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }
          }
        >
          {badge.label}
        </span>
      )}
      <span className="flex-1 min-w-0 text-xs font-medium text-foreground/80 group-hover:text-neon-cyan truncate transition-colors">
        {left}
      </span>
      {right && (
        <span className="flex-shrink-0 font-mono text-[10px] text-muted-foreground/35 truncate max-w-[100px]">
          {right}
        </span>
      )}
    </Link>
  )
}

// ── Stat box ──────────────────────────────────────────────────────

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="group block">
      <div className="relative rounded-sm border border-border bg-card px-4 py-3 overflow-hidden hover:border-neon-cyan/25 transition-colors">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neon-cyan/30 to-transparent" />
        <p className="text-xl font-bold font-mono text-neon-cyan group-hover:text-glow-cyan transition-all">
          {value}
        </p>
        <p className="text-[9px] font-mono tracking-widest text-muted-foreground/50 uppercase mt-0.5">
          {label}
        </p>
      </div>
    </Link>
  )
}

// ── Main page ─────────────────────────────────────────────────────

interface DashData {
  projects: Project[]
  servers: GlobalServer[]
  services: GlobalService[]
  objects: GlobalObject[]
  envSets: EnvVarSet[]
}

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<ReturnType<typeof getCurrentUser>>(null)

  useEffect(() => {
    setUser(getCurrentUser())
  }, [])

  useEffect(() => {
    Promise.all([
      api.projects.list(),
      api.global.listServers(),
      api.global.listServices(),
      api.global.listObjects(),
      api.envVarSets.list(),
    ])
      .then(([projects, servers, services, objects, envSets]) => {
        setData({ projects, servers, services, objects, envSets })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const now = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-mono tracking-[0.15em] text-neon-cyan/50 uppercase mb-1">
            // SYSTEM OVERVIEW
          </p>
          <h1 className="text-xl font-bold flex items-center gap-2.5">
            Dashboard
            {user && (
              <span
                className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm border tracking-wider uppercase"
                style={
                  user.role === "admin"
                    ? { borderColor: "rgba(0,229,255,0.4)", color: "#00e5ff", background: "rgba(0,229,255,0.08)" }
                    : { borderColor: "rgba(77,159,255,0.3)", color: "#4d9fff", background: "rgba(77,159,255,0.08)" }
                }
              >
                {user.role}
              </span>
            )}
          </h1>
          {user && (
            <p className="text-xs text-muted-foreground/50 font-mono mt-0.5">
              {user.username} · {now}
            </p>
          )}
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Projects"  value={data?.projects.length  ?? 0} href="/projects"     />
        <Stat label="Servers"   value={data?.servers.length   ?? 0} href="/projects"     />
        <Stat label="Services"  value={data?.services.length  ?? 0} href="/projects"     />
        <Stat label="Objects"   value={data?.objects.length   ?? 0} href="/projects"     />
        <Stat label="Env Sets"  value={data?.envSets.length   ?? 0} href="/env-var-sets" />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Column 1 — Projects */}
        <Section
          icon={FolderKanban}
          title="Projects"
          count={data?.projects.length ?? 0}
          href="/projects"
          loading={loading}
          empty={data?.projects.length === 0}
        >
          {data?.projects.slice(0, LIMIT).map((p) => (
            <ItemRow
              key={p.id}
              href={`/projects/${p.id}`}
              left={p.name}
              right={p.slug}
            />
          ))}
        </Section>

        {/* Column 2 — Services */}
        <Section
          icon={Terminal}
          title="Services"
          count={data?.services.length ?? 0}
          href="/projects"
          loading={loading}
          empty={data?.services.length === 0}
        >
          {data?.services.slice(0, LIMIT).map((s) => (
            <ItemRow
              key={s.id}
              href={`/projects/${s.project_id}/environments/${s.env_id}/servers/${s.server_id}/services/${s.id}`}
              left={s.name}
              right={`${s.project_name}/${s.env_name}`}
              badge={{ label: s.deploy_type, style: DEPLOY_STYLE[s.deploy_type] }}
            />
          ))}
        </Section>

        {/* Column 3 — Servers + Objects + Env Sets stacked */}
        <div className="space-y-4">
          <Section
            icon={Server}
            title="Servers"
            count={data?.servers.length ?? 0}
            href="/projects"
            loading={loading}
            empty={data?.servers.length === 0}
          >
            {data?.servers.slice(0, LIMIT).map((s) => (
              <ItemRow
                key={s.id}
                href={`/projects/${s.project_id}/environments/${s.env_id}/servers/${s.id}`}
                left={s.name}
                right={s.host}
              />
            ))}
          </Section>

          <Section
            icon={Package}
            title="Objects"
            count={data?.objects.length ?? 0}
            href="/projects"
            loading={loading}
            empty={data?.objects.length === 0}
          >
            {data?.objects.slice(0, 3).map((o) => (
              <Link
                key={o.id}
                href={`/projects/${o.project_id}/environments/${o.env_id}/objects`}
                className="flex items-center gap-2 py-1.5 px-2 rounded-sm hover:bg-neon-green/5 transition-colors group"
              >
                <span
                  className="flex-shrink-0 font-mono text-[9px] px-1.5 py-0.5 rounded-sm border tracking-wider uppercase"
                  style={{ borderColor: "rgba(61,255,110,0.3)", color: "#3dff6e", background: "rgba(61,255,110,0.08)" }}
                >
                  {o.object_type_name}
                </span>
                <span className="flex-1 min-w-0 text-xs font-medium text-foreground/80 group-hover:text-neon-green/80 truncate transition-colors">
                  {o.name}
                </span>
                <span className="flex-shrink-0 font-mono text-[10px] text-muted-foreground/30 truncate max-w-[80px]">
                  {o.env_name}
                </span>
              </Link>
            ))}
          </Section>

          <Section
            icon={KeyRound}
            title="Env Sets"
            count={data?.envSets.length ?? 0}
            href="/env-var-sets"
            loading={loading}
            empty={data?.envSets.length === 0}
          >
            {data?.envSets.slice(0, 3).map((s) => (
              <ItemRow
                key={s.id}
                href={`/env-var-sets/${s.id}`}
                left={s.name}
                right={s.description}
              />
            ))}
          </Section>
        </div>
      </div>
    </div>
  )
}
