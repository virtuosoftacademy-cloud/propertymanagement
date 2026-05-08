/**
 * PropertyPro - Property Statistics Component
 * Dashboard statistics for property management
 */

"use client";

import { useMemo } from "react";
import {
  Building2,
  Users,
  DollarSign,
  TrendingUp,
  CheckCircle,
  Wrench,
} from "lucide-react";
import { PropertyResponse } from "@/lib/services/property.service";
import { PropertyStatus, PropertyType } from "@/types";
import {
  AnalyticsCard,
  AnalyticsCardGrid,
} from "@/components/analytics/AnalyticsCard";
import { useLocalizationContext } from "@/components/providers/LocalizationProvider";

interface PropertyStatsProps {
  properties: PropertyResponse[];
  totalCount?: number;
}

export default function PropertyStats({
  properties,
  totalCount,
}: PropertyStatsProps) {
  const { t, formatCurrency: formatCurrencyLocalized } =
    useLocalizationContext();

  const stats = useMemo(() => {
    if (!properties.length) {
      return {
        total: 0,
        available: 0,
        occupied: 0,
        maintenance: 0,
        unavailable: 0,
        averageRent: 0,
        totalRentValue: 0,
        averageSquareFootage: 0,
        houses: 0,
        apartments: 0,
        condos: 0,
        townhouses: 0,
        commercial: 0,
        thisMonthAdded: 0,
        lastMonthAdded: 0,
        totalUnits: 0,
        availableUnits: 0,
        occupiedUnits: 0,
        maintenanceUnits: 0,
      };
    }

    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // Status counts for properties
    const available = properties.filter(
      (p) => p.status === PropertyStatus.AVAILABLE
    ).length;
    const occupied = properties.filter(
      (p) => p.status === PropertyStatus.OCCUPIED
    ).length;
    const maintenance = properties.filter(
      (p) => p.status === PropertyStatus.MAINTENANCE
    ).length;
    const unavailable = properties.filter(
      (p) => p.status === PropertyStatus.UNAVAILABLE
    ).length;

    // Unit-based statistics
    let totalUnits = 0;
    let availableUnits = 0;
    let occupiedUnits = 0;
    let maintenanceUnits = 0;

    properties.forEach((property) => {
      if (property.isMultiUnit && property.units) {
        totalUnits += property.units.length;
        property.units.forEach((unit) => {
          switch (unit.status) {
            case PropertyStatus.AVAILABLE:
              availableUnits++;
              break;
            case PropertyStatus.OCCUPIED:
              occupiedUnits++;
              break;
            case PropertyStatus.MAINTENANCE:
              maintenanceUnits++;
              break;
          }
        });
      } else {
        // Single unit properties count as 1 unit
        totalUnits += 1;
        switch (property.status) {
          case PropertyStatus.AVAILABLE:
            availableUnits++;
            break;
          case PropertyStatus.OCCUPIED:
            occupiedUnits++;
            break;
          case PropertyStatus.MAINTENANCE:
            maintenanceUnits++;
            break;
        }
      }
    });

    // Type counts
    const houses = properties.filter(
      (p) => p.type === PropertyType.HOUSE
    ).length;
    const apartments = properties.filter(
      (p) => p.type === PropertyType.APARTMENT
    ).length;
    const condos = properties.filter(
      (p) => p.type === PropertyType.CONDO
    ).length;
    const townhouses = properties.filter(
      (p) => p.type === PropertyType.TOWNHOUSE
    ).length;
    const commercial = properties.filter(
      (p) => p.type === PropertyType.COMMERCIAL
    ).length;

    // Financial calculations
    const totalRentValue = properties.reduce((sum, p) => sum + p.rentAmount, 0);
    const averageRent = Math.round(totalRentValue / properties.length);

    // Square footage
    const totalSquareFootage = properties.reduce(
      (sum, p) => sum + p.squareFootage,
      0
    );
    const averageSquareFootage = Math.round(
      totalSquareFootage / properties.length
    );

    // Monthly additions
    const thisMonthAdded = properties.filter(
      (p) => new Date(p.createdAt) >= thisMonth
    ).length;

    const lastMonthAdded = properties.filter((p) => {
      const createdDate = new Date(p.createdAt);
      return createdDate >= lastMonth && createdDate <= lastMonthEnd;
    }).length;

    return {
      total: properties.length,
      available,
      occupied,
      maintenance,
      unavailable,
      averageRent,
      totalRentValue,
      averageSquareFootage,
      houses,
      apartments,
      condos,
      townhouses,
      commercial,
      thisMonthAdded,
      lastMonthAdded,
      totalUnits,
      availableUnits,
      occupiedUnits,
      maintenanceUnits,
    };
  }, [properties]);

  return (
    <AnalyticsCardGrid>
      <AnalyticsCard
        title={t("properties.stats.totalProperties.title")}
        value={typeof totalCount === "number" ? totalCount : stats.total}
        description={t("properties.stats.totalProperties.description")}
        icon={Building2}
        iconColor="primary"
      />

      <AnalyticsCard
        title={t("properties.stats.availableProperties.title")}
        value={stats.available}
        description={t("properties.stats.availableProperties.description")}
        icon={CheckCircle}
        iconColor="success"
      />

      <AnalyticsCard
        title={t("properties.stats.occupiedProperties.title")}
        value={stats.occupied}
        description={t("properties.stats.occupiedProperties.description")}
        icon={Users}
        iconColor="info"
      />

      <AnalyticsCard
        title={t("properties.stats.averageRent.title")}
        value={
          stats.averageRent > 0
            ? formatCurrencyLocalized(stats.averageRent)
            : "N/A"
        }
        description={t("properties.stats.averageRent.description")}
        icon={DollarSign}
        iconColor="success"
      />

      <AnalyticsCard
        title={t("properties.stats.underMaintenance.title")}
        value={stats.maintenance}
        description={t("properties.stats.underMaintenance.description")}
        icon={Wrench}
        iconColor="warning"
      />

      <AnalyticsCard
        title={t("properties.stats.totalRentValue.title")}
        value={
          stats.totalRentValue > 0
            ? formatCurrencyLocalized(stats.totalRentValue)
            : "N/A"
        }
        description={t("properties.stats.totalRentValue.description")}
        icon={TrendingUp}
        iconColor="success"
      />

      {/* Unit-based statistics */}
      <AnalyticsCard
        title={t("properties.stats.totalUnits.title")}
        value={stats.totalUnits}
        description={t("properties.stats.totalUnits.description")}
        icon={Building2}
        iconColor="primary"
      />

      <AnalyticsCard
        title={t("properties.stats.availableUnits.title")}
        value={stats.availableUnits}
        description={t("properties.stats.availableUnits.description")}
        icon={CheckCircle}
        iconColor="success"
      />

      <AnalyticsCard
        title={t("properties.stats.occupiedUnits.title")}
        value={stats.occupiedUnits}
        description={t("properties.stats.occupiedUnits.description")}
        icon={Users}
        iconColor="info"
      />

      <AnalyticsCard
        title={t("properties.stats.unitsInMaintenance.title")}
        value={stats.maintenanceUnits}
        description={t("properties.stats.unitsInMaintenance.description")}
        icon={Wrench}
        iconColor="warning"
      />
    </AnalyticsCardGrid>
  );
}
