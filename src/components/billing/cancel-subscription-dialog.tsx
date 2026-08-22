"use client";

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
import { AlertTriangle } from "lucide-react";

interface CancelSubscriptionDialogProps {
  planName: string;
  /** ISO date the current period closes, i.e. when access actually stops. */
  endsOn?: string | null;
  open: boolean;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

const formatDate = (value?: string | null) => {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

/**
 * Confirmation for cancelling your own subscription.
 *
 * States the two things people get wrong about cancelling: that it takes
 * effect at the end of the period rather than now, and — the one that actually
 * stings — that when it does take effect the LOGIN is revoked, not merely
 * downgraded to the free tier. Someone expecting to drop to Free and keep
 * their data would otherwise find themselves locked out.
 */
export function CancelSubscriptionDialog({
  planName,
  endsOn,
  open,
  busy,
  onOpenChange,
  onConfirm,
}: CancelSubscriptionDialogProps) {
  const endDate = formatDate(endsOn);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="text-destructive h-5 w-5" />
            Cancel your {planName} subscription?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                {endDate ? (
                  <>
                    You keep full access until{" "}
                    <span className="text-foreground font-medium">
                      {endDate}
                    </span>
                    , the end of the period you have already paid for. Nothing
                    is charged after that.
                  </>
                ) : (
                  <>
                    You keep full access until the end of the period you have
                    already paid for. Nothing is charged after that.
                  </>
                )}
              </p>
              <p>
                When it ends,{" "}
                <span className="text-foreground font-medium">
                  your sign-in is switched off
                </span>{" "}
                — the account is not moved down to the free plan. Your data is
                kept, but you will need to get in touch to use it again.
              </p>
              <p className="text-muted-foreground">
                You can undo this at any point before{" "}
                {endDate ?? "the period ends"}.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep my plan</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // Keep the dialog open while the request runs, so a failure can
              // be shown against the action that caused it.
              event.preventDefault();
              onConfirm();
            }}
            disabled={busy}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {busy ? "Cancelling…" : "Cancel subscription"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
