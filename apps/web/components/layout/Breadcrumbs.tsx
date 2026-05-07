"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

const SEGMENT_LABELS: Record<string, string> = {
  projects: "projects",
  environments: "envs",
  "env-vars": "env-vars",
  servers: "servers",
  services: "services",
  objects: "objects",
  nginx: "nginx",
  deploy: "deploy",
  new: "new",
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUUID(s: string) { return UUID_RE.test(s) }

export function Breadcrumbs() {
  const pathname = usePathname()
  const [names, setNames] = useState<Record<string, string>>({})

  useEffect(() => {
    setNames({})
    const segments = pathname.split("/").filter(Boolean)
    const resolved: Record<string, string> = {}
    const promises: Promise<void>[] = []

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      if (!isUUID(seg)) continue
      const prev = segments[i - 1]

      if (prev === "projects") {
        promises.push(api.projects.get(seg).then(p => { resolved[seg] = p.name }).catch(() => {}))
      } else if (prev === "environments") {
        const projectId = segments[segments.indexOf("projects") + 1]
        if (projectId) promises.push(api.environments.get(projectId, seg).then(e => { resolved[seg] = e.name }).catch(() => {}))
      } else if (prev === "servers") {
        const envId = segments[segments.indexOf("environments") + 1]
        if (envId) promises.push(api.servers.get(envId, seg).then(s => { resolved[seg] = s.name }).catch(() => {}))
      } else if (prev === "services") {
        const serverId = segments[segments.indexOf("servers") + 1]
        if (serverId) promises.push(api.services.get(serverId, seg).then(s => { resolved[seg] = s.name }).catch(() => {}))
      }
    }

    Promise.all(promises).then(() => setNames(resolved))
  }, [pathname])

  const segments = pathname.split("/").filter(Boolean)
  const crumbs = segments.map((segment, index) => {
    const href = "/" + segments.slice(0, index + 1).join("/")
    const label = isUUID(segment)
      ? (names[segment] ?? segment.slice(0, 8) + "…")
      : (SEGMENT_LABELS[segment] ?? segment)
    return { href, label, isLast: index === segments.length - 1 }
  })

  return (
    <nav className="flex items-center gap-0 text-xs text-muted-foreground px-4 py-0 border-b border-border bg-background/60 overflow-hidden h-9 flex-shrink-0">
      {/* Home */}
      <Link
        href="/projects"
        className="flex items-center gap-1.5 font-mono text-neon-cyan/70 hover:text-neon-cyan transition-colors shrink-0 pr-2"
      >
        <span className="text-neon-cyan/40 select-none">▸</span>
        <span className="tracking-wider">zzpeo</span>
      </Link>

      {crumbs.map(({ href, label, isLast }, idx) => (
        <span key={href} className="flex items-center gap-0 min-w-0 shrink">
          <span className="text-border px-1.5 select-none font-mono">/</span>
          {isLast ? (
            <span
              className={cn(
                "font-mono truncate max-w-[160px] text-foreground",
                "text-glow-cyan"
              )}
              title={label}
            >
              {label}
            </span>
          ) : (
            <Link
              href={href}
              className="font-mono hover:text-neon-cyan/80 transition-colors truncate max-w-[160px] text-muted-foreground/60"
              title={label}
            >
              {label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}
