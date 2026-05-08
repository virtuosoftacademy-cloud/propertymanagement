"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { StripePayment } from "@/components/payments/stripe-payment";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  CreditCard,
  Building2,
  User,
  Calendar,
  DollarSign,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { PaymentStatus, PaymentType } from "@/types";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";

interface PaymentDetails {
  _id: string;
  amount: number;
  type: PaymentType;
  status: PaymentStatus;
  dueDate: string;
  description?: string;
  tenantId: {
    _id: string;
    userId: {
      firstName: string;
      lastName: string;
      email: string;
    };
  };
  propertyId: {
    _id: string;
    name: string;
    address: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
    };
  };
  createdAt: string;
}

export default function PaymentProcessingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const { t, formatCurrency, formatDate } = useLocalizationContext();

  const [payment, setPayment] = useState<PaymentDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [resolvedParams, setResolvedParams] = useState<{ id: string } | null>(
    null
  );

  // Resolve params
  useEffect(() => {
    params.then(setResolvedParams);
  }, [params]);

  // Fetch payment details
  useEffect(() => {
    const fetchPayment = async () => {
      if (!resolvedParams?.id) return;

      try {
        setIsLoading(true);
        const response = await fetch(`/api/payments/${resolvedParams.id}`);

        if (response.ok) {
          const result = await response.json();
          setPayment(result.data);
        } else {
          const error = await response.json();
          throw new Error(error.error || "Failed to fetch payment");
        }
      } catch (error) {
        console.error("Error fetching payment:", error);
        toast.error(t("payments.pay.toasts.loadFailed"));
        router.push("/dashboard/payments");
      } finally {
        setIsLoading(false);
      }
    };

    if (session && resolvedParams) {
      fetchPayment();
    }
  }, [session, resolvedParams, router, t]);

  const handlePaymentSuccess = () => {
    toast.success(t("payments.pay.toasts.paymentSuccess"));
    // Redirect to payment details or success page
    router.push(`/dashboard/payments/${payment?._id}?success=true`);
  };

  const handlePaymentError = (error: string) => {
    toast.error(t("payments.pay.toasts.paymentFailed", { values: { error } }));
  };

  const getDaysOverdue = (dueDate: string) => {
    const now = new Date();
    const due = new Date(dueDate);
    const diffTime = now.getTime() - due.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>

        {/* Content Skeleton */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h2 className="text-2xl font-semibold">
            {t("payments.pay.notFound.title")}
          </h2>
          <p className="text-muted-foreground mt-2">
            {t("payments.pay.notFound.message")}
          </p>
          <Link href="/dashboard/payments">
            <Button className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("payments.pay.notFound.button")}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Check if payment can be processed
  if (payment.status === PaymentStatus.COMPLETED) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h2 className="text-2xl font-semibold">
            {t("payments.pay.alreadyCompleted.title")}
          </h2>
          <p className="text-muted-foreground mt-2">
            {t("payments.pay.alreadyCompleted.message")}
          </p>
          <Link href={`/dashboard/payments/${payment._id}`}>
            <Button className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("payments.pay.alreadyCompleted.button")}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const daysOverdue = getDaysOverdue(payment.dueDate);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/payments/${payment._id}`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t("payments.pay.header.backButton")}
              </Button>
            </Link>
          </div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <CreditCard className="h-8 w-8" />
            {t("payments.pay.header.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("payments.pay.header.subtitle")}
          </p>
        </div>
      </div>

      {/* Overdue Warning */}
      {daysOverdue > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-orange-800">
              <AlertTriangle className="h-5 w-5" />
              <div>
                <p className="font-medium">
                  {t("payments.pay.overdueWarning.title")}
                </p>
                <p className="text-sm">
                  {daysOverdue === 1
                    ? t("payments.pay.overdueWarning.message", {
                        values: { days: daysOverdue },
                      })
                    : t("payments.pay.overdueWarning.messagePlural", {
                        values: { days: daysOverdue },
                      })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Payment Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              {t("payments.pay.summary.title")}
            </CardTitle>
            <CardDescription>
              {t("payments.pay.summary.subtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">
                {t("payments.pay.summary.amount")}
              </span>
              <span className="text-2xl font-bold">
                {formatCurrency(payment.amount)}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">
                {t("payments.pay.summary.type")}
              </span>
              <Badge variant="outline" className="capitalize">
                {payment.type.replace("_", " ")}
              </Badge>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">
                {t("payments.pay.summary.dueDate")}
              </span>
              <span>{formatDate(payment.dueDate)}</span>
            </div>

            {payment.description && (
              <div>
                <span className="text-muted-foreground">
                  {t("payments.pay.summary.description")}
                </span>
                <p className="text-sm mt-1">{payment.description}</p>
              </div>
            )}

            <div className="pt-4 border-t">
              <div className="flex items-start gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium">{payment.propertyId.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {payment.propertyId.address.street}
                    <br />
                    {payment.propertyId.address.city},{" "}
                    {payment.propertyId.address.state}{" "}
                    {payment.propertyId.address.zipCode}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <User className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">
                  {payment.tenantId?.userId?.firstName || ""}{" "}
                  {payment.tenantId?.userId?.lastName || "Tenant"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {payment.tenantId?.userId?.email || "N/A"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stripe Payment Form */}
        <StripePayment
          paymentId={payment._id}
          amount={payment.amount}
          description={`${payment.type.replace("_", " ")} payment for ${
            payment.propertyId.name
          }`}
          onSuccess={handlePaymentSuccess}
          onError={handlePaymentError}
        />
      </div>
    </div>
  );
}
