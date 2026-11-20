// @bizcity-layer K kernel/subledgers/inventory
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 07:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — một cửa ghi sổ: eventStore cho phiếu tay, kết chuyển, khấu hao, giá vốn.
// [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — transactional outbox, subscriber, đồng hồ, correlation_id.
// [2026-10-30 09:03 PM Johnny Chu - Chu Hoàng Anh] PHASE-005 — chính sách kế toán có phiên bản + ngày hiệu lực (ADR-0009).
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/modules/inventory/costing.service.ts sang packages/kernel (@bizcity/kernel, D010-7 chặng 3); import Platform qua @bizcity/platform
// [2026-11-04 01:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — G2: tính giá theo ĐỊNH DANH mặt hàng (item_id, 0066) — đổi mã giữa tháng không tách đơn giá; mã trên dòng giá vốn = mã hiện hành
// [2026-11-10 02:00 PM Nguyễn Văn Thủy] PHASE-026 — phiếu giá vốn tháng áp bảng quy tắc định khoản (nghiệp vụ, hàng tặng, chiều chuyển kho) (đóng góp)
/**
 * Tính giá vốn bình quân gia quyền theo tháng và ghi sổ giá vốn hàng xuất.
 *
 * Bước 1 — tính đơn giá (inventory_costs), cho từng nhóm tính giá (= đơn vị hạch toán của chi nhánh), mặt hàng:
 *
 *              GT tồn đầu + GT nhập mua − GT trả NCC + GT điều chỉnh tăng có giá + GT nhận từ nhóm khác
 *   Đơn giá = ─────────────────────────────────────────────────────────────────────────────────────────
 *              SL tồn đầu + SL nhập mua − SL trả NCC + SL điều chỉnh tăng có giá + SL nhận từ nhóm khác
 *
 *   - ĐƠN GIÁ NHẬP TỪ EXCEL (giai đoạn chạy song song, migration 0061): mã hàng có trong bảng giá vốn tháng nhập từ tệp
 *     (Mã hàng, Tên hàng, Giá vốn) dùng đúng đơn giá đó cho MỌI nhóm tính giá — mỗi mã một giá, hàng chính hay khuyến
 *     mãi như nhau; mã không có trong tệp tính như dưới. Giá đã nhập lưu ở inventory_costs (cost_source = 'import')
 *     và được giữ khi tính lại tháng đó; nhập tệp mới thì thay toàn bộ giá đã nhập của tháng.
 *   - Tồn đầu = tồn cuối tháng trước của chính bảng này; tồn đầu số lượng ≤ 0 thì coi như không có.
 *   - Hàng xuất THEO GIÁ BÁN (bán nội bộ cho chi nhánh khác — lý do có cờ costAtSalePrice) bị trừ khỏi cả tử
 *     (theo giá bán) và mẫu (số lượng) trước khi chia; giá vốn của nó đã ghi sổ cùng phiếu bán.
 *   - Hàng trả nhà cung cấp: theo thành tiền − thuế trên phiếu (mặc định) hoặc định giá theo giá vốn đầu tháng — chọn ở công thức giá vốn
 *     (0153), không theo lý do (lý do chỉ là nhãn). Định giá theo đầu tháng: tiền trả 0 → 0; đơn giá trả ≤ đơn giá tồn đầu → SL × đơn giá tồn đầu;
 *     tiền trả ≤ GT tồn đầu → tiền trả; SL trả ≤ SL tồn đầu → GT tồn đầu; còn lại → GT tồn đầu + (SL trả − SL tồn đầu) × đơn giá trả.
 *     Tồn kho trên sổ vẫn giảm theo tiền trên phiếu trả.
 *   - Nhập điều chỉnh tăng: tính vào tử, mẫu hay không — chọn ở công thức giá vốn.
 *   - Quà KM người tiêu dùng nhận kèm phiếu mua (inventory_movements.exclude_cost) không tính vào tử, mẫu mà vào PHẦN TỒN QUÀ
 *     giá 0 của mã (inventory_costs.gift_qty, mang sang tháng sau). Dòng bán hàng tặng khách lấy từ phần quà trước (giá vốn 0),
 *     hết mới lấy hàng thường theo đơn giá. Quà KM người bán (chia giá) vẫn tính (SL tăng, tiền 0 → đơn giá giảm).
 *   - So sánh đơn giá trả với đơn giá tồn đầu: dùng đơn giá tồn đầu chung của nhóm (cùng một đơn giá cho mọi kho).
 *   - KHÁCH TRẢ HÀNG (PHASE-032 B3, R-INV-4): phiếu trả nối chứng từ bán gốc qua originalDocKey.
 *       bán gốc cùng tháng            → như cũ: trừ vào lượng xuất, hoàn theo đơn giá tháng (= đơn giá lúc bán);
 *       bán gốc tháng trước            → nhập lại theo ĐƠN GIÁ THÁNG BÁN GỐC (inventory_costs của tháng đó), và vào công thức
 *                                         đơn giá tháng trả như một dòng nhập (giá trị tồn theo đơn giá tháng khớp số dư TK kho);
 *       không có gốc / gốc chưa tính giá → đơn giá bình quân TỒN ĐẦU kỳ trả (Q032-5 mặc định tạm), cũng như một dòng nhập.
 *     Tháng bán gốc tính lại sau đó thì phiếu trả không tự đổi: tính lại tháng trả (giá vốn cũ, COGS_STALE).
 *   - Mẫu số ≤ 0 → đơn giá dương gần nhất của các tháng trước (không có thì 0).
 *   - Chuyển kho giữa hai chi nhánh cùng nhóm không làm đổi đơn giá. Hàng nhận từ nhóm khác chưa có giá
 *     được định giá theo đơn giá của nhóm gửi (tính nhóm gửi trước, rồi tính lại nhóm nhận).
 *   - Tồn cuối số lượng = tồn đầu + mọi lần vào / ra trong tháng; giá trị tồn cuối = số lượng × đơn giá.
 *   Tháng trước chưa tính mà có phát sinh từ trước → tính lần lượt các tháng còn thiếu.
 *   - KHOÁ MẶT HÀNG = item_id (PHASE-024 G2, R-ITEM-1): mọi dòng kho của một định danh — kể cả dòng mang mã cũ trước khi
 *     đổi mã — gom về MỘT dòng giá vốn (nhóm, định danh, tháng); inventory_costs.sku = mã hiện hành của định danh lúc tính,
 *     inventory_costs.item_id = định danh. Giá nhập từ Excel ghi theo mã → tra về định danh tại ngày cuối tháng. Dòng kho
 *     chưa có item_id (không còn sau 0066) vẫn khoá theo mã.
 *
 * Bước 2 — PHIẾU GIÁ VỐN (chốt 22/10/2026, thay cách ghi đè dòng chờ trên từng phiếu của 20/10): phiếu bán, hoàn,
 * chuyển kho, điều chỉnh, xuất điều chỉnh KHÔNG mang dòng giá vốn nữa. Tính giá vốn (tự tính hay nhập Excel) sinh mỗi
 * (chi nhánh, tháng) MỘT chứng từ "Giá vốn hàng xuất" — liệt kê TỪNG MÃ HÀNG (mỗi mã × cặp tài khoản một dòng, số tiền =
 * |SL| × đơn giá) — tính lại thì đảo bút toán cũ, ghi bút toán mới. Dòng chờ giá vốn còn sót trên phiếu đã định khoản
 * trước đây (ledger_lines.cost_fill) được đưa về 0 (overwriteCostPairs) để không tính trùng.
 * docKey cogs:<chi nhánh>:<YYYY-MM>, ngày cuối tháng (khoá cũ cogs:<internal|tax>:… huỷ); luôn cả tháng. Định khoản:
 *   bán            : Nợ TK giá vốn (hoặc CP khuyến mãi, TK chi phí của lý do) / Có TK kho
 *   khách trả      : Nợ TK kho / Có TK giá vốn
 *   chuyển đi      : Nợ TK hàng đang chuyển (1579; khác đơn vị hạch toán: 13681) / Có TK kho
 *   chuyển đến     : Nợ TK kho / Có TK hàng đang chuyển — theo đơn giá của nhóm GỬI để TK trung gian về 0
 *   điều chỉnh giảm: Nợ TK đối ứng của lý do (1381…) / Có TK kho;  điều chỉnh tăng: ngược lại
 * Tính lại: bút toán cũ được ghi số âm rồi ghi bút toán mới. Không cần xoá, ghi lại bút toán bán hàng.
 * Lần hàng xuất mà hệ thống nguồn đã gửi kèm giá vốn thì đã ghi sổ cùng chứng từ gốc, ở đây bỏ qua.
 */
import { COST_FORMULAS, fromCents, returnValueAtOpening, toCents, ULID_RE } from '@ketoan/contracts';
import { sql } from 'kysely';
import { db, type Db } from '@bizcity/platform/db/client';
import { env } from '@bizcity/platform/config/env';
import { Errors } from '@bizcity/platform/core/errors';
import { writeAudit } from '@bizcity/platform/core/audit';
import type { AuthContext } from '@bizcity/platform/core/auth';
import { eventStore } from '../documents/event-store.js';
import { partnerRepository } from '@bizcity/platform/masterdata/partner.repository';
import { postingConfigRepository } from '../posting-config/posting-config.repository.js';
import { AccountResolver } from '../posting/account-resolver.js';
import { stripPairTags } from '../posting/pair-tags.js';
import { EntryBuilder } from '../posting/entry-builder.js';
import { sameTx, type ActionTx } from '@bizcity/platform/core/actions';
import { loaiKhoGiuHo } from './kho-giu-ho.js';

interface Period { year: number; month: number }
const label = (p: Period) => `${p.year}-${String(p.month).padStart(2, '0')}`;
const prevOf = (p: Period): Period => (p.month === 1 ? { year: p.year - 1, month: 12 } : { year: p.year, month: p.month - 1 });
const cmp = (a: Period, b: Period) => a.year * 12 + a.month - (b.year * 12 + b.month);
const firstDay = (p: Period) => `${label(p)}-01`;
const lastDay = (p: Period) => new Date(Date.UTC(p.year, p.month, 0)).toISOString().slice(0, 10);
export function parsePeriod(s: string): Period {
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw Errors.validation('Kỳ dạng YYYY-MM');
  return { year: Number(m[1]), month: Number(m[2]) };
}

