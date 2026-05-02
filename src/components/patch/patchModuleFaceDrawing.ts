import { fallbackModuleFaceRenderer, moduleFaceRenderers } from "@/components/patch/moduleFaces/registry";
import { withFaceStrokeScale } from "@/components/patch/moduleFaces/shared";
import { Patch, PatchNode, ModuleTypeSchema } from "@/types/patch";

export { envelopeCurveProgress } from "@/components/patch/moduleFaces/adsr";
export { compressorCompressedOutputDb, compressorOutputDb } from "@/components/patch/moduleFaces/compressor";
export {
  applyOverdriveTone,
  overdriveDriveAmount,
  overdriveToneAlpha,
  overdriveToneResponse,
  overdriveTransfer,
  overdriveWetShape
} from "@/components/patch/moduleFaces/overdrive";
export {
  VCF_FACE_NYQUIST_HZ,
  VCF_FACE_SAMPLE_RATE_HZ,
  vcfMagnitudeAtFrequency
} from "@/components/patch/moduleFaces/vcf";

export function drawPatchModuleFaceContent(
  ctx: CanvasRenderingContext2D,
  patch: Patch,
  node: PatchNode,
  schema: ModuleTypeSchema,
  x: number,
  y: number,
  accentColor: string,
  options: { expanded?: boolean } = {}
) {
  withFaceStrokeScale(options.expanded === true, () => {
    const renderer = moduleFaceRenderers[node.typeId] ?? fallbackModuleFaceRenderer;
    renderer(ctx, patch, node, schema.params, x, y, accentColor, options);
  });
}
