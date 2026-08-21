"use client";

import Link from "next/link";
import { useState} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Building2, ArrowLeft } from "lucide-react";
import { EnhancedPropertyForm } from "@/components/properties/PropertyForm";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";
import {
  showErrorToast,
  showSimpleError,
  showSimpleSuccess,
  parseValidationErrors,
} from "@/lib/toast-notifications";
import {
  UpgradePrompt,
  asUnitLimitError,
  type UnitLimitError,
} from "@/components/billing/upgrade-prompt";

export default function EnhancedNewPropertyPage() {
  const router = useRouter();
  const { t } = useLocalizationContext();
  const [isLoading, setIsLoading] = useState(false);
  // Kept on the page rather than shown as a toast: a toast vanishes and leaves
  // the user staring at a form that will not submit.
  const [limitError, setLimitError] = useState<UnitLimitError | null>(null);
  
  const handlePropertySubmit = async (data: any) => {
    setIsLoading(true);
    setLimitError(null);
    try {
      const response = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      // A plan ceiling is not a validation failure — it needs an upgrade link,
      // not an error message the user can do nothing about.
      const limit = asUnitLimitError(result);
      if (limit) {
        setLimitError(limit);
        return;
      }

      if (!response.ok) {
        const errorDetails = result.details || result.error || result.message;
        const errorMessage =
          typeof errorDetails === "string"
            ? errorDetails
            : Array.isArray(errorDetails)
            ? errorDetails.join(", ")
            : JSON.stringify(errorDetails);

        throw new Error(errorMessage || "Failed to create property");
      }

      const property = result.data;

      showSimpleSuccess(
        t("properties.newProperty.success.title"),
        t("properties.newProperty.success.description", {
          values: { name: data.name },
        })
      );
      router.push(`/dashboard/properties/${property._id}`);
    } catch (error) {
      console.error("Property creation error:", error);

      const errorMessage =
        error instanceof Error
          ? error.message
          : t("properties.newProperty.error.fallbackMessage");

      const parsedErrors = parseValidationErrors(errorMessage);

      if (parsedErrors.length > 1 || parsedErrors.some((e) => e.field)) {
        showErrorToast({
          title: t("properties.newProperty.error.title"),
          description: `${parsedErrors.length} validation ${
            parsedErrors.length === 1 ? "error" : "errors"
          } found`,
          items: parsedErrors,
        });
      } else {
        showSimpleError(
          t("properties.newProperty.error.title"),
          errorMessage
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Building2 className="h-8 w-8" />
              {t("properties.newProperty.title")}
            </h1>
            <p className="text-muted-foreground">
              {t("properties.newProperty.subtitle")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 border rounded-lg">
          <Link href="/dashboard/properties">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("properties.newProperty.backToList")}
            </Button>
          </Link>
        </div>
      </div>

      <UpgradePrompt
        open={Boolean(limitError)}
        onOpenChange={(next) => { if (!next) setLimitError(null); }}
        message={limitError?.error ?? ""}
        allowance={limitError?.allowance}
        upgradeUrl={limitError?.upgradeUrl}
      />

      <EnhancedPropertyForm
        onSubmit={handlePropertySubmit}
        isLoading={isLoading}
        mode="create"
      />
    </div>
  );
}