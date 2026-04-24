import type { ReactNode } from "react";
import { splitQuickHelpShortcutKeys } from "@/components/quickHelpShortcuts";

export interface QuickHelpShortcutEntry {
  action: string;
  shortcut: string;
}

export interface QuickHelpShortcutSection {
  title: string;
  entries: QuickHelpShortcutEntry[];
}

interface QuickHelpDialogProps {
  mouseHelpItems: Array<{ action: string; description: string }>;
  keyboardShortcutSections: QuickHelpShortcutSection[];
  keyboardLayout?: "single" | "two-column";
  children?: ReactNode;
  onClose: () => void;
  open: boolean;
}

function KeyboardHelpSection({
  keyboardLayout = "single",
  keyboardShortcutSections
}: Pick<QuickHelpDialogProps, "keyboardLayout" | "keyboardShortcutSections">) {
  return (
    <div className={`quick-help-section quick-help-keyboard-section quick-help-keyboard-${keyboardLayout}`}>
      <h4>Keyboard</h4>
      {keyboardShortcutSections.map((section) => (
        <div key={section.title} className="quick-help-shortcut-section">
          <h5>{section.title}</h5>
          <div className="quick-help-shortcuts" role="table" aria-label={`${section.title} keyboard shortcuts`}>
            {section.entries.map((entry) => (
              <div key={`${section.title}-${entry.action}`} className="quick-help-shortcut-row" role="row">
                <div className="quick-help-shortcut-action" role="cell">{entry.action}</div>
                <div className="quick-help-shortcut-keys" role="cell">
                  {splitQuickHelpShortcutKeys(entry.shortcut).map((part, index) => (
                    <kbd key={`${section.title}-${entry.action}-${index}-${part}`}>{part}</kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MouseHelpSection({ mouseHelpItems }: Pick<QuickHelpDialogProps, "mouseHelpItems">) {
  return (
    <div className="quick-help-section quick-help-mouse-section">
      <h4>Mouse</h4>
      {mouseHelpItems.map((entry) => (
        <p key={entry.action}>
          <strong>{entry.action}:</strong> {entry.description}
        </p>
      ))}
    </div>
  );
}

export function QuickHelpDialog({
  children,
  keyboardLayout = "single",
  keyboardShortcutSections,
  mouseHelpItems,
  onClose,
  open
}: QuickHelpDialogProps) {
  if (!open) {
    return null;
  }

  const keyboardFirst = keyboardLayout === "two-column";

  return (
    <div className="help-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="help-modal quick-help-modal" onClick={(event) => event.stopPropagation()}>
        <h3>Quick Help</h3>
        <div className={keyboardFirst ? "quick-help-grid quick-help-grid-keyboard-first" : "quick-help-grid"}>
          {keyboardFirst ? (
            <>
              <KeyboardHelpSection keyboardLayout={keyboardLayout} keyboardShortcutSections={keyboardShortcutSections} />
              <MouseHelpSection mouseHelpItems={mouseHelpItems} />
            </>
          ) : (
            <>
              <MouseHelpSection mouseHelpItems={mouseHelpItems} />
              <KeyboardHelpSection keyboardLayout={keyboardLayout} keyboardShortcutSections={keyboardShortcutSections} />
            </>
          )}
        </div>
        {children}
        <p className="muted">Press <kbd>Esc</kbd> to close this help panel.</p>
      </div>
    </div>
  );
}
