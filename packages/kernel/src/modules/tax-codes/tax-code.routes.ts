// @bizcity-layer K kernel/tax
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/modules/tax-codes/tax-code.routes.ts sang packages/kernel (@bizcity/kernel, D010-7 chặng 3); import Platform qua @bizcity/platform
/**
 * Loại thuế.
 *   GET   /api/v1/tax-codes
 *   POST  /api/v1/tax-codes
 *   PATCH /api/v1/tax-codes/:code
 *   DELETE /api/v1/tax-codes/:code
 * Ghi: action core.tax-code.{create,update,delete} (W6, SC-ACT-1).
 * [2026-11-19 kiennt] NT-DM-012 — loại thuế cố định theo quy định nhà nước (KCT, 0, 5, 8, 10, KKKN; migration 0169): ba lệnh ghi bị khoá,
 *   đổi danh mục bằng bản cập nhật phần mềm; GET trả thêm hiệu lực, căn cứ, cờ mã cũ (đóng góp)
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db, toNumber } from '@bizcity/platform/db/client';
import { authOf, requirePermission } from '@bizcity/platform/core/auth';
import { ok } from '@bizcity/platform/core/http';
import { Errors } from '@bizcity/platform/core/errors';
import { defineAction, mountActions, type AnyActionDef } from '@bizcity/platform/core/actions';
import type { TaxCode } from '@bizcity/platform/db/types';

const tags = ['Danh mục: Loại thuế'];

export const taxCodeCreateSchema = z.object({
  code: z.string().trim().min(1).max(16),
  name: z.string().trim().min(1).max(255),
  rate: z.number().min(0).max(100),
  direction: z.enum(['output', 'input', 'both']),
  accountCode: z.string().trim().max(20).optional(),
  reportGroup: z.string().trim().min(1).max(16).describe('Nhóm bảng kê: KCT | 0 | 5 | 8 | 10 | KKK'),
});

export function toTaxCodeDto(t: TaxCode) {
  return {
    code: t.code, name: t.name, rate: toNumber(t.rate), direction: t.direction, accountCode: t.account_code, reportGroup: t.report_group, isActive: t.is_active,
    validFrom: t.valid_from ?? null, validTo: t.valid_to ?? null, legalBasis: t.legal_basis ?? null, isLegacy: t.is_legacy ?? false, replacedBy: t.replaced_by ?? null,
  };
}

/** NT-DM-012: danh mục loại thuế do phần mềm cấu hình theo quy định — không thêm / sửa / xoá qua API. */
const coDinh = (): never => {
  throw Errors.forbidden('Loại thuế GTGT do phần mềm cấu hình sẵn theo quy định nhà nước (Luật Thuế GTGT, nghị quyết giảm thuế) — không thêm, sửa, xoá được. Thuế suất thay đổi được cập nhật trong bản phần mềm mới.');
};

export async function taxCodeRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/tax-codes', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Danh sách loại thuế' },
    handler: async (req) => {
      const rows = await db.selectFrom('tax_codes').selectAll().where('tenant_id', '=', authOf(req).tenantId).orderBy('is_legacy').orderBy('rate').orderBy('code').execute();
      return ok(rows.map(toTaxCodeDto));
    },
  });

  mountActions(app, taxCodeActions);
}

// [2026-11-03 01:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 (SC-ACT-1): ghi loại thuế qua defineAction — quyền, kiểm input, giao dịch, bằng chứng do runtime; đường dẫn / mã 201 như cũ
const taxCodeDto = z.object({ code: z.string(), name: z.string(), rate: z.number(), direction: z.string(), accountCode: z.string().nullable(), reportGroup: z.string(), isActive: z.boolean(),
  validFrom: z.string().nullable(), validTo: z.string().nullable(), legalBasis: z.string().nullable(), isLegacy: z.boolean(), replacedBy: z.string().nullable() });
const taxCodePatch = taxCodeCreateSchema.omit({ code: true }).partial().extend({ isActive: z.boolean().optional() });

export const taxCodeActions: AnyActionDef[] = [
  defineAction({
    id: 'core.tax-code.create', title: 'Thêm loại thuế', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: taxCodeCreateSchema, output: taxCodeDto,
    expose: { http: { method: 'POST', path: '/api/v1/tax-codes', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'tax_code', objectId: (i) => i.code },
    handler: async () => coDinh(),
  }),
  defineAction({
    id: 'core.tax-code.update', title: 'Sửa loại thuế', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: taxCodePatch.extend({ code: z.string() }), output: taxCodeDto,
    expose: { http: { method: 'PATCH', path: '/api/v1/tax-codes/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'tax_code', objectId: (i) => i.code },
    handler: async () => coDinh(),
  }),
  defineAction({
    id: 'core.tax-code.delete', title: 'Xoá loại thuế chưa dùng', tags,
    permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
    input: z.object({ code: z.string() }), output: z.object({ code: z.string() }),
    expose: { http: { method: 'DELETE', path: '/api/v1/tax-codes/:code' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'tax_code', objectId: (i) => i.code },
    handler: async () => coDinh(),
  }),
];
