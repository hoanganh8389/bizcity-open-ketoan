// @bizcity-layer M data/masterdata
// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 — S023-14 / 15: khung "Vì sao" cho form đối tượng — nhà cung cấp cần MST, MST sai định dạng, trùng tên với đối tượng khác (bizcity_catalog_hint@1)
/**
 * Đánh giá một bản khai báo đối tượng trước khi lưu — chỉ đọc. Trùng MST đã CHẶN ở route (assertTaxCodeFree, 409); ở đây chỉ
 * nhắc / cảnh báo mềm: lưu được, giao diện bắt ghi lý do (D023-6).
 */
import { catalogFinding, type CatalogFinding } from '@ketoan/contracts';
import { sql } from 'kysely';
import type { Db } from '../../db/client.js';
import { reviewFindings } from '@bizcity/platform/core/catalog-warn';

export interface PartnerDraft {
  code: string;
  name?: string;
  kind?: string;
  alsoKinds?: string[];
  taxCode?: string | null;
}

/** MST Việt Nam: 10 số (doanh nghiệp) hoặc 10 số - 3 số (đơn vị phụ thuộc); 12 số (CCCD cá nhân, từ 2025). */
const TAX_CODE_RE = /^(\d{10}(-\d{3})?|\d{12})$/;

export async function partnerHints(db: Db, tenantId: string, d: PartnerDraft): Promise<CatalogFinding[]> {
  const out: CatalogFinding[] = [];
  const supplier = d.kind === 'supplier' || (d.alsoKinds ?? []).includes('supplier');
  const tax = d.taxCode?.trim() ?? '';
  if (supplier) {
    out.push(catalogFinding('PART-HINT-001', {}, { field: 'taxCode' }));
    if (!tax) out.push(catalogFinding('PART-HINT-002', { code: d.code }, { field: 'taxCode' }));
  }
  if (tax && !TAX_CODE_RE.test(tax)) out.push(catalogFinding('PART-HINT-004', { taxCode: tax }, { field: 'taxCode' }));
  const name = d.name?.trim();
  if (name) {
    const same = await db.selectFrom('partners').select(['code']).where('tenant_id', '=', tenantId).where('code', '<>', d.code)
      .where(sql<boolean>`lower(trim(name)) = lower(${name})`).limit(1).executeTakeFirst();
    if (same) out.push(catalogFinding('PART-HINT-003', { other: same.code, name }, { field: 'name' }));
  }
  return reviewFindings(db, tenantId, out); // [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — HT09: áp bản duyệt luật nhắc của đơn vị
}
