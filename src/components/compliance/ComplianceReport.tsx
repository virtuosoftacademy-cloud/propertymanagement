"use client";

import { z } from "zod";
import { toast } from "sonner";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label"; // kept for consistency, but mostly using FormLabel
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { FormDatePicker } from "@/components/ui/date-picker";
import PropertyDocReport from "./PropertyDocReport";
import {
  Home,
  Calendar,
  FileText,
  DollarSign,
} from "lucide-react";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";
import { useParams, useRouter } from "next/navigation";

// ────────────────────────────────────────────────
// Schema
// ────────────────────────────────────────────────
const complianceReportSchema = z.object({
  propertyId: z.string().min(1, "Property is required"),
  category: z.string().min(1, "Category is required"),
  issueDate: z.string().min(1, "Issue date is required"),
  expiryDate: z.string().min(1, "Expiry date is required"),
  notes: z.string().max(1000, "Notes too long").optional(),
  estimatedCost: z
    .number()
    .min(0, "Cost cannot be negative")
    .optional()
    .refine(
      (val) => !val || !isNaN(val),
      "Must be a valid number"
    ),
});

type ComplianceReportFormData = z.infer<typeof complianceReportSchema>;

interface ComplianceReportFormProps {
  mode?: "create" | "edit";
  reportId?: string;
  initialData?: Partial<ComplianceReportFormData> & { _id?: string };
  onSuccess?: (reportId?: string) => void;
  onCancel?: () => void;

  properties: Array<{
    _id: string;
    name: string;
    address: {
      street: string;
      city: string;
      state?: string;
      zipCode?: string;
      country: string;
    };
  }>;
}

const categories = [
  { value: "fire-safety", label: "Fire Safety Certificate" },
  { value: "electrical", label: "Electrical Safety" },
  { value: "structural", label: "Structural Safety" },
  { value: "elevator", label: "Elevator / Lift Certificate" },
  { value: "pest-control", label: "Pest Control Certificate" },
  { value: "health-hygiene", label: "Health & Hygiene Compliance" },
  { value: "general", label: "General Building Compliance" },
];

