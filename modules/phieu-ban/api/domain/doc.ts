/**
 * Phiếu bán / trả nhập tay — hàm thuần (không đọc CSDL): khuôn đầu vào (TradeDoc của docs/api/13-phieu-nhap-tay.md), tính lại tiền ở
 * máy chủ (không tin số của màn), khuôn số phiếu theo cửa hàng, số còn trả được, chứng từ nộp sổ (bizcity_ledger_intake@1).
 * Không viết số tài khoản: tài khoản do Kernel chọn theo loại chứng từ / mặt hàng / hình thức thanh toán.
 */
// [2026-11-13 11:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-015: hàm thuần phiếu bán / trả nhập tay (đóng góp)
import { roundMoney, z } from '@bizcity/module-sdk';

export type Kind = 'sale' | 'sale_return';
export const KINDS = ['sale', 'sale_return'] as const;
export const PREFIX: Record<Kind, string> = { sale: 'BH', sale_return: 'TL' };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const vnd = z.number().finite().min(0);
/** Ô ngày để trống ở màn gửi chuỗi rỗng — coi như không có. */
const optDate = date.optional().or(z.literal('').transform(() => undefined));
const optText = (n: number) => z.string().trim().max(n).optional();
// [2026-11-14 11:50 PM Võ Hoàng] NGHIEM-THU — NT-BH-015 §5 dòng 4: dòng mang chương trình khuyến mại (Core tính) như máy bán (đóng góp)
/** Chương trình của dòng: dòng quà (`gift`) hoặc dòng được giảm (`discount`). Key phải có trong `policyRefs` của phiếu (kèm băm). */
const policyRefInput = z.object({ key: z.string().trim().min(1).max(64), version: z.number().int().min(1), line: z.enum(['gift', 'discount']).optional() });
export const lineInput = z.object({
  lineKey: z.string().trim().min(1).max(64),
  sku: z.string().trim().min(1, 'Dòng hàng chưa chọn mã hàng').max(64),
  name: z.string().trim().max(500).optional(),
  unit: z.string().trim().max(32).optional(),
  qty: z.number().finite().positive('Số lượng phải lớn hơn 0'),
  unitPrice: vnd.optional(),
  discount: vnd.optional(),
  taxCode: z.string().trim().max(16).optional(),
  isGift: z.boolean().optional(),
  policyRef: policyRefInput.optional(),
}).passthrough();
export const docInput = z.object({
  docNo: z.string().trim().max(32).optional(),
  docDate: date,
  branchCode: z.string().trim().min(1, 'Chưa chọn chi nhánh').max(32),
  warehouseCode: z.string().trim().max(64).optional(),
  partner: z.object({ code: z.string().trim().max(64), name: z.string().trim().max(255).optional(), taxCode: z.string().trim().max(32).optional() }).passthrough().optional(),
  invoice: z.object({ no: z.string().trim().max(32), serial: optText(32), date: optDate }).passthrough().optional(),
  originalDocNo: z.string().trim().max(32).optional(),
  dueDate: optDate,
  lines: z.array(lineInput).min(1, 'Phiếu chưa có dòng hàng').max(500),
  payments: z.array(z.object({ methodCode: z.string().trim().min(1).max(32), amount: vnd, reference: z.string().trim().max(255).optional() })).max(20).optional(),
  note: z.string().trim().max(1000).optional(),
  /** Bản chính sách đã áp — đúng mảng `policyRefs` Core trả ở POST /api/v1/policies/evaluate. */
  policyRefs: z.array(z.object({ key: z.string().trim().min(1).max(64), version: z.number().int().min(1), hash: z.string().trim().min(1).max(128) })).max(50).optional(),
  // [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: phiếu bán sinh từ đơn đặt hàng nối số đơn (máy chủ tự gắn, màn không sửa được) (đóng góp)
  /** Đơn đặt hàng mà phiếu này giao (phiếu bán sinh từ nút Giao của đơn). Máy chủ giữ nguyên khi sửa phiếu nháp. */
  order: z.object({ id: z.string().trim().min(1).max(64), no: z.string().trim().max(32) }).optional(),
  // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: mã voucher TGS / hãng của khách (module voucher kiểm lúc duyệt) (đóng góp)
  /** Mã voucher (module voucher) khách dùng — trừ lúc duyệt: TGS = chiết khấu trên dòng, hãng = dòng thanh toán. */
  vouchers: z.array(z.string().trim().min(1).max(64)).max(10).optional(),
  // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-031: kênh bán của phiếu (danh mục Kênh bán hàng của module pos) (đóng góp)
  /** Mã kênh bán (hoặc tên) — máy chủ kiểm với danh mục của module pos (action pos.channel.list), lưu mã + tên. Trống = kênh mặc định. */
  saleChannel: z.string().trim().max(100).optional(),
}).passthrough();
export type PolicyRef = { key: string; version: number; line: 'gift' | 'discount' };
export type DocInput = z.infer<typeof docInput>;

