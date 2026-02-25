import { db, schema } from "../db/index.ts";

interface AuditParams {
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

export async function audit(params: AuditParams): Promise<void> {
  await db.insert(schema.auditLog).values({
    userId: params.userId ?? null,
    action: params.action,
    resource: params.resource,
    resourceId: params.resourceId,
    metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    ip: params.ip,
  });
}
