// @bizcity-layer M data/masterdata
// [2026-11-13 Nguyễn Văn Thủy] Lịch sử thay đổi của một nút Cơ cấu tổ chức (công ty / cơ cấu / cửa hàng / kho / phòng ban), đọc từ nhật ký bằng chứng (đóng góp)
/**
 * GET /api/v1/co-cau/history?type=org|branch|warehouse|department&code=…
 * Nhật ký (audit_logs) có hai dạng: bản cũ ghi before_data / after_data trực tiếp; bản qua action ghi
 * after_data = { input, notes: { audit: [{ action, before, after }] } }. Gom cả hai, so trước → sau theo từng ô,
 * trả mỗi lần đổi một dòng: thời gian, người làm, việc, các thay đổi "Tên: A → B".
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { sql } from 'kysely';
import { z } from 'zod';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { db } from '../../db/client.js';

const TYPES = {
  org: { objectTypes: ['org_unit'], table: 'org_units', dept: false },
  branch: { objectTypes: ['branch'], table: 'branches', dept: false },
  warehouse: { objectTypes: ['warehouse'], table: 'warehouses', dept: false },
  department: { objectTypes: ['dimension:department', 'dimension'], table: 'dimensions', dept: true },
} as const;
type Kind = keyof typeof TYPES;

/** Tên ô hiển thị (khoá snake_case; khoá camelCase đổi về snake trước khi tra). */
const LABEL: Record<string, string> = {
  name: 'Tên', code: 'Mã', new_code: 'Mã mới', note: 'Ghi chú', kind: 'Loại', parent_code: 'Thuộc', parent_id: 'Thuộc', org_unit_code: 'Thuộc cơ cấu', org_code: 'Thuộc cơ cấu',
  tax_id: 'MST', tax_code: 'MST', company_name: 'Tên công ty', address: 'Địa chỉ', phone: 'Điện thoại', fax: 'Fax', is_active: 'Theo dõi',
  department_code: 'Phòng ban', branch_code: 'Cửa hàng / chi nhánh', type_code: 'Loại kho', is_default: 'Kho mặc định', is_promo: 'Kho khuyến mại',
  account: 'Tài khoản', valid_from: 'Áp dụng từ ngày', tax_valid_from: 'Áp dụng từ ngày', sort_order: 'Thứ tự', unit_code: 'Đơn vị hạch toán', external_ref: 'Mã tham chiếu',
};
const ACTION: Record<string, string> = { create: 'Thêm', update: 'Sửa', delete: 'Xoá', save: 'Ghi', assign: 'Gắn cửa hàng', restore_defaults: 'Quay về dữ liệu gốc' };
const SKIP = new Set(['id', 'tenant_id', 'uid', 'created_at', 'created_by', 'updated_at', 'updated_by', 'org_path', 'path', 'level', 'levels_changed', 'branch_codes', 'created_by_name']);
const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const show = (v: unknown): string => (v === null || v === undefined || v === '' ? '(trống)' : v === true ? 'Có' : v === false ? 'Không' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const flat = (o: unknown): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (o && typeof o === 'object' && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) out[snake(k)] = v;
  return out;
};

/** Các ô đổi giữa trước và sau: "Tên: A → B"; ô chỉ có ở sau (thêm mới) ghi "Tên: B". */
export function diffText(before: unknown, after: unknown): string[] {
  const b = flat(before), a = flat(after);
  const out: string[] = [];
  for (const [k, v] of Object.entries(a)) {
    if (SKIP.has(k)) continue;
    if (k === 'extra' && v && typeof v === 'object') {
      const be = (b.extra && typeof b.extra === 'object' ? b.extra : {}) as Record<string, unknown>;
      for (const [ek, ev] of Object.entries(v as Record<string, unknown>)) {
        if (ek === 'createdBy' || JSON.stringify(be[ek] ?? '') === JSON.stringify(ev ?? '')) continue;
        out.push(`${LABEL[snake(ek)] ?? ek}: ${k in b ? `${show(be[ek])} → ` : ''}${show(ev)}`);
      }
      continue;
    }
    if (k in b && JSON.stringify(b[k] ?? '') === JSON.stringify(v ?? '')) continue;
    if (!(k in b) && (v === '' || v === null || v === undefined)) continue;
    out.push(k in b ? `${LABEL[k] ?? k}: ${show(b[k])} → ${show(v)}` : `${LABEL[k] ?? k}: ${show(v)}`);
  }
  return out;
}

