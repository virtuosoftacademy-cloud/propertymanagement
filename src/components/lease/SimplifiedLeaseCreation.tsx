// PropertyPro - Simplified Lease Creation Form

"use client";

import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Home,
  Calendar,
  PoundSterling,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { LeaseRentPeriod, PropertyStatus, LeaseStatus } from "@/types";
import { FormDatePicker } from "@/components/ui/date-picker";
import { LeaseResponse, leaseService } from "@/lib/services/lease.service";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";

interface SimplifiedLeaseData {
  // Core Information
  propertyId: string;
  unitId: string;
  tenantId: string;
  rentPeriod: LeaseRentPeriod | "";

  // Dates
  startDate: string;
  endDate: string;

  // Financial Terms
  rentAmount: number;
  securityDeposit: number;
  rentDueDay: number;

  // Late Fee Configuration
  lateFeeAmount: number;
  lateFeeGracePeriodDays: number;
  lateFeeType: "fixed" | "percentage";

  // Auto-generation Settings
  autoGenerateInvoices: boolean;
  autoEmailInvoices: boolean;
}

interface Property {
  _id: string;
  name: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  units: Array<{
    _id: string;
    unitNumber: string;
    unitType: string;
    bedrooms: number;
    bathrooms: number;
    squareFootage: number;
    rentAmount: number;
    securityDeposit: number;
    status: string;
  }>;
}

