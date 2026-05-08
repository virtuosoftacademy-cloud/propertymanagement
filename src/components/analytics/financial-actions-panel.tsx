"use client";

import { useMemo, useState } from "react";
import {
  FinancialAction,
  FinancialActionCategory,
  FinancialActionInput,
  FinancialActionPriority,
  FinancialActionReportType,
  FinancialActionStatus,
} from "@/types/financial-analytics";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Calendar, Edit3, Plus, RefreshCcw, Trash2 } from "lucide-react";

interface PropertyOption {
  id: string;
  name: string;
}

interface FinancialActionsPanelProps {
  actions: FinancialAction[];
  isLoading: boolean;
  error?: string | null;
  onRefresh: () => void;
  onCreate: (payload: FinancialActionInput) => Promise<boolean>;
  onUpdate: (
    id: string,
    updates: Partial<FinancialActionInput> & { status?: FinancialActionStatus }
  ) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  defaultReportType: FinancialActionReportType;
  propertyOptions: PropertyOption[];
  selectedPropertyId: string;
  selectedPropertyLabel: string;
}

interface ActionFormState {
  title: string;
  description: string;
  category: FinancialActionCategory;
  priority: FinancialActionPriority;
  status: FinancialActionStatus;
  dueDate: string;
  reportType: FinancialActionReportType;
  propertyId: string;
}

