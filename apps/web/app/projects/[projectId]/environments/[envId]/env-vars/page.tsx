"use client"

import { useState, useEffect } from "react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/use-toast"
import { Plus, Trash2, Save, FileText, Eye, EyeOff, ChevronDown, ChevronUp } from "lucide-react"
import type { EnvVar } from "@/lib/types"

interface Row {
  key: string
  value: string
  existing: boolean
}

interface PageProps {
  params: { projectId: string; envId: string }
}

function parseEnvText(text: string): Array<{ key: string; value: string }> {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .flatMap((line) => {
      const eq = line.indexOf("=")
      if (eq === -1) return []
      const key = line.slice(0, eq).trim()
      const value = line.slice(eq + 1).trim()
      if (!key) return []
      return [{ key, value }]
    })
}

export default function EnvVarsPage({ params }: PageProps) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [shownRows, setShownRows] = useState<Set<number>>(new Set())

  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState("")
  const [importPreview, setImportPreview] = useState<Array<{ key: string; value: string }>>([])

  useEffect(() => {
    api.envVars
      .list(params.envId)
      .then((vars: EnvVar[]) => {
        setRows(vars.map((v) => ({ key: v.key, value: "", existing: true })))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [params.envId])

  const addRow = () => {
    setRows((prev) => [...prev, { key: "", value: "", existing: false }])
    setExpanded(true)
  }

  const removeRow = async (index: number) => {
    const row = rows[index]
    if (row.existing && row.key) {
      try {
        await api.envVars.delete(params.envId, row.key)
      } catch {
        // best-effort; remove from UI regardless
      }
    }
    setRows((prev) => prev.filter((_, i) => i !== index))
    setShownRows((prev) => {
      const next = new Set<number>()
      for (const n of Array.from(prev)) {
        if (n < index) next.add(n)
        else if (n > index) next.add(n - 1)
      }
      return next
    })
  }

  const updateKey = (index: number, key: string) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, key } : r)))
  }

  const updateValue = (index: number, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, value } : r)))
  }

  const toggleShowRow = (index: number) => {
    setShownRows((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const handleSave = async () => {
    const validRows = rows.filter((r) => r.key.trim() !== "")
    setSaving(true)
    try {
      await api.envVars.upsert(
        params.envId,
        validRows.map((r) => ({ key: r.key, value: r.value }))
      )
      toast({ title: "Env vars saved", description: `${validRows.length} variables saved.` })
      const vars = await api.envVars.list(params.envId)
      setRows(vars.map((v) => ({ key: v.key, value: "", existing: true })))
      setShownRows(new Set())
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to save",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleImportTextChange = (text: string) => {
    setImportText(text)
    setImportPreview(parseEnvText(text))
  }

  const handleImportConfirm = () => {
    if (importPreview.length === 0) return
    setRows((prev) => {
      const merged = [...prev]
      for (const { key, value } of importPreview) {
        const existing = merged.findIndex((r) => r.key === key)
        if (existing !== -1) {
          merged[existing] = { ...merged[existing], value }
        } else {
          merged.push({ key, value, existing: false })
        }
      }
      return merged
    })
    setShowImport(false)
    setImportText("")
    setImportPreview([])
    setExpanded(true)
    toast({ title: `${importPreview.length} variables imported`, description: "Review and click Save All to persist." })
  }

  if (loading) {
    return <div className="text-muted-foreground py-8">Loading env vars...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Environment Variables</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage key-value environment variables. Values are masked in list view.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <FileText className="h-4 w-4 mr-2" />
            Import from text
          </Button>
          <Button variant="outline" onClick={addRow}>
            <Plus className="h-4 w-4 mr-2" />
            Add Row
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save All"}
          </Button>
        </div>
      </div>

      {/* Collapse toggle bar */}
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
              <Badge key={r.key} variant="secondary" className="font-mono text-xs">
                {r.key}
              </Badge>
            ))
          )}
        </div>
        <Button variant="ghost" size="sm" tabIndex={-1} onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {expanded && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[38%]">Key</TableHead>
                <TableHead className="w-[52%]">Value</TableHead>
                <TableHead className="w-[10%]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    No env vars yet. Click &ldquo;Add Row&rdquo; to create one.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, i) => {
                  const shown = shownRows.has(i)
                  return (
                    <TableRow key={i}>
                      <TableCell>
                        <Input
                          value={row.key}
                          onChange={(e) => updateKey(i, e.target.value)}
                          placeholder="KEY_NAME"
                          className="font-mono h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type={shown ? "text" : "password"}
                          value={row.value}
                          onChange={(e) => updateValue(i, e.target.value)}
                          placeholder={row.existing ? "leave blank to keep current" : "value"}
                          className="font-mono h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => toggleShowRow(i)}
                          >
                            {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => removeRow(i)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save All"}
          </Button>
        </div>
      )}

      <Dialog open={showImport} onOpenChange={(open) => { setShowImport(open); if (!open) { setImportText(""); setImportPreview([]) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import from text</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              className="font-mono text-sm min-h-[200px] break-all whitespace-pre-wrap"
              placeholder={"DB_HOST=localhost\nDB_PORT=5432\nDB_USER=admin\nDB_PASS=secret"}
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
                    <span className="text-foreground font-semibold shrink-0">{key}</span>
                    <span className="text-muted-foreground shrink-0">=</span>
                    <span className="text-muted-foreground break-all min-w-0">{value}</span>
                  </div>
                ))}
              </div>
            )}
            {importText && importPreview.length === 0 && (
              <p className="text-xs text-muted-foreground">No valid KEY=VALUE pairs detected.</p>
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
    </div>
  )
}