interface Tenant {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface SimplifiedLeaseCreationProps {
  mode?: "create" | "edit";
  leaseId?: string;
  initialLease?: LeaseResponse;
  onSuccess?: (leaseId?: string) => void;
}

// How often rent is collected.
const RENT_PERIOD_OPTIONS: Array<{ value: LeaseRentPeriod; label: string }> = [
  { value: LeaseRentPeriod.MONTH, label: "Month" },
  { value: LeaseRentPeriod.WEEK, label: "Week" },
  { value: LeaseRentPeriod.DAY, label: "Day" },
];

// "per …" phrasing for the rent amount label.
const PER_PERIOD_LABEL: Record<LeaseRentPeriod, string> = {
  [LeaseRentPeriod.MONTH]: "per month",
  [LeaseRentPeriod.WEEK]: "per week",
  [LeaseRentPeriod.DAY]: "per day",
};

const createInitialLeaseState = (): SimplifiedLeaseData => ({
  propertyId: "",
  unitId: "",
  tenantId: "",
  rentPeriod: "",
  startDate: "",
  endDate: "",
  rentAmount: 0,
  securityDeposit: 0,
  rentDueDay: 1,
  lateFeeAmount: 50,
  lateFeeGracePeriodDays: 5,
  lateFeeType: "fixed",
  autoGenerateInvoices: false,
  autoEmailInvoices: false,
});

export default function SimplifiedLeaseCreation({
  mode = "create",
  leaseId,
  initialLease,
  onSuccess,
}: SimplifiedLeaseCreationProps) {
  const { t, formatCurrency } = useLocalizationContext();

  const [leaseData, setLeaseData] = useState<SimplifiedLeaseData>(
    createInitialLeaseState
  );
  const [originalLeaseData, setOriginalLeaseData] =
    useState<SimplifiedLeaseData>(createInitialLeaseState);

  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [initializingLease, setInitializingLease] = useState(mode === "edit");
  const [leaseError, setLeaseError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isEditMode = mode === "edit";
  const submitLabel = isEditMode
    ? t("leases.new.form.buttons.saveChanges")
    : t("leases.new.form.buttons.createLease");
  const submitLoadingLabel = isEditMode
    ? t("leases.new.form.buttons.savingChanges")
    : t("leases.new.form.buttons.creatingLease");
  const resetLabel = isEditMode
    ? t("leases.new.form.buttons.resetChanges")
    : t("leases.new.form.buttons.resetForm");

  // ─── Rent-period derived state ────────────────────────────────────────────
  const isMonthly = leaseData.rentPeriod === LeaseRentPeriod.MONTH;
  const isDayOrWeek =
    leaseData.rentPeriod === LeaseRentPeriod.DAY ||
    leaseData.rentPeriod === LeaseRentPeriod.WEEK;
  const perPeriodLabel = leaseData.rentPeriod
    ? PER_PERIOD_LABEL[leaseData.rentPeriod]
    : "";

  const rentCollectionNote = isMonthly
    ? "Rent is calculated automatically each month."
    : leaseData.rentPeriod === LeaseRentPeriod.DAY
      ? "Rent is calculated daily."
      : leaseData.rentPeriod === LeaseRentPeriod.WEEK
        ? "Rent is calculated weekly."
        : "";

  const rentPricing = (() => {
    if (!isDayOrWeek) return null;
    if (!leaseData.startDate || !leaseData.endDate) return null;
    const start = new Date(leaseData.startDate + "T00:00:00");
    const end = new Date(leaseData.endDate + "T00:00:00");
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start)
      return null;
    const days = Math.max(
      0,
      Math.round((end.getTime() - start.getTime()) / 86_400_000)
    );
    const isDay = leaseData.rentPeriod === LeaseRentPeriod.DAY;
    const periods = isDay ? days : Math.ceil(days / 7);
    const total = periods * (leaseData.rentAmount || 0);
    return { days, periods, isDay, total };
  })();
  const computedTotal = rentPricing ? rentPricing.total : 0;

  // Fetch properties and tenants on component mount
  useEffect(() => {
    fetchProperties();
    fetchTenants();
  }, []);

  const fetchProperties = async () => {
    try {
      setLoadingProperties(true);
      const response = await fetch("/api/properties?limit=100");
      const data = await response.json();

      if (response.ok && data.success) {
        // The API returns properties directly in data.data
        const properties = Array.isArray(data.data) ? data.data : [];

        // Ensure all properties have a units array (even if empty)
        const normalizedProperties = properties.map((property: any) => ({
          ...property,
          units: Array.isArray(property.units) ? property.units : [],
        }));

        setProperties(normalizedProperties);
      } else {
        toast.error(
          t("leases.new.form.toasts.loadPropertiesError"),
          data.error
            ? {
              description: data.error,
              duration: 5000,
            }
            : undefined
        );
        setProperties([]);
      }
    } catch (error) {
      toast.error(t("leases.new.form.toasts.loadPropertiesError"));
      setProperties([]);
    } finally {
      setLoadingProperties(false);
    }
  };

  const fetchTenants = async () => {
    try {
      const response = await fetch("/api/users?role=tenant&limit=100");
      const data = await response.json();
      if (data.success) {
        setTenants(data.data?.users || []);
      } else {
        toast.error(
          t("leases.new.form.toasts.loadTenantsError"),
          data.error
            ? {
              description: data.error,
              duration: 5000,
            }
            : undefined
        );
      }
    } catch (error) {
      toast.error(t("leases.new.form.toasts.loadTenantsError"));
    }
  };

  const mapLeaseToFormData = (lease: LeaseResponse): SimplifiedLeaseData => {
    const propertyId =
      typeof lease.propertyId === "string"
        ? lease.propertyId
        : lease.propertyId?._id || "";
    const tenantId =
      typeof lease.tenantId === "string"
        ? lease.tenantId
        : lease.tenantId?._id || "";
    const unitId =
      typeof lease.unitId === "string" ? lease.unitId : lease.unit?._id || "";

    const paymentConfig = (lease.terms as any)?.paymentConfig;
    const lateFeeConfig = paymentConfig?.lateFeeConfig;

    return {
      propertyId: propertyId || "",
      unitId: unitId || "",
      tenantId: tenantId || "",
      rentPeriod: ((lease as any).rentPeriod as LeaseRentPeriod) || "",
      startDate: lease.startDate ? lease.startDate.slice(0, 10) : "",
      endDate: lease.endDate ? lease.endDate.slice(0, 10) : "",
      rentAmount: lease.terms?.rentAmount ?? 0,
      securityDeposit: lease.terms?.securityDeposit ?? 0,
      rentDueDay: paymentConfig?.rentDueDay ?? 1,
      lateFeeAmount: lateFeeConfig?.feeAmount ?? lease.terms?.lateFee ?? 0,
      lateFeeGracePeriodDays: lateFeeConfig?.gracePeriodDays ?? 0,
      lateFeeType:
        lateFeeConfig?.feeType === "percentage" ? "percentage" : "fixed",
      autoGenerateInvoices: paymentConfig?.autoGenerateInvoices ?? false,
      autoEmailInvoices: paymentConfig?.autoEmailInvoices ?? false,
    };
  };

  const hydrateLeaseData = (lease: LeaseResponse) => {
    const mapped = mapLeaseToFormData(lease);
    setLeaseData(mapped);
    setOriginalLeaseData({ ...mapped });
  };

  const loadLeaseDetails = async (id: string) => {
    try {
      setInitializingLease(true);
      const lease = await leaseService.getLeaseById(id);
      hydrateLeaseData(lease);
      setLeaseError(null);
    } catch (error) {
      console.error("Failed to load lease", error);
      const fallbackMessage = t("leases.new.form.errors.loadLeaseGeneric");
      const message = error instanceof Error ? error.message : fallbackMessage;
      setLeaseError(message);
      toast.error(t("leases.new.form.toasts.loadLeaseError"), {
        description: message !== fallbackMessage ? message : undefined,
        duration: 5000,
      });
    } finally {
      setInitializingLease(false);
    }
  };

  useEffect(() => {
    if (mode !== "edit") {
      setOriginalLeaseData(createInitialLeaseState());
      return;
    }

    if (initialLease) {
      hydrateLeaseData(initialLease);
      setInitializingLease(false);
      setLeaseError(null);
      return;
    }

    if (leaseId) {
      void loadLeaseDetails(leaseId);
    } else {
      setInitializingLease(false);
    }
  }, [mode, leaseId, initialLease]);

  const isPercentageLateFee = leaseData.lateFeeType === "percentage";

  const handleInputChange = (field: keyof SimplifiedLeaseData, value: any) => {
    setLeaseData((prev) => {
      const next = { ...prev, [field]: value };

      // The invoice automation section is only shown for fixed-term leases.
      // Clearing the end date hides it, so clear the flags too — otherwise a
      // lease could be submitted with automation on from a hidden control.
      if (field === "endDate" && !value) {
        next.autoGenerateInvoices = false;
        next.autoEmailInvoices = false;
      }

      return next;
    });
    validateField(field, value);

    // Switching to a percentage makes an amount over 100 invalid even though
    // that field did not change, so re-check it against the type just picked.
    if (field === "lateFeeType") {
      validateField("lateFeeAmount", leaseData.lateFeeAmount, {
        lateFeeType: value,
      });
    }
  };

  const setError = (
    field: keyof SimplifiedLeaseData,
    message: string | null
  ) => {
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (message) next[field] = message;
      else delete next[field];
      return next;
    });
  };

  // Switching to a monthly tenancy hides + clears the date range (open-ended).
  const handleRentPeriodChange = (value: string) => {
    handleInputChange("rentPeriod", value);
    if (value === LeaseRentPeriod.MONTH || value === LeaseRentPeriod.WEEK || value === LeaseRentPeriod.DAY) {
      handleInputChange("startDate", "");
      handleInputChange("endDate", "");
      setError("startDate", null);
      setError("endDate", null);
    }
  };

  const getFieldErrorMessage = (
    field: keyof SimplifiedLeaseData,
    value: any,
    // Cross-field rules read sibling values from state, which is stale during
    // the same change that sets them. Callers pass the new value here so a rule
    // can be evaluated against what the form is becoming, not what it was.
    overrides?: Partial<SimplifiedLeaseData>
  ): string | null => {
    const effective = { ...leaseData, ...overrides };
    let message: string | null = null;

   

    if (field === "propertyId" && !value)
      message = t("leases.new.form.validation.propertyRequired");
    if (field === "unitId" && !value)
      message = t("leases.new.form.validation.unitRequired");
    if (field === "tenantId" && !value)
      message = t("leases.new.form.validation.tenantRequired");
    if (field === "rentPeriod" && !value)
      message = t("leases.new.form.validation.rentPeriodRequired", {
        defaultValue: "Please select a rent period",
      });
    if (field === "rentAmount" && (typeof value !== "number" || value <= 0))
      message = t("leases.new.form.validation.rentPositive");
    if (field === "securityDeposit" && (typeof value !== "number" || value < 0))
      message = t("leases.new.form.validation.securityDepositNonNegative");
    if (field === "lateFeeAmount" && (typeof value !== "number" || value < 0))
      message = t("leases.new.form.validation.lateFeeNonNegative");
    // A percentage-of-rent late fee above 100% would charge more than the rent
    // itself. Only applies to the percentage type — a fixed fee has no ceiling.
    if (
      field === "lateFeeAmount" &&
      effective.lateFeeType === "percentage" &&
      typeof value === "number" &&
      value > 100
    )
      message = t("leases.new.form.validation.lateFeePercentageMax");
    if (
      field === "lateFeeGracePeriodDays" &&
      (typeof value !== "number" || value < 0)
    )
      message = t("leases.new.form.validation.gracePeriodNonNegative");

    // endDate is optional for every rent period (Month, Week, and Day) —
    // no "required" check here. The only rule it's ever subject to is: if a
    // value is provided, it must fall after the start date.
    if (field === "endDate" && value && leaseData.startDate) {
      const start = new Date(leaseData.startDate);
      const end = new Date(value);
      if (end <= start)
        message = t("leases.new.form.validation.endDateAfterStart");
    }

    return message;
  };

  const validateField = (
    field: keyof SimplifiedLeaseData,
    value: any,
    overrides?: Partial<SimplifiedLeaseData>
  ): boolean => {
    const message = getFieldErrorMessage(field, value, overrides);
    setError(field, message);
    return !message;
  };

  const validateAll = (): {
    ok: boolean;
    messages: string[];
    invalidFields: Array<keyof SimplifiedLeaseData>;
  } => {
    const checks: Array<[keyof SimplifiedLeaseData, any]> = [
      ["propertyId", leaseData.propertyId],
      ["unitId", leaseData.unitId],
      ["tenantId", leaseData.tenantId],
      ["rentPeriod", leaseData.rentPeriod],
      ["startDate", leaseData.startDate],
      ["endDate", leaseData.endDate],
      ["rentAmount", leaseData.rentAmount],
      ["securityDeposit", leaseData.securityDeposit],
      ["lateFeeAmount", leaseData.lateFeeAmount],
      ["lateFeeGracePeriodDays", leaseData.lateFeeGracePeriodDays],
    ];
    const messages: string[] = [];
    const invalidFields: Array<keyof SimplifiedLeaseData> = [];
    checks.forEach(([f, v]) => {
      const message = getFieldErrorMessage(f, v);
      setError(f, message);
      if (message) {
        invalidFields.push(f);
        messages.push(message);
      }
    });
    return { ok: messages.length === 0, messages, invalidFields };
  };

  const focusField = (field: keyof SimplifiedLeaseData) => {
    const idMap: Record<keyof SimplifiedLeaseData, string> = {
      propertyId: "propertySelect",
      unitId: "unitSelect",
      tenantId: "tenantSelect",
      rentPeriod: "rentPeriodSelect",
      startDate: "startDatePicker",
      endDate: "endDatePicker",
      rentAmount: "rentAmount",
      securityDeposit: "securityDeposit",
      rentDueDay: "rentDueDaySelect",
      lateFeeAmount: "lateFeeAmount",
      lateFeeGracePeriodDays: "lateFeeGracePeriodDays",
      lateFeeType: "lateFeeTypeSelect",
      autoGenerateInvoices: "autoGenerateInvoices",
      autoEmailInvoices: "autoEmailInvoices",
    };
    const id = idMap[field];
    if (!id) return;
    const el = document.getElementById(id) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
    }
  };

  const focusFirstInvalid = (
    invalidFields: Array<keyof SimplifiedLeaseData>
  ) => {
    if (invalidFields.length > 0) {
      focusField(invalidFields[0]);
    }
  };

  const getSelectedProperty = () => {
    return properties.find((p) => p._id === leaseData.propertyId);
  };

  const getAvailableUnits = () => {
    const property = getSelectedProperty();

    if (!property || !Array.isArray(property.units)) {
      return [];
    }

    const selectedUnitId = leaseData.unitId;

    const availableUnits = property.units.filter((unit) => {
      if (!unit || typeof unit !== "object") {
        return false;
      }

      if (!unit.unitNumber) {
        return false;
      }

      if (mode === "edit" && unit._id === selectedUnitId) {
        return true;
      }

      const status =
        typeof unit.status === "string" ? unit.status.toLowerCase() : "";
      return status === PropertyStatus.AVAILABLE;
    });

    if (
      mode === "edit" &&
      selectedUnitId &&
      !availableUnits.some((unit) => unit._id === selectedUnitId)
    ) {
      const selectedUnit = property.units.find(
        (unit) => unit?._id === selectedUnitId
      );
      if (selectedUnit) {
        return [selectedUnit, ...availableUnits];
      }
    }

    return availableUnits;
  };

  const getSelectedUnit = () => {
    const availableUnits = getAvailableUnits();
    return availableUnits.find((unit) => unit?._id === leaseData?.unitId);
  };

  const handleUnitChange = (unitId: string) => {
    handleInputChange("unitId", unitId);

    // Auto-fill rent amount and security deposit when unit is selected
    const selectedUnit = getAvailableUnits().find(
      (unit) => unit._id === unitId
    );
    if (selectedUnit) {
      if (selectedUnit.rentAmount) {
        handleInputChange("rentAmount", selectedUnit.rentAmount);
      }
      if (selectedUnit.securityDeposit) {
        handleInputChange("securityDeposit", selectedUnit.securityDeposit);
      }
    }
  };

  // Shared create/edit submit. `asDraft` only applies on create and persists the
  // lease with a draft status instead of active.
  const persistLease = async (asDraft: boolean) => {
    const { ok, messages, invalidFields } = validateAll();
    if (!ok) {
      toast.error(
        t("leases.new.form.toasts.validationErrors", {
          values: { errors: messages.join(", ") },
        })
      );
      focusFirstInvalid(invalidFields);
      return;
    }

    if (mode === "edit" && !(leaseId || initialLease?._id)) {
      toast.error(t("leases.new.form.errors.missingLeaseIdentifier"));
      return;
    }

    if (asDraft) setSavingDraft(true);
    else setSubmitting(true);

    // Monthly tenancies are open-ended: anchor the start to today and omit the
    // end date. Day/Week tenancies use the selected range.
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const basePayload = {
      propertyId: leaseData.propertyId,
      unitId: leaseData.unitId,
      tenantId: leaseData.tenantId,
      rentPeriod: leaseData.rentPeriod,
      startDate: leaseData.startDate,
      endDate: leaseData.endDate,
      terms: {
        rentAmount: leaseData.rentAmount,
        // Remove this  : Persist the calculated total for Day/Week tenancies.
        ...(isDayOrWeek ? { totalAmount: computedTotal } : {}),
        securityDeposit: leaseData.securityDeposit,
        lateFee: leaseData.lateFeeAmount,
        utilities: [],
        restrictions: [],
        paymentConfig: {
          rentDueDay: leaseData.rentDueDay,
          lateFeeConfig: {
            enabled: leaseData.lateFeeAmount > 0,
            gracePeriodDays: leaseData.lateFeeGracePeriodDays,
            feeType: leaseData.lateFeeType,
            feeAmount: leaseData.lateFeeAmount,
            compoundDaily: false,
            notificationDays: [3, 7, 14],
          },
          // Invoice automation is a fixed-term-only feature. Force it off when
          // there is no end date, so a hidden section can never submit an
          // enabled flag (e.g. an existing lease hydrated in edit mode).
          autoGenerateInvoices: leaseData.endDate
            ? leaseData.autoGenerateInvoices
            : false,
          autoEmailInvoices: leaseData.endDate
            ? leaseData.autoEmailInvoices
            : false,
          autoCreatePayments: false,
          prorationEnabled: false,
          advancePaymentMonths: 0,
        },
      },
    };

    const targetLeaseId = leaseId ?? initialLease?._id;
    const endpoint =
      mode === "edit" && targetLeaseId
        ? `/api/leases/${targetLeaseId}`
        : "/api/leases";
    const method = mode === "edit" ? "PUT" : "POST";
    const payload =
      mode === "edit"
        ? basePayload
        : {
          ...basePayload,
          status: asDraft ? LeaseStatus.DRAFT : LeaseStatus.ACTIVE,
        };

    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ||
          result.message ||
          t("leases.new.form.errors.saveLeaseGeneric")
        );
      }

      const resultLease = result.data?.lease ?? result.data ?? null;
      const resultLeaseId =
        resultLease?._id ??
        targetLeaseId ??
        (typeof result.data?.id === "string" ? result.data.id : undefined);

      if (mode === "edit") {
        toast.success(t("leases.new.form.toasts.updateSuccess"));

        setLeaseError(null);

        if (resultLease) {
          hydrateLeaseData(resultLease);
        } else if (targetLeaseId) {
          void loadLeaseDetails(targetLeaseId);
        }

        if (onSuccess) {
          onSuccess(resultLeaseId);
        } else if (resultLeaseId) {
          window.location.href = `/dashboard/leases/${resultLeaseId}`;
        }
        return;
      }

      toast.success(
        asDraft
          ? t("leases.new.form.toasts.draftCreated", {
            defaultValue: "Lease saved as draft",
          })
          : t("leases.new.form.toasts.createSuccess")
      );

      if (result.data?.invoiceGeneration) {
        const { invoicesGenerated, errors: invoiceErrors } =
          result.data.invoiceGeneration;
        if (invoicesGenerated > 0) {
          toast.success(
            t("leases.new.form.toasts.invoicesGenerated", {
              values: { count: invoicesGenerated },
            }),
            {
              description: t("leases.new.form.toasts.invoicesAvailable"),
              duration: 6000,
            }
          );
        }
        if (Array.isArray(invoiceErrors) && invoiceErrors.length > 0) {
          toast.warning(
            t("leases.new.form.toasts.invoiceWarnings", {
              values: { warnings: invoiceErrors.join(", ") },
            })
          );
        }
      }

      setLeaseData(createInitialLeaseState());
      setOriginalLeaseData(createInitialLeaseState());

      const navigateAfterCreate = () => {
        if (onSuccess) {
          onSuccess(resultLeaseId);
        } else if (resultLeaseId) {
          window.location.href = `/dashboard/leases/${resultLeaseId}`;
        } else {
          window.location.href = "/dashboard/leases";
        }
      };

      setTimeout(navigateAfterCreate, 2000);
    } catch (error) {
      const fallbackMessage = t("leases.new.form.errors.saveLeaseGeneric");
      const message = error instanceof Error ? error.message : fallbackMessage;
      toast.error(
        mode === "edit"
          ? t("leases.new.form.toasts.updateError")
          : asDraft
            ? t("leases.new.form.toasts.draftError", {
              defaultValue: "Couldn't save draft",
            })
            : t("leases.new.form.toasts.createError"),
        {
          description: message,
          duration: 5000,
        }
      );
    } finally {
      if (asDraft) setSavingDraft(false);
      else setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await persistLease(false);
  };

  if (isEditMode && initializingLease) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {leaseError && (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <span>{leaseError}</span>
              {isEditMode && (leaseId || initialLease?._id) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void loadLeaseDetails(leaseId ?? initialLease?._id ?? "")
                  }
                >
                  {t("leases.new.form.actions.retryLoadLease")}
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Property & Tenant Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="h-5 w-5" />
              {t("leases.new.form.sections.propertyTenant.title")}
            </CardTitle>
            <CardDescription>
              {t("leases.new.form.sections.propertyTenant.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="property">
                  {t(
                    "leases.new.form.sections.propertyTenant.labels.property",
                    {
                      values: { count: properties.length },
                    }
                  )}
                </Label>
                <Select
                  value={leaseData.propertyId}
                  onValueChange={(value) => {
                    handleInputChange("propertyId", value);
                    handleInputChange("unitId", ""); // Reset unit when property changes
                  }}
                >
                  <SelectTrigger id="propertySelect">
                    <SelectValue
                      placeholder={t(
                        "leases.new.form.sections.propertyTenant.placeholders.property"
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((property) => (
                      <SelectItem key={property._id} value={property._id}>
                        {property.name} - {property.address?.street},{" "}
                        {property.address?.city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldErrors.propertyId && (
                  <p className="text-destructive text-sm">
                    {fieldErrors.propertyId}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="unit">
                  {leaseData.propertyId
                    ? t(
                      "leases.new.form.sections.propertyTenant.labels.unitWithCount",
                      { values: { count: getAvailableUnits().length } }
                    )
                    : t("leases.new.form.sections.propertyTenant.labels.unit")}
                </Label>
                <Select
                  value={leaseData.unitId}
                  onValueChange={handleUnitChange}
                  disabled={!leaseData.propertyId || loadingProperties}
                >
                  <SelectTrigger id="unitSelect">
                    <SelectValue
                      placeholder={
                        !leaseData.propertyId
                          ? t(
                            "leases.new.form.sections.propertyTenant.placeholders.selectPropertyFirst"
                          )
                          : loadingProperties
                            ? t(
                              "leases.new.form.sections.propertyTenant.placeholders.loadingUnits"
                            )
                            : getAvailableUnits().length === 0
                              ? t(
                                "leases.new.form.sections.propertyTenant.placeholders.noUnits"
                              )
                              : t(
                                "leases.new.form.sections.propertyTenant.placeholders.unit"
                              )
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableUnits().length > 0 ? (
                      getAvailableUnits().map((unit) => (
                        <SelectItem key={unit._id} value={unit._id}>
                          <div className="flex items-center justify-between w-full">
                            <span>
                              {t(
                                "leases.new.form.sections.propertyTenant.unitLabel",
                                { values: { unitNumber: unit.unitNumber } }
                              )}
                            </span>
                            <span className="text-xs text-gray-500 ml-2">
                              {t(
                                "leases.new.form.sections.propertyTenant.unitSummary",
                                {
                                  values: {
                                    bedrooms: unit.bedrooms ?? 0,
                                    bathrooms: unit.bathrooms ?? 0,
                                    rent: formatCurrency(unit.rentAmount ?? 0),
                                    perMonth: t("leases.labels.perMonth"),
                                  },
                                }
                              )}
                            </span>
                          </div>
                        </SelectItem>
                      ))
                    ) : leaseData.propertyId ? (
                      <div className="px-2 py-1 text-sm text-gray-500">
                        {t(
                          "leases.new.form.sections.propertyTenant.messages.noUnitsInProperty"
                        )}
                      </div>
                    ) : null}
                  </SelectContent>
                </Select>
                {fieldErrors.unitId && (
                  <p className="text-destructive text-sm">
                    {fieldErrors.unitId}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="tenant">
                  {t("leases.new.form.sections.propertyTenant.labels.tenant")}
                </Label>
                <Select
                  value={leaseData.tenantId}
                  onValueChange={(value) => handleInputChange("tenantId", value)}
                >
                  <SelectTrigger id="tenantSelect">
                    <SelectValue
                      placeholder={t(
                        "leases.new.form.sections.propertyTenant.placeholders.tenant"
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {tenants.map((tenant) => (
                      <SelectItem key={tenant._id} value={tenant._id}>
                        {tenant.firstName} {tenant.lastName} - {tenant.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldErrors.tenantId && (
                  <p className="text-destructive text-sm">
                    {fieldErrors.tenantId}
                  </p>
                )}
              </div>

              {/* Rent period — how often rent is collected */}
              <div className="space-y-2">
                <Label htmlFor="rentPeriod">
                  {t(
                    "leases.new.form.sections.propertyTenant.labels.rentPeriod",
                    { defaultValue: "Rent period" }
                  )}
                </Label>
                <Select
                  value={leaseData.rentPeriod}
                  onValueChange={handleRentPeriodChange}
                >
                  <SelectTrigger id="rentPeriodSelect">
                    <SelectValue
                      placeholder={t(
                        "leases.new.form.sections.propertyTenant.placeholders.rentPeriod",
                        { defaultValue: "Select rent period" }
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {RENT_PERIOD_OPTIONS.map((period) => (
                      <SelectItem key={period.value} value={period.value}>
                        {period.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldErrors.rentPeriod && (
                  <p className="text-destructive text-sm">
                    {fieldErrors.rentPeriod}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Selected Unit Details */}
        {leaseData.unitId && getSelectedUnit() && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-primary">
                {t("leases.new.form.sections.selectedUnit.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <div className="text-xs text-gray-500 mb-1">
                    {t("leases.new.form.sections.selectedUnit.labels.unit")}
                  </div>
                  <div className="font-medium">
                    {getSelectedUnit()?.unitNumber} (
                    {getSelectedUnit()?.unitType})
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">
                    {t("leases.new.form.sections.selectedUnit.labels.size")}
                  </div>
                  <div className="font-medium">
                    {t("leases.new.form.sections.selectedUnit.sizeValue", {
                      values: {
                        bedrooms: getSelectedUnit()?.bedrooms ?? 0,
                        bathrooms: getSelectedUnit()?.bathrooms ?? 0,
                      },
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">
                    {t("leases.new.form.sections.selectedUnit.labels.area")}
                  </div>
                  <div className="font-medium">
                    {t("leases.new.form.sections.selectedUnit.areaValue", {
                      values: { area: getSelectedUnit()?.squareFootage ?? 0 },
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">
                    {t("leases.new.form.sections.selectedUnit.labels.rent")}
                  </div>
                  <div className="font-medium text-green-600">
                    {t("leases.new.form.sections.selectedUnit.rentValue", {
                      values: {
                        amount: formatCurrency(
                          getSelectedUnit()?.rentAmount ?? 0
                        ),
                        perMonth: t("leases.labels.perMonth"),
                      },
                    })}
                  </div>
                </div>
              </div>
              {(getSelectedUnit()?.rentAmount ||
                getSelectedUnit()?.securityDeposit) && (
                  <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    {t("leases.new.form.sections.selectedUnit.autoFillNote")}
                  </div>
                )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {t("leases.new.form.sections.dates.title")}
            </CardTitle>
            <CardDescription>
              {t("leases.new.form.sections.dates.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startDate">
                  {t("leases.new.form.sections.dates.labels.startDate")}
                </Label>
                <FormDatePicker
                  id="startDatePicker"
                  key={`start-date-${leaseData.startDate}`}
                  value={
                    leaseData.startDate
                      ? new Date(leaseData.startDate + "T00:00:00")
                      : undefined
                  }
                  onChange={(date) => {
                    if (date) {
                      // Create a new date to avoid timezone issues
                      const localDate = new Date(
                        date.getFullYear(),
                        date.getMonth(),
                        date.getDate()
                      );
                      handleInputChange(
                        "startDate",
                        format(localDate, "yyyy-MM-dd")
                      );
                    } else {
                      handleInputChange("startDate", "");
                    }
                  }}
                  placeholder={t(
                    "leases.new.form.sections.dates.placeholders.startDate"
                  )}
                  format="dd/MM/yyyy"
                  fromYear={new Date().getFullYear()}
                  toYear={new Date().getFullYear() + 5}
                />
                {fieldErrors.startDate && (
                  <p className="text-destructive text-sm">
                    {fieldErrors.startDate}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="endDate">
                  {t("leases.new.form.sections.dates.labels.endDate")}{" "}
                  <span className="text-xs text-muted-foreground font-normal">
                    (optional)
                  </span>
                </Label>
                <FormDatePicker
                  id="endDatePicker"
                  key={`end-date-${leaseData.endDate}-${leaseData.startDate}`}
                  value={
                    leaseData.endDate
                      ? new Date(leaseData.endDate + "T00:00:00")
                      : undefined
                  }
                  onChange={(date) => {
                    if (date) {
                      // Create a new date to avoid timezone issues
                      const localDate = new Date(
                        date.getFullYear(),
                        date.getMonth(),
                        date.getDate()
                      );
                      handleInputChange(
                        "endDate",
                        format(localDate, "yyyy-MM-dd")
                      );
                    } else {
                      handleInputChange("endDate", "");
                    }
                  }}
                  placeholder={t(
                    "leases.new.form.sections.dates.placeholders.endDate"
                  )}
                  format="dd/MM/yyyy"
                  disabled={(date) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const checkDate = new Date(date);
                    checkDate.setHours(0, 0, 0, 0);

                    if (!leaseData.startDate) return checkDate < today;

                    const startDate = new Date(
                      leaseData.startDate + "T00:00:00"
                    );
                    startDate.setHours(0, 0, 0, 0);
                    return checkDate <= startDate;
                  }}
                  fromYear={new Date().getFullYear()}
                  toYear={new Date().getFullYear() + 10}
                />
                {fieldErrors.endDate && (
                  <p className="text-destructive text-sm">
                    {fieldErrors.endDate}
                  </p>
                )}
              </div>
            </div>

            {/* Live duration / period readout */}
            {rentPricing && (
              <p className="text-xs text-muted-foreground">
                {`${rentPricing.days} day${rentPricing.days === 1 ? "" : "s"
                  } selected — ${rentPricing.periods} ${rentPricing.isDay ? "day" : "week"
                  }${rentPricing.periods === 1 ? "" : "s"} of rent.`}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Financial Terms */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PoundSterling className="h-5 w-5" />
              {t("leases.details.financial.title")}
            </CardTitle>
            <CardDescription>
              {t("leases.new.form.sections.financial.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="rentAmount">
                  {t("leases.details.financial.rent")}
                  {perPeriodLabel ? ` (${perPeriodLabel})` : ""}
                </Label>
                <Input
                  id="rentAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={leaseData.rentAmount}
                  onChange={(e) =>
                    handleInputChange(
                      "rentAmount",
                      parseFloat(e.target.value) || 0
                    )
                  }
                  placeholder="2000.00"
                  required
                />
                {fieldErrors.rentAmount && (
                  <p className="text-destructive text-sm">
                    {fieldErrors.rentAmount}
                  </p>
                )}
                {rentCollectionNote && (
                  <p className="text-xs text-muted-foreground">
                    {rentCollectionNote}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="securityDeposit">
                  {t("leases.details.financial.securityDeposit")}
                </Label>
                <Input
                  id="securityDeposit"
                  type="number"
                  min="0"
                  step="0.01"
                  value={leaseData.securityDeposit}
                  onChange={(e) =>
                    handleInputChange(
                      "securityDeposit",
                      parseFloat(e.target.value) || 0
                    )
                  }
                  placeholder="2000.00"
                />
                {fieldErrors.securityDeposit && (
                  <p className="text-destructive text-sm">
                    {fieldErrors.securityDeposit}
                  </p>
                )}
              </div>

              {/* Monthly: collection day. Day/Week: calculated total (edit only). */}
              {isMonthly && (
                <div className="space-y-2">
                  <Label htmlFor="rentDueDay">
                    {t("leases.new.form.sections.financial.labels.rentDueDay")}
                  </Label>
                  <Select
                    value={leaseData.rentDueDay.toString()}
                    onValueChange={(value) =>
                      handleInputChange("rentDueDay", parseInt(value))
                    }
                  >
                    <SelectTrigger id="rentDueDaySelect">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                        <SelectItem key={day} value={day.toString()}>
                          {t(
                            "leases.new.form.sections.financial.labels.rentDueDayOption",
                            { values: { day } }
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Rent is collected automatically each month on this day.
                  </p>
                </div>
              )}

              {isEditMode && (
                <div className="space-y-2">
                  <Label htmlFor="totalAmount">Total amount</Label>
                  <Input
                    id="totalAmount"
                    type="number"
                    value={computedTotal}
                    readOnly
                    disabled
                    className="bg-muted font-medium"
                  />
                  <p className="text-xs text-muted-foreground">
                    {rentPricing
                      ? `${rentPricing.periods} ${rentPricing.isDay ? "day" : "week"
                      }${rentPricing.periods === 1 ? "" : "s"
                      } × ${formatCurrency(
                        leaseData.rentAmount || 0
                      )} = ${formatCurrency(computedTotal)}`
                      : "Select start and end dates to calculate the total."}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Late Fee Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              {t("leases.new.form.sections.lateFees.title")}
            </CardTitle>
            <CardDescription>
              {t("leases.new.form.sections.lateFees.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="lateFeeAmount">
                  {t("leases.new.form.sections.lateFees.labels.amount")}
                  {isPercentageLateFee && " (%)"}
                </Label>
                <Input
                  id="lateFeeAmount"
                  type="number"
                  min="0"
                  // A percentage of rent is capped at 100; a fixed amount is not.
                  max={isPercentageLateFee ? 100 : undefined}
                  step="0.01"
                  value={leaseData.lateFeeAmount}
                  onChange={(e) =>
                    handleInputChange(
                      "lateFeeAmount",
                      parseFloat(e.target.value) || 0
                    )
                  }
                  placeholder={isPercentageLateFee ? "10" : "50.00"}
                />
                {fieldErrors.lateFeeAmount && (
                  <p className="text-destructive text-sm">
                    {fieldErrors.lateFeeAmount}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="lateFeeGracePeriodDays">
                  {t("leases.new.form.sections.lateFees.labels.gracePeriod")}
                </Label>
                <Input
                  id="lateFeeGracePeriodDays"
                  type="number"
                  min="0"
                  value={leaseData.lateFeeGracePeriodDays}
                  onChange={(e) =>
                    handleInputChange(
                      "lateFeeGracePeriodDays",
                      parseInt(e.target.value) || 0
                    )
                  }
                  placeholder="5"
                />
                {fieldErrors.lateFeeGracePeriodDays && (
                  <p className="text-destructive text-sm">
                    {fieldErrors.lateFeeGracePeriodDays}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="lateFeeType">
                  {t("leases.new.form.sections.lateFees.labels.type")}
                </Label>
                <Select
                  value={leaseData.lateFeeType}
                  onValueChange={(value: "fixed" | "percentage") =>
                    handleInputChange("lateFeeType", value)
                  }
                >
                  <SelectTrigger id="lateFeeTypeSelect">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">
                      {t(
                        "leases.new.form.sections.lateFees.options.fixedAmount"
                      )}
                    </SelectItem>
                    <SelectItem value="percentage">
                      {t(
                        "leases.new.form.sections.lateFees.options.percentageOfRent"
                      )}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Automation Settings — fixed-term leases only. Without an end date
            the lease is open-ended and invoiced reactively, so these controls
            are hidden rather than shown with no effect. */}
        {leaseData.endDate && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                {t("leases.new.form.sections.automation.title")}
              </CardTitle>
              <CardDescription>
                {t("leases.new.form.sections.automation.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="autoGenerateInvoices">
                    {t("leases.new.form.sections.automation.labels.autoGenerate")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("leases.new.form.sections.automation.help.autoGenerate")}
                  </p>
                </div>
                <Switch
                  id="autoGenerateInvoices"
                  checked={leaseData.autoGenerateInvoices}
                  onCheckedChange={(checked) =>
                    handleInputChange("autoGenerateInvoices", checked)
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="autoEmailInvoices">
                    {t("leases.new.form.sections.automation.labels.autoEmail")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("leases.new.form.sections.automation.help.autoEmail")}
                  </p>
                </div>
                <Switch
                  id="autoEmailInvoices"
                  checked={leaseData.autoEmailInvoices}
                  onCheckedChange={(checked) =>
                    handleInputChange("autoEmailInvoices", checked)
                  }
                  disabled={!leaseData.autoGenerateInvoices}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary & Submit */}
        <Card>
          {/* <CardHeader>
            <CardTitle>{t("leases.new.form.sections.review.title")}</CardTitle>
            <CardDescription>
              {t("leases.new.form.sections.review.description")}
            </CardDescription>
          </CardHeader> */}
          <CardContent className="space-y-4">
            {/* {leaseData.autoGenerateInvoices && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  {t("leases.new.form.sections.review.invoicesSummary", {
                    values: {
                      depositPart:
                        leaseData.securityDeposit > 0
                          ? t(
                            "leases.new.form.sections.review.fragments.securityDeposit"
                          )
                          : "",
                      emailPart: leaseData.autoEmailInvoices
                        ? t(
                          "leases.new.form.sections.review.fragments.autoEmail"
                        )
                        : "",
                    },
                  })}
                </AlertDescription>
              </Alert>
            )} */}

            <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (isEditMode) {
                    setLeaseData({ ...originalLeaseData });
                  } else {
                    const resetState = createInitialLeaseState();
                    setLeaseData(resetState);
                    setOriginalLeaseData(createInitialLeaseState());
                  }
                }}
                disabled={
                  submitting || savingDraft || (isEditMode && initializingLease)
                }
              >
                {resetLabel}
              </Button>

              {/* Save as Draft — creates the lease with a draft status (create only) */}
              {!isEditMode && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void persistLease(true)}
                  disabled={submitting || savingDraft}
                  className="flex items-center gap-2"
                >
                  {savingDraft ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {t("leases.new.form.buttons.saveDraft", {
                    defaultValue: "Save as Draft",
                  })}
                </Button>
              )}

              <Button
                type="submit"
                disabled={
                  submitting || savingDraft || (isEditMode && initializingLease)
                }
                className="flex-1"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {submitLoadingLabel}
                  </>
                ) : (
                  submitLabel
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}