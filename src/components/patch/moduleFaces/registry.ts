import { drawAdsrModuleFace } from "@/components/patch/moduleFaces/adsr";
import { drawCompressorModuleFace } from "@/components/patch/moduleFaces/compressor";
import { drawCvScalerModuleFace, drawCvTransposeModuleFace } from "@/components/patch/moduleFaces/cv";
import { drawDelayModuleFace } from "@/components/patch/moduleFaces/delay";
import { drawGenericModuleFace } from "@/components/patch/moduleFaces/generic";
import { drawKarplusStrongModuleFace } from "@/components/patch/moduleFaces/karplusStrong";
import { drawMixerModuleFace } from "@/components/patch/moduleFaces/mixer";
import { drawNoiseModuleFace } from "@/components/patch/moduleFaces/noise";
import { drawVcoModuleFace, drawLfoModuleFace } from "@/components/patch/moduleFaces/oscillators";
import { drawOverdriveModuleFace } from "@/components/patch/moduleFaces/overdrive";
import { drawReverbModuleFace } from "@/components/patch/moduleFaces/reverb";
import { drawSaturationModuleFace } from "@/components/patch/moduleFaces/saturation";
import { ModuleFaceRenderer, resolveConnectedInputPortIds } from "@/components/patch/moduleFaces/shared";
import { drawVcaModuleFace } from "@/components/patch/moduleFaces/vca";
import { drawVcfModuleFace } from "@/components/patch/moduleFaces/vcf";

export const moduleFaceRenderers: Record<string, ModuleFaceRenderer> = {
  ADSR: drawAdsrModuleFace,
  VCO: drawVcoModuleFace,
  LFO: drawLfoModuleFace,
  KarplusStrong: drawKarplusStrongModuleFace,
  VCF: drawVcfModuleFace,
  VCA: drawVcaModuleFace,
  Noise: drawNoiseModuleFace,
  Delay: drawDelayModuleFace,
  Reverb: drawReverbModuleFace,
  Saturation: drawSaturationModuleFace,
  Overdrive: drawOverdriveModuleFace,
  Compressor: drawCompressorModuleFace,
  CVTranspose: drawCvTransposeModuleFace,
  CVScaler: drawCvScalerModuleFace,
  Mixer4: (ctx, patch, node, schema, x, y, accentColor) =>
    drawMixerModuleFace(ctx, node, schema, x, y, accentColor, 4, resolveConnectedInputPortIds(patch, node.id)),
  CVMixer4: (ctx, patch, node, schema, x, y, accentColor) =>
    drawMixerModuleFace(ctx, node, schema, x, y, accentColor, 4, resolveConnectedInputPortIds(patch, node.id))
};

export const fallbackModuleFaceRenderer = drawGenericModuleFace;
