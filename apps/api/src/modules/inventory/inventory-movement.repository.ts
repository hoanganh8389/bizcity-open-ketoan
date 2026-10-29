/**
 * Hàng vào / ra kho (inventory_movements): trải phẳng dòng hàng của chứng từ đang hiệu lực,
 * mỗi dòng một lần hàng vào hoặc ra một chi nhánh. Nguồn của nhập xuất tồn và giá vốn bình quân.
 * Luôn phản ánh phiên bản mới nhất: xoá dòng cũ của chứng từ rồi ghi lại.
 *
 * Quy ước dấu: qty dương = hàng vào kho, âm = hàng ra kho; amount cùng dấu với qty.
 *   sale            : ra,  amount = −giá vốn (nếu nguồn đã có, không thì NULL: chờ tính giá vốn)
 *   sale_return     : vào, amount = +giá vốn (nếu có)
 *   purchase        : vào, amount = tiền hàng trước thuế (giá nhập)
 *   purchase_return : ra,  amount = −tiền hàng trước thuế
 *   transfer        : ra ở chi nhánh xuất; vào ở chi nhánh nhận khi đã xác nhận nhận hàng
 *   stock_adjustment: vào (tăng) hoặc ra (giảm)
 * Phiếu tiền (chuyển tiền, thu, trả) không có hàng: không ghi gì.
 */
import type { IngestDocument } from '@ketoan/contracts';
import type { Db } from '../../db/client.js';
import { defaultWarehouseCache } from '../warehouses/default-warehouse.js';

type MovementRow = {
  tenant_id: string;
  event_id: string;
  branch_id: string;
  doc_type: string;
  doc_date: string;
  line_no: number;
  kind: string;
  sku: string;
  name: string;
  unit: string;
  warehouse_code: string;
  qty: number;
  amount: number | null;
  counter_branch_id: string | null;
  reason_code: string | null;
  is_gift: boolean;
  exclude_cost: boolean;
  priced_at_sale: boolean;
};

const abs = Math.abs;
/** Giá trị 0 nghĩa là nguồn chưa có giá vốn → NULL để bước tính giá vốn định giá. */
const valued = (v: number | undefined, sign: 1 | -1): number | null => (v === undefined || v === 0 ? null : sign * abs(v));

export const inventoryMovementRepository = {
  async removeForDocument(db: Db, eventId: string): Promise<void> {
    await db.deleteFrom('inventory_movements').where('event_id', '=', eventId).execute();
  },

  async saveForDocument(
    db: Db,
    args: { tenantId: string; branchId: string; toBranchId?: string; eventId: string; doc: IngestDocument; pricedAtSale?: boolean },
  ): Promise<void> {
    const { doc } = args;
    await inventoryMovementRepository.removeForDocument(db, args.eventId);
    const date = doc.docDate.slice(0, 10);
    const base = { tenant_id: args.tenantId, event_id: args.eventId, doc_type: doc.docType, doc_date: date, reason_code: doc.reasonCode ?? null };
    const rows: MovementRow[] = [];
    const push = (
      i: number,
      l: { sku: string; name: string; unit: string; warehouseCode?: string; isGift?: boolean; excludeFromCost?: boolean },
      branchId: string,
      kind: string,
      qty: number,
      amount: number | null,
      counterBranchId: string | null = null,
    ) => {
      if (!l.sku) return;
      rows.push({ ...base, branch_id: branchId, line_no: i + 1, kind, sku: l.sku, name: l.name, unit: l.unit, warehouse_code: l.warehouseCode ?? '', qty, amount, counter_branch_id: counterBranchId, is_gift: Boolean(l.isGift), exclude_cost: Boolean(l.excludeFromCost), priced_at_sale: false });
    };

    switch (doc.docType) {
      case 'sale':
        if (args.pricedAtSale) {
          // Bán theo giá bán (nội bộ): giá vốn = tiền hàng, đã ghi sổ cùng phiếu, không tính vào đơn giá bình quân.
          doc.lines.forEach((l, i) => push(i, l, args.branchId, 'sale', -abs(l.qty), -abs(l.amountBeforeTax)));
          for (const r of rows) r.priced_at_sale = true;
        } else doc.lines.forEach((l, i) => push(i, l, args.branchId, 'sale', -abs(l.qty), valued(l.cost, -1)));
        break;
      case 'sale_return':
        doc.lines.forEach((l, i) => push(i, l, args.branchId, 'sale_return', abs(l.qty), valued(l.cost, 1)));
        break;
      case 'purchase':
        doc.lines.forEach((l, i) => push(i, l, args.branchId, 'purchase', l.qty, l.amountBeforeTax));
        break;
      case 'purchase_return':
        doc.lines.forEach((l, i) => push(i, l, args.branchId, 'purchase_return', -abs(l.qty), -abs(l.amountBeforeTax)));
        break;
      case 'transfer':
        if (doc.leg) {
          // Phiếu một đầu: chỉ thẻ kho của chi nhánh phiếu; chi nhánh bên kia (nếu biết) để định giá hàng nhận theo bên gửi.
          const out = doc.leg === 'out';
          doc.lines.forEach((l, i) => push(i, l, args.branchId, out ? 'transfer_out' : 'transfer_in', out ? -abs(l.qty) : abs(l.qty), valued(l.amount, out ? -1 : 1), args.toBranchId ?? null));
          break;
        }
        doc.lines.forEach((l, i) => {
          push(i, l, args.branchId, 'transfer_out', -abs(l.qty), valued(l.amount, -1), args.toBranchId ?? null);
          // Phía nhận: kho của dòng là kho XUẤT (chi nhánh gửi) — không mang sang; nhận vào toWarehouseCode, trống = kho mặc định
          // của chi nhánh nhận. Cùng chi nhánh (chuyển giữa hai kho): hai dòng cùng chi nhánh, khác kho.
          if (doc.status === 'received' && args.toBranchId) push(i, { ...l, warehouseCode: l.toWarehouseCode }, args.toBranchId, 'transfer_in', abs(l.qty), valued(l.amount, 1), args.branchId);
        });
        break;
      case 'stock_adjustment': {
        doc.lines.forEach((l, i) => {
          const inc = doc.direction === 'mixed' ? l.qty > 0 : doc.direction === 'increase';
          push(i, l, args.branchId, inc ? 'adjust_in' : 'adjust_out', inc ? abs(l.qty) : -abs(l.qty), valued(l.amount, inc ? 1 : -1));
        });
        break;
      }
    }
    // Mọi dòng phải thuộc một phân kho: không ghi kho → kho mặc định của chi nhánh (của từng phía với phiếu chuyển).
    const defWh = defaultWarehouseCache(db, args.tenantId);
    for (const r of rows) if (!r.warehouse_code) r.warehouse_code = await defWh(String(r.branch_id));
    for (let i = 0; i < rows.length; i += 1000) {
      await db.insertInto('inventory_movements').values(rows.slice(i, i + 1000)).execute();
    }
  },
};
