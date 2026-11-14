import crypto from 'node:crypto';
import type { Request } from 'express';
import { getDb } from '../db.ts';

export function writeAuditLog(params: {
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  req?: Request;
}): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, metadata_json, ip_address, request_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      crypto.randomUUID(),
      params.userId ?? null,
      params.action,
      params.resourceType,
      params.resourceId ?? null,
      JSON.stringify(params.metadata ?? {}),
      params.req?.ip ?? '',
      (params.req as Request & { requestId?: string })?.requestId ?? '',
      new Date().toISOString(),
    );
  } catch (err) {
    console.error('[audit] Failed to write audit log:', err);
  }
}
