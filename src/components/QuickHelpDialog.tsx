import type { ReactNode } from "react";

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
  children?: ReactNode;
  onClose: () => void;
  open: boolean;
}

export function QuickHelpDialog({ children, keyboardShortcutSections, mouseHelpItems, onClose, open }: QuickHelpDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="help-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="help-modal quick-help-modal" onClick={(event) => event.stopPropagation()}>
        <h3>Quick Help</h3>
        <div className="quick-help-grid">
          <div className="quick-help-section">
            <h4>Mouse</h4>
            {mouseHelpItems.map((entry) => (
              <p key={entry.action}>
                <strong>{entry.action}:</strong> {entry.description}
              </p>
            ))}
          </div>
          <div className="quick-help-section">
            <h4>Keyboard</h4>
            {keyboardShortcutSections.map((section) => (
              <div key={section.title} className="quick-help-shortcut-section">
                <h5>{section.title}</h5>
                <div className="quick-help-shortcuts" role="table" aria-label={`${section.title} keyboard shortcuts`}>
                  {section.entries.map((entry) => (
                    <div key={`${section.title}-${entry.action}`} className="quick-help-shortcut-row" role="row">
                      <div className="quick-help-shortcut-action" role="cell">{entry.action}</div>
                      <div className="quick-help-shortcut-keys" role="cell">
                        {entry.shortcut.split("+").map((part) => (
                          <kbd key={`${section.title}-${entry.action}-${part}`}>{part}</kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        {children}
        <p className="muted">Press <kbd>Esc</kbd> to close this help panel.</p>
      </div>
    </div>
  );
}
