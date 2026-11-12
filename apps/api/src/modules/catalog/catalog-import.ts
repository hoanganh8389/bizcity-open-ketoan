// @bizcity-layer M data/masterdata
/**
 * NHẬP EXCEL MẶT HÀNG (DM10): kiểm tra từng dòng TRƯỚC khi ghi, báo rõ dòng lỗi; bấm ghi thì chỉ ghi dòng đúng.
 *   - Mã hàng là khoá: chưa có → thêm mới (bắt buộc Tên hàng, ĐVT); đã có → cập nhật, ô trống giữ nguyên.
 *   - Nhóm / ngành / nhãn / loại hàng: ghi mã hoặc đúng tên trong danh mục; nhóm hạch toán, mã VAT phải có sẵn.
 *   - ĐVT của mặt hàng đã có không đổi qua Excel (đổi ở form mặt hàng — kéo theo bộ đơn vị tính, bảng giá).
 *   - Mỗi dòng ghi riêng (lỗi một dòng không làm hỏng dòng khác), dùng chung saveProduct với form DM10.
 *   - Xem trước: mỗi dòng trả `values` (thông tin sẽ ghi, phân loại hiện "mã — tên") và với mã đã có trả `before` (đang có).
 */
import { inSavepoint, type ActionTx } from '@bizcity/platform/core/actions';
import { writeAudit } from '../../core/audit.js';
import { saveProduct, type ProductInput } from './catalog.service.js';
import { parentFromSku } from './sku-rule.js';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface ImportRow {
  row: number; sku: string; name?: string; unit?: string; note?: string;
  groupCode?: string; industryCode?: string; brandCode?: string; typeCode?: string;
  postingGroupCode?: string; taxOutCode?: string; taxInCode?: string; vatRate?: string; isActive?: string;
}
/** Thông tin hiển thị một mặt hàng (bước xem trước): cùng khoá với cột Excel, giá trị là chữ để hiện. */
export type ShowValues = Partial<Record<Exclude<keyof ImportRow, 'row'>, string>>;
export interface RowResult { row: number; sku: string; action: 'create' | 'update' | 'error'; errors: string[]; values: ShowValues; before?: ShowValues }

const CLASS = [['groupCode', 'group', 'Nhóm hàng'], ['industryCode', 'industry', 'Ngành hàng'], ['brandCode', 'brand', 'Nhãn hàng'], ['typeCode', 'type', 'Loại hàng']] as const;
const YES = new Set(['có', 'co', 'x', '1', 'true', 'yes', 'đang theo dõi', 'theo dõi', 'đang hoạt động', 'hoạt động']);
const NO = new Set(['không', 'khong', '0', 'false', 'no', 'ngừng', 'ngung', 'ngừng hoạt động', 'ngừng theo dõi']);
// [2026-11-12 Nguyễn Văn Thủy] cột Thuế suất GTGT (%) như form: KCT / 0 / 5 / 8 / 10 → cặp mã thuế ra / vào (đóng góp)
const VAT: Record<string, [string, string]> = { kct: ['KCT', 'V13K'], '0': ['R00', 'V00'], '5': ['R05', 'V05'], '8': ['R08', 'V08'], '10': ['R10', 'V10'] };
const low = (s: string) => s.trim().toLowerCase();

