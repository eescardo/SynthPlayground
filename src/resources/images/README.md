# Image Assets

This directory stores authored SVG assets that are imported by the app through `src/resources/images/index.ts`.

## Current Assets

- `brand-sprout.svg`: the primary brand mark. It uses a `64x64` source canvas and may keep the richer green gradient treatment.
- `brand-sprout-favicon.svg`: favicon-oriented variant of the brand mark. Review it at small sizes when changing the sprout geometry or palette.
- `patch-workspace.svg`: patch workspace navigation mark. Its multicolor gradient treatment is intentional and may stay richer than ordinary UI icons.
- `composer-note.svg`: composer navigation mark. It is a simple flat-fill musical note.
- `back-arrow.svg`: utility navigation icon. It should remain plain, compact, and easy to read.

## Default Direction

- Prefer SVG for crisp UI and brand assets.
- Functional UI icons should usually use a `24x24` master grid with `viewBox="0 0 24 24"`.
- Brand marks can use a larger source canvas when it improves rendering or export quality; the current sprout source uses `64x64`.
- Favor simple silhouettes that stay legible at `16px` to `20px`.
- Use rounded caps and joins for stroked line art unless a sharper shape is part of the concept.
- Keep utility icons single-color or simple flat fills by default.

## Color And Detail

- Keep the general icon palette muted and compatible with the app chrome.
- Useful baseline colors are `#E8F2FF` for light ink, `#4FB8FF` for cool accents, and the current sprout greens for brand moments.
- Avoid gradients, tiny interior details, and high-contrast multicolor treatment in ordinary utility icons.
- Exceptions are fine when they serve a clear purpose, improve recognition, or simply make a focal icon look better. The sprout mark and patch workspace icon are current examples where richer treatment is acceptable.

## Adding Or Changing Assets

- Add new source files here and export their URLs from `index.ts`.
- Check each asset at the sizes where the app renders it, not only at source size.
- Keep icon-specific constants in nearby component code unless multiple assets actually need shared generated tokens.
- Do not add code-only token modules for documentation values unless the app or tests consume them.

## Future Module Icon Semantics

If patch module icons become authored SVGs, use consistent metaphors:

- `VCO`: sine wave
- `LFO`: smaller or lower-energy sine wave
- `VCF`: response curve or cutoff slope
- `ADSR`: envelope graph
- `VCA`: gain or amplitude motif
- `Mixer`: sliders or stacked level bars
- `Output`: meter bars
- `Modulation`: connection line through a node or ring
