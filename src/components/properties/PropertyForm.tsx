"use client";

import { z } from "zod";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Building2,
  Home,
  MapPin,
  Star,
  Plus,
  X,
  ImageIcon,
  Save,
  Loader2,
} from "lucide-react";
import {
  PropertyType,
  PropertyStatus,
  PropertyownerType,
  UserRole,
} from "@/types";
import { ImageUpload, type UploadedImage } from "@/components/ui/image-upload";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";
import { allowAlphabetsOnly } from "@/lib/utils";

// Shape of an assignable agent (manager / technician / maintenance user).
type AgentOption = {
  id: string;
  name: string;
  email: string;
  specialties?: string[];
};

// ─── Assigned agent (HMO only, optional) ────────────────────────────────────
// The agent dropdown only appears when the property type is HMO, and choosing
// an agent is OPTIONAL. The dropdown writes the agent's id into
// `assignedAgentId`; it's cleared when the type is not HMO.
const enhancedPropertySchema = (t: (key: string, options?: any) => string) =>
  z.object({
    propertyOwnerName: z
      .string()
      .min(1, t("properties.form.validation.ownerNameRequired"))
      .max(200),
    ownerType: z.nativeEnum(PropertyownerType),

    name: z
      .string()
      .min(1, t("properties.form.validation.nameRequired"))
      .max(200),
    description: z.string().max(2000).optional(),
    type: z.nativeEnum(PropertyType),
    assignedAgentId: z.string().optional(),
    // Admin-only. Decides who can see this property (see property-scope.ts);
    // the server ignores it from anyone else, so it is never sent by them.
    managerId: z.string().optional(),
    // HMO compliance licence (UK mandatory licence) — HMO only, optional.
    hmoLicenseNumber: z.string().max(100).optional(),
    hmoLicenseIssueDate: z.string().optional(),
    hmoLicenseExpiry: z.string().optional(),

    address: z.object({
      street: z
        .string()
        .min(1, t("properties.form.validation.streetRequired"))
        .max(200),
      city: z
        .string()
        .min(1, t("properties.form.validation.cityRequired"))
        .max(100),
      state: z
        .string()
        .min(1, t("properties.form.validation.stateRequired"))
        .max(50),
      zipCode: z
        .string()
        .min(6, t("properties.form.validation.zipRequired"))
        .max(20, t("properties.form.validation.zipTooLong")),
      country: z.string().regex(/^[a-zA-Z\s'-]+$/).default("United Kingdom"),
    }),

    yearBuilt: z
      .number()
      .min(1800, t("properties.form.validation.yearBuiltMin"))
      .max(
        new Date().getFullYear() + 0,
        t("properties.form.validation.yearBuiltMax")
      )
      .optional(),

    amenities: z
      .array(
        z.object({
          name: z.string().min(1),
          description: z.string().optional(),
          category: z.string(),
        })
      )
      .default([]),

    images: z.array(z.string()).default([]),
    attachments: z
      .array(
        z.object({
          fileName: z.string(),
          fileUrl: z.string(),
          fileSize: z.number(),
          fileType: z.string(),
        })
      )
      .default([]),
  });

type EnhancedPropertyFormData = z.infer<
  ReturnType<typeof enhancedPropertySchema>
>;

interface ExtendedPropertyFormData extends Partial<EnhancedPropertyFormData> {
  units?: Array<{
    _id?: string;
    id?: string;
    unitNumber?: string;
    unitType?: "apartment" | "studio" | "penthouse" | "loft" | "room";
    floor?: number;
    bedrooms?: number;
    bathrooms?: number;
    squareFootage?: number;
    rentAmount?: number;
    securityDeposit?: number;
    status?: PropertyStatus;
    images?: string[];
  }>;
}

interface EnhancedPropertyFormProps {
  initialData?: ExtendedPropertyFormData;
  onSubmit: (data: any) => Promise<void>;
  isLoading?: boolean;
  mode?: "create" | "edit";
  propertyId?: string;
  // Optional agents list from the parent. If omitted, the form fetches its own.
  assignedAgent?: AgentOption[];
}

const ESSENTIAL_AMENITIES_AND_FEATURES = [
  "Parking",
  "In-Unit Laundry",
  "Central AC",
  "Central Heating",
  "Internet",
  "Furnished",
  "Hardwood Floors",
  "Dishwasher",
  "Balcony/Patio",
  "Walk-in Closets",
  "Pets Allowed",
  "Pool",
  "Fitness Center",
  "Elevator",
  "Storage",
  "Fireplace",
];

const getAmenityTranslationKey = (amenityName: string): string => {
  const keyMap: Record<string, string> = {
    Parking: "parking",
    "In-Unit Laundry": "laundry",
    "Central AC": "airConditioning",
    "Central Heating": "heating",
    Internet: "wifi",
    Furnished: "furnished",
    "Hardwood Floors": "hardwoodFloors",
    Dishwasher: "dishwasher",
    "Balcony/Patio": "balcony",
    "Walk-in Closets": "walkInClosets",
    "Pets Allowed": "petFriendly",
    Pool: "pool",
    "Fitness Center": "fitnessCenter",
    Elevator: "elevator",
    Storage: "storage",
    Fireplace: "fireplace",
  };
  return keyMap[amenityName] || amenityName.toLowerCase().replace(/\s+/g, "");
};

const getAmenityCategory = (amenityName: string): string => {
  const name = amenityName.toLowerCase();
  if (name.includes("dishwasher") || name.includes("kitchen") || name.includes("granite") || name.includes("stainless") || name.includes("microwave") || name.includes("refrigerator")) return "Kitchen";
  if (name.includes("bathroom") || name.includes("jacuzzi") || name.includes("tub")) return "Bathroom";
  if (name.includes("hardwood") || name.includes("fireplace") || name.includes("furnished") || name.includes("living") || name.includes("carpet")) return "Living";
  if (name.includes("walk-in") || name.includes("closet") || name.includes("bedroom")) return "Bedroom";
  if (name.includes("balcony") || name.includes("patio") || name.includes("garden") || name.includes("pool") || name.includes("outdoor") || name.includes("deck")) return "Outdoor";
  if (name.includes("parking") || name.includes("garage") || name.includes("carport")) return "Parking";
  if (name.includes("security") || name.includes("doorman") || name.includes("concierge") || name.includes("alarm") || name.includes("camera")) return "Security";
  if (name.includes("internet") || name.includes("wifi") || name.includes("cable") || name.includes("utilities") || name.includes("electric")) return "Utilities";
  if (name.includes("fitness") || name.includes("gym") || name.includes("tennis") || name.includes("basketball") || name.includes("playground") || name.includes("clubhouse")) return "Recreation";
  if (name.includes("laundry") || name.includes("washer") || name.includes("dryer")) return "Laundry";
  if (name.includes("ac") || name.includes("air") || name.includes("heating") || name.includes("hvac") || name.includes("central")) return "Climate";
  return "Other";
};

export function EnhancedPropertyForm({
  initialData,
  onSubmit,
  isLoading = false,
  mode = "create",
  propertyId,
  assignedAgent = [],
}: EnhancedPropertyFormProps) {
  const [showAlert, setShowAlert] = useState(false);

  // Agents fetched by this form (same source/shape pattern as the maintenance form).
  const [agents, setAgents] = useState<AgentOption[]>([]);

  // Managers assignable as the property's manager. Narrower than `agents`,
  // which also includes technicians and maintenance users.
  const [managers, setManagers] = useState<AgentOption[]>([]);

  /**
   * Assigning a property grants visibility of it, so only an admin may do it.
   * The server enforces this independently — a non-admin's managerId and
   * assignedAgentId are stripped on both create and update — this just avoids
   * showing a control that would silently do nothing.
   */
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === UserRole.ADMIN;

  const [selectedAmenities, setSelectedAmenities] = useState<string[]>(() => {
    const amenities =
      initialData?.amenities?.map((a) =>
        typeof a === "string" ? a : a.name
      ) || [];
    return amenities;
  });
  const [customAmenity, setCustomAmenity] = useState("");

  const [propertyImages, setPropertyImages] = useState<UploadedImage[]>(() => {
    return (initialData?.images || []).map((url, index) => ({
      url,
      publicId: `existing-${index}`,
    }));
  });

  const [units, setUnits] = useState<
    Array<{
      id: string;
      unitNumber: string;
      unitType: "apartment" | "studio" | "penthouse" | "loft" | "room";
      floor?: number;
      bedrooms: number;
      bathrooms: number;
      squareFootage: number;
      rentAmount: number;
      securityDeposit: number;
      status: PropertyStatus;
      images: UploadedImage[];
    }>
  >(() => {
    if (mode === "edit" && initialData?.units) {
      return initialData.units.map((unit: any, index: number) => ({
        id: unit._id || unit.id || `unit-${index}`,
        unitNumber: unit.unitNumber || `Unit ${index + 1}`,
        unitType: unit.unitType || "apartment",
        floor: unit.floor,
        bedrooms: unit.bedrooms || 1,
        bathrooms: unit.bathrooms || 1,
        squareFootage: unit.squareFootage || 500,
        rentAmount: unit.rentAmount || 1000,
        securityDeposit: unit.securityDeposit || 1000,
        status: unit.status || PropertyStatus.AVAILABLE,
        images: (unit.images || []).map((url: string, imgIndex: number) => ({
          url,
          publicId: `existing-unit-${index}-${imgIndex}`,
        })),
      }));
    }
    return [
      {
        id: `unit-${Date.now()}`,
        unitNumber: "Unit 1",
        unitType: "apartment" as const,
        floor: 1,
        bedrooms: 1,
        bathrooms: 0,
        squareFootage: 500,
        rentAmount: 1000,
        securityDeposit: 1000,
        status: PropertyStatus.AVAILABLE,
        images: [],
      },
    ];
  });

  const { t } = useLocalizationContext();

  // Fetch assignable agents (managers / technicians / maintenance users).
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await fetch(
          "/api/users?excludeTenant=true&isActive=true&limit=100"
        );
        if (!res.ok) {
          console.error("Failed to fetch agents — non-OK response");
          return;
        }

        const json = await res.json();

        // Handle varying API response shapes — same pattern as maintenance form.
        const usersArray = Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json?.data?.users)
          ? json.data.users
          : Array.isArray(json?.users)
          ? json.users
          : [];

        const mapped: AgentOption[] = usersArray
          .filter((u: any) => {
            if (!u || (!u._id && !u.id)) return false;
            const role = (u.role || "").toLowerCase();
            if (role === "tenant") return false;
            if (u.isActive === false) return false;
            return (
              role.includes("manager") ||
              role.includes("technician") ||
              role.includes("maintenance")
            );
          })
          .map((u: any) => ({
            id: u._id || u.id,
            name:
              `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
              u.name ||
              "",
            email: u.email || "",
            specialties: u.specialties || [],
          }));

        setAgents(mapped);

        // Same response, narrower filter — managers only, for the manager
        // assignment dropdown. Custom roles resolve to a base role server-side,
        // but `role` here is the raw assigned name, so match on substring the
        // same way the agent filter above does.
        setManagers(
          usersArray
            .filter((u: any) => {
              if (!u || (!u._id && !u.id)) return false;
              if (u.isActive === false) return false;
              const role = (u.role || "").toLowerCase();
              return role.includes("manager") || role === "admin";
            })
            .map((u: any) => ({
              id: u._id || u.id,
              name:
                `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
                u.name ||
                "",
              email: u.email || "",
              specialties: [],
            }))
        );
      } catch (err) {
        console.error("Failed to fetch agents:", err);
      }
    };

    fetchAgents();
  }, []);

  // On edit, the API may return assignedAgentId either as a plain id string or
  // as a populated user object ({ _id|id, name|firstName/lastName, email }).
  // Normalize it so the <Select> value matches an option id.
  const initObj =
    initialData?.assignedAgentId &&
    typeof initialData.assignedAgentId === "object"
      ? (initialData.assignedAgentId as any)
      : null;

  const initialAgentId = initObj
    ? initObj.id || initObj._id || ""
    : (initialData?.assignedAgentId as string | undefined) || "";

  const initialAgentName = initObj
    ? initObj.name ||
      `${initObj.firstName || ""} ${initObj.lastName || ""}`.trim() ||
      "Assigned agent"
    : "";

  const initialAgentEmail = initObj ? initObj.email || "" : "";

  // managerId arrives populated or as a bare id, same as assignedAgentId above.
  const initialManagerId =
    initialData?.managerId && typeof initialData.managerId === "object"
      ? (initialData.managerId as any).id ||
        (initialData.managerId as any)._id ||
        ""
      : (initialData?.managerId as string | undefined) || "";

  const form = useForm({
    resolver: zodResolver(enhancedPropertySchema(t)),
    mode: "onChange",
    defaultValues: {
      propertyOwnerName: initialData?.propertyOwnerName || "",
      ownerType: initialData?.ownerType || PropertyownerType.INDIVIDUAL,
      name: initialData?.name || "",
      description: initialData?.description || "",
      type: initialData?.type || PropertyType.APARTMENT,
      assignedAgentId: initialAgentId,
      managerId: initialManagerId,
      hmoLicenseNumber: initialData?.hmoLicenseNumber || "",
      hmoLicenseIssueDate: initialData?.hmoLicenseIssueDate
        ? String(initialData.hmoLicenseIssueDate).slice(0, 10)
        : "",
      hmoLicenseExpiry: initialData?.hmoLicenseExpiry
        ? String(initialData.hmoLicenseExpiry).slice(0, 10)
        : "",
      address: {
        street: initialData?.address?.street || "",
        city: initialData?.address?.city || "",
        state: initialData?.address?.state || "",
        zipCode: initialData?.address?.zipCode || "",
        country: initialData?.address?.country || "United Kingdom",
      },
      yearBuilt: initialData?.yearBuilt,
      amenities: initialData?.amenities || [],
      images: initialData?.images || [],
      attachments: initialData?.attachments || [],
    },
  });

  const { watch, setValue } = form;
  const watchedValues = watch();

  // The agent dropdown only mounts when the property type is HMO.
  const isHmo = watchedValues.type === PropertyType.HMO;

  // When the type changes away from HMO, clear the agent selection so stale
  // data isn't submitted.
  const handleTypeChange = (value: PropertyType) => {
    setValue("type", value);
    if (value !== PropertyType.HMO) {
      setValue("assignedAgentId", "");
      setValue("hmoLicenseNumber", "");
      setValue("hmoLicenseIssueDate", "");
      setValue("hmoLicenseExpiry", "");
    }
  };

  // Build the agent options from the fetched agents plus any passed via props,
  // de-duplicated by id, and ensure the currently-assigned agent (on edit) is
  // present so its name renders even before/without the list containing it.
  const agentOptions: AgentOption[] = [];
  const seenAgentIds = new Set<string>();
  for (const a of [...agents, ...assignedAgent]) {
    if (a?.id && !seenAgentIds.has(a.id)) {
      seenAgentIds.add(a.id);
      agentOptions.push(a);
    }
  }
  if (initObj && initialAgentId && !seenAgentIds.has(initialAgentId)) {
    agentOptions.unshift({
      id: initialAgentId,
      name: initialAgentName,
      email: initialAgentEmail,
    });
    seenAgentIds.add(initialAgentId);
  }

  // Store the selected agent's id ("" clears it).
  const handleAgentChange = (agentId: string) => {
    setValue("assignedAgentId", agentId);
  };

  const handleAmenityToggle = (item: string) => {
    const newItems = selectedAmenities.includes(item)
      ? selectedAmenities.filter((i) => i !== item)
      : [...selectedAmenities, item];
    setSelectedAmenities(newItems);
    setValue("amenities", newItems.map((name) => ({ name, category: getAmenityCategory(name) })));
  };

  const handleAddCustomAmenity = () => {
    if (customAmenity.trim() && !selectedAmenities.includes(customAmenity.trim())) {
      const newItems = [...selectedAmenities, customAmenity.trim()];
      setSelectedAmenities(newItems);
      setValue("amenities", newItems.map((name) => ({ name, category: getAmenityCategory(name) })));
      setCustomAmenity("");
    }
  };

  const handleRemoveAmenity = (item: string) => {
    const newItems = selectedAmenities.filter((i) => i !== item);
    setSelectedAmenities(newItems);
    setValue("amenities", newItems.map((name) => ({ name, category: getAmenityCategory(name) })));
  };

  const handleImagesUploaded = (newImages: UploadedImage[]) => {
    const updatedImages = [...propertyImages, ...newImages];
    setPropertyImages(updatedImages);
    setValue("images", updatedImages.map((img) => img.url));
  };

  const handleImageRemove = (imageToRemove: UploadedImage) => {
    const updatedImages = propertyImages.filter(
      (img) => img.publicId !== imageToRemove.publicId
    );
    setPropertyImages(updatedImages);
    setValue("images", updatedImages.map((img) => img.url));
  };

  const handleFormSubmit = async (data: EnhancedPropertyFormData) => {
    try {
      if (units.length === 0) {
        setShowAlert(true);
        return;
      }

      const isMultiUnit = units.length > 1;
      const totalUnits = Math.max(units.length, 1);

      const apiUnits = units.map(({ id: _id, images, ...unit }) => ({
        ...unit,
        images: images.map((img) => img.url),
      }));

      // assignedAgentId is optional (HMO only) — omit it entirely when empty so
      // the API isn't sent an empty string for an optional ObjectId field.
      const {
        assignedAgentId,
        managerId,
        hmoLicenseNumber,
        hmoLicenseIssueDate,
        hmoLicenseExpiry,
        ...rest
      } = data;

      await onSubmit({
        ...rest,
        // Assignment fields are admin-only and the server strips them from
        // anyone else, so don't send them at all — avoids a confusing silent
        // no-op if a stale form value lingers.
        ...(isAdmin && assignedAgentId ? { assignedAgentId } : {}),
        ...(isAdmin ? { managerId: managerId || null } : {}),
        ...(hmoLicenseNumber ? { hmoLicenseNumber } : {}),
        ...(hmoLicenseIssueDate ? { hmoLicenseIssueDate } : {}),
        ...(hmoLicenseExpiry ? { hmoLicenseExpiry } : {}),
        isMultiUnit,
        totalUnits,
        units: apiUnits,
      });
    } catch (error) {
      throw error;
    }
  };

  return (
    <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
      <Card className="border-0 shadow-lg bg-linear-to-br from-white to-gray-50/50 dark:from-primary/10 dark:to-background">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-xl font-semibold">
            <div className="p-2 rounded-xl">
              <Building2 className="h-5 w-5 text-primary dark:text-primary" />
            </div>
            {t("properties.form.general.title")}
          </CardTitle>
          <CardDescription className="text-base text-gray-600 dark:text-gray-300">
            {t("properties.form.general.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="propertyOwnerName">
                {t("properties.form.fields.ownerName.label")}
              </Label>
              <Input
                id="propertyOwnerName"
                placeholder={t("properties.form.fields.ownerName.placeholder")}
                {...form.register("propertyOwnerName")}
              />
              {form.formState.errors.propertyOwnerName && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.propertyOwnerName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ownerType">{t("Property Owner")}</Label>
              <Select
                value={watchedValues.ownerType}
                onValueChange={(value) =>
                  setValue("ownerType", value as PropertyownerType)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("Company")} />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(PropertyownerType).map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`owner.type.${type}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="propertyName">
                {t("properties.form.fields.name.label")}
              </Label>
              <Input
                id="propertyName"
                placeholder={t("properties.form.fields.name.placeholder")}
                {...form.register("name")}
              />
              {form.formState.errors.name && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            {/* Property type — switching away from HMO clears and hides the
                agent field; choosing HMO reveals it. */}
            <div className="space-y-2">
              <Label htmlFor="type">
                {t("properties.form.fields.type.label")}
              </Label>
              <Select
                value={watchedValues.type}
                onValueChange={(value) =>
                  handleTypeChange(value as PropertyType)
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t("properties.form.fields.type.placeholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(PropertyType).map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`properties.type.${type}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Assigned manager — admin only, all property types. This is what
                decides who can see the property (see property-scope.ts): a
                manager sees properties they created or were assigned. */}
            {isAdmin && (
              <div className="space-y-2 md:col-span-1">
                <Label htmlFor="managerId">
                  Assigned manager
                  <span className="ml-1 text-xs text-muted-foreground font-normal">
                    (optional)
                  </span>
                </Label>
                <Select
                  value={watchedValues.managerId || "UNASSIGNED"}
                  onValueChange={(value) =>
                    setValue("managerId", value === "UNASSIGNED" ? "" : value, {
                      shouldDirty: true,
                    })
                  }
                >
                  <SelectTrigger id="managerId">
                    <SelectValue placeholder="Select a manager" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
                    {managers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        <div className="flex flex-col">
                          <span>{m.name || m.email}</span>
                          {m.name && m.email && (
                            <span className="text-xs text-muted-foreground">
                              {m.email}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Only this manager (and admins) will see this property.
                </p>
              </div>
            )}

            {/* Assigned agent — admin only, and only for HMO. Uses the same
                "assign to" pattern as the maintenance form (Unassigned option +
                name/email/specialties rows). */}
            {isHmo && isAdmin && (
              <div className="space-y-2 md:col-span-1">
                <Label htmlFor="assignedAgentId">
                  Assign to agent
                  <span className="ml-1 text-xs text-muted-foreground font-normal">
                    (optional)
                  </span>
                </Label>
                <Select
                  value={watchedValues.assignedAgentId || "UNASSIGNED"}
                  onValueChange={(value) =>
                    handleAgentChange(value === "UNASSIGNED" ? "" : value)
                  }
                >
                  <SelectTrigger id="assignedAgentId">
                    <SelectValue placeholder="Select an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
                    {agentOptions.length > 0 ? (
                      agentOptions.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          <div>
                            <div className="font-medium">{agent.name}</div>
                            {agent.email && (
                              <div className="text-sm text-muted-foreground">
                                {agent.email}
                              </div>
                            )}
                            {agent.specialties &&
                              agent.specialties.length > 0 && (
                                <div className="text-xs text-muted-foreground">
                                  {agent.specialties.join(", ")}
                                </div>
                              )}
                          </div>
                        </SelectItem>
                      ))
                    ) : (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        No agents available
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* HMO licence number — compliance, HMO only, optional. */}
            {isHmo && (
              <div className="space-y-2">
                <Label htmlFor="hmoLicenseNumber">
                  HMO licence number
                  <span className="ml-1 text-xs text-muted-foreground font-normal">
                    (optional)
                  </span>
                </Label>
                <Input
                  id="hmoLicenseNumber"
                  placeholder="e.g. HMO/2024/01234"
                  {...form.register("hmoLicenseNumber")}
                />
                {form.formState.errors.hmoLicenseNumber && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.hmoLicenseNumber.message}
                  </p>
                )}
              </div>
            )}

            {/* HMO licence issue date — compliance, HMO only, optional. */}
            {isHmo && (
              <div className="space-y-2">
                <Label htmlFor="hmoLicenseIssueDate">
                  HMO licence issue date
                  <span className="ml-1 text-xs text-muted-foreground font-normal">
                    (optional)
                  </span>
                </Label>
                <Input
                  id="hmoLicenseIssueDate"
                  type="date"
                  {...form.register("hmoLicenseIssueDate")}
                />
                {form.formState.errors.hmoLicenseIssueDate && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.hmoLicenseIssueDate.message}
                  </p>
                )}
              </div>
            )}

            {/* HMO licence expiry — compliance, HMO only, optional. */}
            {isHmo && (
              <div className="space-y-2">
                <Label htmlFor="hmoLicenseExpiry">
                  HMO licence expiry
                  <span className="ml-1 text-xs text-muted-foreground font-normal">
                    (optional)
                  </span>
                </Label>
                <Input
                  id="hmoLicenseExpiry"
                  type="date"
                  {...form.register("hmoLicenseExpiry")}
                />
                {form.formState.errors.hmoLicenseExpiry && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.hmoLicenseExpiry.message}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="yearBuilt">
                {t("properties.form.fields.yearBuilt.label")}
              </Label>
              <Input
                className="w-full"
                id="yearBuilt"
                type="number"
                min="1800"
                max={new Date().getFullYear() + 5}
                placeholder={t("properties.form.fields.yearBuilt.placeholder")}
                {...form.register("yearBuilt", {
                  valueAsNumber: true,
                  setValueAs: (value) =>
                    value === "" || isNaN(Number(value)) ? undefined : Number(value),
                })}
              />
              {form.formState.errors.yearBuilt && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.yearBuilt.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">
              {t("properties.form.fields.description.label")}
            </Label>
            <Textarea
              id="description"
              placeholder={t("properties.form.fields.description.placeholder")}
              {...form.register("description")}
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <Label className="text-base font-medium">
                {t("properties.form.address.title")}
              </Label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="street">
                  {t("properties.form.fields.street.label")}
                </Label>
                <Input
                  id="street"
                  placeholder={t("properties.form.fields.street.placeholder")}
                  {...form.register("address.street")}
                />
                {form.formState.errors.address?.street && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.address.street.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">
                  {t("properties.form.fields.city.label")}
                </Label>
                <Input
                  id="city"
                  placeholder={t("properties.form.fields.city.placeholder")}
                  {...form.register("address.city")}
                  onKeyDown={allowAlphabetsOnly}
                />
                {form.formState.errors.address?.city && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.address.city.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="state">
                  {t("properties.form.fields.state.label")}
                </Label>
                <Input
                  id="state"
                  placeholder={t("properties.form.fields.state.placeholder")}
                  onKeyDown={allowAlphabetsOnly}
                  {...form.register("address.state")}
                />
                {form.formState.errors.address?.state && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.address.state.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="zipCode">
                  {t("properties.form.fields.zipCode.label")}
                </Label>
                <Input
                  id="zipCode"
                  placeholder={t("properties.form.fields.zipCode.placeholder")}
                  {...form.register("address.zipCode")}
                />
                {form.formState.errors.address?.zipCode && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.address.zipCode.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="country">
                  {t("properties.form.fields.country.label")}
                </Label>
                <Input
                  id="country"
                  {...form.register("address.country")}
                  onKeyDown={allowAlphabetsOnly}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Property Units — unchanged */}
      <Card className="border-0 shadow-lg bg-linear-to-br from-white to-gray-50/50 dark:from-primary/10 dark:to-background">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-xl font-semibold">
            <div className="p-2 rounded-xl bg-primary-100 dark:bg-primary-900/30">
              <Home className="h-5 w-5 text-primary dark:text-primary-dark" />
            </div>
            {t("properties.form.units.title")}
          </CardTitle>
          <CardDescription className="text-base text-gray-600 dark:text-gray-300">
            {t("properties.form.units.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-gray-500 rounded-lg p-3 border bg-accent dark:bg-background border-primary-200 dark:border-primary">
            <p className="font-medium text-primary dark:text-primary-dark mb-1">
              Smart Unit Management
            </p>
            <p>
              Your property will automatically be configured as single or
              multi-unit based on the number of units you add. Start with one
              unit and add more using the &quot;Add New Unit&quot; button.
            </p>
          </div>
          {units.map((unit, index) => (
            <Card key={unit.id} className="dark:bg-accent/50 p-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">
                    {t("properties.form.units.unitTitle", {
                      values: { index: index + 1 },
                    })}
                  </h3>
                  {units.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setUnits(units.filter((_, i) => i !== index))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{t("properties.form.units.fields.unitNumber")}</Label>
                    <Input
                      value={unit.unitNumber}
                      onChange={(e) => {
                        const newUnits = [...units];
                        newUnits[index].unitNumber = e.target.value;
                        setUnits(newUnits);
                      }}
                      placeholder="Unit 101"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("properties.form.units.fields.unitType")}</Label>
                    <Select
                      value={unit.unitType}
                      onValueChange={(value: any) => {
                        const newUnits = [...units];
                        newUnits[index].unitType = value;
                        setUnits(newUnits);
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="apartment">{t("properties.unitType.apartment")}</SelectItem>
                        <SelectItem value="studio">{t("properties.unitType.studio")}</SelectItem>
                        <SelectItem value="penthouse">{t("properties.unitType.penthouse")}</SelectItem>
                        <SelectItem value="loft">{t("properties.unitType.loft")}</SelectItem>
                        <SelectItem value="room">{t("properties.unitType.room")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("properties.form.units.fields.floor")}</Label>
                    <Input
                      min={1}
                      type="number"
                      value={unit.floor || ""}
                      onChange={(e) => {
                        const newUnits = [...units];
                        newUnits[index].floor = parseInt(e.target.value) || undefined;
                        setUnits(newUnits);
                      }}
                      placeholder={t("properties.form.units.placeholders.floor")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("properties.form.units.fields.bedrooms")}</Label>
                    <Input min={1} type="number" value={unit.bedrooms}
                      onChange={(e) => { const n = [...units]; n[index].bedrooms = parseInt(e.target.value) || 0; setUnits(n); }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("properties.form.units.fields.bathrooms")}</Label>
                    <Input min={0} type="number" value={unit.bathrooms}
                      onChange={(e) => { const n = [...units]; n[index].bathrooms = parseInt(e.target.value) || 0; setUnits(n); }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("properties.form.units.fields.squareFootage")}</Label>
                    <Input min={50} type="number" value={unit.squareFootage}
                      onChange={(e) => { const n = [...units]; n[index].squareFootage = parseInt(e.target.value) || 0; setUnits(n); }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("properties.form.units.fields.rentAmount")}</Label>
                    <Input min={1} type="number" value={unit.rentAmount}
                      onChange={(e) => { const n = [...units]; n[index].rentAmount = parseInt(e.target.value) || 0; setUnits(n); }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("properties.form.units.fields.securityDeposit")}</Label>
                    <Input type="number" value={unit.securityDeposit}
                      onChange={(e) => { const n = [...units]; n[index].securityDeposit = parseInt(e.target.value) || 0; setUnits(n); }}
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-3 border-t">
                  <Label className="flex items-center gap-2 text-sm">
                    <ImageIcon className="h-4 w-4" />
                    {t("properties.form.units.fields.images")}
                  </Label>
                  <ImageUpload
                    onImagesUploaded={(newImages) => {
                      const newUnits = [...units];
                      newUnits[index].images = [...newUnits[index].images, ...newImages];
                      setUnits(newUnits);
                    }}
                    onImagesRemoved={(imagesToRemove) => {
                      const newUnits = [...units];
                      newUnits[index].images = newUnits[index].images.filter(
                        (img) => !imagesToRemove.some((r) => r.publicId === img.publicId)
                      );
                      setUnits(newUnits);
                    }}
                    existingImages={unit.images}
                    maxFiles={15}
                    folder="PropertyPro/units"
                    quality="auto"
                    disabled={isLoading}
                    className="w-full"
                    compact
                    label={t("properties.form.units.uploadImages")}
                  />
                  {unit.images.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {unit.images.length} {unit.images.length === 1 ? "image" : "images"} uploaded
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setUnits([...units, {
                id: `unit-${Date.now()}`,
                unitNumber: `Unit ${units.length + 1}`,
                unitType: "apartment" as const,
                bedrooms: 1,
                bathrooms: 1,
                squareFootage: 500,
                rentAmount: 1000,
                securityDeposit: 1000,
                status: PropertyStatus.AVAILABLE,
                images: [],
              }]);
            }}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Unit
          </Button>
        </CardContent>
      </Card>

      {/* Amenities — unchanged */}
      <Card className="border-0 shadow-lg bg-linear-to-br from-white to-gray-50/50 dark:from-primary/10 dark:to-background">
        <CardHeader className="pb-6">
          <CardTitle className="flex items-center gap-3 text-xl font-semibold">
            <div className="p-2 rounded-xl bg-primary-100 dark:bg-primary-900/30">
              <Star className="h-5 w-5 text-primary dark:text-dark-primary" />
            </div>
            {t("properties.form.amenities.title")}
          </CardTitle>
          <CardDescription className="text-base text-gray-600 dark:text-gray-300">
            {t("properties.form.amenities.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {ESSENTIAL_AMENITIES_AND_FEATURES.map((item) => {
              const translationKey = getAmenityTranslationKey(item);
              const labelKey = `properties.amenities.items.${translationKey}`;
              return (
                <div
                  key={item}
                  className={`group relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-md ${selectedAmenities.includes(item)
                    ? "border-primary bg-primary-50 text-primary shadow-primary-100 dark:bg-primary-950/30 dark:border-primary-400 dark:text-primary-300"
                    : "border-gray-200 bg-white hover:border-primary-300 hover:bg-primary-50/50 dark:border-gray-700 dark:bg-primary/10 dark:hover:border-primary-600 dark:hover:bg-primary-950/20"
                    }`}
                  onClick={() => handleAmenityToggle(item)}
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedAmenities.includes(item)}
                      onChange={() => { }}
                      className={`pointer-events-none transition-colors ${selectedAmenities.includes(item)
                        ? "data-[state=checked]:bg-primary-600 data-[state=checked]:border-primary-600"
                        : ""
                        }`}
                    />
                    <span className="flex-1 font-medium text-sm leading-tight">
                      {t(labelKey)}
                    </span>
                  </div>
                  {selectedAmenities.includes(item) && (
                    <div className="absolute top-2 right-2 w-2 h-2 bg-primary-500 rounded-full" />
                  )}
                </div>
              );
            })}
          </div>

          <div className="bg-gray-50 dark:bg-primary/10 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 block">
              {t("properties.form.amenities.custom.label")}
            </Label>
            <div className="flex gap-3">
              <Input
                placeholder={t("properties.form.amenities.custom.placeholder")}
                value={customAmenity}
                onChange={(e) => setCustomAmenity(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCustomAmenity();
                  }
                }}
                className="flex-1 border-gray-300 focus:border-primary focus:ring-primary/30 dark:border-gray-600 dark:focus:border-primary-400"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddCustomAmenity}
                disabled={!customAmenity.trim()}
                className="px-4 border-primary text-primary-600 hover:bg-primary-50 hover:border-primary-400 disabled:opacity-50 disabled:cursor-not-allowed dark:border-primary-600 dark:text-primary-400 dark:hover:bg-primary-950/20"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {selectedAmenities.length > 0 && (
            <div className="bg-background dark:bg-primary/10 rounded-xl p-6 border border-primary-200 dark:border-primary-800">
              <Label className="text-sm font-semibold text-primary-800 dark:text-primary-300 mb-4 block">
                {t("properties.form.amenities.selected.label", {
                  values: { count: selectedAmenities.length },
                })}
              </Label>
              <div className="flex flex-wrap gap-2">
                {selectedAmenities.map((item) => (
                  <Badge
                    key={item}
                    variant="secondary"
                    className="flex items-center gap-2 px-3 py-1.5 bg-primary-100 border border-primary-300 text-primary-700 hover:bg-primary-200 transition-colors dark:bg-primary-900/50 dark:border-primary-700 dark:text-primary-300"
                  >
                    <span className="font-medium">{item}</span>
                    <button
                      type="button"
                      className="ml-1 p-0.5 rounded-full hover:bg-primary-200 dark:hover:bg-primary-800 transition-colors"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRemoveAmenity(item);
                      }}
                      aria-label={t("properties.form.amenities.selected.remove", {
                        values: { name: item },
                      })}
                    >
                      <X className="h-3.5 w-3.5 text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-100" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Images — unchanged */}
      <Card className="border-0 shadow-lg bg-linear-to-br from-white to-gray-50/50 dark:from-primary/10 dark:to-background">
        <CardHeader className="pb-6">
          <CardTitle className="flex items-center gap-3 text-xl font-semibold">
            <div className="p-2 rounded-xl bg-green-100 dark:bg-green-900/30">
              <ImageIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            {t("properties.form.images.title")}
          </CardTitle>
          <CardDescription className="text-base text-gray-600 dark:text-gray-300">
            {t("properties.form.images.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ImageUpload
            onImagesUploaded={handleImagesUploaded}
            onImagesRemoved={(images) => images.forEach(handleImageRemove)}
            existingImages={propertyImages}
            maxFiles={20}
            folder="PropertyPro/properties"
            quality="auto"
            disabled={isLoading}
            className="w-full"
          />
          {propertyImages.length > 0 && (
            <div className="text-sm text-gray-600 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border">
              <span className="font-medium">{propertyImages.length}</span>{" "}
              {t("properties.form.images.count", {
                values: { count: propertyImages.length },
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline">
          {t("common.cancel")}
        </Button>
        <Button
          type="submit"
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-6 py-2 rounded-xl bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:shadow-none text-base font-medium"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("common.saving")}
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {mode === "create"
                ? t("properties.form.actions.create")
                : t("properties.form.actions.update")}
            </>
          )}
        </Button>
      </div>

      <AlertDialog open={showAlert} onOpenChange={setShowAlert}>
        <AlertDialogContent className="max-w-md border-red-200 dark:border-red-800">
          <AlertDialogHeader className="space-y-4">
            <div className="flex items-center justify-center w-14 h-14 mx-auto rounded-full bg-red-100 dark:bg-red-900/30 ring-4 ring-red-50 dark:ring-red-900/20">
              <Building2 className="h-7 w-7 text-red-600 dark:text-red-400" />
            </div>
            <AlertDialogTitle className="text-center text-xl font-semibold text-red-900 dark:text-red-100">
              {t("properties.form.alert.unitRequired.title")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-center text-base space-y-3 text-muted-foreground">
                <p className="text-gray-700 dark:text-gray-200 font-medium">
                  {t("properties.form.alert.unitRequired.summary")}
                </p>
                <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-lg p-4 text-sm text-left">
                  <p className="font-semibold text-red-900 dark:text-red-100 mb-2 flex items-center gap-2">
                    <span className="text-lg">⚠️</span>{" "}
                    {t("properties.form.alert.unitRequired.callout")}
                  </p>
                  <p className="text-red-800 dark:text-red-200 leading-relaxed">
                    {t("properties.form.alert.unitRequired.instructions")}
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
            <AlertDialogAction
              onClick={() => setShowAlert(false)}
              className="bg-linear-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white px-8 shadow-lg hover:shadow-xl transition-all"
            >
              {t("properties.form.alert.unitRequired.cta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}