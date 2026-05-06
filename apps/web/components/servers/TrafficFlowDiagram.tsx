"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Globe, Server, Box, Database, Shield, ShieldOff } from "lucide-react";
import type { NginxBlock, Service, ObjectItem } from "@/lib/types";

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const COL_X = { internet: 0, nginx: 200, service: 460, object: 700 };
const SVC_NODE_H = 90;
const OBJ_NODE_H = 60;
const ROW_GAP = 24;
const OBJ_GAP = 8;

// ---------------------------------------------------------------------------
// Port-matching helpers
// ---------------------------------------------------------------------------

function proxyPort(block: NginxBlock): number | null {
  if (!block.proxy_pass) return null;
  const m = block.proxy_pass.match(/:(\d+)\/?$/);
  return m ? parseInt(m[1]) : null;
}

interface Lane { nginx: NginxBlock | null; service: Service | null }

function buildLanes(blocks: NginxBlock[], services: Service[]): Lane[] {
  const usedSvc = new Set<string>();
  const lanes: Lane[] = [];

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];
    const port = proxyPort(block);
    let matched: Service | null = null;

    // Match by local_port first (explicit)
    if (port !== null) {
      for (const svc of services) {
        if (usedSvc.has(svc.id)) continue;
        if (svc.local_port === port) { matched = svc; break; }
      }
    }
    // Fallback: root_dir ↔ workdir prefix match
    if (!matched) {
      for (const svc of services) {
        if (usedSvc.has(svc.id)) continue;
        const root = (block.root_dir ?? "").replace(/\/$/, "");
        const work = svc.workdir.replace(/\/$/, "");
        if (root && (root === work || root.startsWith(work))) { matched = svc; break; }
      }
    }

    lanes.push({ nginx: block, service: matched });
    if (matched) usedSvc.add(matched.id);
  }

  for (const svc of services) {
    if (!usedSvc.has(svc.id)) lanes.push({ nginx: null, service: svc });
  }
  return lanes;
}

// ---------------------------------------------------------------------------
// Custom node components
// ---------------------------------------------------------------------------

const DEPLOY_COLORS: Record<string, string> = {
  docker: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  pm2:    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  php:    "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  shell:  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
};

function InternetNode({ data }: NodeProps) {
  const d = data as { host: string };
  return (
    <div className="rounded-xl border-2 border-blue-400 bg-blue-50 dark:bg-blue-950 px-4 py-3 w-[160px] shadow-md">
      <Handle type="source" position={Position.Right} className="!bg-blue-400" />
      <div className="flex items-center gap-2">
        <Globe className="h-5 w-5 text-blue-500 flex-shrink-0" />
        <div>
          <div className="font-semibold text-sm text-blue-800 dark:text-blue-200">Internet</div>
          <div className="font-mono text-xs text-blue-600 dark:text-blue-400 truncate max-w-[100px]">{d.host}</div>
        </div>
      </div>
    </div>
  );
}

