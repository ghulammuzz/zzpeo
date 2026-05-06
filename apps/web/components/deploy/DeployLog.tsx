"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Copy,
  Check,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Terminal,
} from "lucide-react";
import type { DeployStatus } from "@/lib/types";

interface DeployLogProps {
  deploymentId: string;
  initialStatus?: DeployStatus;
  onFinish?: (status: DeployStatus, errorLines: string[]) => void;
}

const MAX_LINES = 5000;

const ANSI_RE = /[][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g;
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

function isErrorLine(line: string): boolean {
  return (
    /^error:/i.test(line) ||
    /^fatal:/i.test(line) ||
    /exited with status [^0]/i.test(line) ||
    /command failed/i.test(line) ||
    /permission denied/i.test(line) ||
    /no such file or directory/i.test(line) ||
    /connection refused/i.test(line) ||
    /authentication failed/i.test(line)
  );
}

// ---------------------------------------------------------------------------
// Build log terminal
// ---------------------------------------------------------------------------

function BuildTerminal({
  lines,
  status,
}: {
  lines: string[];
  status: DeployStatus;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusColor = {
    pending: "text-zinc-400",
    running: "text-blue-400",
    success: "text-green-400",
    failed: "text-red-400",
  }[status];

  const statusLabel = {
    pending: "Pending",
    running: "Running...",
    success: "Succeeded",
    failed: "Failed",
  }[status];

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between bg-zinc-900 px-4 py-2">
        <div className={`flex items-center gap-2 text-sm font-medium ${statusColor}`}>
          {status === "running" || status === "pending" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : status === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          {statusLabel}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-zinc-400 hover:text-zinc-100 h-7 px-2"
          onClick={handleCopy}
          disabled={lines.length === 0}
        >
          {copied ? (
            <><Check className="h-3.5 w-3.5 mr-1" />Copied</>
          ) : (
            <><Copy className="h-3.5 w-3.5 mr-1" />Copy log</>
          )}
        </Button>
      </div>
      <div className="bg-zinc-950 text-zinc-100 font-mono text-xs p-4 h-96 overflow-y-auto">
        {lines.length === 0 && status === "pending" && (
          <span className="text-zinc-500">Waiting for deployment to start...</span>
        )}
        {lines.length === 0 && status === "running" && (
          <span className="text-zinc-500">Connecting to log stream...</span>
        )}
        {lines.map((line, i) => (
          <div
            key={i}
            className={`leading-5 whitespace-pre-wrap break-all ${
              isErrorLine(line)
                ? "text-red-400 font-semibold"
                : line.startsWith("+ ") || line.startsWith("$ ")
                  ? "text-yellow-300"
                  : line.startsWith("#") || /^\[\d+\/\d+\]/.test(line)
                    ? "text-zinc-400"
                    : "text-green-300"
            }`}
          >
            {line}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Container logs panel
// ---------------------------------------------------------------------------

function ContainerLogsPanel({
  lines,
  isRunning,
}: {
  lines: string[];
  isRunning: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, expanded]);

  if (lines.length === 0 && !isRunning) return null;

  return (
    <div className="rounded-lg border overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 bg-zinc-800 px-4 py-2 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
          <Terminal className="h-4 w-4 text-zinc-400" />
          Container Logs
          {isRunning && lines.length === 0 && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
          )}
          {lines.length > 0 && (
            <span className="text-xs text-zinc-500">{lines.length} lines</span>
          )}
        </div>
        {expanded
          ? <ChevronUp className="h-4 w-4 text-zinc-400 flex-shrink-0" />
          : <ChevronDown className="h-4 w-4 text-zinc-400 flex-shrink-0" />
        }
      </button>

      {expanded && (
        <div className="bg-zinc-950 text-zinc-100 font-mono text-xs p-4 max-h-72 overflow-y-auto">
          {lines.length === 0 ? (
            <span className="text-zinc-500">Waiting for container output...</span>
          ) : (
            lines.map((line, i) => (
              <div
                key={i}
                className={`leading-5 whitespace-pre-wrap break-all ${
                  isErrorLine(line) ? "text-red-400 font-semibold" : "text-zinc-300"
                }`}
              >
                {line}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error summary panel
// ---------------------------------------------------------------------------

function ErrorSummaryPanel({ containerLines }: { containerLines: string[] }) {
  const [expanded, setExpanded] = useState(true);
  const display = containerLines.slice(0, 30);
  if (display.length === 0) return null;

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-semibold text-sm">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Container logs — {display.length} line{display.length !== 1 ? "s" : ""}
          {containerLines.length > 30 && ` (showing first 30 of ${containerLines.length})`}
        </div>
        {expanded
          ? <ChevronUp className="h-4 w-4 text-red-500 flex-shrink-0" />
          : <ChevronDown className="h-4 w-4 text-red-500 flex-shrink-0" />
        }
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-0.5">
          {display.map((line, i) => (
            <div
              key={i}
              className={`font-mono text-xs rounded px-2 py-1 break-all ${
                isErrorLine(line)
                  ? "text-red-800 dark:text-red-300 bg-red-100 dark:bg-red-900/50 font-semibold"
                  : "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/60"
              }`}
            >
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main DeployLog component
// ---------------------------------------------------------------------------

export function DeployLog({ deploymentId, initialStatus, onFinish }: DeployLogProps) {
  const [buildLines, setBuildLines] = useState<string[]>([]);
  const [containerLines, setContainerLines] = useState<string[]>([]);
  const [status, setStatus] = useState<DeployStatus>(initialStatus ?? "pending");
  const esRef = useRef<EventSource | null>(null);
  const finishedRef = useRef(false);

  const handleFinish = useCallback(
    (finalStatus: DeployStatus) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setStatus(finalStatus);
      const errLines = containerLines.filter(isErrorLine);
      onFinish?.(finalStatus, errLines);
    },
    [onFinish, containerLines],
  );

  useEffect(() => {
    // Already finished — load from DB
    if (status === "success" || status === "failed") {
      api.deployments.get(deploymentId).then((d) => {
        if (d.log) setBuildLines(d.log.split("\n").filter(Boolean).map(stripAnsi));
        if (d.container_log) setContainerLines(d.container_log.split("\n").filter(Boolean).map(stripAnsi));
      }).catch(() => {});
      return;
    }

    const es = api.deployments.stream(deploymentId);
    esRef.current = es;

    es.addEventListener("log", (e) => {
      const line = stripAnsi((e as MessageEvent).data as string);
      setBuildLines((prev) => {
        const next = [...prev, line];
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
      });
    });

    es.addEventListener("container_log", (e) => {
      const line = stripAnsi((e as MessageEvent).data as string);
      setContainerLines((prev) => {
        const next = [...prev, line];
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
      });
    });

    es.addEventListener("status", (e) => {
      try {
        const parsed = JSON.parse((e as MessageEvent).data) as { status: DeployStatus };
        es.close();
        handleFinish(parsed.status);
      } catch {
        // malformed — ignore
      }
    });

    es.onerror = () => {
      es.close();
      api.deployments.get(deploymentId).then((d) => {
        if (d.log) setBuildLines(d.log.split("\n").filter(Boolean).map(stripAnsi));
        if (d.container_log) setContainerLines(d.container_log.split("\n").filter(Boolean).map(stripAnsi));
        handleFinish(d.status);
      }).catch(() => {});
    };

    return () => { es.close(); };
  }, [deploymentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const containerRunning = status === "running" && containerLines.length === 0
    && buildLines.some((l) => l.includes("sleep"));

  return (
    <div className="space-y-3">
      <BuildTerminal lines={buildLines} status={status} />

      <ContainerLogsPanel lines={containerLines} isRunning={containerRunning} />

      {status === "success" && (
        <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40 px-4 py-3 flex items-center gap-2 text-green-700 dark:text-green-400 text-sm font-medium">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          Deployment completed successfully.
        </div>
      )}
    </div>
  );
}
