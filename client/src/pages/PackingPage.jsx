// PackingPage.jsx
// Top-level routed page for Packing. Reads :slipId from the URL
// to decide whether to show the board or the detail view, and
// wires in the existing PageHeader / TaskNavGrid rather than
// duplicating any of that chrome here.

import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { PACKING } from "../routes/paths";
import PageHeader from "../features/packing/components/PageHeader";
import TaskNavGrid from "../features/packing/components/TaskNavGrid";
import PackingBoard from "../features/packing/components/PackingBoard";
import PackingDetail from "../features/packing/components/PackingDetail";

// Paths come from routes/paths.js, which App.jsx also builds its
// <Route> entries from.
//
// This file used to hard-code "/programmes/noc/packing". App.jsx had
// a redirect for that bare path but no route for
// "/programmes/noc/packing/:slipId", so opening a pallet from the
// board fell through to the catch-all and bounced the packer out to
// the landing page — the detail view was only reachable by typing the
// URL. Sharing one definition means the two can't disagree again.

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
          onBack={() => navigate(PACKING.board)}
        />
      ) : (
        <PackingBoard
          currentUser={user}
          onOpenSlip={(id) => navigate(PACKING.detail(id))}
        />
      )}
    </div>
  );
}