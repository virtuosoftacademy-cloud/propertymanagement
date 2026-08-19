"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, X } from "lucide-react";
import {
  createPlanFormSchema,
  slugify,
  type PlanFormValues,
} from "@/lib/billing/plan-schema";
import type { ManagerPlan } from "@/lib/billing/plans";

interface PlanFormProps {
  /** Pass a plan to edit it; omit to create a new one. */
  plan?: ManagerPlan | null;
  onSubmit: (values: PlanFormValues) => void;
  onCancel: () => void;
  submitLabel?: string;
}

type FieldErrors = Partial<Record<keyof PlanFormValues, string>>;

const initialValues = (plan?: ManagerPlan | null): PlanFormValues =>
  plan
    ? {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        // The two toggles are derived from null, which is how "unlimited" and
        // "negotiated" are stored on the plan itself.
        unlimitedUnits: plan.unitLimit === null,
        unitLimit: plan.unitLimit ?? 25,
        negotiatedPrice: plan.monthlyPrice === null,
        monthlyPrice: plan.monthlyPrice ?? 0,
        annualPrice: plan.annualPrice ?? 0,
        pricePerUnit: plan.pricePerUnit ?? null,
        features: plan.features.length > 0 ? [...plan.features] : [""],
        popular: Boolean(plan.popular),
      }
    : {
        id: "",
        name: "",
        description: "",
        unlimitedUnits: false,
        unitLimit: 25,
        negotiatedPrice: false,
        monthlyPrice: 0,
        annualPrice: 0,
        pricePerUnit: null,
        features: [""],
        popular: false,
      };

