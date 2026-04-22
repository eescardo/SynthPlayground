# Image Assets

This directory stores the app's authored SVG assets and the design rules that govern them.

## Icon System

- Functional UI icons use a `24x24` master grid with `viewBox="0 0 24 24"`.
- Brand and favicon source art use a `32x32` master grid with `viewBox="0 0 32 32"`.
- Keep UI icons single-color or simple flat fills. Reserve multi-color treatment for brand assets such as the sprout mark.

## Geometry

- UI icons: `safeInset: 2`, default stroke `1.75`, emphasis stroke `2`, `round` caps and joins.
- Brand icons: `safeInset: 3`, default stroke `2.25`, `round` caps and joins.
- Favor simple silhouettes that stay legible at `16px` toolbar scale.

## Render Targets

- Toolbar and navigation icons render at `16px`.
- The patch workspace nav icon renders at `17px`.
- The header brand mark renders at `20px`.
- Favicon exports should be reviewed separately at `16`, `32`, `48`, and `64` pixels.

## Palette

- Primary ink: `#E8F2FF`
- Accent blue: `#4FB8FF`
- Brand greens should stay adjacent to the current sprout palette.
- Avoid gradients or fine interior detail in small UI icons.

## Module Icon Semantics

- `VCO`: sine wave
- `LFO`: smaller or lower-energy sine wave
- `VCF`: response curve or cutoff slope
- `ADSR`: envelope graph
- `VCA`: gain or amplitude motif
- `Mixer`: sliders or stacked level bars
- `Output`: meter bars
- `Modulation`: connection line through a node or ring

See [iconTokens.ts](/Users/eddy/.codex/worktrees/ec67/SynthPlayground/src/resources/images/iconTokens.ts) for the same values in code-friendly form.
