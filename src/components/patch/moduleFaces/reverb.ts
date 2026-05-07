import {
  clamp,
  clamp01,
  getNumericParam,
  getStringParam,
  ModuleFaceRenderer,
  PATCH_COLOR_ADSR_GRAPH_BORDER,
  PATCH_COLOR_NODE_SUBTITLE,
  PATCH_MODULE_FACE_BOTTOM_INSET,
  PATCH_MODULE_FACE_INSET_X,
  PATCH_MODULE_FACE_TOP,
  PATCH_NODE_HEIGHT,
  PATCH_NODE_WIDTH,
  setFaceLineWidth
} from "@/components/patch/moduleFaces/shared";

export const drawReverbModuleFace: ModuleFaceRenderer = (ctx, _patch, node, schema, x, y, accentColor) => {
  const graph = {
    x: x + PATCH_MODULE_FACE_INSET_X,
    y: y + PATCH_MODULE_FACE_TOP + 8,
    width: PATCH_NODE_WIDTH - PATCH_MODULE_FACE_INSET_X * 2,
    height: PATCH_NODE_HEIGHT - PATCH_MODULE_FACE_TOP - PATCH_MODULE_FACE_BOTTOM_INSET - 14
  };
  const mode = getStringParam(node, schema, "mode");
  const decay = clamp01(getNumericParam(node, schema, "decay"));
  const tone = clamp01(getNumericParam(node, schema, "tone"));
  const mix = clamp01(getNumericParam(node, schema, "mix"));
  const centerY = graph.y + graph.height * 0.52;
  const modeProfile =
    mode === "hall"
      ? { density: 18, tailPower: 0.58, spacing: 1.28, tint: "158, 192, 223", wiggle: 0.2 }
      : mode === "plate"
        ? { density: 22, tailPower: 0.56, spacing: 0.82, tint: "232, 214, 156", wiggle: 0.08 }
        : mode === "spring"
          ? { density: 13, tailPower: 0.72, spacing: 1.04, tint: "184, 222, 178", wiggle: 0.55 }
          : { density: 18, tailPower: 0.66, spacing: 0.86, tint: "158, 192, 223", wiggle: 0.28 };
  ctx.strokeStyle = PATCH_COLOR_ADSR_GRAPH_BORDER;
  setFaceLineWidth(ctx, 1);
  ctx.strokeRect(graph.x, graph.y, graph.width, graph.height);

  ctx.fillStyle = `rgba(${modeProfile.tint}, ${0.06 + mix * 0.1})`;
  ctx.fillRect(graph.x + 1, graph.y + 1, graph.width - 2, graph.height - 2);

  const tailRate = 0.7 + (1 - decay) * 4.6;
  const toneFlutter = 5 + tone * 15;
  const mainWaveValue = (t: number) => {
    const envelope = mix * Math.exp(-t * tailRate) * (0.22 + decay * 0.78);
    const toneLoss = 0.45 + tone * 0.55 - (1 - tone) * t * 0.32;
    const springBend = mode === "spring" ? Math.sin(t * Math.PI * 5.5) * 0.38 : 0;
    return Math.sin(t * Math.PI * (toneFlutter + springBend)) * envelope * toneLoss;
  };
  const mainCurvePoint = (t: number) => {
    const normalizedT = clamp01(t);
    return {
      x: graph.x + normalizedT * graph.width,
      y: centerY - mainWaveValue(normalizedT) * graph.height * 0.42
    };
  };
  ctx.strokeStyle = accentColor;
  setFaceLineWidth(ctx, 1.6);
  ctx.beginPath();
  for (let index = 0; index <= 96; index += 1) {
    const t = index / 96;
    const { x: px, y: py } = mainCurvePoint(t);
    if (index === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();

  let firstReflectionT = 0;
  const delaySpread = modeProfile.spacing * (0.58 + decay * 0.42);
  for (let echo = 0; echo < modeProfile.density; echo += 1) {
    const rawT = (echo + 1) / (modeProfile.density + 1);
    const t = Math.min(1, Math.pow(rawT, 1 / delaySpread));
    const tapX = graph.x + 7 + t * (graph.width - 14);
    const tapAmp = mix * Math.exp(-t * tailRate * modeProfile.tailPower) * (0.26 + decay * 0.74);
    if (echo === 0) {
      firstReflectionT = clamp01((tapX - graph.x) / graph.width);
    }
    ctx.strokeStyle = "rgba(231, 243, 255, 0.42)";
    setFaceLineWidth(ctx, 1.1);
    ctx.globalAlpha = clamp(tapAmp * (0.78 + tone * 0.36), 0.16, 0.66);
    ctx.beginPath();
    ctx.moveTo(tapX, centerY - tapAmp * graph.height * 0.38);
    ctx.lineTo(tapX, centerY + tapAmp * graph.height * 0.38);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(231, 243, 255, 0.5)";
  setFaceLineWidth(ctx, 1);
  ctx.globalAlpha = clamp(mix * (0.35 + decay * 0.3), 0.12, 0.55);
  ctx.beginPath();
  const firstReflectionX = graph.x + firstReflectionT * graph.width;
  const ghostCycles = 2.8 + tone * 5.4 + modeProfile.wiggle * 3.2;
  const ghostPhase = mode === "plate" ? Math.PI * 0.42 : mode === "spring" ? Math.PI * 0.68 : Math.PI * 0.24;
  for (let index = 0; index <= 96; index += 1) {
    const localT = index / 96;
    const px = firstReflectionX + localT * (graph.x + graph.width - 6 - firstReflectionX);
    const reflectionFade = Math.exp(-localT * (1.85 - decay * 0.7)) * (0.44 + decay * 0.32);
    const reflectionPhase = Math.sin(localT * Math.PI * ghostCycles + ghostPhase);
    const flutter = modeProfile.wiggle * Math.sin(localT * Math.PI * (2.4 + tone * 3.5) + ghostPhase * 0.5) * 0.16;
    const py = centerY - (reflectionPhase + flutter) * reflectionFade * graph.height * 0.16;
    if (index === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = PATCH_COLOR_NODE_SUBTITLE;
  ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.fillText(mode.toUpperCase(), graph.x, graph.y - 3);
  ctx.textAlign = "right";
  ctx.fillText(`${Math.round(decay * 100)}% decay`, graph.x + graph.width, graph.y - 3);
  ctx.fillText(`${Math.round(tone * 100)}% tone`, graph.x + graph.width, graph.y + graph.height + 10);
  ctx.textAlign = "left";
};
