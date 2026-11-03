// @bizcity-layer M data/masterdata
// [2026-11-03 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W5 (SC-MOD-2, C-7): ghi danh mục chuẩn thay cho phân hệ — chỉ thêm mục còn thiếu, không đè dữ liệu thật
/**
 * DANH MỤC — "ĐẢM BẢO CÓ" (SC-MOD-2 / A-17, ma trận tuân thủ C-7). Phân hệ không ghi thẳng bảng danh mục của lõi
 * (branches, partners, item_classes, products, product_units, tax_codes): gọi các hàm dưới đây. Mỗi hàm chỉ THÊM mục còn thiếu
 * (ON CONFLICT DO NOTHING) — không đè thông tin người dùng đã khai; riêng setBranchLevels đổi đúng hai cột phân cấp chi nhánh.
 * Một chỗ ghi để sau này thêm kiểm / bằng chứng / sự kiện danh mục đổi mà không sửa từng phân hệ.
 */
import type { Insertable } from 'kysely';
import type { Db } from '../db/client.js';
import type { Database } from '../db/types.js';

export const catalogEnsure = {
  /** Chi nhánh theo mã (chưa có thì thêm). */
  async branch(db: Db, tenantId: string, b: { code: string; name: string }): Promise<void> {
    await db.insertInto('branches').values({ tenant_id: tenantId, code: b.code, name: b.name }).onConflict((oc) => oc.columns(['tenant_id', 'code']).doNothing()).execute();
  },

  /** Phân cấp chi nhánh (chi nhánh cha / shop): đổi level + parent_id của các mã đã có. */
  async setBranchLevels(db: Db, tenantId: string, items: { code: string; level: string; parentId: string | null }[]): Promise<void> {
    for (const it of items) {
      await db.updateTable('branches').set({ level: it.level, parent_id: it.parentId } as never).where('tenant_id', '=', tenantId).where('code', '=', it.code).execute();
    }
  },

  /** Đối tượng theo mã (chưa có thì thêm, có rồi giữ nguyên). */
  async partner(db: Db, tenantId: string, p: { code: string; name: string; kind: 'customer' | 'supplier' | 'other'; taxCode?: string | null; address?: string | null; phone?: string | null }): Promise<void> {
    await db.insertInto('partners').values({ tenant_id: tenantId, code: p.code, name: p.name, kind: p.kind, tax_code: p.taxCode ?? null, address: p.address ?? null, phone: p.phone ?? null })
      .onConflict((oc) => oc.columns(['tenant_id', 'code']).doNothing()).execute();
  },

  /** Đối tượng theo mã số thuế: có thì trả id; chưa có thì thêm (mã = mã số thuế); mã đã có mà thiếu MST thì điền MST. */
  async partnerByTaxCode(db: Db, tenantId: string, p: { taxCode: string; name: string; kind: 'customer' | 'supplier' }): Promise<string> {
    const found = await db.selectFrom('partners').select('id').where('tenant_id', '=', tenantId).where('tax_code', '=', p.taxCode).orderBy('id').executeTakeFirst();
    if (found) return found.id;
    return (await db.insertInto('partners').values({ tenant_id: tenantId, code: p.taxCode, name: p.name, kind: p.kind, tax_code: p.taxCode })
      .onConflict((oc) => oc.columns(['tenant_id', 'code']).doUpdateSet({ tax_code: p.taxCode })).returning('id').executeTakeFirstOrThrow()).id;
  },

  /** Nhóm phân loại hàng (nhãn, ngành, nhóm, loại) theo (kind, code). */
  async itemClass(db: Db, tenantId: string, c: { kind: string; code: string; name: string }): Promise<void> {
    const has = await db.selectFrom('item_classes').select('id').where('tenant_id', '=', tenantId).where('kind', '=', c.kind as never).where('code', '=', c.code).executeTakeFirst();
    if (!has) await db.insertInto('item_classes').values({ tenant_id: tenantId, kind: c.kind, code: c.code, name: c.name } as never).execute();
  },

  /** Mặt hàng theo mã hàng (chưa có thì thêm, có rồi giữ nguyên). */
  async product(db: Db, tenantId: string, p: Omit<Insertable<Database['products']>, 'tenant_id'>): Promise<void> {
    await db.insertInto('products').values({ ...p, tenant_id: tenantId }).onConflict((oc) => oc.columns(['tenant_id', 'sku']).doNothing()).execute();
  },

  /** ĐVT của mặt hàng — chỉ khi mặt hàng chưa có ĐVT nào (không đụng ĐVT người dùng đã khai). */
  async productUnitsIfNone(db: Db, tenantId: string, sku: string, units: Omit<Insertable<Database['product_units']>, 'tenant_id' | 'sku'>[]): Promise<void> {
    const has = await db.selectFrom('product_units').select('id').where('tenant_id', '=', tenantId).where('sku', '=', sku).limit(1).executeTakeFirst();
    if (has) return;
    for (const u of units) await db.insertInto('product_units').values({ ...u, tenant_id: tenantId, sku }).execute();
  },

  /** Mã thuế theo mã (chưa có thì thêm). */
  async taxCode(db: Db, tenantId: string, t: Omit<Insertable<Database['tax_codes']>, 'tenant_id'>): Promise<void> {
    await db.insertInto('tax_codes').values({ ...t, tenant_id: tenantId }).onConflict((oc) => oc.columns(['tenant_id', 'code']).doNothing()).execute();
  },
};