/** Khoá dòng giá vốn: (nhóm tính giá, khoá mặt hàng). Khoá mặt hàng = item_id; dòng chưa có item_id → mã ([2026-11-04 01:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — G2). */
const key = (group: string, ikey: string) => `${group}|${ikey}`;
// [2026-11-17 Nguyễn Văn Thủy] GIÁ VỐN TÁCH THEO LOẠI KHO (0155): loại kho bỏ chọn "tính chung" thì nhóm tính giá = đơn vị hạch toán + "~" + mã
// loại kho. Nhóm tính giá trong code là chuỗi "<đơn vị>" hoặc "<đơn vị>~<loại kho>"; lưu inventory_costs.cost_group + wh_type (đóng góp)
const baseGroup = (g: string | null) => (g ?? '').split('~')[0]!;
const typeOfGroup = (g: string) => g.split('~')[1] ?? '';
/** Loại kho của dòng kho m (alias cwt) khi loại đó tính riêng. */
const whJoin = (sep: string[]) => sql`LEFT JOIN warehouses cw ON cw.tenant_id = m.tenant_id AND cw.code = m.warehouse_code
      LEFT JOIN warehouse_types cwt ON cwt.tenant_id = m.tenant_id AND cwt.code = cw.type_code AND cwt.code = ANY(${sep}::text[])`;
/** Loại kho của dòng chuyển đối ứng (cùng phiếu, cùng dòng, chiều kia) khi loại đó tính riêng (alias ctw). */
const counterWhJoin = (sep: string[]) => sql`LEFT JOIN LATERAL (
        SELECT t2.code FROM inventory_movements m2
          JOIN warehouses w2 ON w2.tenant_id = m2.tenant_id AND w2.code = m2.warehouse_code
          JOIN warehouse_types t2 ON t2.tenant_id = m2.tenant_id AND t2.code = w2.type_code AND t2.code = ANY(${sep}::text[])
         WHERE m.kind IN ('transfer_in', 'transfer_out') AND m2.tenant_id = m.tenant_id AND m2.event_id = m.event_id AND m2.line_no = m.line_no
           AND m2.kind = CASE m.kind WHEN 'transfer_in' THEN 'transfer_out' ELSE 'transfer_in' END LIMIT 1) ctw ON true`;
const GRP = sql`(COALESCE(b.accounting_unit_id, 0)::text || COALESCE('~' || cwt.code, ''))`;
const CGRP = sql`(COALESCE(cb.accounting_unit_id, 0)::text || COALESCE('~' || ctw.code, ''))`;
/** Nhóm tính giá của một dòng inventory_costs (không bí danh). */
const STORED_GRP = sql`(cost_group::text || CASE WHEN wh_type <> '' THEN '~' || wh_type ELSE '' END)`;

const isItemId = (k: string) => ULID_RE.test(k);
/** Mã hiện hành của các định danh (mã sku đang mở; mặt hàng đã xoá → mã gần nhất). */
async function codesNow(trx: Db, tenantId: string, keys: Iterable<string>): Promise<Map<string, string>> {
  const ids = [...new Set([...keys].filter(isItemId))];
  if (!ids.length) return new Map();
  const r = await sql<{ item_id: string; code: string }>`
    SELECT DISTINCT ON (item_id) item_id, code FROM item_codes
     WHERE tenant_id = ${tenantId} AND kind = 'sku' AND item_id = ANY(${ids}::text[])
     ORDER BY item_id, (valid_to IS NULL) DESC, valid_from DESC`.execute(trx);
  return new Map(r.rows.map((x) => [x.item_id, x.code]));
}
/** Mã (Excel, API) → khoá mặt hàng tại một ngày: định danh nếu mã có trong danh mục, không thì chính mã đó. */
async function keysOfSkus(trx: Db, tenantId: string, skus: string[], day: string): Promise<Map<string, string>> {
  if (!skus.length) return new Map();
  const r = await sql<{ sku: string; item_id: string | null }>`
    SELECT s AS sku, bizcity_item_at(${tenantId}, s, ${day}::date) AS item_id FROM unnest(${skus}::text[]) s`.execute(trx);
  return new Map(r.rows.map((x) => [x.sku, x.item_id ?? x.sku]));
}
const round4 = (v: number) => Math.round(v * 10000) / 10000;

interface CostRow {
  group: string;
  /** Khoá mặt hàng: item_id (hoặc mã khi dòng kho chưa có item_id). */
  ikey: string;
  /** Mã hiện hành để hiển thị / ghi inventory_costs.sku. */
  sku: string;
  openingQty: number;
  openingValue: number;
  inQty: number;
  inValue: number;
  unitCost: number;
  outQty: number;
  closingQty: number;
  /** Phần tồn quà KM người tiêu dùng (giá 0): đầu kỳ, nhập, xuất tặng. */
  giftOpening: number;
  giftIn: number;
  giftOut: number;
  /** [2026-11-17 Nguyễn Văn Thủy] dòng chảy trong kỳ theo loại (0152) (đóng góp) */
  d: FlowDetail;
  /** ĐGBQ đầu kỳ nhập từ Excel. */
  importUnit?: number;
}
// [2026-11-17 Nguyễn Văn Thủy] CÔNG THỨC GIÁ VỐN TUỲ CHỌN (0153): mỗi lần tính chọn một bộ lựa chọn (đóng góp)
export interface CostFormula {
  /** Giá nhập: net = chưa VAT, đã trừ CK; before_discount = chưa VAT, chưa trừ CK; with_vat = gồm VAT, đã trừ CK. */
  price: 'net' | 'before_discount' | 'with_vat';
  /** Cộng chi phí mua hàng phân bổ. */
  costAlloc: boolean;
  /** Trừ thưởng / chiết khấu nhãn hàng phân bổ. */
  rebateAlloc: boolean;
  /** Hàng trả NCC: theo giá trị phiếu / định giá theo tồn đầu. Không theo lý do (lý do chỉ là nhãn). Mặc định theo sổ của bản cài (BOOK_MODE). */
  purchaseReturn: 'doc' | 'opening';
  /** Nhận từ chi nhánh khác: theo phiếu (không có giá thì giá vốn bên gửi) / luôn giá vốn bên gửi. */
  transferIn: 'doc' | 'sender';
  /** Nhập điều chỉnh tính vào giá. */
  adjustIn: boolean;
}
const DEFAULT_FORMULA: Omit<CostFormula, 'purchaseReturn'> = { price: 'net', costAlloc: true, rebateAlloc: true, transferIn: 'doc', adjustIn: true };
/** Lựa chọn của công thức; thiếu "hàng trả NCC" (hoặc kiểu cũ theo lý do) thì theo sổ của bản cài: nội bộ = theo phiếu, thuế = theo tồn đầu. */
export const formulaOf = (o: unknown): CostFormula => {
  const f = { ...DEFAULT_FORMULA, ...((o && typeof o === 'object' ? o : {}) as Partial<CostFormula>) };
  const pr = f.purchaseReturn as string;
  return { ...f, purchaseReturn: pr === 'opening' || pr === 'doc' ? pr : COST_FORMULAS[env.BOOK_MODE].purchaseReturn };
};

interface FlowDetail {
  purchaseQty: number; purchaseValue: number; returnQty: number; returnValue: number; adjInQty: number; adjInValue: number;
  tInQty: number; tInValue: number; tOutQty: number; saleQty: number; saleReturnQty: number; adjOutQty: number;
  /** Chi phí mua hàng phân bổ vào mã (tăng giá vốn) / thưởng, chiết khấu nhãn hàng phân bổ (giảm giá vốn, số dương). */
  costAlloc: number; rebateAlloc: number;
  /** Chênh lệch hàng trả NCC = giá trị trên phiếu trả − giá trị trừ khỏi công thức (dương: phiếu trả lớn hơn). */
  returnDiff: number;
}
const emptyDetail = (): FlowDetail => ({ purchaseQty: 0, purchaseValue: 0, returnQty: 0, returnValue: 0, adjInQty: 0, adjInValue: 0, tInQty: 0, tInValue: 0, tOutQty: 0, saleQty: 0, saleReturnQty: 0, adjOutQty: 0, costAlloc: 0, rebateAlloc: 0, returnDiff: 0 });

/** Tổng hợp hàng vào / ra trong tháng theo (nhóm, mặt hàng, loại, nhóm bên kia). */
async function monthFlows(trx: Db, tenantId: string, p: Period, sep: string[] = []) {
  const res = await sql<{ grp: string; ikey: string; sku: string; kind: string; reason: string | null; priced: boolean; excl: boolean; cgrp: string | null; qty: string; amount: string; valued_qty: string; unvalued_qty: string; alloc: string; tax: string; disc: string }>`
    SELECT ${GRP} AS grp, COALESCE(m.item_id, m.sku) AS ikey, MAX(m.sku) AS sku, m.kind, m.reason_code AS reason, m.priced_at_sale AS priced, m.exclude_cost AS excl,
           CASE WHEN m.counter_branch_id IS NULL THEN NULL ELSE ${CGRP} END AS cgrp,
           SUM(m.qty) AS qty,
           COALESCE(SUM(m.amount), 0) AS amount,
           SUM(CASE WHEN m.amount IS NULL THEN 0 ELSE m.qty END) AS valued_qty,
           SUM(CASE WHEN m.amount IS NULL THEN m.qty ELSE 0 END) AS unvalued_qty,
           COALESCE(SUM(CASE WHEN m.qty = 0 THEN m.amount ELSE 0 END), 0) AS alloc,
           COALESCE(SUM(CASE WHEN m.qty = 0 THEN 0 ELSE m.tax_amount END), 0) AS tax,
           COALESCE(SUM(CASE WHEN m.qty = 0 THEN 0 ELSE m.discount_amount END), 0) AS disc
      FROM inventory_movements m
      JOIN branches b ON b.id = m.branch_id
      LEFT JOIN branches cb ON cb.id = m.counter_branch_id
      ${whJoin(sep)}
      ${counterWhJoin(sep)}
     WHERE m.tenant_id = ${tenantId}
       AND m.doc_date BETWEEN ${firstDay(p)}::date AND ${lastDay(p)}::date
     GROUP BY 1, 2, 4, 5, 6, 7, 8`.execute(trx);
  return res.rows.map((r) => ({ group: r.grp, ikey: r.ikey, sku: r.sku, kind: r.kind, reason: r.reason, pricedAtSale: r.priced, excludeCost: r.excl, counterGroup: r.cgrp, qty: Number(r.qty), amount: Number(r.amount), valuedQty: Number(r.valued_qty), unvaluedQty: Number(r.unvalued_qty), alloc: Number(r.alloc), tax: Number(r.tax), disc: Number(r.disc) }));
}

/** Giá trị hàng trả nhà cung cấp đưa vào công thức đơn giá, định giá theo tồn đầu. */
export const returnValue = returnValueAtOpening;

/**
 * [2026-11-17 Nguyễn Văn Thủy] Hàng trả NCC theo phiếu, có trần (sổ nội bộ): SL trả = SL tồn đầu + SL nhập → lấy hết giá trị đang có;
 * khác: tiền trên phiếu ≤ giá trị đang có → tiền trên phiếu, lớn hơn → giá trị đang có. Không có hàng nào để so → tiền trên phiếu (đóng góp)
 */
export function returnValueCapped(qty: number, amount: number, r: { openingQty: number; openingValue: number; inQty: number; inValue: number }): number {
  const availQ = (r.openingQty > 0 ? r.openingQty : 0) + r.inQty;
  const availV = (r.openingQty > 0 ? r.openingValue : 0) + r.inValue;
  if (availQ <= 0 || availV <= 0) return amount;
  if (Math.abs(qty - availQ) < 1e-6) return Math.round(availV);
  return amount <= availV ? amount : Math.round(availV);
}

