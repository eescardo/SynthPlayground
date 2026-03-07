"use client";

import { Patch } from "@/types/patch";

interface MacroPanelProps {
  patch: Patch;
  macroValues: Record<string, number>;
  onMacroChange: (macroId: string, normalized: number) => void;
  onMacroCommit?: (macroId: string, normalized: number) => void;
}

export function MacroPanel({ patch, macroValues, onMacroChange, onMacroCommit }: MacroPanelProps) {
  return (
    <div className="macro-panel">
      <h3>Macros</h3>
      {patch.ui.macros.length === 0 && <p className="muted">No macros exposed yet.</p>}
      {patch.ui.macros.map((macro) => {
        const value = macroValues[macro.id] ?? macro.defaultNormalized ?? 0.5;
        const defaultNormalized = macro.defaultNormalized ?? 0.5;
        return (
          <label key={macro.id} className="macro-row">
            <span>{macro.name}</span>
            <div className="macro-slider-wrap">
              <span className="macro-default-marker" style={{ left: `${defaultNormalized * 100}%` }} aria-hidden="true" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={value}
                onChange={(event) => onMacroChange(macro.id, Number(event.target.value))}
                onPointerUp={(event) => onMacroCommit?.(macro.id, Number((event.target as HTMLInputElement).value))}
                onKeyUp={(event) => onMacroCommit?.(macro.id, Number((event.target as HTMLInputElement).value))}
              />
            </div>
            <strong>{Math.round(value * 100)}%</strong>
          </label>
        );
      })}
    </div>
  );
}
