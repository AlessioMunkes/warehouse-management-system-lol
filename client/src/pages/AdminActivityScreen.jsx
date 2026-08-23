// ─────────────────────────────────────────────────────────────
// client/src/pages/AdminActivityScreen.jsx
//
// The admin landing screen. Structurally a copy of
// ManagerActivityScreen — same TopNavbar, same Greeting, same
// task-grid / task-card classes, same "coming soon" Dialog — because
// an admin should not have to learn a second layout, and because the
// grid CSS already exists and did not need rewriting.
//
// It holds one live tile today. That is honest: supplier management
// is the only admin-side feature that exists. Add entries to `tasks`
// below as more arrive; a tile with `to: null` renders as a button
// that opens the notice modal instead of navigating, which is how the
// manager grid handles features that are not ready.
// ─────────────────────────────────────────────────────────────
import { useState } from "react";
import { Link } from "react-router-dom";
import { TopNavbar } from "../features/taskdashboard/components/TopNavBar";
import { Greeting } from "../features/taskdashboard/components/Greeting";
import { useAuth } from "@/context/AuthContext";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ADMIN } from "../routes/paths";

// No supplier-specific icon exists in client/public/icons. Goods
// arriving from suppliers is the nearest existing meaning, so the
// receiving icon is reused rather than a new asset invented.
import receivingIcon from "./../../public/icons/receiving-icon.svg";

export default function AdminActivityScreen() {
  const { user } = useAuth();
  const firstName = user?.firstName ?? "";

  const [reducedMovement, setReducedMovement] = useState(false);
  const [activeModalTask, setActiveModalTask] = useState(null);

  const tasks = [
    {
      to: ADMIN.suppliers,
      icon: receivingIcon,
      title: "Manage Suppliers",
      disabled: false,
    },
  ];

  const handleTaskClick = (task) => {
    if (task.disabled || !task.to) {
      setActiveModalTask(task);
    }
  };

  return (
    <div className="min-h-screen bg-white text-[#2b3336] font-['Montserrat',sans-serif]">
      <TopNavbar
        reducedMovement={reducedMovement}
        onToggleMovement={setReducedMovement}
      />

      <main className="px-4 sm:px-6 py-6 max-w-3xl mx-auto">
        <Greeting name={firstName} />

        <TooltipProvider>
          <div className="task-grid">
            {tasks.map((task) => {
              const isBlocked = task.disabled || !task.to;

              const cardContent = (
                <>
                  {!reducedMovement && task.icon && (
                    <img src={task.icon} alt="" className="task-card__icon" />
                  )}
                  <span className="task-card__title">{task.title}</span>
                  {task.badgeText && (
                    <span className="task-card__badge">{task.badgeText}</span>
                  )}
                </>
              );

              return (
                <Tooltip key={task.title}>
                  <TooltipTrigger asChild>
                    {isBlocked ? (
                      <button
                        type="button"
                        onClick={() => handleTaskClick(task)}
                        className="task-card"
                      >
                        {cardContent}
                      </button>
                    ) : (
                      <Link to={task.to} className="task-card">
                        {cardContent}
                      </Link>
                    )}
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{task.noticeMessage ?? `Navigate to ${task.title}`}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      </main>

      <Dialog
        open={Boolean(activeModalTask)}
        onOpenChange={(open) => !open && setActiveModalTask(null)}
      >
        <DialogContent className="rounded-[4px] border-2 border-[#e9e3dd] bg-white max-w-md">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-2 border-b border-[#e9e3dd] pb-3">
              <span className="text-[#ef3a40] text-xl">ℹ</span>
              <DialogTitle className="text-lg font-bold text-[#2b3336]">
                {activeModalTask?.title?.toUpperCase()}
              </DialogTitle>
            </div>
            <DialogDescription className="text-sm text-[#676767] leading-relaxed pt-2">
              {activeModalTask?.noticeMessage || "This feature is currently unavailable or under development."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4">
            <Button
              onClick={() => setActiveModalTask(null)}
              className="w-full sm:w-auto bg-[#2b3336] hover:bg-black text-white font-bold text-xs tracking-wider rounded-[4px] px-6"
            >
              GOT IT
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