function NginxNode({ data }: NodeProps) {
  const d = data as { block: NginxBlock };
  const b = d.block;
  return (
    <div className="rounded-xl border-2 border-orange-300 bg-orange-50 dark:bg-orange-950/40 px-3 py-2.5 w-[220px] shadow-md">
      <Handle type="target" position={Position.Left} className="!bg-orange-400" />
      <Handle type="source" position={Position.Right} className="!bg-orange-400" />
      <div className="flex items-start gap-2">
        <Server className="h-4 w-4 text-orange-500 flex-shrink-0 mt-0.5" />
        <div className="min-w-0 w-full">
          <div className="flex items-center gap-1 flex-wrap mb-1">
            {b.ssl_enabled
              ? <Shield className="h-3 w-3 text-green-500" />
              : <ShieldOff className="h-3 w-3 text-muted-foreground" />
            }
            {b.server_names.slice(0, 2).map((n) => (
              <span key={n} className="font-mono text-xs font-medium truncate">{n}</span>
            ))}
            {b.server_names.length > 2 && (
              <span className="text-xs text-muted-foreground">+{b.server_names.length - 2}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {b.listen.map((l) => (
              <span key={l} className="bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300 rounded px-1.5 text-xs font-mono">{l}</span>
            ))}
          </div>
          {b.proxy_pass && (
            <div className="text-xs text-muted-foreground mt-1 font-mono truncate">→ {b.proxy_pass}</div>
          )}
          {b.root_dir && (
            <div className="text-xs text-muted-foreground mt-1 font-mono truncate">root: {b.root_dir}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ServiceNode({ data }: NodeProps) {
  const d = data as { service: Service };
  const svc = d.service;
  return (
    <div className="rounded-xl border-2 border-purple-300 bg-purple-50 dark:bg-purple-950/40 px-3 py-2.5 w-[220px] shadow-md">
      <Handle type="target" position={Position.Left} className="!bg-purple-400" />
      <Handle type="source" position={Position.Right} className="!bg-purple-400" />
      <div className="flex items-start gap-2">
        <Box className="h-4 w-4 text-purple-500 flex-shrink-0 mt-0.5" />
        <div className="min-w-0 w-full">
          <div className="font-semibold text-sm truncate">{svc.name}</div>
          <div className="font-mono text-xs text-muted-foreground truncate">{svc.workdir}</div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${DEPLOY_COLORS[svc.deploy_type] ?? ""}`}>
              {svc.deploy_type}
            </span>
            {svc.local_port && (
              <span className="bg-muted rounded px-1.5 text-xs font-mono">:{svc.local_port}</span>
            )}
          </div>
          {svc.run_as_user && (
            <div className="text-xs text-muted-foreground mt-0.5 font-mono">su: {svc.run_as_user}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ObjectNode({ data }: NodeProps) {
  const d = data as { obj: ObjectItem };
  const obj = d.obj;
  return (
    <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 w-[200px] shadow-md">
      <Handle type="target" position={Position.Left} className="!bg-emerald-400" />
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-emerald-500 flex-shrink-0" />
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{obj.name}</div>
          <div className="text-xs text-muted-foreground">
            {obj.object_type_name}
            {obj.host && <span className="font-mono"> {obj.host}{obj.port ? `:${obj.port}` : ""}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

const nodeTypes = {
  internet: InternetNode,
  nginx: NginxNode,
  service: ServiceNode,
  object: ObjectNode,
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface TrafficFlowDiagramProps {
  serverHost: string;
  nginxBlocks: NginxBlock[];
  services: Service[];
  serviceObjects: Record<string, ObjectItem[]>;
}

export function TrafficFlowDiagram({ serverHost, nginxBlocks, services, serviceObjects }: TrafficFlowDiagramProps) {
  const { nodes, edges, height } = useMemo(() => {
    const lanes = buildLanes(nginxBlocks, services);
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Calculate y start per lane
    const laneYStarts: number[] = [];
    const laneHeights: number[] = [];
    let totalY = 0;

    for (const lane of lanes) {
      const numObjs = lane.service ? (serviceObjects[lane.service.id]?.length ?? 0) : 0;
      const objsHeight = numObjs > 0
        ? numObjs * OBJ_NODE_H + (numObjs - 1) * OBJ_GAP
        : 0;
      const h = Math.max(SVC_NODE_H, objsHeight);
      laneYStarts.push(totalY);
      laneHeights.push(h);
      totalY += h + ROW_GAP;
    }

    const totalHeight = Math.max(totalY - ROW_GAP, SVC_NODE_H);

    // Track unique objects: id → { obj, ySum, count } for averaged positioning
    const objMeta = new Map<string, { obj: ObjectItem; ySum: number; count: number }>();

    // Internet node — vertically centered
    nodes.push({
      id: "internet",
      type: "internet",
      position: { x: COL_X.internet, y: totalHeight / 2 - 40 },
      data: { host: serverHost },
      draggable: false,
    });

    for (let i = 0; i < lanes.length; i++) {
      const { nginx, service } = lanes[i];
      const yStart = laneYStarts[i];
      const laneH = laneHeights[i];
      const midY = yStart + laneH / 2;

      // Nginx node
      if (nginx) {
        const nginxId = `nginx-${i}`;
        nodes.push({
          id: nginxId,
          type: "nginx",
          position: { x: COL_X.nginx, y: midY - SVC_NODE_H / 2 },
          data: { block: nginx },
          draggable: false,
        });
        edges.push({
          id: `internet-${nginxId}`,
          source: "internet",
          target: nginxId,
          type: "straight",
          style: { stroke: "#93c5fd", strokeWidth: 1.5, opacity: 0.7 },
        });

        if (service) {
          const svcId = `service-${service.id}`;
          edges.push({
            id: `${nginxId}-${svcId}`,
            source: nginxId,
            target: svcId,
            type: "straight",
            animated: true,
            style: { stroke: "#c4b5fd", strokeWidth: 1.5 },
          });
        }
      }

      // Service node
      if (service) {
        const svcId = `service-${service.id}`;
        nodes.push({
          id: svcId,
          type: "service",
          position: { x: COL_X.service, y: midY - SVC_NODE_H / 2 },
          data: { service },
          draggable: false,
        });


        // Collect service→object edges (objects rendered in second pass below)
        const objs = serviceObjects[service.id] ?? [];
        for (const obj of objs) {
          const objId = `object-${obj.id}`;
          // Accumulate Y contributions for shared-object averaging
          if (!objMeta.has(obj.id)) {
            objMeta.set(obj.id, { obj, ySum: midY, count: 1 });
          } else {
            const m = objMeta.get(obj.id)!;
            m.ySum += midY;
            m.count += 1;
          }
          edges.push({
            id: `${svcId}-${objId}`,
            source: svcId,
            target: objId,
            type: "straight",
            style: { stroke: "#6ee7b7", strokeWidth: 1.5 },
          });
        }
      }
    }

    // Second pass: render each unique object node once, Y = average of connected service Y positions
    // Group objects by their averaged Y so stacked objects per group are laid out together
    type ObjGroup = { obj: ObjectItem; avgY: number }[];
    const grouped = new Map<string, ObjGroup>(); // key = svcId of first referencing service (for grouping)

    // Build service→objects map to group objects that belong to same service set
    for (const [objId, meta] of Array.from(objMeta)) {
      const avgY = meta.ySum / meta.count;
      // Use rounded avgY as group key so co-located objects cluster
      const groupKey = String(Math.round(avgY));
      if (!grouped.has(groupKey)) grouped.set(groupKey, []);
      grouped.get(groupKey)!.push({ obj: meta.obj, avgY });
    }

    for (const group of Array.from(grouped.values())) {
      const avgY = group[0].avgY;
      const blockH = group.length * OBJ_NODE_H + (group.length - 1) * OBJ_GAP;
      const startY = avgY - blockH / 2;
      group.forEach(({ obj }, j) => {
        nodes.push({
          id: `object-${obj.id}`,
          type: "object",
          position: { x: COL_X.object, y: startY + j * (OBJ_NODE_H + OBJ_GAP) },
          data: { obj },
          draggable: false,
        });
      });
    }

    return { nodes, edges, height: Math.max(totalHeight + 40, 160) };
  }, [nginxBlocks, services, serviceObjects, serverHost]);

  if (services.length === 0 && nginxBlocks.length === 0) return null;

  return (
    <div style={{ height: Math.min(height, 360) }} className="w-full rounded-lg border overflow-hidden bg-muted/20">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} className="opacity-40" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
