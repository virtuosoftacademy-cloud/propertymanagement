"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Banknote, UserRound } from "lucide-react";
import { MANAGER_PLANS } from "@/lib/billing/plans";
import { useSelectableUsers } from "@/hooks/useManagerBilling";
import {
  managerAccountFormSchema,
  nextRenewalDate,
  priceFor,
  type ManagerAccountFormValues,
} from "@/lib/billing/manager-account-schema";
import type { ManagerAccount } from "@/types/billing";

interface ManagerAccountFormProps {
  /** Pass an account to edit it; omit to create a new one. */
  account?: ManagerAccount | null;
  onSubmit: (values: ManagerAccountFormValues) => void;
  onCancel: () => void;
  submitLabel?: string;
  isSubmitting?: boolean;
}

type FieldErrors = Partial<Record<keyof ManagerAccountFormValues, string>>;

const todayIso = () => new Date().toISOString().slice(0, 10);

const initialValues = (
  account?: ManagerAccount | null
): ManagerAccountFormValues =>
  account
    ? {
        clientUserId: account.managerUserId ?? "",
        clientName: account.clientName,
        companyName: account.companyName ?? "",
        contactEmail: account.contactEmail,
        contactPhone: account.contactPhone ?? "",
        managerName: account.managerName ?? "",
        planId: account.planId,
        billingCycle: account.billingCycle,
        amount: account.amount,
        startedAt: account.startedAt.slice(0, 10),
        renewsAt: account.renewsAt?.slice(0, 10) ?? "",
        status: account.status === "active" ? "active" : "pending",
        notes: account.notes ?? "",
      }
    : {
        clientUserId: "",
        clientName: "",
        companyName: "",
        contactEmail: "",
        contactPhone: "",
        managerName: "",
        planId: "starter",
        billingCycle: "monthly",
        amount: priceFor("starter", "monthly") ?? 0,
        startedAt: todayIso(),
        renewsAt: nextRenewalDate(todayIso(), "monthly"),
        status: "pending",
        notes: "",
      };

/**
 * The subscription form itself, without any surrounding chrome, so the
 * full-page create route and the inline edit dialog stay in step rather than
 * drifting into two implementations of the same rules.
 *
 * State is seeded on mount. Both callers mount this fresh — the dialog unmounts
 * its content when closed, the page is a fresh route — so there is no stale
 * state to reset.
 */
