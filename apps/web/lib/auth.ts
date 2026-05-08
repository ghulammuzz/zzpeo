"use client"

const TOKEN_KEY = "zzpeo_token"
const SESSION_COOKIE = "zzpeo_session"

export interface TokenPayload {
  sub: string
  username: string
  role: "admin" | "user"
  exp: number
  iat: number
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
  // Set session cookie for Next.js middleware route protection
  document.cookie = `${SESSION_COOKIE}=1; path=/; max-age=86400; SameSite=Lax`
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    const payload = token.split(".")[1]
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")))
  } catch {
    return null
  }
}

export function isTokenValid(token: string): boolean {
  const p = decodeToken(token)
  if (!p) return false
  return p.exp * 1000 > Date.now()
}

export function getCurrentUser(): TokenPayload | null {
  const token = getToken()
  if (!token || !isTokenValid(token)) return null
  return decodeToken(token)
}

export function isAdmin(): boolean {
  return getCurrentUser()?.role === "admin"
}

export function logout(): void {
  removeToken()
  window.location.href = "/login"
}
