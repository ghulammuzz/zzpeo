"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, Home } from "lucide-react"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"

const SEGMENT_LABELS: Record<string, string> = {
  projects: "Projects",
  environments: "Environments",
  "env-vars": "Env Vars",
  servers: "Servers",
  services: "Services",
  objects: "Objects",
  nginx: "Nginx",
  deploy: "Deploy",
  new: "New",
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
    <nav className="flex items-center gap-1 text-sm text-muted-foreground px-6 py-3 border-b overflow-hidden">
      <Link href="/projects" className="flex items-center gap-1 hover:text-foreground transition-colors shrink-0">
        <Home className="h-3.5 w-3.5" />
        <span>zzpeo</span>
      </Link>

      {crumbs.map(({ href, label, isLast }) => (
        <span key={href} className="flex items-center gap-1 min-w-0 shrink">
          <ChevronRight className="h-3.5 w-3.5 opacity-50 shrink-0" />
          {isLast ? (
            <span
              className="text-foreground font-medium truncate max-w-[180px]"
              title={label}
            >
              {label}
            </span>
          ) : (
            <Link
              href={href}
              className="hover:text-foreground transition-colors truncate max-w-[180px]"
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
