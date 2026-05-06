"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/use-toast"
import {
  Plus, Trash2, Eye, EyeOff, Copy, Check,
  FileText, Save, ChevronDown, ChevronUp,
} from "lucide-react"
import type { DeployType, EnvVarDeployMode } from "@/lib/types"

// ─── Types ────────────────────────────────────────────────────

export interface EnvVarRowData {
  key: string
  value: string          // "****" for existing masked
  deploy_mode?: string
}

export interface EnvVarsEditorProps {
  /** Load current rows from the API */
  loadFn: () => Promise<EnvVarRowData[]>
  /** Reveal all plaintext values */
  revealFn: () => Promise<{ key: string; value: string }[]>
  /**
   * Persist changed/new rows.
   * Component only passes rows that need updating:
   * - new rows (not existing)
   * - rows where value !== "****"
   * - rows where deploy_mode changed (when showDeployMode=true)
   */
  saveFn: (items: EnvVarRowData[]) => Promise<void>
  /** Delete a single row by key */
  deleteFn: (key: string) => Promise<void>

  /** Show deploy_mode column + bulk selector. Pass true for docker services. */
  showDeployMode?: boolean
  /** Wrap table in a collapsible section showing key badges when closed */
  collapsible?: boolean
  /** Contextual hint rendered below the card title */
  hint?: React.ReactNode
  /** Called after a successful save (so parent can refresh other state) */
  onSaved?: () => void
}

// ─── Import parsers ───────────────────────────────────────────

type ImportFormat = "env" | "k8s-secret" | "yaml"

const IMPORT_PLACEHOLDER = `# .env format
DB_HOST=localhost
DB_PORT=5432

# — or K8s Secret YAML —
apiVersion: v1
kind: Secret
stringData:
  DB_HOST: localhost
  DB_PORT: "5432"
data:
  SECRET_KEY: base64encodedvalue==`

function stripYamlQuotes(v: string): string {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    return v.slice(1, -1)
  return v
}

function parseK8sSecret(text: string): { key: string; value: string }[] {
  const result: { key: string; value: string }[] = []
  let section: "data" | "stringData" | null = null

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd()
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    // Section headers at indent-0
    if (!line.startsWith(" ") && !line.startsWith("\t")) {
      if (/^data\s*:/.test(trimmed))       { section = "data";       continue }
      if (/^stringData\s*:/.test(trimmed)) { section = "stringData"; continue }
      section = null
      continue
    }

    if (!section) continue

    const m = trimmed.match(/^([A-Za-z0-9_.\-]+)\s*:\s*(.*)$/)
    if (!m) continue

    const key = m[1]
    let value = stripYamlQuotes(m[2].trim())

    if (section === "data" && value) {
      try { value = atob(value) } catch { /* keep as-is if invalid base64 */ }
    }

    if (key) result.push({ key, value })
  }
  return result
}

function parseSimpleYaml(text: string): { key: string; value: string }[] {
  return text.split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .flatMap((l) => {
      const colon = l.indexOf(": ")
      if (colon !== -1) {
        const key = l.slice(0, colon).trim()
        const value = stripYamlQuotes(l.slice(colon + 2).trim())
        return key ? [{ key, value }] : []
      }
      // KEY: (no value → empty string)
      if (l.endsWith(":")) {
        const key = l.slice(0, -1).trim()
        return key ? [{ key, value: "" }] : []
      }
      return []
    })
}

function parseEnv(text: string): { key: string; value: string }[] {
  return text.split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .flatMap((l) => {
      const eq = l.indexOf("=")
      if (eq === -1) return []
      const key = l.slice(0, eq).trim()
      const value = l.slice(eq + 1).trim()
      return key ? [{ key, value }] : []
    })
}

function detectAndParseImport(text: string): { format: ImportFormat; items: { key: string; value: string }[] } {
  const lines = text.split("\n").map((l) => l.trim())

  if (lines.some((l) => /^kind\s*:\s*Secret/.test(l))) {
    return { format: "k8s-secret", items: parseK8sSecret(text) }
  }

  const hasColon  = lines.some((l) => /^[A-Za-z0-9_][\w.\-]*\s*:\s*/.test(l))
  const hasEquals = lines.some((l) => /^[A-Za-z0-9_][\w.\-]*=/.test(l))

  if (hasColon && !hasEquals) {
    return { format: "yaml", items: parseSimpleYaml(text) }
  }

  return { format: "env", items: parseEnv(text) }
}

