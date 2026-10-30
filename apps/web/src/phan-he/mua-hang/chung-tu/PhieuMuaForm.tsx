/**
 * PHIẾU MUA HÀNG THÔNG MINH — một form cho mọi chứng từ phía mua (đơn đặt, nhập mua, trả / đổi hàng, nhận / xuất quà, chi phí,
 * ứng trước, trả tiền). Tổng tiền tính ngay khi gõ (bộ máy dùng chung); sau mỗi lần sửa, máy chủ phân tích bằng số liệu thật
 * và bảng "Trợ lý mua hàng" bên phải cập nhật:
 *   1. Kiểm tra: lệch giá, vượt hạn mức, thiếu / thừa quà, trùng / lệch hoá đơn, thiếu lô, cận date (bấm để nhảy tới dòng)
 *   2. Giá mua của dòng đang chọn: giá cố định + 5 lần nhập gần nhất (mọi nguồn nhập)
 *   3. Chính sách tự áp · 4. Công nợ & hạn mức (nợ thật theo sổ) · 5. Tổng tiền, hạn thanh toán, CKTT
 * Duyệt = ghi sổ thật (bút toán, công nợ, kho). Còn cảnh báo chặn thì không duyệt được; vượt hạn mức thì người có quyền
 * "Duyệt ngoại lệ" (ghi lý do vào nhật ký).
 */
import { Link } from 'react-router-dom';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { gridNav } from '@/lib/gridNav';
import { DockScope, MinimizeButton, useDockWindow } from '@/layout/WindowDock';
import { refOf } from '@ketoan/contracts';
import {
  COST_TYPES, TAX_RATE, amountTax, autoLineType, baseUnitOf, brandMix, ckttFor, computeDoc, defaultUnitFor, orderProgress, orderReconcile, priceFor, promoBoard, ratioOf, receiptFromOrder, skuInfo, syncGifts, termText,
  type LineType, type PDoc, type PLine, type ProductUnit, type PromoRow, type SupplierProduct,
  type Check, type TraceItem,
} from '@ketoan/contracts/mua-hang';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { Modal, NumInput, openNextInEdit } from '@/components/ui';
import { roundPrice } from '@/lib/format';
import { HelpDrawer } from '@/components/HelpDrawer';
import { BranchPicker } from '@/components/filters';
import { ItemPicker, ListPicker, PartnerPicker, useAccountList } from '@/components/pickers';
import { GOODS_KINDS, KIND_LABEL, P, STATUS_LABEL, TAX_LABEL, lastUsed, today, purchaseApi, useBrands, useNames, useSupplierBrands, vnd, type Analysis, type MhData, type StoredDoc } from '../du-lieu';
import { CheckList, UsageBar, dmy, statusBadge } from '../chung';
import { ChonMatHang, type CatalogItem } from '../thanh-phan/ChonMatHang';
import { NhapExcelChung } from '../thanh-phan/NhapExcelChung';
import { nhapDongHang, xuatDongHang, type DongHangCot, type DongNhap } from './DongHangExcel';
import { BangKhuyenMai, KhuyenMaiBar, KhuyenMaiPanel } from '../thanh-phan/KhuyenMai';
import { TermEditor } from '../chinh-sach/quyTac';
import { TepDinhKem } from '../dinh-kem/TepDinhKem';
import { NccInfo } from '../thanh-phan/NccInfo';
import { LichSu } from '../thanh-phan/LichSu';
import { DienMatHang } from './DienMatHang';
import { ProductEditor } from '../../../features/catalog/ProductsPage';
import { factsText, stockSnapshot, useHierarchy, useNeedOf } from '../ton-max/api';
import { XemMauNcc, xuatMauNcc, type MauNccInfo } from './MauDonNcc';
import { PrintButton } from '@/components/print';
import { STATE_LABEL, invoiceApi, receiptPartsFromInvoice } from '../hoa-don/api';
import { invoiceLabel, sameInvoice } from '@ketoan/contracts/mua-hang';
import { ChonChungTu, OChonChungTu } from '../thanh-phan/ChonChungTu';
import { HoaDonModal } from '../hoa-don/HoaDonModal';
import type { InvoiceRow } from '../hoa-don/api';
import { layPhieuIn, mauInCua } from './mauIn';

