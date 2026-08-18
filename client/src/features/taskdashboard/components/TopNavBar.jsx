// src/components/layout/TopNavbar.jsx
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
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

  const handleConfirmLogout = () => {
    logout();
    setLogoutOpen(false);
    navigate("/login");
  };

  const handleConfirmMovement = () => {
    onToggleMovement(!reducedMovement);
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

          <Link to="/" className="top-navbar__brand">
            <img src={batchesLogo} alt="" className="top-navbar__logo" />
            <div className="top-navbar__brand-text">
              <span className="top-navbar__brand-name">Batches</span>
              <span className="top-navbar__brand-tagline">Nourish Our Children</span>
            </div>
          </Link>
        </div>

        <div className="top-navbar__right">
          {user && (
            <span>
              {user.name} <span className="top-navbar__role">· {roleLabel}</span>
            </span>
          )}

          <Separator orientation="vertical" className="h-4 top-navbar__divider" />

          {/* Less Movement Tooltip */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                onClick={() => setMovementDialogOpen(true)}
                className="top-navbar__toggle bg-white text-gray-800 hover:bg-white/90 border border-gray-200 shadow-sm"
              >
                <EyeOff className="h-4 w-4 mr-1.5 text-gray-600" />
                Less movement
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Reduces visual animations and hides task icons for lower strain</p>
            </TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-4 top-navbar__divider" />

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