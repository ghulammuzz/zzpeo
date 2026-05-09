"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import { Server, Zap, Shield } from "lucide-react";

interface ServerFormProps {
  envId: string;
  projectId: string;
  redirectBasePath: string;
}

export function ServerForm({
  envId,
  projectId,
  redirectBasePath,
}: ServerFormProps) {
  const router = useRouter();

  const [form, setForm] = useState({
    name: "",
    host: "",
    port: "22",
    user: "",
    auth_type: "key" as "key" | "password" | "dokploy",
    ssh_key: "",
    passphrase: "",
    password: "",
  });
  const [keyNeedsPassphrase, setKeyNeedsPassphrase] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    fingerprint: string;
    latency_ms: number;
  } | null>(null);
  const [showModal, setShowModal] = useState(false);
  // Created server ID for test connection
  const [createdServerId, setCreatedServerId] = useState<string | null>(null);

  const setField = (key: string, value: string | boolean) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  // Detect whether a PEM/OpenSSH private key requires a passphrase.
  const detectKeyEncryption = (pem: string) => {
    if (!pem.trim()) {
      setKeyNeedsPassphrase(false);
      return;
    }
    // Legacy PEM (RSA/DSA/EC): header contains ENCRYPTED
    if (/ENCRYPTED/i.test(pem)) {
      setKeyNeedsPassphrase(true);
      return;
    }
    // OpenSSH format: decode and check cipher field
    if (pem.includes("-----BEGIN OPENSSH PRIVATE KEY-----")) {
      try {
        const b64 = pem
          .replace("-----BEGIN OPENSSH PRIVATE KEY-----", "")
          .replace("-----END OPENSSH PRIVATE KEY-----", "")
          .replace(/\s/g, "");
        const binary = atob(b64);
        // Magic bytes: "openssh-key-v1\0" = 15 bytes
        // Followed by: ciphername as SSH string (4-byte len + data)
        const offset = 15;
        const cipherLen =
          (binary.charCodeAt(offset) << 24) |
          (binary.charCodeAt(offset + 1) << 16) |
          (binary.charCodeAt(offset + 2) << 8) |
          binary.charCodeAt(offset + 3);
        const cipher = binary.slice(offset + 4, offset + 4 + cipherLen);
        setKeyNeedsPassphrase(cipher !== "none");
        return;
      } catch {
        // Can't decode — don't force passphrase field
      }
    }
    setKeyNeedsPassphrase(false);
  };

  const handleTestConnection = async (serverId: string) => {
    setTesting(true);
    try {
      const result = await api.servers.testConnection(envId, serverId);
      setTestResult(result);
      setShowModal(true);
    } catch (err) {
      toast({
        title: "Connection failed",
        description: err instanceof Error ? err.message : "Could not connect",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmitAndTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const server = await api.servers.create(envId, {
        name: form.name,
        host: form.host,
        port: parseInt(form.port),
        user: form.auth_type === "dokploy" ? "dokploy" : form.user,
        auth_type: form.auth_type,
        ssh_key: form.auth_type === "key" ? form.ssh_key : undefined,
        passphrase:
          form.auth_type === "key" && form.passphrase
            ? form.passphrase
            : undefined,
        password: (form.auth_type === "password" || form.auth_type === "dokploy")
          ? form.password
          : undefined,
      });
      setCreatedServerId(server.id);
      // Dokploy servers skip SSH fingerprint test — just redirect.
      if (form.auth_type === "dokploy") {
        toast({ title: "Dokploy server saved", description: "API token stored encrypted." });
        router.push(`${redirectBasePath}/servers/${server.id}`);
        return;
      }
      await handleTestConnection(server.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create server");
    } finally {
      setLoading(false);
    }
  };

  const handleTrustAndSave = async () => {
    if (!createdServerId || !testResult) return;
    try {
      // Confirm fingerprint via second call with confirm flag
      await api.servers.testConnection(envId, createdServerId, {
        confirm: true,
      });
      toast({
        title: "Server saved",
        description: "Fingerprint trusted and server saved.",
      });
      setShowModal(false);
      router.push(`${redirectBasePath}/servers/${createdServerId}`);
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to confirm",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <form onSubmit={handleSubmitAndTest} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Server Name</Label>
          <Input
            id="name"
            placeholder="web-01"
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-2">
            <Label htmlFor="host">Host</Label>
            <Input
              id="host"
              placeholder="192.168.1.1 or server.example.com"
              value={form.host}
              onChange={(e) => setField("host", e.target.value)}
              required
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="port">Port</Label>
            <Input
              id="port"
              placeholder="22"
              type="number"
              value={form.port}
              onChange={(e) => setField("port", e.target.value)}
              required
              className="font-mono"
            />
          </div>
        </div>

        {form.auth_type !== "dokploy" && (
          <div className="space-y-2">
            <Label htmlFor="user">SSH User</Label>
            <Input
              id="user"
              placeholder="ubuntu"
              value={form.user}
              onChange={(e) => setField("user", e.target.value)}
              required
              className="font-mono"
            />
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <Label>Auth Type</Label>
          <div className="flex items-center gap-2 rounded-md border p-2 flex-wrap">
            <button
              type="button"
              onClick={() => { setField("auth_type", "key"); setField("port", "22"); }}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                form.auth_type === "key"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              SSH Key
            </button>
            <button
              type="button"
              onClick={() => { setField("auth_type", "password"); setField("port", "22"); }}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                form.auth_type === "password"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => { setField("auth_type", "dokploy"); setField("port", "3000"); }}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                form.auth_type === "dokploy"
                  ? "bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/40"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Dokploy API
            </button>
          </div>
        </div>

        {form.auth_type === "dokploy" && (
          <div className="space-y-3 rounded-sm border border-neon-cyan/20 bg-neon-cyan/5 p-3">
            <p className="text-xs font-mono text-neon-cyan/70">
              // Host = Dokploy instance URL · Port = 3000 (default) · API token stored encrypted
            </p>
            <div className="space-y-2">
              <Label htmlFor="api_token">Dokploy API Token</Label>
              <Input
                id="api_token"
                type="password"
                placeholder="••••••••••••••••"
                value={form.password}
                onChange={(e) => setField("password", e.target.value)}
                required
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Settings → Profile → API/CLI section in your Dokploy instance.
              </p>
            </div>
          </div>
        )}

        {form.auth_type !== "dokploy" && form.auth_type === "key" ? (
          <div className="space-y-2">
            <Label htmlFor="private_key">PEM Private Key</Label>
            <Textarea
              id="private_key"
              placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;..."
              value={form.ssh_key}
              onChange={(e) => {
                setField("ssh_key", e.target.value);
                detectKeyEncryption(e.target.value);
              }}
              rows={6}
              className="font-mono text-xs"
              required
            />
            {keyNeedsPassphrase && (
              <div className="mt-3 space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <div className="flex items-center gap-2">
                  <svg
                    className="h-4 w-4 text-amber-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                  <Label
                    htmlFor="passphrase"
                    className="text-amber-700 dark:text-amber-400"
                  >
                    Key Passphrase
                  </Label>
                  <span className="text-xs text-amber-600 dark:text-amber-500">
                    (key is passphrase-protected)
                  </span>
                </div>
                <Input
                  id="passphrase"
                  type="password"
                  placeholder="Enter passphrase..."
                  value={form.passphrase}
                  onChange={(e) => setField("passphrase", e.target.value)}
                  className="font-mono"
                  required
                />
              </div>
            )}
          </div>
        ) : form.auth_type === "password" ? (
          <div className="space-y-2">
            <Label htmlFor="password">SSH Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setField("password", e.target.value)}
              required
            />
          </div>
        ) : null}

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={loading || testing}>
            <Zap className="h-4 w-4 mr-2" />
            {loading || testing
              ? "Saving..."
              : form.auth_type === "dokploy"
                ? "Save Dokploy Server"
                : "Create & Test Connection"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(redirectBasePath)}
          >
            Cancel
          </Button>
        </div>
      </form>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-600 dark:text-green-400" />
              Connection Successful
            </DialogTitle>
            <DialogDescription>
              Review the server fingerprint before trusting this connection.
            </DialogDescription>
          </DialogHeader>

          {testResult && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted p-4 space-y-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    SSH Fingerprint
                  </p>
                  <p className="font-mono text-sm mt-1 break-all">
                    {testResult.fingerprint}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Latency
                  </p>
                  <p className="font-mono text-sm mt-1">
                    {testResult.latency_ms}ms
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Verify this fingerprint matches the server&apos;s known key.
                Click &ldquo;Trust &amp; Save&rdquo; to confirm.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleTrustAndSave}>
              <Shield className="h-4 w-4 mr-2" />
              Trust &amp; Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
