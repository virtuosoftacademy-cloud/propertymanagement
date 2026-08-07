"use client";

import { showSimpleError, showSimpleWarning } from "@/lib/toast-notifications";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-state";
import { ArrowLeft, FileText } from "lucide-react";
import SimplifiedLeaseCreation from "@/components/lease/SimplifiedLeaseCreation";
import { leaseService, LeaseResponse } from "@/lib/services/lease.service";
import { LeaseStatus } from "@/types";

interface EditLeasePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function EditLeasePage({ params }: EditLeasePageProps) {
  const router = useRouter();
  const [lease, setLease] = useState<LeaseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [leaseId, setLeaseId] = useState<string | null>(null);
  const lastFetchedId = useRef<string | null>(null);

  useEffect(() => {
    const getParams = async () => {
      const resolvedParams = await params;
      setLeaseId(resolvedParams.id);
    };
    getParams();
  }, [params]);

  useEffect(() => {
    if (!leaseId || lastFetchedId.current === leaseId) {
      return;
    }

    lastFetchedId.current = leaseId;
    void fetchLease(leaseId);
  }, [leaseId]);

  const fetchLease = async (leaseId: string) => {
    try {
      setLoading(true);
      const leaseData = await leaseService.getLeaseById(leaseId);
      setLease(leaseData);

      // All statuses are editable here. Status itself is changed via the
      // status actions (PATCH), not this form — so warn rather than block,
      // since edits to a live tenancy affect rent and invoicing.
      if (leaseData.status === LeaseStatus.ACTIVE) {
        showSimpleWarning(
          "Editing a live tenancy",
          "Changes to rent, dates or payment settings affect future invoicing. To change the lease status, use the status actions instead."
        );
      } else if (
        leaseData.status === LeaseStatus.TERMINATED ||
        leaseData.status === LeaseStatus.EXPIRED
      ) {
        showSimpleWarning(
          "Editing a closed lease",
          "This lease is no longer active. Edits are recorded but will not resume billing."
        );
      }
    } catch (error) {
      showSimpleError("Load Error", "Failed to fetch lease details");
      router.push("/dashboard/leases");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[90vh]">
        <LoadingSpinner message="" size="lg" />
      </div>
    );
  }

  if (!lease) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Lease not found</h3>
          <p className="text-muted-foreground mb-4">
            {`The lease you're trying to edit doesn't exist or has been deleted.`}
          </p>
          <Button onClick={() => router.push("/dashboard/leases")}>
            Back to Leases
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Lease</h1>
          <p className="text-muted-foreground">
            {lease.propertyId?.name
              ? `Update the lease agreement for ${lease.propertyId.name}`
              : "Update the lease agreement details"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.back()}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Leases
        </Button>
      </div>

      <SimplifiedLeaseCreation
        mode="edit"
        leaseId={leaseId ?? undefined}
        initialLease={lease}
        onSuccess={(updatedId) => {
          const targetId = updatedId ?? lease._id ?? leaseId ?? undefined;

          if (targetId) {
            router.push(`/dashboard/leases/${targetId}`);
          } else {
            router.push("/dashboard/leases");
          }
        }}
      />
    </div>
  );
}
