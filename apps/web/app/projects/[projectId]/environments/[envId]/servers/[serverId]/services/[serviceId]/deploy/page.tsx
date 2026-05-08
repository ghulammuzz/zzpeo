"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeployLog } from "@/components/deploy/DeployLog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/use-toast";
import { Rocket, RefreshCw, Clock, AlertTriangle, X, ChevronLeft, ChevronRight, StopCircle } from "lucide-react";
import type { Deployment, DeployStatus } from "@/lib/types";

interface PageProps {
  params: {
    projectId: string;
    envId: string;
    serverId: string;
    serviceId: string;
  };
}

const STATUS_VARIANTS: Record<
  DeployStatus,
  "default" | "secondary" | "destructive" | "outline" | "success" | "warning"
> = {
  pending: "outline",
  running: "secondary",
  success: "success",
  failed: "destructive",
  cancelled: "warning",
};

function formatDuration(started?: string, finished?: string): string {
  if (!started || !finished) return "—";
  const ms = new Date(finished).getTime() - new Date(started).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${Math.round(ms / 1000)}s`;
}

export default function DeployPage({ params }: PageProps) {
  const [deploying, setDeploying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmDeploy, setConfirmDeploy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [activeDeploymentId, setActiveDeploymentId] = useState<string | null>(
    null,
  );
  const [activeStatus, setActiveStatus] = useState<DeployStatus | undefined>(
    undefined,
  );
  const [pageError, setPageError] = useState<{
    message: string;
    lines: string[];
  } | null>(null);
  const [history, setHistory] = useState<Deployment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PAGE_SIZE = 10;

  const loadHistory = useCallback(async () => {
    try {
      const deployments = await api.deployments.list(params.serviceId);
      setHistory(deployments);
      setHistoryPage(1);
      // Auto-connect to a running deployment when navigating back to this page.
      // activeDeploymentId check prevents overwriting a deployment the user just triggered.
      setActiveDeploymentId((current) => {
        if (current) return current;
        const running = deployments.find(
          (d) => d.status === "running" || d.status === "pending",
        );
        if (running) {
          setActiveStatus(running.status);
          return running.id;
        }
        return current;
      });
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }, [params.serviceId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleDeployFinish = useCallback(
    (status: DeployStatus, errLines: string[]) => {
      setActiveStatus(status);
      if (status === "failed") {
        setPageError({
          message:
            errLines.length > 0
              ? errLines[errLines.length - 1] // most relevant = last error
              : "Deployment failed — check the log for details.",
          lines: errLines,
        });
      }
      // Refresh history so the new row appears with correct status
      setTimeout(loadHistory, 500);
    },
    [loadHistory],
  );

  const handleDeploy = async () => {
    setDeploying(true);
    setPageError(null);
    try {
      const result = await api.deployments.trigger(params.serviceId);
      setActiveDeploymentId(result.deployment_id);
      setActiveStatus("running");
      toast({
        title: "Deployment triggered",
        description: `Deployment ${result.deployment_id.slice(0, 8)}... started.`,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to trigger deployment";
      setPageError({ message: msg, lines: [] });
      toast({
        title: "Deploy failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setDeploying(false);
    }
  };

  const handleCancel = async () => {
    if (!activeDeploymentId) return;
    setCancelling(true);
    try {
      await api.deployments.cancel(activeDeploymentId);
      toast({ title: "Cancel requested", description: "Deployment is being stopped." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to cancel";
      toast({ title: "Cancel failed", description: msg, variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  const viewDeployment = (d: Deployment) => {
    setActiveDeploymentId(d.id);
    setActiveStatus(d.status);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Deploy</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Trigger a deployment and watch live logs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeStatus === "running" && activeDeploymentId && (
            <Button
              variant="destructive"
              size="lg"
              onClick={() => setConfirmCancel(true)}
              disabled={cancelling}
            >
              <StopCircle className="h-4 w-4 mr-2" />
              {cancelling ? "Cancelling..." : "Cancel Deploy"}
            </Button>
          )}
          <Button
            onClick={() => setConfirmDeploy(true)}
            disabled={deploying || activeStatus === "running"}
            size="lg"
          >
            <Rocket className="h-4 w-4 mr-2" />
            {deploying
              ? "Triggering..."
              : activeStatus === "running"
                ? "Deploying..."
                : "Deploy Now"}
          </Button>
        </div>
      </div>

      {/* Page-level error banner */}
      {pageError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1 min-w-0">
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                  Deployment failed
                </p>
                <p className="text-sm text-red-600 dark:text-red-300 font-mono break-all">
                  {pageError.message}
                </p>
              </div>
            </div>
            <button
              onClick={() => setPageError(null)}
              className="text-red-400 hover:text-red-600 flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Live log */}
      {activeDeploymentId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Deployment Log
              <span className="font-mono text-xs text-muted-foreground">
                {activeDeploymentId.slice(0, 8)}...
              </span>
              {activeStatus && (
                <Badge
                  variant={STATUS_VARIANTS[activeStatus]}
                  className="ml-auto"
                >
                  {activeStatus}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DeployLog
              key={activeDeploymentId}
              deploymentId={activeDeploymentId}
              initialStatus={activeStatus}
              onFinish={handleDeployFinish}
            />
          </CardContent>
        </Card>
      )}

      {!activeDeploymentId && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Rocket className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-semibold">Ready to deploy</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Click &ldquo;Deploy Now&rdquo; to start a new deployment. Live logs
            will appear here.
          </p>
        </div>
      )}

      {/* Deployment history */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Deployment History
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={loadHistory}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {historyLoading ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              Loading history...
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No deployments yet.
            </div>
          ) : (() => {
            const totalPages = Math.ceil(history.length / HISTORY_PAGE_SIZE);
            const page = Math.min(historyPage, totalPages);
            const pageItems = history.slice((page - 1) * HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE);
            return (
              <>
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Triggered By</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageItems.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs">
                          {d.id.slice(0, 8)}...
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANTS[d.status]}>
                            {d.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {d.started_at
                            ? new Date(d.started_at).toLocaleString()
                            : "—"}
                        </TableCell>
                        <TableCell className="text-sm font-mono">
                          {formatDuration(d.started_at, d.finished_at)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {d.triggered_by ?? "manual"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => viewDeployment(d)}
                          >
                            View Logs
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                    <span>
                      {(page - 1) * HISTORY_PAGE_SIZE + 1}–{Math.min(page * HISTORY_PAGE_SIZE, history.length)} of {history.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        disabled={page <= 1}
                        onClick={() => setHistoryPage((p) => p - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="px-2 font-medium">{page} / {totalPages}</span>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        disabled={page >= totalPages}
                        onClick={() => setHistoryPage((p) => p + 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDeploy}
        onOpenChange={setConfirmDeploy}
        title="// CONFIRM DEPLOY"
        description="This will trigger a new deployment and execute all deploy steps on the remote server. Proceed?"
        confirmText="Deploy Now"
        variant="warning"
        loading={deploying}
        loadingText="Triggering..."
        onConfirm={() => { setConfirmDeploy(false); handleDeploy(); }}
      />

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="// CANCEL DEPLOYMENT"
        description="This will send SIGTERM to the running deploy process on the server. The deployment will be marked as cancelled."
        confirmText="Cancel Deploy"
        variant="destructive"
        loading={cancelling}
        loadingText="Cancelling..."
        onConfirm={() => { setConfirmCancel(false); handleCancel(); }}
      />
    </div>
  );
}
