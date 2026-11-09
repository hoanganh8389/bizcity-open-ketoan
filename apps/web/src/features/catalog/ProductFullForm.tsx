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
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { ItemPicker, ListPicker } from '@/components/pickers';
import { HelpDrawer } from '@/components/HelpDrawer';
// [2026-11-05 02:20 PM Nguyễn Văn Thủy] PHASE-026 — S026-23: đổi mã, gộp mã, lịch sử (đóng góp)
import { DoiMaModal, GopMaModal, LichSuMatHang } from './DoiMaGopMa';
// [2026-11-07 05:50 PM Nguyễn Văn Thủy] PHASE-026 — mã số cha – con GĐ 1: ô Biến thể, Loại hàng ở thẻ Thông tin, nút Thêm sản phẩm con (đóng góp)
// [2026-11-09 10:00 AM Nguyễn Văn Thủy] PHASE-026 — bỏ tạo mã có đuôi (chọn đuôi, ChonDuoiMa): mọi biến thể là sản phẩm con; ô Biến thể sửa được (đóng góp)
// [2026-11-09 07:00 PM Nguyễn Văn Thủy] PHASE-026 — mã cha không có ô Biến thể; thẻ Thông tin gọn: giải thích vào rê chuột, ẩn ngành / nhãn khi đã theo nhóm (đóng góp)
import { ThemSanPhamCon, TrungTen, useSameName, useVariantKinds, VariantBadge, variantLabel } from './ThemSanPhamCon';
import { PRODUCT_TABS } from '../../phan-he/product-tabs';
import { useEnabledModules } from '../../layout/useAppMenu';
import { DvtQuyDoi, GiaBan } from './DvtGiaBan';
import { skuInfo } from '@bizcity/mua-hang-domain';
import { flashSaved, savedNote, useCatalogWhy, useWarnAck, WarnAckBox, WhyPanel } from '@/components/WhyPanel';
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
  /** Biến thể: căn cứ duy nhất để tách hàng nội bộ, sang thuế. Phần mềm không đọc chữ cuối mã. */
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
  { key: '8', label: '8%', out: 'R08', in: 'V08' },
  { key: '10', label: '10%', out: 'R10', in: 'V10' },
  { key: '5', label: '5%', out: 'R05', in: 'V05' },
  { key: '0', label: '0% (hàng xuất khẩu)', out: 'R00', in: 'V00' },
  { key: 'kct', label: 'Không chịu thuế GTGT (KCT)', out: 'KCT', in: 'V13K' },
];

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '' : n.toLocaleString('vi-VN'));
const parseNum = (s: string): number | null => {
  const t = s.replace(/\./g, '').replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** startTab / startEditing: mở thẳng một thẻ ở chế độ sửa (ví dụ "+ĐVT" trên phiếu mua mở thẻ ĐVT). */
export function ProductFullForm({ sku, initial, classes, groupPath, onClose, startTab, startEditing }: {
  sku: string | null; // null = thêm mới
  initial?: Partial<FullProduct>;
  classes: Record<ClassKind, ItemClassLite[]>;
  groupPath: (c: string | null) => string;
  onClose: () => void;
  startTab?: string;
  startEditing?: boolean;
}) {
  const qc = useQueryClient();
  const isNew = sku === null;
  const [tab, setTab] = useState<string>(startTab ?? 'info');
  const enabled = useEnabledModules();
  const extraTabs = PRODUCT_TABS.filter((t) => !enabled || enabled.has(t.module));
  const [v, setV] = useState<FullProduct>({ ...EMPTY, ...initial });
  const [shownLists, setShownLists] = useState<string[]>([]);
  const [skuHint, setSkuHint] = useState<SkuPreview | null>(null);
  const [skuErr, setSkuErr] = useState('');
  // Mã tự sinh theo nhóm (auto) hay người dùng gõ tay (không ghi đè mã gõ tay khi đổi nhóm).
  const [skuAuto, setSkuAuto] = useState(!initial?.sku);
  const [help, setHelp] = useState(false);
  const [imgBad, setImgBad] = useState(false);
  const [taxDetail, setTaxDetail] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [merging, setMerging] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const kinds = useVariantKinds().data;
  const set = (p: Partial<FullProduct>) => setV((x) => ({ ...x, ...p }));

  const loaded = useQuery({ queryKey: ['catalog-product', sku], queryFn: () => api.get<FullProduct>(`/api/v1/catalog/products/${encodeURIComponent(sku!)}`), enabled: !isNew });
  const lists = useQuery({ queryKey: ['price-lists'], queryFn: () => api.get<PriceList[]>('/api/v1/catalog/price-lists'), staleTime: 60_000 }).data ?? [];
  const taxes = useQuery({ queryKey: ['tax-codes'], queryFn: () => api.get<TaxCode[]>('/api/v1/tax-codes'), staleTime: 60_000 }).data ?? [];
  const pgroups = useQuery({ queryKey: ['groups'], queryFn: () => api.get<PostingGroup[]>('/api/v1/posting/groups'), staleTime: 60_000 }).data ?? [];

  // Mã mới chỉ gồm số (bỏ chữ cuối mã). Mã cũ có chữ vẫn sửa được, ô mã khoá.
  const skuLetters = isNew && /[^0-9]/.test(v.sku);
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
      const { sku: _s, unit: _u, units: _us, prices: _ps, variantCode, ...rest } = v;
      return api.put<FullProduct>(`/api/v1/catalog/products/${encodeURIComponent(v.sku.trim())}${isNew ? '?new=1' : ''}`, { ...rest, ...(!isNew && v.parentSku ? { variantCode } : {}), sendToTax: v.variantCode === 'internal' ? false : v.sendToTax !== false, units, prices, warnAck });
    },
    onSuccess: () => {
      flashSaved(savedNote(why.findings, { draft: blockCount > 0 }));
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['catalog-product'] });
      void qc.invalidateQueries({ queryKey: ['price-lists'] });
      void qc.invalidateQueries({ queryKey: ['item-classes'] });
      void qc.invalidateQueries({ queryKey: ['unit-names'] });
      if (isNew) onClose(); else viewAgain[1]();
    },
  });

  const vatRate = VAT_RATES.find((r) => r.out === v.taxOutCode && (r.in === v.taxInCode || !v.taxInCode));
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
    <Modal key="form" viewAgain={viewAgain} viewFirst={!isNew && !startEditing} wide title={isNew ? 'Thêm mặt hàng' : `Mặt hàng ${v.sku} — ${v.name}`} onClose={onClose}
      footer={<>
        {!isNew && !v.parentSku && <button className="btn" data-view-ok style={{ marginRight: 'auto' }} disabled={!/^\d+$/.test(v.sku)}
          title={/^\d+$/.test(v.sku) ? 'Màu, size, kẹp quà, khuyến mại, nội bộ… đều là sản phẩm con: gõ tên, chọn biến thể. Mã tự cấp = mã này + 2 số' : 'Mã này còn chữ: bấm Đổi mã sang mã số trước rồi mới thêm sản phẩm con'}
          onClick={() => setAddingChild(true)}>Thêm sản phẩm con…</button>}
        {!isNew && <button className="btn" data-view-ok title="Đổi sang mã mới từ hôm nay, sổ cũ giữ mã cũ" onClick={() => setRenaming(true)}>Đổi mã</button>}
        {!isNew && <button className="btn" data-view-ok title="Gộp mã này vào mặt hàng khác từ hôm nay, sổ cũ giữ nguyên" onClick={() => setMerging(true)}>Gộp mã</button>}
        <button className="btn btn-primary" disabled={save.isPending || !v.sku.trim() || !v.name.trim() || skuLetters || Boolean(sameName)} title={sameName ? `Tên trùng mã ${sameName.sku}` : skuLetters ? 'Mã mới chỉ gồm chữ số' : blockCount ? 'Còn lỗi chặn: mặt hàng được lưu NHÁP, chưa dùng được trên chứng từ cho tới khi sửa xong' : undefined}
          onClick={() => ack.request((a) => save.mutate(a))}>{blockCount ? `Lưu nháp (còn ${blockCount} lỗi chặn)` : ack.label}</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <ErrorBox error={loaded.error ? errorText(loaded.error) : null} />
      <div className="tabs full" role="tablist" style={{ marginBottom: 8 }}>
        {tabBtn('info', 'Thông tin')}{tabBtn('units', `Đơn vị tính (${v.units.filter((u) => u.unit.trim()).length})`)}{tabBtn('status', 'Trạng thái')}{tabBtn('acc', 'Kế toán')}{extraTabs.map((t) => tabBtn(t.key, t.label))}{tabBtn('prices', 'Giá bán')}{!isNew && tabBtn('history', 'Lịch sử')}
        <span className="spacer" style={{ flex: 1 }} />
        <button type="button" className="btn btn-sm btn-help" onClick={() => setHelp(true)} title="Cách khai mặt hàng, ĐVT, giá, sinh mã hàng">? Hướng dẫn</button>
      </div>
      {help && <HelpDrawer guideKey="mat-hang" onClose={() => setHelp(false)} />}

      {tab === 'history' && !isNew && <LichSuMatHang sku={v.sku} />}
      {tab === 'info' && (
        <fieldset className="fgroup">
          <legend>Thông tin mặt hàng</legend>
          {isNew && !v.parentSku && <div className="muted full" style={{ fontSize: 12.5 }}>Thêm mặt hàng mới (mã cha). Màu, size, kẹp quà, hàng tặng, nội bộ… của mặt hàng đã có thì mở mặt hàng đó, bấm <b>Thêm sản phẩm con</b>.</div>}
          <Field label="Nhóm hàng" full tip="Chọn nhóm là xong: ngành, nhãn tự điền; mặt hàng mới tự sinh mã = ngành (2) + nhãn (3) + nhóm (1) + số thứ tự (3)">
            <ListPicker items={pick('group')} value={v.groupCode ?? ''} onChange={pickGroup} placeholder="Gõ tên nhóm / nhãn để tìm — chọn tới nhóm sản phẩm (cấp 3)" nameFirst />
          </Field>
          {/* [2026-11-10 03:00 PM Nguyễn Văn Thủy] PHASE-026 — rà form mặt hàng (đóng góp): Nhóm → Mã → Tên lên đầu; thêm mới = mã cha toàn số, không chọn mã cha;
              tên không trùng (báo ngay); Biến thể không cho đổi sang Nội bộ khi đã có nhập xuất. */}
          <Field label="Mã hàng (*)" hint={skuErr || (skuLetters ? 'Mã mới chỉ gồm chữ số. Kẹp quà, khuyến mại, nội bộ… tạo bằng nút Thêm sản phẩm con ở mặt hàng cha' : undefined)}>
            <div className="row" style={{ gap: 4 }}>
              <input className="input mono" value={v.sku} disabled={!isNew} placeholder={isNew ? 'Chọn nhóm hàng là tự sinh — gõ tay được' : ''} onChange={(e) => { set({ sku: e.target.value.trim().toUpperCase() }); setSkuAuto(false); }} style={{ flex: 1 }} />
              {isNew && <button type="button" className="btn btn-sm" onClick={() => void genSku(v.groupCode, true)} title="Lấy mã kế tiếp theo nhóm hàng đã chọn (thay mã đang có)">Sinh mã</button>}
              <button type="button" className="btn btn-sm btn-help" onClick={() => setHelp(true)} title="Quy tắc mã hàng, sản phẩm con, cách kiểm tra">?</button>
            </div>
            {isNew && !skuLetters && <MaHangGiaiThich sku={v.sku} hint={skuHint} auto={skuAuto} isNew={isNew} />}
          </Field>
          <Field label="Tên hàng (*)" full tip="Không được trùng tên mặt hàng khác. Mã con: ghi phần phân biệt (màu, size, kẹp quà…)">
            <input className="input" value={v.name} maxLength={255} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <TrungTen same={sameName} />
          {!isNew && <MaHangCha sku={v.sku} value={v.parentSku ?? null} onChange={(parentSku) => set({ parentSku })} kinds={kinds} />}
          {/* Chỉ mã con có Biến thể; mã cha luôn là hàng thường. */}
          {!isNew && v.parentSku && (
            <Field label="Biến thể" tip="Phần mềm xử lý theo ô này, không theo tên hay mã" hint={kinds?.find((k) => k.code === (v.variantCode ?? 'normal'))?.note || undefined}>
              <select className="select input" value={v.variantCode ?? 'normal'} onChange={(e) => set({ variantCode: e.target.value })}>
                {(kinds ?? []).filter((k) => (k.isActive && k.code !== 'legacy') || k.code === v.variantCode).map((k) => {
                  // Đã có nhập xuất và đang gửi thuế: sang Nội bộ là đổi đường thuế → không cho.
                  const lockInternal = k.code === 'internal' && v.variantCode !== 'internal' && Boolean(v.hasMovements) && v.sendToTax !== false;
                  return <option key={k.code} value={k.code} title={lockInternal ? 'Đã có nhập xuất, đang gửi thuế: không chuyển sang Nội bộ được. Tạo sản phẩm con Nội bộ mới' : k.note} disabled={lockInternal}>{variantLabel(k)}{lockInternal ? ' — khoá' : ''}</option>;
                })}
              </select>
            </Field>
          )}
          {/* [2026-11-09 07:30 PM Nguyễn Văn Thủy] PHASE-026 — ô Gửi lên thuế (0093) (đóng góp): mọi mặt hàng (cả mã cha); Nội bộ thì tự tắt, khoá. */}
          <Field label="Gửi lên thuế" tip={v.variantCode === 'internal' ? 'Hàng Nội bộ không bao giờ gửi lên thuế' : v.hasMovements ? 'Đã có nhập xuất: không đổi được (mỗi mã đi trọn một đường thuế). Cần đổi thì tạo mã con mới' : 'Có: hàng mua có hoá đơn, lên dữ liệu thuế. Không gửi: hàng / quà không hoá đơn'}>
            <label className="checkbox" style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 32 }}>
              <input type="checkbox" checked={v.variantCode !== 'internal' && v.sendToTax !== false} disabled={v.variantCode === 'internal' || Boolean(v.hasMovements)} onChange={(e) => set({ sendToTax: e.target.checked })} />
              <span>{v.variantCode === 'internal' ? 'Không (Nội bộ)' : v.sendToTax === false ? 'Không gửi' : 'Có'}{v.hasMovements && v.variantCode !== 'internal' ? <span className="muted"> · đã có nhập xuất, khoá</span> : null}</span>
            </label>
          </Field>
          {classes.type.length > 0 && <Field label="Loại hàng" tip="Để lọc và báo cáo, không làm đổi định khoản"><ListPicker items={pick('type')} value={v.typeCode ?? ''} onChange={(c) => set({ typeCode: c || null })} placeholder="Bấm để chọn" nameFirst /></Field>}
          <Field label="Barcode" tip="Nhiều mã cách nhau dấu /"><input className="input mono" value={v.barcode} onChange={(e) => set({ barcode: e.target.value })} /></Field>
          {(() => {
            // Có nhóm hàng và ngành / nhãn khớp cây nhóm: chỉ hiện (một chỗ khai — nhóm hàng); chưa khớp thì vẫn chọn tay được.
            const locked = Boolean(v.groupCode && skuHint && skuHint.industryCode === v.industryCode && skuHint.brandCode === v.brandCode);
            // Đã theo nhóm hàng thì ngành, nhãn chỉ lặp lại đường dẫn nhóm: ẩn cho gọn.
            if (locked) return null;
            return <>
              <Field label="Ngành hàng" hint={locked ? 'Theo nhóm hàng' : undefined}><ListPicker items={pick('industry')} value={v.industryCode ?? ''} onChange={(c) => set({ industryCode: c || null })} placeholder="Tự lấy khi chọn nhóm hàng" nameFirst disabled={locked} /></Field>
              <Field label="Nhãn hàng (Brand)" hint={locked ? 'Theo nhóm hàng — khuyến mại, hạn mức, thưởng theo nhãn dùng nhãn này' : undefined}><ListPicker items={pick('brand')} value={v.brandCode ?? ''} onChange={(c) => set({ brandCode: c || null })} placeholder="Tự lấy khi chọn nhóm hàng" nameFirst disabled={locked} /></Field>
            </>;
          })()}
          <Field label="Xuất xứ"><input className="input" value={v.origin} onChange={(e) => set({ origin: e.target.value })} /></Field>
          <Field label="Khối lượng (kg / ĐVT nhỏ nhất)"><input className="input num" value={v.weightKg ?? ''} onChange={(e) => set({ weightKg: parseNum(e.target.value) })} /></Field>
          <Field label="Ảnh (đường dẫn)" full>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <input className="input" value={v.imageUrl} onChange={(e) => { setImgBad(false); set({ imageUrl: e.target.value }); }} placeholder="https://…" style={{ flex: 1 }} />
              {v.imageUrl && !imgBad && <img src={v.imageUrl} alt="" onError={() => setImgBad(true)} style={{ height: 48, width: 48, objectFit: 'contain', border: '1px solid var(--line)', borderRadius: 4 }} />}
              {v.imageUrl && imgBad && <span className="neg" style={{ fontSize: 12 }}>Không tải được ảnh</span>}
            </div>
          </Field>
          <Field label="Mô tả" full><textarea className="input" rows={3} value={v.description} onChange={(e) => set({ description: e.target.value })} /></Field>
          <Field label="Ghi chú" full><input className="input" value={v.note} onChange={(e) => set({ note: e.target.value })} /></Field>
        </fieldset>
      )}

      {tab === 'units' && (
        <DvtQuyDoi units={v.units} onUnit={setUnit}
          onAdd={(u) => set({ units: [...v.units, u] })}
          onRemove={(i) => setV((x) => ({ ...x, units: x.units.filter((_, j) => j !== i), prices: x.prices.filter((p) => p.unit !== x.units[i]!.unit) }))} />
      )}
      {tab === 'prices' && <GiaBan units={v.units} prices={v.prices} lists={lists} shown={shownLists} setShown={setShownLists} setPrice={setPrice} />}

      {extraTabs.filter((t) => t.key === tab).map((t) => <t.Component key={t.key} sku={isNew ? '' : v.sku} name={v.name} units={v.units.map((u) => u.unit.trim()).filter(Boolean)} />)}

      {tab === 'status' && (
        <fieldset className="fgroup">
          <legend>Trạng thái bán / xuất</legend>
          <div className="full">
            {flag('isMain', 'Hàng chính', 'Bán theo giá bảng giá công ty, không lấy giá chi nhánh. Bỏ tích: ưu tiên giá chi nhánh rồi tới giá công ty.')}
            {flag('isUnder24m', 'Sữa cho trẻ dưới 24 tháng (Luật thuế)', 'Nghiêm cấm mọi chương trình khuyến mại cho mặt hàng này.')}
            {flag('noSale', 'Không được bán (vật tư chỉ nhập)', 'Không hiện ở màn bán hàng; chỉ nhập kho / dùng nội bộ.')}
            {flag('exportAdjust', 'Được xuất điều chỉnh dù vẫn bán (BIT1)', 'Cho phép lập phiếu xuất điều chỉnh với mặt hàng đang bán.')}
            {flag('isActive', 'Đang theo dõi (đang dùng)', 'Bỏ tích để ngừng mặt hàng (không xoá dữ liệu cũ).')}
          </div>
        </fieldset>
      )}

      {tab === 'acc' && (
        <fieldset className="fgroup">
          <legend>Kế toán</legend>
          <Field label="Thuế suất GTGT" hint={vatRate ? `Mã VAT ra ${v.taxOutCode} · vào ${v.taxInCode ?? '(trống)'}` : v.taxOutCode ? `Đang dùng mã riêng: ra ${v.taxOutCode} · vào ${v.taxInCode ?? '(trống)'} — sửa ở Mã thuế chi tiết` : 'Chưa khai thuế suất'}>
            <select className="select input" value={vatRate?.key ?? (v.taxOutCode ? 'other' : '')} onChange={(e) => {
              const r = VAT_RATES.find((x) => x.key === e.target.value);
              if (r) set({ taxOutCode: r.out, taxInCode: r.in }); else if (!e.target.value) set({ taxOutCode: null, taxInCode: null });
            }}>
              <option value="">(chưa khai)</option>
              {VAT_RATES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              {!vatRate && v.taxOutCode && <option value="other">Mã riêng: {v.taxOutCode}</option>}
            </select>
          </Field>
          <Field label="Nhóm hạch toán" hint="Quyết định tài khoản kho, giá vốn, doanh thu; trống = nhóm mặc định">
            <select className="select input" value={v.postingGroupCode ?? ''} onChange={(e) => set({ postingGroupCode: e.target.value || null })}>
              <option value="">(Nhóm mặc định)</option>{pgroups.map((g) => <option key={g.code} value={g.code}>{g.code} — {g.name}</option>)}
            </select>
          </Field>
          <div className="full">
            <button type="button" className="btn btn-xs" onClick={() => setTaxDetail((x) => !x)}>{taxDetail ? '▾' : '▸'} Mã thuế chi tiết (kế toán){v.exciseRate ? ` · TTĐB ${v.exciseRate}%` : ''}</button>
          </div>
          {taxDetail && (
            <>
              <Field label="Mã VAT ra"><select className="select input" value={v.taxOutCode ?? ''} onChange={(e) => set({ taxOutCode: e.target.value || null })}><option value="">(trống)</option>{taxes.filter((t) => t.direction === 'output' && (t.isActive || t.code === v.taxOutCode)).map((t) => <option key={t.code} value={t.code}>{t.code} — {t.name}</option>)}</select></Field>
              <Field label="Mã VAT vào"><select className="select input" value={v.taxInCode ?? ''} onChange={(e) => set({ taxInCode: e.target.value || null })}><option value="">(trống)</option>{taxes.filter((t) => t.direction === 'input' && (t.isActive || t.code === v.taxInCode)).map((t) => <option key={t.code} value={t.code}>{t.code} — {t.name}</option>)}</select></Field>
              <Field label="Thuế tiêu thụ đặc biệt (%)" hint="Chỉ hàng chịu thuế TTĐB (rượu, bia, nước ngọt có đường…). Sữa, bỉm, đồ dùng: để trống."><input className="input num" value={v.exciseRate ?? ''} onChange={(e) => set({ exciseRate: parseNum(e.target.value) })} /></Field>
            </>
          )}
        </fieldset>
      )}
      {v.isDraft && <div className="alert alert-warn full"><b>Nháp</b> — mặt hàng chưa kích hoạt, chưa dùng được trên chứng từ (cửa nạp giữ chứng từ ở Trạm kiểm tra với mã IN-ITEM-009). Sửa các lỗi chặn bên dưới, Ghi → tự kích hoạt.</div>}
      <WhyPanel findings={why.findings} onFix={(p) => set(p as Partial<FullProduct>)} />
      <WarnAckBox ack={ack} />
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
    </Modal>
    {renaming && <DoiMaModal sku={v.sku} onClose={() => setRenaming(false)} onDone={() => { setRenaming(false); onClose(); }} />}
    {merging && <GopMaModal sku={v.sku} onClose={() => setMerging(false)} onDone={() => { setMerging(false); onClose(); }} />}
    {addingChild && <ThemSanPhamCon parentSku={v.sku} parentName={v.name} parentNoSale={v.noSale} onClose={() => setAddingChild(false)} />}
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

/**
 * MÃ HÀNG CHA (họ mã 1 cấp): mã con trỏ về mã cha — mã kẹp quà / khuyến mại / chia giá / Z, B… của cùng sản phẩm (tự quét theo mã),
 * hoặc mã đặt tên khác nhưng bản chất là sản phẩm ấy (chọn tay). Phân tích đặt hàng cộng dồn cả họ vào mã cha. Mã cha thì liệt kê mã con.
 */
/**
 * Chỉ ở mặt hàng đã có (thêm mới luôn là mã cha; biến thể tạo bằng Thêm sản phẩm con). Mã cha: liệt kê mã con.
 * Mã chưa có cha: chọn tay để gom mã cũ của cùng sản phẩm vào mã cha (mã cũ có chữ cuối thì có nút gợi ý theo mã).
 */
function MaHangCha({ sku, value, onChange, kinds }: { sku: string; value: string | null; onChange: (v: string | null) => void; kinds?: Parameters<typeof VariantBadge>[0]['kinds'] }) {
  const m = /^(\d{9})([A-Z]{1,3})$/.exec(sku.trim().toUpperCase());
  const suggest = m && m[2] !== 'T' ? m[1]! : '';
  const pick = (v: string | null) => onChange(v);
  const kids = useQuery({ queryKey: ['products', 'children', sku], enabled: Boolean(sku), queryFn: () => api.get<{ sku: string; name: string; variantCode?: string }[]>('/api/v1/products', { parent: sku, pageSize: 200 }) });
  const list = kids.data ?? [];
  return (
    <Field label="Mã hàng cha" tip="Mã con gom vào mã cha: báo cáo, đặt hàng cộng dồn; sổ thuế ghi theo mã cha khi cần" hint={list.length ? undefined : value ? undefined : 'Trống = mặt hàng độc lập. Chỉ chọn khi đây là mã cũ của cùng sản phẩm, cần gom vào mã cha'}>
      {list.length ? (
        <div style={{ fontSize: 12.5 }} title="Mã này là mã cha — phân tích đặt hàng cộng dồn các mã con vào mã này">
          <b>Là mã cha của {list.length} mã:</b> {list.map((k) => <span key={k.sku} style={{ marginRight: 6, whiteSpace: 'nowrap' }}><span className="badge badge-gray" title={k.name}>{k.sku}</span> <VariantBadge code={k.variantCode} kinds={kinds} /></span>)}
        </div>
      ) : (
        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
          <div style={{ flex: 1 }}><ItemPicker value={value ?? ''} onChange={(c) => pick(c || null)} /></div>
          {suggest && value !== suggest && <button type="button" className="btn btn-sm" title="Gán mã cha theo mã (bỏ đuôi)" onClick={() => pick(suggest)}>Theo mã: {suggest}</button>}
          {value && <button type="button" className="btn btn-sm" title="Bỏ mã cha (không thuộc họ mã nào) — quét cha – con theo mã sẽ không gán lại" onClick={() => pick(null)}>Bỏ</button>}
        </div>
      )}
    </Field>
  );
}
