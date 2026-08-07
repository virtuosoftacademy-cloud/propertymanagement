"use client";

import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-state";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Bed,
  Bath,
  Square,
  PoundSterling,
  MapPin,
  Edit,
  Trash2,
  Camera,
  Eye,
  Building2,
  Star,
  Home,
  CheckCircle,
  Calendar,
  ShieldCheck,
  FileText,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { unitService } from "@/lib/services/unit.service";
import { propertyService } from "@/lib/services/property.service";
import { AddUnitDialog } from "@/components/properties/AddUnitDialog";
import PropertyAmenities from "@/components/properties/PropertyAmenities";
import PropertyImageGallery from "@/components/properties/PropertyImageGallery";
import PropertyStatusManager from "@/components/properties/PropertyStatusManager";
import { EnhancedUnitDisplay } from "@/components/properties/UnitDisplay";
import { useLocalization } from "@/hooks/use-localization";

export default function PropertyDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [property, setProperty] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [units, setUnits] = useState<any[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showAddUnitDialog, setShowAddUnitDialog] = useState(false);
  const { t, formatCurrency, formatNumber, formatDate } = useLocalization();
  const propertyId = params.id as string;

  // Whether this property is an HMO (drives the compliance section visibility).
  const isHmo = property?.type === "hmo";

  // Helper function to get unit statistics
  const getUnitStats = (units: any[]) => {
    if (!units || units.length === 0) {
      return { available: 0, occupied: 0, maintenance: 0, total: 0, types: [] };
    }

    const stats = {
      available: 0,
      occupied: 0,
      maintenance: 0,
      total: units.length,
      types: [] as string[],
    };

    const typeSet = new Set<string>();

    units.forEach((unit) => {
      switch (unit.status) {
        case "available":
          stats.available++;
          break;
        case "occupied":
          stats.occupied++;
          break;
        case "maintenance":
          stats.maintenance++;
          break;
      }
      typeSet.add(unit.unitType);
    });

    stats.types = Array.from(typeSet);
    return stats;
  };

  // Helper function to get rent range for multi-unit properties
  const getRentRange = (units: any[]) => {
    if (!units || units.length === 0) return null;

    const rents = units.map((unit: any) => unit.rentAmount);
    const minRent = Math.min(...rents);
    const maxRent = Math.max(...rents);

    if (minRent === maxRent) {
      return `${formatCurrency(minRent)}`;
    }

    return `${formatCurrency(minRent)} - ${formatCurrency(maxRent)}`;
  };

  // Helper function to get total square footage from units
  const getTotalSquareFootage = (units: any[]) => {
    if (units.length > 0) {
      return units.reduce(
        (total, unit) => total + (unit.squareFootage || 0),
        0
      );
    }
    return 0;
  };

  // Helper function to get total bedrooms from units
  const getTotalBedrooms = (units: any[]) => {
    if (units.length > 0) {
      return units.reduce((total, unit) => total + (unit.bedrooms || 0), 0);
    }
    return 0;
  };

  // Helper function to get total bathrooms from units
  const getTotalBathrooms = (units: any[]) => {
    if (units.length > 0) {
      return units.reduce((total, unit) => total + (unit.bathrooms || 0), 0);
    }
    return 0;
  };

  // Helper function to get security deposit range from units
  const getSecurityDepositRange = (units: any[]) => {
    if (!units || units.length === 0) return null;

    const deposits = units.map((unit: any) => unit.securityDeposit || 0);
    const minDeposit = Math.min(...deposits);
    const maxDeposit = Math.max(...deposits);

    if (minDeposit === maxDeposit) {
      return `${formatCurrency(minDeposit)}`;
    }

    return `${formatCurrency(minDeposit)} - ${formatCurrency(maxDeposit)}`;
  };

  useEffect(() => {
    const fetchProperty = async () => {
      try {
        setLoading(true);
        setError(null);

        const propertyData = await propertyService.getProperty(propertyId);

        if (!propertyData) {
          throw new Error("Property data is null or undefined");
        }

        setProperty(propertyData);

        // Set units from property data for all properties (both single and multi-unit)
        // The API already includes units data, so we don't need to fetch separately
        if (propertyData.units && propertyData.units.length > 0) {
          setUnits(propertyData.units);

          // Ensure totalUnits is in sync with actual units count
          if (propertyData.totalUnits !== propertyData.units.length) {
            setProperty((prev: any) =>
              prev
                ? {
                    ...prev,
                    totalUnits: propertyData.units?.length || 0,
                  }
                : null
            );
          }
        } else {
          setUnits([]);
        }
      } catch (err: any) {
        console.error("Failed to fetch property details", err);
        const errorMessage = t("properties.details.error.fetchFailed");
        toast.error(errorMessage);
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    if (propertyId) {
      fetchProperty();
    }
  }, [propertyId, t]);

  // Refresh units data after unit operations
  const refreshUnits = async () => {
    try {
      setUnitsLoading(true);
      const unitsData = await unitService.getUnits(propertyId);
      setUnits(unitsData);

      // Update property's totalUnits to keep it in sync
      if (property) {
        setProperty((prev: any) =>
          prev ? { ...prev, totalUnits: unitsData.length } : null
        );
      }
    } catch (err: any) {
      console.error("Failed to refresh units", err);
      toast.error(err.message || t("properties.details.units.refreshError"));
    } finally {
      setUnitsLoading(false);
    }
  };

  // Handler for editing property
  const handleEditProperty = () => {
    router.push(`/dashboard/properties/${propertyId}/edit`);
  };

  // Unit management handlers

  // DISABLED: Delete functionality temporarily disabled
  const handleDeleteUnit = async (unitId: string) => {
    try {
      await unitService.deleteUnit(propertyId, unitId);
      toast.success("Unit deleted successfully");
      await refreshUnits(); // Refresh units list
    } catch (err: any) {
      toast.error(err.message || "Failed to delete unit");
      throw err; // Re-throw to let the component handle it
    }
  };

  // DISABLED: Delete functionality temporarily disabled
  const handleDeleteProperty = async () => {
    try {
      setIsDeleting(true);
      await propertyService.deleteProperty(propertyId);
      toast.success("Property deleted successfully");
      router.push("/dashboard/properties");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete property");
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  // Check if user can edit/delete this property - Single company architecture
  const canModifyProperty = () => {
    if (!session?.user || !property) return false;

    const userRole = (session.user as any).role;

    // Admin and Manager can modify any company property
    return userRole === "admin" || userRole === "manager";
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[90vh]">
        <LoadingSpinner message="" size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("properties.details.error.title")}
            </h3>
            <p className="text-muted-foreground text-center mb-6">
              {error}
            </p>
            <div className="flex space-x-3">
              <Button
                size="sm"
                onClick={() => window.location.reload()}
                variant="outline"
              >
                {t("properties.details.actions.retry")}
              </Button>
              <Button
                size="sm"
                onClick={() => router.push("/dashboard/properties")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t("properties.details.actions.backToList")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("properties.details.notFound.title")}
            </h3>
            <p className="text-muted-foreground text-center mb-6">
              {t("properties.details.notFound.description")}
            </p>
            <Button
              size="sm"
              onClick={() => router.push("/dashboard/properties")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("properties.details.actions.backToList")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        {/* Left side - Back button */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push("/dashboard/properties")}
          className="flex items-center space-x-1"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t("properties.details.actions.backToList")}</span>
        </Button>

        {/* Center - Property name and badges */}
        <div className="flex-1 text-center">
          <h1 className="text-3xl font-bold text-foreground">
            {property?.propertyOwnerName || t("properties.details.unknownProperty")}
          </h1>
          <h3 className="text-xl font-bold text-foreground capitalize">
            {property?.name || t("properties.details.unknownProperty")}
          </h3>
          <div className="flex items-center justify-center space-x-2 mt-2">
            {property?.status && (
              <Badge variant="outline">
                {t(`properties.status.${property.status}`)}
              </Badge>
            )}
            {property?.type && (
              <Badge variant="secondary">
                {t(`properties.type.${property.type}`)}
              </Badge>
            )}
          </div>
        </div>

        {/* Right side - Action Buttons */}
        {canModifyProperty() && (
          <div className="flex items-center space-x-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleEditProperty}
              className="flex items-center space-x-2"
            >
              <Edit className="h-4 w-4" />
              <span>{t("properties.details.actions.editProperty")}</span>
            </Button>

            {/* DISABLED: Delete functionality temporarily disabled */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowDeleteDialog(true)}
              className="flex items-center space-x-2 text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20"
            >
              <Trash2 className="h-4 w-4" />
              <span>{t("properties.details.actions.deleteProperty")}</span>
            </Button>
          </div>
        )}
      </div>
      {/* Enhanced Property Details Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <div className="bg-card rounded-xl border border-border shadow-sm p-2">
          <TabsList className="grid w-full grid-cols-5 bg-transparent rounded-lg h-auto gap-2">
            <TabsTrigger
              value="overview"
              className="group flex items-center gap-2 py-2 px-3 rounded-lg bg-transparent hover:bg-muted/50 data-[state=active]:bg-linear-to-r data-[state=active]:from-primary data-[state=active]:to-primary data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-200"
            >
              <Building2 className="h-4 w-4 text-primary group-data-[state=active]:text-white" />
              <span className="font-medium text-sm text-muted-foreground group-data-[state=active]:text-white">
                {t("properties.details.tabs.overview")}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="details"
              className="group flex items-center gap-2 py-2 px-3 rounded-lg bg-transparent hover:bg-muted/50 data-[state=active]:bg-linear-to-r data-[state=active]:from-primary data-[state=active]:to-primary data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-200"
            >
              <Eye className="h-4 w-4 text-primary group-data-[state=active]:text-white" />
              <span className="font-medium text-sm text-muted-foreground group-data-[state=active]:text-white">
                {t("properties.details.tabs.details")}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="units"
              className="group flex items-center gap-2 py-2 px-3 rounded-lg bg-transparent hover:bg-muted/50 data-[state=active]:bg-linear-to-r data-[state=active]:from-primary data-[state=active]:to-primary data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-200"
            >
              <Building2 className="h-4 w-4 text-primary group-data-[state=active]:text-white" />
              <span className="font-medium text-sm text-muted-foreground group-data-[state=active]:text-white">
                {t("properties.details.tabs.units")}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="images"
              className="group flex items-center gap-2 py-2 px-3 rounded-lg bg-transparent hover:bg-muted/50 data-[state=active]:bg-linear-to-r data-[state=active]:from-primary data-[state=active]:to-primary data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-200"
            >
              <Camera className="h-4 w-4 text-primary group-data-[state=active]:text-white" />
              <span className="font-medium text-sm text-muted-foreground group-data-[state=active]:text-white">
                {t("properties.details.tabs.images")}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="amenities"
              className="group flex items-center gap-2 py-2 px-3 rounded-lg bg-transparent hover:bg-muted/50 data-[state=active]:bg-linear-to-r data-[state=active]:from-primary data-[state=active]:to-primary data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-200"
            >
              <Star className="h-4 w-4 text-primary group-data-[state=active]:text-white" />
              <span className="font-medium text-sm text-muted-foreground group-data-[state=active]:text-white">
                {t("properties.details.tabs.amenities")}
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-6">
          {/* Enhanced Property Basic Information - Minimal Style */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Property Type */}
            <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-all duration-300">
              <CardContent className="">
                <div className="flex items-center space-x-4">
                  <div className="p-2 bg-muted/30 rounded-lg">
                    <Building2 className="h-6 w-6 text-primary dark:text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground capitalize">
                      {property?.type
                        ? t(`properties.type.${property.type}`)
                        : t("properties.labels.unknown")}
                    </p>
                    <p className="text-sm font-medium text-muted-foreground">
                      {t("properties.details.overview.propertyType")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Total Units (for multi-unit) or Bedrooms (for single unit) */}
            <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-all duration-300">
              <CardContent className="">
                <div className="flex items-center space-x-4">
                  <div className="p-2 bg-muted/30 rounded-lg">
                    <Bed className="h-6 w-6 text-success" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {getTotalBedrooms(units) ||
                        t("properties.labels.unknown")}
                    </p>
                    <p className="text-sm font-medium text-muted-foreground">
                      {t("properties.details.overview.bedrooms")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bathrooms */}
            <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-all duration-300">
              <CardContent className="">
                <div className="flex items-center space-x-4">
                  <div className="p-2 bg-muted/30 rounded-lg">
                    <Bath className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {getTotalBathrooms(units) ||
                        t("properties.labels.unknown")}
                    </p>
                    <p className="text-sm font-medium text-muted-foreground">
                      {t("properties.details.overview.bathrooms")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Square Footage */}
            <Card className="border border-border shadow-sm bg-card hover:shadow-md transition-all duration-300">
              <CardContent className="">
                <div className="flex items-center space-x-4">
                  <div className="p-2 bg-muted/30 rounded-lg">
                    <Square className="h-6 w-6 text-success" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {(() => {
                        const totalSqFt = getTotalSquareFootage(units);
                        return totalSqFt > 0
                          ? `${formatNumber(totalSqFt)} ${t(
                              "properties.labels.squareFeetUnit"
                            )}`
                          : t("properties.labels.unknown");
                      })()}
                    </p>
                    <p className="text-sm font-medium text-muted-foreground">
                      {t("properties.details.overview.totalSquareFootage")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Multi-Unit Property Statistics - Minimal Style */}
          {property?.isMultiUnit && units.length > 0 && (
            <Card className="border p-0 border-border shadow-sm bg-foreground dark:bg-background overflow-hidden">
              <CardHeader className="bg-info/10 dark:bg-primary/10 border-b border-border p-6">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-info/10 dark:bg-primary/20 rounded-lg">
                      <Building2 className="h-6 w-6 text-primary dark:text-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-foreground">
                        {t("properties.details.overview.occupancy.title")}
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        {t("properties.details.overview.occupancy.subtitle")}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setActiveTab("units")}
                      className="border-border text-muted-foreground hover:bg-muted/50"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      {t("properties.details.overview.actions.viewAllUnits")}
                    </Button>
                    {canModifyProperty() && (
                      <Button
                        onClick={() => setShowAddUnitDialog(true)}
                        className="bg-primary text-white hover:bg-primary-700"
                      >
                        <Building2 className="h-4 w-4 mr-2" />
                        {t("properties.details.overview.actions.addUnit")}
                      </Button>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {(() => {
                  const unitStats = getUnitStats(units);
                  const occupancyRate =
                    unitStats.total > 0
                      ? Math.round((unitStats.occupied / unitStats.total) * 100)
                      : 0;

                  return (
                    <div className="space-y-6">
                      {/* Occupancy Rate */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-foreground">
                            {t(
                              "properties.details.overview.occupancy.rateLabel"
                            )}
                          </h4>
                          <span className="text-2xl font-bold text-info">
                            {occupancyRate}%
                          </span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-3">
                          <div
                            className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-300"
                            style={{ width: `${occupancyRate}%` }}
                          ></div>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {t("properties.details.overview.occupancy.summary", {
                            values: {
                              occupied: unitStats.occupied,
                              total: unitStats.total,
                            },
                          })}
                        </p>
                      </div>

                      {/* Unit Status Summary - Minimal Style */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-6 bg-muted/30 rounded-lg border border-border hover:shadow-sm transition-all duration-300">
                          <div className="text-3xl font-bold text-success mb-2">
                            {unitStats.available}
                          </div>
                          <div className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                            {t("properties.status.available")}
                          </div>
                          <div className="mt-2 w-full bg-muted rounded-full h-2">
                            <div
                              className="bg-success h-2 rounded-full transition-all duration-500"
                              style={{
                                width: `${
                                  unitStats.total > 0
                                    ? (unitStats.available / unitStats.total) *
                                      100
                                    : 0
                                }%`,
                              }}
                            ></div>
                          </div>
                        </div>

                        <div className="text-center p-6 bg-muted/30 rounded-lg border border-border hover:shadow-sm transition-all duration-300">
                          <div className="text-3xl font-bold text-info mb-2">
                            {unitStats.occupied}
                          </div>
                          <div className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                            {t("properties.status.occupied")}
                          </div>
                          <div className="mt-2 w-full bg-muted rounded-full h-2">
                            <div
                              className="bg-info h-2 rounded-full transition-all duration-500"
                              style={{
                                width: `${
                                  unitStats.total > 0
                                    ? (unitStats.occupied / unitStats.total) *
                                      100
                                    : 0
                                }%`,
                              }}
                            ></div>
                          </div>
                        </div>

                        <div className="text-center p-6 bg-muted/30 rounded-lg border border-border hover:shadow-sm transition-all duration-300">
                          <div className="text-3xl font-bold text-warning mb-2">
                            {unitStats.maintenance}
                          </div>
                          <div className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                            {t("properties.status.maintenance")}
                          </div>
                          <div className="mt-2 w-full bg-muted rounded-full h-2">
                            <div
                              className="bg-warning h-2 rounded-full transition-all duration-500"
                              style={{
                                width: `${
                                  unitStats.total > 0
                                    ? (unitStats.maintenance /
                                        unitStats.total) *
                                      100
                                    : 0
                                }%`,
                              }}
                            ></div>
                          </div>
                        </div>

                        <div className="text-center p-6 bg-muted/30 rounded-lg border border-border hover:shadow-sm transition-all duration-300">
                          <div className="text-3xl font-bold text-foreground mb-2">
                            {unitStats.total}
                          </div>
                          <div className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                            {t("properties.details.specs.fields.totalUnits")}
                          </div>
                          <div className="mt-2 w-full bg-muted rounded-full h-2">
                            <div className="bg-muted-foreground h-2 rounded-full w-full transition-all duration-500"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* Enhanced Property Location & Financial Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Property Location Card - Minimal Style */}
            <Card className="border p-0 border-border shadow-sm bg-card overflow-hidden">
              <CardHeader className="bg-muted/30 border-b border-border p-6">
                <CardTitle className="flex items-center space-x-3">
                  <div className="p-2 bg-primary/10 dark:bg-primary/90 rounded-lg">
                    <MapPin className="h-6 w-6 text-primary dark:text-foreground" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground">
                      {t("properties.details.location.title")}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {t("properties.details.location.subtitle")}
                    </p>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 mb-4  ">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block">
                      {t("properties.details.location.street")}
                    </label>
                    <p className="text-md font-semibold text-foreground">
                      {property?.address?.street ||
                        t("properties.details.common.notAvailable")}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-1 block">
                        {t("properties.details.location.city")}
                      </label>
                      <p className="font-medium text-foreground">
                        {property?.address?.city ||
                          t("properties.details.common.notAvailable")}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-1 block">
                        {t("properties.details.location.state")}
                      </label>
                      <p className="font-medium text-foreground">
                        {property?.address?.state ||
                          t("properties.details.common.notAvailable")}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block">
                      {t("properties.details.location.postalCode")}
                    </label>
                    <p className="font-medium text-foreground">
                      {property?.address?.zipCode ||
                        t("properties.details.common.notAvailable")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Financial Overview - Minimal Style */}
            <Card className="border p-0 border-border shadow-sm bg-card overflow-hidden">
              <CardHeader className="bg-muted/30 border-b border-border p-6">
                <CardTitle className="flex items-center space-x-3">
                  <div className="p-2 bg-success/10 rounded-lg">
                    <PoundSterling className="h-6 w-6 text-success" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground">
                      {t("properties.details.financial.title")}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {t("properties.details.financial.subtitle")}
                    </p>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 mb-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="p-6 bg-muted/30 rounded-lg border border-border">
                      <label className="text-sm font-medium text-muted-foreground mb-2 block uppercase tracking-wide">
                        {t("properties.details.financial.nightRent.label")}
                      </label>
                      <p className="text-xl font-bold text-foreground mb-2">
                        {property?.isMultiUnit && units.length > 0
                          ? getRentRange(units) ||
                            t("properties.details.common.notAvailable")
                          : getRentRange(units) ||
                            t("properties.details.common.notAvailable")}
                      </p>
                      <div className="flex items-center text-sm text-muted-foreground">
                        {/* <PoundSterling className="h-4 w-4 mr-1" /> */}
                        <span>
                          {t("properties.details.financial.monthlyRent.helper")}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-muted/30 rounded-lg border border-border">
                        <label className="text-sm font-medium text-muted-foreground mb-2 block uppercase tracking-wide">
                          {t(
                            "properties.details.financial.securityDeposit.label"
                          )}
                        </label>
                        <p className="text-xl font-bold text-foreground">
                          {getSecurityDepositRange(units) ||
                            t("properties.details.common.notAvailable")}
                        </p>
                        <div className="flex items-center text-sm text-muted-foreground mt-1">
                          <Square className="h-3 w-3 mr-1" />
                          <span>
                            {t(
                              "properties.details.financial.securityDeposit.helper"
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="p-4 bg-muted/30 rounded-lg border border-border">
                        <label className="text-sm font-medium text-muted-foreground mb-2 block uppercase tracking-wide">
                          {t(
                            "properties.details.financial.pricePerSquareFoot.label",
                            {
                              values: {
                                unit: t("properties.labels.squareFeetUnit"),
                              },
                            }
                          )}
                        </label>
                        <p className="text-xl font-bold text-foreground">
                          {(() => {
                            if (units.length > 0) {
                              // Calculate average price per sq ft from units
                              const totalRent = units.reduce(
                                (sum, unit) => sum + (unit.rentAmount || 0),
                                0
                              );
                              const totalSqFt = units.reduce(
                                (sum, unit) => sum + (unit.squareFootage || 0),
                                0
                              );
                              return totalSqFt > 0
                                ? `${formatCurrency(
                                    Number((totalRent / totalSqFt).toFixed(2))
                                  )}`
                                : t("properties.details.common.notAvailable");
                            }
                            return t("properties.details.common.notAvailable");
                          })()}
                        </p>
                        <div className="flex items-center text-sm text-muted-foreground mt-1">
                          <Square className="h-3 w-3 mr-1" />
                          <span>
                            {t(
                              "properties.details.financial.pricePerSquareFoot.helper"
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="details" className="space-y-6">
          {/* Property Specifications - Minimal Style */}
          <div className="bg-card rounded-lg border border-border shadow-sm p-8">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 rounded-lg bg-primary/10">
                <Building2 className="h-7 w-7 text-primary dark:text-primary" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-foreground">
                  {t("properties.details.specs.title")}
                </h3>
                <p className="text-muted-foreground">
                  {t("properties.details.specs.subtitle")}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Property Type Card */}
              <div className="p-4 rounded-lg bg-muted/30 border border-border hover:shadow-sm transition-all duration-300">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-1.5 rounded-lg bg-info/10">
                    <Home className="h-4 w-4 text-info" />
                  </div>
                  <label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    {t("properties.details.specs.fields.type")}
                  </label>
                </div>
                <p className="text-lg font-bold text-foreground capitalize">
                  {property?.type
                    ? t(`properties.type.${property.type}`)
                    : t("properties.details.common.notAvailable")}
                </p>
              </div>

              {/* Status Card */}
              {/* <div className="p-4 rounded-lg bg-muted/30 border border-border hover:shadow-sm transition-all duration-300">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-1.5 rounded-lg bg-success/10">
                    <CheckCircle className="h-4 w-4 text-success" />
                  </div>
                  <label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    {t("properties.details.specs.fields.status")}
                  </label>
                </div>
                <div className="flex items-center space-x-3">
                  <p className="text-lg font-bold text-foreground capitalize">
                    {property.status
                      ? t(`properties.status.${property.status}`)
                      : t("properties.details.common.notAvailable")}
                  </p>
                  {canModifyProperty() && (
                    <PropertyStatusManager
                      currentStatus={property.status}
                      onStatusUpdate={async (newStatus) => {
                        try {
                          await propertyService.updateProperty(propertyId, {
                            status: newStatus,
                          });
                          setProperty((prev: any) =>
                            prev ? { ...prev, status: newStatus } : null
                          );
                          toast.success(
                            t("properties.toasts.statusUpdate.success")
                          );
                        } catch (error: any) {
                          toast.error(
                            error.message ||
                              t("properties.toasts.statusUpdate.error")
                          );
                        }
                      }}
                    />
                  )}
                </div>
              </div> */}

              {/* Total Units Card */}
              <div className="p-4 rounded-lg bg-muted/30 border border-border hover:shadow-sm transition-all duration-300">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-1.5 rounded-lg bg-primary/10">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                  <label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    {t("properties.details.specs.fields.totalUnits")}
                  </label>
                </div>
                <p className="text-lg font-bold text-foreground">
                  {units.length || 1}
                </p>
              </div>

              {/* Year Built Card */}
              <div className="p-4 rounded-lg bg-muted/30 border border-border hover:shadow-sm transition-all duration-300">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-1.5 rounded-lg bg-warning/10">
                    <Calendar className="h-4 w-4 text-warning" />
                  </div>
                  <label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    {t("properties.details.specs.fields.yearBuilt")}
                  </label>
                </div>
                <p className="text-lg font-bold text-foreground">
                  {property?.yearBuilt ||
                    t("properties.details.common.notAvailable")}
                </p>
              </div>

              {/* Description Card - Full Width */}
              {property?.description && (
                <div className="p-4 rounded-lg bg-muted/30 border border-border hover:shadow-sm transition-all duration-300 md:col-span-3">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <Eye className="h-4 w-4 text-primary" />
                    </div>
                    <label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      {t("properties.details.specs.fields.description")}
                    </label>
                  </div>
                  <p className="text-base text-muted-foreground">
                    {property.description}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* HMO Compliance Licence — only shown for HMO properties */}
          {isHmo && (
            <div className="bg-card rounded-lg border border-border shadow-sm p-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 rounded-lg bg-primary/10">
                  <ShieldCheck className="h-7 w-7 text-primary dark:text-primary" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-foreground">
                    {t("properties.details.hmo.title", {
                      defaultValue: "HMO Compliance",
                    })}
                  </h3>
                  <p className="text-muted-foreground">
                    {t("properties.details.hmo.subtitle", {
                      defaultValue: "Mandatory HMO licence details",
                    })}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Licence Number */}
                <div className="p-4 rounded-lg bg-muted/30 border border-border hover:shadow-sm transition-all duration-300">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-1.5 rounded-lg bg-info/10">
                      <FileText className="h-4 w-4 text-info" />
                    </div>
                    <label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      {t("properties.details.hmo.licenseNumber", {
                        defaultValue: "Licence number",
                      })}
                    </label>
                  </div>
                  <p className="text-lg font-bold text-foreground break-words">
                    {property?.hmoLicenseNumber ||
                      t("properties.details.common.notAvailable")}
                  </p>
                </div>

                {/* Issue Date */}
                <div className="p-4 rounded-lg bg-muted/30 border border-border hover:shadow-sm transition-all duration-300">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-1.5 rounded-lg bg-warning/10">
                      <Calendar className="h-4 w-4 text-warning" />
                    </div>
                    <label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      {t("properties.details.hmo.issueDate", {
                        defaultValue: "Licence issue date",
                      })}
                    </label>
                  </div>
                  <p className="text-lg font-bold text-foreground">
                    {property?.hmoLicenseIssueDate
                      ? formatDate(property.hmoLicenseIssueDate)
                      : t("properties.details.common.notAvailable")}
                  </p>
                </div>

                {/* Expiry Date + status badge */}
                <div className="p-4 rounded-lg bg-muted/30 border border-border hover:shadow-sm transition-all duration-300">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-1.5 rounded-lg bg-destructive/10">
                      <Calendar className="h-4 w-4 text-destructive" />
                    </div>
                    <label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      {t("properties.details.hmo.expiryDate", {
                        defaultValue: "Licence expiry date",
                      })}
                    </label>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-lg font-bold text-foreground">
                      {property?.hmoLicenseExpiry
                        ? formatDate(property.hmoLicenseExpiry)
                        : t("properties.details.common.notAvailable")}
                    </p>
                    {property?.hmoLicenseExpiry &&
                      (new Date(property.hmoLicenseExpiry) < new Date() ? (
                        <Badge
                          variant="outline"
                          className="text-destructive border-destructive/20"
                        >
                          {t("properties.details.hmo.expired", {
                            defaultValue: "Expired",
                          })}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-success border-success/20"
                        >
                          {t("properties.details.hmo.valid", {
                            defaultValue: "Valid",
                          })}
                        </Badge>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Property Features */}
          {property?.features && property.features.length > 0 && (
            <div className="bg-card rounded-lg border border-border shadow-sm p-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 rounded-lg bg-warning/10">
                  <Star className="h-7 w-7 text-warning" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-foreground">
                    {t("properties.details.features.title")}
                  </h3>
                  <p className="text-muted-foreground">
                    {t("properties.details.features.subtitle")}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {property.features.map((feature: string, index: number) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-muted/30 border border-border hover:shadow-sm transition-all duration-200"
                  >
                    <Star className="h-4 w-4 text-warning" />
                    <span className="text-sm font-medium text-muted-foreground">
                      {feature}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Property Amenities */}
          {property?.amenities && property.amenities.length > 0 && (
            <div className="bg-card rounded-lg border border-border shadow-sm p-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Building2 className="h-7 w-7 text-primary dark:text-primary" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-foreground">
                    {t("properties.details.amenities.title")}
                  </h3>
                  <p className="text-muted-foreground">
                    {t("properties.details.amenities.subtitle")}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {property.amenities.map((amenity: any, index: number) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-4 rounded-lg bg-muted/30 border border-border hover:shadow-sm transition-all duration-200"
                  >
                    <div className="shrink-0 w-2.5 h-2.5 bg-primary rounded-full"></div>
                    <span className="text-sm font-medium text-muted-foreground">
                      {amenity.name || amenity}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="images" className="space-y-6">
          <PropertyImageGallery
            images={property?.images || []}
            propertyName={
              property?.name || t("properties.details.unknownProperty")
            }
            canEdit={canModifyProperty()}
            onImagesUpdate={(newImages) => {
              setProperty((prev: any) =>
                prev ? { ...prev, images: newImages } : null
              );
            }}
            propertyId={propertyId}
          />
        </TabsContent>

        <TabsContent value="amenities" className="space-y-6">
          <PropertyAmenities
            amenities={property.amenities}
            canEdit={canModifyProperty()}
            onAmenitiesUpdate={(newAmenities) => {
              setProperty((prev: any) =>
                prev ? { ...prev, amenities: newAmenities } : null
              );
            }}
            propertyId={propertyId}
          />
        </TabsContent>

        {/* Units Tab - For all properties */}
        <TabsContent value="units" className="space-y-6">
          <EnhancedUnitDisplay
            units={units}
            propertyId={propertyId}
            // onDeleteUnit={handleDeleteUnit}
            onAddUnit={() => {
              // Open add unit dialog
              setShowAddUnitDialog(true);
            }}
            onUnitsChange={refreshUnits}
            isLoading={unitsLoading}
            isSingleUnit={!property?.isMultiUnit}
          />
        </TabsContent>
      </Tabs>

      {/* DISABLED: Delete functionality temporarily disabled */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Property</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{property?.name}&quot;? This
              action cannot be undone. All associated data including leases,
              payments, and maintenance requests will be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProperty}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive focus:ring-red-600"
            >
              {isDeleting ? "Deleting..." : "Delete Property"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Unit Dialog - Only for multi-unit properties */}
      {property?.isMultiUnit && (
        <AddUnitDialog
          open={showAddUnitDialog}
          onOpenChange={setShowAddUnitDialog}
          propertyId={propertyId}
          onUnitAdded={refreshUnits}
        />
      )}
    </div>
  );
}