export type CatalogItem = { sku: string; name: string; unit: string; taxCode: string | null; itemId: string | null };
export type Line = {
  lineKey: string; sku: string; name: string; unit: string; qty: number; unitPrice: number; discount: number;
  amountBeforeTax: number; taxCode: string; taxAmount: number; isGift: boolean; policyRef?: PolicyRef;
  /** NT-BH-028: kho riêng của dòng — dòng quà ở kho quà (KKM) của cửa hàng; trống = kho của phiếu. */
  warehouseCode?: string;
};
export type Body = {
  warehouseCode?: string; partner?: { code: string; name: string; taxCode?: string }; invoice?: { no: string; serial?: string; date: string };
  originalDocNo?: string; dueDate?: string; lines: Line[]; payments: { methodCode: string; amount: number; reference?: string }[];
  totals: { beforeTax: number; tax: number; total: number }; note?: string;
  policyRefs?: { key: string; version: number; hash: string }[];
  /** Đơn đặt hàng phiếu này giao (NT-BH-023). */
  order?: { id: string; no: string };
  /** Mã voucher khách dùng (NT-BH-026) — lưu ở nháp, áp lúc duyệt. */
  voucherCodes?: string[];
  /** Voucher đã áp lúc duyệt (NT-BH-026): số tiền thực trừ từng mã; module voucher đánh dấu đã dùng theo sự kiện phieu-ban.doc.recorded. */
  vouchers?: { code: string; campaignId: string; campaignName: string; issuer: 'tgs' | 'brand'; kind: 'discount' | 'payment'; faceValue: number; amount: number; methodCode?: string }[];
  /** Kênh bán (NT-BH-031): mã + tên kênh lúc lập (danh mục Kênh bán hàng của module pos). Trống = kênh mặc định (Gần shop). */
  saleChannel?: string;
  saleChannelName?: string;
};

// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-031: kênh mặc định của phiếu không mang kênh — trùng kênh mặc định của module pos (đóng góp)
/** Mã kênh mặc định (module pos: "Gần shop") — phiếu cũ / phiếu không chọn kênh tính vào kênh này khi lọc và báo cáo. */
export const DEFAULT_CHANNEL = 'GAN_SHOP';
export type ChannelItem = { code: string; name: string; active: boolean };
const fold = (s: string) => s.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
/** Kênh theo mã (không phân biệt hoa thường) hoặc tên; không có → null. */
export function findChannel(list: readonly ChannelItem[], input: string): ChannelItem | null {
  return list.find((c) => c.code === input.trim().toUpperCase()) ?? list.find((c) => fold(c.name) === fold(input)) ?? null;
}

/**
 * Tính lại phiếu ở máy chủ. Tên / ĐVT / mã thuế lấy theo danh mục khi dòng để trống; tiền dòng = SL × đơn giá − chiết khấu (làm tròn
 * đồng, quà = 0), thuế = tiền × thuế suất. Trả lỗi theo dòng (câu tiếng Việt) thay vì ném, để báo một lần đủ mọi dòng.
 */
