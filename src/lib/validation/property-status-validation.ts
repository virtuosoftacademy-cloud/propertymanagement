/**
 * PropertyPro - Property & Unit Status Validation Utilities
 * Enhanced validation for status transitions and consistency
 * Updated 2025 - supports multi-unit logic, reserved states, severity levels
 */

import { PropertyStatus } from "@/types";

export interface PropertyStatusValidationResult {
  isValid: boolean;              // no critical errors
  canProceed: boolean;           // no blocking errors (warnings ok)
  errors: Array<{ message: string; severity: "error" | "warning" }>;
  recommendations: string[];
}

export interface UnitStatusTransition {
  unitId: string;
  unitNumber: string;
  oldStatus: PropertyStatus;
  newStatus: PropertyStatus;
  reason?: string;
  triggeredBy?: string;          // e.g. "lease-creation", "maintenance-request"
}

export interface PropertyStatusTransition {
  propertyId: string;
  propertyName: string;
  propertyOwnerName:string;
  oldStatus: PropertyStatus;
  newStatus: PropertyStatus;
  unitTransitions: UnitStatusTransition[];
  triggeredBy: string;
  timestamp: Date;
}

/**
 * Determine if a status transition is allowed
 */
const allowedTransitions: Record<PropertyStatus, PropertyStatus[]> = {
  [PropertyStatus.AVAILABLE]: [
    PropertyStatus.OCCUPIED,
    PropertyStatus.MAINTENANCE,
    PropertyStatus.UNAVAILABLE,
  ],
  [PropertyStatus.OCCUPIED]: [
    PropertyStatus.AVAILABLE,
    PropertyStatus.MAINTENANCE,
    PropertyStatus.UNAVAILABLE,
  ],
  [PropertyStatus.MAINTENANCE]: [
    PropertyStatus.AVAILABLE,
    PropertyStatus.UNAVAILABLE,
  ],
  [PropertyStatus.UNAVAILABLE]: [
    PropertyStatus.AVAILABLE,
    PropertyStatus.MAINTENANCE,
  ],
};

/**
 * Validate a single unit status change
 */
