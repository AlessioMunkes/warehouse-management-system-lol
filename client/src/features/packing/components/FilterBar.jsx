// client/src/features/packing/components/FilterBar.jsx


export default function FilterBar({ filters, onChange, isManager }) {
  const set = (key) => (e) => onChange({ ...filters, [key]: e.target.value });

  return (
    <div className="filter-bar">
      <div className="filter-bar__field">
        <label htmlFor="dispatchDate">Dispatch date</label>
        <input
          id="dispatchDate"
          type="date"
          value={filters.dispatchDate || ''}
          onChange={set('dispatchDate')}
        />
      </div>

      <div className="filter-bar__field">
        <label htmlFor="cohort">Cohort</label>
        <select id="cohort" value={filters.cohort || ''} onChange={set('cohort')}>
          <option value="">All cohorts</option>
          <option value="week1">Week 1</option>
          <option value="week2">Week 2</option>
        </select>
      </div>

      <div className="filter-bar__field">
        <label htmlFor="status">Status</label>
        <select id="status" value={filters.status || ''} onChange={set('status')}>
          <option value="">Any status</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In progress</option>
          <option value="complete">Complete</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {!isManager && (
        <label className="filter-bar__toggle">
          <input
            type="checkbox"
            checked={filters.mine === 'true'}
            onChange={(e) => onChange({ ...filters, mine: e.target.checked ? 'true' : '' })}
          />
          My pallets only
        </label>
      )}
    </div>
  );
}