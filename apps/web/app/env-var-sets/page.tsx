"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, KeyRound, ArrowRight } from "lucide-react"
import type { EnvVarSet } from "@/lib/types"

export default function EnvVarSetsListPage() {
  const [sets, setSets] = useState<EnvVarSet[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.envVarSets.list()
      .then(setSets)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

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
        <div className="space-y-2">
          {sets.map((s) => (
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
          ))}
        </div>
      )}
    </div>
  )
}
