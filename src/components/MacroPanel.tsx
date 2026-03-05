"use client";

import { Patch } from "@/types/patch";

interface MacroPanelProps {
  patch: Patch;
  macroValues: Record<string, number>;
  onMacroChange: (macroId: string, normalized: number) => void;
}

export function MacroPanel({ patch, macroValues, onMacroChange }: MacroPanelProps) {
  return (
    <div className="macro-panel">
      <h3>Macros</h3>
      {patch.ui.macros.length === 0 && <p className="muted">No macros exposed yet.</p>}
      {patch.ui.macros.map((macro) => {
        const value = macroValues[macro.id] ?? 0.5;
        return (
          <label key={macro.id} className="macro-row">
            <span>{macro.name}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={value}
              onChange={(event) => onMacroChange(macro.id, Number(event.target.value))}
            />
            <strong>{Math.round(value * 100)}%</strong>
          </label>
        );
      })}
    </div>
  );
}
