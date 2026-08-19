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
// shadcn/ui Dialog imports
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import receivingIcon from "./../../public/icons/receiving-icon.svg";
import packingIcon from "./../../public/icons/packing-icon.svg";
import decantingIcon from "./../../public/icons/decanting-icon.svg";
import dispatchIcon from "./../../public/icons/dispatch-icon.svg";

export default function Home() {
  const { user } = useAuth();
  const firstName = user?.firstName ?? "";

  // Toggled by the "Less movement" control in TopNavbar — hides icons and
  // (elsewhere) disables hover animation for users sensitive to motion.
  const [reducedMovement, setReducedMovement] = useState(false);

  // Holds the task object whose "coming soon / unavailable" modal is open.
  // null = no modal showing. Setting this to a task object opens the Dialog.
  const [activeModalTask, setActiveModalTask] = useState(null);

  // Task definitions for the dashboard grid.
  // `to: null` or `disabled: true` means the feature isn't live yet —
  // those cards open the info modal instead of navigating.
  const tasks = [
    {
      to: null,
      icon: receivingIcon,
      title: "Onboard Beneficiary",
      disabled: false,
      noticeMessage: "The Beneficiary Onboarding module is currently undergoing routine maintenance.",
    },
    {
      to: "/noc/inventory",
      icon: packingIcon,
      title: "Manage Inventory",
      disabled: false,
    },
    {
      to: null,
      icon: decantingIcon,
      title: "Manage Picking Slips",
      disabled: false,
      noticeMessage: "Picking Slips module feature is coming in the next iteration.",
    },
    {
      to: null,
      icon: dispatchIcon,
      title: "Assign Picking Slips",
      disabled: false,
      noticeMessage: "Picking Slip Assignment feature is coming in the next iteration.",
    },
  ];

  // Called when a blocked task card is clicked (see isBlocked below).
  // Opens the modal with that task's notice message.
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

        {/* ── Task grid, embedded directly in this page ──
            Each task renders as either:
            a <Link> (working route, navigates normally), or
            a <button> (blocked task, opens the info modal)
            depending on isBlocked below. */}
        <TooltipProvider>
          <div className="task-grid">
            {tasks.map((task) => {
              // A task is "blocked" if it's explicitly disabled OR has no
              // route to navigate to. Blocked tasks get a button + modal
              // instead of a real link.
              const isBlocked = task.disabled || !task.to;

              // Shared visual content for both the Link and button cases,
              // so the two render paths stay visually identical.
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
                // key={task.title} rather than task.to, since multiple
                // tasks share `to: null` and would collide as React keys.
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

      {/* ── Feature Unavailable / Coming Soon Dialog Pop-up ──
          Controlled by activeModalTask: open whenever it's non-null.
          onOpenChange handles closing via overlay click / Escape,
          keeping state in sync if the user dismisses it that way. */}
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
