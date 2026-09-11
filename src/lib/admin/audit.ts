import { headers } from "next/headers";

import { db } from "@/db";
import { auditLog } from "@/db/schema";

/** The transaction type `db.transaction` hands its callback. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type AuditEntry = {
  entityType: string;
  entityId?: string | null;
  action: string;
  /** Set when one field changed; leave unset for a whole-row create or delete. */
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  note?: string | null;
};

/**
 * Appends one row to the audit log.
 *
 * Takes the writer explicitly — pass the transaction when the change and its
 * log entry must land together, which is nearly always. A separate connection
 * would let the change commit while the log entry rolls back, and a trail with
 * holes in it is worse than none because it reads as complete.
 *
 * `audit_log` is append-only, enforced by a row-level trigger: there is no
 * update or delete path from application code, so this function only inserts.
 */
export async function recordAudit(
  writer: Tx | typeof db,
  actorId: string,
  entry: AuditEntry,
): Promise<void> {
  await writer.insert(auditLog).values({
    actorId,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    action: entry.action,
    field: entry.field ?? null,
    // jsonb columns: `undefined` would be dropped by the driver and leave the
    // column null, which reads the same as "there was no previous value".
    // Coercing here keeps "changed to null" distinguishable from "not recorded".
    oldValue: entry.oldValue === undefined ? null : entry.oldValue,
    newValue: entry.newValue === undefined ? null : entry.newValue,
    note: entry.note ?? null,
    ipAddress: await clientIp(),
  });
}

/**
 * Best-effort client IP.
 *
 * Behind Vercel `x-forwarded-for` is a list and the client is the first entry;
 * the last entries are proxies. Returns null rather than a wrong value when
 * there is no header, because an audit row claiming an IP it guessed is worse
 * than one admitting it does not know.
 */
async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip");
}
