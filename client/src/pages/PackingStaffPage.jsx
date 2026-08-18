// ─────────────────────────────────────────────────────────────
// client/src/pages/PackingStaffPage.jsx
//
// The packer's packing task: their own pallets, then one pallet at a
// time. Reads :slipId from the URL to decide which, the same way
// PackingPage.jsx does, and navigates with the shared PACKING paths
// so the route table and this file cannot drift apart.
//
// PackingPage.jsx is left in place for the manager's board view.
// ─────────────────────────────────────────────────────────────
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PACKING } from '../routes/paths';
import StaffShell from '../components/layout/StaffShell';
import StaffSlipList from '../features/packing/components/StaffSlipList';
import StaffSlipFlow from '../features/packing/components/StaffSlipFlow';

export default function PackingStaffPage() {
  const { slipId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const backToList = () => navigate(PACKING.staffBoard);

  return (
    <StaffShell
      crumb={slipId ? 'Packing / this pallet' : 'Packing'}
      meta={slipId ? `Pallet ${slipId}` : 'Your pallets'}
      onBack={slipId ? backToList : undefined}
      backLabel="Your pallets"
    >
      {slipId ? (
        <StaffSlipFlow
          slipId={slipId}
          onBack={backToList}
          onFinished={backToList}
        />
      ) : (
        <StaffSlipList
          currentUser={user}
          onOpenSlip={(id) => navigate(PACKING.staffDetail(id))}
        />
      )}
    </StaffShell>
  );
}
