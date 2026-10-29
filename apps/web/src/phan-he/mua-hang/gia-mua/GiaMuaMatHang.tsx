/**
 * Thẻ "Mua hàng" trong form Mặt hàng — 4 khối:
 *   ① Giá mua riêng của sản phẩm (tím, tham khảo): giá cố định riêng cho mã (supplier_products, NCC trống), đặt cạnh giá vốn bình quân
 *      và giá nhập gần nhất để so. NCC nào chưa khai giá riêng thì phiếu nhập so với giá này. Đổi giá = thêm hiệu lực mới
 *      (giữ lịch sử).
 *   ② Giá mua theo từng nhà cung cấp (xanh lá): cùng bảng "Mặt hàng & giá mua" ở hồ sơ NCC (BangGiaMua).
 *   ③ Tồn max theo chi nhánh – kho (cam, cùng bảng với màn Tồn max MH16) · ④ Các lần nhập gần nhất.
 * ĐVT và tỉ lệ khai ở thẻ "Đơn vị tính"; giá bán ở thẻ "Giá bán".
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { TAX_RATE, ratioOf, type ProductUnit, type SupplierProduct } from '@ketoan/contracts/mua-hang';
import { api, errorText } from '@/lib/api';
import { P, purchaseApi, today, useMuaHang, useNames, vnd } from '../du-lieu';
import { dmy } from '../chung';
import { TonMinMaxForm } from './TonMinMaxForm';
import { stockApi, type LevelRow } from '../ton-max/api';
import { BangGiaMua } from '../thanh-phan/BangGiaMua';
import '../mua-hang.css';

type Hist = { date: string; partnerCode: string; docNo: string; unitPrice: number; includesVat: boolean; unit?: string; qty?: number };
const num = (s: string) => { const v = s.replace(/\./g, '').replace(',', '.').trim(); return v === '' ? null : Number(v) || 0; };
const pct = (a: number, b: number) => Math.round(((a - b) / b) * 1000) / 10;

export function GiaMuaMatHang({ sku, name }: { sku: string; name: string; units: string[] }) {
  const { data, refresh } = useMuaHang();
  const names = useNames();
  const [editing, setEditing] = useState<LevelRow | 'new' | null>(null);
  const lv = useQuery({ queryKey: ['ton-max', 'levels', sku], enabled: Boolean(sku), queryFn: () => stockApi.levels({ skus: [sku] }) });
  const hist = useQuery({ queryKey: ['mua-hang', 'price-history', sku], enabled: Boolean(sku), queryFn: () => api.get<Hist[]>(`${P}/price-history/${encodeURIComponent(sku)}`, { limit: 10 }) });
  if (!sku) return <div className="muted">Ghi mặt hàng trước rồi mới khai mua hàng.</div>;
  if (!data) return <div className="muted">Đang tải…</div>;

  // data-view-ok: mỗi khối có nút sửa riêng (Sửa giá mua riêng, Sửa bảng…) nên không phải bấm "Sửa" cả hộp thoại trước.
  return (
    <div className="full blk-stack" data-view-ok>
      <GiaThamKhao sku={sku} hist={hist.data ?? []} />
      <section className="blk blk-green">
        <header><div><b>② Giá mua theo từng nhà cung cấp</b><span>NCC nào bán mã này, theo ĐVT nào, giá riêng bao nhiêu — cùng bảng với hồ sơ NCC.</span></div></header>
        <div className="blk-body"><BangGiaMua sku={sku} skuName={name} data={data} onChanged={() => void refresh()} /></div>
      </section>
      <section className="blk blk-orange">
        <header><div><b>③ Tồn max theo chi nhánh – kho</b><span>Mức hàng muốn có ở từng shop / kho: shop dưới max thì được chia thêm (MH19), kho dưới max thì tính vào cần nhập (MH02).</span></div>
          <span className="row" style={{ gap: 6 }}><Link className="btn btn-sm" to={`/mua-hang/ton-max?sku=${encodeURIComponent(sku)}`}>Xem mọi shop (MH16)</Link><button type="button" className="btn btn-sm" onClick={() => setEditing('new')}>+ Thêm tồn max</button></span></header>
        <div className="blk-body">
          <table className="mh-mini">
            <thead><tr><th>Chi nhánh / shop</th><th>Kho</th><th className="num">Tồn max</th><th className="num">Tồn min</th><th>Nguồn</th><th /></tr></thead>
            <tbody>
              {(lv.data ?? []).map((l) => <tr key={`${l.branchCode}|${l.warehouseCode}`}><td>{l.branchCode} · {names.branchName(l.branchCode)}</td><td className="mono">{l.warehouseCode}</td><td className="num"><b>{l.max.toLocaleString('vi-VN')}</b></td><td className="num">{l.min ? l.min.toLocaleString('vi-VN') : ''}</td><td className="muted" style={{ fontSize: 11.5 }}>{l.source === 'request' ? 'phiếu đăng ký' : l.source === 'import' ? 'nhập Excel' : 'khai tay'} · {l.updatedBy}</td><td><button type="button" className="btn btn-xs" onClick={() => setEditing(l)}>Mở</button></td></tr>)}
              {!lv.isLoading && !(lv.data ?? []).length && <tr><td colSpan={6} className="muted">Chưa khai.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className="blk blk-blue">
        <header><div><b>④ Các lần nhập gần nhất</b><span>Đơn giá thực tế sau chiết khấu.</span></div></header>
        <div className="blk-body">
          <table className="mh-mini">
            <thead><tr><th>Ngày</th><th>Phiếu</th><th>Nhà cung cấp</th><th>ĐVT</th><th className="num">SL</th><th className="num">Đơn giá thực tế</th></tr></thead>
            <tbody>
              {(hist.data ?? []).map((h, i) => <tr key={i}><td>{dmy(h.date)}</td><td className="mono">{h.docNo}</td><td>{names.partnerName(h.partnerCode)}</td><td>{h.unit ?? ''}</td><td className="num">{h.qty?.toLocaleString('vi-VN') ?? ''}</td><td className="num">{vnd(h.unitPrice)} <span className="muted" style={{ fontSize: 11 }}>{h.includesVat ? 'gồm thuế' : 'chưa thuế'}</span></td></tr>)}
              {!hist.isLoading && !(hist.data ?? []).length && <tr><td colSpan={6} className="muted">Chưa nhập mã này lần nào.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {editing && <TonMinMaxForm sku={sku} name={name} value={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void lv.refetch(); }} />}
    </div>
  );
}

/**
 * ① Giá mua riêng của sản phẩm (tham khảo): một giá cố định cho mã (theo một ĐVT), so ngay với giá vốn bình quân và giá nhập gần nhất
 * (cùng quy về ĐVT đang xem, giá chưa thuế). Bấm "Sửa" mới sửa; đổi giá từ ngày khác = thêm hiệu lực mới, giữ dòng cũ làm lịch sử.
 */
