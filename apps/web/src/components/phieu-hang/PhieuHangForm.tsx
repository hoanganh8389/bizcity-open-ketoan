// [2026-11-02 04:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-21b: dải cảnh báo kiểm chuẩn theo ngày phiếu (chỉ thông tin, không chặn Ghi).
/**
 * Form một phiếu hàng hoá (bán hàng, hàng bán trả lại, mua hàng, trả hàng nhà cung cấp, chuyển kho) — xem lib/tradeDocs.ts.
 *   Đầu phiếu: số phiếu (để trống = tự cấp), ngày, chi nhánh + KHO (chuyển kho: chi nhánh / kho xuất → nhận, cùng chi nhánh thì
 *   khác kho), đối tượng, hoá đơn, phiếu gốc. Mọi dòng đi theo kho ở đầu phiếu (cột Kho chỉ để xem).
 *   Dòng hàng: chọn mã hàng → tự điền tên, ĐVT, đơn giá trước thuế (bán: từ bảng giá công ty đã gồm thuế), loại thuế
 *   của mặt hàng; tiền tự tính.
 *   Thu tiền (bán / trả lại): các khoản theo hình thức thanh toán; để trống = ghi công nợ.
 *   Phiếu bán / trả (module phieu-ban, NT-BH-015 bước 2): đơn giá theo bảng giá CỦA CỬA HÀNG (như máy bán); dòng bán vượt tồn
 *   theo sổ của kho đã chọn hiện cảnh báo "tồn sổ còn X" (không chặn — giá vốn tính cuối tháng).
 *   Phiếu bán: khối Khuyến mại — Core tính như máy bán (POST /api/v1/policies/evaluate: chương trình BH12 + khuyến mại BH18 đang
 *   chạy ở cửa hàng tại ngày phiếu); người lập bỏ chọn được từng chương trình; tiền giảm gồm thuế quy về chiết khấu trước thuế.
 * Danh mục (mặt hàng, đối tượng, chi nhánh, hình thức thanh toán) đọc từ API thật; chỉ phần LƯU phiếu theo nguồn dữ liệu.
 * Giao diện (NT-BH-036): cùng mẫu phiếu mua — khung KhungPhieu (một nút Hướng dẫn ở tiêu đề), khối đầu phiếu thu gọn được,
 *   thẻ Hàng hoá / Thu tiền / Hoá đơn, cột phải "Trợ lý bán hàng" (Kiểm tra · Khuyến mại & voucher · Tổng tiền), chân Ghi / Thoát.
 *   Chỉ đổi chỗ đặt và kiểu hiện; lệnh gọi API, dữ liệu gửi đi, điều kiện chặn Ghi giữ nguyên.
 */
// [2026-11-21 Võ Hoàng] NGHIEM-THU — NT-BH-036: phiếu bán / trả bán cùng mẫu phiếu mua — chỉ giao diện, nghiệp vụ giữ nguyên (đóng góp)
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { KIND_INFO, TAX_RATES, thueMacDinh, applyPromo, clearPromo, promoLines, recompute, type PromoGiftInfo, type PromoResult, type TradeDoc, type TradeLine } from '@/lib/tradeDocs';
import { Field, NumInput } from '@/components/ui';
import { ChonThue } from '@/lib/thueGtgt';
import { roundPrice } from '@/lib/format';
import { BranchPicker } from '@/components/filters';
import { ItemPicker, ListPicker, PartnerPicker } from '@/components/pickers';
import { PrintButton } from '@/components/print';
import { KhungPhieu } from './KhungPhieu';
import { TRADE_TEMPLATES } from './printTemplates';
import { ChonKho, khoLabel, useKho } from './ChonKho';
import { DocumentGateBanner, useDocumentGate } from '@/components/PostingGate';
// [2026-11-14 03:10 PM Võ Hoàng] NGHIEM-THU — NT-BH-015 bước 2: giá theo cửa hàng, cảnh báo tồn cho phiếu bán / trả (đóng góp)

/** Giá theo cửa hàng + tồn sổ của module phieu-ban (GET /api/v1/m/phieu-ban/quote). */
interface Quote { sku: string; unit: string; ratio: number; price: number | null; taxCode: string | null; stock: number }

interface CatalogProduct { sku: string; name: string; unit: string; taxOutCode: string | null; taxInCode: string | null; units: { unit: string; isDefault: boolean }[]; prices: { unit: string; price: number | null }[] }
interface PaymentMethod { code: string; name: string; isActive?: boolean }
// [2026-11-21 Võ Hoàng] NGHIEM-THU — NT-BH-035 §3.1: BH10 có ô Kênh bán (danh mục Kênh bán hàng của module pos) và ô Mã voucher (đóng góp)
/** Kênh bán hàng (GET /api/v1/m/pos/channels). */
interface SaleChannel { code: string; name: string; active: boolean }
/** Voucher đã áp (phiếu đã duyệt) / kết quả kiểm (POST /api/v1/m/phieu-ban/vouchers/check). */
interface AppliedVoucher { code: string; campaignName: string; issuer: 'tgs' | 'brand'; kind: 'discount' | 'payment'; amount: number }
interface VoucherCheck { vouchers: AppliedVoucher[]; before: { total: number }; after: { total: number }; discount: number; payment: number }
/** Phần riêng của phiếu bán module phieu-ban: kênh (NT-BH-031), mã voucher của nháp + voucher đã áp lúc duyệt (NT-BH-026). */
type SaleExtra = { saleChannel?: string; saleChannelName?: string; voucherCodes?: string[]; vouchers?: AppliedVoucher[] | string[] };
const voucherCodesOf = (s: string) => [...new Set(s.split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean))];

