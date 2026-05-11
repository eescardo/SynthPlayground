# CSS Migration Notes

`app/globals.css` is now the compatibility layer for legacy global component
classes. New component styles should prefer CSS Modules next to the component
that owns the markup.

Keep these files global:

- `base.css`: design tokens, document reset, and native form element defaults.
- `app-shell.css`: root app/loading layout classes used by the Next shell.
- `feedback.css`: small shared status text utilities used across editor panes.

When migrating a component:

1. Create `ComponentName.module.css` beside the component.
2. Move only selectors owned by that component.
3. Keep shared CSS custom properties in `base.css` or pass them through inline
   style variables when they are instance-specific.
4. Leave canvas drawing colors in TypeScript constants unless they are also used
   by DOM markup.
5. Run the relevant UI capture for layout-sensitive editor surfaces.
