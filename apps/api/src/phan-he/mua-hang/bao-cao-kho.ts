/**
 * BÁO CÁO KHO của phân hệ mua hàng (đọc inventory_movements — sổ kho của mọi nghiệp vụ, không phụ thuộc hệ thống bán hàng):
 *
 *   stockLedgerBySku   MH24 Sổ kho theo mặt hàng — mỗi mã một dòng, số lượng theo từng LUỒNG trong kỳ:
 *     tồn đầu · nhập (nhập mua) · nhập lại (khách trả lại) · nhập nội bộ (chiều nhận chuyển kho) · xuất nội bộ (chiều xuất chuyển kho)
 *     · xuất bán · xuất trả (trả NCC) · xuất điều chỉnh (phiếu xuất điều chỉnh của cửa hàng, sale + sourceRef export_adjust)
 *     · SL điều chỉnh ± (cân tồn / kiểm kê: phiếu điều chỉnh kho, giữ dấu) · khác (phát sinh ngoài các luồng trên, vd nhận / xuất
 *     quà từ phân hệ mua hàng — luôn cộng vào để sổ cân) · tồn cuối.
 *     tồn cuối = tồn đầu + nhập + nhập lại + nhập nội bộ − xuất nội bộ − xuất bán − xuất trả − xuất điều chỉnh + SL điều chỉnh + khác.
 *
 *   stockOnHandBySku   MH25 Tồn kho theo mặt hàng — mỗi (kho, mã) một dòng tại ngày `to`: số lượng, đơn giá (giá trị ÷ SL theo giá
 *     vốn bình quân / giá trị chứng từ), thành tiền, SL đi đường (đã xuất chuyển đến chi nhánh, chưa nhận — tính vào kho mặc định
 *     của chi nhánh nhận), tồn max / min theo kho (stock_levels), SL cần nhập = tồn max − số lượng (âm = đang dư).
 *
 * Kho của dòng: mã kho ghi trên dòng, trống = kho mặc định của chi nhánh. Lọc kho như ACC83 (warehouseScope).
 */
