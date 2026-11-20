// @bizcity-layer K kernel/subledgers/inventory
// [2026-11-20 kiennt] NT-KHO-004 — hàng nhận giữ hộ (loại kho không thuộc sở hữu, vd KNB) chỉ ghi số lượng, không ghi giá trị (đóng góp)
/**
 * KHO GIỮ HỘ (NT-KHO-004). Loại kho `owned = false` (KNB – Kho hàng nhận giữ hộ): hàng của bên khác, không phải tài sản của đơn vị.
 * Một hàm dùng chung ở cửa nhận chứng từ (mọi đường nộp: POST /documents, submit, nhận theo lô):
 *   - phiếu kho (nhập / xuất kho khác, chuyển kho): dòng ở kho giữ hộ → thành tiền = 0 (giữ số lượng) — dòng tiền 0 không sinh bút toán;
 *   - chuyển kho giữa kho giữ hộ và kho của đơn vị (hai chiều) → chặn;
 *   - mua / bán / trả hàng: dòng có giá trị ở kho giữ hộ → chặn; dòng hàng tặng (0 đồng) nhận, không tính vào giá vốn.
 * Kho trống trên dòng = kho mặc định của chi nhánh (như cách ghi sổ). Giá vốn tháng: loại kho giữ hộ luôn tính riêng (costing.service).
 */
import { sql } from 'kysely';
import type { Db } from '@bizcity/platform/db/client';
import { Errors } from '@bizcity/platform/core/errors';
import type { IngestDocument } from '@ketoan/contracts';

interface KhoRow { code: string; branch_code: string; is_default: boolean; owned: boolean }

/** Mã các loại kho không thuộc sở hữu (để tính giá vốn riêng). */
export async function loaiKhoGiuHo(trx: Db, tenantId: string): Promise<string[]> {
  const r = await sql<{ code: string }>`SELECT code FROM warehouse_types WHERE tenant_id = ${tenantId} AND NOT owned`.execute(trx);
  return r.rows.map((x) => x.code);
}

/** Áp luật kho giữ hộ cho chứng từ: trả chứng từ đã bỏ giá trị dòng kho giữ hộ, hoặc ném lỗi khi phải chặn. */
export async function apDungKhoGiuHo(trx: Db, tenantId: string, doc: IngestDocument): Promise<IngestDocument> {
  const coKho = doc.docType === 'transfer' || doc.docType === 'stock_adjustment' || doc.docType === 'sale' || doc.docType === 'sale_return'
    || doc.docType === 'purchase' || doc.docType === 'purchase_return';
  if (!coKho) return doc;
  const rows = (await sql<KhoRow>`
    SELECT w.code, b.code AS branch_code, w.is_default, COALESCE(t.owned, true) AS owned
      FROM warehouses w JOIN branches b ON b.id = w.branch_id
      LEFT JOIN warehouse_types t ON t.tenant_id = w.tenant_id AND t.code = w.type_code
     WHERE w.tenant_id = ${tenantId}`.execute(trx)).rows;
  const giuHo = new Set(rows.filter((r) => !r.owned).map((r) => r.code));
  if (!giuHo.size) return doc;
  const macDinh = new Map(rows.filter((r) => r.is_default).map((r) => [r.branch_code, r.code]));
  const kho = (code: string | undefined, branch: string | undefined) => code || (branch ? macDinh.get(branch) : undefined);
  const laGiuHo = (code: string | undefined) => Boolean(code && giuHo.has(code));

  if (doc.docType === 'transfer') {
    const dong = doc.lines.map((l) => {
      // Phiếu một đầu chỉ biết kho của chính phiếu; phiếu cả cặp biết cả kho xuất lẫn kho nhận.
      const ra = doc.leg === 'in' ? undefined : kho(l.warehouseCode, doc.branchCode);
      const vao = doc.leg === 'out' ? undefined : doc.leg === 'in' ? kho(l.toWarehouseCode || l.warehouseCode, doc.branchCode) : kho(l.toWarehouseCode, doc.toBranchCode ?? doc.branchCode);
      if (ra && vao && laGiuHo(ra) !== laGiuHo(vao)) {
        throw Errors.validation(`Không chuyển giữa kho giữ hộ và kho của đơn vị (${l.sku}: ${ra} → ${vao}) — hàng giữ hộ chỉ theo dõi số lượng. Hàng giữ hộ thành của mình: xuất trả khỏi kho giữ hộ rồi lập phiếu nhập mua / nhận quà vào kho của đơn vị (NT-KHO-004)`);
      }
      return laGiuHo(ra) || laGiuHo(vao) ? { ...l, amount: 0 } : l;
    });
    return boGiaTriTong({ ...doc, lines: dong });
  }
  if (doc.docType === 'stock_adjustment') {
    return boGiaTriTong({ ...doc, lines: doc.lines.map((l) => (laGiuHo(kho(l.warehouseCode, doc.branchCode)) ? { ...l, amount: 0 } : l)) });
  }
  // Mua / bán / trả hàng.
  const lines = doc.lines.map((l) => {
    const k = kho(l.warehouseCode, doc.branchCode);
    if (!laGiuHo(k)) return l;
    if (l.amountBeforeTax || l.taxAmount) {
      throw Errors.validation(`Kho ${k} là kho hàng nhận giữ hộ — không ${doc.docType.startsWith('sale') ? 'bán' : 'mua'} có giá trị (${l.sku}). Hàng giữ hộ chỉ theo dõi số lượng (NT-KHO-004)`);
    }
    return { ...l, excludeFromCost: true, cost: undefined };
  });
  return { ...doc, lines } as IngestDocument;
}

/** Phiếu kho: tổng giá trị = tổng các dòng sau khi bỏ giá trị dòng giữ hộ (giữ dấu tổng gốc). */
function boGiaTriTong<T extends Extract<IngestDocument, { docType: 'transfer' | 'stock_adjustment' }>>(doc: T): T {
  const sum = doc.lines.reduce((t, l) => t + Math.abs(l.amount), 0);
  return { ...doc, totals: { ...doc.totals, total: (doc.totals.total < 0 ? -1 : 1) * Math.round(sum * 100) / 100 } };
}
