"use client";

/**
 * PropertyPro - Unit Statistics Component
 * Display statistics for available units
 */

import {
  Building2,
  DollarSign,
  Home,
  TrendingUp,
  Users,
  MapPin,
} from "lucide-react";
import { AvailableUnitResponse } from "@/lib/services/property.service";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";
import {
  AnalyticsCard,
  AnalyticsCardGrid,
} from "@/components/analytics/AnalyticsCard";

interface UnitStatsProps {
  units: AvailableUnitResponse[];
  totalUnits?: number;
  totalProperties?: number;
  variant?: "all" | "available";
}

export default function UnitStats({
  units,
  totalUnits: totalUnitsProp,
  totalProperties: totalPropertiesProp,
  variant = "all",
}: UnitStatsProps) {
  const { t, formatCurrency: formatCurrencyLocalized } =
    useLocalizationContext();

  // Calculate statistics - use props if available (for accurate totals across all pages)
  const totalUnits = totalUnitsProp ?? units.length;
  const currentPageUnits = units.length;
  const averageRent =
    currentPageUnits > 0
      ? Math.round(
          units.reduce((sum, unit) => sum + unit.rentAmount, 0) /
            currentPageUnits
        )
      : 0;

  const unitTypes = units.reduce((acc, unit) => {
    acc[unit.unitType] = (acc[unit.unitType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const mostCommonUnitType = Object.entries(unitTypes).reduce(
    (max, [type, count]) => (count > max.count ? { type, count } : max),
    { type: "N/A", count: 0 }
  );

  const rentRange =
    currentPageUnits > 0
      ? {
          min: Math.min(...units.map((unit) => unit.rentAmount)),
          max: Math.max(...units.map((unit) => unit.rentAmount)),
        }
      : { min: 0, max: 0 };

  const uniqueProperties =
    totalPropertiesProp ?? new Set(units.map((unit) => unit._id)).size;

  const bedroomDistribution = units.reduce((acc, unit) => {
    const bedrooms = unit.bedrooms;
    acc[bedrooms] = (acc[bedrooms] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const mostCommonBedrooms = Object.entries(bedroomDistribution).reduce(
    (max, [bedrooms, count]) =>
      count > max.count ? { bedrooms: Number(bedrooms), count } : max,
    { bedrooms: 0, count: 0 }
  );

  return (
    <AnalyticsCardGrid className="lg:grid-cols-6">
      <AnalyticsCard
        title={
          variant === "available"
            ? t("properties.available.stats.availableUnits.title", {
                defaultValue: "Available Units",
              })
            : t("properties.available.stats.totalUnits.title")
        }
        value={totalUnits.toLocaleString()}
        description={t("properties.available.stats.totalUnits.description", {
          values: {
            count: uniqueProperties,
            plural:
              uniqueProperties === 1
                ? t("properties.available.stats.totalUnits.property")
                : t("properties.available.stats.totalUnits.properties"),
          },
        })}
        icon={Home}
        iconColor={variant === "available" ? "success" : "primary"}
      />

      <AnalyticsCard
        title={t("properties.available.stats.averageRent.title")}
        value={formatCurrencyLocalized(averageRent)}
        description={t("properties.available.stats.averageRent.description", {
          values: {
            min: formatCurrencyLocalized(rentRange.min),
            max: formatCurrencyLocalized(rentRange.max),
          },
        })}
        icon={DollarSign}
        iconColor="success"
      />

      <AnalyticsCard
        title={t("properties.available.stats.mostCommonType.title")}
        value={
          mostCommonUnitType.type.charAt(0).toUpperCase() +
          mostCommonUnitType.type.slice(1)
        }
        description={t("properties.available.stats.mostCommonType.description", {
          values: {
            count: mostCommonUnitType.count,
            plural:
              mostCommonUnitType.count === 1
                ? t("properties.available.stats.mostCommonType.unit")
                : t("properties.available.stats.mostCommonType.units"),
          },
        })}
        icon={Building2}
        iconColor="info"
      />

      <AnalyticsCard
        title={t("properties.available.stats.popularLayout.title")}
        value={`${mostCommonBedrooms.bedrooms} ${
          mostCommonBedrooms.bedrooms === 1
            ? t("properties.available.stats.popularLayout.bedroom")
            : t("properties.available.stats.popularLayout.bedrooms")
        }`}
        description={t("properties.available.stats.popularLayout.description", {
          values: {
            count: mostCommonBedrooms.count,
            plural:
              mostCommonBedrooms.count === 1
                ? t("properties.available.stats.mostCommonType.unit")
                : t("properties.available.stats.mostCommonType.units"),
          },
        })}
        icon={Users}
        iconColor="warning"
      />

      <AnalyticsCard
        title={t("properties.available.stats.uniqueProperties.title")}
        value={uniqueProperties.toLocaleString()}
        description={t("properties.available.stats.uniqueProperties.description")}
        icon={MapPin}
        iconColor="info"
      />

      <AnalyticsCard
        title={t("properties.available.stats.occupancyRate.title")}
        value={t("properties.available.stats.occupancyRate.value")}
        description={t("properties.available.stats.occupancyRate.description")}
        icon={TrendingUp}
        iconColor="success"
      />
    </AnalyticsCardGrid>
  );
}
