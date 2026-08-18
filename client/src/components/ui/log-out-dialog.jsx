// ─────────────────────────────────────────────────────────────

//
// "Are you sure?" confirmation shown before logging out. Cancel
// closes the dialog and leaves the user exactly where they were —
// no navigation, no side effects. Confirming calls onConfirm,
// which the caller wires to actually log out + redirect to /login.
// ─────────────────────────────────────────────────────────────
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

const LogoutConfirmDialog = ({ open, onOpenChange, onConfirm }) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="logout-dialog-content">
        <AlertDialogHeader>
          <AlertDialogTitle className="logout-dialog-title">
            Log out?
          </AlertDialogTitle>
          <AlertDialogDescription className="logout-dialog-desc">
            Are you sure you want to log out? You'll need to sign in again to continue.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="logout-dialog-footer">
          <AlertDialogCancel className="logout-dialog-cancel">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="logout-dialog-confirm">
            Log out
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default LogoutConfirmDialog;