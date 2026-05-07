"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, KeyRound, ArrowRight, Search, ChevronLeft, ChevronRight } from "lucide-react"
import type { EnvVarSet, GlobalService, LinkedEnvVarSet } from "@/lib/types"

const PAGE_SIZE = 10

export default function EnvVarSetsListPage() {
  const [sets, setSets] = useState<EnvVarSet[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  // setId → attached services
  const [attachedMap, setAttachedMap] = useState<Record<string, GlobalService[]>>({})
  const [loadingAttached, setLoadingAttached] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const fetchedSets = await api.envVarSets.list()
        setSets(fetchedSets)

        if (fetchedSets.length > 0) {
          setLoadingAttached(true)
          api.global.listServices()
            .then(async (allSvcs) => {
              const byService = await Promise.all(
                allSvcs.map((svc) =>
                  api.envVarSets.listLinkedSets(svc.id)
                    .then((linked) => ({ svc, linked }))
                    .catch(() => ({ svc, linked: [] as LinkedEnvVarSet[] }))
                )
              )
              const map: Record<string, GlobalService[]> = {}
              for (const { svc, linked } of byService) {
                for (const s of linked) {
                  if (!map[s.id]) map[s.id] = []
                  map[s.id].push(svc)
                }
              }
              setAttachedMap(map)
            })
            .catch(() => {})
            .finally(() => setLoadingAttached(false))
        }
      } catch {
        setSets([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => { setPage(1) }, [search])

  const filtered = search
    ? sets.filter((s) => {
        const q = search.toLowerCase()
        return s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q)
      })
    : sets

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (loading) return (
    <div className="flex items-center gap-2 py-12 text-muted-foreground font-mono text-sm">
      <span className="animate-pulse">▌</span><span>loading...</span>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-mono tracking-[0.15em] text-neon-cyan/50 uppercase mb-1">// ENV VAR SETS</p>
          <h1 className="text-xl font-bold">{sets.length > 0 && <span className="text-muted-foreground/50 font-mono text-base mr-2">({sets.length})</span>}Env Var Sets</h1>
          <p className="text-xs text-muted-foreground/60 font-mono mt-0.5">reusable named collections — link to services at deploy time</p>
        </div>
        <Button asChild size="sm">
          <Link href="/env-var-sets/new">
            <Plus className="h-3.5 w-3.5 mr-2" />
            New Set
          </Link>
        </Button>
      </div>

      {sets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-sm border border-dashed border-border/50 py-16 text-center">
          <KeyRound className="h-8 w-8 text-muted-foreground/20 mb-4" />
          <p className="text-sm font-mono text-muted-foreground/50">// empty</p>
          <p className="text-xs text-muted-foreground/30 mt-1">create a set to share env vars across services</p>
          <Button asChild variant="outline" size="sm" className="mt-5">
            <Link href="/env-var-sets/new">
              <Plus className="h-3.5 w-3.5 mr-2" />
              New Set
            </Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search..."
              className="w-full rounded-sm border border-input bg-background/60 pl-8 pr-3 py-1.5 text-sm font-mono placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary focus:shadow-[0_0_8px_rgba(0,229,255,0.2)] transition-all"
            />
          </div>

          {/* List */}
          <div className="space-y-2">
            {visible.length === 0 ? (
              <p className="text-xs font-mono text-muted-foreground/40 py-4 text-center">// no results for &ldquo;{search}&rdquo;</p>
            ) : (
              visible.map((s) => {
                const attached = attachedMap[s.id] ?? []
                return (
                  <Link key={s.id} href={`/env-var-sets/${s.id}`}>
                    <Card className="cursor-pointer hover:border-neon-cyan/30 transition-colors group">
                      <CardContent className="py-4 px-5">
                        <div className="flex items-start justify-between gap-4">
                          {/* Left: name + description + attached services */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm text-foreground">{s.name}</p>
                              {/* Attachment badge */}
                              {loadingAttached ? (
                                <span className="font-mono text-[9px] text-muted-foreground/30 animate-pulse">...</span>
                              ) : attached.length > 0 ? (
                                <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm border border-neon-cyan/30 bg-neon-cyan/8 text-neon-cyan/70">
                                  {attached.length} service{attached.length !== 1 ? "s" : ""}
                                </span>
                              ) : (
                                <span className="font-mono text-[9px] text-muted-foreground/30 border border-border/50 px-1.5 py-0.5 rounded-sm">
                                  unlinked
                                </span>
                              )}
                            </div>
                            {s.description && (
                              <p className="text-xs text-muted-foreground/60 mt-0.5 truncate">{s.description}</p>
                            )}
                            {/* Attached service names */}
                            {!loadingAttached && attached.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {attached.map((svc) => (
                                  <span
                                    key={svc.id}
                                    className="font-mono text-[10px] px-1.5 py-0.5 rounded-sm border border-border/60 bg-secondary/40 text-muted-foreground/60"
                                  >
                                    {svc.project_name}/{svc.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {/* Right: arrow */}
                          <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-neon-cyan/60 transition-colors flex-shrink-0 mt-0.5" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border/50 pt-4">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="flex items-center gap-1 rounded-sm px-3 py-1.5 text-xs font-mono text-muted-foreground hover:text-neon-cyan hover:bg-neon-cyan/5 disabled:opacity-30 transition-all"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                prev
              </button>
              <span className="text-xs font-mono text-muted-foreground/50 tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="flex items-center gap-1 rounded-sm px-3 py-1.5 text-xs font-mono text-muted-foreground hover:text-neon-cyan hover:bg-neon-cyan/5 disabled:opacity-30 transition-all"
              >
                next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