// ─── Internal row ─────────────────────────────────────────────

interface Row {
  key: string
  value: string
  deployMode: EnvVarDeployMode
  originalDeployMode: EnvVarDeployMode
  existing: boolean
}

// ─── Component ────────────────────────────────────────────────

export function EnvVarsEditor({
  loadFn,
  revealFn,
  saveFn,
  deleteFn,
  showDeployMode = false,
  collapsible = false,
  hint,
  onSaved,
}: EnvVarsEditorProps) {
  const [rows, setRows] = useState<Row[]>([])
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(true)

  // Reveal
  const [revealedMap, setRevealedMap] = useState<Map<string, string>>(new Map())
  const [hasRevealed, setHasRevealed] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [shownRows, setShownRows] = useState<Set<number>>(new Set())

  // Copy
  const [copied, setCopied] = useState(false)

  // Bulk select (deploy_mode only)
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())

  // Import
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState("")
  const [importPreview, setImportPreview] = useState<{ key: string; value: string }[]>([])
  const [importFormat, setImportFormat] = useState<"env" | "k8s-secret" | "yaml" | null>(null)

  // ── load ──────────────────────────────────────────────────────

  const reload = useCallback(async () => {
    try {
      const data = await loadFn()
      setRows(data.map((v) => ({
        key: v.key,
        value: v.value,
        deployMode: (v.deploy_mode ?? "all") as EnvVarDeployMode,
        originalDeployMode: (v.deploy_mode ?? "all") as EnvVarDeployMode,
        existing: true,
      })))
    } catch { /* parent handles errors */ }
  }, [loadFn])

  useEffect(() => { reload() }, [reload])

  // ── reveal ────────────────────────────────────────────────────

  const ensureRevealed = useCallback(async () => {
    if (hasRevealed) return
    try {
      const data = await revealFn()
      setRevealedMap(new Map(data.map((d) => [d.key, d.value])))
      setHasRevealed(true)
    } catch { /* best-effort */ }
  }, [hasRevealed, revealFn])

  // ── row helpers ───────────────────────────────────────────────

  const addRow = () => {
    setRows((prev) => [...prev, { key: "", value: "", deployMode: "all", originalDeployMode: "all", existing: false }])
    setExpanded(true)
  }

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))

  const removeRow = async (i: number) => {
    const row = rows[i]
    if (row.existing && row.key) {
      try { await deleteFn(row.key) } catch { /* best-effort */ }
    }
    setRows((prev) => prev.filter((_, idx) => idx !== i))
    setShownRows((prev) => {
      const next = new Set<number>()
      for (const n of Array.from(prev)) {
        if (n < i) next.add(n)
        else if (n > i) next.add(n - 1)
      }
      return next
    })
    setSelectedRows((prev) => {
      const next = new Set<number>()
      for (const n of Array.from(prev)) {
        if (n < i) next.add(n)
        else if (n > i) next.add(n - 1)
      }
      return next
    })
  }

  const toggleShowRow = async (i: number) => {
    if (!shownRows.has(i)) await ensureRevealed()
    setShownRows((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const toggleSelectRow = (i: number) =>
    setSelectedRows((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })

  const bulkSetDeployMode = (mode: EnvVarDeployMode) => {
    setRows((prev) => prev.map((r, i) => selectedRows.has(i) ? { ...r, deployMode: mode } : r))
    setSelectedRows(new Set())
  }

  // ── save ──────────────────────────────────────────────────────

  const handleSave = async () => {
    const toUpsert = rows.filter((r) =>
      r.key.trim() !== "" && (
        !r.existing ||
        r.value !== "****" ||
        (showDeployMode && r.deployMode !== r.originalDeployMode)
      )
    )
    setSaving(true)
    try {
      await saveFn(toUpsert.map((r) => ({
        key: r.key.trim(),
        value: r.value,
        deploy_mode: r.deployMode,
      })))
      toast({ title: "Env vars saved" })
      setShowAll(false)
      setShownRows(new Set())
      setSelectedRows(new Set())
      setRevealedMap(new Map())
      setHasRevealed(false)
      await reload()
      onSaved?.()
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // ── show all ──────────────────────────────────────────────────

  const toggleShowAll = async () => {
    if (!showAll) await ensureRevealed()
    setShowAll((v) => !v)
  }

  // ── copy ──────────────────────────────────────────────────────

  const handleCopy = async () => {
    await ensureRevealed()
    const text = rows
      .filter((r) => r.key.trim())
      .map((r) => {
        const val = r.existing && r.value === "****"
          ? (revealedMap.get(r.key) ?? r.value)
          : r.value
        return `${r.key}=${val}`
      })
      .join("\n")
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── import ────────────────────────────────────────────────────

  const handleImportTextChange = (text: string) => {
    setImportText(text)
    if (!text.trim()) {
      setImportPreview([])
      setImportFormat(null)
      return
    }
    const { format, items } = detectAndParseImport(text)
    setImportFormat(items.length > 0 ? format : null)
    setImportPreview(items)
  }

  const handleImportConfirm = () => {
    if (!importPreview.length) return
    setRows((prev) => {
      const merged = [...prev]
      for (const { key, value } of importPreview) {
        const idx = merged.findIndex((r) => r.key === key)
        if (idx !== -1) merged[idx] = { ...merged[idx], value }
        else merged.push({ key, value, deployMode: "all", originalDeployMode: "all", existing: false })
      }
      return merged
    })
    toast({ title: `${importPreview.length} variables imported`, description: "Click Save to persist." })
    setShowImport(false)
    setImportText("")
    setImportPreview([])
    setImportFormat(null)
  }

  // ── render ────────────────────────────────────────────────────

  const toolbar = (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={handleCopy} disabled={rows.length === 0}>
        {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
        {copied ? "Copied" : "Copy"}
      </Button>
      <Button variant="outline" size="sm" onClick={toggleShowAll} disabled={rows.length === 0}>
        {showAll ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
        {showAll ? "Hide All" : "Show All"}
      </Button>
      <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
        <FileText className="h-3.5 w-3.5 mr-1" />
        Import
      </Button>
      <Button variant="outline" size="sm" onClick={addRow}>
        <Plus className="h-3.5 w-3.5 mr-1" />
        Add
      </Button>
      <Button size="sm" onClick={handleSave} disabled={saving}>
        <Save className="h-3.5 w-3.5 mr-1" />
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  )

  const collapseToggle = collapsible && (
    <div
      className="flex items-center justify-between rounded-md border px-4 py-2 cursor-pointer hover:bg-muted/40 transition-colors"
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {rows.length === 0 ? (
          <span className="text-sm text-muted-foreground">No variables</span>
        ) : expanded ? (
          <span className="text-sm text-muted-foreground">{rows.length} variable{rows.length !== 1 ? "s" : ""}</span>
        ) : (
          rows.map((r) => r.key && (
            <Badge key={r.key} variant="secondary" className="font-mono text-xs">{r.key}</Badge>
          ))
        )}
      </div>
      <Button variant="ghost" size="sm" tabIndex={-1} onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>
    </div>
  )

  const table = (expanded || !collapsible) && (
    rows.length === 0 ? (
      <p className="text-sm text-muted-foreground py-2">No env vars yet. Click Add or Import.</p>
    ) : (
      <div className="rounded-md border">
        {showDeployMode && selectedRows.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b text-sm">
            <span className="text-muted-foreground">{selectedRows.size} selected — set mode:</span>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => bulkSetDeployMode("runtime")}>Runtime</Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => bulkSetDeployMode("build_arg")}>Build arg</Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => bulkSetDeployMode("both")}>Both</Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs ml-auto" onClick={() => setSelectedRows(new Set())}>Clear</Button>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              {showDeployMode && (
                <TableHead className="w-8 pr-0">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                    checked={rows.length > 0 && selectedRows.size === rows.length}
                    ref={(el) => { if (el) el.indeterminate = selectedRows.size > 0 && selectedRows.size < rows.length }}
                    onChange={(e) => setSelectedRows(e.target.checked ? new Set(rows.map((_, i) => i)) : new Set())}
                  />
                </TableHead>
              )}
              <TableHead className={showDeployMode ? "w-[30%]" : "w-[38%]"}>Key</TableHead>
              <TableHead>Value</TableHead>
              {showDeployMode && <TableHead className="w-[16%]">Mode</TableHead>}
              <TableHead className="w-[11%]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => {
              const shown = showAll || shownRows.has(i)
              const displayVal = shown && row.existing && row.value === "****"
                ? (revealedMap.get(row.key) ?? "")
                : row.value
              return (
                <TableRow key={i} className={showDeployMode && selectedRows.has(i) ? "bg-muted/30" : undefined}>
                  {showDeployMode && (
                    <TableCell className="pr-0">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                        checked={selectedRows.has(i)}
                        onChange={() => toggleSelectRow(i)}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <Input
                      value={row.key}
                      onChange={(e) => updateRow(i, { key: e.target.value })}
                      disabled={row.existing}
                      placeholder="KEY_NAME"
                      className="font-mono h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type={shown ? "text" : "password"}
                      value={displayVal}
                      onChange={(e) => updateRow(i, { value: e.target.value })}
                      placeholder={row.existing ? "leave blank to keep current" : "value"}
                      className="font-mono h-8"
                    />
                  </TableCell>
                  {showDeployMode && (
                    <TableCell>
                      <Select
                        value={row.deployMode}
                        onValueChange={(v) => updateRow(i, { deployMode: v as EnvVarDeployMode })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="runtime">Runtime</SelectItem>
                          <SelectItem value="build_arg">Build arg</SelectItem>
                          <SelectItem value="both">Both</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => toggleShowRow(i)}
                      >
                        {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => removeRow(i)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    )
  )

  return (
    <>
      <div className="flex items-center justify-between">
        {toolbar}
      </div>

      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

      {collapsible ? (
        <div className="space-y-2">
          {collapseToggle}
          {table}
        </div>
      ) : (
        <div className="mt-3">{table}</div>
      )}

      {/* Import dialog */}
      <Dialog open={showImport} onOpenChange={(o) => { setShowImport(o); if (!o) { setImportText(""); setImportPreview([]); setImportFormat(null) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Import variables
              {importFormat && (
                <span className={`text-xs font-normal px-2 py-0.5 rounded-full border ${
                  importFormat === "k8s-secret"
                    ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"
                    : importFormat === "yaml"
                    ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800"
                    : "bg-muted text-muted-foreground border-border"
                }`}>
                  {importFormat === "k8s-secret" ? "K8s Secret" : importFormat === "yaml" ? "YAML" : ".env"}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              className="font-mono text-sm min-h-[200px] break-all whitespace-pre-wrap"
              placeholder={IMPORT_PLACEHOLDER}
              value={importText}
              onChange={(e) => handleImportTextChange(e.target.value)}
              autoFocus
            />
            {importPreview.length > 0 && (
              <div className="rounded-md border bg-muted/40 p-3 space-y-1 max-h-48 overflow-y-auto">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {importPreview.length} variable{importPreview.length !== 1 ? "s" : ""} detected
                </p>
                {importPreview.map(({ key, value }) => (
                  <div key={key} className="flex items-start gap-2 text-xs font-mono min-w-0">
                    <span className="font-semibold shrink-0">{key}</span>
                    <span className="text-muted-foreground shrink-0">=</span>
                    <span className="text-muted-foreground break-all min-w-0">{value}</span>
                  </div>
                ))}
              </div>
            )}
            {importText && importPreview.length === 0 && (
              <p className="text-xs text-muted-foreground">No valid variables detected. Supported: .env (KEY=VALUE), K8s Secret YAML, plain YAML (KEY: value).</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImport(false)}>Cancel</Button>
            <Button onClick={handleImportConfirm} disabled={importPreview.length === 0}>
              Add {importPreview.length > 0 ? importPreview.length : ""} variable{importPreview.length !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
