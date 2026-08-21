"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Banknote } from "lucide-react";
import type { Subscription } from "@/types/billing";

interface RecordPaymentDialogProps {
  account: Subscription | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (amount: number, receivedOn: string, notes: string) => void;
}

/**
 * Cash is the only method, so this is a record-after-the-fact form rather than
 * a payment flow — there is nothing to authorise. The method is stated rather
 * than offered as a choice, which is why there is no select here.
 */
export function RecordPaymentDialog({
  account,
  open,
  onOpenChange,
  onConfirm,
}: RecordPaymentDialogProps) {
  const [amount, setAmount] = useState("");
  const [receivedOn, setReceivedOn] = useState("");
  const [notes, setNotes] = useState("");

  // Prefill from the account each time the dialog opens for a new client.
  useEffect(() => {
    if (open && account) {
      setAmount(String(account.amount));
      setReceivedOn(new Date().toISOString().slice(0, 10));
      setNotes("");
    }
  }, [open, account]);

  if (!account) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Record cash payment
          </DialogTitle>
          <DialogDescription>
            From {account.clientName}. Cash is currently the only accepted
            method.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="payment-amount">Amount received (£)</Label>
            <Input
              id="payment-amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
            <p className="text-muted-foreground text-xs">
              Expected £{account.amount.toLocaleString("en-GB")} per{" "}
              {account.billingCycle === "annual" ? "year" : "month"}.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-date">Date received</Label>
            <Input
              id="payment-date"
              type="date"
              value={receivedOn}
              onChange={(e) => setReceivedOn(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-notes">Notes (optional)</Label>
            <Textarea
              id="payment-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Receipt number, who handed it over, and so on"
              rows={3}
            />
          </div>

          <div className="bg-muted/50 flex items-center gap-2 rounded-lg p-3">
            <Banknote className="text-muted-foreground h-4 w-4 shrink-0" />
            <span className="text-muted-foreground text-sm">
              Payment method: <span className="font-medium">Cash</span>
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onConfirm(Number.parseFloat(amount) || 0, receivedOn, notes)
            }
          >
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
