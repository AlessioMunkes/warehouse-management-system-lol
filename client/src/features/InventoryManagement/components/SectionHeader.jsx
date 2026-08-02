export default function SectionHeader({ title, subtitle }) {
  return (
    <div className="page-section-title">
      <h1 className="page-section-title-heading">{title}</h1>
      {subtitle && <p className="page-section-title-subtitle">{subtitle}</p>}
    </div>
  );
}