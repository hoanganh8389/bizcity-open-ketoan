// @bizcity-layer M data/masterdata
// [2026-11-02 06:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.17 (ADR-0015 Q4, BIZCITY-EXTENSION §5): action công khai core.partner.upsert, core.product.upsert — module tạo / cập nhật danh mục chuẩn qua action, không ghi bảng (seed[] của manifest dùng)
/**
 * DANH MỤC CHUẨN QUA ACTION (BIZCITY-EXTENSION §5, ADR-0015 Q4). Module không ghi bảng `partners` / `products`: gọi action
 * công khai (ctx.actions.call, HTTP, hoặc `seed[]` của manifest qua core.module.seed). Tạo mới hoặc cập nhật theo mã; trường
 * để trống không xoá thông tin cũ (như cửa đồng bộ PUT /api/v1/products, partnerRepository.upsert).
 *
 * Mã hàng không ép SKU_RULE ở đây: SKU_RULE là quy tắc sinh mã của từng đơn vị (catalog/sku-rule.ts), cửa đồng bộ cũng không ép.
 */
import { sql } from 'kysely';
import { z } from 'zod';
import { defineAction, type AnyActionDef } from '../../core/actions.js';
import { Errors } from '../../core/errors.js';
import { partnerRepository } from '@bizcity/platform/masterdata/partner.repository';

const tags = ['Danh mục'];

const partnerUpsert = defineAction({
  id: 'core.partner.upsert', title: 'Tạo / cập nhật đối tượng theo mã', tags,
  description: 'Khách hàng, nhà cung cấp, đối tượng khác theo mã. Trường để trống giữ giá trị cũ. Không đổi thông tin kế toán bổ sung (nhóm, hạn mức).',
  permission: 'catalog:write', effect: 'write', idempotency: 'natural', sideEffects: ['masterdata'], dryRun: true,
  input: z.object({
    code: z.string().trim().min(1).max(64), name: z.string().trim().max(255).default(''),
    kind: z.enum(['customer', 'supplier', 'other']).default('customer'),
    taxCode: z.string().trim().max(32).optional(), address: z.string().trim().max(500).optional(),
    phone: z.string().trim().max(32).optional(), email: z.string().trim().max(255).optional(),
  }),
  output: z.object({ id: z.string(), code: z.string() }),
  expose: { http: { method: 'POST', path: '/api/v1/partners/upsert' }, ai: 'deny' },
  evidence: { objectType: 'partner', objectId: (i) => i.code },
  handler: async (ctx, i) => ({ id: await partnerRepository.upsert(ctx.data.tx, ctx.tenant.id, i, i.kind), code: i.code }),
});

const productUpsert = defineAction({
  id: 'core.product.upsert', title: 'Tạo / cập nhật mặt hàng theo mã', tags,
  description: 'Mặt hàng theo mã hàng. Trường để trống giữ giá trị cũ. Nhóm hạch toán phải có sẵn (nhóm quyết định tài khoản doanh thu, giá vốn, kho).',
  permission: 'catalog:write', effect: 'write', idempotency: 'natural', sideEffects: ['masterdata'], dryRun: true,
  input: z.object({
    sku: z.string().trim().min(1).max(64), name: z.string().trim().max(500).default(''), unit: z.string().trim().max(32).default(''),
    postingGroupCode: z.string().trim().max(32).optional(),
  }),
  output: z.object({ sku: z.string() }),
  expose: { http: { method: 'POST', path: '/api/v1/products/upsert' }, ai: 'deny' },
  evidence: { objectType: 'product', objectId: (i) => i.sku },
  handler: async (ctx, i) => {
    const tx = ctx.data.tx;
    if (i.postingGroupCode) {
      const g = await tx.selectFrom('product_posting_groups').select('code').where('tenant_id', '=', ctx.tenant.id).where('code', '=', i.postingGroupCode).executeTakeFirst();
      if (!g) throw Errors.validation(`Nhóm hạch toán chưa có: ${i.postingGroupCode}`);
    }
    await tx.insertInto('products')
      .values({ tenant_id: ctx.tenant.id, sku: i.sku, name: i.name, unit: i.unit, posting_group_code: i.postingGroupCode ?? null, source_system: 'api' })
      .onConflict((oc) => oc.columns(['tenant_id', 'sku']).doUpdateSet({
        name: sql<string>`COALESCE(NULLIF(excluded.name, ''), products.name)`,
        unit: sql<string>`COALESCE(NULLIF(excluded.unit, ''), products.unit)`,
        posting_group_code: sql<string>`COALESCE(excluded.posting_group_code, products.posting_group_code)`,
        updated_at: new Date(),
      }))
      .execute();
    return { sku: i.sku };
  },
});

export const masterdataActions: AnyActionDef[] = [partnerUpsert, productUpsert];
