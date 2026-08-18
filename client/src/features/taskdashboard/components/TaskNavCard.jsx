// src/features/taskdashboard/components/TaskNavCard.jsx
import { Link } from "react-router-dom";
import { ArrowLeft, LogOut } from "lucide-react";

export default function TaskNavCard({ onLogout, showBack = true }) {
  return (
    <header className="border-b bg-card px-6 py-4 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-4">
        {showBack && (
          <Link
            to="/tasks"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Task Select</span>
          </Link>
        )}
      </div>

      {onLogout && (
        <button
          onClick={onLogout}
          type="button"
          className="inline-flex items-center gap-2 text-sm font-medium text-rose-600 hover:text-rose-700 transition-colors focus:outline-none"
        >
          <LogOut className="h-4 w-4" />
          <span>Logout</span>
        </button>
      )}
    </header>
  );
}