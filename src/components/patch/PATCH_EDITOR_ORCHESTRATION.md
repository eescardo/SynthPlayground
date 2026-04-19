# Patch Editor Orchestration

This note describes how the patch editor is organized today, with a focus on
component responsibilities and where orchestration lives.

## Top-Level Shape

The patch editor is split into a few layers:

- `ProjectWorkspaceController`
- `PatchWorkspaceView`
- `InstrumentEditor`
- `PatchEditorCanvas`
- `PatchEditorStage`
- focused subcomponents like `PatchProbeOverlay`, `PatchInspector`, and `PatchMacroPanel`

The general flow is:

1. `AppRoot` owns project-level app state and instantiates `usePatchWorkspaceState`.
2. `ProjectWorkspaceController` and `useProjectWorkspaceController` assemble the patch-workspace view props plus focused workspace contexts for transport, clipboard, sample assets, and instrument actions.
3. `PatchWorkspaceView` passes the selected patch/editor state into `InstrumentEditor`.
4. `InstrumentEditor` combines patch-level controls with the canvas editor.
5. `PatchEditorCanvas` coordinates canvas-local concerns and lays out the main editor regions.
6. `PatchEditorStage` owns the actual interactive patch canvas stage.

## Workspace Context

`ProjectWorkspaceProvider` exposes four focused contexts instead of one monolithic workspace object:

- transport
- clipboard
- sample assets
- instrument actions/state

These are memoized independently in `useProjectWorkspaceController` so consumers only rerender when their specific workspace dependency changes.

The public workspace boundary is intentionally broader than the patch route name. `ProjectWorkspace...` is the project-side workspace surface, while `PatchWorkspaceView` remains the concrete patch-editing screen within that workspace.

## Responsibilities

### `ProjectWorkspaceController`

Owns the workspace boundary for the patch editor route:

- calling `useProjectWorkspaceController`
- providing focused workspace contexts
- rendering `PatchWorkspaceView` with its view-only props

It should stay thin and should not absorb patch-editor behavior directly.

### `PatchWorkspaceView`

Owns patch-workspace shell concerns:

- workspace header and navigation
- tab strip
- help dialog
- passing the active patch/editor session into `InstrumentEditor`

It should not contain detailed patch-canvas interaction logic.

### `InstrumentEditor`

Owns instrument-editor level composition:

- instrument toolbar
- migration/invalid warnings
- handoff into `PatchEditorCanvas`

It is the bridge between patch-workspace concerns and the patch editing surface,
but it should stay fairly thin.

### `PatchEditorCanvas`

Owns patch-editor page layout and canvas-adjacent coordination:

- main column vs inspector layout
- macro panel placement
- selected node/schema resolution
- selected macro-node highlighting
- composing `PatchEditorStage`, `PatchMacroPanel`, and `PatchInspector`

It should not own detailed probe drawing or low-level canvas interaction logic.

### `PatchEditorStage`

This is the main patch-canvas orchestration component.

It owns:

- canvas zoom setup
- node-face popover management via `usePatchModuleFacePopover`
- patch-canvas pointer interactions via `usePatchCanvasInteractions`
- toolbar actions like add/delete/auto-layout
- probe drag handling
- canvas cursor state
- rendering the probe overlay on top of the canvas


### `PatchProbeOverlay`

Owns probe rendering in both collapsed and expanded in-place treatments:

- probe cards
- probe connection lines
- scope rendering
- spectrum rendering
- probe card gestures for click-to-expand and drag initiation


### `PatchInspector`

Owns the inspector shell and selection-based editor content:

- module parameter editing
- macro binding details for selected modules
- validation and connection summaries
- embedding the probe-specific inspector section

### `ProbeInspectorSection`

Owns probe-specific inspector UI:

- probe attachment status
- expanded-state messaging
- spectrum controls like window and frequency view
- scope/spectrum descriptive help text

This keeps probe-specific UI from bloating the general inspector component.

## Probe-Specific State

Probe editor data is now grouped into two abstractions:

- `PatchProbeEditorState`
- `PatchProbeEditorActions`

These reduce prop spray across the editor stack.

### `PatchProbeEditorState`

Carries probe-facing state such as:

- `probes`
- `selectedProbeId`
- `previewCaptureByProbeId`
- `previewProgress`
- canvas-local `attachingProbeId` when composed for stage rendering

### `PatchProbeEditorActions`

Carries probe mutations such as:

- add
- move
- select
- update target
- update spectrum window
- update frequency view
- toggle expanded
- delete selected probe

### `usePatchProbeEditorState`

Owns the remaining canvas-local probe coordination:

- attach-mode lifecycle
- selected-probe lookup from `selectedProbeId`
- composing `canvasProbeState` with local attach state

This keeps `PatchEditorCanvas` from accumulating probe-specific local state and
bookkeeping.

## Lower-Level Helpers

### `usePatchCanvasInteractions`

Owns low-level pointer interaction behavior for the node canvas:

- node dragging
- wire creation
- attach-target hovering
- probe-target attachment handling

### `usePatchModuleFacePopover`

Despite the broader stage rename, this hook still specifically manages
node-face popover state:

- which node face popover is open
- whether a popover should toggle/open/close

It is still accurate at the hook level because its responsibility is narrowly
about module face popovers, not the entire patch editor stage.

### `probeViewMath.ts`

Owns pure probe rendering math:

- scope render-data shaping
- scope time markers
- spectrum frequency markers
- display formatting helpers for probe graphs

This lets probe visuals evolve with less logic embedded directly in React view
components.

## Current Mental Model

If you are looking for:

- workspace boundary and context assembly: `ProjectWorkspaceController` / `useProjectWorkspaceController`
- workspace-level shell orchestration: `PatchWorkspaceView`
- instrument-editor composition: `InstrumentEditor`
- page layout and selected-entity wiring: `PatchEditorCanvas`
- canvas stage behavior: `PatchEditorStage`
- probe visuals: `PatchProbeOverlay`
- probe inspector controls: `ProbeInspectorSection`
- pure probe graph math: `probeViewMath.ts`

## Likely Future Cleanup

If the patch editor keeps growing, the next likely extraction points are:

- splitting `PatchProbeOverlay` into dedicated scope/spectrum graph components
- renaming `usePatchModuleFacePopover` to something like `usePatchNodeFacePopover`
- introducing a dedicated toolbar view-model instead of passing raw selection
  state into `PatchEditorToolbar`
