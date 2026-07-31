// Label + control + helper text + error, wired consistently so every
// form in the app (adjust stock, delivery notes, decanting) looks and
// behaves the same way.
export default function FormField({
  id,
  label,
  helperText,
  error,
  as = "input", // "input" | "select" | "textarea"
  children, // <option> list, only used when as="select"
  ...controlProps
}) {
  const controlClassName =
    as === "select"
      ? "form-select"
      : as === "textarea"
      ? "form-input reason-picker-textarea"
      : "form-input";

  const Control = as;

  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      <Control id={id} className={controlClassName} {...controlProps}>
        {children}
      </Control>
      {helperText && <p className="form-helper-text">{helperText}</p>}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}