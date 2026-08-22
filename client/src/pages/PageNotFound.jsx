// ─────────────────────────────────────────────────────────────
// src/pages/NotFoundPage.jsx
//
// Shown for any unmatched route (see App.jsx catch-all). Previously
// this silently redirected to "/" with no feedback — a mistyped URL
// or dead link just bounced the user with no explanation. This gives
// them an actual page and a way back.
// ─────────────────────────────────────────────────────────────
import { useNavigate } from "react-router-dom";

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="stf-shell">
      <main className="stf-main">
        <div className="stf-step" style={{ textAlign: "center", marginTop: "10vh" }}>
          <div className="stf-step-head">
            <h1 className="stf-step-title">Page not found</h1>
            <p className="stf-step-sub">
              The page you're looking for doesn't exist, or the link may be broken.
            </p>
          </div>

          <div className="stf-actions">
            <button className="stf-btn stf-btn-primary" onClick={() => navigate("/")}>
              Go to Home
            </button>
            <button className="stf-btn stf-btn-secondary" onClick={() => navigate(-1)}>
              Go Back
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}