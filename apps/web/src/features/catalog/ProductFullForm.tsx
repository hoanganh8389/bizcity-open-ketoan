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
import { PRODUCT_TABS } from '../../phan-he/product-tabs';
import { useEnabledModules } from '../../layout/useAppMenu';
import { DvtQuyDoi, GiaBan } from './DvtGiaBan';
import { SKU_SUFFIXES, skuInfo, variantName } from '@ketoan/contracts/mua-hang';

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
  units: Unit[]; prices: Price[];
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
export function ProductFullForm({ sku, initial, initialSuffix = '', classes, groupPath, onClose, startTab, startEditing }: {
  sku: string | null; // null = thêm mới
  initial?: Partial<FullProduct>;
  /** Tạo mã biến thể: đuôi mã đặt sẵn (K, M, Q, T, Z…). */
  initialSuffix?: string;
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
  // Mã tự sinh theo nhóm (auto) hay người dùng gõ tay (không ghi đè mã gõ tay khi đổi nhóm). Đuôi mã: K/M/Q/T hoặc đuôi riêng.
  const [skuAuto, setSkuAuto] = useState(!initial?.sku);
  const [suffix, setSuffix] = useState(initialSuffix);
  const [variant, setVariant] = useState<string | null>(null);
  const [chooseVariant, setChooseVariant] = useState(false);
  const [otherSuffix, setOtherSuffix] = useState(false);
  const [help, setHelp] = useState(false);
  const [imgBad, setImgBad] = useState(false);
  const [taxDetail, setTaxDetail] = useState(false);
  const set = (p: Partial<FullProduct>) => setV((x) => ({ ...x, ...p }));

  const loaded = useQuery({ queryKey: ['catalog-product', sku], queryFn: () => api.get<FullProduct>(`/api/v1/catalog/products/${encodeURIComponent(sku!)}`), enabled: !isNew });
  const lists = useQuery({ queryKey: ['price-lists'], queryFn: () => api.get<PriceList[]>('/api/v1/catalog/price-lists'), staleTime: 60_000 }).data ?? [];
  const taxes = useQuery({ queryKey: ['tax-codes'], queryFn: () => api.get<TaxCode[]>('/api/v1/tax-codes'), staleTime: 60_000 }).data ?? [];
  const pgroups = useQuery({ queryKey: ['groups'], queryFn: () => api.get<PostingGroup[]>('/api/v1/posting/groups'), staleTime: 60_000 }).data ?? [];

  useEffect(() => {
    if (!loaded.data) return;
    const d = loaded.data;
    setV({ ...d, units: d.units.length ? d.units : [{ unit: d.unit || '', ratio: 1, isDefault: true, weightKg: null, note: '' }] });
  }, [loaded.data]);

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
  const baseOf = (x: string) => skuInfo(x).base || x;
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
      set({ ...(take ? { sku: r.sku + suffix } : {}), ...fromGroup(r) });
      if (take) setSkuAuto(true);
    } catch (e) { setSkuErr(errorText(e)); clearOld(); }
  };
  const pickGroup = (c: string) => { set({ groupCode: c || null }); void genSku(c || null); };
  const pickSuffix = (x: string) => { const sf = x.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3); setSuffix(sf); if (v.sku.trim()) set({ sku: baseOf(v.sku.trim()) + sf, ...(v.name.trim() && !suffix ? { name: variantName(v.name, sf) } : {}) }); };
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
  const save = useMutation({
    mutationFn: () => {
      const units = v.units.filter((u) => u.unit.trim()).map((u) => ({ unit: u.unit.trim(), ratio: Number(u.ratio), isDefault: u.isDefault, isPurchaseDefault: Boolean(u.isPurchaseDefault), weightKg: u.weightKg, note: u.note }));
      const unitNames = new Set(units.map((u) => u.unit));
      const prices = v.prices.filter((p) => unitNames.has(p.unit)).map((p) => ({ priceListCode: p.priceListCode, unit: p.unit, price: p.price, isDefaultUnit: p.isDefaultUnit, note: p.note }));
      const { sku: _s, unit: _u, units: _us, prices: _ps, ...rest } = v;
      return api.put<FullProduct>(`/api/v1/catalog/products/${encodeURIComponent(v.sku.trim())}${isNew ? '?new=1' : ''}`, { ...rest, units, prices });
    },
    onSuccess: () => {
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
        {!isNew && <button className="btn" data-view-ok style={{ marginRight: 'auto' }} title="Tạo mã mới = mã này + chữ đuôi (K chia giá, M khuyến mại, Q kẹp quà, T có tem, Z / B…): chép nhóm, nhãn, ĐVT, thuế; tên đặt theo quy định" onClick={() => setChooseVariant(true)}>Tạo mã biến thể…</button>}
        <button className="btn btn-primary" disabled={save.isPending || !v.sku.trim() || !v.name.trim()} onClick={() => save.mutate()}>Ghi</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <ErrorBox error={loaded.error ? errorText(loaded.error) : null} />
      <div className="tabs full" role="tablist" style={{ marginBottom: 8 }}>
        {tabBtn('info', 'Thông tin')}{tabBtn('units', `Đơn vị tính (${v.units.filter((u) => u.unit.trim()).length})`)}{tabBtn('status', 'Trạng thái')}{tabBtn('acc', 'Kế toán')}{extraTabs.map((t) => tabBtn(t.key, t.label))}{tabBtn('prices', 'Giá bán')}
        <span className="spacer" style={{ flex: 1 }} />
        <button type="button" className="btn btn-sm btn-help" onClick={() => setHelp(true)} title="Cách khai mặt hàng, ĐVT, giá, sinh mã hàng">? Hướng dẫn</button>
      </div>
      {help && <HelpDrawer guideKey="mat-hang" onClose={() => setHelp(false)} />}

      {tab === 'info' && (
        <fieldset className="fgroup">
          <legend>Thông tin mặt hàng</legend>
          <Field label="Nhóm hàng (ngành → nhãn → nhóm sản phẩm)" full hint="Chọn nhóm là xong: ngành, nhãn tự điền; mặt hàng mới tự sinh mã = ngành (2) + nhãn (3) + nhóm (1) + số thứ tự (3) — quà khuyến mại: Q + nhãn + nhóm + 4 số">
            <ListPicker items={pick('group')} value={v.groupCode ?? ''} onChange={pickGroup} placeholder="Gõ tên nhóm / nhãn để tìm — chọn tới nhóm sản phẩm (cấp 3)" nameFirst />
          </Field>
          <Field label="Mã hàng (*)" hint={skuErr || undefined}>
            <div className="row" style={{ gap: 4 }}>
              <input className="input mono" value={v.sku} disabled={!isNew} placeholder={isNew ? 'Chọn nhóm hàng là tự sinh — gõ tay được' : ''} onChange={(e) => { set({ sku: e.target.value.trim().toUpperCase() }); setSkuAuto(false); }} style={{ flex: 1 }} />
              {isNew && <select className="select input" style={{ width: 150 }} value={otherSuffix || (suffix && !SKU_SUFFIXES.some((x) => x.suffix === suffix)) ? '*' : suffix} onChange={(e) => { const x = e.target.value; setOtherSuffix(x === '*'); if (x !== '*') pickSuffix(x); }} title="Ký tự thứ 10 theo quy tắc mã hàng: K chia giá · M khuyến mại · Q kẹp quà · T có tem; hoặc đuôi riêng (Z, B…)">
                <option value="">Mã thường (9 ký tự)</option>
                <optgroup label="Đuôi chuẩn">{SKU_SUFFIXES.filter((x) => x.official).map((x) => <option key={x.suffix} value={x.suffix}>{x.label}</option>)}</optgroup>
                <optgroup label="Đuôi riêng đang dùng">{SKU_SUFFIXES.filter((x) => !x.official).map((x) => <option key={x.suffix} value={x.suffix}>{x.label}</option>)}</optgroup>
                <option value="*">Đuôi khác (gõ 1–3 chữ)…</option>
              </select>}
              {isNew && (otherSuffix || (suffix && !SKU_SUFFIXES.some((x) => x.suffix === suffix))) && <input className="input mono" style={{ width: 70 }} autoFocus placeholder="vd CB" maxLength={3} value={suffix} onChange={(e) => pickSuffix(e.target.value)} title="Đuôi riêng 1–3 chữ cái, ví dụ CB" />}
              {isNew && <button type="button" className="btn btn-sm" onClick={() => void genSku(v.groupCode, true)} title="Lấy mã kế tiếp theo nhóm hàng đã chọn (thay mã đang có)">Sinh mã</button>}
              <button type="button" className="btn btn-sm btn-help" onClick={() => setHelp(true)} title="Quy tắc mã hàng, mã biến thể, cách kiểm tra">?</button>
            </div>
            <MaHangGiaiThich sku={v.sku} hint={skuHint} auto={skuAuto} isNew={isNew} />
          </Field>
          <Field label="Barcode" hint="Nhiều mã cách nhau dấu /"><input className="input mono" value={v.barcode} onChange={(e) => set({ barcode: e.target.value })} /></Field>
          <MaHangCha sku={v.sku} isNew={isNew} value={v.parentSku ?? null} onChange={(parentSku) => set({ parentSku })} />
          <Field label="Tên hàng (*)" full><input className="input" value={v.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          {(() => {
            // Có nhóm hàng và ngành / nhãn khớp cây nhóm: chỉ hiện (một chỗ khai — nhóm hàng); chưa khớp thì vẫn chọn tay được.
            const locked = Boolean(v.groupCode && skuHint && skuHint.industryCode === v.industryCode && skuHint.brandCode === v.brandCode);
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
          {classes.type.length > 0 && <Field label="Loại hàng"><ListPicker items={pick('type')} value={v.typeCode ?? ''} onChange={(c) => set({ typeCode: c || null })} placeholder="Bấm để chọn" nameFirst /></Field>}
        </fieldset>
      )}
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
    </Modal>
    {chooseVariant && <ChonDuoiMa base={baseOf(v.sku)} name={v.name} onClose={() => setChooseVariant(false)} onPick={(sf) => { setChooseVariant(false); setVariant(sf); }} />}
    {/* Form mã biến thể đặt NGOÀI và SAU form đang xem: nằm trên, nhận phím; form xem khoá mọi ô / nút bên trong nó. */}
    {variant && <ProductFullForm sku={null} classes={classes} groupPath={groupPath} initialSuffix={variant} onClose={() => setVariant(null)}
      initial={{ ...v, sku: baseOf(v.sku) + variant, name: variantName(v.name, variant), barcode: '', prices: [] }} />}
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
        ? <span className="mh-warn">Mã không theo quy tắc mã hàng (9 ký tự: ngành 2 + nhãn 3 + nhóm 1 + số 3) — vẫn lưu được nếu là mã đặc biệt</span>
        : <>
          {chip(info.kind === 'gift' ? 'Quà' : 'Ngành', info.industry, src(0))}{chip('Nhãn', info.brand, src(1))}{chip('Nhóm', info.group, src(2))}{chip('Số', info.seq, 'Số tự sinh: số lớn nhất đang có của cùng tiền tố + 1')}
          {info.suffix && chip('Đuôi', `${info.suffix} · ${info.label}`, info.hint)}
          {info.kind === 'combo' && <span className="badge badge-warn" title={info.hint}>Combo (nhóm 8)</span>}
        </>}
      {isNew && <span className="muted">{auto ? '· tự sinh theo nhóm' : '· gõ tay'}</span>}
      {diff && <span className="mh-warn"> · khác tiền tố của nhóm đã chọn ({hint!.prefix})</span>}
    </div>
  );
}

/**
 * Chọn đuôi cho mã biến thể (mặt hàng đã có → nút "Tạo mã biến thể…"): bấm thẻ đuôi (chuẩn K / M / Q / T, đuôi riêng đang
 * dùng Z / B / D / C, hoặc gõ đuôi khác 1–3 chữ) → xem trước mã mới + tên theo mẫu; mã đã có thì báo ngay, không cho tạo trùng.
 * Enter = tạo, Esc = thoát.
 */
function ChonDuoiMa({ base, name, onPick, onClose }: { base: string; name: string; onPick: (sf: string) => void; onClose: () => void }) {
  const [pick, setPick] = useState('');
  const [other, setOther] = useState('');
  // Các mã đang có cùng gốc (base, baseK, baseZ…) để đánh dấu "đã có".
  const have = useQuery({ queryKey: ['catalog', 'variants', base], queryFn: async () => (await api.getPage<{ sku: string; name: string }[]>('/api/v1/products', { search: base, status: 'all', pageSize: 50 })).data.filter((p) => p.sku.toUpperCase().startsWith(base.toUpperCase())) });
  const exists = (sf: string) => have.data?.find((p) => p.sku.toUpperCase() === (base + sf).toUpperCase());
  const sf = (pick === '*' ? other : pick).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  const dup = sf ? exists(sf) : undefined;
  const ok = Boolean(sf) && !dup;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Enter' && ok) { e.preventDefault(); onPick(sf); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [ok, sf, onPick]);
  const card = (x: { suffix: string; label: string }) => {
    const d = exists(x.suffix);
    return (
      <button key={x.suffix} type="button" className={`duoi-card ${pick === x.suffix ? 'on' : ''} ${d ? 'has' : ''}`} onClick={() => setPick(x.suffix)} title={d ? `Đã có mã ${d.sku} — ${d.name}` : ''}>
        <b className="duoi-letter">{x.suffix}</b>
        <span className="duoi-label">{x.label.replace(/^[A-Z]+ — /, '')}</span>
        <span className="mono duoi-code">{base}{x.suffix}</span>
        {d && <span className="badge badge-gray">đã có</span>}
      </button>
    );
  };
  return (
    <Modal wide title={`Tạo mã biến thể từ ${base}`} onClose={onClose}
      footer={<>
        <span className="muted" style={{ marginRight: 'auto', fontSize: 12 }}>Mã mới chép nhóm, nhãn, ngành, ĐVT, thuế của {base}; giá bán, barcode để trống. Enter = tạo</span>
        <button className="btn btn-primary" disabled={!ok} onClick={() => onPick(sf)}>{sf ? `Tạo mã ${base}${sf}` : 'Chọn đuôi'}</button>
        <button className="btn" onClick={onClose}>Thoát</button></>}>
      <div className="full muted" style={{ fontSize: 12.5, marginBottom: 6 }}>Mã gốc <b className="mono">{base}</b> — {name}. Chọn chữ đuôi:</div>
      <div className="full duoi-group"><div className="duoi-title">Đuôi chuẩn</div><div className="duoi-grid">{SKU_SUFFIXES.filter((x) => x.official).map(card)}</div></div>
      <div className="full duoi-group"><div className="duoi-title">Đuôi riêng đang dùng</div><div className="duoi-grid">{SKU_SUFFIXES.filter((x) => !x.official).map(card)}
        <button type="button" className={`duoi-card ${pick === '*' ? 'on' : ''}`} onClick={() => setPick('*')}>
          <b className="duoi-letter">…</b><span className="duoi-label">Đuôi khác (1–3 chữ)</span>
          {pick === '*' && <input className="input mono" style={{ width: 80 }} autoFocus maxLength={3} placeholder="vd CB" value={other} onClick={(e) => e.stopPropagation()} onChange={(e) => setOther(e.target.value.toUpperCase())} />}
        </button>
      </div></div>
      {sf && (
        <div className={`full alert ${dup ? 'alert-bad' : 'alert-ok'}`} style={{ marginTop: 8 }}>
          {dup ? <>Mã <b className="mono">{dup.sku}</b> đã có ({dup.name}) — chọn đuôi khác.</>
            : <>Sẽ tạo <b className="mono">{base}{sf}</b> · tên <b>{variantName(name, sf)}</b> (sửa được trước khi Ghi)</>}
        </div>
      )}
      {(have.data?.length ?? 0) > 1 && <div className="full muted" style={{ fontSize: 12, marginTop: 6 }}>Các mã cùng gốc đang có: {have.data!.map((p) => p.sku).join(', ')}</div>}
    </Modal>
  );
}

/**
 * MÃ HÀNG CHA (họ mã 1 cấp): mã con trỏ về mã cha — mã kẹp quà / khuyến mại / chia giá / Z, B… của cùng sản phẩm (tự quét theo mã),
 * hoặc mã đặt tên khác nhưng bản chất là sản phẩm ấy (chọn tay). Phân tích đặt hàng cộng dồn cả họ vào mã cha. Mã cha thì liệt kê mã con.
 */
function MaHangCha({ sku, isNew, value, onChange }: { sku: string; isNew: boolean; value: string | null; onChange: (v: string | null) => void }) {
  const m = /^(\d{9})([A-Z]{1,3})$/.exec(sku.trim().toUpperCase());
  const suggest = m && m[2] !== 'T' ? m[1]! : '';
  // Mã mới: tự điền mã cha theo mã (bỏ đuôi) khi gõ mã — nhìn thấy ngay, bấm "Bỏ" / chọn mã khác thì thôi tự điền.
  const [touched, setTouched] = useState(false);
  const exists = useQuery({ queryKey: ['products', 'exists', suggest], enabled: isNew && Boolean(suggest), staleTime: 60_000,
    queryFn: async () => (await api.getPage<{ sku: string }[]>('/api/v1/products', { search: suggest, status: 'all', pageSize: 5 })).data });
  const ok = Boolean(exists.data?.some((p) => p.sku === suggest));
  useEffect(() => { if (isNew && !touched && (value ?? '') !== (ok ? suggest : '')) onChange(ok ? suggest : null); }, [isNew, touched, suggest, ok]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (v: string | null) => { setTouched(true); onChange(v); };
  const kids = useQuery({ queryKey: ['products', 'children', sku], enabled: Boolean(sku) && !isNew, queryFn: () => api.get<{ sku: string; name: string }[]>('/api/v1/products', { parent: sku, pageSize: 200 }) });
  const list = kids.data ?? [];
  return (
    <Field label="Mã hàng cha (họ mã)" hint={list.length ? undefined : 'Trống = không thuộc họ mã nào. Mã có đuôi (Z, Q, K, M, B…) tự nhận mã gốc; mã đặt tên khác nhưng là cùng sản phẩm thì chọn tay. Đuôi T (có tem) đặt riêng — chỉ gán khi muốn gộp.'}>
      {list.length ? (
        <div style={{ fontSize: 12.5 }} title="Mã này là mã cha — phân tích đặt hàng cộng dồn các mã con vào mã này">
          <b>Là mã cha của {list.length} mã:</b> {list.map((k) => <span key={k.sku} className="badge badge-gray" style={{ marginRight: 4 }} title={k.name}>{k.sku}</span>)}
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
