"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserPlus } from "lucide-react";
import { ManagerAccountForm } from "./manager-account-form";
import type { ManagerAccountFormValues } from "@/lib/billing/manager-account-schema";
import type { ManagerAccount } from "@/types/billing";

interface ManagerAccountFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass an account to edit it; omit to create a new one. */
  account?: ManagerAccount | null;
  onSubmit: (values: ManagerAccountFormValues) => void;
}

/**
 * Creating a subscription without leaving the list. Renders the same
 * ManagerAccountForm as /dashboard/admin/billing/[id]/edit, so the fields and
 * validation rules cannot drift between the two entry points.
 */
export function ManagerAccountFormDialog({
  open,
  onOpenChange,
  account,
  onSubmit,
}: ManagerAccountFormDialogProps) {
  const isEdit = Boolean(account);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {isEdit ? "Edit subscription" : "Add subscription"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update what this client has agreed to."
              : "Record a manager account sold to a client."}
          </DialogDescription>
        </DialogHeader>

        {/* Mounted only while open, so each time it opens the form starts from
            a clean state rather than whatever was last typed. */}
        {open && (
          <ManagerAccountForm
            account={account}
            onSubmit={onSubmit}
            onCancel={() => onOpenChange(false)}
            submitLabel={isEdit ? "Save changes" : "Add subscription"}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
