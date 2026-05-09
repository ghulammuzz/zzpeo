"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeploymentTypeSelector } from "@/components/services/DeploymentTypeSelector";
import { LogSourceEditor } from "@/components/services/LogSourceEditor";
import { Plus, Trash2, KeyRound, FileText, Eye, EyeOff, ChevronDown, ChevronUp } from "lucide-react";
import type { DeployType, EnvVarDeployMode, LogConfig } from "@/lib/types";

interface EnvVarRow {
  key: string;
  value: string;
  deployMode: EnvVarDeployMode;
}

interface PageProps {
  params: { projectId: string; envId: string; serverId: string };
}

function parseEnvText(text: string): Array<{ key: string; value: string }> {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .flatMap((l) => {
      const eq = l.indexOf("=");
      if (eq === -1) return [];
      const key = l.slice(0, eq).trim();
      const value = l.slice(eq + 1).trim();
      return key ? [{ key, value }] : [];
    });
}

export default function ServiceNewPage({ params }: PageProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [workdir, setWorkdir] = useState("");
  const [runAsUser, setRunAsUser] = useState("");
  const [localPort, setLocalPort] = useState("");
  const [domain, setDomain] = useState("");
  const [logConfig, setLogConfig] = useState<LogConfig | undefined>(undefined);
  const [deployType, setDeployType] = useState<DeployType>("php");
  const [deployConfig, setDeployConfig] = useState<unknown>({
    git_branch: "main",
    post_pull_cmds: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isDokploy, setIsDokploy] = useState(false)
  useEffect(() => {
    api.servers.get(params.envId, params.serverId)
      .then((srv) => { if ((srv as { auth_type: string }).auth_type === "dokploy") setIsDokploy(true) })
      .catch(() => {})
  }, [params.envId, params.serverId])

  // Env vars
  const [envVarRows, setEnvVarRows] = useState<EnvVarRow[]>([]);
  const [envVarsExpanded, setEnvVarsExpanded] = useState(true);
  const [shownRows, setShownRows] = useState<Set<number>>(new Set());
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<Array<{ key: string; value: string }>>([]);

  const basePath = `/projects/${params.projectId}/environments/${params.envId}/servers/${params.serverId}`;

  const handleDeployChange = (type: DeployType, config: unknown) => {
    setDeployType(type);
    setDeployConfig(config);
  };

  const addEnvVarRow = () => {
    setEnvVarRows((prev) => [...prev, { key: "", value: "", deployMode: "all" }]);
    setEnvVarsExpanded(true);
  };

  const removeEnvVarRow = (index: number) => {
    setEnvVarRows((prev) => prev.filter((_, i) => i !== index));
    setShownRows((prev) => {
      const next = new Set<number>();
      for (const n of Array.from(prev)) {
        if (n < index) next.add(n);
        else if (n > index) next.add(n - 1);
      }
      return next;
    });
  };

  const updateEnvVarRow = (index: number, patch: Partial<EnvVarRow>) => {
    setEnvVarRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const toggleShowRow = (index: number) => {
    setShownRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleImportTextChange = (text: string) => {
    setImportText(text);
    setImportPreview(parseEnvText(text));
  };

  const handleImportConfirm = () => {
    if (!importPreview.length) return;
    setEnvVarRows((prev) => {
      const merged = [...prev];
      for (const { key, value } of importPreview) {
        const idx = merged.findIndex((r) => r.key === key);
        if (idx !== -1) {
          merged[idx] = { ...merged[idx], value };
        } else {
          merged.push({ key, value, deployMode: "all" });
        }
      }
      return merged;
    });
    setShowImport(false);
    setImportText("");
    setImportPreview([]);
    setEnvVarsExpanded(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const service = await api.services.create(params.serverId, {
        name,
        workdir,
        run_as_user: runAsUser || undefined,
        local_port: localPort ? parseInt(localPort) : undefined,
        domain: domain || undefined,
        log_config: logConfig ?? null,
        deploy_type: deployType,
        deploy_config: deployConfig,
      });

      const validEnvVars = envVarRows.filter((r) => r.key.trim() !== "");
      if (validEnvVars.length > 0) {
        await api.serviceEnvVars.upsert(
          service.id,
          validEnvVars.map((r) => ({ key: r.key, value: r.value, deploy_mode: r.deployMode }))
        );
      }

      router.push(`${basePath}/services/${service.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create service");
    } finally {
      setLoading(false);
    }
  };

  const showEnvVarsSection = deployType !== "shell";

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">New Service</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Add a deployable service to this server
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Service Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Service Name</Label>
              <Input
                id="name"
                placeholder="frontend-app"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            {!isDokploy && (
              <div className="space-y-2">
                <Label htmlFor="workdir">Working Directory</Label>
                <Input
                  id="workdir"
                  placeholder="/var/www/app"
                  value={workdir}
                  onChange={(e) => setWorkdir(e.target.value)}
                  required
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Absolute path on the server where the service lives.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="run_as_user">
                Run As User{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="run_as_user"
                placeholder="shortie"
                value={runAsUser}
                onChange={(e) => setRunAsUser(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                If set, all deploy commands run as this Linux user via{" "}
                <code className="bg-muted px-1 rounded">su - &lt;user&gt;</code>. Leave empty to run as the SSH login user.
              </p>
            </div>

            {!isDokploy && (
              <div className="space-y-2">
                <Label htmlFor="local_port">
                  Local Port{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="local_port"
                  placeholder="3000"
                  type="number"
                  value={localPort}
                  onChange={(e) => setLocalPort(e.target.value)}
                  className="font-mono w-32"
                />
                <p className="text-xs text-muted-foreground">
                  Port this service listens on locally. Used to link nginx proxy_pass to this service in the traffic flow diagram.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="domain">
                Domain{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="domain"
                placeholder="app.example.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Domain or subdomain associated with this service.
              </p>
            </div>

            <div className="space-y-2">
              <Label>
                Log Source{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <LogSourceEditor value={logConfig} onChange={setLogConfig} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deployment Configuration</CardTitle>
            <CardDescription>Choose how this service is deployed.</CardDescription>
          </CardHeader>
          <CardContent>
            <DeploymentTypeSelector
              value={{ type: deployType, config: deployConfig }}
              onChange={handleDeployChange}
            />
          </CardContent>
        </Card>

        {showEnvVarsSection && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  Environment Variables
                </CardTitle>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowImport(true)}>
                    <FileText className="h-3.5 w-3.5 mr-1" />
                    Import
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={addEnvVarRow}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
              {deployType === "docker" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Per-variable: choose <strong>build arg</strong>, <strong>runtime</strong>, or <strong>both</strong>.
                </p>
              )}
              {(deployType === "php" || deployType === "pm2") && (
                <p className="text-xs text-muted-foreground mt-1">
                  Written to <code className="bg-muted px-1 rounded">.env</code> on deploy when env source is inline.
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Collapse toggle */}
              <div
                className="flex items-center justify-between rounded-md border px-4 py-2 cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => setEnvVarsExpanded((v) => !v)}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  {envVarRows.length === 0 ? (
                    <span className="text-sm text-muted-foreground">No variables</span>
                  ) : envVarsExpanded ? (
                    <span className="text-sm text-muted-foreground">{envVarRows.length} variable{envVarRows.length !== 1 ? "s" : ""}</span>
                  ) : (
                    envVarRows.map((r) => r.key && (
                      <Badge key={r.key} variant="secondary" className="font-mono text-xs">
                        {r.key}
                      </Badge>
                    ))
                  )}
                </div>
                <Button type="button" variant="ghost" size="sm" tabIndex={-1} onClick={(e) => { e.stopPropagation(); setEnvVarsExpanded((v) => !v); }}>
                  {envVarsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>

              {envVarsExpanded && envVarRows.length > 0 && (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[33%]">Key</TableHead>
                        <TableHead className="w-[38%]">Value</TableHead>
                        {deployType === "docker" && <TableHead className="w-[18%]">Mode</TableHead>}
                        <TableHead className="w-[11%]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {envVarRows.map((row, i) => {
                        const shown = shownRows.has(i);
                        return (
                          <TableRow key={i}>
                            <TableCell>
                              <Input
                                value={row.key}
                                onChange={(e) => updateEnvVarRow(i, { key: e.target.value })}
                                placeholder="KEY_NAME"
                                className="font-mono h-8"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type={shown ? "text" : "password"}
                                value={row.value}
                                onChange={(e) => updateEnvVarRow(i, { value: e.target.value })}
                                placeholder="value"
                                className="font-mono h-8"
                              />
                            </TableCell>
                            {deployType === "docker" && (
                              <TableCell>
                                <Select
                                  value={row.deployMode}
                                  onValueChange={(v) => updateEnvVarRow(i, { deployMode: v as EnvVarDeployMode })}
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
                                  type="button"
                                  variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                  onClick={() => toggleShowRow(i)}
                                >
                                  {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => removeEnvVarRow(i)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create Service"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(basePath)}
          >
            Cancel
          </Button>
        </div>
      </form>

      {/* Import dialog */}
      <Dialog open={showImport} onOpenChange={(open) => { setShowImport(open); if (!open) { setImportText(""); setImportPreview([]); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Import from text</DialogTitle></DialogHeader>
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
            <Button type="button" variant="outline" onClick={() => setShowImport(false)}>Cancel</Button>
            <Button type="button" onClick={handleImportConfirm} disabled={importPreview.length === 0}>
              Add {importPreview.length > 0 ? importPreview.length : ""} variable{importPreview.length !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
