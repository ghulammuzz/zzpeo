"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { api } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Package, ArrowRight } from "lucide-react"
import type { GlobalObject } from "@/lib/types"

export default function ObjectsPage() {
  const [objects, setObjects] = useState<GlobalObject[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    api.global.listObjects()
      .then(setObjects)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = search
    ? objects.filter((o) => {
        const q = search.toLowerCase()
        return (
          o.name.toLowerCase().includes(q) ||
          o.object_type_name.toLowerCase().includes(q) ||
          o.project_name.toLowerCase().includes(q) ||
          o.env_name.toLowerCase().includes(q)
        )
      })
    : objects

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
            <Package className="h-5 w-5 text-neon-green/60" />
            Objects
            <span className="font-mono text-sm text-muted-foreground/40">({objects.length})</span>
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
          <Package className="h-8 w-8 text-muted-foreground/20 mb-4" />
          <p className="text-sm font-mono text-muted-foreground/50">// empty</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => (
            <Link
              key={o.id}
              href={`/projects/${o.project_id}/environments/${o.env_id}/objects`}
            >
              <Card className="hover:border-neon-green/25 transition-colors group cursor-pointer">
                <CardContent className="flex items-center gap-4 py-3.5 px-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="flex-shrink-0 font-mono text-[9px] px-1.5 py-0.5 rounded-sm border tracking-wider uppercase"
                        style={{
                          borderColor: "rgba(61,255,110,0.3)",
                          color: "#3dff6e",
                          background: "rgba(61,255,110,0.08)",
                        }}
                      >
                        {o.object_type_name}
                      </span>
                      <p className="font-semibold text-sm text-foreground group-hover:text-neon-green/80 transition-colors truncate">
                        {o.name}
                      </p>
                    </div>
                    <p className="font-mono text-xs text-muted-foreground/50 mt-0.5">
                      {o.project_name} / {o.env_name}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-neon-green/50 transition-colors flex-shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
