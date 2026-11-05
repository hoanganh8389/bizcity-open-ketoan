// @bizcity-layer D modules/mua-hang
// [2026-11-05 01:50 PM Nguyễn Văn Thủy] PHASE-026 — S026-21 (docs/core/06-xuong-ca-dinh-danh.md): lọc sổ kho theo định danh, gộp cả mã cũ và mặt hàng đã gộp (đóng góp)
/**
 * Sổ kho đọc qua `inventory_movements_cur` (0069): sku = mã hiện hành, nên kết quả gom một dòng qua đổi mã và gộp mã.
 * Lọc theo mã: dùng `theoMa`, đi qua chỉ mục (tenant_id, item_id, doc_date) thay vì lọc trên cột tính toán.
 */
import { sql, type RawBuilder } from 'kysely';

/** Điều kiện: dòng kho thuộc các mặt hàng mang những mã này (mã cũ, mã đã gộp đều tính). `cot` = cột item_id của bảng / bí danh đang đọc. */
export function theoMa(tenantId: string, skus: readonly string[], cot = 'item_id'): RawBuilder<boolean> {
  return sql<boolean>`${sql.ref(cot)} IN (SELECT bizcity_items_of_codes(${tenantId}::bigint, ${[...skus]}::text[]))`;
}
