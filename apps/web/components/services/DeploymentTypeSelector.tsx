"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Plus, Trash2 } from "lucide-react"
import type {
  DeployType,
  PHPDeployConfig,
  PM2DeployConfig,
  ShellDeployConfig,
  DockerDeployConfig,
  DokployDeployConfig,
} from "@/lib/types"

interface DeploymentTypeSelectorProps {
  value: { type: DeployType; config: unknown }
  onChange: (type: DeployType, config: unknown) => void
}

function StringListEditor({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string
  values: string[]
  onChange: (vals: string[]) => void
  placeholder?: string
}) {
  const add = () => onChange([...values, ""])
  const remove = (i: number) => onChange(values.filter((_, idx) => idx !== i))
  const update = (i: number, val: string) =>
    onChange(values.map((v, idx) => (idx === i ? val : v)))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button type="button" variant="ghost" size="sm" onClick={add}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add
        </Button>
      </div>
      <div className="space-y-2">
        {values.map((v, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={v}
              onChange={(e) => update(i, e.target.value)}
              placeholder={placeholder}
              className="font-mono text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-destructive hover:text-destructive"
              onClick={() => remove(i)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {values.length === 0 && (
          <p className="text-xs text-muted-foreground italic">None. Click Add to insert.</p>
        )}
      </div>
    </div>
  )
}

export function DeploymentTypeSelector({ value, onChange }: DeploymentTypeSelectorProps) {
  const [phpConfig, setPhpConfig] = useState<PHPDeployConfig>({
    git_branch: "main",
    post_pull_cmds: [],
    env_mode: "inline",
    env_file_path: "",
    ...(value.type === "php" ? (value.config as PHPDeployConfig) : {}),
  })

  const [pm2Config, setPm2Config] = useState<PM2DeployConfig>({
    git_branch: "main",
    npm_install: true,
    build_cmd: "",
    pm2_app_name: "",
    env_mode: "inline",
    env_file_path: "",
    ...(value.type === "pm2" ? (value.config as PM2DeployConfig) : {}),
  })

  const [shellConfig, setShellConfig] = useState<ShellDeployConfig>({
    script_path: "",
    args: [],
    ...(value.type === "shell" ? (value.config as ShellDeployConfig) : {}),
  })

  const [dockerConfig, setDockerConfig] = useState<DockerDeployConfig>({
    build_args: [],
    container_name: "",
    run_args: [],
    compose_file: "",
    dockerfile: "",
    ...(value.type === "docker" ? (value.config as DockerDeployConfig) : {}),
  })

  const [dokployConfig, setDokployConfig] = useState<DokployDeployConfig>({
    application_id: "",
    ...(value.type === "dokploy" ? (value.config as DokployDeployConfig) : {}),
  })

  const [dockerMode, setDockerMode] = useState<"direct" | "compose">(
    (value.config as DockerDeployConfig)?.compose_file ? "compose" : "direct"
  )

  const handleTabChange = (tab: string) => {
    const t = tab as DeployType
    const config =
      t === "php"     ? phpConfig
      : t === "pm2"   ? pm2Config
      : t === "shell" ? shellConfig
      : t === "dokploy" ? dokployConfig
      : dockerConfig
    onChange(t, config)
  }

  const updatePhp = (updates: Partial<PHPDeployConfig>) => {
    const cfg = { ...phpConfig, ...updates }
    setPhpConfig(cfg)
    if (value.type === "php") onChange("php", cfg)
  }

  const updatePm2 = (updates: Partial<PM2DeployConfig>) => {
    const cfg = { ...pm2Config, ...updates }
    setPm2Config(cfg)
    if (value.type === "pm2") onChange("pm2", cfg)
  }

  const updateShell = (updates: Partial<ShellDeployConfig>) => {
    const cfg = { ...shellConfig, ...updates }
    setShellConfig(cfg)
    if (value.type === "shell") onChange("shell", cfg)
  }

  const updateDocker = (updates: Partial<DockerDeployConfig>) => {
    const cfg = { ...dockerConfig, ...updates }
    setDockerConfig(cfg)
    if (value.type === "docker") onChange("docker", cfg)
  }

  const updateDokploy = (updates: Partial<DokployDeployConfig>) => {
    const cfg = { ...dokployConfig, ...updates }
    setDokployConfig(cfg)
    if (value.type === "dokploy") onChange("dokploy", cfg)
  }

  return (
    <Tabs defaultValue={value.type} onValueChange={handleTabChange}>
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="php">PHP</TabsTrigger>
        <TabsTrigger value="pm2">PM2</TabsTrigger>
        <TabsTrigger value="shell">Shell</TabsTrigger>
        <TabsTrigger value="docker">Docker</TabsTrigger>
        <TabsTrigger value="dokploy">Dokploy</TabsTrigger>
      </TabsList>

      {/* PHP */}
      <TabsContent value="php" className="space-y-4 pt-4">
        <div className="space-y-2">
          <Label>Git Branch</Label>
          <Input
            value={phpConfig.git_branch}
            onChange={(e) => updatePhp({ git_branch: e.target.value })}
            placeholder="main"
            className="font-mono"
          />
        </div>
        <StringListEditor
          label="Post-Pull Commands"
          values={phpConfig.post_pull_cmds}
          onChange={(vals) => updatePhp({ post_pull_cmds: vals })}
          placeholder="composer install --no-dev"
        />
        <div className="space-y-2">
          <Label>Env Source</Label>
          <div className="flex items-center gap-2 rounded-md border p-2 w-fit">
            <button
              type="button"
              onClick={() => updatePhp({ env_mode: "inline" })}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${phpConfig.env_mode === "inline" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Inline (from here)
            </button>
            <button
              type="button"
              onClick={() => updatePhp({ env_mode: "file" })}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${phpConfig.env_mode === "file" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              File on server
            </button>
          </div>
          {phpConfig.env_mode === "file" && (
            <Input
              value={phpConfig.env_file_path ?? ""}
              onChange={(e) => updatePhp({ env_file_path: e.target.value })}
              placeholder="/var/www/app/.env"
              className="font-mono"
            />
          )}
        </div>
      </TabsContent>

      {/* PM2 */}
      <TabsContent value="pm2" className="space-y-4 pt-4">
        <div className="space-y-2">
          <Label>Git Branch</Label>
          <Input
            value={pm2Config.git_branch}
            onChange={(e) => updatePm2({ git_branch: e.target.value })}
            placeholder="main"
            className="font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label>PM2 App Name</Label>
          <Input
            value={pm2Config.pm2_app_name}
            onChange={(e) => updatePm2({ pm2_app_name: e.target.value })}
            placeholder="my-app"
            className="font-mono"
          />
        </div>
        <div className="flex items-center gap-3">
          <Switch
            id="npm_install"
            checked={pm2Config.npm_install}
            onCheckedChange={(checked) => updatePm2({ npm_install: checked })}
          />
          <Label htmlFor="npm_install">Run npm install</Label>
        </div>
        <div className="space-y-2">
          <Label>Build Command (optional)</Label>
          <Input
            value={pm2Config.build_cmd}
            onChange={(e) => updatePm2({ build_cmd: e.target.value })}
            placeholder="npm run build"
            className="font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label>Env Source</Label>
          <div className="flex items-center gap-2 rounded-md border p-2 w-fit">
            <button
              type="button"
              onClick={() => updatePm2({ env_mode: "inline" })}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${pm2Config.env_mode === "inline" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Inline (from here)
            </button>
            <button
              type="button"
              onClick={() => updatePm2({ env_mode: "file" })}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${pm2Config.env_mode === "file" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              File on server
            </button>
          </div>
          {pm2Config.env_mode === "file" && (
            <Input
              value={pm2Config.env_file_path ?? ""}
              onChange={(e) => updatePm2({ env_file_path: e.target.value })}
              placeholder="/var/www/app/.env"
              className="font-mono"
            />
          )}
        </div>
      </TabsContent>

      {/* Shell */}
      <TabsContent value="shell" className="space-y-4 pt-4">
        <div className="space-y-2">
          <Label>Script Path</Label>
          <Input
            value={shellConfig.script_path}
            onChange={(e) => updateShell({ script_path: e.target.value })}
            placeholder="/opt/deploy/deploy.sh"
            className="font-mono"
          />
        </div>
        <StringListEditor
          label="Arguments"
          values={shellConfig.args}
          onChange={(vals) => updateShell({ args: vals })}
          placeholder="--env production"
        />
      </TabsContent>

      {/* Docker */}
      <TabsContent value="docker" className="space-y-4 pt-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2 rounded-md border p-2">
            <button
              type="button"
              onClick={() => setDockerMode("direct")}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                dockerMode === "direct"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Direct Build
            </button>
            <button
              type="button"
              onClick={() => setDockerMode("compose")}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                dockerMode === "compose"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Compose
            </button>
          </div>
        </div>

        {dockerMode === "compose" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Compose File Path</Label>
              <Input
                value={dockerConfig.compose_file}
                onChange={(e) => updateDocker({ compose_file: e.target.value })}
                placeholder="./docker-compose.yml"
                className="font-mono"
              />
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label>Dockerfile <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                value={dockerConfig.dockerfile ?? ""}
                onChange={(e) => updateDocker({ dockerfile: e.target.value })}
                placeholder="./Dockerfile"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">Leave empty to use default Dockerfile in working directory.</p>
            </div>
            <div className="space-y-2">
              <Label>Container Name</Label>
              <Input
                value={dockerConfig.container_name}
                onChange={(e) => updateDocker({ container_name: e.target.value })}
                placeholder="my-container"
                className="font-mono"
              />
            </div>
            <StringListEditor
              label="Build Args"
              values={dockerConfig.build_args}
              onChange={(vals) => updateDocker({ build_args: vals })}
              placeholder="NODE_ENV=production"
            />
            <StringListEditor
              label="Run Args"
              values={dockerConfig.run_args}
              onChange={(vals) => updateDocker({ run_args: vals })}
              placeholder="-p 3000:3000"
            />
          </>
        )}
      </TabsContent>

      {/* Dokploy */}
      <TabsContent value="dokploy" className="space-y-4 pt-4">
        <div className="rounded-sm border border-neon-cyan/20 bg-neon-cyan/5 px-3 py-2.5 text-xs font-mono text-neon-cyan/70">
          // Deploys via Dokploy REST API. Server host/port = Dokploy instance URL.
          Server password field = Dokploy API token (encrypted at rest).
        </div>
        <div className="space-y-2">
          <Label>Dokploy Application ID</Label>
          <Input
            value={dokployConfig.application_id}
            onChange={(e) => updateDokploy({ application_id: e.target.value })}
            placeholder="app_xxxxxxxxxx"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Found in Dokploy dashboard → Application → Settings → Application ID.
          </p>
        </div>
      </TabsContent>
    </Tabs>
  )
}
