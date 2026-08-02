// PackingPage.jsx
// Top-level routed page for Packing. Reads :slipId from the URL
// to decide whether to show the board or the detail view, and
// wires in the existing PageHeader / TaskNavGrid rather than
// duplicating any of that chrome here.

import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PageHeader from "../features/packing/components/PageHeader";
import TaskNavGrid from "../features/packing/components/TaskNavGrid";
import PackingBoard from "../features/packing/components/PackingBoard";
import PackingDetail from "../features/packing/components/PackingDetail";

const BOARD_PATH = "/programmes/noc/packing";

export default function PackingPage() {
  const { slipId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <div className="page-light">
      <PageHeader onLogout={logout} showBack={true} />

      {!slipId && <TaskNavGrid />}

      {slipId ? (
        <PackingDetail
          currentUser={user}
          slipId={slipId}
          onBack={() => navigate(BOARD_PATH)}
        />
      ) : (
        <PackingBoard
          currentUser={user}
          onOpenSlip={(id) => navigate(`${BOARD_PATH}/${id}`)}
        />
      )}
    </div>
  );
}