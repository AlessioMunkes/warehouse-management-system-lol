// ─────────────────────────────────────────────────────────────
// src/pages/PackingSelectPage.jsx
//
// One route, two shapes, picked by role — same pattern as
// DecantingPage.jsx. A manager gets the existing packing board
// (PackingPage); everyone else gets the packer's own board and
// pallet flow (PackingStaffPage). Both live at PACKING.board /
// PACKING.detailPattern, so every chooser screen and every
// TaskNavGrid tile that links there reaches the right shape without
// needing to know who's logged in.
// ─────────────────────────────────────────────────────────────
import { useAuth } from '../context/AuthContext';
import PackingPage from './PackingPage';
import PackingStaffPage from './PackingStaffPage';

const isManager = (user) => user?.role === 'manager' || user?.role === 'admin';

export default function PackingSelectPage() {
  const { user } = useAuth();
  return isManager(user) ? <PackingPage /> : <PackingStaffPage />;
}