/** Đơn giá đã nhập từ Excel của một tháng (theo khoá mặt hàng). */
async function importedUnits(trx: Db, tenantId: string, p: Period): Promise<Map<string, number>> {
  const res = await sql<{ k: string; unit_cost: string }>`
    SELECT DISTINCT ON (COALESCE(item_id, sku)) COALESCE(item_id, sku) AS k, COALESCE((detail->>'importUnit')::numeric, unit_cost) AS unit_cost FROM inventory_costs
     WHERE tenant_id = ${tenantId} AND year = ${p.year} AND month = ${p.month} AND cost_source = 'import'
     ORDER BY COALESCE(item_id, sku), cost_group`.execute(trx);
  return new Map(res.rows.map((r) => [r.k, Number(r.unit_cost)]));
}

/**
 * Tính đơn giá một tháng và ghi inventory_costs. Trả về đơn giá theo (nhóm, mặt hàng).
 * `imports`: đơn giá nhập từ Excel theo KHOÁ mặt hàng (đã tra từ mã; thay toàn bộ giá đã nhập của tháng); bỏ trống thì giữ giá đã nhập trước đó.
 */
/** Kết quả tính một tháng: đơn giá theo (nhóm, mã) + SL hàng tặng khách lấy từ phần quà giá 0 theo (chứng từ, mã). */
/** Một dòng chênh lệch hàng trả NCC của một chi nhánh (dương: phiếu trả lớn hơn giá trị trừ khỏi công thức). */
interface ReturnDiffLine { sku: string; amount: number }

interface MonthResult {
  rows: Map<string, CostRow>;
  giftCovered: Map<string, number>;
  // [2026-11-10 11:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B3 (S032-17, R-INV-4): khách trả hàng của lần bán tháng trước nhập lại theo đơn giá tháng bán gốc; không có gốc theo bình quân tồn đầu kỳ trả (Q032-5 tạm)
  /** Đơn giá hoàn của phiếu khách trả không cùng tháng bán gốc, theo (chứng từ trả, khoá mặt hàng). Cùng tháng thì không có — dùng đơn giá tháng. */
  returnUnits: Map<string, number>;
  /** [2026-11-17] Chênh lệch hàng trả NCC theo (nhóm, mặt hàng): giá trị phiếu trả − giá trị trừ khỏi công thức. */
  returnDiffs: Map<string, number>;
}

