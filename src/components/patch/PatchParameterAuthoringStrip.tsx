import { ParamMacroControl } from "@/components/patch/PatchInspectorControls";
import { MacroBinding, PatchMacro } from "@/types/patch";

interface PatchParameterAuthoringStripProps {
  activeBinding?: MacroBinding;
  activeBindingMacro?: PatchMacro;
  authoringCopy: string;
  canBindToMacro: boolean;
  disabled?: boolean;
  macros: PatchMacro[];
  nextIndex: number | null;
  previousIndex: number | null;
  shouldRenderMacroControl: boolean;
  onBindExisting: (macroId: string) => void;
  onBindNew: () => void;
  onNavigateToKeyframe: (keyframeIndex: number | null) => void;
  onSetBindingMap: (map: "linear" | "exp") => void;
  onUnbind: () => void;
}

export function PatchParameterAuthoringStrip(props: PatchParameterAuthoringStripProps) {
  return (
    <div className="param-authoring-strip">
      <span className="param-authoring-copy">{props.authoringCopy}</span>
      <span className="param-authoring-actions">
        {props.activeBindingMacro && props.canBindToMacro && (
          <>
            <button
              type="button"
              className="param-keyframe-nav-button"
              disabled={props.previousIndex === null || props.disabled}
              onClick={() => props.onNavigateToKeyframe(props.previousIndex)}
            >
              Prev
            </button>
            <button
              type="button"
              className="param-keyframe-nav-button"
              disabled={props.nextIndex === null || props.disabled}
              onClick={() => props.onNavigateToKeyframe(props.nextIndex)}
            >
              Next
            </button>
          </>
        )}
        {props.shouldRenderMacroControl && (
          <ParamMacroControl
            disabled={props.disabled || (!props.canBindToMacro && !props.activeBindingMacro)}
            bindingMacro={props.activeBindingMacro}
            bindingMap={props.activeBinding?.map}
            showBindingMap={props.canBindToMacro}
            macros={props.macros}
            onBindNew={props.onBindNew}
            onBindExisting={props.onBindExisting}
            onSetBindingMap={props.onSetBindingMap}
            onUnbind={props.onUnbind}
          />
        )}
      </span>
    </div>
  );
}
