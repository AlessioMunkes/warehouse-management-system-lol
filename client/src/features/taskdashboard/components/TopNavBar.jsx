// src/components/layout/TopNavbar.jsx
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { ArrowLeft, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import LogoutConfirmDialog from "@/components/ui/log-out-dialog";
import { useAuth } from "../../../context/AuthContext";
import batchesLogo from "../../../assets/Batches_Logo.jpeg";
import "../../../styles/index.css";

const ROLE_LABELS = {
  warehouse_worker: "Warehouse staff",
  manager: "Manager",
  admin: "Admin",
  finance: "Finance",
  guest: "Guest",
};

export function TopNavbar({ reducedMovement, onToggleMovement }) {
  const { user, logout } = useAuth();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const navigate = useNavigate();
  const roleLabel = user?.role ? ROLE_LABELS[user.role] ?? user.role : "";

  // Synchronize body class on initial load / route change based on persisted setting
  useEffect(() => {
    const isSavedReduced = localStorage.getItem("reducedMovement") === "true";
    document.body.classList.toggle("reduced-movement", isSavedReduced);
  }, []);

  const handleConfirmLogout = () => {
    logout();
    setLogoutOpen(false);
    navigate("/login");
  };

  const handleConfirmMovement = () => {
    const nextState = !reducedMovement;

    // 1. Save preference to localStorage so it persists across screen navigations & refreshes
    localStorage.setItem("reducedMovement", String(nextState));

    // 2. Toggle global CSS class on body
    document.body.classList.toggle("reduced-movement", nextState);
    
    // 3. Call parent callback to update React state
    if (onToggleMovement) {
      onToggleMovement(nextState);
    }
    
    setMovementDialogOpen(false);
  };

  return (
    <TooltipProvider>
      <header className="top-navbar">
        <div className="top-navbar__left">
          {/* Back Button Tooltip */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                className="top-navbar__back"
                aria-label="Go back"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Go back to previous page</p>
            </TooltipContent>
          </Tooltip>

          {/* Brand header */}
          <div className="top-navbar__brand">
            <img src={batchesLogo} alt="" className="top-navbar__logo" />
            <div className="top-navbar__brand-text">
              <span className="top-navbar__brand-name">
                Batches
              </span>
              <span className="top-navbar__brand-tagline">
                Nourish Our Children
              </span>
            </div>
          </div>
        </div>

        <div className="top-navbar__right">
          {user && (
            <span className="top-navbar__user-name">
              {user.firstName} {user.lastName}{" "}
              <span className="top-navbar__role">
                · {roleLabel}
              </span>
            </span>
          )}

          <Separator orientation="vertical" className="top-navbar__divider hidden sm:block" />

          {/* Less Movement Tooltip */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                onClick={() => setMovementDialogOpen(true)}
                className="top-navbar__toggle"
              >
                <EyeOff className="top-navbar__toggle-icon" />
                <span className="top-navbar__toggle-text">Less movement</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Reduces visual animations and hides task icons for lower strain</p>
            </TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="top-navbar__divider" />

          {/* Log out Tooltip */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLogoutOpen(true)}
                className="top-navbar__logout"
              >
                Log out
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Sign out of your account</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <LogoutConfirmDialog
          open={logoutOpen}
          onOpenChange={setLogoutOpen}
          onConfirm={handleConfirmLogout}
        />

        <AlertDialog open={movementDialogOpen} onOpenChange={setMovementDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Accessibility Feature</AlertDialogTitle>
              <AlertDialogDescription>
                This accessibility feature reduces visual strain and makes things as simple as possible by hiding icons and minimizing visual movement.
                <br /><br />
                Are you sure you want to {reducedMovement ? "disable" : "enable"} this feature?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmMovement}>Yes</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </header>
    </TooltipProvider>
  );
}