async function computeMonth(trx: Db, tenantId: string, p: Period, imports?: Map<string, number>, formula: CostFormula = formulaOf({}), sep: string[] = []): Promise<MonthResult> {
  const imported = imports ?? (await importedUnits(trx, tenantId, p));
  const prev = prevOf(p);
  const prevRows = await trx.selectFrom('inventory_costs').selectAll()
    .where('tenant_id', '=', tenantId).where('year', '=', prev.year).where('month', '=', prev.month).execute();
  const lastUnits = await sql<{ cost_group: string; k: string; unit_cost: string }>`
    SELECT DISTINCT ON (cost_group, wh_type, COALESCE(item_id, sku)) ${STORED_GRP} AS cost_group, COALESCE(item_id, sku) AS k, unit_cost FROM inventory_costs
     WHERE tenant_id = ${tenantId} AND unit_cost > 0 AND (year * 12 + month) < ${p.year * 12 + p.month}
     ORDER BY cost_group, wh_type, COALESCE(item_id, sku), year DESC, month DESC`.execute(trx);
  const fallback = new Map(lastUnits.rows.map((r) => [key(r.cost_group, r.k), Number(r.unit_cost)]));

  const rows = new Map<string, CostRow>();
  const row = (group: string, ikey: string, sku = ikey) => {
    let r = rows.get(key(group, ikey));
    if (!r) {
      r = { group, ikey, sku, openingQty: 0, openingValue: 0, inQty: 0, inValue: 0, unitCost: 0, outQty: 0, closingQty: 0, giftOpening: 0, giftIn: 0, giftOut: 0, d: emptyDetail() };
      rows.set(key(group, ikey), r);
    }
    return r;
  };
  for (const pr of prevRows) {
    const r = row(String(pr.cost_group) + (pr.wh_type ? `~${pr.wh_type}` : ''), pr.item_id ?? pr.sku, pr.sku);
    // Tồn đầu tính đơn giá = tồn cuối tháng trước trừ phần quà giá 0 (quà mang sang riêng).
    r.giftOpening = Number(pr.gift_qty ?? 0);
    r.openingQty = Number(pr.closing_qty) - r.giftOpening;
    r.openingValue = Number(pr.closing_value);
  }
  // [2026-11-17 Nguyễn Văn Thủy] nhập Excel = ĐGBQ ĐẦU KỲ: giá trị tồn đầu = SL tồn đầu × đơn giá nhập, rồi bình quân với chứng từ trong kỳ (đóng góp)
  for (const r of rows.values()) {
    const fixed = imported.get(r.ikey);
    if (fixed === undefined) continue;
    r.importUnit = round4(fixed);
    if (r.openingQty > 0) r.openingValue = Math.round(r.openingQty * fixed);
  }

  const flows = await monthFlows(trx, tenantId, p, sep);
  // Hàng nhận từ nhóm khác chưa có giá: định giá ở lượt 2 theo đơn giá nhóm gửi.
  const pendingExternal: { group: string; ikey: string; sku: string; counterGroup: string; qty: number }[] = [];
  // Hàng trả nhà cung cấp: định giá theo tồn đầu sau khi gom đủ (số dương).
  const returns = new Map<string, { qty: number; amount: number }>();
  // Giá trị một dòng mua / trả NCC theo công thức: phần hàng (bỏ phân bổ) + VAT / CK nếu chọn; phân bổ cộng / trừ theo công tắc.
  const goods = (f: { amount: number; alloc: number; tax: number; disc: number }) =>
    f.amount - f.alloc + (formula.price === 'with_vat' ? f.tax : 0) + (formula.price === 'before_discount' ? f.disc : 0);
  for (const f of flows) {
    const r = row(f.group, f.ikey, f.sku);
    r.closingQty += f.qty;
    const external = f.counterGroup !== null && f.counterGroup !== f.group;
    if (f.kind === 'sale' && f.pricedAtSale) {
      // Bán theo giá bán: trừ khỏi cả tử và mẫu của công thức đơn giá.
      r.inQty += f.qty;
      r.inValue += f.amount;
      r.d.saleQty += -f.qty;
      continue;
    }
    switch (f.kind) {
      case 'purchase':
        // Quà KM người tiêu dùng nhận kèm phiếu mua: vào tồn nhưng không vào đơn giá (không kéo giá vốn hàng bán xuống).
        if (f.excludeCost) { r.giftIn += f.qty; break; }
        r.inQty += f.qty;
        r.inValue += goods(f) + (formula.costAlloc ? f.alloc : 0);
        r.d.purchaseQty += f.qty;
        r.d.purchaseValue += goods(f);
        if (formula.costAlloc) r.d.costAlloc += f.alloc; // [2026-11-17 Nguyễn Văn Thủy] chi phí mua hàng phân bổ (vận chuyển…) tách cột riêng (đóng góp)
        break;
      case 'purchase_return': {
        // [2026-11-17 Nguyễn Văn Thủy] hàng trả NCC gom lại, định giá sau khi đủ tồn đầu + nhập trong kỳ (trần, chênh lệch) (đóng góp)
        const k = key(f.group, f.ikey);
        const cur = returns.get(k) ?? { qty: 0, amount: 0 };
        cur.qty += -f.qty;
        cur.amount += -goods(f);
        if (f.alloc) { r.inValue += formula.rebateAlloc ? f.alloc : 0; if (formula.rebateAlloc) r.d.rebateAlloc += -f.alloc; }
        returns.set(k, cur);
        break;
      }
      case 'adjust_in':
        if (!formula.adjustIn) break;
        r.inQty += f.valuedQty;
        r.inValue += f.amount;
        r.d.adjInQty += f.valuedQty;
        r.d.adjInValue += f.amount;
        break;
      case 'transfer_in':
        r.d.tInQty += f.qty;
        if (external && formula.transferIn === 'sender') {
          pendingExternal.push({ group: f.group, ikey: f.ikey, sku: f.sku, counterGroup: f.counterGroup!, qty: f.qty });
        } else if (external) {
          r.d.tInValue += f.amount;
          r.inQty += f.valuedQty;
          r.inValue += f.amount;
          if (f.unvaluedQty) pendingExternal.push({ group: f.group, ikey: f.ikey, sku: f.sku, counterGroup: f.counterGroup!, qty: f.unvaluedQty });
        }
        break;
      case 'transfer_out':
        r.d.tOutQty += -f.qty;
        if (external) r.outQty += -f.qty;
        break;
      default: // sale, sale_return, adjust_out
        r.outQty += -f.qty;
        if (f.kind === 'sale') r.d.saleQty += -f.qty;
        else if (f.kind === 'sale_return') r.d.saleReturnQty += f.qty;
        else r.d.adjOutQty += -f.qty;
    }
  }

  // Hàng trả NCC (số dương). Sổ thuế: định giá theo tồn đầu. Sổ nội bộ: thành tiền − thuế trên phiếu, không vượt giá trị đang có
  // (tồn đầu + nhập trong kỳ); trả hết số đang có thì lấy hết giá trị. Chênh lệch = tiền trên phiếu − giá trị trừ, ghi ở phiếu giá vốn.
  const returnDiffs = new Map<string, number>();
  for (const [k, ret] of returns) {
    const r = rows.get(k)!;
    if (!ret.qty && !ret.amount) continue;
    const rv = formula.purchaseReturn === 'opening' ? returnValue(ret.qty, ret.amount, r.openingQty, r.openingValue) : returnValueCapped(ret.qty, ret.amount, r);
    r.inQty -= ret.qty;
    r.inValue -= rv;
    r.d.returnQty += ret.qty;
    r.d.returnValue += rv;
    const diff = Math.round(ret.amount - rv);
    if (diff) { r.d.returnDiff += diff; returnDiffs.set(k, diff); }
  }

  // [2026-11-10 11:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B3 (S032-17, R-INV-4): khách trả hàng của lần bán tháng trước nhập lại theo đơn giá tháng bán gốc; không có gốc theo bình quân tồn đầu kỳ trả (Q032-5 tạm)
  const returnUnits = new Map<string, number>();
  const cur = p.year * 12 + p.month;
  const saleReturns = await sql<{ event_id: string; grp: string; ikey: string; qty: string; origin_ym: number | null }>`
    SELECT m.event_id::text, ${GRP} AS grp, COALESCE(m.item_id, m.sku) AS ikey, SUM(m.qty) AS qty,
           (EXTRACT(YEAR FROM o.doc_date) * 12 + EXTRACT(MONTH FROM o.doc_date))::int AS origin_ym
      FROM inventory_movements m
      JOIN branches b ON b.id = m.branch_id
      ${whJoin(sep)}
      JOIN accounting_events e ON e.id = m.event_id
      LEFT JOIN accounting_events o ON o.tenant_id = e.tenant_id AND o.doc_key = e.payload->>'originalDocKey' AND o.status = 'posted'
     WHERE m.tenant_id = ${tenantId} AND m.kind = 'sale_return' AND m.amount IS NULL
       AND m.doc_date BETWEEN ${firstDay(p)}::date AND ${lastDay(p)}::date
     GROUP BY m.event_id, 2, 3, 5 HAVING SUM(m.qty) > 0`.execute(trx);
  const others = saleReturns.rows.filter((x) => x.origin_ym === null || Number(x.origin_ym) < cur);
  const originYms = [...new Set(others.map((x) => x.origin_ym).filter((v): v is number => v !== null).map(Number))];
  const originUnits = new Map<string, number>();
  if (originYms.length) {
    const ou = await sql<{ cost_group: string; k: string; ym: number; unit_cost: string }>`
      SELECT ${STORED_GRP} AS cost_group, COALESCE(item_id, sku) AS k, (year * 12 + month) AS ym, unit_cost FROM inventory_costs
       WHERE tenant_id = ${tenantId} AND (year * 12 + month) = ANY(${originYms}::int[])`.execute(trx);
    for (const x of ou.rows) originUnits.set(`${key(x.cost_group, x.k)}|${Number(x.ym)}`, Number(x.unit_cost));
  }
  for (const x of others) {
    const r = rows.get(key(x.grp, x.ikey));
    if (!r) continue;
    const q = Number(x.qty);
    const atOrigin = x.origin_ym === null ? undefined : originUnits.get(`${key(x.grp, x.ikey)}|${Number(x.origin_ym)}`);
    // Không có gốc (hoặc gốc chưa có đơn giá): bình quân tồn đầu kỳ trả; không có tồn đầu thì đơn giá gần nhất trước đó.
    const atOpening = r.openingQty > 0 ? r.openingValue / r.openingQty : fallback.get(key(x.grp, x.ikey));
    const unit = atOrigin ?? atOpening;
    if (unit === undefined) continue; // không có giá nào để hoàn: như cũ (đơn giá tháng trả)
    r.outQty += q; // bỏ phần đã trừ vào lượng xuất ở trên: hàng trả khác tháng là một dòng nhập
    r.inQty += q;
    r.inValue += Math.round(q * unit);
    returnUnits.set(`${x.event_id}|${x.ikey}`, round4(unit));
  }

  // Mã hàng có trong bảng giá nhập mà tháng này không phát sinh: vẫn giữ một dòng (nhóm 0) để không mất giá đã nhập.
  const seen = new Set([...rows.values()].map((r) => r.ikey));
  for (const k of imported.keys()) if (!seen.has(k)) row('0', k);
  // ĐGBQ cuối kỳ = (tồn đầu $ + nhập trong kỳ $) / (SL tương ứng). Không có SL: lấy ĐGBQ đầu kỳ nhập Excel, rồi đơn giá gần nhất.
  const unitOf = (r: CostRow) => {
    const fixed = imported.get(r.ikey);
    const oq = r.openingQty > 0 ? r.openingQty : 0;
    const ov = r.openingQty > 0 ? r.openingValue : 0;
    const q = oq + r.inQty;
    return q > 0 ? round4((ov + r.inValue) / q) : fixed !== undefined ? round4(fixed) : fallback.get(key(r.group, r.ikey)) ?? 0;
  };
  for (const r of rows.values()) r.unitCost = unitOf(r);
  if (pendingExternal.length) {
    for (const x of pendingExternal) {
      const sender = rows.get(key(x.counterGroup, x.ikey));
      const unit = sender?.unitCost ?? fallback.get(key(x.counterGroup, x.ikey)) ?? 0;
      const r = row(x.group, x.ikey, x.sku);
      r.inQty += x.qty;
      r.inValue += Math.round(x.qty * unit);
      r.d.tInValue += Math.round(x.qty * unit);
    }
    for (const r of rows.values()) r.unitCost = unitOf(r);
  }
  // Hàng tặng khách xuất ra: lấy từ phần quà giá 0 trước (theo ngày chứng từ), hết phần quà mới lấy hàng thường.
  const giftCovered = new Map<string, number>();
  const giftSales = await sql<{ event_id: string; grp: string; ikey: string; qty: string }>`
    SELECT m.event_id::text, ${GRP} AS grp, COALESCE(m.item_id, m.sku) AS ikey, SUM(m.qty) AS qty
      FROM inventory_movements m JOIN branches b ON b.id = m.branch_id ${whJoin(sep)}
     WHERE m.tenant_id = ${tenantId} AND m.kind = 'sale' AND m.is_gift
       AND m.doc_date BETWEEN ${firstDay(p)}::date AND ${lastDay(p)}::date
     GROUP BY m.event_id, 2, 3, m.doc_date HAVING SUM(m.qty) < 0
     ORDER BY m.doc_date, m.event_id`.execute(trx);
  for (const g of giftSales.rows) {
    const r = rows.get(key(g.grp, g.ikey));
    if (!r) continue;
    const avail = r.giftOpening + r.giftIn - r.giftOut;
    const take = Math.min(avail, -Number(g.qty));
    if (take <= 0) continue;
    r.giftOut += take;
    r.outQty -= take; // phần lấy từ quà không phải hàng thường xuất
    giftCovered.set(`${g.event_id}|${g.ikey}`, (giftCovered.get(`${g.event_id}|${g.ikey}`) ?? 0) + take);
  }
  for (const r of rows.values()) r.closingQty += r.openingQty + r.giftOpening;

  // Mã trên dòng giá vốn = mã hiện hành của định danh (mã cũ của tháng trước / trước khi đổi mã không còn xuất hiện).
  const now = await codesNow(trx, tenantId, [...rows.values()].map((r) => r.ikey));
  for (const r of rows.values()) r.sku = now.get(r.ikey) ?? r.sku;
  // Giá nhập lần cuối (đến hết kỳ) theo (nhóm, mặt hàng).
  const lastBuy = await sql<{ grp: string; ikey: string; u: string }>`
    SELECT DISTINCT ON (1, 2) ${GRP} AS grp, COALESCE(m.item_id, m.sku) AS ikey, (m.amount / m.qty) AS u
      FROM inventory_movements m JOIN branches b ON b.id = m.branch_id ${whJoin(sep)}
     WHERE m.tenant_id = ${tenantId} AND m.kind = 'purchase' AND m.amount IS NOT NULL AND m.qty > 0 AND NOT m.exclude_cost AND m.doc_date <= ${lastDay(p)}::date
     ORDER BY 1, 2, m.doc_date DESC, m.id DESC`.execute(trx);
  const lastUnit = new Map(lastBuy.rows.map((x) => [key(x.grp, x.ikey), round4(Number(x.u))]));
  await trx.deleteFrom('inventory_costs').where('tenant_id', '=', tenantId).where('year', '=', p.year).where('month', '=', p.month).execute();
  const values = [...rows.values()]
    .filter((r) => r.openingQty || r.inQty || r.outQty || r.closingQty || r.giftOpening || r.giftIn || imported.has(r.ikey))
    .map((r) => ({
      cost_source: imported.has(r.ikey) ? 'import' : 'computed',
      tenant_id: tenantId,
      cost_group: baseGroup(r.group),
      wh_type: typeOfGroup(r.group),
      year: p.year,
      month: p.month,
      sku: r.sku,
      item_id: isItemId(r.ikey) ? r.ikey : null,
      opening_qty: r.openingQty,
      opening_value: Math.round(r.openingValue),
      in_qty: r.inQty,
      in_value: Math.round(r.inValue),
      unit_cost: r.unitCost,
      out_qty: r.outQty,
      closing_qty: r.closingQty,
      // Phần quà giá 0 nằm trong tồn cuối nhưng không có giá trị.
      gift_qty: round4(Math.max(0, r.giftOpening + r.giftIn - r.giftOut)),
      closing_value: r.closingQty - (r.giftOpening + r.giftIn - r.giftOut) > 0 ? Math.round((r.closingQty - (r.giftOpening + r.giftIn - r.giftOut)) * r.unitCost) : 0,
      detail: JSON.stringify({
        ...r.d,
        openingUnit: r.openingQty > 0 ? round4(r.openingValue / r.openingQty) : r.importUnit ?? 0,
        ...(r.importUnit !== undefined ? { importUnit: r.importUnit } : {}),
        periodUnit: r.inQty > 0 ? round4(r.inValue / r.inQty) : 0,
        lastPurchaseUnit: lastUnit.get(key(r.group, r.ikey)) ?? 0,
      }),
    }));
  for (let i = 0; i < values.length; i += 1000) await trx.insertInto('inventory_costs').values(values.slice(i, i + 1000)).execute();
  return { rows, giftCovered, returnUnits, returnDiffs };
}

/** Các tháng còn thiếu (chưa tính) trước tháng p, kể từ tháng có phát sinh sớm nhất. */
async function missingMonthsBefore(trx: Db, tenantId: string, p: Period): Promise<Period[]> {
  const first = await sql<{ d: string | null }>`
    SELECT MIN(doc_date)::text AS d FROM inventory_movements WHERE tenant_id = ${tenantId}`.execute(trx);
  if (!first.rows[0]?.d) return [];
  const earliest = parsePeriod(first.rows[0].d.slice(0, 7));
  const out: Period[] = [];
  for (let m = prevOf(p); cmp(m, earliest) >= 0; m = prevOf(m)) {
    const has = await trx.selectFrom('inventory_costs').select('id').where('tenant_id', '=', tenantId).where('year', '=', m.year).where('month', '=', m.month).limit(1).executeTakeFirst();
    if (has) break;
    out.unshift(m);
  }
  return out;
}

interface CogsMovement {
  eventId: string;
  branchId: string;
  branchCode: string;
  branchName: string;
  group: string;
  kind: string;
  sku: string;
  /** Khoá mặt hàng (item_id; hoặc mã khi dòng kho chưa có item_id). */
  ikey: string;
  reasonCode: string | null;
  isGift: boolean;
  counterBranchId: string | null;
  counterCode: string | null;
  counterName: string | null;
  counterGroup: string | null;
  qty: number;
  /** Kho của dòng xuất nhập (TK kho theo loại kho). */
  warehouseCode: string;
  /** Mục đích xuất của phiếu điều chỉnh kho (purposeCode trên chứng từ). */
  purposeCode: string | null;
}

