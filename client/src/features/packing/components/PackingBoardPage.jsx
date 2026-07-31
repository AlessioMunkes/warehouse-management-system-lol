// client/src/features/packing/PackingBoardPage.jsx
import { useEffect, useState } from 'react';
import {pickingApi}  from '../../../services/pickingAPI';
import FilterBar from './FilterBar';
import SlipCard from './SlipCard';
import PageHeader from './PageHeader';
import TaskNavGrid from './TaskNavGrid';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';

export default function PackingBoardPage({ user, onOpenSlip }) {
  const [filters, setFilters] = useState({ dispatchDate: '', cohort: '', status: '', mine: '' });
  const [slips, setSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState(null);
  const navigate = useNavigate();
    const { logout } = useAuth();
  const isManager = user?.role === 'manager' || user?.role === 'admin';

useEffect(() => {
  async function fetchSlips() {
    setLoading(true);
    setError(null);

    try {
      const data = await pickingApi.listSlips(filters);
      setSlips(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  fetchSlips();
}, [filters]);


 const handleLogout = async () => {
  await logout();
  navigate('/login');
};
  

 const handleClaim = async (slipId) => {
  try {
    await pickingApi.assignSlip(slipId);

    const data = await pickingApi.listSlips(filters);
    setSlips(data);
  } catch (err) {
    setError(err.message);
  }
};

  return (
    
    <div className="page-light">
      <PageHeader showBack onLogout={handleLogout} />
      <TaskNavGrid />
    <div className="packing-board">
      <header className="packing-board__header">
        <h1>Packing</h1>
        <p>Claim a pallet, confirm what's packed, flag what's short.</p>
      </header>
      </div>
      

      <FilterBar filters={filters} onChange={setFilters} isManager={isManager} />

      

      {loading ? (
        <div className="packing-board__empty">Loading pallets…</div>
      ) : slips.length === 0 ? (
        <div className="packing-board__empty">
          No picking slips match these filters. Try a different dispatch date.
        </div>
      ) : (
        <div className="packing-board__grid">
          {slips.map((slip) => (
            <SlipCard
              key={slip.id}
              slip={slip}
              currentUserId={user.id}
              onOpen={onOpenSlip}
              onClaim={handleClaim}
            />
          ))}
        </div>
      )}
    </div>
  );
}