export function computeDoc(input: DocInput, ctx: {
  catalog: Map<string, CatalogItem>; taxRates: Map<string, number>; methods: Set<string>; partner: { code: string; name: string; taxCode: string | null } | null;
}): { body: Body; problems: string[] } {
  const problems: string[] = [];
  const lines: Line[] = input.lines.map((l, i) => {
    const at = `Dòng ${i + 1} (${l.sku})`;
    const item = ctx.catalog.get(l.sku);
    if (!item) problems.push(`${at}: mã hàng không có trong danh mục, đã ngừng hoặc không bán`);
    const taxCode = l.taxCode || item?.taxCode || '';
    const rate = ctx.taxRates.get(taxCode);
    if (!taxCode) problems.push(`${at}: mặt hàng chưa khai thuế đầu ra — khai ở Danh mục mặt hàng`);
    else if (rate === undefined) problems.push(`${at}: mã thuế ${taxCode} không có / ngừng dùng`);
    const isGift = Boolean(l.isGift);
    const unitPrice = isGift ? 0 : roundMoney(l.unitPrice ?? 0);
    const discount = isGift ? 0 : roundMoney(l.discount ?? 0);
    const amountBeforeTax = isGift ? 0 : roundMoney(l.qty * unitPrice - discount);
    if (amountBeforeTax < 0) problems.push(`${at}: chiết khấu lớn hơn tiền hàng`);
    const policyRef = l.policyRef ? { key: l.policyRef.key, version: l.policyRef.version, line: l.policyRef.line ?? (isGift ? 'gift' as const : 'discount' as const) } : undefined;
    return {
      lineKey: l.lineKey, sku: l.sku, name: l.name || item?.name || '', unit: l.unit || item?.unit || '', qty: l.qty, unitPrice, discount,
      amountBeforeTax: Math.max(0, amountBeforeTax), taxCode, taxAmount: roundMoney(Math.max(0, amountBeforeTax) * (rate ?? 0) / 100), isGift,
      ...(policyRef ? { policyRef } : {}),
    };
  });
  // Dòng mang chương trình phải có căn cứ: chương trình + bản ở dòng và ở policyRefs của phiếu (kèm băm) — như máy bán (NT-BH-003).
  const refs = new Map((input.policyRefs ?? []).map((r) => [r.key, r]));
  for (const [i, l] of lines.entries()) {
    if (l.policyRef && refs.get(l.policyRef.key)?.version !== l.policyRef.version) problems.push(`Dòng ${i + 1} (${l.sku}): chương trình ${l.policyRef.key} bản ${l.policyRef.version} không có trong căn cứ khuyến mại của phiếu — bấm Áp khuyến mại lại`);
    if (l.policyRef?.line === 'discount' && !(l.discount > 0)) problems.push(`Dòng ${i + 1} (${l.sku}): dòng giảm theo chương trình ${l.policyRef.key} chưa có tiền giảm`);
  }
  const used = new Set(lines.map((l) => l.policyRef?.key).filter(Boolean));
  const policyRefs = (input.policyRefs ?? []).filter((r) => used.has(r.key)).map((r) => ({ key: r.key, version: r.version, hash: r.hash }));
  const keys = new Set<string>();
  for (const l of lines) { if (keys.has(l.lineKey)) problems.push(`Khoá dòng ${l.lineKey} bị trùng`); keys.add(l.lineKey); }
  const beforeTax = lines.reduce((s, l) => s + l.amountBeforeTax, 0);
  const tax = lines.reduce((s, l) => s + l.taxAmount, 0);
  const total = beforeTax + tax;
  const payments = (input.payments ?? []).filter((p) => p.amount > 0).map((p) => ({ methodCode: p.methodCode, amount: roundMoney(p.amount), ...(p.reference ? { reference: p.reference } : {}) }));
  for (const p of payments) if (!ctx.methods.has(p.methodCode)) problems.push(`Hình thức thanh toán ${p.methodCode} không có / ngừng dùng`);
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  if (paid > total) problems.push(`Tiền thu (${paid.toLocaleString('vi-VN')}) lớn hơn tổng phiếu (${total.toLocaleString('vi-VN')})`);
  if (input.partner?.code && !ctx.partner) problems.push(`Khách ${input.partner.code} không có trong danh mục đối tượng`);
  if (paid < total && !ctx.partner) problems.push('Phiếu còn ghi nợ (thu chưa đủ) phải chọn khách hàng');
  if (input.invoice?.no && !/^\S+$/.test(input.invoice.no)) problems.push('Số hoá đơn không được có dấu cách');
  const body: Body = {
    ...(input.warehouseCode ? { warehouseCode: input.warehouseCode } : {}),
    ...(ctx.partner ? { partner: { code: ctx.partner.code, name: ctx.partner.name, ...(ctx.partner.taxCode ? { taxCode: ctx.partner.taxCode } : {}) } } : {}),
    ...(input.invoice?.no ? { invoice: { no: input.invoice.no, ...(input.invoice.serial ? { serial: input.invoice.serial } : {}), date: input.invoice.date || input.docDate } } : {}),
    ...(input.originalDocNo ? { originalDocNo: input.originalDocNo } : {}),
    ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    lines, payments, totals: { beforeTax, tax, total },
    ...(input.note ? { note: input.note } : {}),
    ...(policyRefs.length ? { policyRefs } : {}),
    ...(input.order ? { order: { id: input.order.id, no: input.order.no } } : {}),
    ...(input.vouchers?.length ? { voucherCodes: [...new Set(input.vouchers.map((c) => c.trim().toUpperCase()))] } : {}),
    // NT-BH-031: kênh đã kiểm ở máy chủ (service.withChannel) — tên đi kèm mã; duyệt lại giữ nguyên kênh của nháp.
    ...(input.saleChannel ? { saleChannel: input.saleChannel, ...((input as { saleChannelName?: string }).saleChannelName ? { saleChannelName: (input as { saleChannelName?: string }).saleChannelName } : {}) } : {}),
  };
  return { body, problems };
}

