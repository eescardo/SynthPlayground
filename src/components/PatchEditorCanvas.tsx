"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createId } from "@/lib/ids";
import { getModuleSchema, modulePalette } from "@/lib/patch/moduleRegistry";
import { makeConnectOp } from "@/lib/patch/ops";
import { PatchValidationIssue, Patch, PortSchema } from "@/types/patch";
import { PatchOp } from "@/types/ops";

const GRID = 24;
const NODE_W = 168;
const NODE_H = 96;

const CAPABILITY_COLORS: Record<string, string> = {
  AUDIO: "#4dc0ff",
  CV: "#64e283",
  GATE: "#ffbd44"
};

interface HitPort {
  nodeId: string;
  portId: string;
  kind: "in" | "out";
  x: number;
  y: number;
}

interface PatchEditorCanvasProps {
  patch: Patch;
  selectedNodeId?: string;
  validationIssues: PatchValidationIssue[];
  onSelectNode: (nodeId?: string) => void;
  onApplyOp: (op: PatchOp) => void;
  onUndo: () => void;
  onRedo: () => void;
}

function getCapabilityColor(port: PortSchema): string {
  const first = port.capabilities[0];
  return CAPABILITY_COLORS[first] ?? "#9aa8b4";
}

export function PatchEditorCanvas(props: PatchEditorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hitPortsRef = useRef<HitPort[]>([]);
  const dragLastLayoutRef = useRef<{ x: number; y: number } | null>(null);
  const [newNodeType, setNewNodeType] = useState(modulePalette[0]?.typeId ?? "VCO");
  const [pendingFromPort, setPendingFromPort] = useState<HitPort | null>(null);
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);

  const layoutByNode = useMemo(() => {
    return new Map(props.patch.layout.nodes.map((node) => [node.nodeId, node] as const));
  }, [props.patch.layout.nodes]);

  const nodeById = useMemo(() => new Map(props.patch.nodes.map((node) => [node.id, node] as const)), [props.patch.nodes]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = 1400;
    const height = 640;
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = "#0c141d";
    ctx.fillRect(0, 0, width, height);

    for (let x = 0; x < width; x += GRID) {
      ctx.strokeStyle = x % (GRID * 4) === 0 ? "#1b2835" : "#121e28";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += GRID) {
      ctx.strokeStyle = y % (GRID * 4) === 0 ? "#1b2835" : "#121e28";
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const portPositions = new Map<string, { x: number; y: number; schema: PortSchema }>();

    props.patch.nodes.forEach((node) => {
      const schema = getModuleSchema(node.typeId);
      if (!schema) return;
      const layout = layoutByNode.get(node.id);
      if (!layout) return;

      const x = layout.x * GRID;
      const y = layout.y * GRID;

      const selected = props.selectedNodeId === node.id;
      ctx.fillStyle = selected ? "#193f69" : "#16293a";
      ctx.fillRect(x, y, NODE_W, NODE_H);
      ctx.strokeStyle = selected ? "#5bb7ff" : "#315270";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, NODE_W, NODE_H);

      ctx.fillStyle = "#e7f3ff";
      ctx.font = "12px 'Trebuchet MS', 'Segoe UI', sans-serif";
      ctx.fillText(node.typeId, x + 10, y + 18);
      ctx.fillStyle = "#8cb3d5";
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(node.id, x + 10, y + 32);

      schema.portsIn.forEach((port, index) => {
        const py = y + 50 + index * 14;
        const px = x;
        ctx.fillStyle = getCapabilityColor(port);
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#9ec0df";
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(port.id, px + 8, py + 3);
        portPositions.set(`${node.id}:in:${port.id}`, { x: px, y: py, schema: port });
      });

      schema.portsOut.forEach((port, index) => {
        const py = y + 50 + index * 14;
        const px = x + NODE_W;
        ctx.fillStyle = getCapabilityColor(port);
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#9ec0df";
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
        const textWidth = ctx.measureText(port.id).width;
        ctx.fillText(port.id, px - 8 - textWidth, py + 3);
        portPositions.set(`${node.id}:out:${port.id}`, { x: px, y: py, schema: port });
      });
    });

    for (const connection of props.patch.connections) {
      const from = portPositions.get(`${connection.from.nodeId}:out:${connection.from.portId}`);
      const to = portPositions.get(`${connection.to.nodeId}:in:${connection.to.portId}`);
      if (!from || !to) continue;

      const commonCapability = from.schema.capabilities.find((cap) => to.schema.capabilities.includes(cap)) ?? "AUDIO";
      ctx.strokeStyle = CAPABILITY_COLORS[commonCapability] ?? "#c7d8e8";
      ctx.lineWidth = 2;

      const middleX = Math.round((from.x + to.x) / 2 / GRID) * GRID;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(middleX, from.y);
      ctx.lineTo(middleX, to.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }

    if (pendingFromPort) {
      const portKey = `${pendingFromPort.nodeId}:out:${pendingFromPort.portId}`;
      const p = portPositions.get(portKey);
      if (p) {
        ctx.fillStyle = "#ff5d8f";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    hitPortsRef.current = [];
    for (const [key, value] of portPositions.entries()) {
      const [nodeId, kind, portId] = key.split(":");
      hitPortsRef.current.push({ nodeId, kind: kind as "in" | "out", portId, x: value.x, y: value.y });
    }
  }, [layoutByNode, pendingFromPort, props.patch.connections, props.patch.nodes, props.selectedNodeId]);

  useEffect(() => {
    draw();
  }, [draw]);

  const pointerToGrid = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0, rawX: 0, rawY: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;
    return {
      x: Math.round(rawX / GRID),
      y: Math.round(rawY / GRID),
      rawX,
      rawY
    };
  };

  const getNodeAtPointer = (rawX: number, rawY: number): string | null => {
    for (const node of props.patch.nodes) {
      const layout = layoutByNode.get(node.id);
      if (!layout) continue;
      const x = layout.x * GRID;
      const y = layout.y * GRID;
      if (rawX >= x && rawX <= x + NODE_W && rawY >= y && rawY <= y + NODE_H) {
        return node.id;
      }
    }
    return null;
  };

  const getPortAtPointer = (rawX: number, rawY: number): HitPort | null => {
    for (const port of hitPortsRef.current) {
      const dist = Math.hypot(rawX - port.x, rawY - port.y);
      if (dist <= 7) {
        return port;
      }
    }
    return null;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = pointerToGrid(event);
    const hitPort = getPortAtPointer(pos.rawX, pos.rawY);

    if (hitPort) {
      if (hitPort.kind === "out") {
        setPendingFromPort(hitPort);
      } else if (hitPort.kind === "in" && pendingFromPort) {
        props.onApplyOp(makeConnectOp(pendingFromPort.nodeId, pendingFromPort.portId, hitPort.nodeId, hitPort.portId));
        setPendingFromPort(null);
      }
      return;
    }

    const hitNodeId = getNodeAtPointer(pos.rawX, pos.rawY);
    if (hitNodeId) {
      props.onSelectNode(hitNodeId);
      setDragNodeId(hitNodeId);
      const layout = layoutByNode.get(hitNodeId);
      dragLastLayoutRef.current = layout ? { x: layout.x, y: layout.y } : null;
      event.currentTarget.setPointerCapture(event.pointerId);
    } else {
      props.onSelectNode(undefined);
      setPendingFromPort(null);
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragNodeId) return;
    const pos = pointerToGrid(event);
    const nextLayout = {
      x: Math.max(0, pos.x - 2),
      y: Math.max(0, pos.y - 2)
    };
    if (dragLastLayoutRef.current?.x === nextLayout.x && dragLastLayoutRef.current?.y === nextLayout.y) {
      return;
    }
    dragLastLayoutRef.current = nextLayout;
    props.onApplyOp({
      type: "moveNode",
      nodeId: dragNodeId,
      newLayoutPos: nextLayout
    });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragNodeId) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    }
    dragLastLayoutRef.current = null;
    setDragNodeId(null);
  };

  const selectedNode = props.selectedNodeId ? nodeById.get(props.selectedNodeId) : undefined;
  const selectedSchema = selectedNode ? getModuleSchema(selectedNode.typeId) : undefined;

  const bindMacro = (paramId: string) => {
    if (!selectedNode || !selectedSchema) {
      return;
    }

    let macroId = props.patch.ui.macros[0]?.id;
    if (!macroId) {
      macroId = createId("macro");
      props.onApplyOp({ type: "addMacro", macroId, name: "Macro 1" });
    }

    const paramSchema = selectedSchema.params.find((p) => p.id === paramId);
    let min = 0;
    let max = 1;
    if (paramSchema?.type === "float") {
      min = paramSchema.range.min;
      max = paramSchema.range.max;
    }

    props.onApplyOp({
      type: "bindMacro",
      macroId,
      bindingId: createId("bind"),
      nodeId: selectedNode.id,
      paramId,
      map: "linear",
      min,
      max
    });
  };

  return (
    <div className="patch-editor">
      <div className="patch-toolbar">
        <select value={newNodeType} onChange={(e) => setNewNodeType(e.target.value)}>
          {modulePalette.map((module) => (
            <option key={module.typeId} value={module.typeId}>
              {module.typeId}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            const nodeId = createId("node");
            props.onApplyOp({
              type: "addNode",
              typeId: newNodeType,
              nodeId,
              layoutPos: { x: 3, y: 3 }
            });
            props.onSelectNode(nodeId);
          }}
        >
          Add Module
        </button>
        <button
          disabled={!props.selectedNodeId}
          onClick={() => props.selectedNodeId && props.onApplyOp({ type: "removeNode", nodeId: props.selectedNodeId })}
        >
          Delete Selected
        </button>
        <button onClick={props.onUndo}>Undo</button>
        <button onClick={props.onRedo}>Redo</button>
        {pendingFromPort && <span className="muted">Select input port to complete connection.</span>}
      </div>

      <div className="patch-layout">
        <canvas
          ref={canvasRef}
          width={1400}
          height={640}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />

        <aside className="patch-inspector">
          <h3>Inspector</h3>
          {!selectedNode && <p className="muted">Select a module to edit parameters.</p>}

          {selectedNode && selectedSchema && (
            <>
              <h4>
                {selectedNode.typeId} <small>{selectedNode.id}</small>
              </h4>
              {selectedSchema.params.map((param) => {
                const value = selectedNode.params[param.id] ?? param.default;
                return (
                  <label key={param.id} className="param-row">
                    <span>{param.label}</span>
                    {param.type === "float" && (
                      <input
                        type="range"
                        min={param.range.min}
                        max={param.range.max}
                        step={(param.range.max - param.range.min) / 500}
                        value={Number(value)}
                        onChange={(event) =>
                          props.onApplyOp({
                            type: "setParam",
                            nodeId: selectedNode.id,
                            paramId: param.id,
                            value: Number(event.target.value)
                          })
                        }
                      />
                    )}
                    {param.type === "enum" && (
                      <select
                        value={String(value)}
                        onChange={(event) =>
                          props.onApplyOp({
                            type: "setParam",
                            nodeId: selectedNode.id,
                            paramId: param.id,
                            value: event.target.value
                          })
                        }
                      >
                        {param.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    )}
                    {param.type === "bool" && (
                      <input
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={(event) =>
                          props.onApplyOp({
                            type: "setParam",
                            nodeId: selectedNode.id,
                            paramId: param.id,
                            value: event.target.checked
                          })
                        }
                      />
                    )}
                    <button type="button" onClick={() => bindMacro(param.id)}>
                      Expose Macro
                    </button>
                  </label>
                );
              })}
            </>
          )}

          <h4>Connections</h4>
          {props.patch.connections.length === 0 && <p className="muted">No wires yet.</p>}
          {props.patch.connections.map((connection) => (
            <div key={connection.id} className="conn-row">
              <code>
                {connection.from.nodeId}.{connection.from.portId} {" -> "} {connection.to.nodeId}.{connection.to.portId}
              </code>
              <button onClick={() => props.onApplyOp({ type: "disconnect", connectionId: connection.id })}>x</button>
            </div>
          ))}

          <h4>Validation</h4>
          {props.validationIssues.length === 0 && <p className="ok">Patch valid.</p>}
          {props.validationIssues.map((issue, index) => (
            <p key={`${issue.message}_${index}`} className={issue.level === "error" ? "error" : "warn"}>
              {issue.message}
            </p>
          ))}
        </aside>
      </div>
    </div>
  );
}
