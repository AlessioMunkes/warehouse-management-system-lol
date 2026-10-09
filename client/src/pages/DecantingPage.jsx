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
import { Link } from 'react-router-dom';

import DecantingFlow from '../features/decanting/components/DecantingFlow';
import StaffShell from '../components/layout/StaffShell';
import { getProducts } from '../services/decantingAPI';
import { STAFF } from '../routes/paths';


const DecantingPage = () => {

  const [products, setProducts] = useState([]);
  const [step, setStep] = useState({ label: 'What you are working with', step: 1, total: 2 });
  const handleCrumb = useCallback((next) => setStep(next), []);

  // Only products marked decantable (decantingAPI.getProducts).
  useEffect(() => {
    getProducts().then(setProducts).catch((err) => console.error('Failed to load products:', err));
  }, []);

  return (
    <StaffShell
      crumb={`Decanting / ${step.label}`}
      progress={step.step ? { step: step.step, total: step.total } : null}
      actions={
        <Link to={STAFF.decantingRecords} className="stf-crumb-link">
          <i className="ti ti-history" aria-hidden="true" />
          <span>History</span>
        </Link>
      }
    >
      <DecantingFlow products={products} onCrumbChange={handleCrumb} />
    </StaffShell>
  );
};

export default DecantingPage;