/** Tháng cấp số (yyMM) theo ngày chứng từ. */
export const periodOf = (docDate: string) => `${docDate.slice(2, 4)}${docDate.slice(5, 7)}`;
/** Số phiếu tự cấp: BH / TL + yyMM + 6 số (theo cửa hàng × loại × tháng). */
export function formatNo(kind: Kind, period: string, n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 999_999) throw new RangeError(`Số phiếu ngoài khoảng: ${n}`);
  return `${PREFIX[kind]}${period}${String(n).padStart(6, '0')}`;
}

/** Số còn trả được theo mã hàng: đã bán (phiếu gốc, trừ quà) − đã trả ở các phiếu trả đã duyệt. */
export function returnableBySku(sold: readonly Pick<Line, 'sku' | 'qty'>[], returned: readonly Pick<Line, 'sku' | 'qty'>[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of sold) m.set(l.sku, (m.get(l.sku) ?? 0) + l.qty);
  for (const l of returned) m.set(l.sku, (m.get(l.sku) ?? 0) - l.qty);
  return m;
}

/** Dòng trả vượt số còn trả được → câu lỗi theo mã. */
export function overReturn(lines: readonly Pick<Line, 'sku' | 'qty'>[], left: Map<string, number>): string[] {
  const want = new Map<string, number>();
  for (const l of lines) want.set(l.sku, (want.get(l.sku) ?? 0) + l.qty);
  return [...want].filter(([sku, q]) => q > (left.get(sku) ?? 0) + 1e-9).map(([sku, q]) => `${sku}: trả ${q}, còn trả được ${Math.max(0, left.get(sku) ?? 0)}`);
}

export const docKeyOf = (docId: string) => `phieu-ban:${docId}`;