type Tab = 'hang' | 'thanh-toan' | 'hoa-don' | 'hach-toan' | 'gia-von' | 'tep' | 'tep-ncc' | 'lich-su';
const LINE_TYPE: Record<LineType, string> = { buy: 'Hàng mua', gift_seller: 'KM người bán (chia giá)', gift_consumer: 'KM người tiêu dùng / quà' };
const num = (s: string) => { const n = Number(s.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const fmt = (n: number | undefined) => (n ? n.toLocaleString('vi-VN', { maximumFractionDigits: 4 }) : '');
let seq = 0;
const newKey = () => `L${Date.now().toString(36)}${(seq++).toString(36)}`;
interface CatalogProduct { sku: string; name: string; unit: string; taxInCode: string | null; brandCode?: string | null }

export function PhieuMuaForm({ value, data, onClose, onSaved, onOpen }: { value: PDoc; data: MhData; onClose: () => void; onSaved: () => void; onOpen?: (d: PDoc) => void }) {
  const [v, setV] = useState<PDoc>(value);
  const [stored, setStored] = useState<StoredDoc | undefined>(data.docs.find((d) => d.id === value.id));
  const [a, setA] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [tab, setTab] = useState<Tab>(GOODS_KINDS.includes(value.kind) ? 'hang' : 'hach-toan');
  // Đầu phiếu thu gọn được thành một dòng tóm tắt — nhường chỗ cho bảng hàng. Phiếu có từ 4 dòng hàng thì mở ra đã thu gọn.
  const [headOpen, setHeadOpen] = useState(() => value.lines.filter((l) => l.sku).length < 4);
  const autoFolded = useRef(value.lines.filter((l) => l.sku).length >= 4);
  useEffect(() => { if (!autoFolded.current && v.lines.filter((l) => l.sku).length >= 4) { autoFolded.current = true; setHeadOpen(false); } }, [v.lines]);
  const [selKey, setSelKey] = useState<string>(value.lines.find((l) => l.lineType === 'buy')?.lineKey ?? '');
  // Menu chuột phải trên dòng hàng: nhân đôi, thêm dòng ĐVT lẻ cùng mã, chèn dòng trống, xoá.
  const [ctx, setCtx] = useState<{ x: number; y: number; key: string } | null>(null);
  useEffect(() => {
    if (!ctx) return;
    const off = () => setCtx(null);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtx(null); };
    window.addEventListener('click', off); window.addEventListener('scroll', off, true); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('click', off); window.removeEventListener('scroll', off, true); window.removeEventListener('keydown', esc); };
  }, [ctx]);
  const [payDate, setPayDate] = useState('');
  const [help, setHelp] = useState(false);
  const [fill, setFill] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickGoods, setPickGoods] = useState<{ text: string; lineType: LineType } | null>(null);
  const [promoOpen, setPromoOpen] = useState(false);
  const [excelLines, setExcelLines] = useState(false);
  const [promoNote, setPromoNote] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [dirty, setDirty] = useState(false);
  // Thu nhỏ xuống thanh dưới (giữ nguyên phiếu đang nhập); chấm cam ở ô = phiếu có thay đổi chưa lưu.
  const dock = useDockWindow(onClose, dirty, `mh:${value.id}`);
  const names = useNames();
  const brands = useBrands(data.policies);
  const nccBrands = useSupplierBrands(v.partnerCode || undefined);
  // Phiếu đã duyệt / huỷ: chỉ xem. Phiếu đã ghi (nháp, chờ duyệt): mở ở chế độ xem, bấm "Sửa" mới sửa; Gửi duyệt / Duyệt
  // vẫn bấm được khi đang xem (không đổi nội dung phiếu).
  const frozen = v.status === 'approved' || v.status === 'cancelled';
  const [viewing, setViewing] = useState(!value.id.startsWith('new-') && !frozen);
  const readOnly = frozen || viewing;
  useEffect(() => {
    if (!viewing || frozen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F2') { e.preventDefault(); setViewing(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewing, frozen]);
  // Mặt hàng chưa khai đủ ĐVT: mở form mặt hàng ngay trên phiếu, khai xong tải lại ĐVT của mã.
  const [productSku, setProductSku] = useState<string | null>(null);
  const [mauNcc, setMauNcc] = useState(false);
  const hier = useHierarchy();
  const branchWhs = hier.data?.branches.find((b) => b.code === v.branchCode)?.warehouses ?? [];
  // PHÂN KHO: phiếu có hàng ra / vào kho (trừ đơn đặt — đơn dùng "Giao tại kho") chọn MỘT phân kho ở đầu phiếu, mọi dòng đi theo.
  // Mặc định = kho mặc định của chi nhánh; đổi chi nhánh mà kho cũ không thuộc chi nhánh mới thì về kho mặc định của chi nhánh mới.
  const showKho = ['receipt', 'return', 'exchange', 'gift_in', 'gift_out'].includes(v.kind);
  const activeWhs = branchWhs.filter((w) => w.isActive || w.code === v.warehouseCode);
  const defaultWh = (branchWhs.find((w) => w.isDefault && w.isActive) ?? (branchWhs.filter((w) => w.isActive).length === 1 ? branchWhs.find((w) => w.isActive) : undefined))?.code ?? '';
  useEffect(() => {
    // Đơn đặt: "Giao tại kho" điền sẵn kho mặc định THẬT của chi nhánh (ghi rõ mã · tên), không để chữ "Kho mặc định" chung chung.
    if (v.kind !== 'order' || readOnly || !hier.data || !v.branchCode) return;
    if (v.deliveryWarehouse && branchWhs.some((w) => w.code === v.deliveryWarehouse)) return;
    if ((v.deliveryWarehouse ?? '') !== defaultWh) setV((x) => ({ ...x, deliveryWarehouse: defaultWh || undefined }));
  }, [v.kind, readOnly, hier.data, v.branchCode, v.deliveryWarehouse, defaultWh]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!showKho || readOnly || !hier.data || !v.branchCode) return;
    if (v.warehouseCode && branchWhs.some((w) => w.code === v.warehouseCode)) return;
    if ((v.warehouseCode ?? '') !== defaultWh) setV((x) => ({ ...x, warehouseCode: defaultWh || undefined }));
  }, [showKho, readOnly, hier.data, v.branchCode, v.warehouseCode, defaultWh]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Thông tin NCC + nơi giao cho mẫu đơn gửi NCC. */
  const mauInfo = (): MauNccInfo => {
    const p = names.partner(v.partnerCode) as { name?: string; address?: string | null; phone?: string | null } | undefined;
    const w = branchWhs.find((x) => x.code === v.deliveryWarehouse);
    return { code: v.partnerCode, name: p?.name ?? names.partnerName(v.partnerCode), address: p?.address ?? '', phone: p?.phone ?? '', branchName: names.branchName(v.branchCode), warehouse: w ? `${w.name} (${w.code})` : undefined };
  };
  const closeProduct = async () => {
    const sku = productSku; setProductSku(null);
    if (!sku) return;
    const before = unitsOf(sku);
    const u = await purchaseApi.units([sku]).catch(() => ({} as Record<string, ProductUnit[]>));
    setExtra((x) => ({ ...x, units: { ...x.units, ...u } }));
    // Điền lại dòng của mã vừa sửa: ĐVT trên dòng đã bị xoá / đổi tên ở modal → lấy ĐVT mua mặc định mới (không có thì ĐVT nhỏ nhất),
    // số lượng và đơn giá quy đổi theo tỉ lệ cũ → mới để tổng tiền không đổi. ĐVT còn nguyên thì giữ, tỉ lệ mới áp ngay khi phân tích lại.
    const after = u[sku] ?? [];
    setV((x) => ({ ...x, lines: x.lines.map((l) => {
      if (l.sku !== sku || !after.length || after.some((a) => a.unit.toLowerCase() === l.unit.toLowerCase())) return l;
      const to = after.find((a) => a.isPurchaseDefault) ?? after.find((a) => Number(a.ratio) === 1) ?? after[0]!;
      const from = before.find((b) => b.unit.toLowerCase() === l.unit.toLowerCase())?.ratio;
      const k = from ? from / Number(to.ratio) : 1;
      return { ...l, unit: to.unit, qty: Math.round(l.qty * k * 10000) / 10000, price: roundPrice(l.price / k) };
    }) })); // phân tích lại với ĐVT mới
  };
  const isGoods = GOODS_KINDS.includes(v.kind);
  const isGiftDoc = v.kind === 'gift_in' || v.kind === 'gift_out';
  // Ngày nghỉ lễ (MH12): hạn "N ngày làm việc" bỏ cả ngày lễ — trùng với hạn máy chủ tính (tab Hạn trả tiền, hạn lưu vào phiếu).
  const settings = useQuery({ queryKey: ['mua-hang', 'settings'], queryFn: () => api.get<{ holidays: string[] }>(`${P}/settings`), staleTime: 300_000 });
  const holidays = settings.data?.holidays;
  const set = (p: Partial<PDoc>) => { setV((x) => ({ ...x, ...p })); setDirty(true); };
  const setLine = (key: string, p: Partial<PLine>) => { setV((x) => ({ ...x, lines: x.lines.map((l) => (l.lineKey === key ? { ...l, ...p } : l)) })); setDirty(true); };

  // Máy chủ phân tích sau mỗi lần sửa (chờ 400 ms ngừng gõ); phiếu đã duyệt chỉ phân tích một lần.
  const seqRef = useRef(0);
  useEffect(() => {
    if (!v.partnerCode || !v.branchCode || !v.docDate) { setA(null); return; }
    const my = ++seqRef.current;
    const t = setTimeout(() => {
      setAnalyzing(true);
      purchaseApi.analyze(v).then((r) => { if (my === seqRef.current) { setA(r); setErr(''); } }).catch((e) => { if (my === seqRef.current) setErr(errorText(e)); }).finally(() => { if (my === seqRef.current) setAnalyzing(false); });
    }, 400);
    return () => clearTimeout(t);
  }, [v]);

  // Giá mua & ĐVT: lấy ngay khi chọn mã (chưa chờ phân tích) + bản máy chủ trả về trong phân tích.
  const [extra, setExtra] = useState<{ prices: SupplierProduct[]; units: Record<string, ProductUnit[]> }>({ prices: [], units: {} });
  const prices = useMemo(() => { const own = a?.prices ?? []; return [...own, ...extra.prices.filter((x) => !own.some((o) => o.id === x.id))]; }, [a, extra]);
  const unitsOf = (sku: string) => extra.units[sku] ?? a?.units[sku] ?? []; // extra = vừa tải lại (kể cả sau khi sửa ĐVT ở modal) nên mới hơn
  // ĐVT của các mã (giá vốn thực tế / ĐVT quy về ĐVT nhỏ nhất — mua Thùng + quà Lon vẫn đúng).
  const allUnits = useMemo(() => ({ ...extra.units, ...(a?.units ?? {}) }), [a, extra]);
  const calc = useMemo(() => computeDoc(v, data.policies, { holidays: holidays ?? [], units: allUnits }), [v, data.policies, holidays, allUnits]);
  // Lấy dòng hàng từ hoá đơn NCC đã nhập ở MH22 (cùng NCC): thay dòng hàng hiện có (hỏi trước), ghi số / ngày hoá đơn, giá chưa thuế.
  const invQ = useQuery({ queryKey: ['mua-hang', 'invoices', v.partnerCode, 'for-receipt'], enabled: v.kind === 'receipt' && !readOnly && Boolean(v.partnerCode), staleTime: 30_000, queryFn: () => invoiceApi.list({ partnerCode: v.partnerCode, status: 'active' }) });
  const nccInvoices = (invQ.data ?? []).filter((x) => x.state !== 'da_huy');
  const [fromInv, setFromInv] = useState<{ busy: boolean; note: string }>({ busy: false, note: '' });
  /** Hộp chọn chứng từ đang mở: đơn đặt / hoá đơn NCC / phiếu nhập gốc. */
  const [chon, setChon] = useState<'don' | 'hoa-don' | 'phieu' | null>(null);
  /** Hoá đơn còn dòng chưa nhận diện mã: mở hộp hoá đơn để chọn mã ngay (dứt điểm — phần mềm học), ghi xong mới điền phiếu. */
  const [hdFix, setHdFix] = useState<{ id: string; count: number } | null>(null);
  const takeInvoice = async (id: string, after?: 'fixed') => {
    if (!after && v.lines.some((l) => l.sku) && !window.confirm('Thay các dòng hàng đang có bằng dòng của hoá đơn NCC?')) return;
    setFromInv({ busy: true, note: '' });
    try {
      const r = await receiptPartsFromInvoice(id);
      if (r.unmatched && !after) { setFromInv({ busy: false, note: '' }); openNextInEdit(); setHdFix({ id, count: r.unmatched }); return; }
      set({ invoice: r.invoice, priceIncludesVat: false, lines: r.lines });
      setTab('hang');
      setFromInv({ busy: false, note: r.unmatched ? `${r.unmatched} dòng hoá đơn chưa nhận diện mã nên chưa đưa vào — chọn mã ở MH22 rồi lấy lại` : '' });
    } catch (e) { setFromInv({ busy: false, note: errorText(e) }); }
  };
  const fixedOf = (l: { sku: string; unit: string }) => priceFor(prices, { date: v.docDate, partnerCode: v.partnerCode || undefined, sku: l.sku, unit: l.unit }, unitsOf(l.sku));
  /** Đổi ĐVT của dòng: đơn giá quy đổi theo tỉ lệ (Thùng 48 hộp → Hộp chia 48). */
  /** Thao tác dòng (menu chuột phải, nút ⧉ ×, phím tắt). Dòng mới có lineKey mới, bỏ dấu quà tự sinh; giữ liên kết dòng đơn đặt
   *  (phiếu nhập theo đơn: dòng thùng + dòng hộp lẻ cùng cộng vào tiến độ của dòng đơn, quy về ĐVT nhỏ nhất). */
  const lineOps = {
    dup: (key: string, patch: Partial<PLine> = {}) => setV((x) => {
      const i = x.lines.findIndex((l) => l.lineKey === key);
      if (i < 0) return x;
      const k = newKey();
      const { autoGift: _a, ...src } = x.lines[i]!;
      setSelKey(k); setDirty(true);
      return { ...x, lines: [...x.lines.slice(0, i + 1), { ...src, lineKey: k, ...patch }, ...x.lines.slice(i + 1)] };
    }),
    /** Dòng cùng mã theo ĐVT nhỏ nhất (mua thùng + hộp lẻ): SL 1, đơn giá quy đổi về ĐVT nhỏ nhất. */
    loose: (key: string) => {
      const l = v.lines.find((x) => x.lineKey === key);
      if (!l) return;
      const us = unitsOf(l.sku), b = baseUnitOf(us), r = ratioOf(us, l.unit) || 1;
      lineOps.dup(key, { unit: b || l.unit, qty: 1, price: l.price ? roundPrice(l.price / r) : l.price, discountPct: undefined, discountAmt: undefined });
    },
    blank: (key: string) => setV((x) => {
      const i = x.lines.findIndex((l) => l.lineKey === key);
      const k = newKey();
      setSelKey(k); setDirty(true);
      return { ...x, lines: [...x.lines.slice(0, i + 1), { lineKey: k, sku: '', name: '', unit: '', qty: 1, price: 0, taxCode: 'V08', lineType: 'buy' }, ...x.lines.slice(i + 1)] };
    }),
    del: (key: string) => { setV((x) => ({ ...x, lines: x.lines.filter((l) => l.lineKey !== key) })); setDirty(true); },
  };
  const changeUnit = (l: PLine, unit: string) => {
    const us = unitsOf(l.sku);
    // Dòng đang theo giá NCC (hoặc chưa có giá) → lấy đúng giá niêm yết của ĐVT mới (thùng thường rẻ hơn lẻ × tỉ lệ);
    // giá gõ tay → quy đổi theo tỉ lệ ĐVT.
    const was = fixedOf(l), next = fixedOf({ sku: l.sku, unit });
    const listOld = was ? toDocBasis(was.price, was.row.priceIncludesVat, l.taxCode) : undefined;
    const fromList = next && (!l.price || (listOld !== undefined && Math.abs(listOld - l.price) < 0.01));
    const price = fromList ? toDocBasis(next!.price, next!.row.priceIncludesVat, l.taxCode) : l.price > 0 && us.length ? roundPrice((l.price / ratioOf(us, l.unit)) * ratioOf(us, unit)) : undefined;
    setLine(l.lineKey, { unit, ...(price !== undefined ? { price } : {}) });
  };
  // Phiếu đã duyệt / đã huỷ: khung Kiểm tra hiện kết quả CHỐT lúc duyệt (không còn "chặn duyệt" — đã duyệt rồi, kể cả duyệt ngoại lệ).
  const closed = v.status === 'approved' || v.status === 'cancelled';
  const checks: Check[] = closed
    ? [...(stored?.override ? [{ level: 'info' as const, code: 'override', text: `Đã duyệt ngoại lệ bởi ${stored.override.by}: ${stored.override.reason}` }] : []), ...((stored?.checks ?? a?.checks ?? []) as Check[]).map((c) => ({ ...c, blocking: false,
      // Đã duyệt ngoại lệ: dòng chặn cũ (vượt hạn mức) không còn là lỗi — hạ về cảnh báo, ghi rõ, không hiện ⛔ nữa.
      ...(stored?.override && c.level === 'error' ? { level: 'warn' as const, text: `${c.text} (đã duyệt ngoại lệ)` } : {}) }))]
    : a?.checks ?? [];
  const blocking = closed ? [] : a?.blocking ?? [];
  const sel = calc.lines.find((l) => l.lineKey === selKey);
  const lineLevel = (key: string) => (checks.some((c) => c.lineKey === key && c.level === 'error') ? 'bad' : checks.some((c) => c.lineKey === key && c.level === 'warn') ? 'warn' : '');
  const partnerDocs = data.docs.filter((d) => d.partnerCode === v.partnerCode && d.id !== v.id && d.status === 'approved');
  const orders = partnerDocs.filter((d) => d.kind === 'order');
  const receipts = partnerDocs.filter((d) => d.kind === 'receipt');

  /** Chọn mã hàng → tên, ĐVT, thuế đầu vào từ danh mục; đơn giá gợi ý = giá cố định (quy về loại giá của phiếu). */
  const pickSku = async (key: string, sku: string, lt?: LineType, wantUnit?: string) => {
    setLine(key, { sku });
    setSelKey(key);
    if (!sku) return;
    try {
      const [p, sp] = await Promise.all([
        api.get<CatalogProduct>(`/api/v1/catalog/products/${encodeURIComponent(sku)}`),
        purchaseApi.supplierProducts({ sku, ...(v.partnerCode ? { partnerCode: v.partnerCode, withGeneral: true } : {}) }).catch(() => ({ rows: [] as SupplierProduct[], units: {} as Record<string, ProductUnit[]> })),
      ]);
      setExtra((x) => ({ prices: [...x.prices.filter((r) => r.sku !== sku), ...sp.rows], units: { ...x.units, ...sp.units } }));
      const us = sp.units[sku] ?? [];
      const unit = (wantUnit && us.find((u) => u.unit.toLowerCase() === wantUnit.toLowerCase())?.unit) || defaultUnitFor(us, sp.rows, v.partnerCode, sku, p.unit);
      const taxCode = p.taxInCode ?? 'V08';
      const line = v.lines.find((l) => l.lineKey === key);
      const isBuy = (lt ?? line?.lineType) === 'buy';
      const fixed = priceFor(sp.rows, { date: v.docDate, partnerCode: v.partnerCode || undefined, sku, unit }, us);
      const rate = TAX_RATE[taxCode] ?? 0;
      const conv = (price: number, inc: boolean) => (inc === v.priceIncludesVat ? price : inc ? roundPrice(price / (1 + rate / 100)) : roundPrice(price * (1 + rate / 100)));
      const price = isBuy && fixed ? conv(fixed.price, fixed.row.priceIncludesVat) : line?.price ?? 0;
      const kind = skuInfo(sku).kind;
      // Tên, ĐVT, thuế suất, nhãn: theo danh mục mặt hàng (không sửa tay trên phiếu).
      // Mặt hàng của NCC: ghi chú khai sẵn tự điền vào ghi chú dòng (dòng chưa ghi), kèm mã / tên hàng bên NCC.
      const own = v.partnerCode ? sp.rows.find((r) => r.partnerCode === v.partnerCode && r.sku === sku && (r.note || r.nccSku || r.nccName)) : undefined;
      const meta = { sku, name: p.name, unit, taxCode, brandCode: p.brandCode ?? undefined, ...(own ? { nccSku: own.nccSku || line?.nccSku, nccName: own.nccName || line?.nccName, ...(!line?.note && own.note ? { note: own.note } : {}) } : {}) };
      if (kind === 'promo' || kind === 'gift') setLine(key, { ...meta, price: 0, lineType: 'gift_consumer' });
      else setLine(key, { ...meta, price, lineType: isBuy || price > 0 ? 'buy' : autoLineType(sku, 0, { policies: data.policies, date: v.docDate, partnerCode: v.partnerCode, branchCode: v.branchCode }) });
    } catch { /* mã chưa có trong danh mục hàng */ }
  };
  /** Nhập dòng hàng từ Excel: thêm dòng, tên / thuế / nhãn / ĐVT mặc định / giá NCC lấy như khi chọn mã, rồi ghi đè các cột tệp có ghi. */
  const importLines = async (rows: DongNhap[]) => {
    setExcelLines(false);
    // Giá trong tệp ghi rõ gồm / chưa thuế khác loại giá của phiếu → quy đổi theo thuế suất mua vào của mặt hàng.
    const tax = new Map((rows.some((r) => r.priceIncludesVat !== undefined) ? await purchaseApi.lookupProducts([...new Set(rows.map((r) => r.sku))]) : []).map((p) => [p.sku, p.taxInCode ?? 'V08']));
    rows = rows.map((r) => (r.price !== undefined && r.priceIncludesVat !== undefined && r.priceIncludesVat !== v.priceIncludesVat ? { ...r, price: toDocBasis(r.price, r.priceIncludesVat, tax.get(r.sku) ?? 'V08') } : r));
    const made = rows.map((r) => ({ key: newKey(), r, type: (isGiftDoc || r.gift ? 'gift_consumer' : 'buy') as LineType }));
    setV((x) => ({ ...x, lines: [...x.lines.filter((l) => l.sku), ...made.map(({ key, r, type }) => ({ lineKey: key, sku: r.sku, name: '', unit: r.unit ?? '', qty: r.qty, price: r.price ?? 0, taxCode: 'V08', lineType: type, ...(v.kind === 'exchange' ? { dir: 'in' as const } : {}) }))] }));
    setDirty(true); setTab('hang');
    for (let i = 0; i < made.length; i += 8) {
      await Promise.all(made.slice(i, i + 8).map(async ({ key, r, type }) => {
        await pickSku(key, r.sku, type, r.unit);
        setLine(key, { qty: r.qty, ...(r.price !== undefined ? (r.price > 0 && !r.gift ? { price: r.price, lineType: 'buy' as const } : { price: r.price }) : {}), ...(r.pct !== undefined ? { discountPct: r.pct } : {}),
          ...(r.lotNo ? { lotNo: r.lotNo } : {}), ...(r.mfgDate ? { mfgDate: r.mfgDate } : {}), ...(r.expDate ? { expDate: r.expDate } : {}) });
      }));
    }
  };
  /**
   * Thêm mặt hàng từ bộ chọn / ô gõ mã: mã đã có (cùng loại dòng) thì cộng 1, chưa có thì thêm dòng (giá, ĐVT tự lấy).
   * Phiếu đổi hàng: dòng thêm mới là chiều Nhận về — mã đang có ở chiều Trả đi (đổi cùng mã) thì thêm dòng riêng, không cộng dồn.
   */
  const addProduct = (p: CatalogItem, lineType: LineType = 'buy') => {
    const type: LineType = isGiftDoc ? 'gift_consumer' : lineType;
    const same = v.lines.find((l) => l.sku === p.sku && l.lineType === type && !l.autoGift && (v.kind !== 'exchange' || (l.dir ?? 'in') === 'in'));
    if (same) { setLine(same.lineKey, { qty: same.qty + 1 }); setSelKey(same.lineKey); return; }
    const key = newKey();
    setV((x) => ({ ...x, lines: [...x.lines.filter((l) => l.sku), { lineKey: key, sku: p.sku, name: p.name, unit: p.unit, qty: 1, price: 0, taxCode: p.taxInCode ?? 'V08', lineType: type, brandCode: p.brandCode ?? undefined, ...(v.kind === 'exchange' ? { dir: 'in' as const } : {}) }] }));
    setDirty(true); setSelKey(key);
    void pickSku(key, p.sku, type);
  };

  /**
   * Đổi "Đơn giá nhập vào là" khi đã có đơn giá: hỏi cách đổi — OK = quy đổi đơn giá theo thuế suất từng dòng, TỔNG GIỮ NGUYÊN
   * (đơn giá đã đúng, chỉ chọn nhầm loại); Huỷ = giữ nguyên số đơn giá đang gõ (số đó vốn là loại mới), tổng tính lại.
   */
  const [doiGia, setDoiGia] = useState<boolean | null>(null);
  const doiLoaiGia = (inc: boolean) => {
    if (inc === v.priceIncludesVat) return;
    if (!v.lines.some((l) => l.sku && l.price > 0)) { set({ priceIncludesVat: inc }); lastUsed.set({ priceIncludesVat: inc }); return; }
    setDoiGia(inc); // đã có đơn giá: hỏi cách đổi (hộp 3 lựa chọn bên dưới)
  };
  /** keep = quy đổi đơn giá để TỔNG GIỮ NGUYÊN; false = giữ số đơn giá đang gõ, tổng tính lại. */
  const apDoiGia = (keep: boolean) => {
    const inc = doiGia!;
    setDoiGia(null);
    lastUsed.set({ priceIncludesVat: inc });
    if (!keep) { set({ priceIncludesVat: inc }); return; }
    const conv = (x: number, taxCode: string) => { const r = TAX_RATE[taxCode] ?? 0; return inc ? Math.round(x * (1 + r / 100) * 100) / 100 : Math.round((x / (1 + r / 100)) * 100) / 100; };
    set({ priceIncludesVat: inc, lines: v.lines.map((l) => (l.price > 0 ? { ...l, price: conv(l.price, l.taxCode), ...(l.discountAmt ? { discountAmt: conv(l.discountAmt, l.taxCode) } : {}) } : l)) });
  };
  /** Quy một giá (gồm / chưa VAT) về loại đơn giá của phiếu. */
  const toDocBasis = (price: number, inc: boolean, taxCode: string) => { const r = TAX_RATE[taxCode] ?? 0; return inc === v.priceIncludesVat ? price : inc ? roundPrice(price / (1 + r / 100)) : roundPrice(price * (1 + r / 100)); };
  /** Gợi ý giá dưới ô đơn giá: giá cố định (theo ĐVT) và lần nhập gần nhất, bấm để dùng. */
  /**
   * Dòng chữ dưới ô đơn giá — so với GIÁ MUA ĐÃ THOẢ THUẬN với NCC (giá cố định khai ở Mặt hàng & giá mua), không có thì so với
   * LẦN NHẬP GẦN NHẤT: "✓ đúng giá NCC" · "cao hơn giá NCC 3,2% (380.000) — bấm để dùng" · chưa nhập giá: "Dùng giá NCC 380.000".
   * Mục đích: hoá đơn ghi sai giá / NCC tăng giá là thấy ngay khi nhập, trước khi duyệt.
   */
  const priceHints = (l: PLine) => {
    if (!l.sku || l.lineType !== 'buy') return null;
    const f = fixedOf(l);
    const h = a?.priceHistory[l.sku]?.[0];
    const fp = f ? toDocBasis(f.price, f.row.priceIncludesVat, l.taxCode) : 0;
    // Lần nhập trước theo ĐVT khác (vd Hộp) → quy về ĐVT của dòng (vd Thùng ×48).
    const hus = unitsOf(l.sku);
    const hk = h?.unit && hus.length && h.unit.toLowerCase() !== l.unit.toLowerCase() ? ratioOf(hus, l.unit) / ratioOf(hus, h.unit) : 1;
    const lp = h ? roundPrice(toDocBasis(h.unitPrice, h.includesVat, l.taxCode) * hk) : 0;
    const ref = fp || lp;
    if (!ref) return null;
    const what = fp ? (f!.row.partnerCode ? 'giá NCC' : 'giá mua chung') : 'lần nhập trước';
    const tip = fp ? `Giá đã thoả thuận ${f!.row.partnerCode ? 'với NCC' : '(giá mua chung)'}: ${fmt(Number(f!.row.price))} / ${f!.row.unit}${f!.row.unit.toLowerCase() !== l.unit.toLowerCase() ? ` (quy về ${l.unit})` : ''}` : `Lần nhập trước: phiếu ${h!.docNo} ngày ${dmy(h!.date)}${hk !== 1 ? ` — ${fmt(toDocBasis(h!.unitPrice, h!.includesVat, l.taxCode))} / ${h!.unit}, quy về ${l.unit}` : ''}`;
    if (!l.price) return <div className="mh-price-hint"><button type="button" title={`${tip} — bấm để dùng`} onClick={() => setLine(l.lineKey, { price: ref })}>Dùng {what} {fmt(ref)}</button></div>;
    const diff = ((l.price - ref) / ref) * 100;
    const warn = a?.priceWarnPct ?? 2;
    if (Math.abs(diff) < 0.05) return <div className="mh-price-hint"><span className="ok" title={tip}>✓ đúng {what}</span></div>;
    return (
      <div className="mh-price-hint">
        <button type="button" className={Math.abs(diff) > warn ? 'bad' : 'warn'} title={`${tip} — bấm để dùng giá này`} onClick={() => setLine(l.lineKey, { price: ref })}>
          {diff > 0 ? 'cao' : 'thấp'} hơn {what} {Math.abs(diff).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}% ({fmt(ref)})
        </button>
      </div>
    );
  };
  const applyLastPrice = (key: string, sku: string) => {
    const h = a?.priceHistory[sku]?.[0];
    if (!h) return;
    const line = v.lines.find((l) => l.lineKey === key);
    const rate = TAX_RATE[line?.taxCode ?? ''] ?? 0;
    const p = h.includesVat === v.priceIncludesVat ? h.unitPrice : h.includesVat ? roundPrice(h.unitPrice / (1 + rate / 100)) : roundPrice(h.unitPrice * (1 + rate / 100));
    // Lần trước nhập khác ĐVT (Thùng ↔ Hộp): quy về ĐVT của dòng.
    const us = unitsOf(sku);
    setLine(key, { price: line && h.unit && us.length && h.unit.toLowerCase() !== line.unit.toLowerCase() ? roundPrice((p / ratioOf(us, h.unit)) * ratioOf(us, line.unit)) : p });
  };
  /** Đổi đơn giá: giá 0 = hàng tặng (chia giá hay không theo mã / chính sách KM của NCC), giá > 0 = hàng mua. */
  const setPrice = (l: PLine, price: number) => setLine(l.lineKey, price > 0 ? { price, lineType: 'buy' } : { price: 0, lineType: l.lineType === 'buy' ? autoLineType(l.sku, 0, { policies: data.policies, date: v.docDate, partnerCode: v.partnerCode, branchCode: v.branchCode }) : l.lineType });
  const isOrder = v.kind === 'order';
  // Đơn đặt: chụp số liệu tồn (phân tích đặt hàng của chi nhánh cha) lúc lưu cho dòng chưa có — như thuế, lưu theo lúc đặt.
  const need = useNeedOf(v.branchCode, isOrder && v.status === 'draft');
  // force (lúc bấm Ghi đơn nháp): chụp lại số của ĐÚNG lúc lưu cho mọi dòng — lưu cùng đơn, mở lại / xuất mẫu NCC là số lúc lưu.
  // Đơn đã gửi duyệt / đã duyệt không chụp lại (giữ số lúc lưu cuối).
  const withSnapshot = (d: PDoc, force = false): PDoc => (d.kind !== 'order' || !need.rows.size || (force && d.status !== 'draft') ? d
    : { ...d, lines: d.lines.map((l) => { if (l.lineType !== 'buy' || !l.sku || (l.stockInfo && !force)) return l; const snap = stockSnapshot(need.rows, l.sku, d.docNo || undefined); return snap ? { ...l, ...snap } : l; }) });
  // Thêm hàng (chọn mã, điền từ NCC, nhập Excel…) là hiện ngay phân tích tồn trên dòng — không đợi bấm Ghi.
  useEffect(() => {
    if (!isOrder || v.status !== 'draft' || !need.rows.size || !v.lines.some((l) => l.lineType === 'buy' && l.sku && !l.stockInfo && (need.rows.has(l.sku) || [...need.rows.values()].some((r) => r.members?.some((m) => m.sku === l.sku))))) return;
    setV((x) => withSnapshot(x));
  }, [v.lines, need.rows, isOrder, v.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const prog = isOrder && !v.id.startsWith('new-') ? orderProgress(v, data.docs, undefined, { ...data.units, ...(a?.units ?? {}) }) : null;
  // Theo vết đơn: từng mã đặt / đã nhận (phiếu đã duyệt) / đang chờ + mã NCC giao ngoài đơn, đổi mã (đủ chi tiết ở MH21).
  const recon = prog ? orderReconcile(v, data.docs, { ...data.units, ...(a?.units ?? {}) }) : null;
  /** Phiếu gần nhất của NCC này (đơn đặt / nhập mua) để chép dòng hàng — hàng mua lặp lại thì khỏi gõ lại. */
  const lastOfPartner = v.partnerCode ? data.docs.filter((d) => d.partnerCode === v.partnerCode && d.id !== v.id && d.status !== 'cancelled' && (d.kind === 'receipt' || d.kind === 'order') && d.lines.some((l) => l.sku)).sort((x, y) => y.docDate.localeCompare(x.docDate))[0] : undefined;
  const linesBlank = v.lines.every((l) => !l.sku);
  /** Trả tiền NCC: nợ còn phải trả theo sổ để gợi ý số tiền (trả hết / trả phần đến hạn / trả phiếu đã chọn). */
  const due = useQuery({
    queryKey: ['mua-hang', 'due', v.partnerCode], enabled: v.kind === 'payment' && Boolean(v.partnerCode) && !readOnly,
    queryFn: () => api.get<{ rows: { docNo: string; purchaseDocId?: string; dueDate: string; remaining: number }[] }>(`${P}/due`, { partnerCode: v.partnerCode }),
  });
  const dueRows = due.data?.rows ?? [];
  const debtAll = dueRows.reduce((s, r) => s + r.remaining, 0);
  const debtDue = dueRows.filter((r) => r.dueDate && r.dueDate <= today()).reduce((s, r) => s + r.remaining, 0);
  const refDoc = data.docs.find((d) => d.id === v.refIds?.[0]);
  /** Nợ còn lại theo sổ của một phiếu nhập (0 = đã trả hết; phiếu chưa duyệt chưa vào sổ). */
  const debtOf = (d: Pick<StoredDoc, 'id' | 'docNo'>) => dueRows.filter((r) => r.purchaseDocId === d.id || r.docNo === d.docNo).reduce((s, r) => s + r.remaining, 0);
  const debtRef = refDoc ? debtOf(refDoc) : 0;
  const copyLines = (d: StoredDoc) => {
    // Phiếu nhập chép từ ĐƠN ĐẶT: như "Lập phiếu nhập kho từ đơn" — phần còn lại của từng mã + hàng tặng trên đơn, gắn luôn với đơn
    // (trước đây chỉ chép dòng hàng mua → mất dòng quà, đơn 3 mặt hàng thành phiếu nhập 2).
    if (d.kind === 'order' && v.kind === 'receipt') {
      const r = receiptFromOrder(d, data.docs, v.docDate || today(), data.units);
      set({ priceIncludesVat: r.priceIncludesVat, refIds: [d.id], lines: r.lines, ...(r.warehouseCode && !v.warehouseCode ? { warehouseCode: r.warehouseCode } : {}) });
      return;
    }
    // Chép làm mẫu: hàng mua + hàng tặng (giữ loại dòng); phiếu đổi hàng chỉ chép hàng mua làm dòng trả đi.
    const keep = d.lines.filter((l) => l.sku && (l.lineType === 'buy' || v.kind !== 'exchange'));
    set({ priceIncludesVat: d.priceIncludesVat, lines: keep.map((l) => ({ lineKey: newKey(), sku: l.sku, name: l.name, unit: l.unit, qty: l.qty, price: l.price, taxCode: l.taxCode, lineType: l.lineType, brandCode: l.brandCode, ...(v.kind === 'exchange' ? { dir: 'out' as const } : {}) })) });
  };
  /** Chọn NCC → nhớ cho phiếu sau. Nhãn không chọn ở phiếu: lấy theo mặt hàng từng dòng. */
  const pickPartner = (c: string) => {
    set({ partnerCode: c });
    if (c) lastUsed.set({ partnerCode: c });
  };

  // KHUYẾN MẠI TỰ ÁP (như quầy bán hàng): bảng hàng / NCC / ngày / chi nhánh đổi → tự thêm, chỉnh, bỏ dòng quà theo chương trình.
  // Dòng quà người dùng sửa số lượng thì giữ nguyên (bảng khuyến mại báo thiếu / thừa để bấm sửa). Chiết khấu dòng / đơn tự áp
  // trong bộ máy tính khi ô CK để trống.
  const promoOn = !readOnly && (v.kind === 'receipt' || v.kind === 'order');
  useEffect(() => {
    if (!promoOn) return;
    const r = syncGifts(v, data.policies);
    if (!r.changes.length) return;
    setV((x) => ({ ...x, lines: r.lines })); setDirty(true); setPromoNote(r.changes);
  }, [v.lines, v.partnerCode, v.docDate, v.branchCode, v.skipPolicies, promoOn, data.policies]); // eslint-disable-line react-hooks/exhaustive-deps
  // Dòng chưa có nhãn / tên (điền từ mặt hàng NCC, chép phiếu cũ, lập từ đơn, quà khác mã): tra danh mục một lần mỗi mã —
  // nhãn của dòng cần cho khuyến mại theo nhãn; quà tự thêm khác mã hàng mua lấy tên, ĐVT, thuế.
  const looked = useRef(new Set<string>());
  useEffect(() => {
    const miss = [...new Set(v.lines.filter((l) => l.sku && (l.brandCode === undefined || (l.autoGift && !l.name)) && !looked.current.has(l.sku)).map((l) => l.sku))];
    if (!miss.length || readOnly) return;
    miss.forEach((x) => looked.current.add(x));
    void purchaseApi.lookupProducts(miss).then((ps) => setV((x) => ({ ...x, lines: x.lines.map((l) => {
      const p = ps.find((q) => q.sku === l.sku);
      if (!p) return l;
      const named = l.autoGift && !l.name ? { name: p.name, unit: l.unit || p.unit, taxCode: p.taxInCode ?? l.taxCode } : {};
      return { ...l, ...named, ...(l.brandCode === undefined && p.brandCode ? { brandCode: p.brandCode } : {}) };
    }) }))).catch(() => undefined);
  }, [v.lines, readOnly]);
  // Phiếu nhập lập từ đơn đặt: thuế suất lấy lại theo MẶT HÀNG lúc nhập kho (đơn đặt lưu thuế lúc đặt; thuế đổi thì phiếu nhập theo
  // thuế mới), rồi lưu vào phiếu — sau này xem lại vẫn đúng thuế lúc nhập. Chạy một lần cho phiếu mới.
  const taxSynced = useRef('');
  useEffect(() => {
    if (readOnly || v.kind !== 'receipt' || !v.id.startsWith('new-') || !(v.refIds ?? []).length || taxSynced.current === v.id) return;
    taxSynced.current = v.id;
    const skus = [...new Set(v.lines.filter((l) => l.sku && l.lineType === 'buy').map((l) => l.sku))];
    if (!skus.length) return;
    void purchaseApi.lookupProducts(skus).then((ps) => setV((x) => ({ ...x, lines: x.lines.map((l) => {
      const p = ps.find((q) => q.sku === l.sku);
      return p?.taxInCode && l.lineType === 'buy' && p.taxInCode !== l.taxCode ? { ...l, taxCode: p.taxInCode } : l;
    }) }))).catch(() => undefined);
  }, [v.id, v.kind, readOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  // Quà tặng TGS tự mua: theo quy tắc mã hàng, quà khuyến mại có mã riêng bắt đầu bằng "Q" (Q + nhãn + nhóm + 4 số).
  // Phiếu nhập toàn mã quà → tự hiểu là mua quà để tặng (vào sổ quà tặng), không có ô đánh dấu tay.
  useEffect(() => {
    if (readOnly || v.kind !== 'receipt' || v.gift) return;
    const buy = v.lines.filter((l) => l.sku && l.lineType === 'buy');
    if (buy.length && buy.every((l) => skuInfo(l.sku).kind === 'gift')) setV((x) => ({ ...x, gift: { ...x.gift, source: 'self_buy', hasVat: x.gift?.hasVat ?? Boolean(x.invoice) } }));
  }, [v.lines, v.kind, readOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  // F3: mở danh mục mặt hàng để thêm (đang sửa phiếu có dòng hàng, chưa mở hộp chọn nào).
  useEffect(() => {
    if (readOnly || !isGoods) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'F3' && !pickGoods && !fill && !promoOpen && !productSku) { e.preventDefault(); setTab('hang'); setPickGoods({ text: '', lineType: 'buy' }); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [readOnly, isGoods, pickGoods, fill, promoOpen, productSku]);
  // Phiếu đã duyệt: bảng khuyến mại theo VẾT CHỐT lúc duyệt (mã chính sách, CK bậc, CK đơn…) — không tính lại theo số đã chốt
  // (số chốt được ghi vào dòng như CK tay, tính lại sẽ thành "ghi trên phiếu" và mất dòng CK bậc).
  const board = useMemo<PromoRow[]>(() => {
    const trace = (stored?.policyTrace ?? []) as TraceItem[];
    if (v.status !== 'approved' || !trace.length) return promoBoard(v, data.policies, calc);
    const amt = (t: TraceItem) => (t.amount ? ` = ${t.kind === 'payment_discount' ? '' : '−'}${vnd(t.amount)}` : '');
    return [
      ...trace.filter((t) => ['item_discount', 'qty_tier', 'trade_discount', 'payment_discount', 'promo_gift', 'manual'].includes(t.kind))
        .map((t, i): PromoRow => ({ key: `chot|${i}`, status: 'applied', kind: t.kind, policy: t.policy, name: data.policies.find((p) => p.code === t.policy)?.name ?? t.policy, text: `${t.text}${amt(t)}` })),
      ...promoBoard(v, data.policies, calc).filter((r) => r.kind === 'promo_gift' && r.status !== 'hint'),
    ];
  }, [v, data.policies, calc, stored]);
  /** Bỏ tích / tích lại một chương trình trên phiếu này: CK, bậc, quà, CKTT của nó tự gỡ / tự áp lại. */
  const togglePromo = (code: string, on: boolean) => { const cur = v.skipPolicies ?? []; set({ skipPolicies: on ? cur.filter((x) => x !== code) : [...new Set([...cur, code])] }); };
  const promoAction = (r: PromoRow) => {
    if (!r.action) return;
    if (r.action.type === 'add_qty' && r.lineKey) setLine(r.lineKey, { qty: r.action.qty! });
    else if (r.action.type === 'use_policy' && r.lineKey) setLine(r.lineKey, { discountPct: undefined, discountAmt: undefined });
    else if (r.action.type === 'gift_fix' && r.giftSku && r.lineType) {
      // Sửa quà về đúng số chương trình: gộp các dòng quà cùng mã thành một dòng tự chạy theo hàng mua (chưa có dòng thì tự thêm).
      // Số quà theo ĐVT tặng của chương trình (vd 2 Hộp) — dòng quà đang ghi ĐVT khác thì đổi luôn về ĐVT đó.
      const same = v.lines.filter((l) => l.lineType === r.lineType && l.sku === r.giftSku && (!l.program || l.program === r.policy));
      const keep = same[0];
      if (!keep) return;
      set({ lines: v.lines.flatMap((l) => (l.lineKey === keep.lineKey ? [{ ...l, qty: r.action!.qty!, ...(r.giftUnit ? { unit: r.giftUnit } : {}), autoGift: true, program: r.policy }] : same.includes(l) ? [] : [l])) });
    }
  };

  /** Chạy một thao tác máy chủ; lưu trước nếu phiếu đang sửa dở. */
  const act = async (fn: (id: string) => Promise<StoredDoc>, needSave = true) => {
    setBusy(true); setErr('');
    try {
      let id = v.id;
      if (needSave && (dirty || v.id.startsWith('new-'))) {
        const saved = await purchaseApi.save(withSnapshot(v, true));
        id = saved.id; setV(saved); setStored(saved); setDirty(false);
      }
      const out = await fn(id);
      setV(out); setStored(out); setDirty(false);
      onSaved();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const save = () => act(async () => { const s = await purchaseApi.save(withSnapshot(v, true)); return s; }, false);
  // Cảnh báo chặn được duyệt ngoại lệ (người có quyền, ghi lý do): vượt hạn mức, đổi mã so với đơn, nhập ngoài đơn khi MH12 bắt buộc theo đơn.
  const creditOnly = blocking.length > 0 && blocking.every((c) => c.code === 'credit_exceeded' || c.code === 'code_swap' || c.code === 'po_none');
  // Phiếu nhập NGOÀI ĐƠN (không theo đơn đặt nào): ngoại lệ được phép — bắt buộc lý do, đóng dấu khi duyệt, kế toán rà soát riêng.
  const outside = v.kind === 'receipt' && !(v.refIds ?? []).length;
  const problems = [
    !v.partnerCode && 'Chưa chọn nhà cung cấp',
    !v.branchCode && 'Chưa chọn chi nhánh',
    isGoods && !v.lines.length && 'Chưa có dòng hàng',
    isGoods && v.lines.some((l) => !l.sku || !(l.qty > 0)) && 'Có dòng thiếu mã hoặc số lượng',
    isGoods && !isGiftDoc && v.kind !== 'exchange' && calc.orderDiscount > calc.gross - calc.lineDiscount && 'Chiết khấu trên đơn lớn hơn tiền hàng',
    isGoods && v.lines.some((l) => l.price < 0 || (l.discountPct ?? 0) < 0 || (l.discountPct ?? 0) > 100 || (l.discountAmt ?? 0) < 0) && 'Đơn giá / chiết khấu không hợp lệ (CK tối đa 100%)',
    isGoods && !isGiftDoc && v.lines.some((l) => l.lineType === 'buy' && l.qty > 0 && !(l.price > 0)) && 'Có dòng hàng mua chưa nhập đơn giá (hàng tặng thì chọn loại hàng tặng)',
    (v.kind === 'order' || v.kind === 'receipt') && v.lines.length > 0 && !v.lines.some((l) => l.lineType === 'buy' && l.qty > 0 && l.price > 0) && 'Chưa có dòng hàng mua có đơn giá — tổng tiền 0 (chỉ có quà thì lập phiếu Nhận quà)',
    !isGoods && v.kind !== 'payment' && !(v.amount && v.amount > 0) && 'Chưa nhập số tiền',
    (v.kind === 'cost' || (v.kind === 'rebate' && !v.rebate)) && !(v.refIds ?? []).length && 'Chưa chọn phiếu nhập',
    v.kind === 'payment' && !((v.amount ?? 0) + (v.ckttAmount ?? 0) > 0) && 'Chưa nhập số tiền',
  ].filter(Boolean) as string[];

  const tabs: [Tab, string][] = v.kind === 'order'
    ? [['hang', `Hàng đặt (${v.lines.length})`], ['tep', 'Tệp đính kèm'], ['tep-ncc', 'Tệp của NCC'], ['lich-su', 'Lịch sử']]
    : isGoods && !isGiftDoc
    ? [['hang', `Hàng hoá (${v.lines.length})`], ['thanh-toan', 'Hạn trả tiền'], ['hoa-don', 'Hoá đơn & đối soát'], ['hach-toan', 'Hạch toán'], ['gia-von', 'Giá vốn thực tế'], ['tep', 'Tệp đính kèm'], ['tep-ncc', 'Tệp của NCC'], ['lich-su', 'Lịch sử']]
    : isGiftDoc ? [['hang', `Quà (${v.lines.length})`], ['hach-toan', 'Hạch toán'], ['tep', 'Tệp đính kèm'], ['lich-su', 'Lịch sử']] : [['hach-toan', 'Hạch toán'], ['tep', 'Tệp đính kèm'], ['lich-su', 'Lịch sử']];
  const priceLabel = isGiftDoc ? 'Giá trị / ĐVT' : v.priceIncludesVat ? 'Đơn giá gồm thuế' : 'Đơn giá chưa thuế';
  const refReceipt = receipts.find((r) => (v.refIds ?? []).includes(r.id));

  return (
    <DockScope>
    <div className={`mh-sheet${dock.minimized ? ' is-min' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mh-sheet-box" role="dialog" aria-modal="true" onDoubleClick={viewing && !frozen ? (e) => { if (!(e.target as HTMLElement).closest('button, a, .tab, .tabs')) setViewing(false); } : undefined}>
        <div className="mh-sheet-head" ref={(el) => { dock.headRef.current = el; }}>
          <h2>{v.kind === 'rebate' && !v.rebate ? 'Chiết khấu / giảm giá sau mua' : KIND_LABEL[v.kind]} {v.docNo || '(mới)'} <span className={`badge ${statusBadge(v.status)}`}>{STATUS_LABEL[v.status]}</span>{v.override && <span className="badge badge-warn" style={{ marginLeft: 6 }}>Duyệt ngoại lệ: {v.override.by}</span>}{outside && <span className="badge badge-warn" style={{ marginLeft: 6 }} title={v.outsideOrder?.by ? `Lý do: ${v.outsideOrder.reason}
Duyệt: ${v.outsideOrder.by} · ${new Date(v.outsideOrder.at!).toLocaleString('vi-VN', { hour12: false })}${v.outsideOrder.reviewedBy ? `
Rà soát: ${v.outsideOrder.reviewedBy}${v.outsideOrder.reviewNote ? ` — ${v.outsideOrder.reviewNote}` : ''}` : ''}` : 'Phiếu nhập không theo đơn đặt nào — phải ghi lý do'}>Nhập ngoài đơn{v.outsideOrder?.reviewedBy ? ' · đã rà soát' : v.outsideOrder?.by ? ' · chờ rà soát' : ''}</span>}{dirty && !readOnly && <span className="badge badge-gray" style={{ marginLeft: 6 }}>chưa ghi</span>}{viewing && !frozen && <span className="badge badge-info" style={{ marginLeft: 6 }}>Đang xem — bấm Sửa để thay đổi</span>}</h2>
          <button className="btn btn-sm btn-help" onClick={() => setHelp(true)}>? Hướng dẫn</button>
          {dock.top && <MinimizeButton onClick={dock.minimize} />}
          <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Đóng">✕</button>
        </div>
        {help && <HelpDrawer guideKey="mua-hang-chung-tu" onClose={() => setHelp(false)} />}
        {mauNcc && <XemMauNcc doc={v} info={mauInfo()} onClose={() => setMauNcc(false)} onExport={() => void xuatMauNcc(v, mauInfo())} />}
        {doiGia !== null && (
          <Modal title={`Đổi sang "${doiGia ? 'giá đã gồm thuế' : 'giá chưa thuế'}"`} onClose={() => setDoiGia(null)}
            footer={<><button className="btn btn-primary" onClick={() => apDoiGia(true)}>Quy đổi đơn giá, giữ tổng</button><button className="btn" onClick={() => apDoiGia(false)}>Giữ đơn giá, tính lại tổng</button><button className="btn" onClick={() => setDoiGia(null)}>Thôi, không đổi</button></>}>
            <div className="full" style={{ fontSize: 13, lineHeight: 1.6 }}>
              Phiếu đã có <b>{v.lines.filter((l) => l.sku && l.price > 0).length}</b> dòng có đơn giá. Chọn cách đổi:
              <ul style={{ margin: '6px 0 0 18px' }}>
                <li><b>Quy đổi đơn giá, giữ tổng</b>: đơn giá đã gõ đúng, chỉ chọn nhầm loại giá — phần mềm đổi đơn giá theo thuế suất từng dòng, tổng tiền giữ nguyên (có thể lệch vài đồng do làm tròn).</li>
                <li><b>Giữ đơn giá, tính lại tổng</b>: số đơn giá đang gõ vốn là {doiGia ? 'giá gồm thuế' : 'giá chưa thuế'} — tổng tiền tính lại.</li>
                <li><b>Thôi, không đổi</b>: giữ nguyên như cũ.</li>
              </ul>
            </div>
          </Modal>
        )}
        {excelLines && <NhapExcelChung<DongHangCot, DongNhap> s={nhapDongHang(priceLabel, showKho ? v.warehouseCode || defaultWh : '')} onClose={() => setExcelLines(false)} onAdd={(list) => void importLines(list)} />}
        {promoOpen && <BangKhuyenMai rows={board} onAction={promoAction} onToggle={readOnly ? undefined : togglePromo} onClose={() => setPromoOpen(false)} readOnly={readOnly} />}
        {pickGoods && <ChonMatHang title={pickGoods.lineType === 'buy' ? 'Thêm hàng vào phiếu — bấm vào dòng để thêm (bấm lại = cộng 1)' : 'Thêm quà ngoài chương trình — bấm vào dòng để thêm'}
          initial={pickGoods.text} repeat prefer={nccBrands} onClose={() => setPickGoods(null)}
          existing={new Map(v.lines.filter((l) => l.sku && l.lineType === (isGiftDoc ? 'gift_consumer' : pickGoods.lineType)).map((l) => [l.sku, `đang ${fmt(l.qty)} ${l.unit}`]))}
          onPick={(p) => addProduct(p, pickGoods.lineType)} />}
        {productSku && <ProductEditor sku={productSku} startTab="units" startEditing onClose={() => void closeProduct()} />}
        {ctx && (() => { const l = v.lines.find((x) => x.lineKey === ctx.key); if (!l) return null; const us = unitsOf(l.sku); const b = baseUnitOf(us);
          return <div className="ctx-menu" style={{ left: ctx.x, top: ctx.y }} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
            <div className="ctx-h">Dòng {v.lines.indexOf(l) + 1}{l.sku ? ` · ${l.sku}` : ''}</div>
            <button type="button" onClick={() => { lineOps.dup(l.lineKey); setCtx(null); }}>Nhân đôi dòng <kbd>Ctrl+D</kbd></button>
            {l.sku && b && l.unit.toLowerCase() !== b.toLowerCase() && <button type="button" title={`Thêm dòng cùng mã theo ${b} (mua lẻ), đơn giá quy về ${b}`} onClick={() => { lineOps.loose(l.lineKey); setCtx(null); }}>Thêm dòng mua lẻ theo {b}</button>}
            <button type="button" onClick={() => { lineOps.blank(l.lineKey); setCtx(null); }}>Chèn dòng trống bên dưới</button>
            {l.sku && <button type="button" onClick={() => { setProductSku(l.sku); setCtx(null); }}>Sửa ĐVT / tỉ lệ của mặt hàng</button>}
            <hr />
            <button type="button" className="danger" onClick={() => { lineOps.del(l.lineKey); setCtx(null); }}>Xoá dòng <kbd>Ctrl+Delete</kbd></button>
          </div>; })()}
        {hdFix && <HoaDonModal id={hdFix.id} partnerCode={v.partnerCode} lockPartner onClose={() => setHdFix(null)}
          onSaved={() => { const id = hdFix.id; setHdFix(null); void takeInvoice(id, 'fixed'); }}
          note={<>Hoá đơn còn <b>{hdFix.count} dòng chưa biết là mã nào bên mình</b> — chọn mã (bấm gợi ý hoặc tìm) và ĐVT tương ứng rồi bấm <b>Ghi</b>. Phần mềm nhớ cách NCC ghi các dòng này (lần sau tự nhận) và điền đủ dòng vào phiếu nhập. Đóng hộp này thì phiếu chưa lấy hoá đơn.</>} />}
        {chon === 'don' && <ChonChungTu<StoredDoc> title={`Chọn đơn đặt hàng của ${names.partnerName(v.partnerCode) || v.partnerCode}`} storageKey="mh-chon-don" rows={orders} rowKey={(d) => d.id}
          dateOf={(d) => d.docDate} searchOf={(d) => [d.docNo, d.note, d.branchCode, ...d.lines.flatMap((l) => [l.sku, l.name])].join(' ')}
          chips={v.kind === 'receipt' ? [{ key: 'cho', label: 'Chỉ đơn còn chờ giao', on: true, test: (d) => !orderProgress(d, data.docs, v.id, data.units).done }] : []}
          noneLabel={v.kind === 'receipt' ? 'Không theo đơn (nhập ngoài đơn)' : 'Không chọn'} onNone={() => set({ refIds: [] })}
          onPick={(d) => set({ refIds: [d.id] })} onClose={() => setChon(null)}
          note="Đơn đặt đã duyệt của NCC này. Tiến độ = SL đã nhận (phiếu nhập đã duyệt, quy ĐVT nhỏ nhất) / SL đặt."
          columns={[
            { key: 'docNo', header: 'Số đơn', type: 'code', width: 120 },
            { key: 'docDate', header: 'Ngày', width: 90, value: (d) => dmy(d.docDate) },
            { key: 'branchCode', header: 'Chi nhánh', width: 90 },
            { key: 'lines', header: 'Số dòng', type: 'number', width: 70, value: (d) => d.lines.filter((l) => l.lineType === 'buy').length },
            { key: 'total', header: 'Tổng tiền', type: 'money', width: 120, value: (d) => d.totals.total },
            { key: 'prog', header: 'Đã nhận / đặt', width: 120, value: (d) => { const p = orderProgress(d, data.docs, v.id, data.units); return `${p.received.toLocaleString('vi-VN')} / ${p.ordered.toLocaleString('vi-VN')}`; } },
            { key: 'state', header: 'Tình trạng', width: 130, value: (d) => (orderProgress(d, data.docs, v.id, data.units).done ? 'Đã giao đủ' : 'Còn chờ giao'),
              render: (d) => (orderProgress(d, data.docs, v.id, data.units).done ? <span className="badge badge-ok">Đã giao đủ</span> : <span className="badge badge-info">Còn chờ giao</span>) },
            { key: 'items', header: 'Mặt hàng', width: 280, value: (d) => d.lines.filter((l) => l.lineType === 'buy').map((l) => `${l.sku} ${l.name}`).join('; ') },
            { key: 'note', header: 'Ghi chú', width: 200, value: (d) => d.note ?? '' },
          ]} />}
        {chon === 'hoa-don' && <ChonChungTu<InvoiceRow> title={`Chọn hoá đơn NCC (MH22) của ${names.partnerName(v.partnerCode) || v.partnerCode}`} storageKey="mh-chon-hoa-don" rows={nccInvoices} rowKey={(x) => x.id!}
          dateOf={(x) => x.date} searchOf={(x) => [x.series, x.no, invoiceLabel(x), x.sellerTaxCode, x.note, ...x.receipts.map((r) => r.docNo)].join(' ')}
          chips={[{ key: 'chua', label: 'Chỉ hoá đơn chưa có phiếu nhập', on: true, test: (x) => !x.receipts.length }]}
          onPick={(x) => void takeInvoice(x.id!)} onClose={() => setChon(null)}
          note="Chọn là điền dòng hàng (mã, ĐVT, SL, giá chưa thuế, CK, thuế suất) và số / ngày hoá đơn vào phiếu. Dòng hoá đơn chưa nhận diện mã thì chưa đưa vào — chọn mã ở MH22."
          columns={[
            { key: 'label', header: 'Ký hiệu - Số HĐ', type: 'code', width: 140, value: (x) => invoiceLabel(x) },
            { key: 'date', header: 'Ngày HĐ', width: 90, value: (x) => dmy(x.date) },
            { key: 'sellerTaxCode', header: 'MST người bán', type: 'code', width: 110 },
            { key: 'totalBeforeTax', header: 'Tiền hàng', type: 'money', width: 120 },
            { key: 'totalTax', header: 'Tiền thuế', type: 'money', width: 100 },
            { key: 'total', header: 'Tổng thanh toán', type: 'money', width: 130 },
            { key: 'lineCount', header: 'Số dòng', type: 'number', width: 70 },
            { key: 'unmatched', header: 'Chưa nhận diện', type: 'number', width: 90 },
            { key: 'state', header: 'Tình trạng', width: 150, value: (x) => STATE_LABEL[x.state][0], render: (x) => <span className={`badge ${STATE_LABEL[x.state][1]}`} title={x.issues.join('\n') || STATE_LABEL[x.state][2]}>{STATE_LABEL[x.state][0]}</span> },
            { key: 'receipts', header: 'Phiếu nhập đã gắn', width: 160, value: (x) => x.receipts.map((r) => r.docNo || '(nháp)').join(', ') },
          ]} />}
        {chon === 'phieu' && <ChonChungTu<StoredDoc> title={`Chọn phiếu nhập của ${names.partnerName(v.partnerCode) || v.partnerCode}`} storageKey="mh-chon-phieu-nhap" rows={receipts} rowKey={(d) => d.id}
          dateOf={(d) => d.docDate} searchOf={(d) => [d.docNo, d.note, d.invoice?.no, d.branchCode, ...d.lines.flatMap((l) => [l.sku, l.name, l.lotNo ?? ''])].join(' ')}
          noneLabel={v.kind === 'payment' ? 'Trừ theo hạn sớm trước' : 'Không chọn'} onNone={() => set({ refIds: [] })}
          onPick={(d) => set({ refIds: [d.id] })} onClose={() => setChon(null)}
          columns={[
            { key: 'docNo', header: 'Số phiếu', type: 'code', width: 120 },
            { key: 'docDate', header: 'Ngày', width: 90, value: (d) => dmy(d.docDate) },
            { key: 'branchCode', header: 'Chi nhánh', width: 90 },
            { key: 'invoice', header: 'Số HĐ', type: 'code', width: 110, value: (d) => (d.invoice ? `${d.invoice.serial ? `${d.invoice.serial}-` : ''}${d.invoice.no}` : '') },
            { key: 'total', header: 'Tổng tiền', type: 'money', width: 120, value: (d) => d.totals.total },
            // Trả tiền: thấy ngay phiếu còn nợ bao nhiêu trước khi chọn (theo sổ công nợ; trả nhiều lần thì đã trừ các lần trước).
            ...(v.kind === 'payment' ? [
              { key: 'paid', header: 'Đã trả', type: 'money' as const, width: 120, value: (d: StoredDoc) => (d.status === 'approved' ? d.totals.total - debtOf(d) : 0) },
              { key: 'debt', header: 'Còn nợ', type: 'money' as const, width: 120, value: (d: StoredDoc) => (d.status === 'approved' ? debtOf(d) : 0),
                render: (d: StoredDoc) => (d.status !== 'approved' ? <span className="muted">chưa ghi sổ</span> : debtOf(d) > 0 ? <b>{vnd(debtOf(d))}</b> : <span className="badge badge-ok">Đã trả hết</span>) },
            ] : []),
            { key: 'dueDate', header: 'Hạn trả', width: 90, value: (d) => dmy(d.dueDate) },
            { key: 'items', header: 'Mặt hàng', width: 280, value: (d) => d.lines.filter((l) => l.sku).map((l) => `${l.sku} ${l.name}${l.lotNo ? ` (lô ${l.lotNo})` : ''}`).join('; ') },
            { key: 'note', header: 'Ghi chú', width: 200, value: (d) => d.note ?? '' },
          ]} />}
        {fill && <DienMatHang doc={v} data={data} onClose={() => setFill(false)} onAdd={(ls) => { setFill(false); set({ lines: [...v.lines.filter((l) => l.sku), ...ls] }); setTab('hang'); }} />}
        <div className={`mh-sheet-body ${readOnly ? 'view-plain' : ''}`}>
          {/* Thẻ Hàng hoá: khung trái không cuộn cả khối — bảng hàng chiếm phần còn lại và tự cuộn (thanh cuộn ngang luôn thấy, đầu phiếu đứng yên). */}
          <div className={`mh-main ${tab === 'hang' ? 'mh-main-hang' : ''}`}>
            {!headOpen && (
              <div className="mh-head-mini" onClick={() => setHeadOpen(true)} title="Bấm để mở đầu phiếu">
                <span className="mono">{v.docNo || 'phiếu mới'}</span><span>{v.docDate.split('-').reverse().join('/')}</span>
                <span><b>{v.branchCode}</b> {names.branchName(v.branchCode)}</span><span><b>{v.partnerCode}</b> {names.partnerName(v.partnerCode)}</span>
                {v.note && <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>{v.note}</span>}
              </div>
            )}
            <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, display: headOpen ? undefined : 'none' }}>
              <div className="mh-head">
                <div className="field"><label>Số phiếu</label><input className="input mono" value={v.docNo} placeholder="Tự cấp khi ghi" onChange={(e) => set({ docNo: e.target.value.trim() })} /></div>
                <div className="field"><label>Ngày (*)</label><input className="input" type="date" value={v.docDate} onChange={(e) => set({ docDate: e.target.value,
                  // Ngày nhận đủ hàng & hồ sơ đang bằng ngày phiếu (chưa sửa riêng) thì chạy theo ngày phiếu — không để hạn thanh toán tính từ ngày cũ.
                  ...(v.receivedDate && v.receivedDate === v.docDate ? { receivedDate: e.target.value } : {}) })} /></div>
                <div className="field"><label>Chi nhánh (*)</label><BranchPicker value={v.branchCode} onChange={(c) => { set({ branchCode: c }); if (c) lastUsed.set({ branchCode: c }); }} activeOnly disabled={readOnly} /></div>
                {showKho && <div className="field"><label title="Mọi dòng hàng của phiếu vào / ra phân kho này (cột Phân kho ở bảng hàng đi theo). Mặc định là kho mặc định của chi nhánh. Hàng cần sang phân kho khác thì lập phiếu chuyển kho.">Phân kho (*)</label>
                  <select className="select input" value={v.warehouseCode ?? ''} disabled={readOnly || !v.branchCode} onChange={(e) => set({ warehouseCode: e.target.value || undefined })}>
                    {!v.branchCode ? <option value="">— chọn chi nhánh trước —</option> : !activeWhs.length ? <option value="">Kho mặc định (chi nhánh chưa khai kho ở DM12)</option> : null}
                    {activeWhs.map((w) => <option key={w.code} value={w.code} title={`${w.name}${w.isDefault ? ' (mặc định)' : ''}${w.isPromo ? ' · kho khuyến mại' : ''}`}>{w.code}{!w.isActive ? ' · ngừng dùng' : ''}</option>)}
                  </select></div>}
                {isGoods && <div className="field"><label title="Nhãn là thuộc tính của mặt hàng (danh mục Ngành → Nhãn → Nhóm): phiếu tự lấy theo các dòng hàng, không chọn tay. Hạn mức / chỉ tiêu / thưởng theo nhãn tính theo phần của từng nhãn">Nhãn hàng (theo mặt hàng)</label>
                  <div className="mh-brand">{(() => { const mix = brandMix(v); return mix.length ? mix.slice(0, 3).map((m) => <span key={m.brandCode} className="mh-brand-chip">{brands.find((b) => b.code === m.brandCode)?.name ?? m.brandCode}{mix.length > 1 ? ` ${Math.round(m.share * 100)}%` : ''}</span>) : <span className="muted">tự lấy khi thêm hàng</span>; })()}</div>
                </div>}
                <div className="field span2"><label>Nhà cung cấp (*)</label>
                  <PartnerPicker value={v.partnerCode} onChange={pickPartner} activeOnly disabled={readOnly} />
                  {v.partnerCode && <span className="muted" style={{ fontSize: 11, display: 'flex', gap: 6, alignItems: 'center' }}><NccInfo code={v.partnerCode} showName={false} />{names.partner(v.partnerCode)?.taxCode ? `MST ${names.partner(v.partnerCode)?.taxCode}` : 'Xem thông tin NCC'}{names.partner(v.partnerCode)?.address ? ` · ${names.partner(v.partnerCode)?.address}` : ''}</span>}
                </div>
                {(v.kind === 'receipt' || v.kind === 'prepayment') && (
                  <div className="field span2"><label>Theo đơn đặt hàng</label>
                    <OChonChungTu disabled={readOnly} count={orders.length} onOpen={() => setChon('don')} onClear={() => set({ refIds: [] })}
                      text={(() => { const d = orders.find((x) => x.id === v.refIds?.[0]); return d ? `${d.docNo} · ${dmy(d.docDate)} · ${vnd(d.totals.total)}${d.note ? ` · ${d.note}` : ''}` : undefined; })()}
                      placeholder={v.kind === 'receipt' ? '— không theo đơn (nhập ngoài đơn) —' : '— không —'} />
                    {/* Chọn đơn chỉ gắn đơn; muốn lấy hàng thì bấm nút này: phần còn lại của đơn + hàng tặng (như lập từ màn đơn). */}
                    {v.kind === 'receipt' && !readOnly && (() => { const d = orders.find((x) => x.id === v.refIds?.[0]); return d ? (
                      <button type="button" className="btn btn-sm" style={{ marginTop: 4 }} title="Chép phần còn lại của đơn (gồm cả hàng tặng) vào phiếu — thay các dòng đang có"
                        onClick={() => { if (linesBlank || window.confirm(`Thay các dòng hàng đang có bằng phần còn lại của đơn ${d.docNo} (gồm cả hàng tặng)?`)) copyLines(d); }}>Chép hàng từ đơn {d.docNo}</button>
                    ) : null; })()}
                  </div>
                )}
                {v.kind === 'receipt' && !readOnly && v.partnerCode && (
                  <div className="field span2"><label title="Hoá đơn NCC đã nhập ở MH22 (Excel / quét / gõ tay): chọn là điền dòng hàng (mã, ĐVT, SL, giá chưa thuế, CK, thuế suất) và số / ngày hoá đơn">Lấy từ hoá đơn NCC <Link to={`/mua-hang/hoa-don-ncc`} className="muted" style={{ fontWeight: 400 }} title="Mở MH22 Hoá đơn đầu vào của NCC">(MH22)</Link></label>
                    <OChonChungTu disabled={fromInv.busy} count={nccInvoices.length} onOpen={() => setChon('hoa-don')}
                      text={(() => { const x = v.invoice?.no ? nccInvoices.find((i) => sameInvoice(i, { no: v.invoice!.no, series: v.invoice!.serial })) : undefined; return x ? `Đã lấy ${invoiceLabel(x)} · ${dmy(x.date)} · ${vnd(x.total)}` : undefined; })()}
                      placeholder={fromInv.busy ? 'Đang lấy…' : nccInvoices.length ? 'Chọn hoá đơn để điền dòng hàng, giá, thuế…' : 'NCC chưa có hoá đơn ở MH22'} />
                    {fromInv.note && <span className="mh-warn" style={{ fontSize: 11 }}>{fromInv.note}</span>}
                  </div>
                )}
                {outside && (
                  <div className="field span4"><label title="Ngoại lệ được phép: phiếu nhập không qua đơn đặt phải ghi lý do; lúc duyệt phần mềm đóng dấu người duyệt, kế toán rà soát riêng (lọc &quot;Nhập ngoài đơn&quot;)">Lý do nhập ngoài đơn (*) <span className="muted" style={{ fontWeight: 400 }}>— đúng quy trình là lập đơn đặt rồi "Lập phiếu nhập" ở đơn</span></label>
                    <input className="input" list="ly-do-ngoai-don" value={v.outsideOrder?.reason ?? ''} placeholder="vd: NCC giao bổ sung hàng thiếu đợt trước" onChange={(e) => set({ outsideOrder: { ...v.outsideOrder, reason: e.target.value } })} />
                    <datalist id="ly-do-ngoai-don">{['NCC giao bổ sung hàng thiếu của đợt trước', 'Mua gấp hàng bán chạy, chưa kịp lập đơn', 'Hàng khuyến mại / hàng mẫu NCC giao trước', 'Nhập lại chứng từ cũ (trước khi dùng phần mềm)', 'NCC giao hàng thay thế / đổi quy cách'].map((x) => <option key={x} value={x} />)}</datalist>
                  </div>
                )}
                {(v.kind === 'return' || v.kind === 'exchange' || v.kind === 'payment') && (
                  <div className="field span2"><label>{v.kind === 'payment' ? 'Trả cho phiếu nhập (ưu tiên trừ trước)' : 'Phiếu nhập gốc'}</label>
                    <OChonChungTu disabled={readOnly} count={receipts.length} onOpen={() => setChon('phieu')} onClear={() => set({ refIds: [] })}
                      text={(() => { const d = receipts.find((x) => x.id === v.refIds?.[0]); return d ? `${d.docNo} · ${dmy(d.docDate)} · ${vnd(d.totals.total)}${d.invoice?.no ? ` · HĐ ${d.invoice.no}` : ''}` : undefined; })()}
                      placeholder={`— ${v.kind === 'payment' ? 'trừ theo hạn sớm trước' : 'không'} —`} />
                  </div>
                )}
                {(v.kind === 'cost' || (v.kind === 'rebate' && !v.rebate)) && (
                  <div className="field span4"><label>{v.kind === 'cost' ? 'Phân bổ vào phiếu nhập (*) — chọn một hay nhiều phiếu' : 'Phiếu nhập được giảm giá (*) — chọn một hay nhiều phiếu'}</label>
                    <div className="mh-pick">
                      {(v.kind === 'cost' ? data.docs.filter((d) => d.kind === 'receipt' && d.status === 'approved') : receipts).map((d) => (
                        <label key={d.id} className={(v.refIds ?? []).includes(d.id) ? 'on' : ''}>
                          <input type="checkbox" checked={(v.refIds ?? []).includes(d.id)} onChange={(e) => set({ refIds: e.target.checked ? [...(v.refIds ?? []), d.id] : (v.refIds ?? []).filter((x) => x !== d.id) })} />
                          {d.docNo} · {dmy(d.docDate)} · {vnd(d.totals.beforeTax)}{v.kind === 'cost' ? ` · ${names.partnerName(d.partnerCode)}` : ''}
                        </label>
                      ))}
                      {!(v.kind === 'cost' ? data.docs.some((d) => d.kind === 'receipt' && d.status === 'approved') : receipts.length) && <span className="muted">Chưa có phiếu nhập đã duyệt{v.kind === 'rebate' ? ' của nhà cung cấp này' : ''}</span>}
                    </div>
                  </div>
                )}
                {isGoods && !isGiftDoc && <>
                  <div className="field"><label title="Hoá đơn GTGT ghi đơn giá chưa thuế; bảng giá / phiếu giao hàng thường ghi giá đã gồm thuế">Đơn giá nhập vào là</label><select className="select input" value={v.priceIncludesVat ? '1' : '0'} onChange={(e) => doiLoaiGia(e.target.value === '1')}><option value="0">Giá chưa thuế (như trên hoá đơn GTGT)</option><option value="1">Giá đã gồm thuế GTGT</option></select></div>
                  {(v.kind === 'receipt' || v.kind === 'order' || v.kind === 'return') && (
                    <div className="field"><label>Chiết khấu trên đơn</label>
                      <div className="row" style={{ gap: 4 }}>
                        <select className="select input" style={{ width: 120 }} value={v.orderDiscount === undefined ? 'policy' : v.orderDiscount.pct ? 'pct' : v.orderDiscount.amount ? 'amount' : 'none'}
                          onChange={(e) => set({ orderDiscount: e.target.value === 'policy' ? undefined : e.target.value === 'pct' ? { pct: v.orderDiscount?.pct || 5 } : e.target.value === 'amount' ? { amount: v.orderDiscount?.amount || 1_000_000 } : {} })}>
                          <option value="policy">Theo chính sách</option><option value="pct">%</option><option value="amount">Bằng tiền</option><option value="none">Không</option>
                        </select>
                        {v.orderDiscount?.pct !== undefined && <NumInput style={{ width: 60 }} value={v.orderDiscount.pct} blankZero={false} onChange={(n) => set({ orderDiscount: { pct: n ?? 0 } })} />}
                        {v.orderDiscount?.amount !== undefined && <input className="input num" style={{ width: 110 }} value={fmt(v.orderDiscount.amount)} onChange={(e) => set({ orderDiscount: { amount: num(e.target.value) } })} />}
                      </div>
                    </div>
                  )}
                  {v.kind === 'exchange' && <div className="field"><label>Xử lý chênh lệch</label><select className="select input" value={v.settle ?? 'offset'} onChange={(e) => set({ settle: e.target.value as PDoc['settle'] })}><option value="offset">Bù trừ công nợ</option><option value="pay">Thanh toán bổ sung</option><option value="refund">NCC hoàn tiền</option></select></div>}
                  {(v.kind === 'return' || v.kind === 'exchange') && <div className="field"><label>Lý do</label><input className="input" value={v.reason ?? ''} onChange={(e) => set({ reason: e.target.value })} placeholder="Lỗi, cận date, sai quy cách…" /></div>}
                </>}
                {v.kind === 'receipt' && (
                  <div className="field"><label title="Mốc tính hạn thanh toán theo hợp đồng: ngày nhận đủ hàng và hồ sơ giao hàng hợp lệ">Ngày nhận đủ hàng & hồ sơ</label><input className="input" type="date" value={v.receivedDate ?? v.docDate} onChange={(e) => set({ receivedDate: e.target.value || undefined })} /></div>
                )}
                {(v.kind === 'gift_in' || (v.kind === 'receipt' && v.gift)) && (<>
                  <div className="field"><label>Chương trình quà</label><input className="input mono" value={v.gift?.program ?? ''} placeholder="Ví dụ TGS-TRI-AN" onChange={(e) => set({ gift: { source: v.gift?.source ?? (v.kind === 'gift_in' ? 'ncc_extra' : 'self_buy'), program: e.target.value.trim() || undefined, hasVat: v.kind === 'receipt' ? (v.gift?.hasVat ?? Boolean(v.invoice)) : false } })} /></div>
                  {v.kind === 'receipt' && v.gift?.source === 'self_buy' && <div className="field"><label title="Quà TGS tự mua: có hoá đơn VAT (thuế được khấu trừ) hay không — chọn rõ, không phụ thuộc thứ tự nhập số hoá đơn">Quà mua có VAT?</label><select className="select input" value={v.gift.hasVat ? '1' : '0'} onChange={(e) => set({ gift: { ...v.gift!, hasVat: e.target.value === '1' } })}><option value="1">Có hoá đơn VAT</option><option value="0">Không VAT (không hoá đơn)</option></select></div>}
                </>)}
                {v.kind === 'gift_in' && (
                  <div className="field"><label>Nguồn quà</label><select className="select input" value={v.gift?.source ?? 'ncc_extra'} onChange={(e) => set({ gift: { source: e.target.value as 'ncc_extra', program: v.gift?.program, hasVat: false } })}><option value="ncc_extra">NCC tặng ngoài hợp đồng</option><option value="ncc_program">NCC tặng theo chương trình</option></select></div>
                )}
                {(v.kind === 'payment' || v.kind === 'prepayment' || (v.kind === 'exchange' && v.settle && v.settle !== 'offset')) && (
                  <>
                    <div className="field"><label>Hình thức</label><select className="select input" value={v.method ?? 'bank'} onChange={(e) => set({ method: e.target.value as 'bank' | 'cash', moneyAccount: undefined })}><option value="bank">Chuyển khoản</option><option value="cash">Tiền mặt</option></select></div>
                    <TaiKhoanTien method={v.method ?? 'bank'} value={v.moneyAccount ?? ''} onChange={(x) => set({ moneyAccount: x || undefined })} />
                  </>
                )}
                {!isGoods && <div className="field"><label>{v.kind === 'cost' ? 'Số tiền chưa thuế (*)' : 'Số tiền (*)'}</label><input className="input num" value={fmt(v.amount)} disabled={Boolean(v.rebate)} onChange={(e) => set({ amount: num(e.target.value) })} />{(v.kind === 'cost' || v.kind === 'rebate') && amountTax(v) > 0 && <span className="muted" style={{ fontSize: 11 }}>+ VAT {vnd(amountTax(v))} = {vnd((v.amount ?? 0) + amountTax(v))}</span>}</div>}
                {v.kind === 'cost' && <div className="field"><label>Loại chi phí</label><select className="select input" value={v.costType ?? 'van_chuyen'} onChange={(e) => set({ costType: e.target.value as PDoc['costType'] })}>{Object.entries(COST_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>}
                {v.kind === 'rebate' && <>
                  <div className="field"><label>Hoá đơn điều chỉnh giảm</label><select className="select input" value={v.taxCode ?? ''} onChange={(e) => set({ taxCode: e.target.value || undefined })}><option value="">Không có (không giảm VAT)</option><option value="V05">Có — VAT 5%</option><option value="V08">Có — VAT 8%</option><option value="V10">Có — VAT 10%</option></select></div>
                  {v.taxCode && <div className="field"><label>Số hoá đơn điều chỉnh</label><input className="input mono" value={v.invoice?.no ?? ''} onChange={(e) => set({ invoice: e.target.value ? { no: e.target.value.trim(), date: v.invoice?.date || v.docDate } : undefined })} /></div>}
                  {!v.rebate && <div className="field"><label>Phân bổ theo</label><select className="select input" value={v.basis ?? 'value'} onChange={(e) => set({ basis: e.target.value as 'value' | 'qty' })}><option value="value">Giá trị hàng</option><option value="qty">Số lượng</option></select></div>}
                </>}
                {v.kind === 'cost' && <>
                  <div className="field"><label>Thuế GTGT dịch vụ</label><select className="select input" value={v.taxCode ?? ''} onChange={(e) => set({ taxCode: e.target.value || undefined })}><option value="">Không thuế</option><option value="V05">5%</option><option value="V08">8%</option><option value="V10">10%</option></select></div>
                  <div className="field"><label>Phân bổ theo</label><select className="select input" value={v.basis ?? 'value'} onChange={(e) => set({ basis: e.target.value as 'value' | 'qty' })}><option value="value">Giá trị hàng</option><option value="qty">Số lượng</option></select></div>
                  <div className="field"><label>Số hoá đơn dịch vụ</label><input className="input mono" value={v.invoice?.no ?? ''} onChange={(e) => set({ invoice: e.target.value ? { no: e.target.value.trim(), date: v.invoice?.date || v.docDate } : undefined })} /></div>
                </>}
                {v.kind === 'payment' && v.partnerCode && !readOnly && (
                  <div className="field span2"><label>Gợi ý số tiền (nợ còn phải trả theo sổ)</label>
                    <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                      {due.isLoading ? <span className="muted">Đang lấy công nợ…</span> : debtAll ? <>
                        <button type="button" className="btn btn-xs" onClick={() => set({ amount: debtAll, ckttAmount: undefined })}>Trả hết {vnd(debtAll)}</button>
                        {debtDue > 0 && debtDue !== debtAll && <button type="button" className="btn btn-xs" onClick={() => set({ amount: debtDue, ckttAmount: undefined })}>Phần đến hạn / quá hạn {vnd(debtDue)}</button>}
                        {debtRef > 0 && <button type="button" className="btn btn-xs btn-primary" onClick={() => set({ amount: debtRef, ckttAmount: undefined })}>Phiếu {refDoc!.docNo}: {vnd(debtRef)}</button>}
                      </> : <span className="muted">NCC này không còn nợ</span>}
                    </div>
                  </div>
                )}
                {v.kind === 'payment' && (
                  <div className="field"><label>Chiết khấu thanh toán</label>
                    <div className="row" style={{ gap: 4 }}>
                      <input className="input num" style={{ width: 120 }} value={fmt(v.ckttAmount)} onChange={(e) => set({ ckttAmount: num(e.target.value) || undefined })} />
                      {refReceipt?.cktt?.pct && <button type="button" className="btn btn-xs" title="Tính CKTT của phiếu nhập được chọn" onClick={() => { const c = Math.round((refReceipt.totals.total * refReceipt.cktt!.pct) / 100); set({ ckttAmount: c, amount: refReceipt.totals.total - c }); }}>Tính {Number(refReceipt.cktt.pct).toLocaleString('vi-VN')}%</button>}
                    </div>
                  </div>
                )}
                {isOrder && <>
                  <div className="field"><label>Ngày giao hàng</label><input className="input" type="date" value={v.deliveryDate ?? ''} onChange={(e) => set({ deliveryDate: e.target.value || undefined })} /></div>
                  <div className="field"><label title="NCC giao hàng vào phân kho này — phiếu nhập lập từ đơn tự lấy làm Phân kho. Mặc định là kho mặc định của chi nhánh">Giao tại kho</label>
                    <select className="select input" value={v.deliveryWarehouse ?? ''} disabled={readOnly || !v.branchCode} onChange={(e) => set({ deliveryWarehouse: e.target.value || undefined })}>
                      {!v.branchCode ? <option value="">— chọn chi nhánh trước —</option> : !activeWhs.length ? <option value="">Kho mặc định (chi nhánh chưa khai kho ở DM12)</option> : null}
                      {activeWhs.map((w) => <option key={w.code} value={w.code} title={`${w.name}${w.isDefault ? ' (mặc định)' : ''}${w.isPromo ? ' · kho khuyến mại' : ''}`}>{w.code}</option>)}
                    </select></div>
                  <div className="field"><label title="Ngân sách mua được cấp — chỉ để ước lượng, không chặn">Ngân sách mua</label><input className="input num" value={fmt(v.budget)} placeholder="vd 80.000.000" onChange={(e) => set({ budget: num(e.target.value) || undefined })} />
                    {v.budget ? <span style={{ fontSize: 11.5, fontWeight: 700, color: v.budget - calc.beforeTax >= 0 ? 'var(--ok, #16a34a)' : '#dc2626' }}>{v.budget - calc.beforeTax >= 0 ? 'Còn' : 'Vượt'} {vnd(Math.abs(v.budget - calc.beforeTax))} <span className="muted" style={{ fontWeight: 400 }}>(so tổng sau CK chưa thuế)</span></span> : null}</div>
                </>}
                <div className="field span4"><label>Ghi chú</label><input className="input" value={v.note ?? ''} onChange={(e) => set({ note: e.target.value })} /></div>
              </div>
            </fieldset>

            <div className="tabs" style={{ padding: 0, marginBottom: 8 }}>{tabs.map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}<button type="button" className="btn btn-xs" data-view-ok style={{ marginLeft: 'auto', alignSelf: 'center' }} onClick={() => setHeadOpen(!headOpen)} title={headOpen ? 'Thu gọn đầu phiếu thành một dòng — bảng hàng rộng chỗ hơn' : 'Mở lại đầu phiếu'}>{headOpen ? 'Thu gọn đầu phiếu ▴' : 'Mở đầu phiếu ▾'}</button></div>

            {tab === 'hang' && (<>
              {(v.kind === 'receipt' || v.kind === 'order') && <KhuyenMaiBar rows={board} note={promoOn ? promoNote : []} onOpen={() => setPromoOpen(true)} />}
              {isOrder && v.lines.length > 0 && <div className="row" data-view-ok style={{ gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <button type="button" className="btn btn-sm" disabled={!v.partnerCode} onClick={() => setMauNcc(true)} title="Xem đơn theo mẫu Excel gửi NCC (màu, cột như mẫu quen dùng)">Xem mẫu đơn gửi NCC</button>
                <button type="button" className="btn btn-sm" disabled={!v.partnerCode} onClick={() => void xuatMauNcc(v, mauInfo())} title="Tải tệp Excel đúng mẫu để gửi NCC">Xuất Excel mẫu NCC</button>
                {v.lines.some((l) => !l.sku) && <span className="badge badge-warn">{v.lines.filter((l) => !l.sku).length} dòng hàng mới chưa có mã — gắn mã khi hàng về</span>}
              </div>}
              <fieldset disabled={readOnly} className="mh-lines-wrap" style={{ border: 0, padding: 0, margin: 0 }}>
                {!readOnly && (
                  <div className="lines-bar">
                    <button className="btn btn-sm btn-primary" onClick={() => setPickGoods({ text: '', lineType: 'buy' })} title="Mở danh mục mặt hàng: gõ tên không dấu / mã hoặc quét mã, bấm vào dòng là thêm (phím tắt F3)">+ Thêm {isGiftDoc ? 'quà' : 'hàng'} <kbd>F3</kbd></button>
                    {!isGiftDoc && v.partnerCode && (v.kind === 'order' || v.kind === 'receipt' || v.kind === 'return') && <button className="btn btn-sm" onClick={() => setFill(true)} title="Danh sách mặt hàng NCC này bán: tích chọn, điền số lượng (gợi ý min–max / lần trước), giá tự lấy">Điền mặt hàng của NCC</button>}
                    {!isGiftDoc && lastOfPartner && linesBlank && <button className="btn btn-sm" onClick={() => copyLines(lastOfPartner)} title="Chép mã hàng, số lượng, đơn giá, thuế suất — sửa lại cho đúng lần này">Chép từ phiếu {lastOfPartner.docNo} ({dmy(lastOfPartner.docDate)})</button>}
                    {!isGiftDoc && <button className="btn btn-sm" onClick={() => setPickGoods({ text: '', lineType: 'gift_consumer' })} title="Quà NCC tặng thêm ngoài chương trình. Quà theo chương trình phần mềm tự thêm">+ Quà ngoài chương trình</button>}
                    {isOrder && <button className="btn btn-sm" onClick={() => { const k = newKey(); set({ lines: [...v.lines, { lineKey: k, sku: '', name: '', unit: '', qty: 0, price: 0, taxCode: 'V08', lineType: 'buy', newItem: true }] }); setSelKey(k); }} title="Hàng NCC mới chào, chưa có mã trong danh mục: ghi tên, mã bên NCC, ĐVT, quy cách. Hàng về thì gắn mã ở phiếu nhập">+ Hàng mới chưa có mã</button>}
                    <span className="lines-bar-sep" />
                    <button className="btn btn-sm" onClick={() => setExcelLines(true)} title="Nhập dòng hàng từ tệp Excel: có hướng dẫn cột, file mẫu, xem trước (mã / ĐVT sai báo đỏ)">Nhập Excel</button>
                    <button className="btn btn-sm" disabled={!v.lines.some((l) => l.sku)} onClick={() => void xuatDongHang(`${v.docNo || KIND_LABEL[v.kind]}-hang-hoa.xlsx`, calc.lines, priceLabel, showKho ? v.warehouseCode || defaultWh : '')} title="Xuất dòng hàng ra Excel — đúng bộ cột của mẫu nhập, sửa xong nhập lại được">Xuất Excel</button>
                    <span className="lines-bar-hint" title="Tên, ĐVT, thuế suất, nhãn theo danh mục; giá theo giá mua của NCC; chiết khấu và quà theo chương trình tự áp">tên · ĐVT · thuế · giá · khuyến mại tự điền</span>
                  </div>
                )}
                {/* Bảng hàng tự cuộn trong khung (cao theo màn hình): tiêu đề cột đứng yên, thanh cuộn ngang luôn thấy, phần đầu phiếu không bị cuộn mất. */}
                <div className="mh-lines-box">
                  <table className="mh-lines" style={{ minWidth: 1100 }}>
                    <thead><tr>
                      <th data-minw="56">#</th>{v.kind === 'exchange' && <th>Chiều</th>}{!isGiftDoc && <th title="Tự nhận theo mã hàng (quy tắc mã hàng) và đơn giá: giá 0 = hàng tặng">Loại hàng</th>}<th>Mã hàng</th><th>Tên hàng</th><th>ĐVT</th>{showKho && <th title="Theo ô Phân kho ở đầu phiếu — mọi dòng cùng một phân kho">Phân kho</th>}<th className="num">SL</th>{isOrder && <th title="Phân tích thông minh: số liệu tồn chụp lúc thêm hàng / lưu đơn (Phân tích đặt hàng MH02)">Phân tích tồn</th>}
                      <th className="num">{isGiftDoc ? 'Giá trị / ĐVT' : v.priceIncludesVat ? 'Đơn giá gồm thuế' : 'Đơn giá chưa thuế'}</th>
                      {!isGiftDoc && <><th className="num" title="Chiết khấu dòng theo %, tối đa 100%. Gõ % thì cột CK (đ) tự tính; để trống cả hai = tự lấy theo chính sách">CK %</th><th className="num" title="Chiết khấu dòng bằng tiền (theo loại giá của phiếu), tối đa bằng tiền hàng của dòng. Gõ tiền thì cột CK % tự tính lại">CK (đ)</th><th>Thuế suất</th><th className="num">Thành tiền chưa thuế</th><th className="num">Tiền thuế</th><th className="num" title="Thành tiền chưa thuế + tiền thuế (sau chiết khấu)">Thành tiền (gồm thuế)</th><th className="num" title="Giá vốn đơn vị thực tế: trước thuế, sau CK, đã chia quà người bán">Giá vốn / ĐVT</th></>}
                      {isGiftDoc && <th>Chương trình</th>}{!isOrder && <><th>Số lô</th><th>NSX</th><th>Hạn dùng</th></>}<th>Ghi chú</th><th data-minw="72" style={{ minWidth: 72 }} title="Nhân đôi / xoá dòng (cũng có ở cột # đầu dòng và khi bấm chuột phải)" />
                    </tr></thead>
                    <tbody onKeyDown={(e) => {
                      // Phím tắt trên dòng đang chọn: Ctrl+D nhân đôi, Ctrl+Delete xoá dòng; mũi tên đi lại giữa các ô như Excel.
                      if (!readOnly && selKey && e.ctrlKey && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); lineOps.dup(selKey); return; }
                      if (!readOnly && selKey && e.ctrlKey && e.key === 'Delete') { e.preventDefault(); lineOps.del(selKey); return; }
                      gridNav(e);
                    }}>
                      {calc.lines.map((l, i) => (
                        <tr key={l.lineKey} className={`${l.lineKey === selKey ? 'sel' : ''} ${lineLevel(l.lineKey)}`} onClick={() => setSelKey(l.lineKey)}
                          onContextMenu={(e) => { if (readOnly) return; e.preventDefault(); setSelKey(l.lineKey); setCtx({ x: Math.min(e.clientX, window.innerWidth - 250), y: Math.min(e.clientY, window.innerHeight - 220), key: l.lineKey }); }}
                          title={readOnly ? undefined : 'Chuột phải: nhân đôi dòng, thêm dòng ĐVT lẻ, chèn dòng, xoá dòng'}>
                          {/* STT + nút dòng ở cột đầu: luôn nhìn thấy, không bị khung cuộn ngang che như cột cuối. */}
                          <td style={{ whiteSpace: 'nowrap' }}>{i + 1}{!readOnly && <div className="mh-line-acts">
                            <button type="button" className="btn btn-xs" title="Nhân đôi dòng (Ctrl + D) — vd thêm dòng cùng mã để mua lẻ theo ĐVT khác. Chuột phải vào dòng để có thêm lựa chọn" onClick={(e) => { e.stopPropagation(); lineOps.dup(l.lineKey); }}>⧉</button>
                            <button type="button" className="btn btn-xs mh-del" title="Xoá dòng (Ctrl + Delete)" onClick={(e) => { e.stopPropagation(); lineOps.del(l.lineKey); }}>×</button>
                          </div>}</td>
                          {v.kind === 'exchange' && <td><select className="select input" value={l.dir ?? 'in'} onChange={(e) => setLine(l.lineKey, { dir: e.target.value as 'in' | 'out' })}><option value="out">Trả đi</option><option value="in">Nhận về</option></select></td>}
                          {!isGiftDoc && <td style={{ width: 150 }}>{(() => {
                            const info = skuInfo(l.sku);
                            const tag = l.sku && info.label && info.kind !== 'normal' ? <span className={`badge badge-${info.tone}`} title={info.hint}>{info.label}</span> : null;
                            if (l.lineType === 'buy') return tag ?? <span className="muted" style={{ fontSize: 12 }}>Hàng mua</span>;
                            return <div>
                              <span className="badge badge-ok" title="Đơn giá 0 = hàng tặng">Hàng tặng</span> {tag}
                              <label className="mh-share" title="Tích: giá trị hàng tặng chia vào giá vốn hàng mua cùng mã (hàng chia giá). Bỏ tích: quà cho người tiêu dùng, ghi 0 đồng, vào sổ quà"><input type="checkbox" checked={l.lineType === 'gift_seller'} disabled={info.kind === 'promo' || info.kind === 'gift'} onChange={(e) => setLine(l.lineKey, { lineType: e.target.checked ? 'gift_seller' : 'gift_consumer' })} /> chia vào giá vốn</label>
                            </div>;
                          })()}</td>}
                          <td style={{ width: 130 }}>{l.sku || readOnly ? <span className="mono">{l.sku || <span className="badge badge-warn">Hàng mới</span>}</span> : <>{(l.newItem || l.refLineKey) && <span className="badge badge-warn" style={{ fontSize: 10 }} title="Chưa có mã: chọn mã đã tạo ở Danh mục mặt hàng để gắn">Hàng mới — gắn mã</span>}<ItemPicker value={l.sku} onChange={(c) => void pickSku(l.lineKey, c)} hideName style={{ width: 125 }} /></>}{l.newItem && l.sku && <div className="muted" style={{ fontSize: 10.5 }}>đã gắn mã (hàng mới)</div>}</td>
                          <td style={{ minWidth: 240 }} title={l.sku ? 'Tên theo danh mục mặt hàng — không sửa trên phiếu' : 'Hàng mới: ghi tên theo NCC'}>{!l.sku && !readOnly ? <div className="row" style={{ gap: 4 }}><input className="input" style={{ flex: 1 }} value={l.name} placeholder="Tên hàng (theo NCC)" onChange={(e) => setLine(l.lineKey, { name: e.target.value })} /><input className="input mono" style={{ width: 90 }} value={l.nccSku ?? ''} placeholder="Mã NCC" onChange={(e) => setLine(l.lineKey, { nccSku: e.target.value || undefined })} /></div> : l.name || <span className="muted">—</span>}{l.nccSku && l.sku && <div className="muted" style={{ fontSize: 10.5 }}>Mã NCC: {l.nccSku}</div>}{(l.program || l.autoGift) && <div className="muted" style={{ fontSize: 11 }}>{l.autoGift && <span className="badge badge-ok" title="Phần mềm tự thêm theo chương trình — số lượng tự chạy theo hàng mua; sửa số lượng thì thôi tự chạy">tự</span>} {l.program ? `CT: ${l.program}` : ''}</div>}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{(() => { const us = unitsOf(l.sku); if (!l.sku && !readOnly) return l.newItem ? <input className="input" style={{ width: 70 }} value={l.unit} placeholder="Lon" onChange={(e) => setLine(l.lineKey, { unit: e.target.value })} /> : <span className="muted" style={{ fontSize: 11.5 }}>chọn mã trước</span>; return us.length && !readOnly ? (
                            <select className="select input" style={{ width: 112 }} value={us.find((u) => u.unit.toLowerCase() === l.unit.toLowerCase())?.unit ?? ''} onChange={(e) => changeUnit(l, e.target.value)} title="ĐVT khai ở Danh mục mặt hàng (×tỉ lệ về ĐVT nhỏ nhất) — đổi ĐVT thì đơn giá quy đổi theo">
                              {!us.some((u) => u.unit.toLowerCase() === l.unit.toLowerCase()) && <option value="">{l.unit || '—'}</option>}
                              {us.map((u) => <option key={u.unit} value={u.unit}>{u.unit}</option>)}
                            </select>) : <span title="ĐVT theo danh mục mặt hàng">{l.unit || '—'}</span>; })()}
                            {!readOnly && l.sku && <button type="button" className="btn btn-xs" style={{ marginLeft: 3, padding: '0 6px' }}
                              title={unitsOf(l.sku).length <= 1 ? 'Mặt hàng mới có 1 ĐVT — bấm để khai thêm ĐVT (Lốc, Thùng…) và tỉ lệ ngay tại đây' : 'Thêm / sửa ĐVT và tỉ lệ của mặt hàng ngay tại đây (vd sửa 1 Thùng = 24). Lưu xong dòng phiếu tự lấy ĐVT, tỉ lệ mới'}
                              onClick={(e) => { e.stopPropagation(); setProductSku(l.sku); }}>{unitsOf(l.sku).length <= 1 ? '＋' : '✎'}</button>}
                            {/* Quy cách nhìn ngay: 1 Thùng = 48 Hộp; có SL thì ra tổng ĐVT nhỏ nhất (16 Thùng = 768 Hộp). */}
                            {(() => { const us = unitsOf(l.sku); const r = l.sku ? ratioOf(us, l.unit) : 1; const b = baseUnitOf(us);
                              if (!r || r === 1 || !b) return null;
                              // Có ĐVT trung gian (Thùng 2 = 2 Thùng) thì ghi cả chuỗi về ĐVT nhỏ nhất; không thì một vế là đủ.
                              const ref = refOf(us, { unit: l.unit, ratio: r });
                              const mid = ref && ref.ratio > 1 ? `${(Math.round((r / ref.ratio) * 1e6) / 1e6).toLocaleString('vi-VN')} ${ref.unit} = ` : '';
                              const n = (x: number) => (Math.round(x * 10000) / 10000).toLocaleString('vi-VN');
                              return <div className="mh-unit-spec" title={`Tỉ lệ khai ở Danh mục mặt hàng — sửa bằng nút ✎. Kho, tồn, phân tích đặt hàng tính theo ${b}`}>
                                1 {l.unit} = {mid}<b>{n(r)} {b}</b>{l.qty && l.qty !== 1 ? <span className="muted"> · {n(l.qty)} {l.unit} = {n(l.qty * r)} {b}</span> : null}
                              </div>; })()}</td>
                          {showKho && <td style={{ whiteSpace: 'nowrap' }} title="Theo ô Phân kho ở đầu phiếu"><span className="mono">{v.warehouseCode || <span className="muted">mặc định</span>}</span></td>}
                          <td><NumInput style={{ width: 82 }} step={1} blankZero={false} value={l.qty} title="Số lượng — bấm ▲▼ (hoặc Ctrl + ↑ ↓) để tăng giảm 1" onChange={(n) => setLine(l.lineKey, { qty: n ?? 0, ...(l.autoGift ? { autoGift: false } : {}) })} /></td>
                          {isOrder && <>
                            <td style={{ fontSize: 10.5, minWidth: 230, lineHeight: 1.3, verticalAlign: 'top' }} title="Phân tích thông minh — số liệu chụp lúc thêm hàng / lưu đơn (ĐVT nhỏ nhất); mở lại đơn vẫn là số lúc đặt">{l.stockInfo ? <>
                              <div className="tm-facts2">
                                {([
                                  ['Cần nhập', l.stockInfo.need, 'need'], ['Tồn kho', l.stockInfo.tonKho, 'stock'], ['Chưa nhập kho', l.stockInfo.dangDat, ''],
                                  ['BH tháng trước', l.stockInfo.banThangTruoc, ''], ['Bán 1 tuần', l.stockInfo.banShop, ''], ['Max kho', l.stockInfo.maxKho, 'max'],
                                  ['Đi đường', l.stockInfo.diDuong, ''], ['Max shop', l.stockInfo.maxShop, 'max'], ['Tồn shop', l.stockInfo.tonShop, ''],
                                ] as [string, number | undefined, string][]).filter(([, n]) => n !== undefined).map(([k, n, cls]) => <span key={k} className={`tm-f2 ${cls ? `tm-f-${cls}` : ''}`}><span>{k}</span><b>{fmt(n) || 0}</b></span>)}
                              </div>
                              {l.family?.length ? <span className="tm-fam" title="Họ mã: số ở bảng trên đã cộng dồn mã chính + mã con">{l.family.map((m) => <span key={m.sku} className="tm-fam-row"><b className="mono">{m.sku}</b> {m.kind}: {factsText(m)}</span>)}</span> : null}</> : <span className="muted" style={{ whiteSpace: 'normal' }}>{v.status !== 'draft' ? '—' : !need.parent ? '— chi nhánh chưa thuộc cây chi nhánh cha (MH15) nên chưa có phân tích' : need.loading ? 'đang tải phân tích…' : '— mã chưa có trong phân tích (chưa có max, tồn, bán, đi đường, đơn đang đặt)'}</span>}</td>
                          </>}
                          <td><NumInput style={{ width: 95 }} value={l.price} placeholder={isGiftDoc ? '' : '0 = tặng'} title="Đơn giá có thể có số lẻ: gõ dấu phẩy, vd 506.018,52" onChange={(n) => (isGiftDoc ? setLine(l.lineKey, { price: n ?? 0 }) : setPrice(l, n ?? 0))} />{!readOnly && !isGiftDoc && priceHints(l)}</td>
                          {!isGiftDoc && <>
                            {/* CK % ⇄ CK (đ): gõ một cột, cột kia tự tính theo tiền hàng của dòng. Trống cả hai = tự lấy theo chính sách. */}
                            <td><NumInput style={{ width: 56 }} decimals={2} value={l.discountAmt !== undefined ? (l.gross ? Math.round((l.lineDiscount / l.gross) * 10000) / 100 : 0) : l.discountPct} blankZero={false} disabled={l.lineType !== 'buy'} placeholder="tự"
                              title={l.discountAmt !== undefined ? 'Đang tính từ CK (đ) — gõ % để chiết khấu theo %. Tối đa 100%' : 'Để trống: tự lấy theo chính sách (bậc số lượng…). Có thể có số lẻ, vd 2,5. Tối đa 100%'}
                              onChange={(n) => setLine(l.lineKey, { discountPct: n === null ? undefined : Math.min(100, n), discountAmt: undefined })} /></td>
                            <td><NumInput style={{ width: 90 }} decimals={0} value={l.lineType === 'buy' && (l.discountAmt !== undefined || l.lineDiscount) ? l.lineDiscount : null} disabled={l.lineType !== 'buy'} placeholder="tự"
                              title={`Chiết khấu dòng bằng tiền, tối đa ${fmt(l.gross)} (tiền hàng của dòng). Gõ tiền thì CK % tự tính lại`}
                              onChange={(n) => setLine(l.lineKey, { discountAmt: n === null ? undefined : Math.min(l.gross, n), discountPct: undefined })} /></td>
                            <td><select className="select input" style={{ width: 92 }} value={l.taxCode} title="Thuế suất GTGT đầu vào — tự lấy theo danh mục mặt hàng" onChange={(e) => setLine(l.lineKey, { taxCode: e.target.value })}>{Object.entries(TAX_LABEL).map(([k, t]) => <option key={k} value={k}>{t}</option>)}{!TAX_LABEL[l.taxCode] && <option value={l.taxCode}>{l.taxCode}</option>}</select></td>
                            <td className="num">{l.lineType === 'buy' ? fmt(l.beforeTax) : <span className="muted">tặng</span>}</td>
                            <td className="num">{fmt(l.tax)}</td>
                            <td className="num"><b>{l.lineType === 'buy' ? fmt(l.beforeTax + l.tax) : ''}</b></td>
                            <td className="num">{l.lineType === 'gift_consumer' ? <span className="muted">—</span> : fmt(l.realUnitCost)}</td>
                          </>}
                          {isGiftDoc && <td><input className="input mono" style={{ width: 110 }} value={l.program ?? ''} placeholder={v.gift?.program ?? ''} onChange={(e) => setLine(l.lineKey, { program: e.target.value.trim() || undefined })} /></td>}
                          {!isOrder && <>
                            <td><input className="input mono" style={{ width: 80 }} value={l.lotNo ?? ''} onChange={(e) => setLine(l.lineKey, { lotNo: e.target.value || undefined })} /></td>
                            <td><input className="input" type="date" style={{ width: 125 }} value={l.mfgDate ?? ''} title="Ngày sản xuất (nếu có)" onChange={(e) => setLine(l.lineKey, { mfgDate: e.target.value || undefined })} /></td>
                            <td><input className="input" type="date" style={{ width: 125 }} value={l.expDate ?? ''} onChange={(e) => setLine(l.lineKey, { expDate: e.target.value || undefined })} /></td>
                          </>}
                          <td><input className="input" style={{ width: 150 }} value={l.note ?? ''} placeholder="Ghi chú dòng" title="Ghi chú của dòng — in trên đơn gửi NCC" onChange={(e) => setLine(l.lineKey, { note: e.target.value || undefined })} /></td>
                          {/* Nút dòng ở cả cuối dòng (người quen kéo sang phải), cùng tác dụng với nút ở cột #. Đủ rộng để khung cuộn không che. */}
                          <td style={{ minWidth: 72, whiteSpace: 'nowrap', paddingRight: 10 }}>{!readOnly && <div className="mh-line-acts" style={{ marginTop: 0 }}>
                            <button type="button" className="btn btn-xs" title="Nhân đôi dòng (Ctrl + D)" onClick={(e) => { e.stopPropagation(); lineOps.dup(l.lineKey); }}>⧉</button>
                            <button type="button" className="btn btn-xs mh-del" title="Xoá dòng (Ctrl + Delete)" onClick={(e) => { e.stopPropagation(); lineOps.del(l.lineKey); }}>×</button>
                          </div>}</td>
                        </tr>
                      ))}
                      {!v.lines.length && <tr><td colSpan={19} className="lines-empty">
                        {readOnly ? <span className="muted">Phiếu chưa có dòng hàng</span> : <>
                          <div className="muted">Phiếu chưa có hàng</div>
                          <div className="row" style={{ gap: 8, justifyContent: 'center', marginTop: 8 }}>
                            <button className="btn btn-primary" onClick={() => setPickGoods({ text: '', lineType: 'buy' })}>+ Thêm {isGiftDoc ? 'quà' : 'hàng'} từ danh mục</button>
                            {!isGiftDoc && v.partnerCode && (v.kind === 'order' || v.kind === 'receipt' || v.kind === 'return') && <button className="btn" onClick={() => setFill(true)}>Điền mặt hàng của NCC</button>}
                            {!isGiftDoc && lastOfPartner && <button className="btn" onClick={() => copyLines(lastOfPartner)}>Chép từ phiếu {lastOfPartner.docNo}</button>}
                          </div>
                        </>}
                      </td></tr>}
                    </tbody>
                    {!isGiftDoc && (
                      <tfoot>
                        <tr><td colSpan={(v.kind === 'exchange' ? 7 : 6) + (showKho ? 1 : 0)}>Cộng — mua {fmt(calc.buyQty)} · KM người bán {fmt(calc.giftSellerQty)} · KM NTD / quà {fmt(calc.giftConsumerQty)}</td>
                          <td colSpan={4} className="num">Tiền hàng {fmt(calc.gross)} − CK {fmt(calc.lineDiscount + calc.orderDiscount)}</td>
                          <td className="num">{fmt(calc.beforeTax)}</td><td className="num">{fmt(calc.tax)}</td><td className="num"><b>{fmt(calc.beforeTax + calc.tax)}</b></td><td colSpan={isOrder ? 3 : 6} /></tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </fieldset>
            </>)}

            {tab === 'thanh-toan' && (() => {
              // Ba câu hỏi người dùng hay hỏi — trả lời thẳng bằng câu, chi tiết kỹ thuật để trong nút "đặt riêng".
              const due = a?.calc.dueDate ?? calc.dueDate;
              const termTrace = calc.trace.find((t) => t.kind === 'payment_term');
              const ckttPct = calc.ckttExpected && calc.payable ? Math.round((calc.ckttExpected / calc.payable) * 10000) / 100 : 0;
              const nccLink = v.partnerCode ? `/mua-hang/nha-cung-cap/${encodeURIComponent(v.partnerCode)}?the=hop-dong` : '';
              const sum = (v.schedule ?? []).reduce((x, y) => x + y.amount, 0);
              return (
              <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
                <div className="mh-grid2">
                  <div className="mh-panel mh-qa">
                    <h4>① Khi nào phải trả tiền cho nhà cung cấp?</h4>
                    {v.term ? <>
                      <div className="mh-qa-ans">Hạn trả: <b>{due ? dmy(due) : '—'}</b> <span className="badge badge-info">đặt riêng cho phiếu này</span></div>
                      <div style={{ marginTop: 6 }}><TermEditor rule={v.term as unknown as Record<string, unknown>} onChange={(r) => set({ term: r as unknown as PDoc['term'] })} /></div>
                      <div className="muted" style={{ fontSize: 12 }}>{termText(v.term)}</div>
                      {!readOnly && <button type="button" className="btn btn-xs" style={{ marginTop: 6 }} onClick={() => set({ term: undefined })}>Bỏ — dùng theo hợp đồng với NCC</button>}
                    </> : termTrace ? <>
                      <div className="mh-qa-ans">Hạn trả: <b>{due ? dmy(due) : '—'}</b></div>
                      <div className="muted" style={{ fontSize: 12.5 }}>Theo hợp đồng với NCC: {termTrace.text}</div>
                      {!readOnly && <button type="button" className="btn btn-xs" style={{ marginTop: 6 }} onClick={() => set({ term: { basis: 'receipt_date', days: 10, workingDays: true, dayType: 'working' } as PDoc['term'] })}>Phiếu này có hạn khác? Đặt hạn riêng</button>}
                    </> : <>
                      <div className="mh-qa-ans mh-warn">Chưa biết hạn trả</div>
                      <div className="muted" style={{ fontSize: 12.5 }}>Nhà cung cấp này chưa khai điều khoản trả tiền (ví dụ "10 ngày làm việc kể từ ngày nhận hàng"). Khai một lần, các phiếu sau tự tính hạn.</div>
                      <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        {nccLink && <a className="btn btn-xs btn-primary" href={nccLink} target="_blank" rel="noreferrer">Khai điều khoản cho NCC (mở hồ sơ NCC)</a>}
                        {!readOnly && <button type="button" className="btn btn-xs" onClick={() => set({ term: { basis: 'receipt_date', days: 10, workingDays: true, dayType: 'working' } as PDoc['term'] })}>Đặt hạn riêng cho phiếu này</button>}
                      </div>
                    </>}
                  </div>
                  <div className="mh-panel mh-qa">
                    <h4>② Trả đúng hạn có được giảm tiền không?</h4>
                    {calc.ckttExpected ? <>
                      <div className="mh-qa-ans mh-ok">Có — giảm {Number(ckttPct).toLocaleString('vi-VN')}% nếu trả trước {due ? dmy(due) : 'hạn'}</div>
                      <div style={{ fontSize: 13 }}>Được giảm <b>{vnd(calc.ckttExpected)}</b> → chỉ phải trả <b>{vnd(calc.payable - calc.ckttExpected)}</b>. Phần giảm ghi khi lập phiếu <i>Trả tiền NCC</i>.</div>
                      <div className="row" style={{ gap: 6, alignItems: 'center', marginTop: 6, fontSize: 12.5 }}>Dự kiến trả ngày <input className="input" type="date" style={{ width: 150 }} value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                        {payDate && (() => { const r = ckttFor(calc.payable, ckttPct, calc.dueDate, payDate, calc.payable - calc.ckttExpected); return <span className={r.eligible ? 'mh-ok' : 'mh-bad'}>{r.eligible ? `kịp hạn — được giảm ${vnd(r.amount)}` : r.reason}</span>; })()}</div>
                    </> : <>
                      <div className="mh-qa-ans">Không</div>
                      <div className="muted" style={{ fontSize: 12.5 }}>Nhà cung cấp này không giảm tiền khi trả đúng hạn.</div>
                    </>}
                    {!readOnly && (v.cktt ? (
                      <div className="row" style={{ gap: 6, alignItems: 'center', marginTop: 6, fontSize: 12.5 }}>Phiếu này giảm <NumInput style={{ width: 64 }} value={v.cktt.pct} blankZero={false} onChange={(n) => set({ cktt: n === null ? undefined : { pct: n } })} /> % nếu trả đúng hạn <button type="button" className="btn btn-xs" onClick={() => set({ cktt: undefined })}>Bỏ — theo hợp đồng</button></div>
                    ) : <button type="button" className="btn btn-xs" style={{ marginTop: 6 }} onClick={() => set({ cktt: { pct: ckttPct || 1 } })}>Phiếu này có thoả thuận giảm riêng? Ghi %</button>)}
                  </div>
                </div>
                <div className="mh-panel mh-qa">
                  <h4>③ Trả một lần hay nhiều lần? {!readOnly && !(v.schedule ?? []).length && <button className="btn btn-xs" style={{ marginLeft: 'auto' }} onClick={() => { const n = 3; const each = Math.floor(calc.payable / n); set({ schedule: Array.from({ length: n }, (_, k) => ({ seq: k + 1, dueDate: due ?? v.docDate, amount: k === n - 1 ? calc.payable - each * (n - 1) : each })) }); }}>Chia 3 đợt</button>}</h4>
                  {(v.schedule ?? []).length ? (
                    <table className="mh-mini"><thead><tr><th>Đợt</th><th>Hạn trả đợt</th><th className="num">Số tiền</th><th /></tr></thead><tbody>
                      {(v.schedule ?? []).map((x, k) => (
                        <tr key={k}><td>{x.seq}</td>
                          <td><input className="input" type="date" value={x.dueDate} onChange={(e) => set({ schedule: v.schedule!.map((y, m) => (m === k ? { ...y, dueDate: e.target.value } : y)) })} /></td>
                          <td className="num"><input className="input num" value={fmt(x.amount)} onChange={(e) => set({ schedule: v.schedule!.map((y, m) => (m === k ? { ...y, amount: num(e.target.value) } : y)) })} /></td>
                          <td><button className="btn btn-xs" title="Bỏ đợt" onClick={() => set({ schedule: v.schedule!.filter((_, m) => m !== k) })}>×</button></td></tr>
                      ))}
                      <tr><td colSpan={2}>Cộng</td><td className={`num ${sum === calc.payable ? 'mh-ok' : 'mh-bad'}`}>{vnd(sum)} / {vnd(calc.payable)}</td><td>{!readOnly && <button className="btn btn-xs" onClick={() => set({ schedule: undefined })}>Trả một lần</button>}</td></tr>
                    </tbody></table>
                  ) : <div className="muted" style={{ fontSize: 12.5 }}>Trả một lần{due ? ` trước ${dmy(due)}` : ''}. NCC cho trả nhiều lần thì bấm "Chia 3 đợt" rồi sửa ngày, số tiền từng đợt — tiền trả sau này tự trừ vào đợt sớm trước.</div>}
                </div>
                {(a?.prepayment ?? 0) > 0 && <div className="alert alert-ok">Đã ứng trước {vnd(a!.prepayment)} theo đơn {a!.refOrder?.docNo} — khi duyệt tự trừ, còn phải trả {vnd(Math.max(0, calc.payable - a!.prepayment))}.</div>}
              </fieldset>
              );
            })()}

            {tab === 'hoa-don' && (
              <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
                <div className="mh-head">
                  <div className="field"><label>Số hoá đơn</label><input className="input mono" value={v.invoice?.no ?? ''} onChange={(e) => set({ invoice: e.target.value ? { no: e.target.value.trim(), serial: v.invoice?.serial, date: v.invoice?.date || v.docDate, total: v.invoice?.total } : undefined })} /></div>
                  <div className="field"><label>Ký hiệu</label><input className="input mono" value={v.invoice?.serial ?? ''} disabled={!v.invoice} onChange={(e) => v.invoice && set({ invoice: { ...v.invoice, serial: e.target.value } })} /></div>
                  <div className="field"><label>Ngày hoá đơn</label><input className="input" type="date" value={v.invoice?.date ?? ''} disabled={!v.invoice} onChange={(e) => v.invoice && set({ invoice: { ...v.invoice, date: e.target.value } })} /></div>
                  <div className="field"><label>Tổng tiền trên hoá đơn</label><input className="input num" value={fmt(v.invoice?.total)} disabled={!v.invoice} onChange={(e) => v.invoice && set({ invoice: { ...v.invoice, total: num(e.target.value) || undefined } })} /></div>
                  <div className="field"><label title="Hoá đơn sai phải điều chỉnh: hạn thanh toán lùi đúng số ngày NCC sửa hoá đơn">HĐ sai — ngày báo NCC</label><input className="input" type="date" value={v.invoiceFix?.from ?? ''} onChange={(e) => set({ invoiceFix: e.target.value ? { from: e.target.value, to: v.invoiceFix?.to ?? e.target.value } : undefined })} /></div>
                  <div className="field"><label>Ngày nhận HĐ điều chỉnh</label><input className="input" type="date" value={v.invoiceFix?.to ?? ''} disabled={!v.invoiceFix} onChange={(e) => v.invoiceFix && set({ invoiceFix: { ...v.invoiceFix, to: e.target.value || v.invoiceFix.from } })} /></div>
                </div>
                <div className="mh-panel">
                  <h4>Đối soát tự động</h4>
                  <table className="mh-mini"><tbody>
                    <tr><td>Tổng tính từ dòng hàng (sau CK, gồm thuế)</td><td className="num">{vnd(calc.payable)}</td><td /></tr>
                    <tr><td>Tổng trên hoá đơn</td><td className="num">{v.invoice?.total ? vnd(v.invoice.total) : '—'}</td>
                      <td>{v.invoice?.total ? (Math.abs(v.invoice.total - calc.payable) < 1 ? <span className="mh-ok">✓ khớp</span> : <span className="mh-bad">lệch {vnd(v.invoice.total - calc.payable)}</span>) : <span className="muted">chưa nhập</span>}</td></tr>
                    <tr><td>Trùng số hoá đơn cùng NCC</td><td /><td>{checks.some((c) => c.code === 'invoice_dup') ? <span className="mh-bad">⛔ {checks.find((c) => c.code === 'invoice_dup')!.text}</span> : <span className="mh-ok">✓ không trùng</span>}</td></tr>
                    <tr><td>Tiền ứng trước chưa đối trừ</td><td className="num">{vnd(a?.prepayment)}</td><td>{a?.prepayment ? <span className="mh-ok">tự đối trừ khi duyệt</span> : <span className="muted">—</span>}</td></tr>
                  </tbody></table>
                </div>
                {v.kind === 'receipt' && (() => {
                  const c = checks.find((x) => x.code === 'inv_match' || x.code === 'inv_diff' || x.code === 'inv_not_stored');
                  return (
                    <div className="mh-panel">
                      <h4>Đối soát với hoá đơn NCC đã lưu (MH22) — từng dòng: số lượng, giá chưa thuế, thuế suất, tổng tiền</h4>
                      {!v.invoice?.no ? <div className="muted">Chưa ghi số hoá đơn. Chọn ở ô "Lấy từ hoá đơn NCC" (đầu phiếu) hoặc gõ số hoá đơn ở trên — phần mềm tự đối soát nếu hoá đơn đã có ở MH22.</div>
                        : !a ? <div className="muted">{nccInvoices.some((x) => sameInvoice(x, { no: v.invoice!.no, series: v.invoice!.serial })) ? `Hoá đơn ${v.invoice.no} có ở MH22 — ` : ''}Chọn đủ nhà cung cấp, chi nhánh, ngày phiếu là phần mềm đối soát ngay.</div>
                        : !c ? <div className="muted">Hoá đơn {v.invoice.no} chưa có ở MH22 — nhập Excel / quét hoá đơn ở <Link to="/mua-hang/hoa-don-ncc">MH22</Link> để đối soát từng dòng.</div>
                        : <div className={c.code === 'inv_diff' ? 'mh-bad' : c.code === 'inv_match' ? 'mh-ok' : 'muted'}>{c.code === 'inv_match' ? '✓ ' : c.code === 'inv_diff' ? '⚠ ' : ''}{c.text}</div>}
                    </div>
                  );
                })()}
                {a?.refOrder && (
                  <div className="mh-panel">
                    <h4>Đối chiếu 3 bên: đơn đặt {a.refOrder.docNo} ↔ phiếu nhập ↔ hoá đơn</h4>
                    <table className="mh-mini"><thead><tr><th>Mã hàng</th><th className="num">SL đặt</th><th className="num">SL nhận</th><th className="num">Giá đặt</th><th className="num">Giá HĐ</th><th>Kết quả</th></tr></thead><tbody>
                      {[...new Set([...a.refOrder.lines, ...v.lines].filter((l) => l.lineType === 'buy').map((l) => l.sku))].map((sku) => {
                        const o = a.refOrder!.lines.filter((l) => l.sku === sku && l.lineType === 'buy'); const r = v.lines.filter((l) => l.sku === sku && l.lineType === 'buy');
                        const oq = o.reduce((s, l) => s + l.qty, 0), rq = r.reduce((s, l) => s + l.qty, 0), op = o[0]?.price ?? 0, rp = r[0]?.price ?? 0;
                        return <tr key={sku}><td className="mono">{sku}</td><td className="num">{oq}</td><td className={`num ${oq !== rq ? 'mh-bad' : ''}`}>{rq}</td><td className="num">{fmt(op)}</td><td className={`num ${op !== rp ? 'mh-bad' : ''}`}>{fmt(rp)}</td><td>{oq === rq && op === rp ? <span className="mh-ok">✓</span> : <span className="mh-bad">lệch</span>}</td></tr>;
                      })}
                    </tbody></table>
                  </div>
                )}
              </fieldset>
            )}

            {tab === 'hach-toan' && (
              <>
                {stored?.links.length ? (
                  <div className="alert alert-ok" style={{ marginBottom: 8 }}>
                    Đã ghi sổ: {stored.links.map((l) => `${l.role} ${l.docNo}`).join(' · ')} — xem bút toán ở <b>Chứng từ kế toán</b> (ACC14) theo số chứng từ.
                  </div>
                ) : null}
                <div className="mh-panel">
                  <h4>Bút toán {stored?.links.length ? 'đã ghi' : 'sẽ ghi khi duyệt'} (tài khoản theo cấu hình của đơn vị)</h4>
                  <table className="mh-mini"><thead><tr><th>Nợ</th><th>Có</th><th className="num">Số tiền</th><th>Diễn giải</th></tr></thead><tbody>
                    {(a?.entries ?? []).map((e, i) => <tr key={i}><td className="mono">{e.debit}</td><td className="mono">{e.credit}</td><td className="num">{vnd(e.amount)}</td><td>{e.text}</td></tr>)}
                    {!(a?.entries ?? []).length && <tr><td colSpan={4} className="muted">{v.kind === 'order' ? 'Đơn đặt hàng không ghi sổ (chỉ giữ hạn mức).' : analyzing ? 'Đang tính…' : 'Chưa đủ thông tin.'}</td></tr>}
                    {(a?.prepayment ?? 0) > 0 && <tr><td colSpan={4} className="muted">Đối trừ ứng trước {vnd(a!.prepayment)}: cùng tài khoản phải trả nên không sinh bút toán — chỉ trừ khoản công nợ.</td></tr>}
                    {calc.ckttExpected ? <tr><td colSpan={4} className="muted">CKTT {vnd(calc.ckttExpected)} chỉ ghi khi trả đúng hạn (phiếu Trả tiền NCC): Nợ 331 / Có 515.</td></tr> : null}
                  </tbody></table>
                </div>
                {v.allocation?.length ? (
                  <div className="mh-panel">
                    <h4>Phân bổ theo mã hàng</h4>
                    <table className="mh-mini"><thead><tr><th>Mã hàng</th><th>Tên</th><th className="num">Số tiền</th></tr></thead><tbody>
                      {v.allocation.map((x) => <tr key={x.sku}><td className="mono">{x.sku}</td><td>{x.name}</td><td className="num">{vnd(x.amount)}</td></tr>)}
                    </tbody></table>
                  </div>
                ) : null}
              </>
            )}

            {tab === 'lich-su' && <div className="mh-panel">{v.docNo && !v.id.startsWith('new-') ? <LichSu docNo={v.docNo} title={`Lịch sử phiếu ${v.docNo}: ai tạo / sửa / duyệt, lúc nào, đổi gì`} /> : <div className="muted">Phiếu chưa ghi.</div>}</div>}
            {tab === 'tep-ncc' && <div className="mh-panel"><h4>Tệp của nhà cung cấp {v.partnerCode ? `${v.partnerCode} — ${names.partnerName(v.partnerCode)}` : ''} (hợp đồng, phụ lục, báo giá, CO / CQ… — dùng chung mọi phiếu của NCC, xem cả ở hồ sơ NCC)</h4>
              {v.partnerCode ? <TepDinhKem ownerType="partner" ownerId={v.partnerCode} defaultKind="hop_dong" /> : <div className="muted">Chọn nhà cung cấp trước.</div>}</div>}
            {tab === 'tep' && <div className="mh-panel"><h4>Tệp đính kèm của phiếu (hoá đơn, biên bản, CO / CQ, biên bản…)</h4><TepDinhKem ownerType="document" ownerId={v.id} defaultKind="hoa_don" /></div>}

            {tab === 'gia-von' && (
              <div className="mh-panel">
                <h4>Giá vốn thực tế từng dòng (trước thuế)</h4>
                <table className="mh-mini"><thead><tr><th>Mã</th><th>Loại dòng</th><th className="num">SL</th><th className="num">Đơn giá gốc</th><th className="num">CK dòng</th><th className="num">CK đơn phân bổ</th><th className="num">Sau CK trước thuế</th><th className="num">Giá vốn / ĐVT</th></tr></thead><tbody>
                  {calc.lines.map((l) => <tr key={l.lineKey}><td className="mono">{l.sku}</td><td>{LINE_TYPE[l.lineType]}</td><td className="num">{fmt(l.qty)}</td><td className="num">{fmt(l.price)}</td><td className="num">{fmt(l.lineDiscount)}</td><td className="num">{fmt(l.orderDiscount)}</td><td className="num">{fmt(l.beforeTax)}</td><td className="num"><b>{l.lineType === 'gift_consumer' ? '—' : fmt(l.realUnitCost)}</b></td></tr>)}
                </tbody></table>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>KM người bán chia vào giá: SL tăng, giá trị không đổi → giá vốn đơn vị giảm. Chi phí mua hàng và thưởng cuối kỳ phân bổ thêm ở màn "Phân bổ & giá vốn thực tế" (MH07).</div>
              </div>
            )}
          </div>

          <aside className="mh-side">
            <div className="row" style={{ marginBottom: 6, alignItems: 'center' }}><b style={{ fontSize: 14 }}>Trợ lý mua hàng</b><span className="muted" style={{ fontSize: 11, marginLeft: 'auto' }}>{analyzing ? 'đang kiểm tra…' : 'số liệu thật theo sổ'}</span></div>
            {prog && (
              <div className="mh-panel">
                <h4>Tiến độ giao hàng của đơn {prog.done ? <span className="badge badge-ok">Đã nhận đủ</span> : prog.buyDone ? <span className="badge badge-warn">Thiếu quà</span> : <span className="badge badge-warn">Còn {prog.remaining}</span>}</h4>
                <table className="mh-mini"><thead><tr><th>Mã</th><th className="num">Đặt</th><th className="num" title="Phiếu nhập đã duyệt">Đã nhận</th><th className="num" title="Phiếu nhập nháp / chờ duyệt">Chờ</th><th>Tình trạng</th></tr></thead><tbody>
                  {(recon ?? []).map((x) => <tr key={x.sku} className={x.state === 'ngoai_don' || x.state === 'thua' || x.state === 'doi_ma' ? 'mh-row-warn' : ''} title={x.receipts.map((r) => `${r.docNo || '(nháp)'} ${r.qty} ${r.unit}`).join(' · ')}>
                    <td className="mono">{x.sku}</td><td className="num">{x.ordered || ''}</td><td className="num">{x.received || ''}</td><td className="num">{x.pending || ''}</td>
                    <td style={{ fontSize: 11 }}>{x.state === 'ngoai_don' ? <span className="mh-bad">giao ngoài đơn</span> : x.state === 'thua' ? <span className="mh-bad">thừa {x.diff}</span> : x.state === 'doi_ma' ? <span className="mh-bad">đổi mã → {x.swappedTo.join(', ')}</span> : x.state === 'thieu' ? <span className="mh-warn">thiếu {-x.diff}</span> : 'đủ'}{x.priceDiffPct !== null && Math.abs(x.priceDiffPct) >= 0.01 ? <span className="mh-warn"> · giá {x.priceDiffPct > 0 ? '+' : ''}{Number(x.priceDiffPct).toLocaleString('vi-VN')}%</span> : null}</td></tr>)}
                  {/* Hàng tặng trên đơn: đặt / đã nhận (mọi phiếu nhập theo đơn) — thiếu quà thì đơn chưa "đã nhận đủ". */}
                  {prog.gifts.map((g) => <tr key={`qua-${g.sku}`} className={g.remaining > 0 ? 'mh-row-warn' : ''} title={`${g.name} — hàng tặng (${g.unit})`}>
                    <td className="mono">{g.sku} <span className="badge badge-ok" style={{ fontSize: 10, padding: '0 4px' }}>tặng</span></td><td className="num">{g.ordered || ''}</td><td className="num">{g.received || ''}</td><td className="num"></td>
                    <td style={{ fontSize: 11 }}>{g.remaining > 0 ? <span className="mh-warn">thiếu quà {g.remaining}</span> : g.received > g.ordered ? <span className="mh-bad">thừa {Math.round((g.received - g.ordered) * 100) / 100}</span> : 'đủ'}</td></tr>)}
                </tbody></table>
                {prog.receipts.length > 0 && <div className="muted" style={{ fontSize: 11 }}>Phiếu nhập: {prog.receipts.join(', ')} · <Link to={`/mua-hang/doi-chieu?ncc=${encodeURIComponent(v.partnerCode)}`} onClick={onClose}>đối chiếu chi tiết (MH21)</Link></div>}
                {!prog.done && v.status !== 'draft' && v.status !== 'cancelled' && onOpen && <button className="btn btn-sm btn-primary" style={{ marginTop: 6 }} onClick={() => onOpen(receiptFromOrder(v, data.docs, today(), { ...data.units, ...(a?.units ?? {}) }))}>Lập phiếu nhập kho từ đơn (chép phần còn lại)</button>}
                {!prog.done && v.status === 'draft' && <div className="muted" style={{ fontSize: 11 }}>Duyệt đơn rồi mới lập phiếu nhập từ đơn.</div>}
              </div>
            )}
            <div className="mh-panel">
              <h4>Kiểm tra {!a ? <span className="badge badge-gray">…</span> : checks.length ? <span className={`badge ${blocking.length ? 'badge-bad' : checks.some((c) => c.level === 'warn') ? 'badge-warn' : 'badge-info'}`}>{checks.length}</span> : <span className="badge badge-ok">ổn</span>}</h4>
              {a ? <CheckList checks={checks} onPick={(k) => { setSelKey(k); setTab('hang'); }} empty="Phiếu hợp lệ, không có cảnh báo" /> : (
                <ol className="mh-guide">
                  <li className={v.partnerCode ? 'done' : ''}>Chọn <b>nhà cung cấp</b> — {v.kind === 'payment' ? 'phần mềm gợi ý số nợ còn phải trả (trả hết / phần đến hạn / theo phiếu)' : isGoods ? 'phần mềm tự áp chiết khấu, hạn thanh toán, CKTT theo chính sách của NCC' : 'phiếu gắn vào công nợ của NCC'}</li>
                  <li className={v.branchCode ? 'done' : ''}>Chọn <b>chi nhánh</b> nhận hàng — để kiểm hạn mức công nợ</li>
                  {isGoods && <li>Gõ <b>mã hàng</b>, số lượng, đơn giá — tên, ĐVT, thuế suất tự điền; giá lệch, thiếu lô, vượt hạn mức sẽ hiện ở đây</li>}
                  <li><b>Ghi</b> để lưu nháp, <b>Duyệt</b> để ghi sổ (bút toán, công nợ, kho)</li>
                </ol>
              )}
            </div>
            {isGoods && !isGiftDoc && sel && sel.sku && (
              <div className="mh-panel">
                <h4>Giá mua · {sel.sku}</h4>
                {(() => {
                  // Mọi giá quy về CÙNG LOẠI GIÁ CỦA PHIẾU (gồm / chưa VAT) và cùng ĐVT của dòng — so trực tiếp được với ô đơn giá.
                  const fixed = fixedOf(sel);
                  const hist = a?.priceHistory[sel.sku] ?? [];
                  const basis = v.priceIncludesVat ? 'gồm VAT' : 'chưa VAT';
                  const us = unitsOf(sel.sku);
                  const histPrice = (h: (typeof hist)[number]) => { const p = toDocBasis(h.unitPrice, h.includesVat, sel.taxCode); return h.unit && us.length && h.unit.toLowerCase() !== sel.unit.toLowerCase() ? roundPrice((p / ratioOf(us, h.unit)) * ratioOf(us, sel.unit)) : p; };
                  const fp = fixed ? toDocBasis(fixed.price, fixed.row.priceIncludesVat, sel.taxCode) : 0;
                  return <>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>Mọi giá dưới đây: <b>{basis}</b>, theo {sel.unit || 'ĐVT của dòng'} (đúng loại giá của phiếu).</div>
                    <div className="mh-kv" style={{ fontSize: 12.5, marginBottom: 4 }}>
                      <span>Đơn giá phiếu này</span><span><b>{fmt(sel.price)}</b></span>
                      {fixed && <><span>Giá đã thoả thuận {fixed.row.partnerCode ? 'với NCC' : '(giá mua chung)'}</span><span><b>{fmt(fp)}</b>{sel.price && fp ? <small className={Math.abs(sel.price - fp) / fp * 100 > (a?.priceWarnPct ?? 2) ? 'mh-bad' : 'mh-ok'}> {sel.price === fp ? '✓' : `${sel.price > fp ? '+' : ''}${(((sel.price - fp) / fp) * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`}</small> : null}</span></>}
                    </div>
                    {fixed && (fixed.row.priceIncludesVat !== v.priceIncludesVat || fixed.row.unit.toLowerCase() !== sel.unit.toLowerCase()) && <div className="muted" style={{ fontSize: 11 }}>Giá khai gốc: {fmt(Number(fixed.row.price))} / {fixed.row.unit} ({fixed.row.priceIncludesVat ? 'gồm' : 'chưa'} VAT) — đã quy đổi.</div>}
                    <table className="mh-mini"><thead><tr><th>Ngày</th><th>Phiếu</th><th>NCC</th><th className="num">Đơn giá ({basis})</th><th className="num">CK%</th></tr></thead><tbody>
                      {hist.map((h, i) => <tr key={i}><td>{dmy(h.date)}</td><td className="mono">{h.docNo}</td><td>{names.partnerName(h.partnerCode).slice(0, 18)}</td><td className="num">{fmt(histPrice(h))}</td><td className="num">{h.discountPct ?? ''}</td></tr>)}
                      {!hist.length && <tr><td colSpan={5} className="muted">Chưa có lần nhập nào trước ngày này</td></tr>}
                    </tbody></table>
                    <div className="row" style={{ justifyContent: 'space-between', marginTop: 2 }}>
                      <span className="muted" style={{ fontSize: 11 }}>5 lần nhập gần nhất (mọi nguồn), đã quy về {basis}</span>
                      {!readOnly && hist[0] && sel.lineType === 'buy' && <button className="btn btn-xs" onClick={() => applyLastPrice(sel.lineKey, sel.sku)}>Dùng giá lần gần nhất</button>}
                    </div>
                  </>;
                })()}
              </div>
            )}
            {(v.kind === 'receipt' || v.kind === 'order') && <KhuyenMaiPanel rows={board} onAction={promoAction} onToggle={readOnly ? undefined : togglePromo} onOpen={() => setPromoOpen(true)} readOnly={readOnly} />}
            {(a?.credit.length ?? 0) > 0 && (
              <div className="mh-panel">
                <h4>Công nợ & hạn mức</h4>
                {a!.credit.map((s, i) => <UsageBar key={i} s={s} />)}
              </div>
            )}
            <div className="mh-panel">
              <h4>Tổng tiền</h4>
              <div className="mh-kv">
                {isGoods && !isGiftDoc ? <>
                  <span>Tiền hàng</span><span>{vnd(calc.gross)}</span>
                  <span>Chiết khấu dòng</span><span>− {vnd(calc.lineDiscount)}</span>
                  <span>Chiết khấu trên đơn</span><span>− {vnd(calc.orderDiscount)}</span>
                  <span>Tiền trước thuế</span><span>{vnd(calc.beforeTax)}</span>
                  {(() => {
                    const by = new Map<string, number>();
                    for (const l of calc.lines) if (l.tax) by.set(l.taxCode, (by.get(l.taxCode) ?? 0) + l.tax);
                    return by.size > 1 ? [...by].map(([k, t]) => <Fragment key={k}><span>Thuế GTGT {TAX_LABEL[k] ?? k}</span><span>{vnd(t)}</span></Fragment>)
                      : <><span>Thuế GTGT{by.size ? ` ${TAX_LABEL[[...by.keys()][0]!] ?? ''}` : ''}</span><span>{vnd(calc.tax)}</span></>;
                  })()}
                  {calc.exchange && <><span>Trả đi / nhận về</span><span>{vnd(calc.exchange.outBeforeTax + calc.exchange.outTax)} / {vnd(calc.exchange.inBeforeTax + calc.exchange.inTax)}</span></>}
                  <span className="total">{v.kind === 'exchange' ? 'Chênh lệch' : v.kind === 'return' ? 'Giảm công nợ' : 'Phải trả NCC'}</span><span className="total">{vnd(calc.payable)}</span>
                  {calc.dueDate && <><span>Hạn thanh toán</span><span>{dmy(calc.dueDate)}</span></>}
                  {calc.ckttExpected ? <><span>CKTT nếu trả đúng hạn</span><span className="mh-ok">{vnd(calc.ckttExpected)}</span></> : null}
                  {(a?.prepayment ?? 0) > 0 && <><span>Đã ứng trước</span><span>− {vnd(a!.prepayment)}</span></>}
                </> : isGiftDoc ? <><span className="total">Giá trị quà</span><span className="total">{vnd(v.lines.reduce((s, l) => s + l.qty * l.price, 0))}</span></>
                  : (v.kind === 'cost' || v.kind === 'rebate') ? <><span>Trước thuế</span><span>{vnd(v.amount)}</span><span>Thuế GTGT</span><span>{vnd(amountTax(v))}</span><span className="total">{v.kind === 'cost' ? 'Phải trả đơn vị dịch vụ' : 'Giảm công nợ NCC'}</span><span className="total">{vnd((v.amount ?? 0) + amountTax(v))}</span></>
                  : <><span className="total">Số tiền</span><span className="total">{vnd((v.amount ?? 0) + (v.ckttAmount ?? 0))}</span>{v.ckttAmount ? <><span>trong đó CKTT</span><span>{vnd(v.ckttAmount)}</span></> : null}</>}
              </div>
            </div>
          </aside>
        </div>
        <div className="mh-sheet-foot">
          <span className="grow">{err ? <span className="mh-bad">{err}</span> : problems.length && !readOnly ? <span className="muted">Chưa ghi được: {problems.join(' · ')}</span> : blocking.length && !readOnly ? <span className="mh-bad">Còn {blocking.length} cảnh báo chặn duyệt{creditOnly ? ' — cần người có quyền bấm Duyệt ngoại lệ' : ''}</span> : null}</span>
          {/* In bản đã ghi (máy chủ trả số liệu) — có ở cả chế độ xem; phiếu mới phải Ghi trước. */}
          {!v.id.startsWith('new-') && <span data-view-ok><PrintButton screen="MH03" memoryKey={`MH03:${(stored ?? v).kind}`} templates={mauInCua(stored ?? v)} title={dirty ? 'In theo nội dung đã ghi (sửa xong bấm Ghi rồi mới in)' : 'In phiếu'}
            getDocs={() => layPhieuIn(v.id, { names, docs: data.docs }).then((p) => [p])} /></span>}
          {!readOnly && <button className="btn" disabled={busy || problems.length > 0} onClick={() => void save()}>Ghi</button>}
          {viewing && !frozen && <button className="btn btn-primary" onClick={() => setViewing(false)}>Sửa</button>}
          {!frozen && v.status === 'draft' && <button className="btn" disabled={busy || problems.length > 0} onClick={() => void act((id) => purchaseApi.submit(id))}>Gửi duyệt</button>}
          {!frozen && <button className={`btn ${viewing ? '' : 'btn-primary'}`} disabled={busy || problems.length > 0 || blocking.length > 0 || !a} title={blocking.map((c) => c.text).join('\n')} onClick={() => void act((id) => purchaseApi.approve(id))}>Duyệt (ghi sổ)</button>}
          {!frozen && creditOnly && <button className="btn btn-danger" disabled={busy || problems.length > 0} onClick={() => {
            const reason = window.prompt(`Duyệt ngoại lệ (${blocking.map((c) => (c.code === 'po_none' ? 'nhập ngoài đơn' : c.code === 'code_swap' ? 'đổi mã so với đơn' : 'vượt hạn mức')).filter((x, i, a) => a.indexOf(x) === i).join(', ')}) — nhập lý do (ghi vào nhật ký, người duyệt chịu trách nhiệm):`);
            if (reason) void act((id) => purchaseApi.override(id, reason));
          }}>Duyệt ngoại lệ</button>}
          {v.status === 'approved' && v.outsideOrder?.by && !v.outsideOrder.reviewedBy && <button className="btn" disabled={busy} title="Kế toán đã kiểm phiếu nhập ngoài đơn này (đối chiếu biên bản giao hàng, hoá đơn…) — bỏ khỏi việc cần làm" onClick={() => {
            const note = window.prompt('Rà soát phiếu nhập ngoài đơn — ghi chú (tuỳ chọn):', '');
            if (note !== null) void act((id) => purchaseApi.reviewOutside(id, note), false);
          }}>Đã rà soát nhập ngoài đơn</button>}
          {v.status === 'approved' && <button className="btn" disabled={busy} onClick={() => { if (window.confirm('Bỏ duyệt: các chứng từ kế toán của phiếu này sẽ bị huỷ (đảo bút toán bằng số âm), phiếu về nháp. Tiếp tục?')) void act((id) => purchaseApi.unapprove(id), false); }}>Bỏ duyệt</button>}
          {v.status !== 'cancelled' && !v.id.startsWith('new-') && v.status !== 'approved' && <button className="btn" disabled={busy} onClick={() => { if (window.confirm('Huỷ phiếu này?')) void act((id) => purchaseApi.cancel(id), false); }}>Huỷ phiếu</button>}
          <button className="btn" onClick={onClose}>Thoát</button>
        </div>
      </div>
    </div>
    </DockScope>
  );
}

/**
 * Tài khoản tiền trả NCC: chọn ngân hàng / quỹ cụ thể (112* chuyển khoản, 111* tiền mặt). Trống = tài khoản mặc định theo cài đặt mua hàng
 * (MH12) / hình thức thanh toán — bút toán ở tab Hạch toán đổi theo ngay.
 */
function TaiKhoanTien({ method, value, onChange }: { method: 'bank' | 'cash'; value: string; onChange: (v: string) => void }) {
  const acc = useAccountList();
  const prefix = method === 'cash' ? '111' : '112';
  const items = (acc.data ?? []).filter((a) => a.isPosting && a.isActive !== false && a.code.startsWith(prefix)).map((a) => ({ code: a.code, name: a.name }));
  return (
    <div className="field">
      <label title="Trống = tài khoản mặc định theo cài đặt">{method === 'cash' ? 'Quỹ tiền mặt' : 'Tài khoản ngân hàng'}</label>
      <ListPicker items={items} value={value} onChange={onChange} placeholder="Mặc định theo cài đặt — gõ để chọn khác" emptyText={`Không có tài khoản ${prefix}* khớp`} />
    </div>
  );
}
