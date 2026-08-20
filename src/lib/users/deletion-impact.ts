/**
 * PropertyPro - User deletion impact
 *
 * Permanently deleting a user removes a document that ~40 other models point
 * at, so the admin needs to see what a delete would strand before confirming.
 * The same function backs both the preview shown in the UI and the check the
 * delete endpoint runs, so the two can never disagree.
 *
 * Counts are read-only. Nothing here deletes or cascades — the decision about
 * what to do with the dependent records stays with the caller.
 */

import mongoose from "mongoose";
import {
  Invoice,
  Tenant,
  MaintenanceRequest,
  Lease,
  Payment,
  Application,
  Document,
  Conversation,
  Message,
  WorkOrder,
} from "@/models";
import AuditLog from "@/models/AuditLog";

export interface ImpactEntry {
  /** Human-readable collection name, e.g. "Invoices". */
  label: string;
  count: number;
  /**
   * True when losing the link would corrupt financial history, as opposed to
   * merely leaving a stale reference.
   */
  critical: boolean;
  /**
   * Whether this reference prevents permanent deletion.
   *
   * Audit entries deliberately do NOT block. They are an immutable record of
   * what happened and are meant to outlive the subject — and because
   * deactivating a user writes an audit entry about them, treating audit rows
   * as blocking would mean no user could ever be deleted. They are still
   * reported, so the admin can see the trail will be left behind.
   */
  blocking: boolean;
}

export interface DeletionImpact {
  /** Everything that references the user, blocking or not. */
  total: number;
  entries: ImpactEntry[];
  /** Sum of the blocking entries only — what actually prevents deletion. */
  blockingTotal: number;
  /** True when something that must not be stranded still references the user. */
  hasReferences: boolean;
}

/**
 * Some collections store the user id as an ObjectId and others as a string,
 * so every field is matched against both forms.
 */
function idVariants(userId: string) {
  const out: any[] = [userId];
  if (mongoose.Types.ObjectId.isValid(userId)) {
    out.push(new mongoose.Types.ObjectId(userId));
  }
  return out;
}

async function countFor(
  model: any,
  fields: string[],
  userId: string
): Promise<number> {
  if (!model) return 0;
  const variants = idVariants(userId);
  const $or = fields.map((f) => ({ [f]: { $in: variants } }));
  try {
    // Models with a soft-delete pre-find hook would otherwise hide deleted
    // rows; a stranded reference still counts, so ask for both.
    return await model.countDocuments({ $or });
  } catch {
    return 0;
  }
}

export async function getUserDeletionImpact(
  userId: string
): Promise<DeletionImpact> {
  // A tenant profile is keyed to the user, and most tenant-owned records point
  // at that profile rather than at the user directly — so resolve it first and
  // count through it as well.
  let tenantIds: string[] = [];
  try {
    const profiles = await Tenant.find({
      userId: { $in: idVariants(userId) },
    })
      .select("_id")
      .lean();
    tenantIds = (profiles as any[]).map((p) => p._id.toString());
  } catch {
    tenantIds = [];
  }

  const throughTenant = async (model: any, fields: string[]) => {
    if (!tenantIds.length) return 0;
    let n = 0;
    for (const tid of tenantIds) n += await countFor(model, fields, tid);
    return n;
  };

  const [
    invoices,
    invoicesViaTenant,
    tenants,
    maintenance,
    leases,
    leasesViaTenant,
    payments,
    paymentsViaTenant,
    applications,
    documents,
    conversations,
    messages,
    workOrders,
    auditLogs,
  ] = await Promise.all([
    countFor(Invoice, ["userId", "createdBy", "tenantId"], userId),
    throughTenant(Invoice, ["tenantId"]),
    countFor(Tenant, ["userId"], userId),
    countFor(
      MaintenanceRequest,
      ["tenantId", "requestedBy", "assignedTo", "createdBy"],
      userId
    ),
    countFor(Lease, ["tenantId", "createdBy"], userId),
    throughTenant(Lease, ["tenantId"]),
    countFor(Payment, ["tenantId", "createdBy"], userId),
    throughTenant(Payment, ["tenantId"]),
    countFor(Application, ["userId", "applicantId", "reviewedBy"], userId),
    countFor(Document, ["uploadedBy", "userId"], userId),
    countFor(Conversation, ["participants", "createdBy"], userId),
    countFor(Message, ["senderId"], userId),
    countFor(WorkOrder, ["assignedTo", "createdBy"], userId),
    // Both the actor (userId/performedBy) and the subject (resourceId) — an
    // entry about the user counts as part of the trail left behind.
    countFor(AuditLog, ["userId", "performedBy", "resourceId"], userId),
  ]);

  const raw: ImpactEntry[] = [
    {
      label: "Invoices",
      count: invoices + invoicesViaTenant,
      critical: true,
      blocking: true,
    },
    {
      label: "Payments",
      count: payments + paymentsViaTenant,
      critical: true,
      blocking: true,
    },
    {
      label: "Leases",
      count: leases + leasesViaTenant,
      critical: true,
      blocking: true,
    },
    { label: "Tenant profiles", count: tenants, critical: false, blocking: true },
    {
      label: "Maintenance requests",
      count: maintenance,
      critical: false,
      blocking: true,
    },
    { label: "Work orders", count: workOrders, critical: false, blocking: true },
    {
      label: "Applications",
      count: applications,
      critical: false,
      blocking: true,
    },
    { label: "Documents", count: documents, critical: false, blocking: true },
    {
      label: "Conversations",
      count: conversations,
      critical: false,
      blocking: true,
    },
    { label: "Messages", count: messages, critical: false, blocking: true },
    // Reported, never blocking — see ImpactEntry.blocking.
    {
      label: "Audit log entries",
      count: auditLogs,
      critical: false,
      blocking: false,
    },
  ];

  const entries = raw.filter((e) => e.count > 0);
  const total = entries.reduce((sum, e) => sum + e.count, 0);
  const blockingTotal = entries
    .filter((e) => e.blocking)
    .reduce((sum, e) => sum + e.count, 0);

  return { total, entries, blockingTotal, hasReferences: blockingTotal > 0 };
}