const money = (n: number | undefined) => (n ? n.toLocaleString('vi-VN') : '');
const num = (s: string) => { const n = Number(s.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
let seq = 0;
const lineKey = () => `L${Date.now().toString(36)}${(seq++).toString(36)}`;

export function PhieuHangForm({ value, readOnly, saving, error, onSave, onClose, printScreen, helpKey = 'phieu-hang', startEdit }: {
  /** Mã màn (BH10, BH11, KHO01…) để nhớ mẫu in mặc định; không truyền thì không có nút In. */
  printScreen?: string;
  value: TradeDoc; readOnly: boolean; saving: boolean; error: unknown;
  onSave: (doc: TradeDoc) => void; onClose: () => void;
  /** Hướng dẫn của nút "? Hướng dẫn" ở tiêu đề (mặc định hướng dẫn phiếu hàng). */
  helpKey?: string;
  /** Mở bằng nút Sửa của danh sách: phiếu đã ghi vào thẳng chế độ sửa (không qua chế độ xem). */
  startEdit?: boolean;
}) {
  const info = KIND_INFO[value.docType];
  const [v, setV] = useState<TradeDoc>(value);
  const gate = useDocumentGate(readOnly ? undefined : v.docDate);
  // NT-BH-036: phiếu đã ghi (chưa duyệt) mở ở chế độ XEM như trước (khung hộp thoại chung viewFirst) — bấm Sửa / F2 mới sửa.
  const [viewing, setViewing] = useState(() => Boolean(value.docNo) && !readOnly && !startEdit);
  /** Ô nhập khoá: phiếu đã duyệt, hoặc đang xem. */
  const ro = readOnly || viewing;
  /** Vì sao ô đang khoá + cách gỡ (R-BLOCK-1). */
  const khoaTitle = !ro ? undefined : readOnly ? 'Phiếu đã duyệt — chỉ xem (bỏ duyệt ở danh sách rồi mới sửa)' : 'Đang xem — bấm Sửa (F2) để thay đổi';
  const [headOpen, setHeadOpen] = useState(() => value.lines.filter((l) => l.sku).length < 4);
  const [tab, setTab] = useState<'hang' | 'thu' | 'hoa-don'>('hang');
  const set = (p: Partial<TradeDoc>) => setV((x) => recompute({ ...x, ...p }));
  const setLine = (i: number, p: Partial<TradeLine>) => set({ lines: v.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  // [2026-11-11 Nguyễn Văn Thủy] Chưa thu / Thu tiền ngay ở đầu phiếu (đóng góp): chọn Thu ngay = một khoản thu đủ tổng phiếu,
  // số tiền tự theo tổng khi sửa dòng hàng cho tới khi người dùng tự gõ số tiền khác.
  const autoPay = useRef(false);
  useEffect(() => {
    const ps = v.payments ?? [];
    if (!autoPay.current || ps.length !== 1 || ps[0]!.amount === v.totals.total) return;
    setV((x) => ({ ...x, payments: [{ ...ps[0]!, amount: x.totals.total }] }));
  }, [v.totals.total]); // eslint-disable-line react-hooks/exhaustive-deps
  const thuNgay = (v.payments ?? []).length > 0;
  const setThuNgay = (on: boolean, method = 'TM') => {
    autoPay.current = on;
    set({ payments: on ? [{ methodCode: method, amount: v.totals.total }] : [] });
  };
  const methods = useQuery({ queryKey: ['payment-methods'], queryFn: () => api.get<PaymentMethod[]>('/api/v1/posting/payment-methods'), staleTime: 300_000, enabled: info.hasPayments }).data ?? [];
  const khoAll = useKho();
  const khoName = info.isTransfer ? `${khoLabel(khoAll, v.warehouseCode)} → ${khoLabel(khoAll, v.toWarehouseCode)}` : khoLabel(khoAll, v.warehouseCode);
  /** Phiếu bán / trả: giá theo cửa hàng + tồn sổ (theo kho đã chọn) — các loại phiếu khác không dùng. */
  const useQuote = v.docType === 'sale' || v.docType === 'sale_return';
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const fetchQuote = async (skus: string[]): Promise<Quote[]> => {
    if (!useQuote || !v.branchCode || !skus.length) return [];
    return api.get<Quote[]>('/api/v1/m/phieu-ban/quote', { branch: v.branchCode, warehouse: v.warehouseCode ?? '', skus: skus.join(',') }).catch(() => []);
  };
  // Đổi cửa hàng / kho → đọc lại tồn của mọi dòng (giá đã điền giữ nguyên, người lập tự sửa nếu cần).
  useEffect(() => {
    // NT-BH-036: đang xem thì chưa đọc; bấm Sửa thì đọc (trước đây form không biết chế độ xem nên đọc ngay khi mở).
    if (ro || !useQuote) return;
    const skus = [...new Set(v.lines.map((l) => l.sku).filter(Boolean))];
    void fetchQuote(skus).then((rows) => setQuotes(Object.fromEntries(rows.map((q) => [q.sku, q]))));
  }, [v.branchCode, v.warehouseCode, ro]); // eslint-disable-line react-hooks/exhaustive-deps

  // [2026-11-14 11:50 PM Võ Hoàng] NGHIEM-THU — NT-BH-015 §5 dòng 4: khuyến mại trên phiếu bán nhập tay (đóng góp)
  const usePromo = v.docType === 'sale';
  const [promo, setPromo] = useState<{ result: PromoResult; keys: Set<string>; sig: string; gifts: Record<string, PromoGiftInfo> } | null>(null);
  const [coupon, setCoupon] = useState('');
  const [promoErr, setPromoErr] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  /** Dấu của giỏ (mã, SL, giá, cửa hàng, ngày) — đổi sau khi áp thì nhắc áp lại. */
  const sigOf = (d: TradeDoc) => JSON.stringify([d.branchCode, d.docDate, d.lines.filter((l) => !(l.isGift && l.policyRef)).map((l) => [l.sku, l.qty, l.unitPrice, l.unit])]);
  const ratioOf = (l: TradeLine) => (quotes[l.sku] && quotes[l.sku]!.unit === l.unit ? quotes[l.sku]!.ratio : 1);
  const giftOf = (gifts: Record<string, PromoGiftInfo>) => (sku: string) => gifts[sku] ?? { name: sku, unit: '' };
  const runPromo = async () => {
    setPromoErr('');
    const lines = promoLines(v, ratioOf);
    if (!v.branchCode || !lines.length) { setPromoErr('Chọn cửa hàng và ít nhất một dòng hàng có số lượng trước'); return; }
    setPromoBusy(true);
    try {
      const coupons = coupon.split(/[\s,;]+/).filter(Boolean);
      const result = await api.post<PromoResult>('/api/v1/policies/evaluate', { docDate: v.docDate, branchCode: v.branchCode, lines, ...(coupons.length ? { coupons } : {}) });
      // Tên, ĐVT nhỏ nhất, thuế của hàng tặng: theo danh mục (Core tính quà theo đơn vị nhỏ nhất).
      const gifts: Record<string, PromoGiftInfo> = {};
      for (const sku of [...new Set(result.gifts.map((g) => g.sku))]) {
        const p = await api.get<CatalogProduct>(`/api/v1/catalog/products/${encodeURIComponent(sku)}`).catch(() => null);
        gifts[sku] = { name: p?.name ?? sku, unit: p?.unit ?? '', taxCode: p?.taxOutCode ?? thueMacDinh(v.docDate) };
      }
      const keys = new Set(result.applied.map((a) => a.policyRef.key));
      setPromo({ result, keys, sig: sigOf(v), gifts });
      setV(applyPromo(v, result, keys, giftOf(gifts), lineKey));
    } catch (e) { setPromoErr(errorText(e)); } finally { setPromoBusy(false); }
  };
  const togglePromo = (key: string, on: boolean) => {
    if (!promo) return;
    const keys = new Set(promo.keys);
    if (on) keys.add(key); else keys.delete(key);
    setPromo({ ...promo, keys, sig: sigOf(v) });
    setV(applyPromo(v, promo.result, keys, giftOf(promo.gifts), lineKey));
  };
  const promoStale = promo !== null && promo.sig !== sigOf(v);
  const promoReady = Boolean(v.branchCode) && v.lines.some((l) => l.sku && !l.isGift && l.qty > 0);

  // NT-BH-035 §3.1: kênh bán + mã voucher (chỉ phiếu bán của module phieu-ban). Voucher trừ lúc duyệt; nút Kiểm voucher hỏi trước số được giảm.
  const isSale = v.docType === 'sale';
  const sx = v as TradeDoc & SaleExtra;
  const channels = useQuery({
    queryKey: ['pos-channels'], enabled: isSale, staleTime: 300_000,
    queryFn: () => api.get<{ items: SaleChannel[] }>('/api/v1/m/pos/channels').then((r) => r.items).catch(() => [] as SaleChannel[]),
  }).data ?? [];
  const [voucherText, setVoucherText] = useState(() => (sx.voucherCodes ?? []).join(' '));
  const [vCheck, setVCheck] = useState<{ sig: string; result?: VoucherCheck; error?: string } | null>(null);
  const [vBusy, setVBusy] = useState(false);
  const voucherCodes = voucherCodesOf(voucherText);
  const vSig = JSON.stringify([voucherCodes, v.partner?.code, v.branchCode, v.docDate, v.totals.total]);
  const appliedVouchers = Array.isArray(sx.vouchers) ? (sx.vouchers as unknown[]).filter((x): x is AppliedVoucher => typeof x === 'object' && x !== null) : [];
  /** Đầu vào gửi API của phiếu bán: mã voucher là mảng mã (không gửi lại voucher đã áp), kênh theo mã. */
  const saleInput = (d: TradeDoc): TradeDoc => {
    if (!isSale) return d;
    const { voucherCodes: _c, vouchers: _v, ...rest } = d as TradeDoc & SaleExtra;
    return { ...rest, ...(voucherCodes.length ? { vouchers: voucherCodes } : {}) } as TradeDoc;
  };
  const checkVoucher = async () => {
    setVBusy(true);
    try {
      const result = await api.post<VoucherCheck>('/api/v1/m/phieu-ban/vouchers/check', { ...saleInput(v), ...(v.id ? { id: v.id } : {}) });
      setVCheck({ sig: vSig, result });
    } catch (e) { setVCheck({ sig: vSig, error: errorText(e) }); } finally { setVBusy(false); }
  };

  /** Chọn mã hàng → điền tên, ĐVT bán chính, đơn giá bảng giá công ty, loại thuế của mặt hàng. */
  const pickItem = async (i: number, sku: string) => {
    setLine(i, { sku });
    if (!sku) return;
    try {
      const p = await api.get<CatalogProduct>(`/api/v1/catalog/products/${encodeURIComponent(sku)}`);
      const unit = p.units.find((u) => u.isDefault)?.unit ?? p.unit;
      const price = p.prices.find((x) => x.unit === unit)?.price ?? undefined;
      const taxCode = info.taxDir === 'input' ? p.taxInCode ?? p.taxOutCode ?? thueMacDinh(v.docDate) : info.taxDir === 'output' ? p.taxOutCode ?? thueMacDinh(v.docDate) : undefined;
      // Bảng giá bán là giá ĐÃ gồm thuế → quy về đơn giá trước thuế (phiếu tính thuế trên tiền trước thuế). Mua hàng: chưa có
      // giá nhập trong danh mục → để 0 cho người nhập gõ theo hoá đơn.
      const rate = TAX_RATES[taxCode ?? ''] ?? 0;
      // Phiếu bán / trả: giá theo bảng giá của cửa hàng (đã gồm thuế, ĐVT mặc định); cửa hàng chưa có giá → giá công ty như cũ.
      const q = (await fetchQuote([sku]))[0];
      if (q) setQuotes((x) => ({ ...x, [sku]: q }));
      const shopPrice = q?.price ?? null;
      const unitPrice = info.isTransfer ? undefined : info.taxDir === 'output' && (shopPrice ?? price) ? roundPrice((shopPrice ?? price)! / (1 + rate / 100)) : 0;
      setLine(i, { sku, name: p.name, unit: shopPrice !== null && q?.unit ? q.unit : unit, unitPrice, taxCode });
    } catch { /* mã chỉ có ở kho, chưa có trong danh mục hàng: giữ mã, nhập tay tên */ }
  };
  const addLine = () => set({ lines: [...v.lines, { lineKey: lineKey(), sku: '', name: '', unit: '', qty: 1, unitPrice: 0, amountBeforeTax: 0, taxCode: info.taxDir ? thueMacDinh(v.docDate) : undefined }] });
  const paid = (v.payments ?? []).reduce((s, p) => s + p.amount, 0);
  const problems = [
    !v.docDate && 'Chưa nhập ngày',
    !v.branchCode && 'Chưa chọn chi nhánh',
    info.isTransfer && !v.toBranchCode && 'Chưa chọn chi nhánh nhận',
    info.isTransfer && v.toBranchCode === v.branchCode && (v.warehouseCode ?? '') === (v.toWarehouseCode ?? '') && 'Cùng chi nhánh thì kho xuất và kho nhận phải khác nhau',
    info.partner === 'supplier' && !v.partner?.code && 'Chưa chọn nhà cung cấp',
    !v.lines.length && 'Chưa có dòng hàng',
    v.lines.some((l) => !l.sku || !(l.qty > 0)) && 'Có dòng thiếu mã hàng hoặc số lượng',
    info.hasPayments && paid > v.totals.total && 'Tiền thu lớn hơn tổng phiếu',
    // [2026-11-21 Võ Hoàng] NGHIEM-THU — NT-BH-036: báo trước luật máy chủ "còn ghi nợ phải chọn khách" (domain/doc.ts) — không đợi bấm Ghi mới bị từ chối (đóng góp)
    info.partner === 'customer' && v.lines.length > 0 && !v.partner?.code && paid < v.totals.total && `Còn ghi nợ (${v.docType === 'sale_return' ? 'trả' : 'thu'} chưa đủ) — chọn khách hàng hoặc ${v.docType === 'sale_return' ? 'trả' : 'thu'} đủ tiền`,
  ].filter(Boolean) as string[];

  // [2026-11-21 Võ Hoàng] NGHIEM-THU — NT-BH-036: số cho khối Tổng tiền của Trợ lý (chỉ hiện, cùng cách tính với recompute) (đóng góp)
  const gross = v.lines.reduce((s, l) => s + (l.isGift ? 0 : Math.round((l.qty || 0) * (l.unitPrice || 0))), 0);
  const lineDiscount = v.lines.reduce((s, l) => s + (l.isGift ? 0 : l.discount || 0), 0);
  const vOk = vCheck?.result && vCheck.sig === vSig ? vCheck.result : null;
  const voucherDiscount = vOk ? vOk.discount : appliedVouchers.filter((x) => x.kind === 'discount').reduce((s, x) => s + x.amount, 0);
  const voucherPayment = vOk ? vOk.payment : appliedVouchers.filter((x) => x.kind === 'payment').reduce((s, x) => s + x.amount, 0);
  const isReturn = v.docType === 'sale_return';
  const totalLabel = v.docType === 'sale' ? 'Phải thu khách' : isReturn ? 'Phải trả khách' : 'Tổng tiền thanh toán';
  const showPromo = usePromo && (!ro || (v.policyRefs ?? []).length > 0);
  const showVoucher = isSale && (!ro || voucherCodes.length > 0 || appliedVouchers.length > 0);
  const lineCount = v.lines.filter((l) => l.sku).length;
  type Tab = 'hang' | 'thu' | 'hoa-don';
  const tabs: [Tab, string][] = [
    ['hang', `Hàng hoá (${lineCount})`],
    ...(info.hasPayments ? [['thu', isReturn ? 'Trả tiền khách' : 'Thu tiền'] as [Tab, string]] : []),
    ...(info.hasInvoice ? [['hoa-don', 'Hoá đơn'] as [Tab, string]] : []),
  ];
  const curTab: Tab = tabs.some((t) => t[0] === tab) ? tab : 'hang';
  const methodItems = methods.filter((m) => m.isActive !== false).map((m) => ({ code: m.code, name: m.name }));
  const dmy = (d?: string) => (d ? d.split('-').reverse().join('/') : '');

  return (
    <KhungPhieu
      title={`${info.label}${v.docNo ? ` ${v.docNo}` : ' (mới)'}`}
      badges={<span className={`badge ${v.status === 'approved' ? 'badge-ok' : 'badge-gray'}`}>{v.status === 'approved' ? 'Đã duyệt' : 'Nháp'}</span>}
      totalLabel={totalLabel} total={v.totals.total} helpKey={helpKey}
      viewing={viewing && !readOnly} readOnly={readOnly} onEdit={() => setViewing(false)} onClose={onClose}
      sideTitle={useQuote ? 'Trợ lý bán hàng' : 'Trợ lý phiếu'}
      keys="F9 - Thêm nhanh khách hàng, mặt hàng (khi đang ở ô chọn) · Ctrl + S - Ghi · Esc - Thoát"
      lyDo={() => (problems.length ? `Chưa ghi được: ${problems.join(' · ')}` : null)}
      footNote={error ? <span className="mh-bad">{errorText(error)}</span> : problems.length > 0 && !ro ? <span className="muted">Chưa ghi được: {problems.join(' · ')}</span> : null}
      footer={<>
        {printScreen && TRADE_TEMPLATES[v.docType] && value.id && <span data-view-ok><PrintButton screen={printScreen} templates={TRADE_TEMPLATES[v.docType]!} title="In phiếu theo nội dung đã ghi (sửa xong bấm Ghi rồi mới in)" getDocs={() => [value]} /></span>}
        {!ro && <button className="btn btn-primary" disabled={saving || problems.length > 0} title={problems.join('; ')} onClick={() => onSave(saleInput(v))}>Ghi</button>}
        {viewing && !readOnly && <button className="btn btn-primary" autoFocus title="Phím tắt: F2 / Enter" onClick={() => setViewing(false)}>Sửa</button>}
        <button className="btn" onClick={onClose}>Thoát</button>
      </>}
      side={<>
        <div className="mh-panel">
          <h4>Kiểm tra {ro ? null : problems.length ? <span className="badge badge-warn">{problems.length}</span> : <span className="badge badge-ok">ổn</span>}</h4>
          {ro ? <div className="mh-check ok">✓ {v.status === 'approved' ? 'Phiếu đã duyệt (đã ghi sổ) — chỉ xem' : 'Phiếu đã ghi nháp — bấm Sửa để thay đổi; Duyệt ở danh sách để ghi sổ'}</div>
            : problems.length ? problems.map((p) => <div key={p} className="mh-check warn">⚠ {p}</div>)
            : <div className="mh-check ok">✓ Đủ thông tin — bấm Ghi để lưu phiếu</div>}
          {!ro && (
            <ol className="mh-guide" style={{ marginTop: 6 }}>
              <li className={v.branchCode ? 'done' : ''}>Chọn <b>chi nhánh</b> và <b>kho</b> {info.isTransfer ? 'xuất / nhận' : v.docType === 'sale' ? 'xuất hàng' : 'nhận hàng'}</li>
              {info.partner && <li className={v.partner?.code ? 'done' : ''}>Chọn <b>{info.partnerLabel.toLowerCase()}</b>{info.partner === 'customer' ? ` (để trống = khách lẻ, chỉ khi ${isReturn ? 'trả' : 'thu'} đủ tiền)` : ''}</li>}
              <li className={v.lines.length > 0 && v.lines.every((l) => l.sku && l.qty > 0) ? 'done' : ''}>Thêm <b>dòng hàng</b>: mã, số lượng — tên, ĐVT, giá, thuế tự điền</li>
              {usePromo && <li className={promo || (v.policyRefs ?? []).length ? 'done' : ''}>Bấm <b>Áp khuyến mại</b> (nếu có chương trình đang chạy)</li>}
              <li><b>Ghi</b> để lưu nháp; <b>Duyệt</b> ở danh sách để ghi sổ (bút toán, công nợ, kho)</li>
            </ol>
          )}
        </div>

        {(showPromo || showVoucher) && (
          <div className="mh-panel">
            <h4>Khuyến mại & voucher</h4>
            {showPromo && (<>
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>Khuyến mại — Core tính như máy bán</div>
              {!ro && (
                <div className="kp-km-row">
                  <button type="button" className="btn btn-sm" disabled={promoBusy || !promoReady}
                    title={!v.branchCode ? 'Chọn cửa hàng trước' : !promoReady ? 'Thêm ít nhất một dòng hàng có số lượng' : promoBusy ? 'Đang tính, chờ kết quả' : 'Tính chương trình bán (BH12) + khuyến mại (BH18) đang chạy ở cửa hàng tại ngày phiếu'}
                    onClick={() => void runPromo()}>{promoBusy ? 'Đang tính…' : promo ? 'Áp khuyến mại lại' : 'Áp khuyến mại'}</button>
                  <input className="input mono" placeholder="Mã giảm giá (nếu có)" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} />
                  {(promo || (v.policyRefs ?? []).length > 0) && <button type="button" className="btn btn-sm" title="Bỏ mọi khuyến mại đã áp (dòng quà, tiền giảm)" onClick={() => { setPromo(null); setV(clearPromo(v)); }}>Bỏ khuyến mại</button>}
                </div>
              )}
              {!ro && promoStale && <div style={{ color: 'var(--warn, #b45309)', fontSize: 12, marginTop: 4 }}>Đã đổi dòng hàng / cửa hàng / ngày sau khi áp — bấm Áp khuyến mại lại</div>}
              {promoErr && <div className="alert alert-bad" style={{ marginTop: 6 }}>{promoErr}</div>}
              {promo && (
                <table className="grid-table" style={{ width: '100%', marginTop: 6 }}>
                  <thead><tr><th style={{ width: 30 }} title="Bỏ chọn = không áp chương trình này" /><th style={{ width: 110 }}>Chương trình</th><th>Kết quả</th></tr></thead>
                  <tbody>
                    {promo.result.applied.map((a) => (
                      <tr key={a.policyRef.key}>
                        <td style={{ textAlign: 'center' }}><input type="checkbox" checked={promo.keys.has(a.policyRef.key)} title="Bỏ chọn = không áp chương trình này" onChange={(e) => togglePromo(a.policyRef.key, e.target.checked)} /></td>
                        <td className="mono" title={`${a.ruleContract} · bản ${a.policyRef.version}`}>{a.policyRef.key}</td>
                        <td>{a.explain}</td>
                      </tr>
                    ))}
                    {promo.result.skipped.map((x) => (
                      <tr key={`s-${x.key}`} className="muted"><td /><td className="mono">{x.key}</td><td>Không áp: {x.reason}</td></tr>
                    ))}
                    {!promo.result.applied.length && !promo.result.skipped.length && <tr><td colSpan={3} className="muted">Không có chương trình nào đang chạy ở cửa hàng này tại ngày phiếu</td></tr>}
                  </tbody>
                </table>
              )}
              {!promo && (v.policyRefs ?? []).length > 0 && (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Đã áp: {(v.policyRefs ?? []).map((p) => `${p.key} (bản ${p.version})`).join(', ')}</div>
              )}
            </>)}
            {showVoucher && (
              <div style={showPromo ? { borderTop: '1px solid var(--line-soft)', marginTop: 8, paddingTop: 6 } : undefined}>
                <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>Voucher — trừ lúc duyệt</div>
                {!ro && (
                  <div className="kp-km-row">
                    <input className="input mono" placeholder="Mã voucher (nhiều mã: cách nhau dấu cách)" value={voucherText}
                      onChange={(e) => setVoucherText(e.target.value.toUpperCase())} />
                    <button type="button" className="btn btn-sm" disabled={vBusy || !voucherCodes.length || !v.branchCode}
                      title={!voucherCodes.length ? 'Nhập mã voucher trước' : !v.partner?.code ? 'Voucher gắn SĐT khách — chọn khách trước' : 'Kiểm mã và tính số được giảm (chưa ghi, chưa giữ mã)'}
                      onClick={() => void checkVoucher()}>{vBusy ? 'Đang kiểm…' : 'Kiểm voucher'}</button>
                  </div>
                )}
                {!ro && vCheck && vCheck.sig !== vSig && <div style={{ color: 'var(--warn, #b45309)', fontSize: 12, marginTop: 4 }}>Đã đổi mã / khách / dòng hàng sau khi kiểm — bấm Kiểm voucher lại</div>}
                {vCheck?.error && vCheck.sig === vSig && <div className="alert alert-bad" style={{ marginTop: 6 }}>{vCheck.error}</div>}
                {vCheck?.result && vCheck.sig === vSig && (
                  <div className="alert alert-ok" style={{ marginTop: 6 }}>
                    {vCheck.result.vouchers.map((x) => `${x.code} (${x.campaignName}): ${x.kind === 'discount' ? 'giảm' : 'thanh toán'} ${money(x.amount) || 0}`).join(' · ')}
                    {' — '}tổng phiếu {money(vCheck.result.before.total) || 0} → <b>{money(vCheck.result.after.total) || 0}</b>
                    {vCheck.result.payment > 0 && <> · voucher hãng trả {money(vCheck.result.payment)}</>}
                  </div>
                )}
                {ro && appliedVouchers.length > 0 && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Đã áp: {appliedVouchers.map((x) => `${x.code} ${x.kind === 'discount' ? 'giảm' : 'thanh toán'} ${money(x.amount) || 0}`).join(' · ')}</div>
                )}
                {ro && !appliedVouchers.length && voucherCodes.length > 0 && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Mã: {voucherCodes.join(', ')}</div>}
              </div>
            )}
          </div>
        )}

        {!info.isTransfer && (
          <div className="mh-panel">
            <h4>Tổng tiền</h4>
            <div className="mh-kv">
              <span>Tiền hàng</span><span>{money(gross) || 0}</span>
              <span>Chiết khấu</span><span>{lineDiscount ? `− ${money(lineDiscount)}` : 0}</span>
              <span>Tiền trước thuế</span><span>{money(v.totals.beforeTax) || 0}</span>
              <span>Thuế GTGT</span><span>{money(v.totals.tax) || 0}</span>
              <span className="total">{totalLabel}</span><span className="total">{money(v.totals.total) || 0}</span>
              {voucherDiscount > 0 && <><span title="Voucher trừ lúc duyệt">Giảm voucher (lúc duyệt)</span><span>− {money(voucherDiscount)}</span></>}
              {voucherPayment > 0 && <><span>Voucher hãng trả</span><span>{money(voucherPayment)}</span></>}
              {info.hasPayments && <>
                <span>Đã {isReturn ? 'trả' : 'thu'}</span><span>{money(paid) || 0}</span>
                <span>Còn công nợ</span><span>{money(Math.max(0, v.totals.total - paid)) || 0}</span>
              </>}
            </div>
          </div>
        )}
      </>}>
      <DocumentGateBanner advisories={gate.advisories} />
      {!headOpen && (
        <div className="mh-head-mini" data-view-ok onClick={() => setHeadOpen(true)} title="Bấm để mở đầu phiếu">
          <span className="mono">{v.docNo || 'phiếu mới'}</span><span>{dmy(v.docDate)}</span>
          <span><b>{v.branchCode}</b> · kho {khoName}</span>
          {info.partner && <span>{v.partner ? <><b>{v.partner.code}</b> {v.partner.name}</> : info.partner === 'customer' ? 'Khách lẻ' : ''}</span>}
          {v.note && <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>{v.note}</span>}
        </div>
      )}
      <fieldset disabled={ro} title={khoaTitle} style={{ border: 0, padding: 0, margin: 0, display: headOpen ? undefined : 'none' }}>
        <div className="mh-head">
          <Field label="Số phiếu" hint="Để trống: tự cấp khi ghi"><input className="input mono" value={v.docNo} placeholder="Tự cấp khi ghi" onChange={(e) => set({ docNo: e.target.value.trim() })} /></Field>
          <Field label="Ngày (*)"><input className="input" type="date" value={v.docDate} onChange={(e) => set({ docDate: e.target.value })} /></Field>
          <div className="span2"><Field label={info.isTransfer ? 'Chi nhánh xuất (*)' : 'Chi nhánh lập chứng từ (*)'}><BranchPicker value={v.branchCode} onChange={(c) => set({ branchCode: c })} activeOnly /></Field></div>
          <div className="span2"><Field label={info.isTransfer ? 'Kho xuất (*)' : v.docType === 'sale' ? 'Kho xuất hàng (*)' : v.docType === 'sale_return' || v.docType === 'purchase' ? 'Kho nhận hàng (*)' : 'Kho (*)'} hint="Mọi dòng hàng đi theo kho này">
            <ChonKho branchCode={v.branchCode} value={v.warehouseCode ?? ''} disabled={ro} onChange={(c) => set({ warehouseCode: c || undefined })} />
          </Field></div>
          {info.isTransfer && <div className="span2"><Field label="Chi nhánh nhận (*)" hint="Chọn đúng chi nhánh xuất để chuyển giữa hai kho trong cùng chi nhánh"><BranchPicker value={v.toBranchCode ?? ''} onChange={(c) => set({ toBranchCode: c })} activeOnly /></Field></div>}
          {info.isTransfer && <div className="span2"><Field label="Kho nhận (*)">
            <ChonKho branchCode={v.toBranchCode ?? ''} value={v.toWarehouseCode ?? ''} disabled={ro} avoid={v.toBranchCode === v.branchCode ? v.warehouseCode : undefined} onChange={(c) => set({ toWarehouseCode: c || undefined })} />
          </Field></div>}
          {info.partner && (
            <div className="span2"><Field label={`${info.partnerLabel}${info.partner === 'supplier' ? ' (*)' : ''}`} hint={info.partner === 'customer' ? 'Để trống = Khách lẻ' : undefined}>
              <PartnerPicker value={v.partner?.code ?? ''} activeOnly addKind="customer" onChange={async (c) => {
                if (!c) return set({ partner: undefined });
                const row = (await api.get<{ code: string; name: string; taxCode?: string | null }[]>('/api/v1/partners', { search: c, pageSize: 5 }).catch(() => [])).find((x) => x.code === c);
                set({ partner: { code: c, name: row?.name ?? c, taxCode: row?.taxCode ?? undefined } });
              }} />
            </Field></div>
          )}
          {isSale && (
            <Field label="Kênh bán" hint="Trống = kênh mặc định (Gần shop). Danh mục ở Kênh bán hàng (máy bán POS)">
              <select className="input" value={sx.saleChannel ?? ''} onChange={(e) => {
                const c = channels.find((x) => x.code === e.target.value);
                set({ saleChannel: c?.code, saleChannelName: c?.name } as Partial<TradeDoc>);
              }}>
                <option value="">— kênh mặc định —</option>
                {channels.filter((c) => c.active || c.code === sx.saleChannel).map((c) => <option key={c.code} value={c.code}>{c.name}{c.active ? '' : ' (đã ngừng)'}</option>)}
                {sx.saleChannel && !channels.some((c) => c.code === sx.saleChannel) && <option value={sx.saleChannel}>{sx.saleChannelName ?? sx.saleChannel}</option>}
              </select>
            </Field>
          )}
          {info.hasOriginal && <Field label="Phiếu gốc" hint="Số phiếu bán / mua gốc (tham khảo, không bắt buộc)"><input className="input mono" value={v.originalDocNo ?? ''} onChange={(e) => set({ originalDocNo: e.target.value.trim() || undefined })} /></Field>}
          {info.partner === 'supplier' && <Field label="Hạn thanh toán"><input className="input" type="date" value={v.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value || undefined })} /></Field>}
          {info.hasPayments && (
            <div className="span2"><Field label={isReturn ? 'Trả tiền' : 'Thu tiền'}>
              <div className="ct-pay" role="radiogroup" aria-label="Thanh toán">
                <label className="checkbox"><input type="radio" disabled={ro} title={khoaTitle} checked={!thuNgay} onChange={() => setThuNgay(false)} /> {isReturn ? 'Chưa trả tiền (trừ công nợ)' : 'Chưa thu tiền (ghi công nợ)'}</label>
                <label className="checkbox"><input type="radio" disabled={ro} title={khoaTitle} checked={thuNgay} onChange={() => setThuNgay(true)} /> {isReturn ? 'Trả tiền ngay' : 'Thu tiền ngay'}</label>
                {thuNgay && (v.payments ?? []).length === 1 && (
                  <span style={{ width: 180 }}><ListPicker disabled={ro} items={methodItems} value={v.payments![0]!.methodCode} onChange={(c) => set({ payments: [{ ...v.payments![0]!, methodCode: c }] })} placeholder="Hình thức" /></span>
                )}
              </div>
            </Field></div>
          )}
          <div className="span4"><Field label="Ghi chú" full><input className="input" value={v.note ?? ''} onChange={(e) => set({ note: e.target.value })} /></Field></div>
        </div>
      </fieldset>

      <div className="tabs kp-tabs">
        {tabs.map(([k, l]) => <button key={k} type="button" className={`tab ${curTab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
        <button type="button" className="btn btn-xs" data-view-ok style={{ alignSelf: 'center', marginLeft: 'auto' }} onClick={() => setHeadOpen(!headOpen)} title={headOpen ? 'Thu gọn đầu phiếu thành một dòng — bảng hàng rộng chỗ hơn' : 'Mở lại đầu phiếu'}>{headOpen ? 'Thu gọn đầu phiếu ▴' : 'Mở đầu phiếu ▾'}</button>
      </div>

      {curTab === 'hang' && (<>
        {!ro && (
          <div className="lines-bar">
            <button type="button" className="btn btn-sm btn-primary" onClick={addLine}>+ Thêm dòng</button>
            <span className="muted" style={{ fontSize: 12 }}>Gõ mã hoặc tên ở ô Mã hàng (F9: thêm nhanh mặt hàng mới) — tên, ĐVT, giá, thuế tự điền</span>
          </div>
        )}
        <div className="kp-lines-box">
          {/* NT-BH-036: bảng cột cố định (khung-phieu.css) — bề rộng cột gọn lại để Tên hàng đủ chỗ cạnh khung Trợ lý. */}
          {/* [2026-11-21 Võ Hoàng] NGHIEM-THU — NT-BH-036: tối thiểu 1000px (phần trái ~1070px khi mở Trợ lý) để không tràn mất cột Tiền thuế, tổng (đóng góp) */}
          <table className="grid-table" style={{ width: '100%', minWidth: info.isTransfer ? 840 : 1000 }}>
            <thead>
              <tr>
                <th style={{ width: 34 }}>#</th><th style={{ width: 120 }}>Mã hàng</th><th>Tên hàng</th><th style={{ width: 70 }}>ĐVT</th><th style={{ width: info.isTransfer ? 200 : 90 }} title="Theo kho ở đầu phiếu">Kho</th><th style={{ width: 70 }}>SL</th>
                {!info.isTransfer && <><th style={{ width: 105 }}>Đơn giá</th><th style={{ width: 90 }}>Chiết khấu</th><th style={{ width: 105 }}>Tiền hàng</th><th style={{ width: 90 }}>Thuế</th><th style={{ width: 90 }}>Tiền thuế</th></>}
                <th style={{ width: 34 }} />
              </tr>
            </thead>
            <tbody>
              {v.lines.map((l, i) => (
                <tr key={l.lineKey}>
                  <td style={{ textAlign: 'center' }}>{i + 1}</td>
                  <td>{ro ? <span className="mono">{l.sku}</span> : <ItemPicker value={l.sku} onChange={(c) => void pickItem(i, c)} hideName canAdd />}</td>
                  <td><input className="input" value={l.name} disabled={ro} title={khoaTitle} onChange={(e) => setLine(i, { name: e.target.value })} /></td>
                  <td><input className="input" value={l.unit} disabled={ro} title={khoaTitle} onChange={(e) => setLine(i, { unit: e.target.value })} /></td>
                  <td className="muted" style={{ fontSize: 12 }}>{khoName}</td>
                  <td>
                    <NumInput value={l.qty} disabled={ro} title={khoaTitle} onChange={(n) => setLine(i, { qty: n ?? 0 })} />
                    {/* Bán vượt tồn theo sổ của kho đã chọn: chỉ cảnh báo (máy bán cũng không chặn). */}
                    {!ro && v.docType === 'sale' && quotes[l.sku] && l.qty * (quotes[l.sku]!.ratio || 1) > quotes[l.sku]!.stock && (
                      <div className="muted" style={{ color: 'var(--warn, #b45309)', fontSize: 11 }} title="Tồn theo sổ kế toán của kho đã chọn (ĐVT nhỏ nhất)">tồn sổ còn {quotes[l.sku]!.stock.toLocaleString('vi-VN')}</div>
                    )}
                  </td>
                  {!info.isTransfer && <>
                    <td><NumInput value={l.unitPrice} disabled={ro || l.isGift} title="Đơn giá có thể có số lẻ: gõ dấu phẩy, vd 506.018,52" onChange={(n) => setLine(i, { unitPrice: n ?? 0 })} /></td>
                    <td>
                      <input className="input num" value={money(l.discount)} disabled={ro || l.isGift || Boolean(l.policyRef)} title={l.policyRef ? `Giảm theo chương trình ${l.policyRef.key} (bản ${l.policyRef.version}) — đổi ở khối Khuyến mại & voucher (Trợ lý)` : undefined} onChange={(e) => setLine(i, { discount: num(e.target.value) })} />
                      {l.policyRef && <div className="muted mono" style={{ fontSize: 11 }} title={`Chương trình ${l.policyRef.key} bản ${l.policyRef.version}`}>KM {l.policyRef.key}</div>}
                    </td>
                    <td className="num">{l.isGift ? <span className="muted">tặng</span> : money(l.amountBeforeTax)}</td>
                    <td><ChonThue value={l.taxCode} ngay={v.docDate} disabled={ro} title={ro ? 'Phiếu đang ở chế độ xem — không đổi được loại thuế' : undefined} onChange={(c) => setLine(i, { taxCode: c })} /></td>
                    <td className="num">{money(l.taxAmount)}</td>
                  </>}
                  <td>{!ro && <button type="button" className="btn btn-xs" title="Bỏ dòng" onClick={() => set({ lines: v.lines.filter((_, j) => j !== i) })}>×</button>}</td>
                </tr>
              ))}
              {!v.lines.length && <tr><td colSpan={info.isTransfer ? 8 : 13} className="muted" style={{ textAlign: 'center', padding: 12 }}>Chưa có dòng hàng{ro ? '' : ' — bấm "+ Thêm dòng"'}</td></tr>}
            </tbody>
            {!info.isTransfer && (
              <tfoot>
                <tr><td colSpan={8} style={{ textAlign: 'right' }}><b>Cộng</b></td><td className="num"><b>{money(v.totals.beforeTax)}</b></td><td /><td className="num"><b>{money(v.totals.tax)}</b></td><td /></tr>
                <tr><td colSpan={10} style={{ textAlign: 'right' }}><b>Tổng thanh toán</b></td><td className="num"><b>{money(v.totals.total)}</b></td><td /></tr>
              </tfoot>
            )}
          </table>
        </div>
      </>)}

      {curTab === 'thu' && info.hasPayments && (
        <fieldset className="fgroup" disabled={ro} title={khoaTitle}>
          <legend>{isReturn ? 'Trả tiền khách' : 'Thu tiền'} — để trống = ghi công nợ</legend>
          <div className="full">
            {(v.payments ?? []).map((p, i) => (
              <div key={i} className="row" style={{ gap: 6, marginBottom: 4 }}>
                <div style={{ width: 240 }}><ListPicker items={methodItems} value={p.methodCode} onChange={(c) => set({ payments: (v.payments ?? []).map((x, j) => (j === i ? { ...x, methodCode: c } : x)) })} placeholder="Hình thức" /></div>
                <input className="input num" style={{ width: 160 }} value={money(p.amount)} onChange={(e) => { autoPay.current = false; set({ payments: (v.payments ?? []).map((x, j) => (j === i ? { ...x, amount: num(e.target.value) } : x)) }); }} />
                <input className="input" style={{ flex: 1 }} placeholder="Mã giao dịch (nếu có)" value={p.reference ?? ''} onChange={(e) => set({ payments: (v.payments ?? []).map((x, j) => (j === i ? { ...x, reference: e.target.value || undefined } : x)) })} />
                {!ro && <button type="button" className="btn btn-xs" onClick={() => set({ payments: (v.payments ?? []).filter((_, j) => j !== i) })}>×</button>}
              </div>
            ))}
            {!(v.payments ?? []).length && <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Chưa có khoản {isReturn ? 'trả' : 'thu'} — phiếu ghi công nợ.</div>}
            {!ro && <button type="button" className="btn btn-sm" onClick={() => set({ payments: [...(v.payments ?? []), { methodCode: 'TM', amount: Math.max(0, v.totals.total - paid) }] })}>+ Thêm khoản {isReturn ? 'trả' : 'thu'}</button>}
            <span className="muted" style={{ marginLeft: 10, fontSize: 12 }}>Đã {isReturn ? 'trả' : 'thu'} {money(paid) || 0} · còn công nợ {money(Math.max(0, v.totals.total - paid)) || 0}</span>
          </div>
        </fieldset>
      )}

      {curTab === 'hoa-don' && info.hasInvoice && (
        <fieldset className="fgroup" disabled={ro} title={khoaTitle}>
          <legend>Hoá đơn (nếu có)</legend>
          <Field label="Số hoá đơn"><input className="input mono" value={v.invoice?.no ?? ''} onChange={(e) => set({ invoice: e.target.value ? { no: e.target.value.trim(), serial: v.invoice?.serial, date: v.invoice?.date || v.docDate } : undefined })} /></Field>
          <Field label="Ký hiệu"><input className="input mono" value={v.invoice?.serial ?? ''} disabled={!v.invoice} onChange={(e) => v.invoice && set({ invoice: { ...v.invoice, serial: e.target.value.trim() } })} /></Field>
          <Field label="Ngày hoá đơn"><input className="input" type="date" value={v.invoice?.date ?? ''} disabled={!v.invoice} onChange={(e) => v.invoice && set({ invoice: { ...v.invoice, date: e.target.value } })} /></Field>
        </fieldset>
      )}
    </KhungPhieu>
  );
}
