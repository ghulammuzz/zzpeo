"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { api } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Terminal, ArrowRight } from "lucide-react"
import type { GlobalService } from "@/lib/types"

const DEPLOY_STYLE: Record<string, { bg: string; text: string }> = {
  php:     { bg: "rgba(77,159,255,0.12)",  text: "#4d9fff" },
  pm2:     { bg: "rgba(61,255,110,0.12)",  text: "#3dff6e" },
  shell:   { bg: "rgba(255,230,0,0.12)",   text: "#ffe600" },
  docker:  { bg: "rgba(255,0,85,0.12)",    text: "#ff4499" },
  dokploy: { bg: "rgba(0,229,255,0.12)",   text: "#00e5ff" },
}

export default function ServicesPage() {
  const [services, setServices] = useState<GlobalService[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    api.global.listServices()
      .then(setServices)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = search
    ? services.filter((s) => {
        const q = search.toLowerCase()
        return (
          s.name.toLowerCase().includes(q) ||
          s.deploy_type.toLowerCase().includes(q) ||
          s.project_name.toLowerCase().includes(q) ||
          s.env_name.toLowerCase().includes(q) ||
          s.server_name.toLowerCase().includes(q)
        )
      })
    : services

  if (loading) return (
    <div className="flex items-center gap-2 py-12 text-muted-foreground font-mono text-sm">
      <span className="animate-pulse">▌</span><span>loading...</span>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-mono tracking-[0.15em] text-neon-cyan/50 uppercase mb-1">// GLOBAL</p>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Terminal className="h-5 w-5 text-neon-cyan/60" />
            Services
            <span className="font-mono text-sm text-muted-foreground/40">({services.length})</span>
          </h1>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search..."
          className="w-48 rounded-sm border border-input bg-background/60 px-3 py-1.5 text-sm font-mono placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary focus:shadow-[0_0_8px_rgba(0,229,255,0.2)] transition-all"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-sm border border-dashed border-border/50 py-16 text-center">
          <Terminal className="h-8 w-8 text-muted-foreground/20 mb-4" />
          <p className="text-sm font-mono text-muted-foreground/50">// empty</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => {
            const ds = DEPLOY_STYLE[s.deploy_type] ?? { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.4)" }
            return (
              <Link
                key={s.id}
                href={`/projects/${s.project_id}/environments/${s.env_id}/servers/${s.server_id}/services/${s.id}`}
              >
                <Card className="hover:border-neon-cyan/30 transition-colors group cursor-pointer">
                  <CardContent className="flex items-center gap-4 py-3.5 px-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="flex-shrink-0 font-mono text-[9px] px-1.5 py-0.5 rounded-sm tracking-wider uppercase"
                          style={{ background: ds.bg, color: ds.text }}
                        >
                          {s.deploy_type}
                        </span>
                        <p className="font-semibold text-sm text-foreground group-hover:text-neon-cyan transition-colors truncate">
                          {s.name}
                        </p>
                      </div>
                      <p className="font-mono text-xs text-muted-foreground/50 mt-0.5">
                        {s.project_name} / {s.env_name} / {s.server_name}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-neon-cyan/60 transition-colors flex-shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