async function unvaluedMovements(trx: Db, tenantId: string, p: Period, sep: string[] = []): Promise<CogsMovement[]> {
  const res = await sql<{ event_id: string; branch_id: string; code: string; name: string; grp: string; kind: string; sku: string; ikey: string; reason_code: string | null; is_gift: boolean; counter_branch_id: string | null; ccode: string | null; cname: string | null; cgrp: string | null; qty: string; wh: string; purpose: string | null }>`
    SELECT m.event_id::text, m.branch_id, b.code, b.name, ${GRP} AS grp, m.kind, m.sku, COALESCE(m.item_id, m.sku) AS ikey, m.reason_code, m.is_gift, COALESCE(m.warehouse_code, '') AS wh,
           m.counter_branch_id, cb.code AS ccode, cb.name AS cname,
           CASE WHEN cb.id IS NULL THEN NULL ELSE ${CGRP} END AS cgrp,
           SUM(m.qty) AS qty, NULLIF(ev.payload->>'purposeCode', '') AS purpose
      FROM inventory_movements m
      JOIN branches b ON b.id = m.branch_id
      LEFT JOIN branches cb ON cb.id = m.counter_branch_id
      LEFT JOIN accounting_events ev ON ev.id = m.event_id
      ${whJoin(sep)}
      ${counterWhJoin(sep)}
     WHERE m.tenant_id = ${tenantId} AND m.amount IS NULL
       AND m.kind IN ('sale', 'sale_return', 'transfer_out', 'transfer_in', 'adjust_out', 'adjust_in')
       AND m.doc_date BETWEEN ${firstDay(p)}::date AND ${lastDay(p)}::date
     GROUP BY m.event_id, m.branch_id, b.code, b.name, 5, m.kind, m.sku, 8, m.reason_code, m.is_gift, 11, m.counter_branch_id, cb.code, cb.name, 15, 17
     HAVING SUM(m.qty) <> 0`.execute(trx);
  return res.rows.map((r) => ({ eventId: r.event_id, branchId: r.branch_id, branchCode: r.code, branchName: r.name, group: r.grp, kind: r.kind, sku: r.sku, ikey: r.ikey, reasonCode: r.reason_code, isGift: r.is_gift, counterBranchId: r.counter_branch_id, counterCode: r.ccode, counterName: r.cname, counterGroup: r.cgrp, qty: Number(r.qty), warehouseCode: r.wh, purposeCode: r.purpose }));
}

export interface CostingResult {
  /** [2026-11-17] Lần tính giá vốn đã lưu (mỗi chi nhánh một lần). */
  runIds?: string[];
  period: string;
  monthsComputed: string[];
  items: number;
  /** status/docNo/total: phiếu GV tháng (phần còn lại); filled/filledTotal: số cặp dòng chờ giá vốn đã ghi đè, tổng tiền sau ghi đè. */
  branches: { branchCode: string; status: 'posted' | 'empty'; docNo?: string; total: number; filled: number; filledTotal: number }[];
  total: number;
  /** Tháng có dùng giá nhập từ Excel: số mã đã nhập; mã có xuất trong tháng mà không có trong tệp (đang tính bình quân). */
  imported: { count: number; missing: string[]; missingCount: number } | null;
}

/** Một dòng bảng giá vốn nhập từ Excel. */
export interface CostImportRow { sku: string; unitCost: number; name?: string }

/**
 * [2026-11-17 Nguyễn Văn Thủy] Kiểm tra tệp giá vốn bình quân đầu kỳ (không ghi): từng dòng — mã có trong danh mục, giá là số ≥ 0;
 * mã lặp nhiều dòng thì dòng sau báo lặp (lấy dòng đầu); mã đã có giá nhập của tháng → "Cập nhật", chưa có → "Thêm mới" (đóng góp)
 */
export async function checkCostImport(auth: AuthContext, period: string, rows: { row: number; sku?: string; name?: string; unitCost?: string | number | null }[]) {
  const p = parsePeriod(period);
  const skus = [...new Set(rows.map((r) => String(r.sku ?? '').trim()).filter(Boolean))];
  const known = new Set(skus.length ? (await sql<{ sku: string }>`SELECT sku FROM products WHERE tenant_id = ${auth.tenantId} AND sku = ANY(${skus}::text[])`.execute(db)).rows.map((r) => r.sku) : []);
  const had = new Set((await sql<{ sku: string }>`SELECT DISTINCT sku FROM inventory_costs WHERE tenant_id = ${auth.tenantId} AND year = ${p.year} AND month = ${p.month} AND cost_source = 'import'`.execute(db)).rows.map((r) => r.sku));
  const seen = new Set<string>();
  const out = rows.map((r) => {
    const sku = String(r.sku ?? '').trim();
    const raw = r.unitCost;
    const n = typeof raw === 'number' ? raw : raw === null || raw === undefined || String(raw).trim() === '' ? NaN : Number(String(raw).replace(/\s/g, ''));
    const errors: string[] = [];
    if (!sku) errors.push('Thiếu mã hàng');
    else if (!known.has(sku)) errors.push(`Mã ${sku} không có trong danh mục mặt hàng`);
    if (!Number.isFinite(n)) errors.push('Giá vốn không phải số');
    else if (n < 0) errors.push('Giá vốn âm');
    if (sku && seen.has(sku)) errors.push('Mã lặp — lấy dòng đầu');
    if (sku) seen.add(sku);
    return { row: r.row, sku, action: (errors.length ? 'error' : had.has(sku) ? 'update' : 'create') as 'create' | 'update' | 'error', errors, values: { sku, name: r.name ?? '', unitCost: Number.isFinite(n) ? String(n) : String(raw ?? '') } };
  });
  return { created: out.filter((x) => x.action === 'create').length, updated: out.filter((x) => x.action === 'update').length, failed: out.filter((x) => x.action === 'error').length, rows: out };
}

