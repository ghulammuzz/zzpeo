"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
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

const COL_X = { internet: 0, nginx: 220, service: 490, object: 750 };
const SVC_NODE_H = 100;
const OBJ_NODE_H = 68;
const ROW_GAP = 28;
const OBJ_GAP = 10;

// Cyberpunk neon palette
const NEON = {
  cyan:    "#00e5ff",
  yellow:  "#ffe600",
  blue:    "#4d9fff",
  green:   "#3dff6e",
  magenta: "#ff0055",
  dim:     "hsl(218,38%,12%)",
  surface: "hsl(218,45%,5%)",
};

const DEPLOY_STYLE: Record<string, { bg: string; text: string }> = {
  docker: { bg: "rgba(255,0,85,0.14)",   text: "#ff4499" },
  pm2:    { bg: "rgba(61,255,110,0.14)", text: "#3dff6e" },
  php:    { bg: "rgba(77,159,255,0.14)", text: "#4d9fff" },
  shell:  { bg: "rgba(255,230,0,0.14)",  text: "#ffe600" },
};

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

    if (port !== null) {
      for (const svc of services) {
        if (usedSvc.has(svc.id)) continue;
        if (svc.local_port === port) { matched = svc; break; }
      }
    }
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
// Node components
// ---------------------------------------------------------------------------

function InternetNode({ data }: NodeProps) {
  const d = data as { host: string };
  return (
    <div
      style={{
        background: NEON.surface,
        border: `1.5px solid ${NEON.cyan}`,
        boxShadow: `0 0 16px rgba(0,229,255,0.25), inset 0 0 20px rgba(0,229,255,0.04)`,
        borderRadius: "4px",
      }}
      className="px-4 py-3 w-[164px]"
    >
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: NEON.cyan, border: "none", width: 8, height: 8 }}
      />
      <div className="flex items-center gap-2.5">
        <Globe style={{ color: NEON.cyan }} className="h-5 w-5 flex-shrink-0" />
        <div className="min-w-0">
          <div className="font-semibold text-sm leading-tight" style={{ color: NEON.cyan }}>
            Internet
          </div>
          <div className="font-mono text-xs truncate mt-0.5" style={{ color: `${NEON.cyan}99` }}>
            {d.host}
          </div>
        </div>
      </div>
    </div>
  );
}

