/**
 * NHẬP EXCEL MẶT HÀNG (DM10): kiểm tra từng dòng TRƯỚC khi ghi, báo rõ dòng lỗi; bấm ghi thì chỉ ghi dòng đúng.
 *   - Mã hàng là khoá: chưa có → thêm mới (bắt buộc Tên hàng, ĐVT); đã có → cập nhật, ô trống giữ nguyên.
 *   - Nhóm / ngành / nhãn / loại hàng: ghi mã hoặc đúng tên trong danh mục; nhóm hạch toán, mã VAT phải có sẵn.
 *   - ĐVT của mặt hàng đã có không đổi qua Excel (đổi ở form mặt hàng — kéo theo bộ đơn vị tính, bảng giá).
 *   - Mỗi dòng ghi riêng (lỗi một dòng không làm hỏng dòng khác), dùng chung saveProduct với form DM10.
 *   - Xem trước: mỗi dòng trả `values` (thông tin sẽ ghi, phân loại hiện "mã — tên") và với mã đã có trả `before` (đang có).
 */
import { db } from '../../db/client.js';
import { writeAudit } from '../../core/audit.js';
import { saveProduct, type ProductInput } from './catalog.service.js';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface ImportRow {
  row: number; sku: string; name?: string; unit?: string; note?: string;
  groupCode?: string; industryCode?: string; brandCode?: string; typeCode?: string;
  postingGroupCode?: string; taxOutCode?: string; taxInCode?: string; isActive?: string;
}
/** Thông tin hiển thị một mặt hàng (bước xem trước): cùng khoá với cột Excel, giá trị là chữ để hiện. */
export type ShowValues = Partial<Record<Exclude<keyof ImportRow, 'row'>, string>>;
export interface RowResult { row: number; sku: string; action: 'create' | 'update' | 'error'; errors: string[]; values: ShowValues; before?: ShowValues }

const CLASS = [['groupCode', 'group', 'Nhóm hàng'], ['industryCode', 'industry', 'Ngành hàng'], ['brandCode', 'brand', 'Nhãn hàng'], ['typeCode', 'type', 'Loại hàng']] as const;
const YES = new Set(['có', 'co', 'x', '1', 'true', 'yes', 'đang theo dõi', 'theo dõi']);
const NO = new Set(['không', 'khong', '0', 'false', 'no', 'ngừng', 'ngung']);
const low = (s: string) => s.trim().toLowerCase();