interface AuditRow { created_at: Date; actor: string; action: string; before_data: unknown; after_data: unknown }
export interface HistoryLine { at: string; by: string; action: string; changes: string[] }

export async function coCauHistory(tenantId: string, kind: Kind, code: string): Promise<HistoryLine[]> {
  const t = TYPES[kind];
  const idRow = await sql<{ id: string }>`SELECT id::text AS id FROM ${sql.table(t.table)} WHERE tenant_id = ${tenantId} AND code = ${code} ${t.dept ? sql`AND kind = 'department'` : sql``} LIMIT 1`.execute(db);
  const ids = [code, ...(idRow.rows[0] ? [idRow.rows[0].id] : [])];
  const rows = await sql<AuditRow>`
    SELECT created_at, actor, action, before_data, after_data FROM audit_logs
     WHERE tenant_id = ${tenantId} AND object_type IN (${sql.join(t.objectTypes.map((x) => sql`${x}`))})
       AND (object_id IN (${sql.join(ids.map((x) => sql`${x}`))}) OR after_data -> 'input' ->> 'code' = ${code} OR after_data ->> 'code' = ${code})
       AND (object_type <> 'dimension' OR after_data -> 'input' ->> 'kind' = 'department')
       AND action NOT LIKE ${'%import%'}
     ORDER BY created_at DESC, id DESC LIMIT 300`.execute(db);
  const userIds = [...new Set(rows.rows.map((r) => /^user:(\d+)$/.exec(r.actor)?.[1]).filter((x): x is string => Boolean(x)))];
  const users = userIds.length ? await db.selectFrom('users').select(['id', 'full_name', 'email']).where('tenant_id', '=', tenantId).where('id', 'in', userIds).execute() : [];
  const names = new Map(users.map((u) => [`user:${u.id}`, u.full_name || u.email]));
  const out: HistoryLine[] = [];
  for (const r of rows.rows) {
    const after = (r.after_data ?? {}) as { input?: unknown; notes?: { audit?: { action?: string; before?: unknown; after?: unknown }[] } };
    const audit = Array.isArray(after.notes?.audit) ? after.notes.audit : [];
    const pairs = audit.length
      ? audit.map((x) => ({ action: x.action ?? r.action, before: x.before, after: x.after }))
      : [{ action: r.action, before: r.before_data, after: after.input ?? r.after_data }];
    for (const p of pairs) {
      const verb = p.action.split('.').pop() ?? p.action;
      const changes = verb === 'delete' ? [] : diffText(p.before, p.after);
      if (verb === 'update' && !changes.length) continue;
      const line: HistoryLine = { at: r.created_at.toISOString(), by: names.get(r.actor) ?? r.actor, action: ACTION[verb] ?? verb, changes };
      // Bản qua action và bản ghi cũ của cùng một lần đổi: chỉ giữ một dòng.
      const prev = out[out.length - 1];
      if (prev && prev.at.slice(0, 19) === line.at.slice(0, 19) && prev.action === line.action && JSON.stringify(prev.changes) === JSON.stringify(line.changes)) continue;
      out.push(line);
    }
  }
  return out;
}

export async function coCauHistoryRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get('/api/v1/co-cau/history', {
    preHandler: requirePermission('catalog:read'),
    schema: {
      tags: ['Cơ cấu tổ chức'], summary: 'Lịch sử thay đổi của một nút cơ cấu (công ty, cơ cấu, cửa hàng, kho, phòng ban)',
      querystring: z.object({ type: z.enum(['org', 'branch', 'warehouse', 'department']), code: z.string().trim().min(1).max(64) }),
    },
    handler: async (req) => ok(await coCauHistory(authOf(req).tenantId, req.query.type, req.query.code)),
  });
}