function NginxNode({ data }: NodeProps) {
  const d = data as { block: NginxBlock };
  const b = d.block;
  return (
    <div
      style={{
        background: NEON.surface,
        border: `1.5px solid ${NEON.yellow}`,
        boxShadow: `0 0 12px rgba(255,230,0,0.18), inset 0 0 16px rgba(255,230,0,0.03)`,
        borderRadius: "4px",
      }}
      className="px-3 py-2.5 w-[230px]"
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: NEON.yellow, border: "none", width: 8, height: 8 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: NEON.yellow, border: "none", width: 8, height: 8 }}
      />
      <div className="flex items-start gap-2">
        <Server style={{ color: NEON.yellow }} className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <div className="min-w-0 w-full">
          {/* Domain names */}
          <div className="flex items-center gap-1 flex-wrap mb-1.5">
            {b.ssl_enabled
              ? <Shield className="h-3 w-3 flex-shrink-0" style={{ color: NEON.green }} />
              : <ShieldOff className="h-3 w-3 flex-shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />
            }
            {b.server_names.slice(0, 2).map((n) => (
              <span key={n} className="font-mono text-xs truncate font-medium" style={{ color: NEON.yellow }}>
                {n}
              </span>
            ))}
            {b.server_names.length > 2 && (
              <span className="text-xs font-mono" style={{ color: `${NEON.yellow}80` }}>
                +{b.server_names.length - 2}
              </span>
            )}
          </div>
          {/* Listen ports */}
          <div className="flex flex-wrap gap-1 mb-1">
            {b.listen.map((l) => (
              <span
                key={l}
                className="rounded-sm px-1.5 py-0.5 text-xs font-mono font-semibold"
                style={{ background: "rgba(255,230,0,0.12)", color: NEON.yellow }}
              >
                {l}
              </span>
            ))}
          </div>
          {b.proxy_pass && (
            <div className="text-xs font-mono truncate" style={{ color: "rgba(255,255,255,0.45)" }}>
              → {b.proxy_pass}
            </div>
          )}
          {b.root_dir && (
            <div className="text-xs font-mono truncate" style={{ color: "rgba(255,255,255,0.45)" }}>
              root: {b.root_dir}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ServiceNode({ data }: NodeProps) {
  const d = data as { service: Service };
  const svc = d.service;
  const ds = DEPLOY_STYLE[svc.deploy_type] ?? { bg: "rgba(255,255,255,0.08)", text: "rgba(255,255,255,0.7)" };
  return (
    <div
      style={{
        background: NEON.surface,
        border: `1.5px solid ${NEON.blue}`,
        boxShadow: `0 0 12px rgba(77,159,255,0.18), inset 0 0 16px rgba(77,159,255,0.03)`,
        borderRadius: "4px",
      }}
      className="px-3 py-2.5 w-[230px]"
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: NEON.blue, border: "none", width: 8, height: 8 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: NEON.blue, border: "none", width: 8, height: 8 }}
      />
      <div className="flex items-start gap-2">
        <Box style={{ color: NEON.blue }} className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <div className="min-w-0 w-full">
          <div
            className="font-semibold text-sm truncate leading-tight mb-0.5"
            style={{ color: "rgba(208,238,255,0.95)" }}
          >
            {svc.name}
          </div>
          <div className="font-mono text-xs truncate mb-1.5" style={{ color: "rgba(255,255,255,0.38)" }}>
            {svc.workdir}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="rounded-sm px-2 py-0.5 text-xs font-mono font-semibold tracking-wide"
              style={{ background: ds.bg, color: ds.text }}
            >
              {svc.deploy_type}
            </span>
            {svc.local_port && (
              <span
                className="rounded-sm px-1.5 py-0.5 text-xs font-mono font-semibold"
                style={{ background: "rgba(77,159,255,0.12)", color: NEON.blue }}
              >
                :{svc.local_port}
              </span>
            )}
          </div>
          {svc.run_as_user && (
            <div className="text-xs font-mono mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
              su: {svc.run_as_user}
            </div>
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
    <div
      style={{
        background: NEON.surface,
        border: `1.5px solid ${NEON.green}`,
        boxShadow: `0 0 12px rgba(61,255,110,0.18), inset 0 0 16px rgba(61,255,110,0.03)`,
        borderRadius: "4px",
      }}
      className="px-3 py-2.5 w-[200px]"
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: NEON.green, border: "none", width: 8, height: 8 }}
      />
      <div className="flex items-center gap-2">
        <Database style={{ color: NEON.green }} className="h-4 w-4 flex-shrink-0" />
        <div className="min-w-0">
          <div
            className="font-medium text-sm truncate leading-tight"
            style={{ color: "rgba(208,238,255,0.9)" }}
          >
            {obj.name}
          </div>
          <div className="text-xs font-mono mt-0.5 truncate" style={{ color: `${NEON.green}99` }}>
            {obj.object_type_name}
            {obj.host && <span> {obj.host}{obj.port ? `:${obj.port}` : ""}</span>}
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

    const objMeta = new Map<string, { obj: ObjectItem; ySum: number; count: number }>();

    nodes.push({
      id: "internet",
      type: "internet",
      position: { x: COL_X.internet, y: totalHeight / 2 - 42 },
      data: { host: serverHost },
      draggable: false,
    });

    for (let i = 0; i < lanes.length; i++) {
      const { nginx, service } = lanes[i];
      const yStart = laneYStarts[i];
      const laneH = laneHeights[i];
      const midY = yStart + laneH / 2;

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
          style: { stroke: `${NEON.yellow}88`, strokeWidth: 1.5 },
        });

        if (service) {
          const svcId = `service-${service.id}`;
          edges.push({
            id: `${nginxId}-${svcId}`,
            source: nginxId,
            target: svcId,
            type: "straight",
            animated: true,
            style: { stroke: `${NEON.blue}cc`, strokeWidth: 1.5 },
          });
        }
      }

      if (service) {
        const svcId = `service-${service.id}`;
        nodes.push({
          id: svcId,
          type: "service",
          position: { x: COL_X.service, y: midY - SVC_NODE_H / 2 },
          data: { service },
          draggable: false,
        });

        const objs = serviceObjects[service.id] ?? [];
        for (const obj of objs) {
          const objId = `object-${obj.id}`;
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
            style: { stroke: `${NEON.green}88`, strokeWidth: 1.5 },
          });
        }
      }
    }

    type ObjGroup = { obj: ObjectItem; avgY: number }[];
    const grouped = new Map<string, ObjGroup>();

    for (const [, meta] of Array.from(objMeta)) {
      const avgY = meta.ySum / meta.count;
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

    return { nodes, edges, height: Math.max(totalHeight + 48, 160) };
  }, [nginxBlocks, services, serviceObjects, serverHost]);

  if (services.length === 0 && nginxBlocks.length === 0) return null;

  return (
    <div
      className="w-full rounded-sm border border-border overflow-hidden"
      style={{
        height: Math.min(height, 380),
        background: "hsl(222,47%,3%)",
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
        style={{ background: "hsl(222,47%,3%)" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="rgba(0,229,255,0.12)"
        />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
