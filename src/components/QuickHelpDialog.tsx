interface QuickHelpDialogProps {
  keyboardShortcuts: Array<{ action: string; shortcut: string }>;
  onClose: () => void;
  open: boolean;
}

export function QuickHelpDialog({ keyboardShortcuts, onClose, open }: QuickHelpDialogProps) {
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
            <p><strong>Add note:</strong> Click an empty track lane when nothing is selected.</p>
            <p><strong>Select notes:</strong> Drag a marquee across notes, or click an existing note.</p>
            <p><strong>Move note:</strong> Drag a note block horizontally.</p>
            <p><strong>Resize note:</strong> Drag near the right edge of a note block.</p>
            <p><strong>Delete note:</strong> Right-click a note block.</p>
            <p><strong>Change note pitch:</strong> Hover the pitch label and use the mouse wheel.</p>
            <p><strong>Timeline actions:</strong> Click the playhead or a loop marker to open timeline actions.</p>
          </div>
          <div className="quick-help-section">
            <h4>Keyboard</h4>
            <div className="quick-help-shortcuts" role="table" aria-label="Keyboard shortcuts">
              {keyboardShortcuts.map((entry) => (
                <div key={entry.action} className="quick-help-shortcut-row" role="row">
                  <div className="quick-help-shortcut-action" role="cell">{entry.action}</div>
                  <div className="quick-help-shortcut-keys" role="cell">
                    {entry.shortcut.split("+").map((part) => (
                      <kbd key={`${entry.action}-${part}`}>{part}</kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="muted">Press <kbd>Esc</kbd> to close this help panel.</p>
      </div>
    </div>
  );
}
