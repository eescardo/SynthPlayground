"use client";

import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { drawPatchModuleFaceContent } from "@/components/patch/patchModuleFaceDrawing";
import { buildModulePaletteGroups } from "@/components/patch/patchModulePaletteGroups";
import { resolveMutedPatchModuleColors } from "@/lib/patch/moduleCategories";
import { createDefaultParamsForType } from "@/lib/patch/moduleRegistry";
import { ModuleTypeSchema, Patch, PatchModuleCategory, PatchNode } from "@/types/patch";

interface PatchModulePaletteProps {
  onSelectModule: (typeId: string) => void;
}

const CATEGORY_LABELS: Record<PatchModuleCategory, string> = {
  source: "Sources",
  mix: "Mix",
  cv: "CV",
  processor: "Processors",
  envelope: "Envelopes",
  probe: "Probes",
  host: "Host"
};

const EMPTY_PATCH_FOR_ICON: Patch = {
  schemaVersion: 1,
  id: "module-palette-icon-patch",
  name: "Module Palette Icon Patch",
  nodes: [],
  connections: [],
  layout: { nodes: [] },
  ui: { macros: [] },
  meta: { source: "custom" }
};

function PatchModulePaletteIcon({ module }: { module: ModuleTypeSchema }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const colors = resolveMutedPatchModuleColors(module.categories);
    const node: PatchNode = {
      id: "icon",
      typeId: module.typeId,
      params: createDefaultParamsForType(module.typeId)
    };
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(0.24, 0.24);
    drawPatchModuleFaceContent(ctx, EMPTY_PATCH_FOR_ICON, node, module, 0, 0, colors.accent);
    ctx.restore();
  }, [module]);

  return <canvas ref={canvasRef} width={38} height={24} aria-hidden="true" className="patch-module-palette-icon" />;
}

export function PatchModulePalette(props: PatchModulePaletteProps) {
  const groups = useMemo(buildModulePaletteGroups, []);
  const [activeCategory, setActiveCategory] = useState<PatchModuleCategory | null>(groups[0]?.category ?? null);

  return (
    <div className="patch-module-palette">
      <div className="patch-module-category-list" role="listbox" aria-label="Module categories">
        {groups.map((group) => {
          const colors = resolveMutedPatchModuleColors([group.category]);
          const style = {
            "--module-category-fill": colors.fill,
            "--module-category-stroke": colors.stroke,
            "--module-category-accent": colors.accent
          } as CSSProperties;
          const open = activeCategory === group.category;

          return (
            <div
              key={group.category}
              className={`patch-module-category-item${open ? " active" : ""}`}
              style={style}
              onPointerEnter={() => setActiveCategory(group.category)}
              onFocus={() => setActiveCategory(group.category)}
            >
              <button type="button" className="patch-module-category-button" aria-expanded={open}>
                <span className="patch-module-category-swatch" aria-hidden="true" />
                <span>{CATEGORY_LABELS[group.category]}</span>
                <span className="patch-module-category-count">{group.modules.length}</span>
              </button>
              <div
                className="patch-module-subpopover"
                role="menu"
                aria-label={`${CATEGORY_LABELS[group.category]} modules`}
              >
                {group.modules.map((module) => {
                  const moduleColors = resolveMutedPatchModuleColors(module.categories);
                  const tooltipId = `patch-module-tooltip-${group.category}-${module.typeId}`;
                  const moduleStyle = {
                    "--module-category-fill": moduleColors.fill,
                    "--module-category-stroke": moduleColors.stroke,
                    "--module-category-accent": moduleColors.accent
                  } as CSSProperties;
                  return (
                    <button
                      key={module.typeId}
                      type="button"
                      className="patch-module-palette-option"
                      style={moduleStyle}
                      role="menuitem"
                      aria-describedby={tooltipId}
                      onClick={() => props.onSelectModule(module.typeId)}
                    >
                      <PatchModulePaletteIcon module={module} />
                      <span className="patch-module-palette-name">{module.typeId}</span>
                      <span id={tooltipId} className="patch-module-palette-tooltip" role="tooltip">
                        {module.doc.summary}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