// [2026-11-03 11:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 6 (action theo lô): cả tệp một giao dịch, mỗi dòng một SAVEPOINT
export async function importProducts(trx: ActionTx, tenantId: string, actor: string, rows: ImportRow[], dryRun: boolean, by?: string) {
  const [products, classes, groups, taxes] = await Promise.all([
    trx.selectFrom('products').select(['sku', 'name', 'unit', 'note', 'group_code', 'industry_code', 'brand_code', 'type_code', 'posting_group_code', 'tax_out_code', 'tax_in_code', 'is_active'])
      .where('tenant_id', '=', tenantId).execute(),
    trx.selectFrom('item_classes').select(['kind', 'code', 'name', 'parent_code']).where('tenant_id', '=', tenantId).execute(),
    trx.selectFrom('product_posting_groups').select('code').where('tenant_id', '=', tenantId).execute(),
    trx.selectFrom('tax_codes').select(['code', 'direction', 'is_active']).where('tenant_id', '=', tenantId).execute(),
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

  // [2026-11-12 Nguyễn Văn Thủy] quy tắc mã như form: mã chính không có chữ đầu / cuối, nhóm cấp 3; mã biến thể = mã cha (đã có
  // hoặc có ở dòng khác trong tệp) thêm tối đa 2 chữ, nhóm theo mã cha. Ghi mã chính trước rồi mới ghi mã biến thể (đóng góp)
  const groupBy = new Map(classes.filter((c) => c.kind === 'group').map((c) => [c.code, c]));
  const levelOf = (code: string): number => {
    let n = 0; let c = groupBy.get(code); const seenG = new Set<string>();
    while (c && !seenG.has(c.code)) { seenG.add(c.code); if (c.parent_code || !/^nhóm hàng$/i.test(c.name.trim())) n++; c = c.parent_code ? groupBy.get(c.parent_code) : undefined; }
    return n;
  };
  const chainOfG = (code: string) => { const out: string[] = []; let c = groupBy.get(code); while (c && !out.includes(c.code)) { out.unshift(c.code); c = c.parent_code ? groupBy.get(c.parent_code) : undefined; } return out.filter((x) => !/^nhóm hàng$/i.test(groupBy.get(x)!.name.trim())); };
  const isKind = (kind: string, code: string | undefined) => Boolean(code && classes.some((c) => c.kind === kind && c.code === code));
  const inFile = new Set(rows.map((r) => (r.sku ?? '').trim().toUpperCase()).filter(Boolean));
  const seen = new Map<string, number>();
  const checked = rows.map((r) => {
    const errors: string[] = [];
    const sku = (r.sku ?? '').trim();
    const input: ProductInput & Record<string, unknown> = {};
    if (!sku) errors.push('Thiếu mã hàng');
    else if (/\s/.test(sku)) errors.push(`Mã hàng "${sku}" có khoảng trắng`);
    else if (sku.length > 64) errors.push('Mã hàng dài quá 64 ký tự');
    if (sku && seen.has(sku)) errors.push(`Trùng mã hàng với dòng ${seen.get(sku)} trong tệp`);
    const ps = sku ? parentFromSku(sku) : null;
    if (sku && !existing.has(sku)) {
      if (ps) {
        if (!existing.has(ps) && !inFile.has(ps)) errors.push(`Mã cha ${ps} chưa có — khai mã cha trước (hoặc thêm dòng mã cha vào tệp)`);
        if (sku.length - ps.length > 2) errors.push(`Mã biến thể chỉ thêm tối đa 2 chữ quanh mã cha ${ps}`);
      } else if (/[A-Z]$/i.test(sku) || (/^[A-Z]/i.test(sku) && !/^[A-Z][0-9]{8}$/i.test(sku))) {
        errors.push('Mã hàng mới không được có chữ ở đầu hoặc cuối (mã biến thể phải giữ nguyên mã cha đã có)');
      }
    }
    else if (sku) seen.set(sku, r.row);
    const isNew = !existing.has(sku);
    const name = r.name?.trim() ?? '';
    const unit = r.unit?.trim() ?? '';
    if (isNew && !name) errors.push('Mặt hàng mới phải có Tên hàng');
    if (isNew && !unit) errors.push('Mặt hàng mới phải có ĐVT');
    if (name.length > 50 && (isNew || !products.some((p) => p.sku === sku && p.name === name))) errors.push(`Tên hàng tối đa 50 ký tự (đang ${name.length})`);
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
    const g = input.groupCode as string | undefined;
    if (!existing.has(sku) && !ps) {
      if (!g && !r.groupCode?.trim()) errors.push('Mặt hàng mới phải có Nhóm hàng (tới nhóm cấp 3)');
      else if (g && levelOf(g) < 3) errors.push(`Nhóm hàng "${groupBy.get(g)?.name ?? g}" mới là nhóm cấp ${levelOf(g)} — phải chọn tới nhóm cấp 3`);
    }
    if (ps) delete input.groupCode; // mã biến thể: nhóm theo mã cha
    else if (g && !input.industryCode && !input.brandCode) {
      // ngành / nhãn tự theo nhóm như form
      const ch = chainOfG(g);
      if (isKind('industry', ch[0])) input.industryCode = ch[0];
      if (isKind('brand', ch[1])) input.brandCode = ch[1];
    }
    const vr = r.vatRate?.trim().toLowerCase().replace(/%$/, '').trim();
    if (vr) {
      // Thuế suất (KCT, 0, 5, 8, 10) hoặc mã thuế đầu ra; phải có ở danh mục Biểu thuế.
      const raw = r.vatRate!.trim().toUpperCase();
      const pair = VAT[vr] ?? (taxes.some((t) => t.code === raw && t.direction === 'output') ? [raw, ''] as [string, string] : undefined);
      if (!pair) errors.push(`Thuế suất "${r.vatRate}" không hiểu — ghi KCT, 0, 5, 8, 10 hoặc mã thuế đầu ra ở Biểu thuế`);
      else if (!taxes.some((t) => t.code === pair[0] && t.direction === 'output' && t.is_active)) errors.push(`Mã thuế ${pair[0]} chưa khai (hoặc đang ngừng) ở danh mục Biểu thuế`);
      else { input.taxOutCode = pair[0]; if (pair[1] && taxSet.has(pair[1])) input.taxInCode = pair[1]; }
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
    const values: ShowValues = { sku, name, unit, note: r.note?.trim() ?? '', postingGroupCode: pg ?? '', taxOutCode: (input.taxOutCode as string | undefined) ?? r.taxOutCode?.trim() ?? '', taxInCode: (input.taxInCode as string | undefined) ?? r.taxInCode?.trim() ?? '',
      isActive: input.isActive === undefined ? act ?? '' : input.isActive ? 'Có' : 'Không' };
    for (const [key, kind] of CLASS) values[key] = input[key] ? showClass(kind, input[key] as string) : r[key]?.trim() ?? '';
    if (isNew && !errors.length && !values.isActive) values.isActive = 'Có';
    return { row: r.row, sku, isNew, isVariant: Boolean(ps), input, errors, values, before: isNew ? undefined : beforeOf.get(sku) };
  });
  // Mã cha trong tệp bị lỗi → mã biến thể của nó cũng không ghi được.
  const bad = new Set(checked.filter((c) => c.errors.length).map((c) => c.sku.toUpperCase()));
  for (const c of checked) { const ps = parentFromSku(c.sku); if (c.isNew && ps && !existing.has(ps) && bad.has(ps) && !c.errors.length) c.errors.push(`Dòng mã cha ${ps} đang lỗi`); }
  const order = [...checked].sort((a, b) => Number(a.isVariant) - Number(b.isVariant));

  const results: RowResult[] = [];
  for (const c of order) {
    const show = { values: c.values, ...(c.before ? { before: c.before } : {}) };
    if (c.errors.length || dryRun) { results.push({ row: c.row, sku: c.sku, action: c.errors.length ? 'error' : c.isNew ? 'create' : 'update', errors: c.errors, ...show }); continue; }
    const x = await inSavepoint(trx, (t) => saveProduct(t, tenantId, actor, c.sku, c.input, { isNew: c.isNew, source: 'excel', quiet: true, checkName: true, by }));
    results.push(x.ok ? { row: c.row, sku: c.sku, action: c.isNew ? 'create' : 'update', errors: [], ...show } : { row: c.row, sku: c.sku, action: 'error', errors: [errorText(x.error)], ...show });
  }
  results.sort((a, b) => a.row - b.row);
  const count = (a: RowResult['action']) => results.filter((x) => x.action === a).length;
  const summary = { created: count('create'), updated: count('update'), failed: count('error') };
  if (!dryRun && (summary.created || summary.updated)) {
    await writeAudit(trx, { tenantId, actor, action: 'catalog.product.import', objectType: 'product', objectId: `${summary.created + summary.updated} mặt hàng`, after: { ...summary, skus: results.filter((x) => x.action !== 'error').map((x) => x.sku).slice(0, 50) } });
  }
  return { dryRun, ...summary, rows: results };
}
