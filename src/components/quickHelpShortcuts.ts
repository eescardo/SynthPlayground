export const splitQuickHelpShortcutKeys = (shortcut: string): string[] =>
  shortcut.includes(" / ") ? [shortcut] : shortcut.split("+").filter((part) => part.length > 0);