export const costingService = {
  /**
   * Tính giá vốn một tháng và ghi sổ giá vốn hàng xuất.
   * `imported`: bảng giá vốn tháng nhập từ Excel (thay toàn bộ giá đã nhập của tháng; mã trùng lấy giá khác 0 xuất hiện nhiều nhất).
   * `clearImport`: bỏ giá đã nhập, quay về tính bình quân cho mọi mã.
   */
  async run(auth: AuthContext, input: { period: string; imported?: CostImportRow[]; clearImport?: boolean; from?: string; to?: string; costCenter?: string; scope?: { kind: 'node' | 'shop'; code: string }; separateTypes?: string[] }): Promise<CostingResult> {
    return db.transaction().execute((trx) => costingService.runIn(trx, auth, input));
  },

  // [2026-11-03 10:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 6 (action theo lô): đơn giá + ghi sổ giá vốn mọi chi nhánh trong một giao dịch (trước: 2+ giao dịch nối nhau — lỗi ở một chi nhánh
  // để lại đơn giá và các chi nhánh trước đã ghi)
  async runIn(trx: ActionTx, auth: AuthContext, input: { period: string; imported?: CostImportRow[]; clearImport?: boolean; from?: string; to?: string; costCenter?: string; scope?: { kind: 'node' | 'shop'; code: string }; separateTypes?: string[] }): Promise<CostingResult> {
    const p = parsePeriod(input.period);
    // [2026-11-17 Nguyễn Văn Thủy] phạm vi chọn trên cây cơ cấu (nút bất kỳ hoặc một shop): đặt làm điểm tính giá vốn rồi tính (0151) (đóng góp)
    // Công thức: không chọn khi tính — lấy công thức đang áp dụng cho tháng (apply_from lớn nhất <= tháng); chưa có thì mặc định trong mã.
    const fr = (await sql<{ code: string; name: string; options: unknown }>`
      SELECT code, name, options FROM costing_formulas WHERE tenant_id = ${auth.tenantId}
         AND apply_from <> '' AND apply_from <= ${input.period} ORDER BY apply_from DESC LIMIT 1`.execute(trx)).rows[0];
    const formula = formulaOf(fr?.options);
    const formulaInfo = { code: fr?.code ?? 'MD', name: fr?.name ?? 'Mặc định (giá Net)', formula };
    // [2026-11-17 Nguyễn Văn Thủy] loại kho tính giá vốn riêng (bỏ chọn ở ô Loại kho tính chung) (đóng góp)
    // [2026-11-20 kiennt] NT-KHO-004 — loại kho không thuộc sở hữu (giữ hộ) luôn tính riêng: tồn giữ hộ (giá trị 0) không kéo đơn giá kho của đơn vị (đóng góp)
    const sep = [...new Set([...(input.separateTypes ?? []), ...(await loaiKhoGiuHo(trx, auth.tenantId))].map((x) => x.trim().toUpperCase()).filter(Boolean))].sort();
    if (input.scope) {
      const r = await sql<{ code: string | null }>`SELECT bizcity_set_cost_scope(${auth.tenantId}, ${input.scope.kind}, ${input.scope.code}) AS code`.execute(trx);
      const code = r.rows[0]?.code;
      if (!code) throw Errors.validation(`Không đặt được phạm vi tính giá vốn ${input.scope.code}`);
      input = { ...input, costCenter: code };
    }
    // Khoảng ngày chứng từ được cập nhật giá vốn: trong tháng đang tính (giá vốn là giá của tháng), mặc định cả tháng.
    const from = input.from ?? firstDay(p);
    const to = input.to ?? lastDay(p);
    if (from < firstDay(p) || to > lastDay(p) || from > to) throw Errors.validation(`Khoảng ngày cập nhật phải nằm trong tháng ${label(p)} (từ ${firstDay(p)} đến ${lastDay(p)})`);
    let imports: Map<string, number> | undefined;
    if (input.clearImport) imports = new Map();
    else if (input.imported?.length) {
      // Một mã lặp nhiều dòng (tệp xuất từ thẻ kho: mỗi lần nhập / xuất một dòng): lấy giá khác 0 xuất hiện NHIỀU NHẤT
      // (bằng nhau thì giá gặp sau); mã chỉ có giá 0 thì giá 0.
      const votes = new Map<string, Map<number, number>>();
      for (const r of input.imported) {
        const sku = r.sku.trim();
        if (!sku || !Number.isFinite(r.unitCost) || r.unitCost < 0) continue;
        const v = votes.get(sku) ?? new Map<number, number>();
        const k = round4(r.unitCost) || -1; // -1: giá 0
        const n = (v.get(k) ?? 0) + 1;
        v.delete(k); // đưa xuống cuối: bằng số lần thì giá gặp sau thắng
        v.set(k, n);
        votes.set(sku, v);
      }
      imports = new Map();
      for (const [sku, v] of votes) {
        let best = 0;
        let bestN = 0;
        for (const [unit, n] of v) if (unit > 0 && n >= bestN) { best = unit; bestN = n; }
        imports.set(sku, best);
      }
      if (!imports.size) throw Errors.validation('Tệp không có dòng nào có Mã hàng và Giá vốn hợp lệ');
      // Mã trong tệp → định danh tại ngày cuối tháng (mã cũ của mặt hàng đã đổi mã vẫn nhận ra).
      const ks = await keysOfSkus(db, auth.tenantId, [...imports.keys()], lastDay(p));
      imports = new Map([...imports].map(([sku, unit]) => [ks.get(sku) ?? sku, unit]));
    }
    // Bước 1: đơn giá (một giao dịch, gồm các tháng trước còn thiếu).
    const { units, giftCovered, returnUnits, returnDiffs, months, items, imported } = await sameTx(trx, async (trx) => {
      const months = [...(await missingMonthsBefore(trx, auth.tenantId, p)), p];
      let rows = new Map<string, CostRow>();
      let giftCovered = new Map<string, number>();
      let returnUnits = new Map<string, number>();
      let returnDiffs = new Map<string, number>();
      for (const m of months) ({ rows, giftCovered, returnUnits, returnDiffs } = await computeMonth(trx, auth.tenantId, m, m === p ? imports : undefined, formula, sep));
      const fixed = imports ?? (await importedUnits(trx, auth.tenantId, p));
      let imported: CostingResult['imported'] = null;
      if (fixed.size) {
        const missing = [...new Set([...rows.values()].filter((r) => r.outQty > 0 && !fixed.has(r.ikey)).map((r) => r.sku))].sort();
        imported = { count: fixed.size, missing: missing.slice(0, 50), missingCount: missing.length };
      }
      if (imports) await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: input.clearImport ? 'costing.import.clear' : 'costing.import', objectType: 'period', objectId: label(p), after: { skus: imports.size } });
      return { units: new Map([...rows].map(([k, r]) => [k, r.unitCost])), giftCovered, returnUnits, returnDiffs, months: months.map(label), items: rows.size, imported };
    });

    // Bước 2: ghi sổ giá vốn từng chi nhánh, mỗi chi nhánh một giao dịch.
    const movements = await unvaluedMovements(trx, auth.tenantId, p, sep);
    const byBranch = new Map<string, CogsMovement[]>();
    for (const m of movements) byBranch.set(m.branchId, [...(byBranch.get(m.branchId) ?? []), m]);
    // Chi nhánh đã có chứng từ giá vốn tháng này mà nay không còn gì để ghi: vẫn chạy để đảo bút toán cũ.
    // Mẫu khớp cả khoá mới (cogs:<chi nhánh>:<kỳ>) lẫn khoá cũ (cogs:<internal|tax>:<chi nhánh>:<kỳ>).
    const prior = await trx.selectFrom('accounting_events as d').innerJoin('branches as b', 'b.id', 'd.branch_id')
      .select(['d.branch_id', 'b.code', 'b.name']).where('d.tenant_id', '=', auth.tenantId).where('d.doc_type', '=', 'cogs')
      .where('d.doc_key', 'like', `cogs:%:${label(p)}`).where('d.status', '=', 'posted').execute();
    for (const r of prior) if (!byBranch.has(r.branch_id)) byBranch.set(r.branch_id, []);
    // Chi nhánh có dòng chờ giá vốn đã có số tiền mà nay không còn hàng cần định giá: vẫn chạy để đưa về 0.
    const slotBranches = await sql<{ branch_id: string; code: string; name: string }>`
      SELECT DISTINCT l.branch_id::text, b.code, b.name FROM ledger_lines l JOIN branches b ON b.id = l.branch_id
       WHERE l.tenant_id = ${auth.tenantId} AND l.cost_fill IS NOT NULL AND (l.debit <> 0 OR l.credit <> 0)
         AND l.posting_date BETWEEN ${firstDay(p)}::date AND ${lastDay(p)}::date`.execute(trx);
    for (const r of slotBranches.rows) if (!byBranch.has(r.branch_id)) byBranch.set(r.branch_id, []);
    const branchInfo = new Map([...prior, ...slotBranches.rows].map((r) => [r.branch_id, { code: r.code, name: r.name }]));
    for (const m of movements) branchInfo.set(m.branchId, { code: m.branchCode, name: m.branchName });
    // Chênh lệch hàng trả NCC: chia cho các chi nhánh có phiếu trả của mã đó theo tiền trên phiếu (chi nhánh cuối nhận phần lẻ).
    const diffsByBranch = new Map<string, ReturnDiffLine[]>();
    if (returnDiffs.size) {
      const rr = await sql<{ branch_id: string; code: string; name: string; grp: string; ikey: string; sku: string; amount: string }>`
        SELECT m.branch_id::text, b.code, b.name, ${GRP} AS grp, COALESCE(m.item_id, m.sku) AS ikey, MAX(m.sku) AS sku, SUM(-m.amount) AS amount
          FROM inventory_movements m JOIN branches b ON b.id = m.branch_id ${whJoin(sep)}
         WHERE m.tenant_id = ${auth.tenantId} AND m.kind = 'purchase_return' AND m.qty <> 0
           AND m.doc_date BETWEEN ${firstDay(p)}::date AND ${lastDay(p)}::date
         GROUP BY 1, 2, 3, 4, 5 ORDER BY 4, 5, 1`.execute(trx);
      const byKey = new Map<string, typeof rr.rows>();
      for (const x of rr.rows) byKey.set(key(x.grp, x.ikey), [...(byKey.get(key(x.grp, x.ikey)) ?? []), x]);
      for (const [k, diff] of returnDiffs) {
        const list = byKey.get(k) ?? [];
        const sum = list.reduce((s, x) => s + Number(x.amount), 0);
        let left = diff;
        list.forEach((x, i) => {
          const part = i === list.length - 1 ? left : sum ? Math.round((diff * Number(x.amount)) / sum) : 0;
          left -= part;
          if (!part) return;
          branchInfo.set(x.branch_id, { code: x.code, name: x.name });
          if (!byBranch.has(x.branch_id)) byBranch.set(x.branch_id, []);
          diffsByBranch.set(x.branch_id, [...(diffsByBranch.get(x.branch_id) ?? []), { sku: x.sku, amount: part }]);
        });
      }
    }

    // [2026-11-17 Nguyễn Văn Thủy] chọn chi nhánh trên Cơ cấu tổ chức: đơn giá vẫn tính chung một lượt (chuyển hàng giữa chi nhánh khớp giá),
    // chỉ ra phiếu giá vốn cho shop thuộc chi nhánh đã chọn (đóng góp)
    if (input.costCenter) {
      const keep = new Set((await sql<{ id: string }>`SELECT b.id::text FROM branches b JOIN accounting_units u ON u.id = b.accounting_unit_id
        WHERE b.tenant_id = ${auth.tenantId} AND u.code = ${input.costCenter}`.execute(trx)).rows.map((r) => r.id));
      if (!keep.size) throw Errors.validation(`Chi nhánh ${input.costCenter} chưa có shop nào trên Cơ cấu tổ chức`);
      for (const id of [...byBranch.keys()]) if (!keep.has(String(id))) byBranch.delete(id);
    }
    const branches: CostingResult['branches'] = [];
    for (const [branchId, list] of byBranch) {
      const info = branchInfo.get(branchId)!;
      branches.push(await sameTx(trx, (trx) => postBranch(trx, auth, { period: p, from, to, branchId, branchCode: info.code, units, giftCovered, returnUnits, movements: list, returnDiffs: diffsByBranch.get(branchId) ?? [] })));
    }
    branches.sort((a, b) => a.branchCode.localeCompare(b.branchCode));
    const runIds = await recordRuns(trx, auth, { p, from, to, costCenter: input.costCenter, branches, imported: imported?.count ?? 0, formula: formulaInfo, separateTypes: sep });
    return { runIds, period: label(p), monthsComputed: months, items, branches, total: fromCents(branches.reduce((s, b) => s + toCents(b.total) + toCents(b.filledTotal), 0)), imported };
  },

  /** Bảng đơn giá vốn của một tháng. */
  async list(auth: AuthContext, q: { period: string; search?: string }) {
    const p = parsePeriod(q.period);
    const rows = await sql<{ cost_group: string; unit_code: string | null; unit_name: string | null; sku: string; item_id: string | null; name: string | null; opening_qty: string; opening_value: string; in_qty: string; in_value: string; unit_cost: string; out_qty: string; closing_qty: string; closing_value: string; gift_qty: string; cost_source: string }>`
      SELECT c.cost_group::text, u.code AS unit_code, u.name AS unit_name, c.sku, c.item_id,
             (SELECT m.name FROM inventory_movements m WHERE m.tenant_id = c.tenant_id AND m.name <> ''
               AND ((c.item_id IS NOT NULL AND m.item_id = c.item_id) OR (c.item_id IS NULL AND m.sku = c.sku)) ORDER BY m.doc_date DESC LIMIT 1) AS name,
             c.opening_qty, c.opening_value, c.in_qty, c.in_value, c.unit_cost, c.out_qty, c.closing_qty, c.closing_value, c.gift_qty, c.cost_source, c.detail, c.wh_type
        FROM inventory_costs c
        LEFT JOIN accounting_units u ON u.id = c.cost_group
       WHERE c.tenant_id = ${auth.tenantId} AND c.year = ${p.year} AND c.month = ${p.month}
         ${q.search ? sql`AND c.sku ILIKE ${'%' + q.search + '%'}` : sql``}
       ORDER BY c.cost_group, c.sku, c.wh_type`.execute(db);
    return rows.rows.map((r) => ({
      costGroup: r.unit_code ?? '(chưa gán đơn vị)',
      costGroupName: r.unit_name ?? '',
      sku: r.sku,
      itemId: r.item_id,
      name: r.name ?? '',
      openingQty: Number(r.opening_qty),
      openingValue: Number(r.opening_value),
      inQty: Number(r.in_qty),
      inValue: Number(r.in_value),
      unitCost: Number(r.unit_cost),
      outQty: Number(r.out_qty),
      closingQty: Number(r.closing_qty),
      closingValue: Number(r.closing_value),
      /** Tồn quà KM người tiêu dùng (giá 0) nằm trong tồn cuối. */
      giftQty: Number(r.gift_qty),
      costSource: r.cost_source as 'computed' | 'import',
      /** Loại kho tính giá riêng; rỗng = tính chung. */
      whType: (r as unknown as { wh_type?: string }).wh_type ?? '',
      detail: (r as unknown as { detail?: Record<string, number> }).detail ?? {},
    }));
  },
};

