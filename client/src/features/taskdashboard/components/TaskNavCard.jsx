// src/features/taskdashboard/components/TaskNavCard.jsx
import { Link } from "react-router-dom";
import { ArrowLeft, LogOut } from "lucide-react";
import "../styles/task-nav-card.css"; // Adjust path if placed in src/styles/

export default function TaskNavCard({ onLogout, showBack = true }) {
  return (
    <header className="task-nav-header">
      <div className="task-nav-left">
        {showBack && (
          <Link to="/tasks" className="task-nav-back-link">
            <ArrowLeft className="task-nav-icon" />
            <span>Back to Task Select</span>
          </Link>
        )}
      </div>

      {onLogout && (
        <button
          onClick={onLogout}
          type="button"
          className="task-nav-logout-btn"
        >
          <LogOut className="task-nav-icon" />
          <span>Logout</span>
        </button>
      )}
    </header>
  );
}