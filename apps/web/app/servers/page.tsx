"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { api } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Server, ArrowRight } from "lucide-react"
import type { GlobalServer } from "@/lib/types"

export default function ServersPage() {
  const [servers, setServers] = useState<GlobalServer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    api.global.listServers()
      .then(setServers)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = search
    ? servers.filter((s) => {
        const q = search.toLowerCase()
        return (
          s.name.toLowerCase().includes(q) ||
          s.host.toLowerCase().includes(q) ||
          s.project_name.toLowerCase().includes(q) ||
          s.env_name.toLowerCase().includes(q)
        )
      })
    : servers

  if (loading) return (
    <div className="flex items-center gap-2 py-12 text-muted-foreground font-mono text-sm">
      <span className="animate-pulse">▌</span><span>loading...</span>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-mono tracking-[0.15em] text-neon-cyan/50 uppercase mb-1">// GLOBAL</p>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Server className="h-5 w-5 text-neon-cyan/60" />
            Servers
            <span className="font-mono text-sm text-muted-foreground/40">({servers.length})</span>
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
          <Server className="h-8 w-8 text-muted-foreground/20 mb-4" />
          <p className="text-sm font-mono text-muted-foreground/50">// empty</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => (
            <Link
              key={s.id}
              href={`/projects/${s.project_id}/environments/${s.env_id}/servers/${s.id}`}
            >
              <Card className="hover:border-neon-cyan/30 transition-colors group cursor-pointer">
                <CardContent className="flex items-center gap-4 py-3.5 px-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm text-foreground group-hover:text-neon-cyan transition-colors">
                        {s.name}
                      </p>
                      <span className="font-mono text-[10px] text-neon-cyan/60 border border-neon-cyan/20 bg-neon-cyan/5 px-1.5 py-0.5 rounded-sm">
                        {s.host}
                      </span>
                    </div>
                    <p className="font-mono text-xs text-muted-foreground/50 mt-0.5">
                      {s.project_name} / {s.env_name}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-neon-cyan/60 transition-colors flex-shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
