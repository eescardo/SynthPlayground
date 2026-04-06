"use client";

import { Patch } from "@/types/patch";

interface MacroPanelProps {
  patch: Patch;
  macroValues: Record<string, number>;
  automatedMacroIds: ReadonlySet<string>;
  automationExpandedByMacroId: ReadonlyMap<string, boolean>;
  onMacroChange: (macroId: string, normalized: number) => void;
  onMacroCommit?: (macroId: string, normalized: number) => void;
  onBindMacroToAutomation: (macroId: string, normalized: number) => void;
  onUnbindMacroFromAutomation: (macroId: string) => void;
  onToggleMacroAutomationLane: (macroId: string) => void;
}

export function MacroPanel({
  patch,
  macroValues,
  automatedMacroIds,
  automationExpandedByMacroId,
  onMacroChange,
  onMacroCommit,
  onBindMacroToAutomation,
  onUnbindMacroFromAutomation,
  onToggleMacroAutomationLane
}: MacroPanelProps) {
  return (
    <div className="macro-panel">
      <h3>Macros & Automation</h3>
      {patch.ui.macros.length === 0 && <p className="muted">No macros exposed yet.</p>}
      {patch.ui.macros.map((macro) => {
        const value = macroValues[macro.id] ?? macro.defaultNormalized ?? 0.5;
        const defaultNormalized = macro.defaultNormalized ?? 0.5;
        const automated = automatedMacroIds.has(macro.id);
        const laneExpanded = automationExpandedByMacroId.get(macro.id) !== false;
        return (
          <label key={macro.id} className={`macro-row${automated ? " automated" : ""}`}>
            <span>
              {macro.name}
              {automated ? " (Automated)" : ""}
            </span>
            <div className="macro-slider-wrap">
              <span className="macro-default-marker" style={{ left: `${defaultNormalized * 100}%` }} aria-hidden="true" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={value}
                disabled={automated}
                onChange={(event) => onMacroChange(macro.id, Number(event.target.value))}
                aria-disabled={automated}
                onPointerUp={automated ? undefined : (event) => onMacroCommit?.(macro.id, Number((event.target as HTMLInputElement).value))}
                onKeyUp={automated ? undefined : (event) => onMacroCommit?.(macro.id, Number((event.target as HTMLInputElement).value))}
              />
            </div>
            <strong>{Math.round(value * 100)}%</strong>
            <button
              type="button"
              className="macro-binding-pill"
              onClick={() => (automated ? onUnbindMacroFromAutomation(macro.id) : onBindMacroToAutomation(macro.id, value))}
            >
              {automated ? "Use fixed value" : "Automate"}
            </button>
            {automated && (
              <button type="button" className="macro-binding-pill" onClick={() => onToggleMacroAutomationLane(macro.id)}>
                {laneExpanded ? "Collapse lane" : "Expand lane"}
              </button>
            )}
          </label>
        );
      })}
    </div>
  );
}