export default function ComplianceReportForm({
  mode = "create",
  reportId,
  initialData,
  onSuccess,
  onCancel,
  properties = [],
}: ComplianceReportFormProps) {
  const { t } = useLocalizationContext();
  const isEditMode = mode === "edit";

  const form = useForm<ComplianceReportFormData>({
    resolver: zodResolver(complianceReportSchema),
    defaultValues: {
      propertyId: initialData?.propertyId || "",
      category: initialData?.category || "",
      issueDate: initialData?.issueDate || "",
      expiryDate: initialData?.expiryDate || "",
      notes: initialData?.notes || "",
      estimatedCost: initialData?.estimatedCost ?? undefined,
    },
  });

  const watchedPropertyId = form.watch("propertyId");
  const watchedIssueDate = form.watch("issueDate");

  // Optional: auto-clear expiry if issue date changes to later date
  useEffect(() => {
    const currentExpiry = form.getValues("expiryDate");
    if (
      currentExpiry &&
      watchedIssueDate &&
      new Date(currentExpiry) <= new Date(watchedIssueDate)
    ) {
      form.setValue("expiryDate", "");
      toast.info("Expiry date was cleared because it was before the new issue date");
    }
  }, [watchedIssueDate, form]);
  const router = useRouter()
  const handleFormSubmit = async (data: ComplianceReportFormData) => {
    const payload = {
      propertyId: data.propertyId,
      category: data.category,
      issueDate: data.issueDate,
      expiryDate: data.expiryDate,
      notes: data.notes?.trim() || undefined,
      estimatedCost: data.estimatedCost ?? undefined,
    };

    const url = isEditMode && reportId ? `/api/compliance/${reportId}` : "/api/compliance";
    const method = isEditMode ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || `Failed to ${isEditMode ? "update" : "create"} report`);
      }

      const savedId = json.data?._id || reportId;
      toast.success(isEditMode ? "Report updated successfully" : "Report created successfully");
      router.push(`/dashboard/compliance/${reportId}`);
      onSuccess?.(savedId);
    } catch (err) {
      toast.error(
        isEditMode ? "Failed to update report" : "Failed to create report",
        { description: err instanceof Error ? err.message : undefined }
      );
    }
  };

  return (
    <div className="w-full space-y-8">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleFormSubmit)}
          className="space-y-8"
        >
          {/* Header / Back button could be moved outside or kept in parent */}
          {/* Main Content */}

          {/* Property & Type */}
          <Card className="border-0 shadow-lg bg-white/70 dark:bg-gray-900/70 backdrop-blur-sm">
            <CardHeader className="pb-6">
              <CardTitle className="flex items-center gap-3 text-xl">
                <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
                  <Home className="h-5 w-5" />
                </div>
                {t("compliance.form.propertyAndType.title") || "Property & Compliance Type"}
              </CardTitle>
              <CardDescription className="text-base">
                {t("compliance.form.propertyAndType.description") ||
                  "Select the property and type of compliance certificate"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="propertyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Property <span className="text-red-500 text-xs">*</span>
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || undefined}
                      >
                        <FormControl>
                          <SelectTrigger className="h-11 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500/20 transition-all duration-200">
                            <SelectValue placeholder="Select property" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {properties.map((p) => (
                            <SelectItem key={p._id} value={p._id}>
                              <div>
                                <div className="font-medium">{p.name}</div>
                                <div className="text-sm text-muted-foreground">
                                  {p.address?.street}, {p.address?.city}
                                </div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-red-500 text-sm" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Compliance Type <span className="text-red-500 text-xs">*</span>
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || undefined}
                      >
                        <FormControl>
                          <SelectTrigger className="h-11 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500/20 transition-all duration-200">
                            <SelectValue placeholder="Select compliance type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-red-500 text-sm" />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Validity Period */}
          <Card className="border-0 shadow-lg bg-white/70 dark:bg-gray-900/70 backdrop-blur-sm">
            <CardHeader className="pb-6">
              <CardTitle className="flex items-center gap-3 text-xl">
                <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 text-white">
                  <Calendar className="h-5 w-5" />
                </div>
                Validity Period
              </CardTitle>
              <CardDescription className="text-base">
                Set when this compliance certificate was issued and when it expires
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <FormField
                control={form.control}
                name="issueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Issue Date <span className="text-red-500 text-xs">*</span>
                    </FormLabel>
                    <FormControl>
                      <FormDatePicker
                        value={field.value ? new Date(field.value) : undefined}
                        onChange={(date) =>
                          field.onChange(date ? format(date, "yyyy-MM-dd") : "")
                        }
                        placeholder="Select issue date"
                        disabled={(date) => date > new Date()}
                        toYear={new Date().getFullYear() + 1}
                      />
                    </FormControl>
                    <FormMessage className="text-red-500 text-sm" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expiryDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Expiry Date <span className="text-red-500 text-xs">*</span>
                    </FormLabel>
                    <FormControl>
                      <FormDatePicker
                        value={field.value ? new Date(field.value) : undefined}
                        onChange={(date) =>
                          field.onChange(date ? format(date, "yyyy-MM-dd") : "")
                        }
                        placeholder="Select expiry date"
                        disabled={(date) => {
                          if (!watchedIssueDate) return date < new Date();
                          return date <= new Date(watchedIssueDate);
                        }}
                        fromYear={new Date().getFullYear() - 5}
                        toYear={new Date().getFullYear() + 15}
                      />
                    </FormControl>
                    <FormMessage className="text-red-500 text-sm" />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Estimated Cost & Notes */}
          <Card className="border-0 shadow-lg bg-white/70 dark:bg-gray-900/70 backdrop-blur-sm">
            <CardHeader className="pb-6">
              <CardTitle className="flex items-center gap-3 text-xl">
                <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                  <DollarSign className="h-5 w-5" />
                </div>
                {t("compliance.form.costandAdd.title") && "Cost & Additional Notes"}
              </CardTitle>
              <CardDescription className="text-base">
                {t("compliance.form.costandAdd.description") && "Optional information about estimated cost and any remarks"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="estimatedCost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Estimated Cost
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="40"
                        min="0"
                        placeholder="0"
                        className="h-11 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500/20 transition-all duration-200"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === "" ? undefined : Number(e.target.value)
                          )
                        }
                      />
                    </FormControl>
                    <FormDescription className="text-sm text-gray-500">
                      Approximate cost of obtaining/renewing this certificate
                    </FormDescription>
                    <FormMessage className="text-red-500 text-sm" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Additional Notes
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Remarks, observations, special conditions..."
                        className="min-h-[120px] resize-y border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500/20 transition-all duration-200"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormDescription className="text-sm text-gray-500">
                      Any extra information or follow-up reminders
                    </FormDescription>
                    <FormMessage className="text-red-500 text-sm" />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Documents */}
          <Card className="border-0 shadow-lg bg-white/70 dark:bg-gray-900/70 backdrop-blur-sm">
            <CardHeader className="pb-6">
              <CardTitle className="flex items-center gap-3 text-xl">
                <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white">
                  <FileText className="h-5 w-5" />
                </div>
                {t("compliance.form.support.title") && "Supporting Documents"}
              </CardTitle>
              <CardDescription className="text-base">
                {t("compliance.form.support.description") && "Upload certificate, inspection report, photos, etc."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PropertyDocReport
                propertyId={watchedPropertyId}
                reportId={reportId}
                disabled={form.formState.isSubmitting}
              />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-4 pt-4">
            <Button
              type="button"
              variant="outline"
              className="h-11 px-6"
              onClick={onCancel || (() => window.history.back())}
              disabled={form.formState.isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
              className="h-11 px-8 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md"
            >
              {form.formState.isSubmitting ? (
                <div className="flex items-center gap-2">
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  {isEditMode ? "Saving..." : "Creating..."}
                </div>
              ) : isEditMode ? (
                "Save Changes"
              ) : (
                "Create Compliance Report"
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}