export async function importProducts(tenantId: string, actor: string, rows: ImportRow[], dryRun: boolean) {
  const [products, classes, groups, taxes] = await Promise.all([
    db.selectFrom('products').select(['sku', 'name', 'unit', 'note', 'group_code', 'industry_code', 'brand_code', 'type_code', 'posting_group_code', 'tax_out_code', 'tax_in_code', 'is_active'])
      .where('tenant_id', '=', tenantId).execute(),
    db.selectFrom('item_classes').select(['kind', 'code', 'name']).where('tenant_id', '=', tenantId).execute(),
    db.selectFrom('product_posting_groups').select('code').where('tenant_id', '=', tenantId).execute(),
    db.selectFrom('tax_codes').select('code').where('tenant_id', '=', tenantId).execute(),
  ]);
  const existing = new Map(products.map((p) => [p.sku, p.unit]));
  const className = new Map(classes.map((c) => [`${c.kind}|${c.code}`, c.name]));
  const showClass = (kind: string, c: string | null | undefined) => (c ? `${c} — ${className.get(`${kind}|${c}`) ?? ''}`.replace(/ — $/, '') : '');
  const beforeOf = new Map(products.map((p) => [p.sku, {
    sku: p.sku, name: p.name, unit: p.unit, note: p.note, groupCode: showClass('group', p.group_code), industryCode: showClass('industry', p.industry_code),
    brandCode: showClass('brand', p.brand_code), typeCode: showClass('type', p.type_code), postingGroupCode: p.posting_group_code ?? '',
    taxOutCode: p.tax_out_code ?? '', taxInCode: p.tax_in_code ?? '', isActive: p.is_active ? 'Có' : 'Không',
  } satisfies ShowValues]));
  const groupSet = new Set(groups.map((g) => g.code));
  const taxSet = new Set(taxes.map((t) => t.code));
  // Tra mã phân loại: đúng mã, hoặc đúng tên (không phân biệt hoa thường) nếu tên chỉ ứng với một mã.
  const findClass = (kind: string, v: string): string | null => {
    const list = classes.filter((c) => c.kind === kind);
    const byCode = list.find((c) => c.code === v) ?? list.find((c) => low(c.code) === low(v));
    if (byCode) return byCode.code;
    const byName = list.filter((c) => low(c.name) === low(v));
    return byName.length === 1 ? byName[0]!.code : null;
  };

  const seen = new Map<string, number>();
  const checked = rows.map((r) => {
    const errors: string[] = [];
    const sku = (r.sku ?? '').trim();
    const input: ProductInput & Record<string, unknown> = {};
    if (!sku) errors.push('Thiếu mã hàng');
    else if (/\s/.test(sku)) errors.push(`Mã hàng "${sku}" có khoảng trắng`);
    else if (sku.length > 64) errors.push('Mã hàng dài quá 64 ký tự');
    if (sku && seen.has(sku)) errors.push(`Trùng mã hàng với dòng ${seen.get(sku)} trong tệp`);
    else if (sku) seen.set(sku, r.row);
    const isNew = !existing.has(sku);
    const name = r.name?.trim() ?? '';
    const unit = r.unit?.trim() ?? '';
    if (isNew && !name) errors.push('Mặt hàng mới phải có Tên hàng');
    if (isNew && !unit) errors.push('Mặt hàng mới phải có ĐVT');
    if (name.length > 500) errors.push('Tên hàng dài quá 500 ký tự');
    if (!isNew && unit && low(unit) !== low(existing.get(sku) ?? '')) errors.push(`ĐVT "${unit}" khác ĐVT đang có "${existing.get(sku)}" — đổi ĐVT ở form mặt hàng`);
    if (name) input.name = name;
    if (isNew && unit) input.units = [{ unit, ratio: 1, isDefault: true, isPurchaseDefault: true }];
    if (r.note?.trim()) input.note = r.note.trim();
    for (const [key, kind, label] of CLASS) {
      const v = r[key]?.trim();
      if (!v) continue;
      const c = findClass(kind, v);
      if (c) input[key] = c; else errors.push(`${label} "${v}" chưa có trong danh mục`);
    }
    const pg = r.postingGroupCode?.trim();
    if (pg) { if (groupSet.has(pg)) input.postingGroupCode = pg; else errors.push(`Nhóm hạch toán "${pg}" chưa có`); }
    for (const [key, label] of [['taxOutCode', 'Mã VAT ra'], ['taxInCode', 'Mã VAT vào']] as const) {
      const v = r[key]?.trim();
      if (v) { if (taxSet.has(v)) input[key] = v; else errors.push(`${label} "${v}" chưa có`); }
    }
    const act = r.isActive?.trim();
    if (act) { if (YES.has(low(act))) input.isActive = true; else if (NO.has(low(act))) input.isActive = false; else errors.push(`Theo dõi "${act}" không hiểu — ghi Có / Không`); }
    if (!isNew && !errors.length && Object.keys(input).length === 0) errors.push('Không có thông tin nào để cập nhật');
    // Hiển thị: giá trị đã tra được (phân loại "mã — tên"), không tra được thì giữ chữ trong tệp.
    const values: ShowValues = { sku, name, unit, note: r.note?.trim() ?? '', postingGroupCode: pg ?? '', taxOutCode: r.taxOutCode?.trim() ?? '', taxInCode: r.taxInCode?.trim() ?? '',
      isActive: input.isActive === undefined ? act ?? '' : input.isActive ? 'Có' : 'Không' };
    for (const [key, kind] of CLASS) values[key] = input[key] ? showClass(kind, input[key] as string) : r[key]?.trim() ?? '';
    if (isNew && !errors.length && !values.isActive) values.isActive = 'Có';
    return { row: r.row, sku, isNew, input, errors, values, before: isNew ? undefined : beforeOf.get(sku) };
  });

  const results: RowResult[] = [];
  for (const c of checked) {
    const show = { values: c.values, ...(c.before ? { before: c.before } : {}) };
    if (c.errors.length || dryRun) { results.push({ row: c.row, sku: c.sku, action: c.errors.length ? 'error' : c.isNew ? 'create' : 'update', errors: c.errors, ...show }); continue; }
    try {
      await db.transaction().execute((trx) => saveProduct(trx, tenantId, actor, c.sku, c.input, { isNew: c.isNew, source: 'excel', quiet: true }));
      results.push({ row: c.row, sku: c.sku, action: c.isNew ? 'create' : 'update', errors: [], ...show });
    } catch (e) {
      results.push({ row: c.row, sku: c.sku, action: 'error', errors: [errorText(e)], ...show });
    }
  }
  const count = (a: RowResult['action']) => results.filter((x) => x.action === a).length;
  const summary = { created: count('create'), updated: count('update'), failed: count('error') };
  if (!dryRun && (summary.created || summary.updated)) {
    await writeAudit(db, { tenantId, actor, action: 'catalog.product.import', objectType: 'product', objectId: `${summary.created + summary.updated} mặt hàng`, after: { ...summary, skus: results.filter((x) => x.action !== 'error').map((x) => x.sku).slice(0, 50) } });
  }
  return { dryRun, ...summary, rows: results };
}
