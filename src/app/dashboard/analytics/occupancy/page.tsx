"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import {
  Home,
  Users,
  TrendingUp,
  TrendingDown,
  Calendar,
  Download,
  Filter,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { UserRole } from "@/types";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";

interface OccupancyData {
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  maintenanceUnits: number;
  unavailableUnits: number;
  occupancyRate: number;
  propertyBreakdown: Array<{
    propertyName: string;
    totalUnits: number;
    occupiedUnits: number;
    vacantUnits: number;
    maintenanceUnits: number;
    unavailableUnits: number;
    occupancyRate: number;
  }>;
}

export default function OccupancyAnalyticsPage() {
  const { data: session } = useSession();
  const { t } = useLocalizationContext();
  const [occupancyData, setOccupancyData] = useState<OccupancyData | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState("all");
  const [availableProperties, setAvailableProperties] = useState<
    Array<{ id: string; name: string }>
  >([]);

  const userRole = session?.user?.role as UserRole;
  const isAdmin = userRole === UserRole.ADMIN;

  useEffect(() => {
    fetchOccupancyData();
    fetchAvailableProperties();
  }, [selectedProperty]);

  const fetchAvailableProperties = async () => {
    try {
      const response = await fetch("/api/properties");
      if (response.ok) {
        const data = await response.json();
        setAvailableProperties(
          data.properties?.map((property: any) => ({
            id: property._id,
            name: property.name,
          })) || []
        );
      }
    } catch (error) {
      toast.error(t("analytics.toasts.propertiesListError"));
    }
  };

  const fetchOccupancyData = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/analytics/occupancy?property=${selectedProperty}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch occupancy data");
      }

      const data = await response.json();
      setOccupancyData(
        data?.data?.analytics ?? {
          totalUnits: 0,
          occupiedUnits: 0,
          vacantUnits: 0,
          maintenanceUnits: 0,
          unavailableUnits: 0,
          occupancyRate: 0,
          propertyBreakdown: [],
        }
      );
    } catch (error) {
      toast.error(t("analytics.toasts.occupancyLoadError"));
      setOccupancyData({
        totalUnits: 0,
        occupiedUnits: 0,
        vacantUnits: 0,
        maintenanceUnits: 0,
        unavailableUnits: 0,
        occupancyRate: 0,
        propertyBreakdown: [],
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <BarChart className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">
            {t("analytics.occupancy.page.title")}
          </h1>
        </div>
        <p className="text-muted-foreground">
          {t("analytics.occupancy.page.subtitle")}
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            {t("analytics.occupancy.filters.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-center">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t("analytics.occupancy.filters.property")}
              </label>
              <Select
                value={selectedProperty}
                onValueChange={setSelectedProperty}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("analytics.filters.property.all")}
                  </SelectItem>
                  {availableProperties.map((property) => (
                    <SelectItem key={property.id} value={property.id}>
                      {property.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              onClick={fetchOccupancyData}
              disabled={isLoading}
              className="mt-6"
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
              />
              {t("analytics.occupancy.filters.refresh")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("analytics.occupancy.stats.totalUnits")}
            </CardTitle>
            <Home className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {occupancyData?.totalUnits || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("analytics.occupancy.stats.acrossAll")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("analytics.occupancy.stats.occupied")}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {occupancyData?.occupiedUnits || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("analytics.occupancy.stats.currentlyOccupied")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("analytics.occupancy.stats.available")}
            </CardTitle>
            <Home className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {occupancyData?.vacantUnits || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("analytics.occupancy.stats.availableForRent")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("analytics.occupancy.stats.maintenance")}
            </CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {occupancyData?.maintenanceUnits || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("analytics.occupancy.stats.underMaintenance")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("analytics.occupancy.stats.occupancyRate")}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {occupancyData?.occupancyRate || 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              {t("analytics.occupancy.stats.currentRate")}
            </p>
          </CardContent>
        </Card>
      </div>

      {occupancyData?.propertyBreakdown &&
        occupancyData.propertyBreakdown.length > 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  {t("analytics.occupancy.distribution.title")}
                </CardTitle>
                <CardDescription>
                  {t("analytics.occupancy.distribution.description")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={[
                        {
                          name: t("analytics.occupancy.distribution.occupied"),
                          value: occupancyData.occupiedUnits,
                          fill: "#10b981",
                        },
                        {
                          name: t("analytics.occupancy.distribution.available"),
                          value: occupancyData.vacantUnits,
                          fill: "#3b82f6",
                        },
                        {
                          name: t(
                            "analytics.occupancy.distribution.maintenance"
                          ),
                          value: occupancyData.maintenanceUnits,
                          fill: "#f59e0b",
                        },
                        {
                          name: t(
                            "analytics.occupancy.distribution.unavailable"
                          ),
                          value: occupancyData.unavailableUnits,
                          fill: "#ef4444",
                        },
                      ].filter((item) => item.value > 0)}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {[
                        {
                          name: t("analytics.occupancy.distribution.occupied"),
                          value: occupancyData.occupiedUnits,
                          fill: "#10b981",
                        },
                        {
                          name: t("analytics.occupancy.distribution.available"),
                          value: occupancyData.vacantUnits,
                          fill: "#3b82f6",
                        },
                        {
                          name: t(
                            "analytics.occupancy.distribution.maintenance"
                          ),
                          value: occupancyData.maintenanceUnits,
                          fill: "#f59e0b",
                        },
                        {
                          name: t(
                            "analytics.occupancy.distribution.unavailable"
                          ),
                          value: occupancyData.unavailableUnits,
                          fill: "#ef4444",
                        },
                      ]
                        .filter((item) => item.value > 0)
                        .map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {t("analytics.occupancy.byProperty.title")}
                </CardTitle>
                <CardDescription>
                  {t("analytics.occupancy.byProperty.description")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={occupancyData?.propertyBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="propertyName"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      fontSize={12}
                    />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Bar dataKey="occupancyRate" fill="var(--primary)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        )}

      <Card>
        <CardHeader>
          <CardTitle>{t("analytics.occupancy.details.title")}</CardTitle>
          <CardDescription>
            {t("analytics.occupancy.details.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {occupancyData?.propertyBreakdown &&
          occupancyData.propertyBreakdown.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">
                      {t("analytics.occupancy.table.propertyName")}
                    </th>
                    <th className="text-left p-2">
                      {t("analytics.occupancy.table.totalUnits")}
                    </th>
                    <th className="text-left p-2">
                      {t("analytics.occupancy.table.occupied")}
                    </th>
                    <th className="text-left p-2">
                      {t("analytics.occupancy.table.available")}
                    </th>
                    <th className="text-left p-2">
                      {t("analytics.occupancy.table.maintenance")}
                    </th>
                    <th className="text-left p-2">
                      {t("analytics.occupancy.table.unavailable")}
                    </th>
                    <th className="text-left p-2">
                      {t("analytics.occupancy.table.occupancyRate")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {occupancyData.propertyBreakdown.map((property, index) => (
                    <tr key={index} className="border-b">
                      <td className="p-2 font-medium">
                        {property.propertyName}
                      </td>
                      <td className="p-2">{property.totalUnits}</td>
                      <td className="p-2 text-green-600">
                        {property.occupiedUnits}
                      </td>
                      <td className="p-2 text-blue-600">
                        {property.vacantUnits}
                      </td>
                      <td className="p-2 text-orange-600">
                        {property.maintenanceUnits}
                      </td>
                      <td className="p-2 text-red-600">
                        {property.unavailableUnits}
                      </td>
                      <td className="p-2">
                        <Badge
                          variant={
                            property.occupancyRate >= 95
                              ? "default"
                              : "secondary"
                          }
                        >
                          {property.occupancyRate}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Home className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t("analytics.occupancy.noData.title")}</p>
              <p className="text-sm">
                {t("analytics.occupancy.noData.description")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
