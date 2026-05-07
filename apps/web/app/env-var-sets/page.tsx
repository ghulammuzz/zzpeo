"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, KeyRound, ArrowRight, Search, ChevronLeft, ChevronRight } from "lucide-react"
import type { EnvVarSet } from "@/lib/types"

const PAGE_SIZE = 10

export default function EnvVarSetsListPage() {
  const [sets, setSets] = useState<EnvVarSet[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => {
    api.envVarSets.list()
      .then(setSets)
      .catch(() => {})
      .finally(() => setLoading(false))
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

  if (loading) return <div className="text-muted-foreground py-8">Loading...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Env Var Sets</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Reusable named collections of env vars — link to services at deploy time.
          </p>
        </div>
        <Button asChild>
          <Link href="/env-var-sets/new">
            <Plus className="h-4 w-4 mr-2" />
            New Set
          </Link>
        </Button>
      </div>

      {sets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <KeyRound className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-semibold">No env var sets yet</h3>
          <p className="text-muted-foreground text-sm mt-1 mb-4">
            Create a set to share env vars across multiple services.
          </p>
          <Button asChild>
            <Link href="/env-var-sets/new">
              <Plus className="h-4 w-4 mr-2" />
              New Set
            </Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search env var sets..."
              className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* List */}
          <div className="space-y-2">
            {visible.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No results for "{search}"</p>
            ) : (
              visible.map((s) => (
                <Link key={s.id} href={`/env-var-sets/${s.id}`}>
                  <Card className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardContent className="flex items-center justify-between py-4">
                      <div>
                        <p className="font-medium">{s.name}</p>
                        {s.description && (
                          <p className="text-sm text-muted-foreground mt-0.5">{s.description}</p>
                        )}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </CardContent>
                  </Card>
                </Link>
              ))
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t pt-4">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </button>
              <span className="text-sm text-muted-foreground tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-30 transition-colors"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