export function ManagerAccountForm({
  account,
  onSubmit,
  onCancel,
  submitLabel,
  isSubmitting = false,
}: ManagerAccountFormProps) {
  const [values, setValues] = useState<ManagerAccountFormValues>(() =>
    initialValues(account)
  );
  const [errors, setErrors] = useState<FieldErrors>({});

  const { data: usersData, loading: usersLoading } = useSelectableUsers();
  const fetchedUsers = usersData ?? [];

  // Keep the account's current client in the list even when the endpoint
  // would not return them — deactivated, or moved to a role that is no longer
  // selectable. Without this the Select finds no matching option, silently
  // renders the placeholder, and saving the form would blank out a link the
  // admin never intended to touch.
  const selectableUsers = useMemo(() => {
    const current = account?.managerUserId;
    if (!current || fetchedUsers.some((u) => u.id === current)) {
      return fetchedUsers;
    }
    return [
      {
        id: current,
        name: account?.managerName || account?.clientName || "Current client",
        email: account?.contactEmail || "",
        company: account?.companyName,
      },
      ...fetchedUsers,
    ];
  }, [fetchedUsers, account]);

  const set = <K extends keyof ManagerAccountFormValues>(
    key: K,
    value: ManagerAccountFormValues[K]
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    // Clear as soon as the field is touched; everything re-validates on submit.
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  /**
   * Selecting a user fills the identity and contact fields in one go. Email and
   * phone stay editable afterwards — a client may want billing sent somewhere
   * other than their login address.
   */
  const selectClient = (userId: string) => {
    const user = selectableUsers.find((u) => u.id === userId);

    setValues((prev) => ({
      ...prev,
      clientUserId: userId,
      clientName: user?.name ?? prev.clientName,
      // Only fill the company when the user has one; never clobber a typed value.
      companyName: user?.company ?? prev.companyName,
      contactEmail: user?.email ?? prev.contactEmail,
      contactPhone: user?.phone ?? "",
      managerName: user?.name ?? prev.managerName,
    }));

    setErrors((prev) => ({
      ...prev,
      clientUserId: undefined,
      clientName: undefined,
      contactEmail: undefined,
      contactPhone: undefined,
    }));
  };

  /**
   * Plan and cycle drive both price and renewal date. Recomputing them together
   * keeps the three consistent — a Growth/annual account showing a monthly
   * price and a one-month renewal would be silently wrong.
   */
  const applyPlanChange = (
    planId: string,
    billingCycle: "monthly" | "annual"
  ) => {
    const catalogue = priceFor(planId, billingCycle);
    setValues((prev) => ({
      ...prev,
      planId,
      billingCycle,
      // Custom plans are negotiated, so keep whatever was typed.
      amount: catalogue === null ? prev.amount : catalogue,
      renewsAt: nextRenewalDate(prev.startedAt, billingCycle),
    }));
    setErrors((prev) => ({ ...prev, amount: undefined, renewsAt: undefined }));
  };

  const handleSubmit = () => {
    const result = managerAccountFormSchema.safeParse(values);

    if (!result.success) {
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof ManagerAccountFormValues;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);

      // Put the first offending field in view — on the full page the error can
      // otherwise be well below the fold.
      const firstKey = result.error.issues[0]?.path[0];
      if (typeof firstKey === "string") {
        document
          .getElementById(`ma-${firstKey}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    onSubmit(result.data);
  };

  const fieldError = (key: keyof ManagerAccountFormValues) =>
    errors[key] ? (
      <p className="text-destructive text-sm">{errors[key]}</p>
    ) : null;

  return (
    <div className="space-y-5">
      {/* ── Client ───────────────────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          Client
        </h3>

        <div className="space-y-2">
          <Label htmlFor="ma-clientUserId">Client *</Label>
          <Select value={values.clientUserId} onValueChange={selectClient}>
            <SelectTrigger id="ma-clientUserId">
              <SelectValue placeholder="Select a user" />
            </SelectTrigger>
            <SelectContent>
              {selectableUsers.length === 0 && (
                <div className="text-muted-foreground px-2 py-3 text-xs">
                  {usersLoading
                    ? "Loading users…"
                    : "No manager users available to attach."}
                </div>
              )}
              {selectableUsers.map((user) => {
                // Already on an account — shown so it is obvious why they are
                // not available, rather than silently missing from the list.
                const taken = Boolean(user.hasAccount) && user.id !== account?.managerUserId;

                return (
                  <SelectItem key={user.id} value={user.id} disabled={taken}>
                    <span className="flex flex-col items-start">
                      <span>
                        {user.name}
                        {taken ? " — already has an account" : ""}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {user.email}
                      </span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            The user this account is sold to. Their contact details fill in
            below and can be overridden.
          </p>
          {fieldError("clientUserId")}
          {fieldError("clientName")}
        </div>

        <div className="space-y-2">
          <Label htmlFor="ma-companyName">Company / landlord</Label>
          <Input
            id="ma-companyName"
            value={values.companyName ?? ""}
            onChange={(e) => set("companyName", e.target.value)}
            placeholder="Harrow Lettings Ltd"
          />
          <p className="text-muted-foreground text-xs">
            Optional. Leave blank if billing goes to the person directly.
          </p>
          {fieldError("companyName")}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ma-contactEmail">Contact email *</Label>
            <Input
              id="ma-contactEmail"
              type="email"
              value={values.contactEmail}
              onChange={(e) => set("contactEmail", e.target.value)}
              placeholder="ops@harrowlettings.co.uk"
            />
            {fieldError("contactEmail")}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ma-contactPhone">Contact phone</Label>
            <Input
              id="ma-contactPhone"
              type="tel"
              value={values.contactPhone ?? ""}
              onChange={(e) => set("contactPhone", e.target.value)}
              placeholder="07700 900000"
            />
            {fieldError("contactPhone")}
          </div>
        </div>

        {/* Derived from the selected user rather than typed again — the client
            and the person who uses the account are the same person here. */}
        {values.managerName && (
          <div className="bg-muted/50 flex items-center gap-2 rounded-lg p-3">
            <UserRound className="text-muted-foreground h-4 w-4 shrink-0" />
            <span className="text-muted-foreground text-sm">
              Manager account for{" "}
              <span className="font-medium">{values.managerName}</span>
            </span>
          </div>
        )}
      </div>

      {/* ── Plan ─────────────────────────────────────────────────── */}
      <div className="space-y-4 border-t pt-5">
        <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          Plan
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ma-planId">Plan *</Label>
            <Select
              value={values.planId}
              onValueChange={(v) => applyPlanChange(v, values.billingCycle)}
            >
              <SelectTrigger id="ma-planId">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MANAGER_PLANS.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name}
                    {plan.unitLimit === null
                      ? " — unlimited units"
                      : ` — up to ${plan.unitLimit} units`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldError("planId")}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ma-billingCycle">Billing cycle *</Label>
            <Select
              value={values.billingCycle}
              onValueChange={(v) =>
                applyPlanChange(values.planId, v as "monthly" | "annual")
              }
            >
              <SelectTrigger id="ma-billingCycle">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
            {fieldError("billingCycle")}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ma-amount">
            Amount (£ per {values.billingCycle === "annual" ? "year" : "month"})
            *
          </Label>
          <Input
            id="ma-amount"
            type="number"
            min="0"
            step="0.01"
            value={values.amount}
            onChange={(e) =>
              set("amount", Number.parseFloat(e.target.value) || 0)
            }
          />
          <p className="text-muted-foreground text-xs">
            Prefilled from the plan. Use the Custom plan to negotiate a
            different figure.
          </p>
          {fieldError("amount")}
        </div>
      </div>

      {/* ── Term ─────────────────────────────────────────────────── */}
      <div className="space-y-4 border-t pt-5">
        <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          Term
        </h3>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="ma-startedAt">Start date *</Label>
            <Input
              id="ma-startedAt"
              type="date"
              value={values.startedAt}
              onChange={(e) => {
                const startedAt = e.target.value;
                setValues((prev) => ({
                  ...prev,
                  startedAt,
                  renewsAt: nextRenewalDate(startedAt, prev.billingCycle),
                }));
                setErrors((prev) => ({
                  ...prev,
                  startedAt: undefined,
                  renewsAt: undefined,
                }));
              }}
            />
            {fieldError("startedAt")}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ma-renewsAt">Renews on</Label>
            <Input
              id="ma-renewsAt"
              type="date"
              value={values.renewsAt ?? ""}
              onChange={(e) => set("renewsAt", e.target.value)}
            />
            {fieldError("renewsAt")}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ma-status">Status *</Label>
            <Select
              value={values.status}
              onValueChange={(v) => set("status", v as "pending" | "active")}
            >
              <SelectTrigger id="ma-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">
                  Pending — awaiting payment
                </SelectItem>
                <SelectItem value="active">Active — paid</SelectItem>
              </SelectContent>
            </Select>
            {fieldError("status")}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ma-notes">Notes</Label>
          <Textarea
            id="ma-notes"
            value={values.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Anything worth remembering about this deal"
            rows={3}
          />
          {fieldError("notes")}
        </div>

        {/* Stated rather than chosen — cash is the only method the app can
            currently process. */}
        <div className="bg-muted/50 flex items-center gap-2 rounded-lg p-3">
          <Banknote className="text-muted-foreground h-4 w-4 shrink-0" />
          <span className="text-muted-foreground text-sm">
            Payment method: <span className="font-medium">Cash</span>
          </span>
        </div>
      </div>

      {/* ── Actions ──────────────────────────────────────────────── */}
      <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {submitLabel ?? (account ? "Save changes" : "Add subscription")}
        </Button>
      </div>
    </div>
  );
}
