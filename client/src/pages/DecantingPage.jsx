// ─────────────────────────────────────────────────────────────
// src/pages/DecantingPage.jsx
//
// One route, two shapes, picked by role — there is no /staff/decanting
// (see routes/paths.js). A manager gets the week planner
// (DecantingPlanner, the old body of this file, moved verbatim into
// features/decanting/components). Everyone else gets the phone flow
// for one sack at a time (DecantingFlow). Both call the same
// endpoints, so neither can drift from the other's arithmetic.
//
// Products are fetched once, here, and passed down as a prop — both
// modes need the list and neither should fetch its own copy.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

import PageHeader from '../features/decanting/components/PageHeader';
import TaskNavGrid from '../features/decanting/components/TaskGrid';
import DecantingPlanner from '../features/decanting/components/DecantingPlanner';
import DecantingFlow from '../features/decanting/components/DecantingFlow';
import StaffShell from '../components/layout/StaffShell';
import { getProducts } from '../services/decantingAPI';

const isManager = (user) => user?.role === 'manager' || user?.role === 'admin';

const DecantingPage = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [products, setProducts] = useState([]);
  const [stepLabel, setStepLabel] = useState('What you are working with');
  const handleCrumb = useCallback((label) => setStepLabel(label), []);

  // NOTE: reusing the procurement products endpoint as a stopgap —
  // decanting.service.js has getDecantableProducts commented out, so
  // this shows all products, not just decantable ones, until that's
  // fixed backend-side. Not something to fix here — just a known limit.
  useEffect(() => {
    getProducts().then(setProducts).catch((err) => console.error('Failed to load products:', err));
  }, []);

  if (isManager(user)) {
    const handleLogout = async () => {
      await logout();
      navigate('/login');
    };

    return (
      <div className="page-light">
        <PageHeader showBack onLogout={handleLogout} onInfo={() => navigate('/programmes/noc/info')} />
        <main className="decanting-content">
          <TaskNavGrid />
          <DecantingPlanner products={products} />
        </main>
      </div>
    );
  }

  return (
    <StaffShell crumb={`Decanting / ${stepLabel}`} meta="This week">
      <DecantingFlow products={products} onCrumbChange={handleCrumb} />
    </StaffShell>
  );
};

export default DecantingPage;
