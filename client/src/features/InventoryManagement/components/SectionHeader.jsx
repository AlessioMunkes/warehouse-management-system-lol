export default function SectionHeader({ title, subtitle, inlineHeadingStyle = null }) {
  return (
    <div className="page-title-row">
      <h1
        className={inlineHeadingStyle ? undefined : "programme-select-heading"}
        style={inlineHeadingStyle || undefined}
      >
        {title}
      </h1>
      {subtitle && <p className="form-helper-text">{subtitle}</p>}
    </div>
  );
}