// [2026-11-17 Nguyễn Văn Thủy] lưu LẦN TÍNH GIÁ VỐN theo chi nhánh (0150): mốc cơ cấu (id + uid của nút), kỳ, khoảng ngày, tổng, phiếu,
// bảng đơn giá các mã của chi nhánh tại lần tính (đóng góp)
async function recordRuns(trx: Db, auth: AuthContext, a: { p: Period; from: string; to: string; costCenter?: string; branches: CostingResult['branches']; imported: number; formula: { code: string; name: string; formula: CostFormula }; separateTypes: string[] }): Promise<string[]> {
  const centers = (await sql<{ id: string; code: string; name: string; org_unit_id: string | null; org_uid: string | null }>`
    SELECT u.id::text, u.code, u.name, u.org_unit_id::text, COALESCE(o.uid, sb.uid) AS org_uid FROM accounting_units u LEFT JOIN org_units o ON o.id = u.org_unit_id LEFT JOIN branches sb ON sb.id = u.branch_id
     WHERE u.tenant_id = ${auth.tenantId}
       AND ${a.costCenter ? sql`u.code = ${a.costCenter}` : sql`EXISTS (SELECT 1 FROM inventory_costs c WHERE c.tenant_id = u.tenant_id AND c.cost_group = u.id AND c.year = ${a.p.year} AND c.month = ${a.p.month})`}`.execute(trx)).rows;
  const shop = new Map((await sql<{ code: string; unit: string | null }>`SELECT b.code, b.accounting_unit_id::text AS unit FROM branches b WHERE b.tenant_id = ${auth.tenantId}`.execute(trx)).rows.map((r) => [r.code, r.unit]));
  // Shop chưa gắn cơ cấu / đơn vị hạch toán (nhóm 0): vẫn ghi một lần tính để lịch sử không trống.
  if (!a.costCenter && (await sql`SELECT 1 FROM inventory_costs WHERE tenant_id = ${auth.tenantId} AND cost_group = 0 AND year = ${a.p.year} AND month = ${a.p.month} LIMIT 1`.execute(trx)).rows.length) {
    centers.push({ id: '0', code: '', name: 'Chưa gắn cơ cấu', org_unit_id: null, org_uid: '' });
  }
  const ids: string[] = [];
  for (const ct of centers) {
    const mine = a.branches.filter((b) => (shop.get(b.branchCode) ?? '0') === ct.id);
    const total = fromCents(mine.reduce((s, b) => s + toCents(b.total) + toCents(b.filledTotal), 0));
    const items = Number((await sql<{ n: string }>`SELECT COUNT(*) AS n FROM inventory_costs WHERE tenant_id = ${auth.tenantId} AND cost_group = ${ct.id} AND year = ${a.p.year} AND month = ${a.p.month}`.execute(trx)).rows[0]!.n);
    const vouchers = mine.filter((b) => b.docNo).map((b) => ({ branchCode: b.branchCode, docNo: b.docNo, total: b.total + b.filledTotal }));
    const run = await sql<{ id: string }>`
      INSERT INTO costing_runs (tenant_id, org_unit_id, org_uid, center_code, center_name, year, month, date_from, date_to, items, total, imported, vouchers, run_by, formula_code, formula_name, formula, separate_types)
      VALUES (${auth.tenantId}, ${ct.org_unit_id}, ${ct.org_uid ?? ''}, ${ct.code}, ${ct.name}, ${a.p.year}, ${a.p.month}, ${a.from}::date, ${a.to}::date,
              ${items}, ${total}, ${a.imported}, ${JSON.stringify(vouchers)}::jsonb, ${auth.actorName || auth.actor}, ${a.formula.code}, ${a.formula.name}, ${JSON.stringify(a.formula.formula)}::jsonb, ${a.separateTypes}::text[]) RETURNING id::text`.execute(trx);
    const runId = run.rows[0]!.id;
    await sql`INSERT INTO costing_run_lines (tenant_id, run_id, sku, item_id, opening_qty, opening_value, in_qty, in_value, unit_cost, out_qty, closing_qty, closing_value, gift_qty, cost_source, detail, wh_type)
      SELECT tenant_id, ${runId}::bigint, sku, item_id, opening_qty, opening_value, in_qty, in_value, unit_cost, out_qty, closing_qty, closing_value, COALESCE(gift_qty, 0), cost_source, detail, wh_type
        FROM inventory_costs WHERE tenant_id = ${auth.tenantId} AND cost_group = ${ct.id} AND year = ${a.p.year} AND month = ${a.p.month}`.execute(trx);
    ids.push(runId);
  }
  return ids;
}

export const costingFormulas = {
  async list(auth: AuthContext) {
    const rows = await sql<{ code: string; name: string; options: unknown; apply_from: string; note: string; updated_by: string; updated_at: Date }>`
      SELECT code, name, options, apply_from, note, updated_by, updated_at FROM costing_formulas WHERE tenant_id = ${auth.tenantId}
       ORDER BY apply_from DESC, code`.execute(db);
    return rows.rows.map((r) => ({ code: r.code, name: r.name, options: formulaOf(r.options), applyFrom: r.apply_from, note: r.note, updatedBy: r.updated_by, updatedAt: new Date(r.updated_at).toISOString() }));
  },
  /**
   * [2026-11-17 Nguyễn Văn Thủy] Đổi công thức giá vốn: công thức mới áp dụng TỪ một tháng trở đi (tháng trước giữ công thức cũ).
   * Cần mật khẩu; không áp vào tháng đã khoá sổ (có khoá ở tháng đó hoặc sau). Cùng tháng áp dụng thì thay công thức cũ của tháng đó (đóng góp)
   */
  async saveIn(trx: Db, auth: AuthContext, i: { name: string; options: Partial<CostFormula>; applyFrom: string; password: string; note?: string }) {
    if (i.password !== (process.env.COSTING_FORMULA_PASSWORD || process.env.RESTORE_DEFAULT_PASSWORD || process.env.CATALOG_WIPE_PASSWORD || 'Thuy!@#')) throw Errors.forbidden('Sai mật khẩu đổi công thức giá vốn');
    const y = Number(i.applyFrom.slice(0, 4)), m = Number(i.applyFrom.slice(5, 7));
    const locked = (await sql<{ y: number; m: number }>`
      SELECT p.year AS y, p.month AS m FROM period_locks l JOIN fiscal_periods p ON p.id = l.period_id
       WHERE l.tenant_id = ${auth.tenantId} AND (p.year * 12 + p.month) >= ${y * 12 + m} ORDER BY p.year DESC, p.month DESC LIMIT 1`.execute(trx)).rows[0];
    if (locked) throw Errors.validation(`Tháng ${String(locked.m).padStart(2, '0')}/${locked.y} đã khoá sổ — chỉ áp dụng công thức mới từ tháng sau tháng khoá sổ cuối cùng`);
    const options = formulaOf(i.options);
    const code = `CT${i.applyFrom.replace('-', '')}`;
    await sql`UPDATE costing_formulas SET apply_from = '' WHERE tenant_id = ${auth.tenantId} AND apply_from = ${i.applyFrom} AND code <> ${code}`.execute(trx);
    await sql`INSERT INTO costing_formulas (tenant_id, code, name, options, apply_from, note, updated_by)
      VALUES (${auth.tenantId}, ${code}, ${i.name}, ${JSON.stringify(options)}::jsonb, ${i.applyFrom}, ${i.note ?? ''}, ${auth.actorName || auth.actor})
      ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name, options = EXCLUDED.options, apply_from = EXCLUDED.apply_from, note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = now()`.execute(trx);
    return { code, applyFrom: i.applyFrom, options };
  },
};

export const costingRuns = {
  /** Các lần tính giá vốn của một chi nhánh (hoặc mọi chi nhánh), lọc theo ngày tính. */
  async list(auth: AuthContext, q: { costCenter?: string; from?: string; to?: string }) {
    const rows = await sql<{ id: string; org_uid: string; center_code: string; center_name: string; year: number; month: number; date_from: string; date_to: string; items: number; total: string; imported: number; vouchers: unknown; run_by: string; run_at: Date; formula_code: string; formula_name: string; formula: unknown; separate_types: string[] }>`
      SELECT id::text, org_uid, center_code, center_name, year, month, date_from::text, date_to::text, items, total, imported, vouchers, run_by, run_at, formula_code, formula_name, formula, separate_types FROM costing_runs
       WHERE tenant_id = ${auth.tenantId} ${q.costCenter ? sql`AND center_code = ${q.costCenter}` : sql``}
         ${q.from ? sql`AND run_at >= ${q.from}::date` : sql``} ${q.to ? sql`AND run_at < ${q.to}::date + 1` : sql``}
       ORDER BY run_at DESC LIMIT 500`.execute(db);
    return rows.rows.map((r) => ({ id: r.id, orgUid: r.org_uid, centerCode: r.center_code, centerName: r.center_name, period: `${r.year}-${String(r.month).padStart(2, '0')}`,
      from: r.date_from, to: r.date_to, items: r.items, total: Number(r.total), imported: r.imported, vouchers: r.vouchers, runBy: r.run_by, runAt: new Date(r.run_at).toISOString(), formulaCode: r.formula_code, formulaName: r.formula_name, formula: formulaOf(r.formula), separateTypes: r.separate_types ?? [] }));
  },
  /** Bảng đơn giá các mã hàng của một lần tính. */
  async lines(auth: AuthContext, id: string) {
    const rows = await sql<{ sku: string; item_id: string | null; name: string | null; opening_qty: string; opening_value: string; in_qty: string; in_value: string; unit_cost: string; out_qty: string; closing_qty: string; closing_value: string; gift_qty: string; cost_source: string; detail: Record<string, number>; wh_type: string }>`
      SELECT l.wh_type, l.sku, l.item_id, p.name, l.opening_qty, l.opening_value, l.in_qty, l.in_value, l.unit_cost, l.out_qty, l.closing_qty, l.closing_value, l.gift_qty, l.cost_source, l.detail
        FROM costing_run_lines l LEFT JOIN products p ON p.tenant_id = l.tenant_id AND p.sku = l.sku
       WHERE l.tenant_id = ${auth.tenantId} AND l.run_id = ${id}::bigint ORDER BY l.sku, l.wh_type`.execute(db);
    return rows.rows.map((r) => ({ sku: r.sku, itemId: r.item_id, name: r.name ?? '', openingQty: Number(r.opening_qty), openingValue: Number(r.opening_value), inQty: Number(r.in_qty), inValue: Number(r.in_value),
      unitCost: Number(r.unit_cost), outQty: Number(r.out_qty), closingQty: Number(r.closing_qty), closingValue: Number(r.closing_value), giftQty: Number(r.gift_qty), costSource: r.cost_source, detail: r.detail ?? {}, whType: r.wh_type }));
  },
};

