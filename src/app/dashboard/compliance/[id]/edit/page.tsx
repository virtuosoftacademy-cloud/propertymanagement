"use client";

import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { useParams, useRouter } from "next/navigation";
import { UserRole, ComplianceCategory } from "@/types";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";
import ComplianceReportForm from "@/components/forms/compliance-report-form";

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

interface ComplianceReportData {
  _id: string;
  propertyId: string;
  category?: ComplianceCategory;
  issueDate: string;
  expiryDate: string;
  notes?: string;
  estimatedCost?: number;
  images: string[];
}

export default function EditComplianceReportPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const { t } = useLocalizationContext();
  const reportId = Array.isArray(params.id) ? params.id[0] : params.id
  const [notFound, setNotFound] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [initialData, setInitialData] = useState<ComplianceReportData | null>(null);

  const isTenant = session?.user?.role === UserRole.TENANT;

  useEffect(() => {
    if (session) {
      fetchData();
    }
  }, [params.id, session]);

  const fetchData = async () => {
    try {
      // Fetch both in parallel. The form's property <Select> and <ImageUpload>
      // read their data on mount only, so the report and the property list must
      // land in the same commit — otherwise those two fields render blank.
      const [reportRes, propertiesRes] = await Promise.all([
        fetch(`/api/compliance/${params.id}`),
        // Tenants can't edit, so skip the property list for them
        isTenant ? null : fetch("/api/properties?limit=100"),
      ]);

      if (reportRes.status === 404) {
        setNotFound(true);
        return;
      }

      if (!reportRes.ok) {
        throw new Error("Failed to fetch compliance report");
      }

      const reportData = await reportRes.json();
      const report = reportData.data;

      if (propertiesRes) {
        const json = await propertiesRes.json();
        if (json.success && Array.isArray(json.data)) {
          setProperties(json.data);
        } else {
          throw new Error(json.error || "Failed to load properties");
        }
      }

      // Set initial form data. Field names must match the API/model exactly —
      // the form seeds its inputs straight from these keys.
      setInitialData({
        _id: report._id,
        propertyId: report.propertyId?._id || report.propertyId || "",
        category: (report.category as ComplianceCategory) || undefined,
        issueDate: report.issueDate
          ? new Date(report.issueDate).toISOString().slice(0, 10)
          : "",
        expiryDate: report.expiryDate
          ? new Date(report.expiryDate).toISOString().slice(0, 10)
          : "",
        notes: report.notes || "",
        estimatedCost: report.estimatedCost ?? undefined,
        images: report.images || [],
      });
    } catch (error: any) {
      toast.error(error?.message || t("compliance.edit.toasts.loadError"));
      router.push("/dashboard/compliance");
    }
  };

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <h2 className="text-xl font-semibold">
          {t("compliance.edit.notFound.title")}
        </h2>
        <p className="text-muted-foreground text-center">
          {t("compliance.edit.notFound.description")}
        </p>
        <Link href="/dashboard/compliance">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("compliance.edit.notFound.backButton")}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center space-x-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("compliance.edit.header.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("compliance.edit.header.description")}
          </p>
        </div>
        <Link href={"/dashboard/compliance"}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("compliance.edit.header.back")}
          </Button>
        </Link>
      </div>

      {/* Form — mounted only once the report and properties are both in hand,
          since its property <Select> and <ImageUpload> seed themselves on mount */}
      {initialData && (
        <ComplianceReportForm
          mode="edit"
          initialData={initialData}
          properties={properties}
          reportId={reportId}
          onCancel={() => router.push("/dashboard/compliance")}
        />
      )}
    </div>
  );
}