/** Chứng từ nộp sổ (bizcity_ledger_intake@1) từ phiếu đã tính. Phiếu trả mang originalDocKey của phiếu bán gốc khi có. */
export function toLedgerDoc(d: { docId: string; kind: Kind; branchCode: string; docNo: string; docDate: string; body: Body; version: number; originalDocId?: string | null; catalog: Map<string, CatalogItem> }) {
  const b = d.body;
  return {
    docType: d.kind,
    docKey: docKeyOf(d.docId),
    version: d.version,
    branchCode: d.branchCode,
    docNo: d.docNo,
    docDate: d.docDate,
    description: b.note || `${d.kind === 'sale' ? 'Phiếu bán hàng' : 'Hàng bán trả lại'} ${d.docNo}`,
    sourceRef: { type: 'phieu-ban.doc', id: d.docId, label: d.docNo },
    ...(b.partner ? { partner: { code: b.partner.code, name: b.partner.name, ...(b.partner.taxCode ? { taxCode: b.partner.taxCode } : {}) } } : {}),
    ...(b.invoice ? { invoice: { no: b.invoice.no, serial: b.invoice.serial ?? '', date: b.invoice.date } } : {}),
    ...(b.dueDate ? { dueDate: b.dueDate } : {}),
    ...(d.kind === 'sale_return' && d.originalDocId ? { originalDocKey: docKeyOf(d.originalDocId) } : {}),
    lines: b.lines.map((l) => {
      // Dòng quà theo chương trình chỉ gửi mã (như máy bán): cửa nạp so quà theo itemId ?? sku với quà Core tính (IN-POL-004).
      const itemId = l.isGift && l.policyRef ? undefined : d.catalog.get(l.sku)?.itemId;
      return {
        lineKey: l.lineKey, sku: l.sku, ...(itemId ? { itemId } : {}), name: l.name, unit: l.unit, qty: l.qty,
        unitPrice: l.unitPrice, amountBeforeTax: l.amountBeforeTax, discount: l.discount, taxCode: l.taxCode, taxAmount: l.taxAmount,
        ...(l.warehouseCode || b.warehouseCode ? { warehouseCode: l.warehouseCode || b.warehouseCode } : {}), ...(l.isGift ? { isGift: true } : {}),
        ...(l.policyRef ? { policyRef: l.policyRef } : {}),
      };
    }),
    // Bản chính sách đã áp: cửa nạp kiểm lại (IN-POL-001..004); phiếu có dòng chương trình có hạn mức (BH12) thì hạn mức tự trừ.
    ...(b.policyRefs?.length ? { policyRefs: b.policyRefs } : {}),
    // Dòng thanh toán voucher hãng (NT-BH-026) mang số mã ở `reference`; trường riêng của module không gửi vào sổ.
    payments: b.payments.map(({ voucherCode: _v, ...p }: Body['payments'][number] & { voucherCode?: string }) => p),
    totals: b.totals,
  };
}

// [2026-11-16 06:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-021 chặn bán quá tồn ở phiếu bán nhập tay (đóng góp)
const r4s = (n: number) => Math.round(n * 10_000) / 10_000;

/** Phiếu bán xuất quá tồn của kho trên phiếu (cộng theo mã, gồm quà). Rỗng = đủ. */
export function stockShortOf(lines: readonly { sku: string; qty: number }[], have: ReadonlyMap<string, number>) {
  const need = new Map<string, number>();
  for (const l of lines) if (l.qty > 0) need.set(l.sku, r4s((need.get(l.sku) ?? 0) + l.qty));
  return [...need.entries()].map(([sku, n]) => ({ sku, need: n, have: r4s(have.get(sku) ?? 0) })).filter((x) => x.need > x.have)
    .sort((a, b) => a.sku.localeCompare(b.sku));
}

// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-028: dòng quà của phiếu bán tự vào kho quà (KKM) của cửa hàng; không đổi thuế / giá vốn (đóng góp)
/**
 * Gán kho quà cho dòng quà (`isGift`) của phiếu bán; dòng bán giữ kho của phiếu. `gift` null (cửa hàng chưa khai kho quà) → bỏ kho riêng
 * của mọi dòng (như cũ: mọi dòng ở kho của phiếu). Chỉ là phân kho trừ tồn (R-COMBO) — thuế, giá vốn không suy từ kho.
 */
export function withGiftWarehouse<B extends Pick<Body, 'lines'>>(body: B, gift: string | null): B {
  return { ...body, lines: body.lines.map(({ warehouseCode: _w, ...l }) => (gift && l.isGift ? { ...l, warehouseCode: gift } : l)) };
}

/** Thiếu tồn theo mặt hàng × kho: dòng có kho riêng (quà) so tồn kho đó, không cộng chung với kho của phiếu. */
export function stockShortByWarehouse(lines: readonly Pick<Line, 'sku' | 'qty' | 'warehouseCode'>[], have: ReadonlyMap<string, ReadonlyMap<string, number>>, headWarehouse: string) {
  const groups = new Map<string, { sku: string; qty: number }[]>();
  for (const l of lines) {
    const wh = l.warehouseCode || headWarehouse;
    groups.set(wh, [...(groups.get(wh) ?? []), l]);
  }
  return [...groups].flatMap(([wh, ls]) => stockShortOf(ls, have.get(wh) ?? new Map()).map((x) => ({ ...x, warehouse: wh, ...(wh !== headWarehouse ? { gift: true } : {}) })));
}
