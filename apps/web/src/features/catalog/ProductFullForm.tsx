/**
 * Form trọn một mặt hàng (DM10) — khai ở phần mềm kế toán làm chuẩn, hệ thống bán hàng kéo về để hiển thị / bán.
 * Gộp các màn lẻ của hệ thống bán hàng vào một chỗ, bốn thẻ:
 *   Thông tin        mã hàng (sinh theo 3 cấp nhóm + số thứ tự), tên, nhóm / ngành / nhãn, barcode, xuất xứ, khối lượng,
 *                    ảnh, mô tả, ghi chú
 *   ĐVT & giá bán    đơn vị tính + tỉ lệ quy đổi (tỉ lệ 1 = đơn vị nhỏ nhất, chọn đơn vị bán chính) và giá theo từng đơn vị ở
 *                    bảng giá công ty + các bảng giá chi nhánh (thêm cột bảng giá cần khai; nút điền theo tỉ lệ)
 *   Trạng thái       hàng chính (chỉ bán theo giá công ty), sữa < 24 tháng, không được bán, BIT1, đang theo dõi
 *   Kế toán          thuế suất GTGT (tự đặt mã VAT ra / vào chuẩn; mã chi tiết gập lại), thuế TTĐB, nhóm hạch toán.
 *                    Không chịu thuế (KCT) là một lựa chọn thuế suất — máy chủ suy cờ KCT từ mã VAT ra.
 * Lưu một lần: PUT /api/v1/catalog/products/:sku (đơn vị tính thay cả bộ; ô giá để trống = chưa khai giá).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { ErrorBox, Field, Loading, Modal, NumInput, useViewAgain } from '@/components/ui';
import { ItemPicker, ListPicker, PartnerPicker } from '@/components/pickers';
import { GroupTree } from '../posting/ProductAccountsPage';
import { HelpDrawer } from '@/components/HelpDrawer';
// [2026-11-05 02:20 PM Nguyễn Văn Thủy] PHASE-026 — S026-23: đổi mã, gộp mã, lịch sử (đóng góp)
import { LichSuMatHang } from './DoiMaGopMa';
// [2026-11-07 05:50 PM Nguyễn Văn Thủy] PHASE-026 — mã số cha – con GĐ 1: ô Biến thể, Loại hàng ở thẻ Thông tin, nút Thêm sản phẩm con (đóng góp)
// [2026-11-09 10:00 AM Nguyễn Văn Thủy] PHASE-026 — bỏ tạo mã có đuôi (chọn đuôi, ChonDuoiMa): mọi biến thể là sản phẩm con; ô Biến thể sửa được (đóng góp)
// [2026-11-09 07:00 PM Nguyễn Văn Thủy] PHASE-026 — mã cha không có ô Biến thể; thẻ Thông tin gọn: giải thích vào rê chuột, ẩn ngành / nhãn khi đã theo nhóm (đóng góp)
import { TrungTen, useSameName } from './TenTrung';
import { PRODUCT_TABS } from '../../phan-he/product-tabs';
import { useEnabledModules } from '../../layout/useAppMenu';
import { DvtQuyDoi, GiaBan } from './DvtGiaBan';
import { skuInfo } from '@bizcity/mua-hang-domain';
import { flashSaved, savedNote, useCatalogWhy, useWarnAck } from '@/components/WhyPanel';
import type { CatalogWarnAck } from '@ketoan/contracts';

type ClassKind = 'brand' | 'industry' | 'group' | 'type';
export interface ItemClassLite { code: string; name: string; parentCode: string | null; isActive: boolean; skuCode?: string }
interface PostingGroup { code: string; name: string }
interface TaxCode { code: string; name: string; direction: string; isActive: boolean }
interface PriceList { code: string; name: string; isCompany: boolean; isActive: boolean; branchCodes: string[] }
interface Unit { unit: string; ratio: number; isDefault: boolean; isPurchaseDefault?: boolean; weightKg: number | null; note: string }
interface Price { priceListCode: string; unit: string; price: number | null; isDefaultUnit: boolean; note: string }
interface FullProduct {
  sku: string; name: string; unit: string; note: string;
  groupCode: string | null; industryCode: string | null; brandCode: string | null; typeCode: string | null;
  postingGroupCode: string | null; taxOutCode: string | null; taxInCode: string | null; exciseRate: number | null; isActive: boolean;
  barcode: string; imageUrl: string; description: string; weightKg: number | null; origin: string;
  isMain: boolean; isUnder24m: boolean; noSale: boolean; exportAdjust: boolean; isKct: boolean; trackIdentifier: boolean;
  /** Mã hàng cha (họ mã 1 cấp); null = không có. */
  parentSku?: string | null;
  /** Biến thể: phần mềm tự suy theo mã (0111), không sửa trên form. */
  variantCode?: string;
  /** Gửi lên thuế; Biến thể Nội bộ luôn tắt. [2026-11-09 07:30 PM Nguyễn Văn Thủy] PHASE-026 — ô Gửi lên thuế (0093) (đóng góp) */
  sendToTax?: boolean;
  /** Đã có nhập xuất: khoá ô Gửi lên thuế. [2026-11-10 09:00 AM Nguyễn Văn Thủy] PHASE-026 — khoá ô Gửi lên thuế khi mặt hàng đã có nhập xuất (đóng góp) */
  hasMovements?: boolean;
  units: Unit[]; prices: Price[];
  /** Nháp (PHASE-024): khai báo còn lỗi chặn, chưa dùng được trên chứng từ. */
  isDraft?: boolean; draftCodes?: string[];
}
interface SkuPreview { sku: string; prefix: string; segments: { level: number; code: string; name: string; skuCode: string; source?: 'declared' | 'inferred' | 'new' }[]; industryCode: string; brandCode: string }

const EMPTY: FullProduct = {
  sku: '', name: '', unit: '', note: '', groupCode: null, industryCode: null, brandCode: null, typeCode: null,
  postingGroupCode: null, taxOutCode: null, taxInCode: null, exciseRate: null, isActive: true,
  barcode: '', imageUrl: '', description: '', weightKg: null, origin: '',
  isMain: false, isUnder24m: false, noSale: false, exportAdjust: false, isKct: false, trackIdentifier: false,
  units: [{ unit: '', ratio: 1, isDefault: true, weightKg: null, note: '' }], prices: [],
};

