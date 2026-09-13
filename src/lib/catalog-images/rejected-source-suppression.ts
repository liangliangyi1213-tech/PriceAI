import "server-only";

export const CAPACITY_REJECTION_CODE = "superseded_by_capacity_policy";
export const CAPACITY_REJECTION_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1_000;

export type CatalogImageRejectedSourceSuppression = "manual_rejection" | "capacity_cooldown";

export type RejectedSourceLifecycleRecord = Readonly<{
  status: "candidate" | "approved" | "rejected" | "unavailable";
  rejectionReason: string | null;
  statusChangedAt: string;
}>;

function isCapacityPolicyReason(reason: string): boolean {
  const normalized = reason.trim();
  return normalized === CAPACITY_REJECTION_CODE
    || normalized.startsWith(`${CAPACITY_REJECTION_CODE}:`);
}

export function classifyRejectedSourceSuppression(
  records: readonly RejectedSourceLifecycleRecord[],
  now = new Date(),
): CatalogImageRejectedSourceSuppression | null {
  const nowMs = now.valueOf();
  if (!Number.isFinite(nowMs)) return null;
  let capacityCooldown = false;
  for (const record of records) {
    if (record.status !== "rejected" || !record.rejectionReason?.trim()) continue;
    if (!isCapacityPolicyReason(record.rejectionReason)) return "manual_rejection";
    const changedAt = Date.parse(record.statusChangedAt);
    if (Number.isFinite(changedAt) && nowMs - changedAt < CAPACITY_REJECTION_COOLDOWN_MS) {
      capacityCooldown = true;
    }
  }
  return capacityCooldown ? "capacity_cooldown" : null;
}
