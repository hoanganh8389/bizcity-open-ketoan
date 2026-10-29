/**
 * ĐIỀN MẶT HÀNG CỦA NCC vào đơn đặt / phiếu nhập: NCC quản lý danh mục mã hàng → mở hộp này là có sẵn mọi mã của NCC
 * (đã khai + đã từng mua), kèm gợi ý:
 *   - số lượng: SL cần nhập theo Phân tích đặt hàng (công thức chi nhánh cha, MH02) → không có thì để trống, bấm "Điền SL lần trước";
 *   - ĐVT: chọn trong ĐVT của mặt hàng, mặc định = ĐVT NCC hay giao (Mặt hàng & giá mua) → ĐVT mua mặc định của mặt hàng;
 *   - đơn giá: giá mua cố định (của NCC, không có thì giá chung) đúng ĐVT, quy đổi theo tỉ lệ nếu khai ĐVT khác → không có thì
 *     đơn giá lần gần nhất (quy về loại giá của phiếu và ĐVT đang chọn).
 * Tích chọn / sửa số rồi "Thêm vào phiếu" — dòng SL 0 bỏ qua. Không tự động thì vẫn gõ tay từng dòng hoặc Nhập Excel.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { TAX_RATE, defaultUnitFor, priceFor, ratioOf, supplierItemsOf, type PDoc, type PLine } from '@ketoan/contracts/mua-hang';
import { Modal } from '@/components/ui';
import { purchaseApi, vnd, type MhData } from '../du-lieu';
import { useNeedOf } from '../ton-max/api';

const dmy = (iso?: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.')) || 0;

export function DienMatHang({ doc, data, onClose, onAdd }: { doc: PDoc; data: MhData; onClose: () => void; onAdd: (lines: PLine[]) => void }) {
  const sp = useQuery({ queryKey: ['mua-hang', 'supplier-products', doc.partnerCode, 'general'], queryFn: () => purchaseApi.supplierProducts({ partnerCode: doc.partnerCode, withGeneral: true }) });
  const prices = sp.data?.rows ?? [];
  const items = useMemo(() => supplierItemsOf(doc.partnerCode, sp.data?.rows ?? [], data.docs.filter((d) => d.id !== doc.id)), [doc.partnerCode, doc.id, data, sp.data]);
  const uq = useQuery({ queryKey: ['mua-hang', 'units', items.map((x) => x.sku).join(',')], queryFn: () => purchaseApi.units(items.map((x) => x.sku)), enabled: items.length > 0 });
  const unitsOf = (sku: string) => uq.data?.[sku] ?? sp.data?.units[sku] ?? [];
  const [unitPick, setUnitPick] = useState<Record<string, string>>({});
  const cat = useQuery({ queryKey: ['mua-hang', 'lookup', items.map((x) => x.sku).join(',')], queryFn: () => purchaseApi.lookupProducts(items.map((x) => x.sku)), enabled: items.length > 0 });
  const need = useNeedOf(doc.branchCode, true);
  // Tồn theo phân tích đặt hàng (chi nhánh cha): mã cha = cộng dồn cả họ mã; mã con (đuôi Z / Q / K…) = số riêng của mã đó.
  const stockOf = (sku: string): { kho: number; shop: number; note: string } | undefined => {
    const r = need.rows.get(sku);
    if (r) return { kho: r.tonKho, shop: r.tonShop, note: (r.members ?? []).length ? `Cả họ mã: ${r.members.map((m) => `${m.sku} kho ${m.tonKho} · shop ${m.tonShop}`).join('; ')}` : '' };
    for (const x of need.rows.values()) { const m = (x.members ?? []).find((y) => y.sku === sku); if (m) return { kho: m.tonKho, shop: m.tonShop, note: `Mã con của ${x.sku} — phân tích đặt hàng tính theo mã cha (cả họ: kho ${x.tonKho} · shop ${x.tonShop})` }; }
    return undefined;
  };
  const [qty, setQty] = useState<Record<string, number>>({});
  const [price, setPrice] = useState<Record<string, number>>({});
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const catOf = (sku: string) => cat.data?.find((p) => p.sku === sku);
  const basis = (p: number, inc: boolean, taxCode: string) => { const r = TAX_RATE[taxCode] ?? 0; return inc === doc.priceIncludesVat ? p : inc ? Math.round(p / (1 + r / 100)) : Math.round(p * (1 + r / 100)); };
  const rows = items.filter((x) => !search || `${x.sku} ${x.nccSku ?? ''} ${catOf(x.sku)?.name ?? x.name ?? ''}`.toLowerCase().includes(search.toLowerCase())).map((x) => {
    const c = catOf(x.sku);
    const tax = c?.taxInCode ?? 'V08';
    const us = unitsOf(x.sku);
    const unit = unitPick[x.sku] ?? defaultUnitFor(us, prices, doc.partnerCode, x.sku, x.unit || c?.unit || '');
    const f = priceFor(prices, { date: doc.docDate, partnerCode: doc.partnerCode, sku: x.sku, unit }, us);
    // Giá lần trước quy về ĐVT đang chọn (lần trước mua Thùng, giờ đặt Lốc → chia theo tỉ lệ).
    const last = x.lastPrice ? Math.round((x.lastPrice / ratioOf(us, x.lastUnit)) * ratioOf(us, unit)) : 0;
    const suggestedPrice = f ? basis(f.price, f.row.priceIncludesVat, tax) : last ? basis(last, Boolean(x.lastIncludesVat), tax) : 0;
    const s = need.rows.get(x.sku);
    return { ...x, name: c?.name ?? x.name ?? x.sku, unit, tax, us, priceSource: f ? (f.row.partnerCode ? `giá NCC / ${f.row.unit}` : `giá chung / ${f.row.unit}`) : x.lastPrice ? `lần ${x.lastDocNo}` : '', suggestedPrice, suggest: s && s.suggest > 0 ? Math.ceil(s.suggest / ratioOf(us, unit)) : undefined, lastQtyU: x.lastQty ? Math.ceil((x.lastQty * ratioOf(us, x.lastUnit)) / ratioOf(us, unit)) : undefined, reason: s ? `cần nhập ${s.need} (${s.parts.map((p) => `${p.signed < 0 ? '−' : '+'}${Math.abs(p.signed)} ${p.label}`).join(' ')})` : undefined, inCatalog: Boolean(c) };
  });
  const q = (sku: string, suggest?: number) => qty[sku] ?? suggest ?? 0;
  const chosen = rows.filter((r) => (pick[r.sku] ?? q(r.sku, r.suggest) > 0) && q(r.sku, r.suggest) > 0);
  const add = () => {
    onAdd(chosen.map((r, i) => ({ lineKey: `F${Date.now().toString(36)}${i}`, sku: r.sku, name: r.name, unit: r.unit, qty: q(r.sku, r.suggest), price: price[r.sku] ?? r.suggestedPrice, taxCode: r.tax, lineType: 'buy' })));
  };
  return (
    <Modal wide title={`Điền mặt hàng của NCC vào ${doc.kind === 'order' ? 'đơn đặt hàng' : 'phiếu'}`} onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={!chosen.length} onClick={add}>Thêm {chosen.length} dòng vào phiếu</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      {!items.length ? (
        <div className="full empty">NCC này chưa có danh mục mặt hàng và chưa mua lần nào. Khai ở <Link to={`/mua-hang/nha-cung-cap/${encodeURIComponent(doc.partnerCode)}?the=mat-hang`}>Hồ sơ NCC → Mặt hàng & giá mua</Link> (chọn nhiều mã hoặc nhập Excel), hoặc gõ tay từng dòng / Nhập Excel.</div>
      ) : <>
        <div className="full row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="input" style={{ width: 240 }} placeholder="Tìm mã, tên, mã bên NCC" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn btn-sm" onClick={() => setQty(Object.fromEntries(rows.map((r) => [r.sku, r.lastQtyU ?? 0])))}>Điền SL lần mua trước</button>
          {doc.kind === 'order' && <button className="btn btn-sm" onClick={() => setQty(Object.fromEntries(rows.map((r) => [r.sku, r.suggest ?? 0])))}>Điền SL cần nhập (phân tích)</button>}
          <button className="btn btn-sm" onClick={() => { setQty({}); setPick({}); }}>Xoá số đã nhập</button>
          <span className="muted" style={{ fontSize: 12 }}>{items.length} mã ({items.filter((x) => x.declared).length} đã khai, còn lại từ lịch sử mua) · đơn giá theo {doc.priceIncludesVat ? 'giá gồm thuế' : 'giá chưa thuế'} của phiếu</span>
        </div>
        <div className="full" style={{ maxHeight: 440, overflow: 'auto', marginTop: 6 }}>
          <table className="mh-mini">
            <thead><tr><th /><th>Mã</th><th>Tên hàng</th><th>ĐVT</th><th className="num" title="Tồn kho chi nhánh cha · tồn các shop (ĐVT nhỏ nhất). Mã cha cộng dồn cả họ mã (mã con đuôi Z / Q / K…) — rê chuột xem chi tiết">Tồn (kho · shop)</th><th>Lần mua gần nhất</th>{doc.kind === 'order' && <th className="num">Đề xuất</th>}<th className="num">Số lượng</th><th className="num">Đơn giá</th><th>Giá lấy từ</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.sku} className={q(r.sku, r.suggest) > 0 ? 'mh-row-pick' : ''}>
                  <td><input type="checkbox" checked={pick[r.sku] ?? q(r.sku, r.suggest) > 0} onChange={(e) => { setPick({ ...pick, [r.sku]: e.target.checked }); if (e.target.checked && !q(r.sku, r.suggest)) setQty({ ...qty, [r.sku]: r.lastQtyU || 1 }); }} /></td>
                  <td className="mono">{r.sku}{r.nccSku ? <div className="muted" style={{ fontSize: 10.5 }}>NCC: {r.nccSku}</div> : null}</td>
                  <td>{r.name}{!r.declared && <span className="badge badge-gray" style={{ marginLeft: 4 }} title="Chưa khai trong danh mục mặt hàng của NCC — lấy từ lịch sử mua">lịch sử</span>}{!r.inCatalog && cat.data && <span className="badge badge-warn" style={{ marginLeft: 4 }}>chưa có trong danh mục hàng</span>}</td>
                  <td>{r.us.length > 1 ? <select className="select input" style={{ width: 118 }} value={r.us.find((u) => u.unit.toLowerCase() === r.unit.toLowerCase())?.unit ?? r.unit} onChange={(e) => { setUnitPick({ ...unitPick, [r.sku]: e.target.value }); setPrice(({ [r.sku]: _x, ...rest }) => rest); setQty(({ [r.sku]: _q, ...rest }) => rest); }}>{r.us.map((u) => <option key={u.unit} value={u.unit}>{u.unit}{u.ratio !== 1 ? ` (×${u.ratio})` : ''}</option>)}</select> : r.unit}</td>
                  <td className="num" style={{ whiteSpace: 'nowrap', fontSize: 12 }} title={stockOf(r.sku)?.note || undefined}>{stockOf(r.sku) ? <>{stockOf(r.sku)!.kho.toLocaleString('vi-VN')} · {stockOf(r.sku)!.shop.toLocaleString('vi-VN')}{stockOf(r.sku)!.note ? <span className="muted"> *</span> : null}</> : <span className="muted">—</span>}</td>
                  <td style={{ fontSize: 11.5 }}>{r.lastDate ? `${dmy(r.lastDate)} · ${r.lastQty?.toLocaleString('vi-VN')} ${r.lastUnit ?? ''} × ${vnd(r.lastPrice)}` : <span className="muted">chưa mua</span>}</td>
                  {doc.kind === 'order' && <td className="num" title={r.reason}>{r.suggest ? <b>{r.suggest.toLocaleString('vi-VN')} {r.unit}</b> : <span className="muted">—</span>}</td>}
                  <td className="num"><input className="input num" style={{ width: 90 }} value={q(r.sku, r.suggest) || ''} placeholder="0" onChange={(e) => setQty({ ...qty, [r.sku]: num(e.target.value) })} /></td>
                  <td className="num"><input className="input num" style={{ width: 100 }} value={(price[r.sku] ?? r.suggestedPrice) ? (price[r.sku] ?? r.suggestedPrice).toLocaleString('vi-VN') : ''} onChange={(e) => setPrice({ ...price, [r.sku]: num(e.target.value) })} /></td>
                  <td className="muted" style={{ fontSize: 11 }}>{r.priceSource}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="full muted" style={{ fontSize: 12, marginTop: 6 }}>Dòng có số lượng &gt; 0 được chọn sẵn. Chiết khấu, hàng tặng, hạn trả phần mềm tự áp theo chính sách của NCC sau khi thêm. Thêm mã vào danh mục NCC: Hồ sơ NCC → Mặt hàng & giá mua.</div>
      </>}
    </Modal>
  );
}