const STATUS_OPTIONS: Array<{
  value: FinancialActionStatus;
  label: string;
}> = [
  { value: "pending", label: "Pending" },
  { value: "in-progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

const PRIORITY_OPTIONS: Array<{
  value: FinancialActionPriority;
  label: string;
}> = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const CATEGORY_OPTIONS: Array<{
  value: FinancialActionCategory;
  label: string;
}> = [
  { value: "general", label: "General" },
  { value: "revenue", label: "Revenue" },
  { value: "collections", label: "Collections" },
  { value: "profitability", label: "Profitability" },
  { value: "cash-flow", label: "Cash Flow" },
  { value: "expenses", label: "Expenses" },
  { value: "portfolio", label: "Portfolio" },
  { value: "risk", label: "Risk" },
];

const REPORT_TYPE_OPTIONS: Array<{
  value: FinancialActionReportType;
  label: string;
}> = [
  { value: "analytics", label: "Overview" },
  { value: "profit-loss", label: "Profit & Loss" },
  { value: "cash-flow", label: "Cash Flow" },
  { value: "property-performance", label: "Property Performance" },
  { value: "expense-analysis", label: "Expenses" },
  { value: "summary", label: "Summary" },
];

const statusOrder: Record<FinancialActionStatus, number> = {
  pending: 0,
  "in-progress": 1,
  completed: 2,
};

const priorityOrder: Record<FinancialActionPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const reportTypeLabelMap = REPORT_TYPE_OPTIONS.reduce<Record<string, string>>(
  (acc, option) => {
    acc[option.value] = option.label;
    return acc;
  },
  {}
);

const priorityBadgeClasses: Record<FinancialActionPriority, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-blue-100 text-blue-700",
};

const statusBadgeClasses: Record<FinancialActionStatus, string> = {
  pending: "bg-slate-100 text-slate-700",
  "in-progress": "bg-indigo-100 text-indigo-700",
  completed: "bg-emerald-100 text-emerald-700",
};

const createInitialFormState = (
  reportType: FinancialActionReportType,
  propertyId: string
): ActionFormState => ({
  title: "",
  description: "",
  category: "general",
  priority: "medium",
  status: "pending",
  dueDate: "",
  reportType,
  propertyId,
});

const toDateInputValue = (value?: string) => {
  if (!value) return "";
  return value.slice(0, 10);
};

const formatDisplayDate = (value?: string) => {
  if (!value) return "No due date";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "No due date";
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export function FinancialActionsPanel({
  actions,
  isLoading,
  error,
  onRefresh,
  onCreate,
  onUpdate,
  onDelete,
  defaultReportType,
  propertyOptions,
  selectedPropertyId,
  selectedPropertyLabel,
}: FinancialActionsPanelProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingAction, setEditingAction] = useState<FinancialAction | null>(
    null
  );
  const [formState, setFormState] = useState<ActionFormState>(() =>
    createInitialFormState(defaultReportType, selectedPropertyId)
  );
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const propertyNameMap = useMemo(() => {
    const map = new Map<string, string>();
    propertyOptions.forEach((option) => map.set(option.id, option.name));
    return map;
  }, [propertyOptions]);

  const sortedActions = useMemo(() => {
    return [...actions].sort((a, b) => {
      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) return statusDiff;

      const priorityDiff =
        priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      const dueA = a.dueDate
        ? new Date(a.dueDate).getTime()
        : Number.POSITIVE_INFINITY;
      const dueB = b.dueDate
        ? new Date(b.dueDate).getTime()
        : Number.POSITIVE_INFINITY;
      if (dueA !== dueB) return dueA - dueB;

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [actions]);

  const handleOpenCreate = () => {
    setEditingAction(null);
    setFormState(createInitialFormState(defaultReportType, selectedPropertyId));
    setFormError(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (action: FinancialAction) => {
    setEditingAction(action);
    setFormState({
      title: action.title,
      description: action.description || "",
      category: action.category,
      priority: action.priority,
      status: action.status,
      dueDate: toDateInputValue(action.dueDate),
      reportType: action.reportType,
      propertyId:
        typeof action.propertyId === "string"
          ? action.propertyId
          : action.propertyId?._id || "all",
    });
    setFormError(null);
    setIsDialogOpen(true);
  };

  const resetDialog = () => {
    setIsDialogOpen(false);
    setIsSubmitting(false);
    setFormError(null);
    setEditingAction(null);
  };

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.title.trim()) {
      setFormError("Action title is required");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const payload: FinancialActionInput = {
      title: formState.title.trim(),
      description: formState.description.trim() || undefined,
      category: formState.category,
      priority: formState.priority,
      status: formState.status,
      reportType: formState.reportType,
      dueDate: formState.dueDate
        ? new Date(formState.dueDate).toISOString()
        : undefined,
      propertyId:
        formState.propertyId !== "all" ? formState.propertyId : undefined,
    };

    const succeeded = editingAction
      ? await onUpdate(editingAction._id, payload)
      : await onCreate(payload);

    if (succeeded) {
      resetDialog();
    }

    setIsSubmitting(false);
  };

  const handleStatusChange = async (
    action: FinancialAction,
    value: FinancialActionStatus
  ) => {
    setUpdatingId(action._id);
    await onUpdate(action._id, { status: value });
    setUpdatingId(null);
  };

  const handlePriorityChange = async (
    action: FinancialAction,
    value: FinancialActionPriority
  ) => {
    setUpdatingId(action._id);
    await onUpdate(action._id, { priority: value });
    setUpdatingId(null);
  };

  const handleDeleteAction = async (id: string) => {
    setDeletingId(id);
    await onDelete(id);
    setDeletingId(null);
  };

  const renderActionRow = (action: FinancialAction) => {
    const propertyLabel = (() => {
      if (!action.propertyId) {
        return "Portfolio-wide";
      }
      if (typeof action.propertyId === "string") {
        return propertyNameMap.get(action.propertyId) || "Assigned Property";
      }
      return action.propertyId.name || "Assigned Property";
    })();

    return (
      <div
        key={action._id}
        className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"
      >
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-sm md:text-base">{action.title}</p>
            <Badge
              className={cn(
                "text-xs capitalize",
                statusBadgeClasses[action.status]
              )}
            >
              {
                STATUS_OPTIONS.find((option) => option.value === action.status)
                  ?.label
              }
            </Badge>
            <Badge
              className={cn(
                "text-xs capitalize",
                priorityBadgeClasses[action.priority]
              )}
            >
              {
                PRIORITY_OPTIONS.find(
                  (option) => option.value === action.priority
                )?.label
              }
            </Badge>
          </div>
          {action.description && (
            <p className="text-sm text-muted-foreground">
              {action.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {formatDisplayDate(action.dueDate)}
            </span>
            <span>{propertyLabel}</span>
            <span>{reportTypeLabelMap[action.reportType] || "Overview"}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 md:items-end">
          <div className="flex items-center gap-2">
            <Select
              value={action.status}
              onValueChange={(value) =>
                handleStatusChange(action, value as FinancialActionStatus)
              }
              disabled={updatingId === action._id}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={action.priority}
              onValueChange={(value) =>
                handlePriorityChange(action, value as FinancialActionPriority)
              }
              disabled={updatingId === action._id}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {PRIORITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenEdit(action)}
              disabled={updatingId === action._id}
            >
              <Edit3 className="h-4 w-4 mr-1" />
              Edit
            </Button>
            {/* DISABLED: Delete functionality temporarily disabled */}
            {/* <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => handleDeleteAction(action._id)}
              disabled={deletingId === action._id}
            >
              <Trash2 className="h-4 w-4" />
            </Button> */}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="text-xl">Action Items</CardTitle>
          <CardDescription>
            Operational follow-ups for {selectedPropertyLabel}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCcw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) =>
              !open ? resetDialog() : setIsDialogOpen(open)
            }
          >
            <DialogTrigger asChild>
              <Button size="sm" onClick={handleOpenCreate}>
                <Plus className="h-4 w-4 mr-2" />
                New Action
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleFormSubmit} className="space-y-4">
                <DialogHeader>
                  <DialogTitle>
                    {editingAction
                      ? "Update Action Item"
                      : "Create Action Item"}
                  </DialogTitle>
                  <DialogDescription>
                    Track follow-up work aligned to your financial analytics
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Title</label>
                  <Input
                    value={formState.title}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        title: event.target.value,
                      }))
                    }
                    placeholder="e.g. Review rent increase plan"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <Textarea
                    value={formState.description}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        description: event.target.value,
                      }))
                    }
                    rows={3}
                    placeholder="Add context or next steps"
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Status</label>
                    <Select
                      value={formState.status}
                      onValueChange={(value) =>
                        setFormState((prev) => ({
                          ...prev,
                          status: value as FinancialActionStatus,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Priority</label>
                    <Select
                      value={formState.priority}
                      onValueChange={(value) =>
                        setFormState((prev) => ({
                          ...prev,
                          priority: value as FinancialActionPriority,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Category</label>
                    <Select
                      value={formState.category}
                      onValueChange={(value) =>
                        setFormState((prev) => ({
                          ...prev,
                          category: value as FinancialActionCategory,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Report Context
                    </label>
                    <Select
                      value={formState.reportType}
                      onValueChange={(value) =>
                        setFormState((prev) => ({
                          ...prev,
                          reportType: value as FinancialActionReportType,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REPORT_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Due Date</label>
                    <Input
                      type="date"
                      value={formState.dueDate}
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          dueDate: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Property</label>
                    <Select
                      value={formState.propertyId}
                      onValueChange={(value) =>
                        setFormState((prev) => ({ ...prev, propertyId: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Portfolio-wide</SelectItem>
                        {propertyOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {formError && (
                  <Alert variant="destructive">
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                )}

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetDialog}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting
                      ? "Saving..."
                      : editingAction
                      ? "Save Changes"
                      : "Create Action"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="space-y-2 rounded-lg border p-4">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-4 w-2/3" />
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-8 w-28" />
                </div>
              </div>
            ))}
          </div>
        ) : sortedActions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="rounded-full bg-muted p-3">
              <Calendar className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No action items yet</p>
              <p className="text-sm text-muted-foreground">
                Convert insights into follow-up tasks to keep financial
                performance on track.
              </p>
            </div>
            <Button size="sm" onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Create first action
            </Button>
          </div>
        ) : (
          <div className="space-y-3">{sortedActions.map(renderActionRow)}</div>
        )}
      </CardContent>
    </Card>
  );
}
