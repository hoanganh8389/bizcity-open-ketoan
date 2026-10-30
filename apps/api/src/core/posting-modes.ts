// @bizcity-layer K kernel/config
/**
 * Chế độ ghi sổ theo loại chứng từ (tenants.settings.postingModes): ghi ngay hay chờ duyệt.
 * Xem APPROVABLE_DOC_TYPES, postingModesSchema ở @ketoan/contracts.
 */
import { APPROVABLE_DOC_TYPES, postingModesSchema, type PostingModes } from '@ketoan/contracts';
import type { Db } from '../db/client.js';

export function readPostingModes(settings: unknown): PostingModes {
  const raw = (settings as { postingModes?: unknown } | null)?.postingModes;
  const parsed = postingModesSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : postingModesSchema.parse({});
}

/**
 * Loại chứng từ này có đặt chế độ "Tự động định khoản" không (chỉ các loại có chế độ — APPROVABLE_DOC_TYPES). Dùng khi nguồn
 * báo xoá: Tự động thì tự huỷ; loại khác / Vào cổng chờ thì vào Chờ huỷ cho kế toán duyệt.
 */
export async function isAutoMode(trx: Db, tenantId: string, docType: string): Promise<boolean> {
  if (!(APPROVABLE_DOC_TYPES as readonly string[]).includes(docType)) return false;
  return !(await needsApproval(trx, tenantId, docType));
}

/** Loại chứng từ này của đơn vị có phải chờ duyệt mới ghi sổ không. */
export async function needsApproval(trx: Db, tenantId: string, docType: string): Promise<boolean> {
  if (!(APPROVABLE_DOC_TYPES as readonly string[]).includes(docType)) return false;
  const t = await trx.selectFrom('tenants').select('settings').where('id', '=', tenantId).executeTakeFirstOrThrow();
  return readPostingModes(t.settings)[docType as keyof PostingModes] === 'approve';
}
