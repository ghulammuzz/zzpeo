"use client"

import { usePathname } from "next/navigation"
import { Sidebar } from "./Sidebar"
import { Breadcrumbs } from "./Breadcrumbs"

const AUTH_ROUTES = ["/login", "/register"]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname.startsWith(r))

  if (isAuthRoute) {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Breadcrumbs />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
