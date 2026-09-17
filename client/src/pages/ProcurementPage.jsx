// ─────────────────────────────────────────────────────────────
// src/pages/ProcurementPage.jsx
//
// One route, two shapes, picked by role — same pattern as
// DecantingPage.jsx. A manager gets the existing procurement
// dashboard (ProcurementDashboard); everyone else gets the phone
// receiving wizard (ReceivingPage). Both live at STAFF.receiving
// ("/noc/procurement"), so every chooser screen that links there
// reaches the right shape without needing to know who's logged in.
// ─────────────────────────────────────────────────────────────
import { useAuth } from '../context/AuthContext';
import ProcurementDashboard from './ProcurementDashboard';
import ReceivingPage from './ReceivingPage';

const isManager = (user) => user?.role === 'manager' || user?.role === 'admin';

export default function ProcurementPage() {
  const { user } = useAuth();
  return isManager(user) ? <ProcurementDashboard /> : <ReceivingPage />;
}
