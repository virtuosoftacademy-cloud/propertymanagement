/**
 * Tenant Document Upload Dialog
 * Allows tenants to upload lease-related documents with metadata and validation
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Paperclip, Trash2, Upload as UploadIcon } from "lucide-react";
import {
  TenantDocument,
  normalizeTenantDocument,
} from "@/components/tenant/DocumentManagement";

const uploadSchema = z.object({
  type: z.string().min(1, "Select a document type"),
  category: z.string().min(1, "Select a document category"),
  description: z
    .string()
    .max(500, "Description must be 500 characters or less")
    .optional()
    .or(z.literal("")),
  tags: z
    .string()
    .max(200, "Tags must be 200 characters or less")
    .optional()
    .or(z.literal("")),
});

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const allowedMimeTypes: ReadonlyArray<{ value: string; label: string }> = [
  { value: "application/pdf", label: "PDF" },
  { value: "application/msword", label: "DOC" },
  {
    value:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "DOCX",
  },
  { value: "image/jpeg", label: "JPG" },
  { value: "image/jpg", label: "JPG" },
  { value: "image/png", label: "PNG" },
  { value: "text/plain", label: "TXT" },
];

const documentTypeOptions: ReadonlyArray<{ value: string; label: string }> = [
  { value: "lease", label: "Lease Agreement" },
  { value: "notice", label: "Notice" },
  { value: "maintenance", label: "Maintenance" },
  { value: "insurance", label: "Insurance" },
  { value: "identification", label: "Identification" },
  { value: "income", label: "Income/Verification" },
  { value: "inspection", label: "Inspection" },
  { value: "receipt", label: "Receipt" },
  { value: "other", label: "Other" },
];

const documentCategoryOptions: ReadonlyArray<{ value: string; label: string }> =
  [
    { value: "lease", label: "Lease" },
    { value: "payments", label: "Payments" },
    { value: "maintenance", label: "Maintenance" },
    { value: "insurance", label: "Insurance" },
    { value: "identification", label: "Identification" },
    { value: "notices", label: "Notices" },
    { value: "general", label: "General" },
  ];

interface TenantDocumentUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadComplete?: (
    documents: TenantDocument[],
    summary: { uploaded: number; total: number; message?: string }
  ) => Promise<void> | void;
}

type TenantDocumentUploadFormValues = z.infer<typeof uploadSchema>;

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const units = ["Bytes", "KB", "MB", "GB"] as const;
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const size = bytes / Math.pow(1024, index);
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
};

const allowedMimeTypeValues = allowedMimeTypes.map((item) => item.value);

export default function TenantDocumentUploadDialog({
  open,
  onOpenChange,
  onUploadComplete,
}: TenantDocumentUploadDialogProps) {
  const form = useForm<TenantDocumentUploadFormValues>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      type: "lease",
      category: "general",
      description: "",
      tags: "",
    },
  });

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedFiles([]);
      form.reset({
        type: "lease",
        category: "general",
        description: "",
        tags: "",
      });
    }
  }, [open, form]);

  const selectedFileNames = useMemo(
    () => new Set(selectedFiles.map((file) => file.name)),
    [selectedFiles]
  );

  const handleFilesAdded = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;

      const incomingFiles = Array.from(fileList);

      if (incomingFiles.length + selectedFiles.length > MAX_FILES) {
        toast.error(`You can upload up to ${MAX_FILES} files at a time.`);
        return;
      }

      const validFiles: File[] = [];
      const errors: string[] = [];

      incomingFiles.forEach((file) => {
        if (selectedFileNames.has(file.name)) {
          errors.push(`${file.name}: already added`);
          return;
        }
        if (!allowedMimeTypeValues.includes(file.type)) {
          errors.push(`${file.name}: unsupported type`);
          return;
        }
        if (file.size > MAX_FILE_SIZE) {
          errors.push(`${file.name}: exceeds 10MB limit`);
          return;
        }
        validFiles.push(file);
      });

      if (errors.length > 0) {
        toast.error(errors.join("\n"));
      }

      if (validFiles.length > 0) {
        setSelectedFiles((prev) => [...prev, ...validFiles]);
      }
    },
    [selectedFiles.length, selectedFileNames]
  );

  const removeFile = useCallback((name: string) => {
    setSelectedFiles((prev) => prev.filter((file) => file.name !== name));
  }, []);

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!uploading) {
        setIsDragActive(true);
      }
    },
    [uploading]
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragActive(false);
    },
    []
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragActive(false);
      if (uploading) return;
      handleFilesAdded(event.dataTransfer.files);
    },
    [handleFilesAdded, uploading]
  );

  const submitHandler = form.handleSubmit(async (values) => {
    if (selectedFiles.length === 0) {
      toast.error("Select at least one file to upload");
      return;
    }

    const formData = new FormData();
    selectedFiles.forEach((file) => {
      formData.append("files", file);
    });

    formData.append("type", values.type);
    formData.append("category", values.category);

    if (values.description) {
      formData.append("description", values.description);
    }

    if (values.tags) {
      formData.append("tags", values.tags);
    }

    try {
      setUploading(true);
      const response = await fetch("/api/tenant/documents/upload", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message ?? payload?.error ?? "Upload failed");
      }

      const normalizedDocuments: TenantDocument[] = (
        payload?.data?.documents ?? []
      ).map(normalizeTenantDocument);

      if (onUploadComplete) {
        await onUploadComplete(normalizedDocuments, {
          uploaded: payload?.data?.uploaded ?? normalizedDocuments.length,
          total: payload?.data?.total ?? selectedFiles.length,
          message: payload?.message,
        });
      } else {
        toast.success(payload?.message ?? "Documents uploaded successfully");
      }

      onOpenChange(false);
    } catch (error) {
      console.error("Document upload failed", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to upload documents"
      );
    } finally {
      setUploading(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
          <DialogDescription>
            Select up to {MAX_FILES} files. Supported types: PDF, DOC, DOCX,
            JPG, PNG, TXT.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={submitHandler} className="space-y-6">
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Document Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {documentTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {documentCategoryOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add a short description for these files"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags (optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter comma-separated tags, e.g. lease, renewal"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-3">
              <Label htmlFor="tenant-document-upload">Files</Label>
              <div
                className={`rounded-lg border border-dashed p-6 text-center transition-colors ${
                  isDragActive
                    ? "border-primary bg-primary/10"
                    : "border-muted-foreground/40"
                }`}
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="flex flex-col items-center gap-2">
                  <UploadIcon className="h-8 w-8 text-muted-foreground" />
                  <div className="text-sm text-muted-foreground">
                    Drag and drop files here, or
                  </div>
                  <Button type="button" variant="outline" size="sm">
                    <label
                      htmlFor="tenant-document-upload"
                      className="cursor-pointer"
                    >
                      Browse files
                    </label>
                  </Button>
                  <input
                    id="tenant-document-upload"
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => handleFilesAdded(event.target.files)}
                    accept={allowedMimeTypeValues.join(",")}
                    disabled={uploading}
                  />
                  <div className="text-xs text-muted-foreground">
                    Maximum size {formatFileSize(MAX_FILE_SIZE)} per file. Up to{" "}
                    {MAX_FILES} files.
                  </div>
                </div>
              </div>

              {selectedFiles.length > 0 && (
                <ScrollArea className="max-h-48 rounded-md border p-3">
                  <div className="space-y-2">
                    {selectedFiles.map((file) => (
                      <div
                        key={file.name}
                        className="flex items-start justify-between gap-3 rounded-md bg-muted/60 px-3 py-2"
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1 overflow-hidden">
                          <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <div
                              className="text-sm font-medium break-all line-clamp-2"
                              title={file.name}
                            >
                              {file.name}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {formatFileSize(file.size)}
                            </div>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive flex-shrink-0 h-8 w-8"
                          onClick={() => removeFile(file.name)}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Remove file</span>
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {selectedFiles.length === 0 && (
                <div className="flex flex-wrap gap-2">
                  {allowedMimeTypes.map((item) => (
                    <Badge key={item.value} variant="secondary">
                      {item.label}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={uploading}>
                {uploading ? "Uploading..." : "Upload"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
