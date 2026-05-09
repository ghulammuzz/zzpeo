"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { LogConfig, LogSourceType } from "@/lib/types"

const SOURCE_TYPES: { value: LogSourceType | "none"; label: string; description: string }[] = [
  { value: "none",             label: "None",                    description: "No log streaming" },
  { value: "docker_logs",      label: "Docker Logs",             description: "docker logs -f (container stdout/stderr)" },
  { value: "pm2",              label: "PM2",                     description: "pm2 logs --raw (Node.js via PM2)" },
  { value: "file",             label: "File (host)",             description: "tail -f a log file on the server" },
  { value: "docker_exec_file", label: "File inside container",   description: "docker exec + tail -f inside a running container" },
  { value: "journalctl",       label: "Journalctl",              description: "journalctl -u (systemd service)" },
  { value: "dokploy",          label: "Dokploy",                 description: "resolve container via Dokploy API + poll logs" },
]

interface Props {
  value: LogConfig | undefined
  onChange: (cfg: LogConfig | undefined) => void
}

export function LogSourceEditor({ value, onChange }: Props) {
  const currentType: LogSourceType | "none" = value?.type ?? "none"

  const setType = (t: LogSourceType | "none") => {
    if (t === "none") { onChange(undefined); return }
    onChange({ ...value, type: t } as LogConfig)
  }

  const setField = (field: keyof LogConfig, v: string) => {
    if (!value) return
    onChange({ ...value, [field]: v || undefined })
  }

  const selected = SOURCE_TYPES.find((s) => s.value === currentType)

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Log Source Type</Label>
        <Select value={currentType} onValueChange={(v) => setType(v as LogSourceType | "none")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_TYPES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                <span className="font-medium">{s.label}</span>
                <span className="text-muted-foreground text-xs ml-2">{s.description}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected && currentType !== "none" && (
          <p className="text-xs text-muted-foreground">{selected.description}</p>
        )}
      </div>

      {/* docker_logs */}
      {currentType === "docker_logs" && (
        <div className="space-y-1.5">
          <Label>Container Name</Label>
          <Input
            placeholder="my-app"
            value={value?.container_name ?? ""}
            onChange={(e) => setField("container_name", e.target.value)}
            className="font-mono"
          />
        </div>
      )}

      {/* pm2 */}
      {currentType === "pm2" && (
        <div className="space-y-1.5">
          <Label>PM2 App Name</Label>
          <Input
            placeholder="my-app"
            value={value?.app_name ?? ""}
            onChange={(e) => setField("app_name", e.target.value)}
            className="font-mono"
          />
        </div>
      )}

      {/* file */}
      {currentType === "file" && (
        <div className="space-y-1.5">
          <Label>Log File Path</Label>
          <Input
            placeholder="/var/log/app.log"
            value={value?.path ?? ""}
            onChange={(e) => setField("path", e.target.value)}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">Absolute path on the server host.</p>
        </div>
      )}

      {/* docker_exec_file */}
      {currentType === "docker_exec_file" && (
        <>
          <div className="space-y-1.5">
            <Label>Container Name</Label>
            <Input
              placeholder="my-app"
              value={value?.container_name ?? ""}
              onChange={(e) => setField("container_name", e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Log File Path inside Container</Label>
            <Input
              placeholder="/var/www/storage/logs/laravel.log"
              value={value?.path ?? ""}
              onChange={(e) => setField("path", e.target.value)}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">Path inside the container (e.g. Laravel storage/logs/laravel.log).</p>
          </div>
        </>
      )}

      {/* journalctl */}
      {currentType === "journalctl" && (
        <div className="space-y-1.5">
          <Label>Systemd Unit</Label>
          <Input
            placeholder="myapp.service"
            value={value?.unit ?? ""}
            onChange={(e) => setField("unit", e.target.value)}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">Unit name passed to <code className="bg-muted px-1 rounded">journalctl -u</code>.</p>
        </div>
      )}

      {/* dokploy */}
      {currentType === "dokploy" && (
        <div className="space-y-1.5">
          <Label>Dokploy Application ID</Label>
          <Input
            placeholder="app_xxxxxxxxxx"
            value={value?.application_id ?? ""}
            onChange={(e) => setField("application_id", e.target.value)}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Resolves the running container name via Dokploy API, then polls container logs every 2s.
            Server must be a Dokploy server (auth type: Dokploy API).
          </p>
        </div>
      )}
    </div>
  )
}