export function validateUnitStatusTransition(
  transition: UnitStatusTransition
): PropertyStatusValidationResult {
  const { oldStatus, newStatus, unitNumber, reason } = transition;
  const result: PropertyStatusValidationResult = {
    isValid: true,
    canProceed: true,
    errors: [],
    recommendations: [],
  };

  // 1. Check if transition is allowed
  if (!allowedTransitions[oldStatus]?.includes(newStatus)) {
    result.errors.push({
      message: `Invalid unit status transition for ${unitNumber}: ${oldStatus} → ${newStatus}`,
      severity: "error",
    });
    result.isValid = false;
    result.canProceed = false;
    return result;
  }

  // 2. Contextual business rules & soft validations
  if (oldStatus === PropertyStatus.OCCUPIED && newStatus === PropertyStatus.AVAILABLE) {
    if (!reason?.includes("lease-terminated") && !reason?.includes("eviction")) {
      result.errors.push({
        message: `Unit ${unitNumber} moving from OCCUPIED to AVAILABLE without clear termination reason`,
        severity: "warning",
      });
    }
  }

  if (newStatus === PropertyStatus.OCCUPIED) {
    result.recommendations.push(
      `Unit ${unitNumber} becoming occupied — ensure active lease & security deposit received`
    );
  }

  if (newStatus === PropertyStatus.MAINTENANCE) {
    result.recommendations.push(
      `Unit ${unitNumber} entering MAINTENANCE — create/link maintenance request`
    );
  }


/**
 * Infer what the property status *should* be based on unit states
 */
export function inferPropertyStatusFromUnits(
  unitStatuses: PropertyStatus[]
): { inferred: PropertyStatus; reasoning: string } {
  if (unitStatuses.length === 0) {
    return { inferred: PropertyStatus.AVAILABLE, reasoning: "No units → default AVAILABLE" };
  }

  const counts = {
    available: unitStatuses.filter(s => s === PropertyStatus.AVAILABLE).length,
    occupied: unitStatuses.filter(s => s === PropertyStatus.OCCUPIED).length,
    maintenance: unitStatuses.filter(s => s === PropertyStatus.MAINTENANCE).length,
    unavailable: unitStatuses.filter(s => s === PropertyStatus.UNAVAILABLE).length,
  };

  const total = unitStatuses.length;

  if (counts.occupied === total) {
    return { inferred: PropertyStatus.OCCUPIED, reasoning: "All units occupied" };
  }

  if (counts.unavailable === total) {
    return { inferred: PropertyStatus.UNAVAILABLE, reasoning: "All units unavailable" };
  }

  if (counts.maintenance === total) {
    return { inferred: PropertyStatus.MAINTENANCE, reasoning: "All units in maintenance" };
  }

  // Default: if there's at least one available or reserved unit
  return { inferred: PropertyStatus.AVAILABLE, reasoning: "At least one available/reserved unit exists" };
}

/**
 * Validate consistency between property status and its units
 */
export function validatePropertyStatusConsistency(
  propertyStatus: PropertyStatus,
  unitStatuses: PropertyStatus[]
): PropertyStatusValidationResult {
  const result: PropertyStatusValidationResult = {
    isValid: true,
    canProceed: true,
    errors: [],
    recommendations: [],
  };

  if (unitStatuses.length === 0) {
    result.errors.push({
      message: "Property has no units — status validation limited",
      severity: "warning",
    });
    return result;
  }

  const { inferred, reasoning } = inferPropertyStatusFromUnits(unitStatuses);

  if (propertyStatus !== inferred) {
    result.errors.push({
      message: `Property status (${propertyStatus}) does not match expected status (${inferred}) — ${reasoning}`,
      severity: "error",
    });
    result.recommendations.push(`Recommended: update property status to ${inferred}`);
    result.isValid = false;
  }

  // Additional soft checks
  const occupiedCount = unitStatuses.filter(s => s === PropertyStatus.OCCUPIED).length;
  const availableCount = unitStatuses.filter(s => s === PropertyStatus.AVAILABLE).length;
  const maintenanceCount = unitStatuses.filter(s => s === PropertyStatus.MAINTENANCE).length;

  if (maintenanceCount > 0) {
    result.recommendations.push(`${maintenanceCount} unit(s) in maintenance — track progress`);
  }

  if (occupiedCount > 0 && availableCount > 0) {
    result.recommendations.push(
      `Mixed status: ${occupiedCount} occupied / ${availableCount} available — consider promoting vacancies`
    );
  }

  return result;
}

/**
 * Validate full property-level transition (including units)
 */
export function validatePropertyStatusTransition(
  transition: PropertyStatusTransition
): PropertyStatusValidationResult {
  const result: PropertyStatusValidationResult = {
    isValid: true,
    canProceed: true,
    errors: [],
    recommendations: [],
  };

  // Validate each unit transition
  for (const ut of transition.unitTransitions) {
    const unitResult = validateUnitStatusTransition(ut);
    result.errors.push(...unitResult.errors);
    result.recommendations.push(...unitResult.recommendations);
  }

  // Validate overall consistency
  const newUnitStatuses = transition.unitTransitions.map(t => t.newStatus);
  const consistency = validatePropertyStatusConsistency(transition.newStatus, newUnitStatuses);
  result.errors.push(...consistency.errors);
  result.recommendations.push(...consistency.recommendations);

  // Redundant transition warning
  if (transition.oldStatus === transition.newStatus) {
    result.errors.push({
      message: "Property status unchanged — synchronization may be unnecessary",
      severity: "warning",
    });
  }

  result.isValid = result.errors.every(e => e.severity !== "error");
  result.canProceed = result.errors.every(e => e.severity !== "error");

  return result;
}

/**
 * Generate human-readable validation report
 */
export function generateValidationReport(
  propertyId: string,
  propertyName: string,
  propertyOwnerName:string,
  currentStatus: PropertyStatus,
  unitStatuses: PropertyStatus[]
): {
  summary: string;
  isValid: boolean;
  canProceed: boolean;
  totalErrors: number;
  totalWarnings: number;
  details: PropertyStatusValidationResult;
} {
  const consistency = validatePropertyStatusConsistency(currentStatus, unitStatuses);

  const allErrors = [...consistency.errors];
  const allRecommendations = [...consistency.recommendations];

  const criticalErrors = allErrors.filter(e => e.severity === "error").length;
  const warnings = allErrors.filter(e => e.severity === "warning").length;

  const isValid = criticalErrors === 0;
  const canProceed = allErrors.every(e => e.severity !== "error");

  let summary = `Property ${propertyName} status check: `;
  if (isValid) {
    summary += "consistent and valid";
  } else {
    summary += `${criticalErrors} critical issue(s) detected`;
  }

  return {
    summary,
    isValid,
    canProceed,
    totalErrors: criticalErrors,
    totalWarnings: warnings,
    details: {
      isValid,
      canProceed,
      errors: allErrors,
      recommendations: allRecommendations,
    },
  };
}