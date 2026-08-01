// src/components/StatCard.jsx

const StatCard = ({ label, value }) => (
  <div className="stat-card">
    <p className="stat-card-label">{label}</p>
    <p className="stat-card-value">{value}</p>
  </div>
);
<div className="stat-card-grid">
  <StatCard label="Total required" value="0kg" />
  <StatCard label="Total packed" value="0kg" />
  <StatCard label="Total bags" value="0" />
  <StatCard label="Surplus" value="—" />
  <StatCard label="Shortfall" value="—" />
</div>

export default StatCard;