"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { setToken } from "@/lib/auth"

interface PageProps {
  params: { token: string }
}

export default function RegisterPage({ params }: PageProps) {
  const router = useRouter()
  const [username, setUsername] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [tokenValid, setTokenValid] = useState<boolean | null>(null)

  useEffect(() => {
    api.auth.registerInfo(params.token)
      .then((info) => { setUsername(info.username); setTokenValid(true) })
      .catch(() => setTokenValid(false))
  }, [params.token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError("passwords do not match"); return }
    if (password.length < 8) { setError("password must be at least 8 characters"); return }

    setLoading(true)
    setError("")
    try {
      const res = await api.auth.register(params.token, { password })
      setToken(res.token)
      router.replace("/projects")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @keyframes neon-pulse {
          0%, 100% { text-shadow: 0 0 10px rgba(0,229,255,0.8), 0 0 20px rgba(0,229,255,0.4); }
          50% { text-shadow: 0 0 20px rgba(0,229,255,1), 0 0 40px rgba(0,229,255,0.7); }
        }
        @keyframes border-glow {
          0%, 100% { box-shadow: 0 0 10px rgba(0,229,255,0.2), inset 0 0 10px rgba(0,229,255,0.05); }
          50% { box-shadow: 0 0 20px rgba(0,229,255,0.4), inset 0 0 20px rgba(0,229,255,0.08); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .title-glow { animation: neon-pulse 3s ease-in-out infinite; }
        .card-glow { animation: border-glow 3s ease-in-out infinite; }
        .fade-up { animation: fade-up 0.5s ease forwards; }
        .login-grid {
          background-image:
            linear-gradient(rgba(0,229,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,229,255,0.04) 1px, transparent 1px);
          background-size: 40px 40px;
        }
      `}</style>

      <div className="relative min-h-screen flex items-center justify-center overflow-hidden" style={{ background: "hsl(222,47%,3%)" }}>
        <div className="login-grid absolute inset-0 opacity-60" />
        <div className="absolute inset-0" style={{
          background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(0,229,255,0.05) 0%, transparent 70%)"
        }} />
        <div className="absolute top-6 left-6 w-12 h-12 border-l-2 border-t-2 opacity-20" style={{ borderColor: "#00e5ff" }} />
        <div className="absolute bottom-6 right-6 w-12 h-12 border-r-2 border-b-2 opacity-20" style={{ borderColor: "#00e5ff" }} />

        <div className="relative z-10 w-full max-w-sm mx-4">
          <div className="text-center mb-8 fade-up">
            <h1 className="font-sans text-4xl font-bold tracking-[0.15em] title-glow" style={{ color: "#00e5ff" }}>
              ZZPEO
            </h1>
            <p className="font-mono text-xs tracking-[0.2em] mt-2" style={{ color: "rgba(0,229,255,0.4)" }}>
              // ACCOUNT ACTIVATION
            </p>
            <div className="mt-3 h-px w-24 mx-auto" style={{ background: "linear-gradient(90deg, transparent, #00e5ff, transparent)" }} />
          </div>

          {tokenValid === false ? (
            <div
              className="card-glow rounded-sm border p-6 text-center fade-up"
              style={{ background: "hsl(218,45%,5%)", borderColor: "rgba(255,0,85,0.3)" }}
            >
              <p className="font-mono text-sm" style={{ color: "#ff4488" }}>
                ✗ registration link is invalid or expired
              </p>
              <p className="font-mono text-xs mt-2" style={{ color: "rgba(255,255,255,0.3)" }}>
                contact admin for a new link
              </p>
            </div>
          ) : tokenValid === true ? (
            <div
              className="card-glow rounded-sm border p-6 fade-up"
              style={{ background: "hsl(218,45%,5%)", borderColor: "rgba(0,229,255,0.3)" }}
            >
              <div className="mb-5">
                <p className="font-mono text-[10px] tracking-widest" style={{ color: "rgba(0,229,255,0.4)" }}>
                  // ACTIVATING ACCOUNT
                </p>
                <p className="font-mono text-sm mt-1.5" style={{ color: "#00e5ff" }}>
                  {username}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {[
                  { label: "SET PASSWORD", value: password, onChange: setPassword, placeholder: "min 8 characters" },
                  { label: "CONFIRM PASSWORD", value: confirm, onChange: setConfirm, placeholder: "repeat password" },
                ].map(({ label, value, onChange, placeholder }) => (
                  <div key={label}>
                    <label className="block font-mono text-[10px] tracking-widest mb-1.5" style={{ color: "rgba(0,229,255,0.5)" }}>
                      {label}
                    </label>
                    <input
                      type="password"
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                      placeholder={placeholder}
                      className="w-full font-mono text-sm px-3 py-2.5 rounded-sm border outline-none transition-all duration-150 placeholder:opacity-30"
                      style={{ background: "hsl(218,38%,8%)", borderColor: "hsl(218,38%,15%)", color: "#d0eeff" }}
                      onFocus={(e) => { e.target.style.borderColor = "#00e5ff"; e.target.style.boxShadow = "0 0 12px rgba(0,229,255,0.2)" }}
                      onBlur={(e) => { e.target.style.borderColor = "hsl(218,38%,15%)"; e.target.style.boxShadow = "none" }}
                    />
                  </div>
                ))}

                {error && (
                  <div className="rounded-sm border px-3 py-2 font-mono text-xs" style={{
                    borderColor: "rgba(255,0,85,0.3)", background: "rgba(255,0,85,0.06)", color: "#ff4488",
                  }}>
                    ✗ {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !password || !confirm}
                  className="w-full font-mono text-sm font-semibold tracking-widest py-2.5 rounded-sm border transition-all duration-150 mt-2"
                  style={{
                    borderColor: "#00e5ff", color: "#00e5ff", background: "rgba(0,229,255,0.05)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,229,255,0.1)"; e.currentTarget.style.boxShadow = "0 0 20px rgba(0,229,255,0.3)" }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,229,255,0.05)"; e.currentTarget.style.boxShadow = "none" }}
                >
                  {loading ? "ACTIVATING..." : "ACTIVATE ACCOUNT →"}
                </button>
              </form>
            </div>
          ) : (
            <div className="text-center fade-up">
              <p className="font-mono text-xs animate-pulse" style={{ color: "rgba(0,229,255,0.4)" }}>
                ▌ verifying link...
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
