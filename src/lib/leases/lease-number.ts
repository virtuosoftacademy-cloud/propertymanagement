/**
 * PropertyPro - Human-readable lease references
 *
 * Leases have no stored reference number: the schema is _id, propertyId,
 * unitId, tenantId, rentPeriod, startDate, endDate, status, paymentStatus,
 * terms, documents, renewalOptions and the timestamps. Rather than add a field
 * and backfill every existing lease, the reference is DERIVED from data the
 * document already carries, so it is stable for a given lease and identical
 * everywhere it is shown.
 *
 * Format: LSE-<year>-<sequence>, e.g. LSE-2026-000051.
 *
 * The sequence comes from the counter bytes of the ObjectId — the part Mongo
 * increments per document — which keeps references from clustering the way the
 * timestamp bytes would. It is a display label, not a unique key: two leases
 * could in principle collide, so never look a lease up by it.
 */

export interface LeaseNumberSource {
  _id?: string | { toString(): string };
  createdAt?: string | Date;
  startDate?: string | Date;
}

const SEQUENCE_MODULUS = 1_000_000;

function yearOf(lease: LeaseNumberSource): number | null {
  // Prefer when the record was created; fall back to the tenancy start so a
  // lease imported without timestamps still gets a sensible year.
  const source = lease.createdAt ?? lease.startDate;
  if (!source) return null;

  const date = source instanceof Date ? source : new Date(source);
  return Number.isNaN(date.getTime()) ? null : date.getFullYear();
}

export function formatLeaseNumber(
  lease: LeaseNumberSource | null | undefined
): string | null {
  const id = lease?._id?.toString();

  // A 24-character hex ObjectId is the only shape the counter bytes can be
  // read from. Anything else (a temporary client-side id, a missing lease)
  // gets no reference rather than a misleading one.
  if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) return null;

  const year = yearOf(lease!);
  if (year === null) return null;

  const sequence = parseInt(id.slice(-6), 16) % SEQUENCE_MODULUS;

  return `LSE-${year}-${String(sequence).padStart(6, "0")}`;
}

/**
 * The unit's label for a lease, e.g. "C24". Units are subdocuments of Property,
 * so this matches the lease's unitId against the property's units array — which
 * requires the property to have been populated WITH `units` selected.
 */
export function findLeaseUnitNumber(lease: any): string | null {
  const unitId = lease?.unitId;
  if (!unitId) return null;

  const units = lease?.propertyId?.units;
  if (!Array.isArray(units)) return null;

  const target = unitId?._id?.toString?.() ?? unitId?.toString?.();
  if (!target) return null;

  const unit = units.find((u: any) => u?._id?.toString?.() === target);
  const number = unit?.unitNumber;

  return typeof number === "string" && number.trim() ? number.trim() : null;
}

/**
 * Display label for a unit, e.g. "Unit C24".
 *
 * Stored unitNumber values are inconsistent about whether they already carry
 * the word: the seeded properties use "Unit 1", while a bare "C24" is equally
 * valid. Prefixing unconditionally produced "Unit Unit 1", so the localised
 * word is added only when the value does not already start with it. A value
 * that spells its own label wins — it is data, and reformatting it would
 * misrepresent what the property actually calls that unit.
 */
export function formatUnitLabel(
  unitNumber: string | null | undefined,
  unitWord: string
): string | null {
  if (!unitNumber) return null;

  return /^unit\b/i.test(unitNumber) ? unitNumber : `${unitWord} ${unitNumber}`;
}
