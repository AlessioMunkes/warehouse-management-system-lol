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
import { useT } from '../translations';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PACKING } from '../routes/paths';
import StaffShell from '../components/layout/StaffShell';
import StaffSlipList from '../features/packing/StaffSlipList';
import StaffSlipFlow from '../features/packing/StaffSlipFlow';

export default function PackingStaffPage() {
  const { slipId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const backToList = () => navigate(PACKING.board);

  const t = useT();
  return (
    <StaffShell
      crumb={slipId ? `${t('packing.title')} / ${t('slip.thisPallet')}` : t('packing.title')}
      meta={slipId ? t('slip.palletNo', { id: slipId }) : t('slip.yourPallets')}
      onBack={slipId ? backToList : undefined}
      backLabel={t('slip.yourPallets')}
    >
      {slipId ? (
        <StaffSlipFlow
          currentUser={user}
          slipId={slipId}
          onBack={backToList}
          onFinished={backToList}
        />
      ) : (
        <StaffSlipList
          currentUser={user}
          onOpenSlip={(id) => navigate(PACKING.detail(id))}
        />
      )}
    </StaffShell>
  );
}
