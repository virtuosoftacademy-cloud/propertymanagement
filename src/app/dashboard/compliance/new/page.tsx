"use client";

import { toast } from "sonner";
import { UserRole } from "@/types";
import { ArrowLeft } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import ComplianceReportForm from "@/components/compliance/ComplianceReport";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";

interface Property {
  _id: string;
  name: string;
  address: {
    street: string;
    city: string;
    state?: string;
    zipCode?: string;
    country: string;
  };
}

export default function NewComplianceReportPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { t } = useLocalizationContext();

  const [loading, setLoading] = useState(false);
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [pageReady, setPageReady] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  useEffect(() => {
    async function fetchProperties() {
      try {
        const res = await fetch("/api/properties?limit=100");
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setProperties(json.data);
        } else {
          throw new Error(json.error || "Failed to load properties");
        }
      } catch (err) {
        console.error(err);
        toast.error(t("Could not load properties"));
      } finally {
        setLoadingProperties(false);
      }
    }
    fetchProperties();
  }, [t]);
  // Determine user role
  const isTenant = session?.user?.role === UserRole.TENANT;
  const isManagerOrAdmin =
    session?.user?.role === UserRole.MANAGER ||
    session?.user?.role === UserRole.ADMIN;

  useEffect(() => {
    if (status === "loading") return;

    // You can add role-based restrictions here if needed
    if (!session) {
      toast.error(t("Please sign in to create a compliance report"));
      router.push("/auth/signin");
      return;
    }

    // Optional: restrict tenants from creating compliance reports
    if (isTenant) {
      toast.warning(
        t("Tenants cannot create compliance reports. Please contact your property manager.")
      );
      router.push("/dashboard");
      return;
    }

    setPageReady(true);
  }, [status, session, isTenant, router, t]);

  const handleSuccess = (reportId?: string) => {
    toast.success(t("Compliance report created successfully"));
    if (reportId) {
      router.push(`/dashboard/compliance/${reportId}`);
    } else {
      router.push("/dashboard/compliance");
    }
  };

  const handleCancel = () => {
    router.back();
  };

  if (status === "loading" || !pageReady) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Optional: tenant restriction UI
  if (isTenant) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              {t("New Compliance Report")}
            </h1>
            <p className="text-muted-foreground">
              {t("Create a new compliance certificate or report")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="hover:bg-blue-50 hover:text-blue-600 border transition-colors"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("Back")}
          </Button>
        </div>

        <Card className="border-0 shadow-lg bg-white/70 dark:bg-gray-900/70 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              {t("Access Restricted")}
            </CardTitle>
            <CardDescription>
              {t("Tenants do not have permission to create compliance reports.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t("Please contact your property manager or administrator.")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            {t("New Compliance Report")}
          </h1>
          <p className="text-muted-foreground">
            {t("Add a new compliance certificate or inspection report")}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="hover:bg-blue-50 hover:text-blue-600 border transition-colors"
          onClick={handleCancel}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("Back to Compliance Reports")}
        </Button>
      </div>

      {/* Main Form */}
      <ComplianceReportForm
        mode="create"
        onSuccess={handleSuccess}
        onCancel={handleCancel}
        properties={properties}
      />
    </div>
  );
}