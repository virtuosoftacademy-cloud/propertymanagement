"use client";

import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { useParams, useRouter } from "next/navigation";
import { UserRole } from "@/types";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";
import { ComplianceFormSkeleton } from "@/components/compliance/compliance-skeleton"; // ← your new skeleton
import ComplianceReportForm from "@/components/compliance/ComplianceReport";

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
  propertyId: string;
  category: string;
  issueDate: string;
  expiryDate: string;
  notes?: string;
  estimatedCost?: number;
}

export default function EditComplianceReportPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const { t } = useLocalizationContext();
  const reportId = Array.isArray(params.id) ? params.id[0] : params.id
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
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
      setDataLoading(true);

      // Fetch compliance report first
      const reportRes = await fetch(`/api/compliance/${params.id}`);

      if (!reportRes.ok) {
        throw new Error("Failed to fetch compliance report");
      }

      const reportData = await reportRes.json();
      const report = reportData.data;
      // console.log(report.propertyId?._id)
      // Set initial form data
      setInitialData({
        propertyId: report.propertyId?._id || report.propertyId || "",
        category: report.complianceType || "",
        issueDate: report.issueDate
          ? new Date(report.issueDate).toISOString().slice(0, 10)
          : "",
        expiryDate: report.expiryDate
          ? new Date(report.expiryDate).toISOString().slice(0, 10)
          : "",
        notes: report.notes || "",
        estimatedCost: report.estimatedCost || undefined,
      });

      // Only fetch properties for admin/manager roles (tenants usually can't edit)
      if (!isTenant) {
        const propertiesRes = await fetch("/api/properties?limit=100");

        if (propertiesRes.ok) {
          const res = await fetch("/api/properties?limit=100");
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            setProperties(json.data);
          } else {
            throw new Error(json.error || "Failed to load properties");
          }
        }
      }
    } catch (error: any) {
      toast.error(error?.message || t("compliance.edit.toasts.loadError"));
      router.push("/dashboard/compliance");
    } finally {
      setDataLoading(false);
    }
  };

  const handleSubmit = async (data: any) => {
    try {
      setLoading(true);

      const response = await fetch(`/api/compliance/${params.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          propertyId: data.propertyId,
          complianceType: data.complianceType,
          issueDate: data.issueDate,
          expiryDate: data.expiryDate,
          notes: data.notes || undefined,
          estimatedCost: data.estimatedCost || undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || t("compliance.edit.toasts.updateError"));
      }

      toast.success(t("compliance.edit.toasts.updateSuccess"));
      router.push(`/dashboard/compliance/${params.id}`);
    } catch (error: any) {
      toast.error(error?.message || t("compliance.edit.toasts.updateError"));
    } finally {
      setLoading(false);
    }
  };

  if (dataLoading) {
    return <ComplianceFormSkeleton />;
  }

  if (!initialData) {
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

      {/* Form */}
      <ComplianceReportForm
        mode="edit"
        onSubmit={handleSubmit}
        initialData={initialData}
        properties={properties}
        reportId={reportId}
      />
    </div>
  );
}