import { sql } from 'kysely';
import { toNumber, type Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { valuedMovements } from '../../modules/inventory/inventory-report.service.js';
import { warehouseScope } from '../../modules/warehouses/warehouse.routes.js';
import { unitsOf } from './gia-mua.js';
import { inTransitRows } from './ton-max.js';

interface Filter { from?: string; to: string; branchCodes?: string[]; warehouseCodes?: string[]; search?: string }

/**
 * Phạm vi lọc. Tích hết chi nhánh / hết kho của các chi nhánh đã chọn = KHÔNG lọc (null): gửi xuống 443 chi nhánh / 831 mã kho
 * chỉ làm truy vấn chậm đi mà kết quả y hệt.
 */
async function scopeOf(trx: Db, tenantId: string, f: Filter) {
  let branchIds: string[] | null = null;
  if (f.branchCodes?.length) {
    const all = await trx.selectFrom('branches').select(['id', 'code']).where('tenant_id', '=', tenantId).execute();
    const want = new Set(f.branchCodes);
    branchIds = all.filter((b) => want.has(b.code)).map((b) => String(b.id));
    if (!branchIds.length) throw Errors.validation('Chi nhánh không tồn tại');
    if (branchIds.length === all.length) branchIds = null;
  }
  let wh = await warehouseScope(tenantId, f.warehouseCodes);
  if (wh) {
    let q = trx.selectFrom('warehouses').select('code').where('tenant_id', '=', tenantId);
    if (branchIds) q = q.where('branch_id', 'in', branchIds);
    const picked = new Set(wh.codes);
    if ((await q.execute()).every((w) => picked.has(w.code))) wh = null;
  }
  return { branchIds, wh };
}

/** Điều kiện lọc dòng kho dùng chung cho hai báo cáo (alias bảng inventory_movements là m). */
function movementWhere(tenantId: string, to: string, s: Awaited<ReturnType<typeof scopeOf>>, search?: string) {
  return sql`m.tenant_id = ${tenantId} AND m.doc_date <= ${to}::date
       ${s.branchIds ? sql`AND m.branch_id = ANY(${s.branchIds}::bigint[])` : sql``}
       ${s.wh ? sql`AND (m.warehouse_code = ANY(${s.wh.codes}::text[]) OR (m.warehouse_code = '' AND m.branch_id = ANY(${s.wh.defaultBranchIds}::bigint[])))` : sql``}
       ${search ? sql`AND (m.sku ILIKE ${'%' + search + '%'} OR m.name ILIKE ${'%' + search + '%'})` : sql``}`;
}

/** ĐVT nhỏ nhất (tỉ lệ 1) của từng mã; chưa khai ĐVT thì lấy ĐVT ghi trên sổ kho. */
async function baseUnits(trx: Db, tenantId: string, skus: string[]) {
  const us = skus.length ? await unitsOf(trx, tenantId, skus) : {};
  return (sku: string, fallback: string) => (us[sku] ?? []).find((u) => Number(u.ratio) === 1)?.unit ?? fallback;
}

export async function stockLedgerBySku(trx: Db, tenantId: string, f: Filter & { from: string }) {
  const s = await scopeOf(trx, tenantId, f);
  // Chỉ cần SỐ LƯỢNG: đọc thẳng sổ kho, không nối bảng giá vốn. Nguồn phiếu (xuất điều chỉnh / quà mua hàng) chỉ tra ở các
  // chứng từ bán + điều chỉnh kho TRONG KỲ (tập nhỏ, qua chỉ mục loại + ngày) — không đọc nội dung chứng từ của mọi dòng kho.
  const res = await sql<Record<string, string | null> & { sku: string; name: string; unit: string }>`
    WITH ev AS (
      SELECT e.id, e.payload->'sourceRef'->>'type' AS src
        FROM accounting_events e
       WHERE e.tenant_id = ${tenantId} AND e.doc_type IN ('sale', 'stock_adjustment')
         AND e.doc_date >= ${f.from}::date AND e.doc_date <= ${f.to}::date
         AND e.payload->'sourceRef'->>'type' IN ('export_adjust', 'purchase_document')
    ),
    y AS (
      SELECT m.sku, m.kind, (m.doc_date >= ${f.from}::date) AS p, COALESCE(ev.src, '') AS src,
             SUM(m.qty) AS qty, MAX(m.name) AS name, MAX(m.unit) AS unit
        FROM inventory_movements m
        LEFT JOIN ev ON ev.id = m.event_id AND m.doc_date >= ${f.from}::date
       WHERE ${movementWhere(tenantId, f.to, s, f.search?.trim() || undefined)}
       GROUP BY 1, 2, 3, 4
    )
    SELECT sku, MAX(name) AS name, MAX(unit) AS unit,
           SUM(qty) FILTER (WHERE NOT p) AS ton_dau,
           SUM(qty) FILTER (WHERE p AND kind = 'purchase') AS nhap,
           SUM(qty) FILTER (WHERE p AND kind = 'sale_return') AS nhap_lai,
           SUM(qty) FILTER (WHERE p AND kind = 'transfer_in') AS nhap_nb,
           -SUM(qty) FILTER (WHERE p AND kind = 'transfer_out') AS xuat_nb,
           -SUM(qty) FILTER (WHERE p AND kind = 'sale' AND src <> 'export_adjust') AS xuat_ban,
           -SUM(qty) FILTER (WHERE p AND kind = 'purchase_return') AS xuat_tra,
           -SUM(qty) FILTER (WHERE p AND kind = 'sale' AND src = 'export_adjust') AS xuat_dc,
           SUM(qty) FILTER (WHERE p AND kind IN ('adjust_in', 'adjust_out') AND src <> 'purchase_document') AS dc,
           SUM(qty) FILTER (WHERE p AND NOT (kind IN ('purchase', 'sale_return', 'transfer_in', 'transfer_out', 'sale', 'purchase_return')
                                            OR (kind IN ('adjust_in', 'adjust_out') AND src <> 'purchase_document'))) AS khac,
           SUM(qty) AS ton_cuoi
      FROM y
     GROUP BY sku
     ORDER BY sku`.execute(trx);
  const unitOf = await baseUnits(trx, tenantId, res.rows.map((r) => r.sku));
  const n = (v: string | null | undefined) => (v === null || v === undefined ? 0 : Math.round(toNumber(v) * 10000) / 10000);
  const rows = res.rows.map((r) => ({
    sku: r.sku, name: r.name, unit: unitOf(r.sku, r.unit),
    openQty: n(r.ton_dau), inQty: n(r.nhap), inReturnQty: n(r.nhap_lai), inTransferQty: n(r.nhap_nb), outTransferQty: n(r.xuat_nb),
    saleQty: n(r.xuat_ban), returnQty: n(r.xuat_tra), outAdjustQty: n(r.xuat_dc), adjustQty: n(r.dc), otherQty: n(r.khac), closeQty: n(r.ton_cuoi),
  })).filter((r) => r.openQty || r.closeQty || r.inQty || r.inReturnQty || r.inTransferQty || r.outTransferQty || r.saleQty || r.returnQty || r.outAdjustQty || r.adjustQty || r.otherQty);
  return { from: f.from, to: f.to, rows };
}

export async function stockOnHandBySku(trx: Db, tenantId: string, f: Filter) {
  const s = await scopeOf(trx, tenantId, f);
  const res = await sql<{ branch_id: string; branch_code: string; wh: string; sku: string; name: string; unit: string; qty: string; val: string | null; uncosted: string }>`
    WITH mv AS (${valuedMovements({ tenantId, to: f.to, branchIds: s.branchIds, wh: s.wh, search: f.search?.trim() || undefined })}),
    g AS (
      SELECT mv.branch_id, mv.warehouse_code, mv.sku, MAX(mv.name) AS name, MAX(mv.unit) AS unit, SUM(mv.qty) AS qty, SUM(mv.val) AS val,
             COUNT(*) FILTER (WHERE mv.uncosted) AS uncosted
        FROM mv GROUP BY 1, 2, 3
    )
    SELECT g.branch_id::text AS branch_id, b.code AS branch_code, COALESCE(NULLIF(g.warehouse_code, ''), dw.code, '') AS wh,
           g.sku, MAX(g.name) AS name, MAX(g.unit) AS unit, SUM(g.qty) AS qty, SUM(g.val) AS val, SUM(g.uncosted) AS uncosted
      FROM g
      JOIN branches b ON b.id = g.branch_id
      LEFT JOIN LATERAL (SELECT w.code FROM warehouses w WHERE w.tenant_id = b.tenant_id AND w.branch_id = b.id AND w.is_default ORDER BY w.id LIMIT 1) dw ON true
     GROUP BY g.branch_id, b.code, COALESCE(NULLIF(g.warehouse_code, ''), dw.code, ''), g.sku`.execute(trx);
  // Đi đường: tính vào kho mặc định của chi nhánh nhận — kể cả mã chi nhánh nhận chưa từng có tồn (thêm dòng tồn 0).
  const allBranches = await trx.selectFrom('branches').select(['id', 'code']).where('tenant_id', '=', tenantId).execute();
  const codeOf = new Map(allBranches.map((b) => [String(b.id), b.code]));
  let transitIds = s.branchIds ?? allBranches.map((b) => String(b.id));
  if (s.wh) transitIds = transitIds.filter((id) => s.wh!.defaultBranchIds.map(String).includes(id));
  const transitList = await inTransitRows(trx, tenantId, transitIds, f.to);
  const transit = new Map(transitList.map((t) => [`${t.branchId}|${t.sku}`, t.qty]));
  const seen = new Set(res.rows.map((r) => `${r.branch_id}|${r.sku}`));
  for (const t of transitList) if (!seen.has(`${t.branchId}|${t.sku}`)) res.rows.push({ branch_id: t.branchId, branch_code: codeOf.get(t.branchId) ?? '', wh: '', sku: t.sku, name: '', unit: '', qty: '0', val: '0', uncosted: '0' });
  const skus = [...new Set(res.rows.map((r) => r.sku))];
  const unitOf = await baseUnits(trx, tenantId, skus);
  const prods = new Map((skus.length ? await trx.selectFrom('products').select(['sku', 'name', 'barcode']).where('tenant_id', '=', tenantId).where('sku', 'in', skus).execute() : []).map((p) => [p.sku, p]));
  const branchCodes = [...new Set(res.rows.map((r) => r.branch_code))];
  // Tồn max / min khai theo (chi nhánh, kho, mã); kho trống ở bảng khai = kho mặc định của chi nhánh.
  const defaults = new Map((branchCodes.length ? await trx.selectFrom('warehouses as w').innerJoin('branches as b', 'b.id', 'w.branch_id').select(['b.code', 'w.code as wh'])
    .where('w.tenant_id', '=', tenantId).where('w.is_default', '=', true).where('b.code', 'in', branchCodes).execute() : []).map((r) => [r.code, r.wh]));
  const levels = new Map((branchCodes.length && skus.length ? await trx.selectFrom('stock_levels').select(['branch_code', 'warehouse_code', 'sku', 'max_qty', 'min_qty'])
    .where('tenant_id', '=', tenantId).where('branch_code', 'in', branchCodes).where('sku', 'in', skus).execute() : [])
    .map((l) => [`${l.branch_code}|${l.warehouse_code || defaults.get(l.branch_code) || ''}|${l.sku}`, { max: toNumber(l.max_qty), min: toNumber(l.min_qty) }]));
  const r4 = (x: number) => Math.round(x * 10000) / 10000;
  const rows = res.rows.map((r) => {
    const qty = r4(toNumber(r.qty));
    const amount = r.val === null ? null : Math.round(toNumber(r.val));
    if (!r.wh) r.wh = defaults.get(r.branch_code) ?? '';
    const isDefault = (defaults.get(r.branch_code) ?? '') === r.wh;
    const lv = levels.get(`${r.branch_code}|${r.wh}|${r.sku}`);
    const p = prods.get(r.sku);
    return {
      branchCode: r.branch_code, warehouseCode: r.wh, sku: r.sku, name: p?.name || r.name, alias: p?.barcode ?? '', unit: unitOf(r.sku, r.unit),
      qty, unitCost: amount !== null && qty ? Math.round(amount / qty) : null, amount, uncosted: Number(r.uncosted),
      inTransit: isDefault ? r4(transit.get(`${r.branch_id}|${r.sku}`) ?? 0) : 0,
      max: lv?.max ?? null, min: lv?.min ?? null, need: lv ? r4(lv.max - qty) : null,
    };
  }).filter((r) => r.qty || r.inTransit || r.max);
  rows.sort((a, b) => a.branchCode.localeCompare(b.branchCode) || a.warehouseCode.localeCompare(b.warehouseCode) || b.qty - a.qty || a.sku.localeCompare(b.sku));
  return { to: f.to, rows };
}
