import { getMacroBindingKeyframeCount } from "@/lib/patch/macroKeyframes";
import { presetPatches } from "@/lib/patch/presets";
import { validatePatch } from "@/lib/patch/validation";

const errors: string[] = [];

for (const patch of presetPatches) {
  if (patch.layout.nodes.length > 0) {
    errors.push(`Preset ${patch.id} should not include saved layout nodes; bundled presets are auto-laid out.`);
  }
  if (patch.ui.canvasZoom !== undefined) {
    errors.push(`Preset ${patch.id} should not include saved canvas zoom; bundled presets use editor defaults.`);
  }
  if (patch.ui.paramRanges !== undefined) {
    errors.push(`Preset ${patch.id} should not include saved parameter slider ranges; use module schema ranges.`);
  }

  for (const macro of patch.ui.macros) {
    const bindingCounts = macro.bindings.map(getMacroBindingKeyframeCount);
    const maxBindingCount = Math.max(2, ...bindingCounts);

    if (macro.keyframeCount !== maxBindingCount) {
      errors.push(
        `Preset ${patch.id} macro ${macro.id} declares keyframeCount=${macro.keyframeCount} but bindings imply ${maxBindingCount}.`
      );
    }

    for (const binding of macro.bindings) {
      const bindingCount = getMacroBindingKeyframeCount(binding);
      if (bindingCount !== macro.keyframeCount) {
        errors.push(
          `Preset ${patch.id} macro ${macro.id} binding ${binding.id} has ${bindingCount} keyframes but macro declares ${macro.keyframeCount}.`
        );
      }
    }
  }

  const validation = validatePatch(patch);
  if (!validation.ok) {
    for (const issue of validation.issues) {
      errors.push(`Preset ${patch.id} failed validation: ${issue.level}: ${issue.message}`);
    }
  }
}

if (errors.length > 0) {
  console.error("Preset definition check failed:\n");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Preset definition check passed for ${presetPatches.length} bundled presets.`);
