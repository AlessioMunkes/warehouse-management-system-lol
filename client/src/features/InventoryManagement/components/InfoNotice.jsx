// Inline banner used for success/info/warning/error messages after an
// action (e.g. "Adjustment saved."). `tone` maps to the existing
// notice/alert classes.
const TONE_CLASS = {
  info: "info-notice",
  warning: "discrepancy-notice",
  error: "alert-error",
};

export default function InfoNotice({ tone = "info", children }) {
  const className = TONE_CLASS[tone] ?? TONE_CLASS.info;
  return (
    <div className={className}>
      <p>{children}</p>
    </div>
  );
}