function GiaThamKhao({ sku, hist }: { sku: string; hist: Hist[] }) {
  const q = useQuery({ queryKey: ['mua-hang', 'supplier-products', '', sku], queryFn: () => purchaseApi.supplierProducts({ sku }) });
  const cost = useQuery({ queryKey: ['mua-hang', 'product-cost', sku], queryFn: () => purchaseApi.productCost(sku) });
  const prod = useQuery({ queryKey: ['catalog-product', sku, 'tax'], queryFn: () => api.get<{ taxInCode: string | null }>(`/api/v1/catalog/products/${encodeURIComponent(sku)}`) });
  const [form, setForm] = useState<Partial<SupplierProduct> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const units: ProductUnit[] = q.data?.units[sku] ?? [];
  const base = units.find((u) => u.ratio === 1)?.unit ?? '';
  const rate = TAX_RATE[prod.data?.taxInCode ?? 'V08'] ?? 0;
  const general = (q.data?.rows ?? []).filter((r) => !r.partnerCode).sort((a, b) => (b.validFrom ?? '').localeCompare(a.validFrom ?? ''));
  const d = today();
  const cur = general.find((r) => r.isActive && r.price !== null && r.price !== undefined && (!r.validFrom || r.validFrom <= d) && (!r.validTo || r.validTo >= d));
  const showUnit = cur?.unit ?? units.find((u) => u.isPurchaseDefault)?.unit ?? base;
  const r = ratioOf(units, showUnit) || 1;
  // Mọi số so sánh: chưa thuế, theo ĐVT đang xem.
  const net = (p: number, inc: boolean) => (inc ? p / (1 + rate / 100) : p);
  const refNet = cur ? net(Number(cur.price), cur.priceIncludesVat) : null;
  const avg = cost.data?.monthly ? cost.data.monthly.unitCost * r : null;
  const now = cost.data?.current ? cost.data.current.unitCost * r : null;
  const last = hist[0] ? net(hist[0].unitPrice, hist[0].includesVat) / (ratioOf(units, hist[0].unit) || 1) * r : null;
  const card = (label: string, v: number | null, sub: string) => (
    <div className="gtk-card">
      <div className="gtk-l">{label}</div>
      <div className="gtk-v">{v !== null ? vnd(Math.round(v)) : <span className="muted">—</span>}<small> / {showUnit}</small></div>
      <div className="gtk-s">{sub}{v !== null && refNet ? <b className={Math.abs(pct(v, refNet)) > 2 ? 'mh-warn' : 'mh-ok'}> · {pct(v, refNet) > 0 ? '+' : ''}{pct(v, refNet)}% so với giá mua riêng</b> : null}</div>
    </div>
  );
  const save = async () => {
    if (!form?.unit || !(Number(form.price) > 0)) { setMsg({ ok: false, text: 'Chọn ĐVT và nhập giá lớn hơn 0' }); return; }
    setMsg(null);
    try {
      await purchaseApi.saveSupplierProducts([{ partnerCode: null, sku, unit: form.unit, price: Number(form.price), priceIncludesVat: Boolean(form.priceIncludesVat), warnPct: Number(form.warnPct ?? 2), validFrom: form.validFrom || undefined, isActive: true, note: form.note ?? '' }]);
      setForm(null); setMsg({ ok: true, text: 'Đã lưu giá mua riêng của sản phẩm' }); await q.refetch();
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); }
  };
  const start = (fill?: number) => setForm({ unit: showUnit, price: fill !== undefined ? Math.round(fill) : cur?.price ?? null, priceIncludesVat: fill !== undefined ? false : cur?.priceIncludesVat ?? false, warnPct: cur?.warnPct ?? 2, validFrom: cur ? d : undefined, note: '' });

  return (
    <section className="blk blk-purple">
      <header>
        <div><b>① Giá mua riêng của sản phẩm</b><span>Giá mua cố định (tham khảo) cho mã này — có giá vốn chuẩn thì điền vào đây; NCC chưa khai giá riêng thì phiếu nhập so với giá này.</span></div>
        {!form && <button type="button" className="btn btn-sm btn-primary" onClick={() => start()}>{cur ? 'Sửa giá mua riêng' : 'Khai giá mua riêng'}</button>}
      </header>
      <div className="blk-body">
        {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'}`} style={{ marginBottom: 8 }}>{msg.text}</div>}
        {!form ? (
          <div className="gtk-grid">
            <div className="gtk-card gtk-main">
              <div className="gtk-l">Giá mua riêng hiện hành</div>
              {cur ? <>
                <div className="gtk-v">{vnd(Number(cur.price))}<small> / {cur.unit} · {cur.priceIncludesVat ? 'gồm thuế' : 'chưa thuế'}</small></div>
                <div className="gtk-s">{cur.unit !== base && base ? `= ${vnd(Math.round(Number(cur.price) / r))} / ${base} · ` : ''}hiệu lực từ {dmy(cur.validFrom) || 'trước đây'}{cur.updatedBy ? ` · ${cur.updatedBy}` : ''}</div>
              </> : <div className="gtk-s">Chưa khai. Bấm <b>Khai giá mua riêng</b> — có thể lấy theo giá vốn bình quân hoặc giá nhập gần nhất.</div>}
            </div>
            {card(`Giá vốn bình quân${cost.data?.monthly ? ` tháng ${cost.data.monthly.period.slice(5)}/${cost.data.monthly.period.slice(0, 4)}` : ''}`, avg, cost.data?.monthly ? 'chưa thuế' : 'chưa tính giá vốn tháng')}
            {card('Giá vốn tạm tính (tồn hiện tại)', now, cost.data?.current ? `tồn ${cost.data.current.qty.toLocaleString('vi-VN')} ${base}` : 'không còn tồn')}
            {card('Giá nhập gần nhất', last, hist[0] ? `${dmy(hist[0].date)} · ${hist[0].docNo}` : 'chưa nhập lần nào')}
          </div>
        ) : (
          <div className="gtk-form">
            <label>ĐVT<select className="select input" value={form.unit ?? ''} onChange={(e) => setForm({ ...form, unit: e.target.value })}>{units.map((u) => <option key={u.unit} value={u.unit}>{u.unit}{u.ratio !== 1 ? ` (×${u.ratio})` : ''}</option>)}</select></label>
            <label>Giá mua<input className="input num" value={form.price === null || form.price === undefined ? '' : Number(form.price).toLocaleString('vi-VN')} onChange={(e) => setForm({ ...form, price: num(e.target.value) })} autoFocus /></label>
            <label>Loại giá<select className="select input" value={form.priceIncludesVat ? '1' : '0'} onChange={(e) => setForm({ ...form, priceIncludesVat: e.target.value === '1' })}><option value="0">Chưa thuế</option><option value="1">Gồm thuế</option></select></label>
            <label>Hiệu lực từ<input className="input" type="date" value={form.validFrom ?? ''} onChange={(e) => setForm({ ...form, validFrom: e.target.value || undefined })} /></label>
            <div className="gtk-quick">
              <span className="muted">Lấy nhanh (chưa thuế, theo {form.unit}):</span>
              {cost.data?.monthly && <button type="button" className="btn btn-xs" onClick={() => setForm({ ...form, price: Math.round(cost.data!.monthly!.unitCost * (ratioOf(units, form.unit) || 1)), priceIncludesVat: false })}>Giá vốn bình quân</button>}
              {hist[0] && <button type="button" className="btn btn-xs" onClick={() => setForm({ ...form, price: Math.round(net(hist[0]!.unitPrice, hist[0]!.includesVat) / (ratioOf(units, hist[0]!.unit) || 1) * (ratioOf(units, form.unit) || 1)), priceIncludesVat: false })}>Giá nhập gần nhất</button>}
            </div>
            <div className="gtk-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()}>Lưu giá mua riêng</button>
              <button type="button" className="btn btn-sm" onClick={() => { setForm(null); setMsg(null); }}>Huỷ</button>
              <span className="muted" style={{ fontSize: 12 }}>{cur && form.validFrom && form.validFrom !== cur.validFrom ? `Giá cũ (từ ${dmy(cur.validFrom) || 'trước đây'}) giữ làm lịch sử.` : 'Cùng ngày hiệu lực thì ghi đè giá hiện hành.'}</span>
            </div>
          </div>
        )}
        {general.length > 1 && (
          <details style={{ marginTop: 8 }}>
            <summary className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>Lịch sử giá mua riêng ({general.length} lần)</summary>
            <table className="mh-mini" style={{ marginTop: 4 }}>
              <thead><tr><th>Hiệu lực từ</th><th>ĐVT</th><th className="num">Giá</th><th>Loại giá</th><th>Người sửa</th></tr></thead>
              <tbody>{general.map((g) => <tr key={g.id} className={g === cur ? 'mh-row-pick' : ''}><td>{dmy(g.validFrom) || 'trước đây'}</td><td>{g.unit}</td><td className="num">{g.price !== null && g.price !== undefined ? vnd(Number(g.price)) : ''}</td><td>{g.priceIncludesVat ? 'gồm thuế' : 'chưa thuế'}</td><td>{g.updatedBy}</td></tr>)}</tbody>
            </table>
          </details>
        )}
      </div>
    </section>
  );
}
