"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { setToken, getCurrentUser } from "@/lib/auth"

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Redirect if already logged in
    if (getCurrentUser()) {
      router.replace("/dashboard")
    }
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return

    setLoading(true)
    setError("")

    try {
      const res = await api.auth.login({ username, password })
      setToken(res.token)
      router.replace("/dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed")
    } finally {
      setLoading(false)
    }
  }

  if (!mounted) return null

  return (
    <>
      <style>{`
        @keyframes grid-move {
          0% { transform: translate(0, 0); }
          100% { transform: translate(40px, 40px); }
        }
        @keyframes neon-pulse {
          0%, 100% { text-shadow: 0 0 10px rgba(0,229,255,0.8), 0 0 20px rgba(0,229,255,0.4), 0 0 40px rgba(0,229,255,0.2); }
          50% { text-shadow: 0 0 20px rgba(0,229,255,1), 0 0 40px rgba(0,229,255,0.7), 0 0 80px rgba(0,229,255,0.3); }
        }
        @keyframes scanline {
          0% { top: -2px; }
          100% { top: 100%; }
        }
        @keyframes border-glow {
          0%, 100% { box-shadow: 0 0 10px rgba(0,229,255,0.2), inset 0 0 10px rgba(0,229,255,0.05); }
          50% { box-shadow: 0 0 20px rgba(0,229,255,0.4), inset 0 0 20px rgba(0,229,255,0.08); }
        }
        @keyframes cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes corner-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .login-grid {
          background-image:
            linear-gradient(rgba(0,229,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,229,255,0.04) 1px, transparent 1px);
          background-size: 40px 40px;
          animation: grid-move 8s linear infinite;
        }
        .title-glow { animation: neon-pulse 3s ease-in-out infinite; }
        .card-glow { animation: border-glow 3s ease-in-out infinite; }
        .scanline {
          position: absolute; left: 0; right: 0; height: 2px;
          background: linear-gradient(90deg, transparent, rgba(0,229,255,0.3), transparent);
          animation: scanline 4s linear infinite;
          pointer-events: none;
        }
        .fade-up { animation: fade-up 0.6s ease forwards; }
        .fade-up-2 { animation: fade-up 0.6s ease 0.1s forwards; opacity: 0; }
        .fade-up-3 { animation: fade-up 0.6s ease 0.2s forwards; opacity: 0; }
        .cursor { animation: cursor-blink 1s step-end infinite; }
      `}</style>

      <div className="relative min-h-screen flex items-center justify-center overflow-hidden" style={{ background: "hsl(222,47%,3%)" }}>
        {/* Animated grid background */}
        <div className="login-grid absolute inset-0 opacity-60" />

        {/* Radial spotlight */}
        <div className="absolute inset-0" style={{
          background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(0,229,255,0.06) 0%, transparent 70%)"
        }} />

        {/* Scanline effect */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="scanline" />
        </div>

        {/* Corner decorations */}
        <div className="absolute top-6 left-6 w-16 h-16 border-l-2 border-t-2 opacity-30" style={{ borderColor: "#00e5ff" }} />
        <div className="absolute top-6 right-6 w-16 h-16 border-r-2 border-t-2 opacity-30" style={{ borderColor: "#00e5ff" }} />
        <div className="absolute bottom-6 left-6 w-16 h-16 border-l-2 border-b-2 opacity-30" style={{ borderColor: "#00e5ff" }} />
        <div className="absolute bottom-6 right-6 w-16 h-16 border-r-2 border-b-2 opacity-30" style={{ borderColor: "#00e5ff" }} />

        {/* Main card */}
        <div className="relative z-10 w-full max-w-sm mx-4">
          {/* Logo section */}
          <div className="text-center mb-8 fade-up">
            <h1 className="font-sans text-5xl font-bold tracking-[0.15em] title-glow" style={{ color: "#00e5ff" }}>
              ZZPEO
            </h1>
            <p className="font-mono text-xs tracking-[0.25em] mt-2" style={{ color: "rgba(0,229,255,0.4)" }}>
              // SERVER MANAGEMENT SYSTEM
            </p>
            <div className="mt-3 h-px w-32 mx-auto" style={{ background: "linear-gradient(90deg, transparent, #00e5ff, transparent)" }} />
          </div>

          {/* Login form card */}
          <div
            className="card-glow rounded-sm border p-6 fade-up-2"
            style={{
              background: "hsl(218,45%,5%)",
              borderColor: "rgba(0,229,255,0.3)",
            }}
          >
            <p className="font-mono text-xs tracking-widest mb-5" style={{ color: "rgba(0,229,255,0.5)" }}>
              // AUTHENTICATE
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block font-mono text-[10px] tracking-widest mb-1.5" style={{ color: "rgba(0,229,255,0.5)" }}>
                  USERNAME
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  placeholder="enter username"
                  className="w-full font-mono text-sm px-3 py-2.5 rounded-sm border outline-none transition-all duration-150 placeholder:opacity-30"
                  style={{
                    background: "hsl(218,38%,8%)",
                    borderColor: "hsl(218,38%,15%)",
                    color: "#d0eeff",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#00e5ff"
                    e.target.style.boxShadow = "0 0 12px rgba(0,229,255,0.2)"
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "hsl(218,38%,15%)"
                    e.target.style.boxShadow = "none"
                  }}
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] tracking-widest mb-1.5" style={{ color: "rgba(0,229,255,0.5)" }}>
                  PASSWORD
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full font-mono text-sm px-3 py-2.5 rounded-sm border outline-none transition-all duration-150 placeholder:opacity-30"
                  style={{
                    background: "hsl(218,38%,8%)",
                    borderColor: "hsl(218,38%,15%)",
                    color: "#d0eeff",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#00e5ff"
                    e.target.style.boxShadow = "0 0 12px rgba(0,229,255,0.2)"
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "hsl(218,38%,15%)"
                    e.target.style.boxShadow = "none"
                  }}
                />
              </div>

              {error && (
                <div className="rounded-sm border px-3 py-2 font-mono text-xs" style={{
                  borderColor: "rgba(255,0,85,0.3)",
                  background: "rgba(255,0,85,0.06)",
                  color: "#ff4488",
                }}>
                  ✗ {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !username || !password}
                className="w-full font-mono text-sm font-semibold tracking-widest py-2.5 rounded-sm border transition-all duration-150 mt-2"
                style={{
                  borderColor: loading ? "rgba(0,229,255,0.3)" : "#00e5ff",
                  color: loading ? "rgba(0,229,255,0.4)" : "#00e5ff",
                  background: loading ? "rgba(0,229,255,0.03)" : "rgba(0,229,255,0.05)",
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.background = "rgba(0,229,255,0.1)"
                    e.currentTarget.style.boxShadow = "0 0 20px rgba(0,229,255,0.3)"
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(0,229,255,0.05)"
                  e.currentTarget.style.boxShadow = "none"
                }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="cursor">▌</span>
                    AUTHENTICATING...
                  </span>
                ) : (
                  "ACCESS SYSTEM →"
                )}
              </button>
            </form>
          </div>

          {/* Footer */}
          <p className="text-center font-mono text-[10px] mt-6 fade-up-3" style={{ color: "rgba(0,229,255,0.2)" }}>
            ZZPEO v1.0 · SECURE ACCESS TERMINAL
          </p>
        </div>
      </div>
    </>
  )
}