async function postBranch(
  trx: Db,
  auth: AuthContext,
  a: { period: Period; from: string; to: string; branchId: string; branchCode: string; units: Map<string, number>; giftCovered: Map<string, number>; returnUnits: Map<string, number>; movements: CogsMovement[]; returnDiffs: ReturnDiffLine[] },
): Promise<CostingResult['branches'][number]> {
  // Khoá cũ là cogs:<internal|tax>:<chi nhánh>:<kỳ>; nay một sổ kế toán: cogs:<chi nhánh>:<kỳ>.
  const docKey = `cogs:${a.branchCode}:${label(a.period)}`;
  const existing = await eventStore.lock(trx, auth.tenantId, docKey);
  const cfg = await postingConfigRepository.loadPostingConfig(trx, auth.tenantId, [...new Set([...a.movements.map((m) => m.sku), ...a.returnDiffs.map((d) => d.sku)])], { asOf: lastDay(a.period), actor: auth.actor });
  const reversed = existing ? await eventStore.reverseActive(trx, auth, existing.id, cfg.accounts, 'Tính lại giá vốn') : 0;
  // Chứng từ giá vốn khoá cũ còn hiệu lực: đảo bút toán và huỷ, để không ghi trùng với chứng từ khoá mới.
  for (const legacyKey of ['internal', 'tax'].map((x) => `cogs:${x}:${a.branchCode}:${label(a.period)}`)) {
    const legacy = await eventStore.lock(trx, auth.tenantId, legacyKey);
    if (!legacy || legacy.status === 'cancelled') continue;
    const n = await eventStore.reverseActive(trx, auth, legacy.id, cfg.accounts, 'Tính lại giá vốn');
    await eventStore.cancel(trx, auth, legacy, { message: 'Thay bằng chứng từ giá vốn khoá mới', reversed: n });
  }

  // Dòng chờ giá vốn còn sót trên phiếu định khoản trước 22/10/2026 (bút toán còn hiệu lực, có số tiền): đưa về 0 —
  // giá vốn nay nằm hết trong phiếu giá vốn tháng, để nguyên là tính trùng.
  const slotRows = await sql<{ entry_id: string; pair_no: number }>`
    SELECT l.entry_id::text, l.pair_no
      FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
     WHERE l.tenant_id = ${auth.tenantId} AND l.branch_id = ${a.branchId} AND l.cost_fill = 'debit' AND l.debit <> 0
       AND l.posting_date BETWEEN ${firstDay(a.period)}::date AND ${lastDay(a.period)}::date
       AND e.status = 'posted' AND NOT e.is_reversal`.execute(trx);

  const resolver = new AccountResolver(cfg);
  const b = new EntryBuilder();
  const partnerCache = new Map<string, string>();
  const branchPartner = async (code: string, name: string) => {
    if (!partnerCache.has(code)) partnerCache.set(code, await partnerRepository.upsert(trx, auth.tenantId, { code: `CN-${code}`, name: name || `Chi nhánh ${code}` }, 'internal'));
    return partnerCache.get(code)!;
  };
  const reasonFor = (code: string | null, fallbackKey: string) => (code && cfg.reasons.has(code) ? cfg.reasons.get(code)! : resolver.reason(undefined, fallbackKey));
  const own = await branchPartner(a.branchCode, '');

  for (const m of a.movements) {
    // Chuyển đến: định giá theo nhóm GỬI để tài khoản hàng đang chuyển của hai bên triệt tiêu nhau.
    const unitGroup = m.kind === 'transfer_in' && m.counterGroup !== null ? m.counterGroup : m.group;
    // Khách trả hàng khác tháng bán gốc: đơn giá hoàn đã tính ở computeMonth (PHASE-032 B3).
    const unit = (m.kind === 'sale_return' ? a.returnUnits.get(`${m.eventId}|${m.ikey}`) : undefined) ?? a.units.get(key(unitGroup, m.ikey)) ?? 0;
    // Hàng tặng khách lấy từ phần quà KM người tiêu dùng: giá vốn 0 cho phần đó.
    const fromGift = m.kind === 'sale' && m.isGift && m.qty < 0 ? Math.min(Math.abs(m.qty), a.giftCovered.get(`${m.eventId}|${m.ikey}`) ?? 0) : 0;
    const amount = Math.round((Math.abs(m.qty) - fromGift) * unit);
    if (!amount) continue;
    // Mỗi dòng mang mã hàng → phiếu giá vốn liệt kê từng mã (EntryBuilder gộp theo mã × cặp tài khoản). Mã = mã TẠI NGÀY của
    // dòng kho (ảnh chụp); dòng sổ cái gắn item_id theo mã đó (0066) nên vẫn về đúng định danh.
    const productSku = m.sku;
    const group = resolver.groupForSku(m.sku);
    // [2026-11-13 Nguyễn Văn Thủy] TK kho theo loại kho của kho xuất / nhập (ưu tiên hơn TK kho của quy tắc) (đóng góp)
    const wh = resolver.warehouseAccount(m.warehouseCode, a.branchCode);
    const inventory = wh ?? group.inventory_account;
    const out = m.qty < 0;
    const lockInv = (debitIsInventory: boolean) => (wh ? (debitIsInventory ? { whDebit: true } : { whCredit: true }) : {});
    switch (m.kind) {
      case 'sale':
      case 'sale_return': {
        const reason = reasonFor(m.reasonCode, m.kind);
        const cogs = resolver.cogsAccount(reason, group, m.isGift);
        const tags = { biz: m.kind, reason: m.reasonCode, gift: m.isGift, ...lockInv(!out) };
        if (out) b.add({ tags, part: 'cogs', productSku, debitAccount: cogs, creditAccount: inventory, amount, description: m.isGift ? 'Giá vốn hàng khuyến mãi' : 'Giá vốn hàng bán' });
        else b.add({ tags, part: 'cogs', productSku, debitAccount: inventory, creditAccount: cogs, amount, description: 'Nhập lại kho hàng khách trả' });
        break;
      }
      case 'transfer_out':
      case 'transfer_in': {
        // Cùng đơn vị hạch toán (khác loại kho tính riêng vẫn là cùng đơn vị): qua hàng đang chuyển.
        const same = m.counterGroup === null || baseGroup(m.counterGroup) === baseGroup(m.group);
        const transit = same
          ? resolver.counterOr(undefined, 'goods_in_transit', 'tài khoản hàng đang chuyển giữa các chi nhánh')
          : resolver.counterOr(undefined, 'internal_receivable_goods', 'tài khoản phải thu nội bộ hàng', 'internal_receivable');
        const other = m.counterCode ? await branchPartner(m.counterCode, m.counterName ?? '') : own;
        const tags = { biz: 'transfer', reason: m.reasonCode, leg: m.kind === 'transfer_out' ? 'out' as const : 'in' as const, sameUnit: same, ...lockInv(m.kind === 'transfer_in') };
        if (m.kind === 'transfer_out') b.add({ tags, part: 'goods', productSku, debitAccount: transit, creditAccount: inventory, amount, debitPartnerId: other, description: 'Xuất chuyển kho (theo giá vốn)' });
        else b.add({ tags, part: 'goods', productSku, debitAccount: inventory, creditAccount: transit, amount, creditPartnerId: other, description: 'Nhập chuyển kho (theo giá vốn)' });
        break;
      }
      case 'adjust_out':
      case 'adjust_in': {
        const increase = m.kind === 'adjust_in';
        // [2026-11-15 Nguyễn Văn Thủy] TK đối ứng theo Mục đích xuất của phiếu, không có thì thừa / thiếu chờ xử lý (đóng góp)
        const counter = m.purposeCode ? resolver.purposeAccount(m.purposeCode, increase)
          : increase ? resolver.counterOr(undefined, 'stock_surplus', 'tài khoản hàng thừa chờ xử lý') : resolver.counterOr(undefined, 'stock_shortage', 'tài khoản hàng thiếu chờ xử lý');
        const tags = { biz: increase ? 'stock_increase' : 'stock_decrease', reason: m.reasonCode, ...lockInv(increase) };
        if (increase) b.add({ tags, part: 'goods', productSku, debitAccount: inventory, creditAccount: counter, amount, creditPartnerId: own, description: 'Điều chỉnh tăng kho (theo giá vốn)' });
        else b.add({ tags, part: 'goods', productSku, debitAccount: counter, creditAccount: inventory, amount, debitPartnerId: own, description: 'Điều chỉnh giảm kho (theo giá vốn)' });
        break;
      }
    }
  }
  // [2026-11-17 Nguyễn Văn Thủy] chênh lệch hàng trả NCC: tồn kho trên sổ đã giảm theo tiền trên phiếu trả, đưa về đúng giá trị trừ khỏi công thức (đóng góp)
  for (const d of a.returnDiffs) {
    const acc = resolver.counterOr(undefined, 'purchase_return_diff', 'tài khoản chênh lệch hàng trả nhà cung cấp');
    const inventory = resolver.groupForSku(d.sku).inventory_account;
    const tags = { biz: 'purchase_return_diff', reason: null };
    if (d.amount > 0) b.add({ tags, part: 'goods', productSku: d.sku, debitAccount: inventory, creditAccount: acc, amount: d.amount, description: 'Chênh lệch hàng trả nhà cung cấp (giá trả lớn hơn giá trị tính giá vốn)' });
    else b.add({ tags, part: 'goods', productSku: d.sku, debitAccount: acc, creditAccount: inventory, amount: -d.amount, description: 'Chênh lệch hàng trả nhà cung cấp (giá trả nhỏ hơn giá trị tính giá vốn)' });
  }
  resolver.assertComplete();

  // Dòng chờ cũ về 0 (giá vốn đã nằm trong phiếu giá vốn tháng).
  const overwrite = slotRows.rows.map((r) => ({ entryId: r.entry_id, pairNo: Number(r.pair_no), amount: 0 }));
  const filled = overwrite.length ? await eventStore.overwriteCostPairs(trx, auth.tenantId, overwrite, cfg.accounts) : 0;
  const filledTotal = 0;
  if (filled) await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'costing.clear_slots', objectType: 'branch', objectId: `${a.branchCode}:${label(a.period)}`, after: { pairs: filled } });

  const lines = stripPairTags(b.toLines());
  // Đối tượng chỉ giữ ở phía tài khoản theo dõi đối tượng.
  for (const l of lines) {
    const acc = cfg.accounts.get(l.accountCode);
    if (!acc || !(acc.track_partner || acc.is_debt || acc.normal_side === 'both')) l.partnerId = null;
  }

  const p = a.period;
  if (!lines.length) {
    if (existing) await eventStore.cancel(trx, auth, existing, { message: 'Tính lại giá vốn: không còn hàng xuất cần định giá', reversed });
    return { branchCode: a.branchCode, status: 'empty', total: 0, filled, filledTotal };
  }
  const total = fromCents(lines.reduce((s, l) => s + toCents(l.debit), 0));
  const docNo = `GV ${String(p.month).padStart(2, '0')}/${p.year} ${a.branchCode}`;
  const description = `Giá vốn hàng xuất tháng ${String(p.month).padStart(2, '0')}/${p.year}`;
  const ev = await eventStore.saveVersion(trx, auth, existing, {
    docKey, docType: 'cogs', docNo,
    fields: { branch_id: a.branchId, doc_date: lastDay(p), total, payload: JSON.stringify({ period: label(p), branchCode: a.branchCode, description, method: 'binh-quan-thang' }) },
  });
  const version = ev.version;
  const entry = await eventStore.post(trx, auth, ev, { branchId: a.branchId, docType: 'cogs', docNo, docDate: lastDay(p), postingDate: lastDay(p), description, lines, policyVersion: cfg.policyVersion }, cfg.accounts);
  await eventStore.markPosted(trx, auth, { ...ev, docKey, docType: 'cogs', docNo, entryIds: [entry.id], reversed, total, policyVersion: cfg.policyVersion });
  await writeAudit(trx, { tenantId: auth.tenantId, actor: auth.actor, action: 'costing.run', objectType: 'source_document', objectId: docKey, after: { version, total } });
  return { branchCode: a.branchCode, status: 'posted', docNo, total, filled, filledTotal };
}