export function PlanForm({
  plan,
  onSubmit,
  onCancel,
  submitLabel,
}: PlanFormProps) {
  const isEdit = Boolean(plan);
  const [values, setValues] = useState<PlanFormValues>(() =>
    initialValues(plan)
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  // Editing starts from a real ID, so never auto-slug over it from the name.
  const [idTouched, setIdTouched] = useState(isEdit);

  const set = <K extends keyof PlanFormValues>(
    key: K,
    value: PlanFormValues[K]
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const setName = (name: string) => {
    setValues((prev) => ({
      ...prev,
      name,
      id: idTouched ? prev.id : slugify(name),
    }));
    setErrors((prev) => ({ ...prev, name: undefined, id: undefined }));
  };

  const setFeature = (index: number, value: string) => {
    setValues((prev) => {
      const features = [...prev.features];
      features[index] = value;
      return { ...prev, features };
    });
    setErrors((prev) => ({ ...prev, features: undefined }));
  };

  const addFeature = () =>
    setValues((prev) => ({ ...prev, features: [...prev.features, ""] }));

  const removeFeature = (index: number) =>
    setValues((prev) => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== index),
    }));

  const handleSubmit = () => {
    // Blank rows are a side effect of the add-row UI, not user intent.
    const cleaned: PlanFormValues = {
      ...values,
      features: values.features.map((f) => f.trim()).filter(Boolean),
      unitLimit: values.unlimitedUnits ? null : values.unitLimit,
      monthlyPrice: values.negotiatedPrice ? null : values.monthlyPrice,
      annualPrice: values.negotiatedPrice ? null : values.annualPrice,
      // A negotiated plan has no list price at all, per-unit included.
      pricePerUnit: values.negotiatedPrice ? null : values.pricePerUnit,
    };

    // The plan being edited is excluded from the ID uniqueness check.
    const result = createPlanFormSchema(plan?.id).safeParse(cleaned);

    if (!result.success) {
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof PlanFormValues;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);

      const firstKey = result.error.issues[0]?.path[0];
      if (typeof firstKey === "string") {
        document
          .getElementById(`plan-${firstKey}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    onSubmit(result.data);
  };

  const fieldError = (key: keyof PlanFormValues) =>
    errors[key] ? (
      <p className="text-destructive text-sm">{errors[key]}</p>
    ) : null;

  return (
    <div className="space-y-5">
      {/* ── Identity ─────────────────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          Identity
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="plan-name">Plan name *</Label>
            <Input
              id="plan-name"
              value={values.name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Professional"
            />
            {fieldError("name")}
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-id">Plan ID *</Label>
            <Input
              id="plan-id"
              value={values.id}
              onChange={(e) => {
                setIdTouched(true);
                set("id", e.target.value);
              }}
              placeholder="professional"
            />
            <p className="text-muted-foreground text-xs">
              Stored on every account using this plan. Changing it later is a
              migration, so get it right now.
            </p>
            {fieldError("id")}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="plan-description">Description *</Label>
          <Textarea
            id="plan-description"
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Who this plan is for, in one line."
            rows={2}
          />
          {fieldError("description")}
        </div>
      </div>

      {/* ── Capacity ─────────────────────────────────────────────── */}
      <div className="space-y-4 border-t pt-5">
        <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          Capacity
        </h3>

        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="plan-unlimitedUnits">Unlimited units</Label>
            <p className="text-muted-foreground text-xs">
              No cap on how many units this manager can operate.
            </p>
          </div>
          <Switch
            id="plan-unlimitedUnits"
            checked={values.unlimitedUnits}
            onCheckedChange={(checked) => set("unlimitedUnits", checked)}
          />
        </div>

        {!values.unlimitedUnits && (
          <div className="space-y-2">
            <Label htmlFor="plan-unitLimit">Unit limit *</Label>
            <Input
              id="plan-unitLimit"
              type="number"
              min="1"
              step="1"
              value={values.unitLimit ?? ""}
              onChange={(e) =>
                set(
                  "unitLimit",
                  e.target.value === "" ? null : Number.parseInt(e.target.value, 10)
                )
              }
            />
            {fieldError("unitLimit")}
          </div>
        )}
      </div>

      {/* ── Pricing ──────────────────────────────────────────────── */}
      <div className="space-y-4 border-t pt-5">
        <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          Pricing
        </h3>

        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="plan-negotiatedPrice">Negotiated per client</Label>
            <p className="text-muted-foreground text-xs">
              No list price — the amount is agreed on each account.
            </p>
          </div>
          <Switch
            id="plan-negotiatedPrice"
            checked={values.negotiatedPrice}
            onCheckedChange={(checked) => set("negotiatedPrice", checked)}
          />
        </div>

        {!values.negotiatedPrice && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="plan-monthlyPrice">Monthly price (£) *</Label>
              <Input
                id="plan-monthlyPrice"
                type="number"
                min="0"
                step="0.01"
                value={values.monthlyPrice ?? ""}
                onChange={(e) =>
                  set(
                    "monthlyPrice",
                    e.target.value === ""
                      ? null
                      : Number.parseFloat(e.target.value)
                  )
                }
              />
              {fieldError("monthlyPrice")}
            </div>

            <div className="space-y-2">
              <Label htmlFor="plan-annualPrice">Annual price (£) *</Label>
              <Input
                id="plan-annualPrice"
                type="number"
                min="0"
                step="0.01"
                value={values.annualPrice ?? ""}
                onChange={(e) =>
                  set(
                    "annualPrice",
                    e.target.value === ""
                      ? null
                      : Number.parseFloat(e.target.value)
                  )
                }
              />
              {values.monthlyPrice !== null && values.monthlyPrice > 0 && (
                <p className="text-muted-foreground text-xs">
                  12 months at the monthly rate is £
                  {(values.monthlyPrice * 12).toLocaleString("en-GB")}.
                </p>
              )}
              {fieldError("annualPrice")}
            </div>
          </div>
        )}

        {!values.negotiatedPrice && (
          <div className="space-y-2">
            <Label htmlFor="plan-pricePerUnit">Price per unit (£)</Label>
            <Input
              id="plan-pricePerUnit"
              type="number"
              min="0"
              step="0.01"
              value={values.pricePerUnit ?? ""}
              onChange={(e) =>
                set(
                  "pricePerUnit",
                  e.target.value === ""
                    ? null
                    : Number.parseFloat(e.target.value)
                )
              }
              placeholder="0.00"
            />
            <p className="text-muted-foreground text-xs">
              Optional. Charged per unit per month on top of the flat price.
              Leave blank for flat pricing only.
            </p>

            {/* A worked example, because "£29 + £2 per unit" is hard to judge
                until you see what a real portfolio would pay. */}
            {values.pricePerUnit !== null && values.pricePerUnit > 0 && (
              <div className="bg-muted/50 space-y-1 rounded-lg p-3 text-xs">
                <p className="font-medium">Worked example</p>
                {[10, 50, values.unlimitedUnits ? 250 : (values.unitLimit ?? 25)]
                  .filter((n, i, arr) => n > 0 && arr.indexOf(n) === i)
                  .map((units) => (
                    <p key={units} className="text-muted-foreground">
                      {units} units — £
                      {(
                        (values.monthlyPrice ?? 0) +
                        values.pricePerUnit! * units
                      ).toLocaleString("en-GB", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                      /month
                      {values.monthlyPrice
                        ? ` (£${values.monthlyPrice} base + ${units} × £${values.pricePerUnit})`
                        : ""}
                    </p>
                  ))}
              </div>
            )}

            {fieldError("pricePerUnit")}
          </div>
        )}
      </div>

      {/* ── Features ─────────────────────────────────────────────── */}
      <div className="space-y-4 border-t pt-5">
        <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          Features
        </h3>

        <div id="plan-features" className="space-y-2">
          {values.features.map((feature, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={feature}
                onChange={(e) => setFeature(index, e.target.value)}
                placeholder="Up to 150 units"
                aria-label={`Feature ${index + 1}`}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeFeature(index)}
                disabled={values.features.length === 1}
                aria-label={`Remove feature ${index + 1}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={addFeature}>
            <Plus className="mr-2 h-4 w-4" />
            Add feature
          </Button>

          {fieldError("features")}
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="plan-popular">Highlight as most popular</Label>
            <p className="text-muted-foreground text-xs">
              Adds a badge when plans are shown side by side.
            </p>
          </div>
          <Switch
            id="plan-popular"
            checked={values.popular}
            onCheckedChange={(checked) => set("popular", checked)}
          />
        </div>
      </div>

      {/* ── Actions ──────────────────────────────────────────────── */}
      <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSubmit}>
          {submitLabel ?? (isEdit ? "Save changes" : "Add plan")}
        </Button>
      </div>
    </div>
  );
}
