"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollText, Square, Download, Trash2, ChevronDown, ChevronUp } from "lucide-react"
import type { DeployType, LogSourceType } from "@/lib/types"

// ---------------------------------------------------------------------------
// Log line coloring
// ---------------------------------------------------------------------------

const ANSI_RE = /[][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g
function stripAnsi(s: string): string { return s.replace(ANSI_RE, "") }

const LEVEL_RE = /\b(FATAL|PANIC|panic|fatal|ERROR|error|ERR\b|CRIT|crit)\b/
const WARN_RE  = /\b(WARN(?:ING)?|warn(?:ing)?)\b/
const INFO_RE  = /\b(INFO|info)\b/
const DEBUG_RE = /\b(DEBUG|debug|TRACE|trace)\b/

function lineClass(line: string): string {
  if (LEVEL_RE.test(line)) return "text-red-400"
  if (WARN_RE.test(line))  return "text-yellow-400"
  if (INFO_RE.test(line))  return "text-cyan-300"
  if (DEBUG_RE.test(line)) return "text-zinc-500"
  return "text-zinc-200"
}

// ---------------------------------------------------------------------------
// Search highlight
// ---------------------------------------------------------------------------

function HighlightedLine({ line, search }: { line: string; search: string }) {
  if (!search) return <span>{line}</span>
  const parts = line.split(new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"))
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === search.toLowerCase()
          ? <mark key={i} className="bg-yellow-400/30 text-yellow-200 rounded-sm px-0.5">{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const TAIL_OPTIONS = [
  { label: "Last 50",   value: "50" },
  { label: "Last 100",  value: "100" },
  { label: "Last 200",  value: "200" },
  { label: "Last 500",  value: "500" },
  { label: "Last 1000", value: "1000" },
]

const SINCE_OPTIONS = [
  { label: "All time",   value: "all" },
  { label: "5 minutes",  value: "5m" },
  { label: "15 minutes", value: "15m" },
  { label: "30 minutes", value: "30m" },
  { label: "1 hour",     value: "1h" },
  { label: "6 hours",    value: "6h" },
  { label: "24 hours",   value: "24h" },
]

interface Props {
  serviceId: string
  deployType: DeployType
  logConfigType?: LogSourceType
}

export function ServiceLogs({ serviceId, deployType, logConfigType }: Props) {
  const [lines, setLines]           = useState<string[]>([])
  const [streaming, setStreaming]   = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [search, setSearch]         = useState("")
  const [tail, setTail]             = useState("200")
  const [since, setSince]           = useState("all")
  const [autoScroll, setAutoScroll] = useState(true)

  const esRef     = useRef<EventSource | null>(null)
  const endRef    = useRef<HTMLDivElement | null>(null)
  const bodyRef   = useRef<HTMLDivElement | null>(null)

  // Auto-scroll whenever lines change
  useEffect(() => {
    if (autoScroll) endRef.current?.scrollIntoView({ behavior: "instant" })
  }, [lines, autoScroll])

  // Detect manual scroll up → disable auto-scroll
  const handleScroll = useCallback(() => {
    const el = bodyRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setAutoScroll(atBottom)
  }, [])

  const stop = useCallback(() => {
    esRef.current?.close()
    esRef.current = null
    setStreaming(false)
  }, [])

  const start = useCallback(() => {
    stop()
    setLines([])
    setError(null)
    setStreaming(true)
    const es = api.logs.stream(serviceId, Number(tail), since === "all" ? undefined : since)
    esRef.current = es

    es.addEventListener("log", (e) => {
      setLines((prev) => {
        const next = [...prev, stripAnsi((e as MessageEvent).data as string)]
        return next.length > 5000 ? next.slice(-5000) : next
      })
    })
    es.addEventListener("error", (e) => {
      setError((e as MessageEvent).data ?? "Stream connection failed")
      setStreaming(false)
      es.close()
    })
    es.onerror = () => {
      setError((prev) => prev ?? "Stream connection failed — service may be unreachable or session expired")
      setStreaming(false)
      es.close()
    }
  }, [serviceId, tail, since, stop])

  // Stop on unmount
  useEffect(() => () => { esRef.current?.close() }, [])

  const filtered = search
    ? lines.filter((l) => l.toLowerCase().includes(search.toLowerCase()))
    : lines

  const downloadLogs = () => {
    const blob = new Blob([lines.join("\n")], { type: "text/plain" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = `${serviceId}-logs.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const errorCount = lines.filter((l) => LEVEL_RE.test(l)).length
  const warnCount  = lines.filter((l) => WARN_RE.test(l)).length

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Start / Stop */}
        {streaming ? (
          <Button variant="outline" size="sm" onClick={stop}>
            <Square className="h-3.5 w-3.5 mr-1" />
            Stop
          </Button>
        ) : (
          <Button size="sm" onClick={start}>
            <ScrollText className="h-3.5 w-3.5 mr-1" />
            {lines.length > 0 ? "Restart" : "Start"}
          </Button>
        )}

        {/* Tail */}
        <Select value={tail} onValueChange={setTail}>
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TAIL_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Since — docker_logs only */}
        {(logConfigType === "docker_logs" || (!logConfigType && deployType === "docker")) && (
          <Select value={since} onValueChange={setSince}>
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue placeholder="All time" />
            </SelectTrigger>
            <SelectContent>
              {SINCE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Search */}
        <Input
          placeholder="Search logs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-xs w-44 font-mono"
        />

        <div className="flex items-center gap-1 ml-auto">
          {/* Auto-scroll toggle */}
          <Button
            variant={autoScroll ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setAutoScroll((v) => !v)
              if (!autoScroll) endRef.current?.scrollIntoView({ behavior: "smooth" })
            }}
            title="Auto-scroll"
          >
            {autoScroll ? <ChevronDown className="h-3.5 w-3.5 mr-1" /> : <ChevronUp className="h-3.5 w-3.5 mr-1" />}
            Auto
          </Button>

          {/* Download */}
          <Button variant="outline" size="sm" className="h-8" onClick={downloadLogs} disabled={lines.length === 0} title="Download">
            <Download className="h-3.5 w-3.5" />
          </Button>

          {/* Clear */}
          <Button variant="outline" size="sm" className="h-8" onClick={() => setLines([])} disabled={lines.length === 0} title="Clear">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive font-mono">
          {error}
        </div>
      )}

      {/* Terminal */}
      <div className="relative rounded-md border bg-zinc-950 overflow-hidden">
        {/* Live indicator */}
        {streaming && (
          <div className="absolute top-2 right-3 flex items-center gap-1.5 text-xs text-emerald-400 z-10 pointer-events-none">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            live
          </div>
        )}

        {lines.length === 0 && !streaming ? (
          <div className="flex items-center justify-center h-32 text-xs text-zinc-500">
            Configure options above then click Start
          </div>
        ) : streaming && lines.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-xs text-zinc-500 animate-pulse">
            Connecting…
          </div>
        ) : (
          <div
            ref={bodyRef}
            onScroll={handleScroll}
            className="h-96 overflow-y-auto p-3 font-mono text-xs leading-5 space-y-0"
          >
            {filtered.map((line, i) => (
              <div key={i} className={`whitespace-pre-wrap break-all ${lineClass(line)}`}>
                <HighlightedLine line={line} search={search} />
              </div>
            ))}
            {search && filtered.length === 0 && (
              <div className="text-zinc-500 italic">No lines match "{search}"</div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3 text-xs text-zinc-500 font-mono px-1">
        <span>{lines.length.toLocaleString()} lines</span>
        {search && <span className="text-yellow-400">{filtered.length.toLocaleString()} matches</span>}
        {errorCount > 0 && <span className="text-red-400">{errorCount} errors</span>}
        {warnCount > 0  && <span className="text-yellow-500">{warnCount} warnings</span>}
      </div>
    </div>
  )
}
