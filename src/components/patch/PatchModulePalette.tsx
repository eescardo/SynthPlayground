"use client";

import { CSSProperties, ReactNode, useMemo, useState } from "react";
import { buildModulePaletteGroups } from "@/components/patch/patchModulePaletteGroups";
import { resolveMutedPatchModuleColors } from "@/lib/patch/moduleCategories";
import { ModuleTypeSchema, PatchModuleCategory } from "@/types/patch";

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

function PatchModulePaletteIcon({ module }: { module: ModuleTypeSchema }) {
  return (
    <svg className="patch-module-palette-icon" viewBox="0 0 38 24" aria-hidden="true" focusable="false">
      <rect className="patch-module-palette-icon-face" x="1" y="1" width="36" height="22" rx="2" />
      <rect className="patch-module-palette-icon-header" x="1" y="1" width="36" height="5" rx="2" />
      <path className="patch-module-palette-icon-header-mask" d="M1 4h36v4H1z" />
      <circle className="patch-module-palette-icon-port" cx="1" cy="12" r="1.2" />
      <circle className="patch-module-palette-icon-port" cx="37" cy="12" r="1.2" />
      <g className="patch-module-palette-icon-glyph">{renderModulePaletteGlyph(module.typeId)}</g>
    </svg>
  );
}

function renderModulePaletteGlyph(typeId: string): ReactNode {
  switch (typeId) {
    case "VCO":
      return <path d="M8 15c2.4-6 4.8 6 7.2 0s4.8-6 7.2 0 4.8 6 7.6 0" />;
    case "LFO":
      return (
        <>
          <path d="M8 15c2.5-5 5 5 7 0s5-5 7 0 5 5 8 0" />
          <path className="patch-module-palette-icon-subtle" d="M8 18h22" />
        </>
      );
    case "KarplusStrong":
      return (
        <>
          <path d="M8 16c5-8 13-8 22 0" />
          <path className="patch-module-palette-icon-subtle" d="M10 15v-5m5 3v-5m5 4v-5m5 6V9" />
        </>
      );
    case "SamplePlayer":
      return (
        <>
          <path
            className="patch-module-palette-icon-blob"
            d="M8 14c2.2-4.8 4.7 4.2 6.9-1.1 2.1-5.1 4.8 6.9 7.2 1.2 2.3-5.5 5.2 3.5 7.9-.6v5H8z"
          />
          <path
            className="patch-module-palette-icon-cutout"
            d="M8 14c2.2-4.8 4.7 4.2 6.9-1.1 2.1-5.1 4.8 6.9 7.2 1.2 2.3-5.5 5.2 3.5 7.9-.6"
          />
        </>
      );
    case "Noise":
      return (
        <>
          <circle cx="9.5" cy="10" r="0.75" />
          <circle cx="13" cy="15.8" r="0.9" />
          <circle cx="16.3" cy="11.8" r="0.65" />
          <circle cx="19.6" cy="17.2" r="0.8" />
          <circle cx="22.8" cy="9.7" r="0.75" />
          <circle cx="26.2" cy="14.4" r="0.95" />
          <circle cx="30" cy="11.8" r="0.65" />
        </>
      );
    case "ADSR":
      return <path d="M8 17l5-9 5 4 5 1 7 4" />;
    case "VCA":
      return (
        <>
          <path d="M9 17h7l8-8h5" />
          <path className="patch-module-palette-icon-subtle" d="M18 9v8" />
        </>
      );
    case "VCF":
      return (
        <>
          <path d="M8 17h8c4 0 3-8 7-8s3 8 7 8" />
          <path className="patch-module-palette-icon-subtle" d="M23 8v10" />
        </>
      );
    case "Mixer4":
    case "CVMixer2":
      return (
        <>
          <rect x="8" y="10" width="4" height="8" />
          <rect x="15" y="8" width="4" height="10" />
          <rect x="22" y="12" width="4" height="6" />
          {typeId === "Mixer4" && <rect x="29" y="9" width="3" height="9" />}
        </>
      );
    case "CVTranspose":
      return (
        <>
          <path d="M10 16h18" />
          <path d="M19 9v9" />
          <path d="M15 12l4-4 4 4" />
        </>
      );
    case "CVScaler":
      return (
        <>
          <path d="M9 17l20-8" />
          <path className="patch-module-palette-icon-subtle" d="M12 9l14 8" />
        </>
      );
    case "Delay":
      return (
        <>
          <circle cx="10" cy="14" r="2" />
          <circle cx="19" cy="14" r="1.6" />
          <circle cx="27" cy="14" r="1.2" />
        </>
      );
    case "Reverb":
      return (
        <>
          <path d="M9 16c5-8 11-8 20 0" />
          <path className="patch-module-palette-icon-subtle" d="M12 17c4-5 9-5 14 0" />
          <path className="patch-module-palette-icon-whisper" d="M15 18c3-2.6 6-2.6 8 0" />
        </>
      );
    case "Saturation":
      return <path d="M8 17c5 0 4-7 9-7h4c5 0 4 7 9 7" />;
    case "Overdrive":
      return (
        <>
          <path d="M8 17h9.8l1-8H30" />
          <path className="patch-module-palette-icon-subtle" d="M18.8 9v8" />
          <path className="patch-module-palette-icon-whisper" d="M13 11l3 6m8-8l3 6" />
        </>
      );
    case "Compressor":
      return (
        <>
          <path d="M8 9l13 5-13 5" />
          <path d="M21 14h9" />
          <path className="patch-module-palette-icon-subtle" d="M10 11.6l9 2.4-9 2.4" />
        </>
      );
    default:
      return (
        <>
          <rect x="9" y="10" width="20" height="8" rx="1" />
          <path className="patch-module-palette-icon-cutout" d="M13 14h12" />
        </>
      );
  }
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
