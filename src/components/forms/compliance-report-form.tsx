"use client";

import { z } from "zod";
import { toast } from "sonner";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
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
import { Home, Calendar, FileText, PoundSterling } from "lucide-react";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";
import { useRouter } from "next/navigation";
import { ImageUpload } from "../ui/image-upload";
import { ComplianceCategory, ComplianceCategoryLabels } from "@/types";

// ────────────────────────────────────────────────
//Form validation Schema
// ────────────────────────────────────────────────
const complianceReportSchema = z.object({
  propertyId: z.string().min(1, "Property is required"),
  category: z.nativeEnum(ComplianceCategory, {
    errorMap: () => ({ message: "Category is required" }),
  }),
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
  images: z.array(z.string()).optional(),
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

// Derived from the shared enum so the dropdown can never drift out of sync
// with what the API's `z.nativeEnum(ComplianceCategory)` will accept.
const complianceCategory = Object.values(ComplianceCategory).map((key) => ({
  key,
  value: ComplianceCategoryLabels[key],
}));

export default function ComplianceReportForm({
  mode = "create",
  reportId,
  initialData,
  onSuccess,
  onCancel,
  properties = [],
}: ComplianceReportFormProps) {
  const { t } = useLocalizationContext();
  const router = useRouter();
  const isEditMode = mode === "edit";

  const [uploadedImages, setUploadedImages] = useState<
    { url: string; publicId: string }[]
  >((initialData?.images || []).map((url) => ({ url, publicId: "" })));

  const form = useForm<ComplianceReportFormData>({
    resolver: zodResolver(complianceReportSchema),
    defaultValues: {
      propertyId: initialData?.propertyId || "",
      category: initialData?.category,
      issueDate: initialData?.issueDate || "",
      expiryDate: initialData?.expiryDate || "",
      notes: initialData?.notes || "",
      images: initialData?.images || [],
      estimatedCost: initialData?.estimatedCost ?? undefined,
    },
  });

  const watchedIssueDate = form.watch("issueDate");

  // In edit mode the report data may arrive after first render. Re-seed the
  // form and the uploaded files once the report's identity is known so existing
  // values (category, dates, documents) populate instead of staying blank.
  useEffect(() => {
    if (!initialData?._id) return;
    form.reset({
      propertyId: initialData.propertyId || "",
      category: initialData.category,
      issueDate: initialData.issueDate || "",
      expiryDate: initialData.expiryDate || "",
      notes: initialData.notes || "",
      images: initialData.images || [],
      estimatedCost: initialData.estimatedCost ?? undefined,
    });
    setUploadedImages(
      (initialData.images || []).map((url) => ({ url, publicId: "" }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData?._id]);

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

  const handleFormSubmit = async (data: ComplianceReportFormData) => {
    const payload = {
      propertyId: data.propertyId,
      category: data.category,
      issueDate: data.issueDate,
      expiryDate: data.expiryDate,
      notes: data.notes?.trim() || undefined,
      estimatedCost: data.estimatedCost ?? undefined,
      images: data.images || undefined
    };

    const url =
      isEditMode && reportId ? `/api/compliance/${reportId}` : "/api/compliance";
    const method = isEditMode ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(
          json.error || `Failed to ${isEditMode ? "update" : "create"} report`
        );
      }

      // FIX 3: use savedId (returned from API) instead of reportId (undefined in create mode)
      const savedId = json.data?._id || reportId;
      toast.success(
        isEditMode ? "Report updated successfully" : "Report created successfully"
      );
      router.push(`/dashboard/compliance/${savedId}`);
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
          {/* Property & Compliance Type */}
          <Card className="border-0 shadow-lg bg-linear-to-br from-white to-gray-50/50 dark:from-primary/10 dark:to-background">
            <CardHeader className="pb-6">
              <CardTitle className="flex items-center gap-3 text-xl">
                <div className="p-2 rounded-lg bg-linear-to-br from-blue-500 to-indigo-600 text-white">
                  <Home className="h-5 w-5" />
                </div>
                {t("compliance.form.propertyAndType.title") ||
                  "Property & Compliance Type"}
              </CardTitle>
              <CardDescription className="text-base">
                {t("compliance.form.propertyAndType.description") ||
                  "Select the property and type of compliance certificate"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Property selector */}
                <FormField
                  control={form.control}
                  name="propertyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Property{" "}
                        <span className="text-red-500 text-xs">*</span>
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || undefined}
                      >
                        <FormControl>
                          <SelectTrigger className="h-11 border-gray-200 dark:border-gray-700 focus:border-primary focus:ring-primary/20 transition-all duration-200">
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
                        Compliance Type{" "}
                        <span className="text-red-500 text-xs">*</span>
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || undefined}
                      >
                        <FormControl>
                          <SelectTrigger className="h-11 border-gray-200 dark:border-gray-700 focus:border-primary focus:ring-primary/20 transition-all duration-200">
                            <SelectValue placeholder="Select compliance type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {complianceCategory.map((type) => (
                            <SelectItem key={type.key} value={type.key}>
                              <div className="font-medium">
                                {type.value}
                              </div>
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
          <Card className="border-0 shadow-lg bg-linear-to-br from-white to-gray-50/50 dark:from-primary/10 dark:to-background">
            <CardHeader className="pb-6">
              <CardTitle className="flex items-center gap-3 text-xl">
                <div className="p-2 rounded-lg bg-linear-to-br from-purple-500 to-pink-600 text-white">
                  <Calendar className="h-5 w-5" />
                </div>
                Validity Period
              </CardTitle>
              <CardDescription className="text-base">
                Set when this compliance certificate was issued and when it
                expires
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <FormField
                control={form.control}
                name="issueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Issue Date{" "}
                      <span className="text-red-500 text-xs">*</span>
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
                      Expiry Date{" "}
                      <span className="text-red-500 text-xs">*</span>
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

          {/* Cost & Additional Notes */}
          <Card className="border-0 shadow-lg bg-linear-to-br from-white to-gray-50/50 dark:from-primary/10 dark:to-background">
            <CardHeader className="pb-6">
              <CardTitle className="flex items-center gap-3 text-xl">
                <div className="p-2 rounded-lg bg-primary text-white">
                  <PoundSterling className="h-5 w-5" />
                </div>
                {t("compliance.form.costandAdd.title") ||
                  "Cost & Additional Notes"}
              </CardTitle>
              <CardDescription className="text-base">
                {t("compliance.form.costandAdd.description") ||
                  "Optional information about actual cost and any remarks"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="estimatedCost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Actual Cost
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="0"
                        step={0.1}
                        min={0}
                        className="h-11 border-gray-200 dark:border-gray-700 focus:border-primary focus:ring-primary/20 transition-all duration-200"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value)
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
                        className="min-h-[120px] resize-y border-gray-200 dark:border-gray-700 focus:border-primary focus:ring-primary/20 transition-all duration-200"
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

          {/* Supporting Documents */}
          <Card className="border-0 shadow-lg bg-linear-to-br from-white to-gray-50/50 dark:from-primary/10 dark:to-background">
            <CardHeader className="pb-6">
              <CardTitle className="flex items-center gap-3 text-xl">
                <div className="p-2 rounded-lg bg-linear-to-br from-amber-500 to-orange-600 text-white">
                  <FileText className="h-5 w-5" />
                </div>
                {/* FIX 1 (same pattern): || for Supporting Documents card too */}
                {t("compliance.form.support.title") ||
                  "Supporting Documents"}
              </CardTitle>
              <CardDescription className="text-base">
                {t("compliance.form.support.description") ||
                  "Upload certificate, inspection report, photos, etc."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImageUpload
                onImagesUploaded={(newImages) => {
                  const updatedImages = [...uploadedImages, ...newImages];
                  setUploadedImages(updatedImages);
                  form.setValue(
                    "images",
                    updatedImages.map((img) => img.url)
                  );
                }}
                onImagesRemoved={(removedImages) => {
                  const updatedImages = uploadedImages.filter(
                    (img) =>
                      !removedImages.some(
                        (removed) => removed.publicId === img.publicId
                      )
                  );
                  setUploadedImages(updatedImages);
                  form.setValue(
                    "images",
                    updatedImages.map((img) => img.url)
                  );
                }}
                existingImages={uploadedImages}
                maxFiles={10}
                folder="PropertyPro/compliance"
                quality="auto"
                accept=".pdf,.doc,.docx,image/*"
                allowedMimeTypes={[
                  "image/*",
                  "application/pdf",
                  "application/msword",
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                ]}
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
            >
              {form.formState.isSubmitting ? (
                <div className="flex items-center gap-2">
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  {isEditMode ? "Saving..." : "Creating..."}
                </div>
              ) : isEditMode ? (
                "Save Changes"
              ) : (
                "Add Report"
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}