/** Thuế suất thường dùng → cặp mã VAT ra / vào chuẩn. Mã khác (R08A, V051…) chọn ở "Mã thuế chi tiết". */
const VAT_RATES = [
  { key: 'kct', label: 'KCT', out: 'KCT', in: 'V13K' },
  { key: '0', label: '0%', out: 'R00', in: 'V00' },
  { key: '5', label: '5%', out: 'R05', in: 'V05' },
  { key: '8', label: '8%', out: 'R08', in: 'V08' },
  { key: '10', label: '10%', out: 'R10', in: 'V10' },
];

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '' : n.toLocaleString('vi-VN'));
const parseNum = (s: string): number | null => {
  const t = s.replace(/\./g, '').replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** startTab / startEditing: mở thẳng một thẻ ở chế độ sửa (ví dụ "+ĐVT" trên phiếu mua mở thẻ ĐVT). */
export function ProductFullForm({ sku, initial, classes, groupPath, onClose, startTab, startEditing, onSaved }: {
  sku: string | null; // null = thêm mới
  initial?: Partial<FullProduct>;
  classes: Record<ClassKind, ItemClassLite[]>;
  groupPath: (c: string | null) => string;
  onClose: () => void;
  startTab?: string;
  startEditing?: boolean;
  /** Thêm mới xong: báo mã vừa ghi (ô chọn mặt hàng trên chứng từ tự điền). */
  onSaved?: (sku: string) => void;
}) {
  const qc = useQueryClient();
  const isNew = sku === null;
  const [tab, setTab] = useState<string>(startTab ?? 'info');
  // [2026-11-12 Nguyễn Văn Thủy] thêm mới: chọn Mã mới hay Mã biến thể (theo mã cha) (đóng góp)
  const [kind, setKind] = useState<'' | 'new' | 'variant'>(isNew ? '' : 'new');
  const [parentErr, setParentErr] = useState('');
  // [2026-11-12 Nguyễn Văn Thủy] thêm mới: giá mua theo NCC khai trước khi ghi, ghi cùng mặt hàng (đóng góp)
  const [nccRows, setNccRows] = useState<NccTam[]>([]);
  const enabled = useEnabledModules();
  const extraTabs = PRODUCT_TABS.filter((t) => !enabled || enabled.has(t.module));
  const buyTab = extraTabs.find((t) => t.key === 'gia-mua');
  const [v, setV] = useState<FullProduct>({ ...EMPTY, ...initial });
  const [shownLists, setShownLists] = useState<string[]>([]);
  const [skuHint, setSkuHint] = useState<SkuPreview | null>(null);
  const [skuErr, setSkuErr] = useState('');
  // Mã tự sinh theo nhóm (auto) hay người dùng gõ tay (không ghi đè mã gõ tay khi đổi nhóm).
  const [skuAuto, setSkuAuto] = useState(!initial?.sku);
  const [help, setHelp] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [imgBad, setImgBad] = useState(false);
  const [taxDetail, setTaxDetail] = useState(false);
  const set = (p: Partial<FullProduct>) => setV((x) => ({ ...x, ...p }));

  const loaded = useQuery({ queryKey: ['catalog-product', sku], queryFn: () => api.get<FullProduct>(`/api/v1/catalog/products/${encodeURIComponent(sku!)}`), enabled: !isNew });
  const lists = useQuery({ queryKey: ['price-lists'], queryFn: () => api.get<PriceList[]>('/api/v1/catalog/price-lists'), staleTime: 60_000 }).data ?? [];
  const taxes = useQuery({ queryKey: ['tax-codes'], queryFn: () => api.get<TaxCode[]>('/api/v1/tax-codes'), staleTime: 60_000 }).data ?? [];
  const pgroups = useQuery({ queryKey: ['groups'], queryFn: () => api.get<PostingGroup[]>('/api/v1/posting/groups'), staleTime: 60_000 }).data ?? [];

  // Mã mới chỉ gồm số (bỏ chữ cuối mã). Mã cũ có chữ vẫn sửa được, ô mã khoá.
  const skuLetters = /[^0-9A-Z]/.test(v.sku); // [2026-11-12 Nguyễn Văn Thủy] mã gồm chữ số và chữ in hoa, không dấu cách / ký tự lạ (đóng góp)
  // Tên trùng: chỉ kiểm khi thêm mới / đổi tên — dữ liệu cũ đã trùng vẫn sửa được các ô khác (máy chủ kiểm y hệt).
  const norm = (s?: string) => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const sameName = useSameName(isNew || norm(v.name) !== norm(loaded.data?.name) ? v.name : '', isNew ? '' : v.sku);

  useEffect(() => {
    if (!loaded.data) return;
    const d = loaded.data;
    setV({ ...d, units: d.units.length ? d.units : [{ unit: d.unit || '', ratio: 1, isDefault: true, weightKg: null, note: '' }] });
  }, [loaded.data]);

  // Mã con tạo mới: kéo sẵn đa ĐVT của mã cha (Thùng, Lốc…) khi mã con chưa khai thêm ĐVT nào — máy chủ cũng kế thừa khi lưu.
  const parentData = useQuery({ queryKey: ['catalog-product', v.parentSku], enabled: isNew && Boolean(v.parentSku), staleTime: 60_000,
    queryFn: () => api.get<FullProduct>(`/api/v1/catalog/products/${encodeURIComponent(v.parentSku!)}`) });
  useEffect(() => {
    const pu = parentData.data?.units;
    if (!isNew || !pu?.length || parentData.data?.sku !== v.parentSku) return;
    setV((x) => {
      const mine = x.units.filter((u) => u.unit.trim());
      if (mine.length > 1) return x;
      const base = mine[0], pBase = pu.find((u) => Number(u.ratio) === 1);
      const rest = pu.filter((u) => Number(u.ratio) !== 1 && (!base || u.unit.toLowerCase() !== base.unit.trim().toLowerCase()));
      const b0 = base ? { ...base, ratio: 1, isDefault: pBase?.isDefault ?? base.isDefault, isPurchaseDefault: pBase?.isPurchaseDefault ?? base.isPurchaseDefault } : pBase;
      return { ...x, units: [...(b0 ? [b0] : []), ...rest.map((u) => ({ ...u }))] };
    });
  }, [isNew, parentData.data, v.parentSku]);
  // Mã biến thể: nhóm hàng, thuế theo mã cha (không đổi được); mã mặc định = mã cha + Z, sửa chữ đầu / cuối tuỳ ý.
  useEffect(() => {
    const p = parentData.data;
    if (!isNew || kind !== 'variant' || !p || p.sku !== v.parentSku) return;
    if (p.parentSku || parentFromSku(p.sku)) { setParentErr(`${p.sku} là mã biến thể${p.parentSku ? ` của ${p.parentSku}` : ''} — chọn mã chính làm mã cha.`); return; }
    setParentErr('');
    setV((x) => ({ ...x, groupCode: p.groupCode, industryCode: p.industryCode, brandCode: p.brandCode, taxOutCode: p.taxOutCode, taxInCode: p.taxInCode, origin: x.origin || p.origin,
      sku: parentFromSku(x.sku) === p.sku ? x.sku : `${p.sku}Z`, name: x.name.trim() ? x.name : `${p.name} Z` }));
    setSkuAuto(false);
  }, [parentData.data, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  // Tên mã biến thể = tên mã cha + chữ thêm vào mã; sửa tay rồi thì thôi không đổi theo.
  const tenBienThe = (code: string) => (parentData.data ? `${parentData.data.name} ${code.replace(parentData.data.sku, '')}`.trim() : '');
  const lockedGroup = isNew ? kind === 'variant' : Boolean(v.parentSku);
  const skuBad = !isNew || !v.sku ? ''
    : kind === 'variant' ? (v.parentSku && v.sku === v.parentSku ? 'Thêm chữ ở đầu hoặc cuối mã cha.' : '')
    : /[A-Z]$/.test(v.sku) || (/^[A-Z]/.test(v.sku) && !/^[A-Z][0-9]{8}$/.test(v.sku)) ? 'Mã mới không được có chữ ở đầu hoặc cuối. Muốn tạo mã biến thể: bấm Đổi → Mã biến thể.' : '';

  // Cột giá hiện sẵn: bảng giá công ty + bảng giá đã có giá cho mặt hàng này.
  const company = lists.find((l) => l.isCompany);
  useEffect(() => {
    // Lấy theo dữ liệu vừa tải (v chưa kịp cập nhật trong cùng lượt vẽ).
    const has = new Set([...(loaded.data?.prices ?? []), ...v.prices].map((p) => p.priceListCode));
    setShownLists((cur) => {
      const want = [...(company ? [company.code] : []), ...lists.filter((l) => !l.isCompany && has.has(l.code)).map((l) => l.code)];
      return [...new Set([...want, ...cur])];
    });
  }, [lists, company, loaded.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const priceOf = (list: string, unit: string) => v.prices.find((p) => p.priceListCode === list && p.unit === unit);
  const setPrice = (list: string, unit: string, price: number | null) => setV((x) => {
    const rest = x.prices.filter((p) => !(p.priceListCode === list && p.unit === unit));
    const old = priceOf(list, unit);
    return { ...x, prices: [...rest, { priceListCode: list, unit, price, isDefaultUnit: old?.isDefaultUnit ?? false, note: old?.note ?? '' }] };
  });
  const setUnit = (i: number, p: Partial<Unit>) => setV((x) => {
    const units = x.units.map((u, j) => (j === i ? { ...u, ...p } : { ...u, ...(p.isDefault ? { isDefault: false } : {}), ...(p.isPurchaseDefault ? { isPurchaseDefault: false } : {}) }));
    // Đổi tên đơn vị: dời giá theo tên mới.
    const prices = p.unit !== undefined ? x.prices.map((pr) => (pr.unit === x.units[i]!.unit ? { ...pr, unit: p.unit! } : pr)) : x.prices;
    return { ...x, units, prices };
  });

  /**
   * Chọn nhóm hàng (cây ngành → nhãn → nhóm, quy tắc mã hàng) là đủ: ngành, nhãn tự lấy theo cây (mã ngành = mã nhóm
   * cấp 1, mã nhãn = mã nhóm cấp 2); mặt hàng mới thì mã hàng tự sinh (ngành + nhãn + nhóm + số thứ tự). Mã SKU của nhóm
   * chưa khai thì máy chủ tự suy từ mã đang có / tự cấp số kế tiếp.
   */
  const fromGroup = (r: Pick<SkuPreview, 'industryCode' | 'brandCode'>) => ({
    ...(classes.industry.some((c) => c.code === r.industryCode) ? { industryCode: r.industryCode } : {}),
    ...(classes.brand.some((c) => c.code === r.brandCode) ? { brandCode: r.brandCode } : {}),
  });
  /** Mã thường (9 ký tự) của một mã — bỏ chữ đuôi nếu có. */
  /**
   * Sinh mã theo nhóm. force = bấm "Sinh mã" (luôn lấy mã mới); không force (đổi nhóm) thì chỉ thay khi mã đang là mã tự sinh /
   * còn trống — mã gõ tay giữ nguyên. Lỗi (chọn nhóm chưa tới cấp 3…) thì xoá mã tự sinh cũ và ngành / nhãn đã tự điền theo
   * nhóm trước, không để lại số cũ gây nhầm.
   */
  const genSku = async (groupCode = v.groupCode, force = false) => {
    setSkuErr('');
    const prev = skuHint;
    setSkuHint(null);
    const clearOld = () => set({ ...((skuAuto || force) && isNew ? { sku: '' } : {}), ...(prev && v.industryCode === prev.industryCode ? { industryCode: null } : {}), ...(prev && v.brandCode === prev.brandCode ? { brandCode: null } : {}) });
    if (!groupCode) { clearOld(); return setSkuErr('Chọn nhóm hàng (tới nhóm sản phẩm — cấp 3) trước'); }
    try {
      const r = await api.get<SkuPreview>('/api/v1/catalog/next-sku', { groupCode });
      setSkuHint(r);
      const take = isNew && (force || skuAuto || !v.sku.trim());
      set({ ...(take ? { sku: r.sku } : {}), ...fromGroup(r) });
      if (take) setSkuAuto(true);
    } catch (e) { setSkuErr(errorText(e)); clearOld(); }
  };
  const pickGroup = (c: string) => { set({ groupCode: c || null }); void genSku(c || null); };
  // Danh sách nhóm: chỉ nhóm sản phẩm (cấp 3 trở xuống) — không chọn nhầm ngành / nhãn (cấp 1, 2).
  const depth = useMemo(() => {
    const by = new Map(classes.group.map((c) => [c.code, c]));
    const d = new Map<string, number>();
    const of = (code: string, seen = new Set<string>()): number => {
      if (d.has(code)) return d.get(code)!;
      const c = by.get(code);
      if (!c || seen.has(code)) return 0;
      seen.add(code);
      const root = !c.parentCode;
      const n = root ? (/^nhóm hàng$/i.test(c.name.trim()) ? 0 : 1) : of(c.parentCode!, seen) + 1;
      d.set(code, n);
      return n;
    };
    classes.group.forEach((c) => of(c.code));
    return d;
  }, [classes.group]);

  const viewAgain = useViewAgain();
  // Cổng danh mục (PHASE-024 S024-28): còn lỗi chặn → lưu NHÁP (chưa dùng được trên chứng từ); cảnh báo mềm → ghi lý do.
  const baseUnit = v.units.find((u) => Number(u.ratio) === 1 && u.unit.trim())?.unit.trim() ?? v.unit;
  const why = useCatalogWhy('/api/v1/products/validate', { sku: v.sku.trim(), unit: baseUnit || null, postingGroupCode: v.postingGroupCode || null }, Boolean(v.sku.trim()));
  const ack = useWarnAck(why.findings);
  const blockCount = why.findings.filter((f) => f.level === 'block').length;
  const save = useMutation({
    mutationFn: (warnAck?: CatalogWarnAck) => {
      const units = v.units.filter((u) => u.unit.trim()).map((u) => ({ unit: u.unit.trim(), ratio: Number(u.ratio), isDefault: u.isDefault, isPurchaseDefault: Boolean(u.isPurchaseDefault), weightKg: u.weightKg, note: u.note }));
      const unitNames = new Set(units.map((u) => u.unit));
      const prices = v.prices.filter((p) => unitNames.has(p.unit)).map((p) => ({ priceListCode: p.priceListCode, unit: p.unit, price: p.price, isDefaultUnit: p.isDefaultUnit, note: p.note }));
      const { sku: _s, unit: _u, units: _us, prices: _ps, variantCode: _vc, sendToTax: _st, ...rest } = v;
      // [2026-11-12 Nguyễn Văn Thủy] bỏ nút Đổi mã / Gộp mã: sửa thẳng ô Mã hàng, lưu thì đổi mã ngầm (giữ định danh, lịch sử) rồi lưu (đóng góp)
      const newSku = v.sku.trim();
      return (async () => {
        if (!isNew && sku && newSku !== sku) await api.post('/api/v1/items/rename-code', { sku, newSku, reason: 'Sửa mã trên form mặt hàng' });
        const saved = await api.put<FullProduct>(`/api/v1/catalog/products/${encodeURIComponent(newSku)}${isNew ? '?new=1' : ''}`, { ...rest, units, prices, warnAck });
        const ncc = isNew ? nccRows.filter((r) => r.partnerCode && r.unit) : [];
        if (ncc.length) await api.post('/api/v1/purchase/supplier-products', { rows: ncc.map((r) => ({ partnerCode: r.partnerCode, sku: newSku, unit: r.unit, price: r.price, priceIncludesVat: false, validFrom: r.validFrom || undefined, nccSku: r.nccSku, nccName: '', note: '', isActive: true, warnPct: 2, isDefaultUnit: false })) });
        return saved;
      })();
    },
    onSuccess: () => {
      flashSaved(savedNote(why.findings, { draft: blockCount > 0 }));
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['catalog-product'] });
      void qc.invalidateQueries({ queryKey: ['price-lists'] });
      void qc.invalidateQueries({ queryKey: ['item-classes'] });
      void qc.invalidateQueries({ queryKey: ['unit-names'] });
      void qc.invalidateQueries({ queryKey: ['inventory-items'] });
      if (isNew) onSaved?.(v.sku.trim());
      if (isNew || v.sku.trim() !== sku) onClose(); else viewAgain[1]();
    },
  });

  const vatRate = VAT_RATES.find((r) => r.out === v.taxOutCode);
  // [2026-11-12 Nguyễn Văn Thủy] Thêm mặt hàng theo từng bước, kiểm bắt buộc ở mỗi bước (đóng góp)
  const STEPS = [
    { k: 'info', t: 'Thông tin chung' },
    { k: 'units', t: 'Đơn vị tính' },
    ...(buyTab ? [{ k: 'mua', t: 'Khai báo giá mua' }] : []),
    { k: 'status', t: 'Bán hàng & giá' },
    { k: 'review', t: 'Xem lại & ghi' },
  ];
  const stepIdx = Math.max(0, STEPS.findIndex((x) => x.k === tab));
  const stepErr = (k: string): string => {
    if (k === 'info' && isNew && !kind) return 'Chọn tạo Mã mới hay Mã biến thể.';
    if (k === 'info' && kind === 'variant' && (!v.parentSku || parentErr)) return parentErr || 'Chọn mã cha.';
    if (k === 'info' && skuBad) return skuBad;
    if (k === 'info') return !v.groupCode ? 'Chọn nhóm hàng (tới nhóm cấp 3).' : kind !== 'variant' && (depth.get(v.groupCode) ?? 0) < 3 ? 'Nhóm hàng phải chọn tới cấp 3 (nhóm sản phẩm).' : !v.sku.trim() ? 'Chưa có mã hàng (chọn nhóm là tự sinh).' : skuLetters ? 'Mã hàng chỉ gồm chữ số và chữ cái, không dấu cách.'
      : !v.name.trim() ? 'Chưa nhập tên hàng.' : sameName ? `Tên hàng trùng với mã ${sameName.sku}.` : !v.taxOutCode ? 'Chọn thuế suất GTGT.' : '';
    if (k === 'units') return !baseUnit ? 'Chưa khai đơn vị tính nhỏ nhất (vd Hộp, Lon, Cái).' : '';
    if (k === 'mua') return nccRows.some((r) => !r.partnerCode) ? 'Còn dòng chưa chọn nhà cung cấp (chọn hoặc bỏ dòng đó).' : '';
    return '';
  };
  const next = () => {
    const e = stepErr(tab); setErrMsg(e);
    if (!e) setTab(STEPS[stepIdx + 1]!.k);
  };
  const goStep = (i: number) => {
    if (i > stepIdx) return; // chỉ quay lại bước trước; đi tới bằng Tiếp tục
    setErrMsg(''); setTab(STEPS[i]!.k);
  };
  const companyList = lists.find((l) => l.isCompany);
  const mainUnit = v.units.find((u) => u.isDefault)?.unit ?? baseUnit;
  const companyPrice = companyList ? v.prices.find((pr) => pr.priceListCode === companyList.code && pr.unit === mainUnit)?.price : undefined;
  const pick = (k: ClassKind) => classes[k].filter((c) => (c.isActive && (k !== 'group' || (depth.get(c.code) ?? 0) >= 3)) || c.code === v[`${k}Code` as const]).map((c) => ({ code: c.code, name: k === 'group' ? groupPath(c.code) : c.name }));
  const tabBtn = (k: typeof tab, label: string) => <button key={k} role="tab" className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{label}</button>;
  const flag = (k: 'isMain' | 'isUnder24m' | 'noSale' | 'exportAdjust' | 'isActive', label: string, hint: string) => (
    <label className="checkbox" style={{ alignItems: 'flex-start', display: 'flex', gap: 8, padding: '6px 0' }}>
      <input type="checkbox" checked={Boolean(v[k])} onChange={(e) => set({ [k]: e.target.checked } as Partial<FullProduct>)} />
      <span><b>{label}</b><br /><span className="muted" style={{ fontSize: 12 }}>{hint}</span></span>
    </label>
  );

  if (!isNew && loaded.isLoading) return <Modal key="dang-tai" wide title="Mặt hàng" onClose={onClose} footer={null}><Loading /></Modal>;

  return (<>
    <Modal key="form" viewAgain={viewAgain} viewFirst={!isNew && !startEditing} wide title={isNew ? 'Thêm mặt hàng' : `Mặt hàng ${v.sku} — ${v.name}`} helpKey="mat-hang" onClose={onClose}
      footer={isNew ? (
        <>
          {errMsg ? <span className="neg" style={{ marginRight: 'auto', fontSize: 13, fontWeight: 600 }}>{errMsg}</span>
            : <span className="muted" style={{ marginRight: 'auto', fontSize: 12.5 }}>Bước {stepIdx + 1} / {STEPS.length} · {STEPS[stepIdx]!.t}</span>}
          {stepIdx > 0 && <button className="btn" onClick={() => { setErrMsg(''); setTab(STEPS[stepIdx - 1]!.k); }}>‹ Quay lại</button>}
          {tab !== 'review' && <button className="btn btn-primary" onClick={next}>Tiếp tục ›</button>}
          {tab === 'review' && <button className="btn btn-primary" disabled={save.isPending} onClick={() => {
            const bad = ['info', 'units', 'mua'].find((k) => stepErr(k)); const e = bad ? stepErr(bad) : ''; setErrMsg(e);
            if (bad) { setTab(bad); return; }
            ack.request((a) => save.mutate(a));
          }}>{save.isPending ? 'Đang ghi…' : 'Ghi mặt hàng'}</button>}
          <button className="btn" onClick={onClose}>Huỷ bỏ</button>
        </>
      ) : <>
        <button className="btn btn-primary" disabled={save.isPending}
          onClick={() => {
            // [2026-11-12 Nguyễn Văn Thủy] bấm Ghi luôn được; thiếu gì báo rõ ở đầu form (đóng góp)
            const loi = !v.sku.trim() ? 'Chưa nhập mã hàng.' : skuLetters ? 'Mã hàng chỉ gồm chữ số và chữ cái, không dấu cách.' : !v.name.trim() ? 'Chưa nhập tên hàng.'
              : sameName ? `Tên hàng trùng với mã ${sameName.sku}.` : !baseUnit ? 'Chưa khai đơn vị tính: gõ tên ĐVT nhỏ nhất (vd Hộp, Lon, Cái) ở thẻ Đơn vị tính.' : '';
            setErrMsg(loi);
            if (loi) { setTab(!baseUnit && v.sku.trim() && v.name.trim() && !sameName && !skuLetters ? 'units' : 'info'); return; }
            ack.request((a) => save.mutate(a));
          }}>Ghi</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <ErrorBox error={loaded.error ? errorText(loaded.error) : null} />
      {errMsg && <div className="alert alert-bad full" style={{ marginBottom: 8 }}>{errMsg}</div>}
      {isNew ? (
        <div className="full nx-steps them-mh-steps">
          {STEPS.map((x, i) => <span key={x.k} role="button" tabIndex={-1} onClick={() => goStep(i)} className={i === stepIdx ? 'on' : i < stepIdx ? 'xong' : undefined} title={i < stepIdx ? 'Quay lại bước này' : undefined}><b>{i < stepIdx ? '✓' : i + 1}</b>{x.t}</span>)}
        </div>
      ) : <div className="tabs full" role="tablist" style={{ marginBottom: 8 }}>
        {tabBtn('info', 'Thông tin')}{tabBtn('units', `Đơn vị tính (${v.units.filter((u) => u.unit.trim()).length})`)}{tabBtn('status', 'Trạng thái')}{extraTabs.map((t) => tabBtn(t.key, t.label))}{tabBtn('prices', 'Giá bán')}{!isNew && tabBtn('history', 'Lịch sử')}
        <span className="spacer" style={{ flex: 1 }} />
      </div>}
      {help && <HelpDrawer guideKey="mat-hang" onClose={() => setHelp(false)} />}

      {tab === 'history' && !isNew && <LichSuMatHang sku={v.sku} />}
      {tab === 'info' && isNew && !kind && (
        <div className="full kieu-ma">
          <button type="button" onClick={() => setKind('new')}><b>Mã mới</b><span>Mặt hàng chính: chọn nhóm hàng, mã tự sinh theo nhóm.</span></button>
          <button type="button" onClick={() => { setKind('variant'); set({ sku: '', groupCode: null }); }}><b>Mã biến thể</b><span>Đi theo một mã đã có: giữ nguyên mã cha, nhóm hàng theo mã cha.</span></button>
        </div>
      )}
      {tab === 'info' && (!isNew || kind) && (
        <fieldset className="fgroup">
          <legend>Thông tin mặt hàng</legend>
          {isNew && <div className="full kieu-ma-bar">Đang tạo: <b>{kind === 'variant' ? 'Mã biến thể' : 'Mã mới'}</b>
            <button type="button" className="btn btn-xs" onClick={() => { setKind(''); setParentErr(''); set({ sku: '', groupCode: null, parentSku: null, name: '' }); setSkuHint(null); setErrMsg(''); }}>Đổi</button></div>}
          {kind === 'variant' && isNew && (
            <Field label="Mã cha (*)" full tip="Mã chính đã có; mã biến thể giữ nguyên mã này">
              <ItemPicker only={(c) => /^[0-9]{9}$|^[A-Z][0-9]{8}$/.test(c)} value={v.parentSku ?? ''} onChange={(c) => { setParentErr(''); set({ parentSku: c || null }); }} placeholder="Gõ mã hoặc tên mặt hàng chính" />
              {parentErr && <div className="alert alert-bad" style={{ marginTop: 6 }}>{parentErr}</div>}
            </Field>
          )}
          {(kind !== 'variant' || v.groupCode) && <Field label={isNew ? 'Nhóm hàng (*)' : 'Nhóm hàng'} full tip={lockedGroup ? 'Theo mã cha, không đổi được' : 'Chọn nhóm là xong: mã hàng tự sinh theo nhóm'} hint={isNew && !v.groupCode ? 'Chọn nhóm hàng cấp 3 trước — mã hàng tự sinh theo nhóm, các ô khác hiện ra sau khi chọn' : undefined}>
            {lockedGroup
              ? <div className="input" style={{ background: 'var(--surface-2, #f4f6f9)' }} title="Mã biến thể luôn cùng nhóm với mã cha">{v.groupCode ? groupPath(v.groupCode) : <span className="muted">Theo mã cha</span>}</div>
              : <ChonNhomCay classes={classes.group} value={v.groupCode} label={v.groupCode ? groupPath(v.groupCode) : ''} onChange={pickGroup} defaultOpen={isNew && !v.groupCode} />}
          </Field>}
          {/* [2026-11-12 Nguyễn Văn Thủy] thêm mới: chọn nhóm hàng trước, các ô khác hiện sau (đóng góp) */}
          {(!isNew || v.groupCode) && <>
          {/* [2026-11-10 03:00 PM Nguyễn Văn Thủy] PHASE-026 — rà form mặt hàng (đóng góp): Nhóm → Mã → Tên lên đầu; thêm mới = mã cha toàn số, không chọn mã cha;
              tên không trùng (báo ngay); Biến thể không cho đổi sang Nội bộ khi đã có nhập xuất. */}
          <Field label="Mã hàng (*)" hint={skuErr || (skuLetters ? 'Mã chỉ gồm chữ số và chữ cái, không dấu cách' : undefined)}>
            <div className="row" style={{ gap: 4 }}>
              {kind === 'variant' && isNew && v.parentSku ? <MaBienThe parent={v.parentSku} sku={v.sku} onChange={(x) => set({ sku: x, ...(!v.name.trim() || v.name === tenBienThe(v.sku) ? { name: tenBienThe(x) } : {}) })} /> : <input className="input mono" value={v.sku} placeholder={isNew ? (kind === 'variant' ? 'Mã cha + chữ ở đầu hoặc cuối' : 'Chọn nhóm hàng là tự sinh — gõ tay được') : ''} onChange={(e) => { set({ sku: e.target.value.trim().toUpperCase() }); setSkuAuto(false); }} style={{ flex: 1 }} />}
              {isNew && kind === 'new' && <button type="button" className="btn btn-sm" onClick={() => void genSku(v.groupCode, true)} title="Lấy mã kế tiếp theo nhóm hàng đã chọn (thay mã đang có)">Sinh mã</button>}
              <button type="button" className="btn btn-sm btn-help" onClick={() => setHelp(true)} title="Quy tắc mã hàng, sản phẩm con, cách kiểm tra">?</button>
            </div>
            {skuBad && <div className="neg" style={{ fontSize: 12.5, marginTop: 4, fontWeight: 600 }}>{skuBad}</div>}
            {isNew && kind === 'new' && !skuLetters && <MaHangGiaiThich sku={v.sku} hint={skuHint} auto={skuAuto} isNew={isNew} />}
          </Field>
          <Field label="Tên hàng (*)" full tip="Không được trùng tên mặt hàng khác. Mã con: ghi phần phân biệt">
            <input className="input" value={v.name} maxLength={255} placeholder={kind === 'variant' && parentData.data ? `Mã cha: ${parentData.data.name}` : undefined} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <TrungTen same={sameName} />
          {/* [2026-11-12 Nguyễn Văn Thủy] bỏ khai báo cha – con (ô Mã hàng cha, nút Thêm sản phẩm con): phần mềm tự gom theo mã (0112) (đóng góp) */}
          {/* [2026-11-12 Nguyễn Văn Thủy] bỏ ô Biến thể và Gửi lên thuế: hệ thống tự suy theo mã, đuôi Z = không gửi thuế (0111) (đóng góp) */}
          {/* [2026-11-12 Nguyễn Văn Thủy] bỏ ô Loại hàng: đã có Nhóm hàng, bớt khai báo; giá trị cũ giữ nguyên (đóng góp) */}
          <Field label="Barcode" tip="Nhiều mã cách nhau dấu /"><input className="input mono" value={v.barcode} onChange={(e) => set({ barcode: e.target.value })} /></Field>
          {/* [2026-11-12 Nguyễn Văn Thủy] thẻ Thông tin tối giản: nhóm, mã, tên, barcode, xuất xứ, ảnh, mô tả; ngành / nhãn tự theo nhóm (đóng góp) */}
          {/* [2026-11-12 Nguyễn Văn Thủy] một ô Thuế suất GTGT (%) — đặt cặp mã thuế ra / vào chuẩn; bỏ thẻ Kế toán (đóng góp) */}
          <Field label="Thuế suất GTGT (%)">
            <select className="select input" value={vatRate?.key ?? (v.taxOutCode ? 'other' : '')} onChange={(e) => {
              const r = VAT_RATES.find((x) => x.key === e.target.value);
              if (r) set({ taxOutCode: r.out, taxInCode: r.in }); else if (!e.target.value) set({ taxOutCode: null, taxInCode: null });
            }}>
              <option value="">(chưa khai)</option>
              {VAT_RATES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              {!vatRate && v.taxOutCode && <option value="other">{v.taxOutCode}</option>}
            </select>
          </Field>
          <Field label="Trạng thái" tip="Mặt hàng tạo mới mặc định Đang hoạt động. Ngừng hoạt động: không dùng trên chứng từ mới, dữ liệu cũ giữ nguyên">
            {v.isDraft ? <input className="input" readOnly value="Chờ duyệt (còn thiếu thông tin — sửa rồi Ghi là hoạt động)" />
              : <select className="select input" value={v.isActive ? '1' : '0'} onChange={(e) => set({ isActive: e.target.value === '1' })}><option value="1">Đang hoạt động</option><option value="0">Ngừng hoạt động</option></select>}
          </Field>
          <Field label="Xuất xứ"><input className="input" value={v.origin} onChange={(e) => set({ origin: e.target.value })} /></Field>
          <Field label="Ảnh (đường dẫn)" full>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <input className="input" value={v.imageUrl} onChange={(e) => { setImgBad(false); set({ imageUrl: e.target.value }); }} placeholder="https://…" style={{ flex: 1 }} />
              {v.imageUrl && !imgBad && <img src={v.imageUrl} alt="" onError={() => setImgBad(true)} style={{ height: 48, width: 48, objectFit: 'contain', border: '1px solid var(--line)', borderRadius: 4 }} />}
              {v.imageUrl && imgBad && <span className="neg" style={{ fontSize: 12 }}>Không tải được ảnh</span>}
            </div>
          </Field>
          <Field label="Mô tả" full><textarea className="input" rows={3} value={v.description} onChange={(e) => set({ description: e.target.value })} /></Field>
          </>}
        </fieldset>
      )}

      {tab === 'units' && (
        <DvtQuyDoi units={v.units} onUnit={setUnit}
          onAdd={(u) => set({ units: [...v.units, u] })}
          onRemove={(i) => setV((x) => ({ ...x, units: x.units.filter((_, j) => j !== i), prices: x.prices.filter((p) => p.unit !== x.units[i]!.unit) }))} />
      )}
      {isNew && tab === 'status' && <div className="full muted" style={{ fontSize: 12.5, margin: '2px 0 6px' }}>Không bắt buộc: tích các trạng thái cần, khai giá bán (khai sau ở thẻ Giá bán cũng được).</div>}
      {(tab === 'prices' || (isNew && tab === 'status')) && <GiaBan units={v.units} prices={v.prices} lists={lists} shown={shownLists} setShown={setShownLists} setPrice={setPrice} onlyCompany={v.isMain} />}

      {isNew && tab === 'mua' && <NccTamBang rows={nccRows} setRows={setNccRows} units={v.units.map((u) => u.unit.trim()).filter(Boolean)} mainUnit={v.units.find((u) => u.isPurchaseDefault)?.unit ?? v.units.find((u) => u.isDefault)?.unit ?? baseUnit} vatLabel={vatRate?.label ?? ''} />}
      {tab === 'review' && <XemLai v={v} groupLabel={v.groupCode ? groupPath(v.groupCode) : ''} vatLabel={vatRate?.label ?? v.taxOutCode ?? ''} baseUnit={baseUnit} companyPrice={companyPrice} companyName={companyList?.name} ncc={nccRows} />}
      {extraTabs.filter((t) => t.key === tab).map((t) => <t.Component key={t.key} sku={isNew ? '' : v.sku} name={v.name} units={v.units.map((u) => u.unit.trim()).filter(Boolean)} />)}

      {tab === 'status' && (
        <fieldset className="fgroup">
          <legend>Trạng thái bán / xuất</legend>
          <div className="full">
            {flag('isMain', 'Hàng chính', 'Bán theo giá bảng giá công ty, không lấy giá chi nhánh. Bỏ tích: ưu tiên giá chi nhánh rồi tới giá công ty.')}
            {flag('isUnder24m', 'Sữa cho trẻ dưới 24 tháng (Luật thuế)', 'Nghiêm cấm mọi chương trình khuyến mại cho mặt hàng này.')}
            {flag('noSale', 'Không được bán (vật tư chỉ nhập)', 'Không hiện ở màn bán hàng; chỉ nhập kho / dùng nội bộ.')}
            {flag('exportAdjust', 'Được xuất điều chỉnh dù vẫn bán (BIT1)', 'Cho phép lập phiếu xuất điều chỉnh với mặt hàng đang bán.')}
          </div>
        </fieldset>
      )}

      {v.isDraft && <div className="alert alert-warn full"><b>Chờ duyệt</b> — mặt hàng chưa hoạt động, chưa dùng được trên chứng từ (cửa nạp giữ chứng từ ở Trạm kiểm tra với mã IN-ITEM-009). Sửa các lỗi chặn bên dưới, Ghi → tự kích hoạt.</div>}
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
    </Modal>
  </>);
}

/**
 * Giải thích mã hàng ngay dưới ô mã (để người dùng / người kiểm thử đọc được mã đúng quy tắc chưa):
 *   [Ngành 17] [Nhãn 167] [Nhóm 6] [Số 005] [Đuôi K — chia giá] · nguồn mã SKU nhóm · mã gõ tay / khác tiền tố của nhóm.
 */
function MaHangGiaiThich({ sku, hint, auto, isNew }: { sku: string; hint: SkuPreview | null; auto: boolean; isNew: boolean }) {
  if (!sku) return null;
  const info = skuInfo(sku);
  const src = (lv: number) => { const x = hint?.segments[lv]; return x ? `${x.name}${x.source === 'new' ? ' · mã mới cấp' : x.source === 'inferred' ? ' · theo mã đang có' : ''}` : ''; };
  const chip = (label: string, val: string | undefined, title = '') => val ? <span className="sku-chip" title={title}><small>{label}</small><b className="mono">{val}</b></span> : null;
  const diff = hint && isNew && info.base && !info.base.startsWith(hint.prefix);
  return (
    <div className="sku-explain">
      {info.kind === 'other'
        ? (/^\d{10,}$/.test(sku) ? <span className="muted">Sản phẩm con toàn số</span> : <span className="mh-warn">Mã không theo quy tắc mã hàng (9 ký tự: ngành 2 + nhãn 3 + nhóm 1 + số 3) — vẫn lưu được nếu là mã đặc biệt</span>)
        : <>
          {chip(info.kind === 'gift' ? 'Quà' : 'Ngành', info.industry, src(0))}{chip('Nhãn', info.brand, src(1))}{chip('Nhóm', info.group, src(2))}{chip('Số', info.seq, 'Số tự sinh: số lớn nhất đang có của cùng tiền tố + 1')}
          {info.suffix && chip('Đuôi', `${info.suffix} · ${info.label}`, info.hint)}
          {info.child && chip('Con', info.child, 'Số thứ tự sản phẩm con, không mang nghĩa')}
          {info.kind === 'combo' && <span className="badge badge-warn" title={info.hint}>Combo (nhóm 8)</span>}
        </>}
      {isNew && <span className="muted">{auto ? '· tự sinh theo nhóm' : '· gõ tay'}</span>}
      {diff && <span className="mh-warn"> · khác tiền tố của nhóm đã chọn ({hint!.prefix})</span>}
    </div>
  );
}

// [2026-11-12 Nguyễn Văn Thủy] ô chọn Nhóm hàng dạng cây cha – con có ô tìm; chỉ chọn nhóm cuối (đóng góp)
function ChonNhomCay({ classes, value, label, onChange, defaultOpen }: { classes: ItemClassLite[]; value: string | null; label: string; onChange: (c: string) => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [msg, setMsg] = useState('');
  // Cấp của từng nhóm (1 = gốc); chỉ cho chọn từ cấp 3.
  const lv = useMemo(() => {
    const by = new Map(classes.map((c) => [c.code, c]));
    const m = new Map<string, number>();
    const of = (code: string, seen = new Set<string>()): number => {
      if (m.has(code)) return m.get(code)!;
      const c = by.get(code); if (!c || seen.has(code)) return 0;
      seen.add(code);
      const d = c.parentCode && by.has(c.parentCode) && c.parentCode !== code ? of(c.parentCode, seen) + 1 : 1;
      m.set(code, d); return d;
    };
    classes.forEach((c) => of(c.code));
    return m;
  }, [classes]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', off); window.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', off); window.removeEventListener('keydown', esc, true); };
  }, [open]);
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button type="button" className="input" style={{ textAlign: 'left', width: '100%', cursor: 'pointer' }} onClick={() => setOpen((x) => !x)}>
        {label || <span className="muted">Bấm để chọn nhóm hàng</span>}
      </button>
      {!open && msg && <div className="neg" style={{ fontSize: 12.5, marginTop: 4, fontWeight: 600 }}>{msg}</div>}
      {open && (
        <div className="cay-nhom-drop">
          <button type="button" className="btn btn-sm cay-nhom-x" onClick={() => setOpen(false)} title="Đóng (Esc)">✕ Đóng</button>
          {msg && <div className="alert alert-bad cay-nhom-msg">{msg}</div>}
          <GroupTree classes={classes.filter((c) => c.isActive || c.code === value).map((c) => ({ ...c, products: (c as { products?: number }).products ?? 0 })) as never} value={value} onChange={(c) => {
            if (!c) return;
            if ((lv.get(c) ?? 0) < 3) { setMsg(`"${classes.find((x) => x.code === c)?.name ?? c}" mới là nhóm cấp ${lv.get(c) ?? 0} — phải chọn tới nhóm cấp 3 (nhóm sản phẩm).`); return; }
            setMsg(''); onChange(c); setOpen(false);
          }} leafOnly autoFocus />
        </div>
      )}
    </div>
  );
}

// [2026-11-12 Nguyễn Văn Thủy] bước Xem lại khi thêm mặt hàng (đóng góp)
function XemLai({ v, groupLabel, vatLabel, baseUnit, companyPrice, companyName, ncc }: { v: FullProduct; groupLabel: string; vatLabel: string; baseUnit: string; companyPrice?: number | null; companyName?: string; ncc: NccTam[] }) {
  const units = v.units.filter((u) => u.unit.trim());
  const flags = [v.isMain && 'Hàng chính', v.isUnder24m && 'Sữa trẻ dưới 24 tháng', v.noSale && 'Không được bán', v.exportAdjust && 'Được xuất điều chỉnh'].filter(Boolean) as string[];
  const row = (k: string, val: React.ReactNode) => <div className="xl-row"><span>{k}</span><b>{val || <span className="muted" style={{ fontWeight: 400 }}>—</span>}</b></div>;
  return (
    <div className="full xem-lai">
      <section><h4>Thông tin chung</h4>{row('Nhóm hàng', groupLabel)}{row('Mã hàng', <span className="mono">{v.sku}</span>)}{row('Tên hàng', v.name)}{row('Thuế suất GTGT', vatLabel)}{row('Barcode', v.barcode)}{row('Xuất xứ', v.origin)}{row('Trạng thái', v.isActive ? 'Đang hoạt động' : 'Ngừng hoạt động')}</section>
      <section><h4>Đơn vị tính</h4>{row('Nhỏ nhất', baseUnit)}{units.filter((u) => Number(u.ratio) !== 1).map((u) => <div key={u.unit} className="xl-row"><span>{u.unit}</span><b>= {u.ratio} {baseUnit}</b></div>)}{row('Bán chính', units.find((u) => u.isDefault)?.unit ?? baseUnit)}</section>
      <section><h4>Giá mua</h4>{ncc.filter((r) => r.partnerCode).length ? ncc.filter((r) => r.partnerCode).map((r, i) => <div key={i} className="xl-row"><span className="mono">{r.partnerCode}</span><b>{r.price !== null ? `${r.price.toLocaleString('vi-VN')} / ${r.unit}` : `chưa khai giá · ${r.unit}`}</b></div>) : row('Nhà cung cấp', '')}</section>
      <section><h4>Bán hàng & giá</h4>{row('Trạng thái bán', flags.join(' · '))}{row(`Giá ${companyName ?? 'công ty'}`, companyPrice ? companyPrice.toLocaleString('vi-VN') : '')}</section>
    </div>
  );
}

// [2026-11-12 Nguyễn Văn Thủy] bước Mua hàng khi thêm mặt hàng: nhà cung cấp + giá mua khai trước, ghi cùng mặt hàng (đóng góp)
interface NccTam { partnerCode: string; unit: string; price: number | null; validFrom: string; nccSku: string }
function NccTamBang({ rows, setRows, units, mainUnit, vatLabel }: { rows: NccTam[]; setRows: (f: (r: NccTam[]) => NccTam[]) => void; units: string[]; mainUnit: string; vatLabel: string }) {
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const set = (i: number, p: Partial<NccTam>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const add = () => setRows((rs) => [...rs, { partnerCode: '', unit: mainUnit || units[0] || '', price: null, validFrom: today, nccSku: '' }]);
  return (
    <div className="full">
      <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <button type="button" className="btn btn-sm btn-primary" onClick={add}>+ Thêm nhà cung cấp</button>
        <span className="muted" style={{ fontSize: 12.5 }}>Nhà cung cấp nào bán mã này, giá mua chưa thuế theo ĐVT{vatLabel ? ` (thuế ${vatLabel})` : ''}. Không bắt buộc — khai sau ở thẻ Mua hàng cũng được.</span>
      </div>
      {rows.length > 0 && (
        <table className="mh-mini ncc-tam">
          <thead><tr><th>Nhà cung cấp (*)</th><th style={{ width: 130 }}>ĐVT</th><th className="num" style={{ width: 150 }} title="Giá mua theo ĐVT, chưa thuế">Giá mua chưa thuế</th><th style={{ width: 150 }}>Hiệu lực từ</th><th style={{ width: 150 }}>Mã bên NCC</th><th style={{ width: 50 }} /></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i}>
              <td><PartnerPicker value={r.partnerCode} onChange={(c) => set(i, { partnerCode: c })} placeholder="Gõ mã, tên hoặc MST" addKind="supplier" /></td>
              <td><select className="select input" value={r.unit} onChange={(e) => set(i, { unit: e.target.value })}>{units.map((u) => <option key={u} value={u}>{u}</option>)}</select></td>
              <td><NumInput value={r.price} onChange={(n) => set(i, { price: n })} /></td>
              <td><input className="input" type="date" value={r.validFrom} onChange={(e) => set(i, { validFrom: e.target.value })} /></td>
              <td><input className="input mono" value={r.nccSku} onChange={(e) => set(i, { nccSku: e.target.value })} /></td>
              <td><button type="button" className="btn btn-xs" title="Bỏ dòng" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>✕</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {!rows.length && <div className="muted" style={{ padding: '12px 4px' }}>Chưa có nhà cung cấp. Bấm <b>+ Thêm nhà cung cấp</b> để khai giá mua.</div>}
    </div>
  );
}

// [2026-11-12 Nguyễn Văn Thủy] mã cha suy theo mã: bỏ chữ đầu / cuối quanh mã chính — trùng máy chủ (0115) (đóng góp)
function parentFromSku(sku: string): string | null {
  const t = sku.trim().toUpperCase();
  const m = /^([A-Z]{0,3})([0-9]{9})([A-Z]{0,3})$/.exec(t);
  if (m && (m[1] || m[3])) return m[2]!;
  const g = /^([A-Z][0-9]{8})[A-Z]{1,3}$/.exec(t);
  return g ? g[1]! : null;
}

// [2026-11-12 Nguyễn Văn Thủy] mã biến thể: phần mã cha khoá cứng, chỉ gõ chữ ở đầu / cuối, tổng tối đa 2 chữ (đóng góp)
function MaBienThe({ parent, sku, onChange }: { parent: string; sku: string; onChange: (sku: string) => void }) {
  const at = sku.indexOf(parent);
  const pre = at >= 0 ? sku.slice(0, at) : '';
  const suf = at >= 0 ? sku.slice(at + parent.length) : 'Z';
  const put = (p: string, s: string) => {
    p = p.toUpperCase().replace(/[^A-Z]/g, ''); s = s.toUpperCase().replace(/[^A-Z]/g, '');
    if (p.length + s.length > 2) return;
    onChange(p + parent + s);
  };
  return (
    <div className="row ma-bien-the" style={{ flex: 1, gap: 4, alignItems: 'center' }}>
      <input className="input mono" style={{ width: 70, textAlign: 'right' }} value={pre} placeholder="chữ" title="Chữ thêm ở đầu (không bắt buộc)" onChange={(e) => put(e.target.value, suf)} />
      <span className="input mono" style={{ background: 'var(--surface-2, #f4f6f9)', width: 'auto', padding: '0 10px', display: 'flex', alignItems: 'center' }} title="Mã cha — giữ nguyên">{parent}</span>
      <input className="input mono" style={{ width: 70 }} value={suf} placeholder="chữ" title="Chữ thêm ở cuối" onChange={(e) => put(pre, e.target.value)} />
      <span className="muted" style={{ fontSize: 12.5 }}>= <b className="mono">{sku}</b></span>
    </div>
  );
}
