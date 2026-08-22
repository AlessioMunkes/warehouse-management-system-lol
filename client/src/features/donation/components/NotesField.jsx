// ─────────────────────────────────────────────────────────────
// features/donations/components/NotesField.jsx
// ─────────────────────────────────────────────────────────────
export function NotesField({ notes, onChange }) {
  return (
    <div className="stf-field">
      <span className="stf-field-label">Notes (optional)</span>
      <textarea
        className="stf-input is-text"
        style={{ minHeight: "88px", paddingTop: "12px", paddingBottom: "12px" }}
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Dropped off at 2pm, van reg CA 123-456"
      />
    </div>
  );
}