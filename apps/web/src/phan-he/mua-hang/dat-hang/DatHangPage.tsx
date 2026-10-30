/**
 * PHÂN TÍCH ĐẶT HÀNG (MH02) — theo công thức của chi nhánh cha (MH18): mỗi mã một dòng, nhóm theo NHÃN + NCC
 * (dòng tiêu đề kiểu "Nutricare │ NC100625 – Công ty …"), các cột tồn tô màu như bảng phân tích quen dùng:
 *   SL cần nhập (cam) · BH tháng liền kề (tham khảo) · Doanh số N ngày · Tồn max kho · Tồn kho (vàng) · Hàng đi đường ·
 *   SL mua chưa nhập kho (xanh: đơn đặt đang mở của MỌI NCC, trừ để không đặt trùng) · Tồn max shop · Tồn shop.
 * Lọc nhanh mã cần nhập / đang dư; bấm SL cần nhập xem "vì sao ra số này". Chọn dòng → Lập đơn đặt: mỗi NCC một đơn nháp,
 * SL gợi ý làm tròn theo thùng (chọn lại xuống / lên), mang ghi chú mặt hàng NCC, quy cách, số liệu tồn để in đơn.
 */
import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, ShoppingCart } from 'lucide-react';
import type { PDoc, PLine } from '@ketoan/contracts/mua-hang';
import { PageHeader } from '@/components/PageHeader';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ErrorBox, Loading, Modal } from '@/components/ui';
import { errorText } from '@/lib/api';
import { purchaseApi, today, useNames } from '../du-lieu';
import { factsText, fold, num, qtyFmt, stockApi, stockSnapshot, useHierarchy, type AnalysisRow } from '../ton-max/api';
import { ChonChiNhanhCha, ChuaPhanCap, KhoiSo } from '../ton-max/chung';
import { roundPrice } from '@/lib/format';
import '../mua-hang.css';

type Row = AnalysisRow & { _group?: string; _key: string };
type Quick = '' | 'need' | 'over' | 'pending' | 'nopartner';

export function DatHangPage() {
  const qc = useQueryClient();
  const names = useNames();
  const h = useHierarchy();
  const [parent, setParent] = useState('');
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get('ncc') ?? '');
  const [quick, setQuick] = useState<Quick>('need');
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [buy, setBuy] = useState<Record<string, number>>({});
  const [why, setWhy] = useState<AnalysisRow | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: React.ReactNode } | null>(null);
  const [busy, setBusy] = useState(false);
  const exportRef = useRef<(() => void) | null>(null);
  const q = useQuery({ queryKey: ['ton-max', 'analysis', parent], enabled: Boolean(parent), queryFn: () => stockApi.analysis(parent) });
  const data = q.data?.rows ?? [];
  const banDays = q.data?.formula.terms.find((t) => t.key === 'banShop')?.days ?? 7;
  const rows = useMemo(() => {
    const f = fold(search.trim());
    const list = data.filter((r) => (!f || fold(`${r.sku} ${r.name} ${r.barcode} ${r.partnerCode} ${r.partnerName} ${r.brandName} ${r.nccSku} ${(r.members ?? []).map((m) => `${m.sku} ${m.name}`).join(' ')}`).includes(f))
      && (quick === '' || (quick === 'need' ? r.need > 0 : quick === 'over' ? r.need < 0 : quick === 'pending' ? r.dangDat > 0 : !r.partnerCode)));
    // Dòng tiêu đề nhóm: nhãn + NCC (giữ thứ tự máy chủ đã sắp).
    const out: Row[] = [];
    let last = '';
    for (const r of list) {
      const g = `${r.brandName || 'Chưa có nhãn'}|${r.partnerCode}`;
      if (g !== last) { out.push({ ...r, _group: g, _key: `g:${g}:${out.length}` }); last = g; }
      out.push({ ...r, _key: r.sku });
    }
    return out;
  }, [data, search, quick]);
  const qtyOf = (r: AnalysisRow) => buy[r.sku] ?? r.suggest;
  const chosen = data.filter((r) => sel[r.sku] && qtyOf(r) > 0);
  const stats = { all: data.length, need: data.filter((r) => r.need > 0).length, over: data.filter((r) => r.need < 0).length, pending: data.filter((r) => r.dangDat > 0).length, nopartner: data.filter((r) => !r.partnerCode).length };
  const money = chosen.reduce((s, r) => s + qtyOf(r) * (r.price ?? 0), 0);

  const cols: Column<Row>[] = [
    { key: 'pick', header: <input type="checkbox" title="Chọn mọi mã cần nhập đang hiện" checked={rows.some((r) => !r._group && r.need > 0) && rows.filter((r) => !r._group && r.need > 0).every((r) => sel[r.sku])} onChange={(e) => setSel((x) => ({ ...x, ...Object.fromEntries(rows.filter((r) => !r._group && r.need > 0).map((r) => [r.sku, e.target.checked])) }))} />, title: 'Chọn', width: 34, noFilter: true, noSort: true,
      render: (r) => <input type="checkbox" checked={Boolean(sel[r.sku])} onChange={(e) => setSel({ ...sel, [r.sku]: e.target.checked })} /> },
    { key: 'sku', header: 'Mã hàng', type: 'code', width: 96 },
    { key: 'name', header: 'Tên hàng', width: 260, value: (r) => r.name + ((r.members ?? []).length ? ` — gồm ${r.members.map((m) => m.sku).join(', ')}` : ''),
      render: (r) => <span title={r.nccName ? `Tên bên NCC: ${r.nccName}` : undefined}>{r.name}{(r.members ?? []).length > 0 && (
        // Họ mã: số của dòng đã cộng dồn mọi mã con — chi tiết từng mã để người mua biết hàng tặng / kẹp quà còn bao nhiêu.
        <span className="tm-fam" title="Số của dòng đã cộng dồn cả họ mã (mã chính + mã con có đuôi)">{r.members.map((m) => (
          <span key={m.sku} className="tm-fam-row"><b className="mono">{m.sku}</b> {m.kind}: {factsText(m, banDays)}</span>))}</span>)}</span> },
    { key: 'price', header: 'Đơn giá chưa VAT', type: 'price', width: 92 },
    { key: 'promo', header: 'CTKM', width: 80, render: (r) => (r.promo ? <span title={r.promo} style={{ fontSize: 11.5 }}>{r.promo}</span> : '-') },
    { key: 'baseUnit', header: 'ĐVT', width: 56, title: 'ĐVT nhỏ nhất (tỉ lệ 1) — các cột số lượng của màn này đều theo ĐVT này; cột Quy cách cho biết 1 thùng bao nhiêu' },
    { key: 'need', header: 'SL cần nhập', type: 'qty', width: 92, showZero: true, className: 'tm-need', bold: true, title: 'Số lượng cần nhập tháng này (theo công thức), theo ĐVT nhỏ nhất',
      render: (r) => <button className="tm-opt" style={{ border: 0, background: 'transparent', fontWeight: 800, color: r.need < 0 ? '#b45309' : undefined }} title="Bấm xem vì sao ra số này" onClick={() => setWhy(r)}>{r.need < 0 ? `(${qtyFmt(-r.need)})` : qtyFmt(r.need)}</button> },
    { key: 'banThangTruoc', header: 'BH tháng liền kề', type: 'qty', width: 82, className: 'tm-ref', title: 'Bán tháng trước của mọi shop — tham khảo' },
    { key: 'banShop', header: `Doanh số ${banDays} ngày`, type: 'qty', width: 82, className: 'tm-ref', title: `Bán ${banDays} ngày gần nhất của mọi shop (phần dự phòng)` },
    { key: 'maxKho', header: 'Tồn max kho', type: 'qty', width: 80, className: 'tm-ref' },
    { key: 'tonKho', header: 'Tồn kho', type: 'qty', width: 80, className: 'tm-stock', showZero: true },
    { key: 'diDuong', header: 'Hàng đang đi đường', type: 'qty', width: 82, value: (r) => r.diDuongKho + r.diDuongShop, render: (r) => <span title={`Về kho: ${qtyFmt(r.diDuongKho)} · xuống shop: ${qtyFmt(r.diDuongShop)}`}>{qtyFmt(r.diDuongKho + r.diDuongShop) || ''}</span> },
    { key: 'dangDat', header: 'SL mua chưa nhập kho', type: 'qty', width: 86, className: 'tm-pend', render: (r) => (r.dangDat ? <span title={r.orders.map((o) => `${o.docNo} (${o.partnerCode}, ${o.date}) còn ${qtyFmt(o.remaining)}`).join('\n')}>{qtyFmt(r.dangDat)}</span> : '') },
    { key: 'maxShop', header: 'Tồn max shop', type: 'qty', width: 80, className: 'tm-stock', render: (r) => <span title={`${r.shopsWithMax} shop có max, ${r.shopsBelowMax} shop đang dưới max`}>{qtyFmt(r.maxShop)}</span> },
    { key: 'tonShop', header: 'Tồn shop', type: 'qty', width: 80 },
    { key: 'buy', header: 'SL đặt', type: 'qty', width: 150, value: (r) => qtyOf(r), title: 'SL đặt (gợi ý làm tròn theo thùng — bấm số để chọn)',
      render: (r) => (r.need > 0 || buy[r.sku] ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap' }}>
        <input className={`tm-input${buy[r.sku] !== undefined ? ' dirty' : ''}`} style={{ width: 62 }} value={qtyOf(r) || ''} onChange={(e) => { setBuy({ ...buy, [r.sku]: num(e.target.value) }); setSel({ ...sel, [r.sku]: true }); }} />
        {r.options.map((o) => <button key={o} className={`tm-opt${qtyOf(r) === o ? ' on' : ''}`} title={r.pack ? `${o / r.pack} ${r.packUnit}` : ''} onClick={() => { setBuy({ ...buy, [r.sku]: o }); setSel({ ...sel, [r.sku]: true }); }}>{qtyFmt(o)}</button>)}
      </span> : '') },
    { key: 'pack', header: 'Quy cách', width: 72, value: (r) => r.pack ?? 0, render: (r) => (r.pack ? `${r.pack}/${r.packUnit}` : r.baseUnit) },
    { key: 'partnerCode', header: 'NCC', type: 'code', width: 100, hidden: true },
    { key: 'partnerSource', header: 'NCC chọn theo', width: 110, title: 'Mã có lần nhập → NCC lần nhập gần nhất; chưa nhập lần nào → NCC có bảng giá đang hiệu lực mới nhất (hồ sơ NCC → Mặt hàng & giá mua)', value: (r) => (r.partnerSource === 'lan_nhap' ? 'lần nhập gần nhất' : r.partnerSource === 'bang_gia' ? 'bảng giá NCC' : 'chưa rõ') + (r.nccCount > 1 ? ` · ${r.nccCount} NCC` : ''),
      render: (r) => <span style={{ fontSize: 11.5 }} className={r.partnerSource ? '' : 'mh-bad'} title={r.nccCount > 1 ? `Có ${r.nccCount} NCC khai bán mã này — đang chọn ${r.partnerCode}` : undefined}>{r.partnerSource === 'lan_nhap' ? 'lần nhập gần nhất' : r.partnerSource === 'bang_gia' ? 'bảng giá NCC' : 'chưa rõ'}{r.nccCount > 1 ? <b> · {r.nccCount} NCC</b> : null}</span> },
    { key: 'brandName', header: 'Nhãn', width: 110, hidden: true },
    { key: 'nccNote', header: 'Ghi chú NCC', width: 140, hidden: true },
  ];

  const makeOrders = async () => {
    const byNcc = new Map<string, AnalysisRow[]>();
    for (const r of chosen) byNcc.set(r.partnerCode, [...(byNcc.get(r.partnerCode) ?? []), r]);
    if (byNcc.has('')) { setMsg({ ok: false, text: `${byNcc.get('')!.length} mã chưa rõ NCC (chưa nhập lần nào, chưa khai NCC bán mã này) — khai ở hồ sơ NCC → Mặt hàng & giá mua, hoặc bỏ chọn.` }); return; }
    setBusy(true); setMsg(null);
    try {
      const made: { id: string; docNo: string; ncc: string; n: number }[] = [];
      for (const [ncc, list] of byNcc) {
        const lines: PLine[] = list.map((r, i) => {
          const qty = qtyOf(r);
          const asPack = r.pack && r.pack > 1 && qty % r.pack === 0;
          return {
            lineKey: `A${i}${Date.now().toString(36)}`, sku: r.sku, name: r.name, unit: asPack ? r.packUnit! : r.baseUnit, qty: asPack ? qty / r.pack! : qty,
            price: roundPrice((r.price ?? 0) * (asPack ? r.pack! : 1)), taxCode: r.taxCode || 'V08', lineType: 'buy', note: r.nccNote || undefined, pack: r.pack, barcode: r.barcode || undefined, nccSku: r.nccSku || undefined, nccName: r.nccName || undefined,
            // Chụp số liệu tồn lúc lập đơn (cả họ mã) — lưu cùng dòng đơn.
            ...stockSnapshot(new Map([[r.sku, r]]), r.sku),
          };
        });
        const doc: PDoc = { id: `new-${Date.now()}`, kind: 'order', status: 'draft', docNo: '', docDate: today(), branchCode: parent, partnerCode: ncc, priceIncludesVat: false, lines,
          deliveryWarehouse: undefined, note: `Đơn đặt theo phân tích đặt hàng (công thức ${parent})` };
        const saved = await purchaseApi.save(doc);
        made.push({ id: saved.id, docNo: saved.docNo, ncc, n: lines.length });
      }
      setSel({}); setBuy({});
      setMsg({ ok: true, text: <>Đã lập {made.length} đơn đặt nháp: {made.map((m) => <Link key={m.id} to={`/mua-hang/chung-tu?mo=${m.id}`} style={{ marginRight: 8 }}>{m.docNo} ({names.partnerName(m.ncc)}, {m.n} mã)</Link>)} — mở đơn để thêm ngân sách, ghi chú, xem mẫu Excel gửi NCC.</> });
      await qc.invalidateQueries({ queryKey: ['ton-max'] });
      await qc.invalidateQueries({ queryKey: ['mua-hang'] });
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Phân tích đặt hàng" code="MH02" helpKey="mua-hang-dat-hang" subtitle="SL cần nhập từng mã theo công thức của chi nhánh cha: tồn max kho + shop, tồn, đi đường, đơn đang đặt, doanh số dự phòng. Chọn mã → lập đơn đặt cho từng NCC" />
      <div className="card">
        <ChuaPhanCap branches={h.data?.branches} />
        <div className="tm-bar">
          <ChonChiNhanhCha value={parent} onChange={(v) => { setParent(v); setSel({}); setBuy({}); }} />
          <input className="input" type="search" placeholder="Tìm mã, tên, mã vạch, NCC… ví dụ: bim 400g" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 260 }} />
          <Link className="btn btn-sm" to="/mua-hang/cong-thuc">Công thức (MH18)</Link>
          <button className="btn btn-sm" onClick={() => exportRef.current?.()}><FileSpreadsheet size={14} /> Xuất Excel</button>
          <button className="btn btn-primary" disabled={!chosen.length || busy} onClick={() => void makeOrders()}><ShoppingCart size={15} /> Lập đơn đặt ({chosen.length} mã{money ? ` · ${Math.round(money).toLocaleString('vi-VN')}đ` : ''})</button>
        </div>
        <div className="tm-stats">
          <KhoiSo label="Tổng mã đang phân tích" value={stats.all.toLocaleString('vi-VN')} active={quick === ''} onClick={() => setQuick('')} />
          <KhoiSo label="Mã cần nhập" value={stats.need.toLocaleString('vi-VN')} tone="orange" active={quick === 'need'} onClick={() => setQuick('need')} />
          <KhoiSo label="Mã đang dư" value={stats.over.toLocaleString('vi-VN')} tone="yellow" active={quick === 'over'} onClick={() => setQuick('over')} />
          <KhoiSo label="Đang có đơn chưa về" value={stats.pending.toLocaleString('vi-VN')} tone="blue" active={quick === 'pending'} onClick={() => setQuick('pending')} />
          <KhoiSo label="Chưa rõ NCC" value={stats.nopartner.toLocaleString('vi-VN')} tone="red" active={quick === 'nopartner'} onClick={() => setQuick('nopartner')} hint="Mã chưa nhập lần nào và chưa khai NCC bán" />
        </div>
        {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'}`} style={{ margin: '0 12px 8px' }}>{msg.text}</div>}
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading text="Đang tính tồn, bán, đi đường của mọi shop…" /> : (
          <div className="tm-grid"><DataGrid rows={rows} columns={cols} rowKey={(r) => r._key} storageKey="phan-tich-dat-hang" exportRef={exportRef} exportName={`phan-tich-dat-hang-${parent}-${today()}`}
            exportTitle={`Phân tích đặt hàng ${q.data?.parent.name ?? parent} ngày ${today()}`}
            rowKind={(r) => (r._group ? 'group' : 'data')}
            groupLabel={(r) => <span className="tm-group-label"><span className="brand">{r.brandName || 'Chưa có nhãn'}</span><span className="ncc">{r.partnerCode ? `${r.partnerCode} - ${r.partnerName || names.partnerName(r.partnerCode)}` : 'Chưa rõ nhà cung cấp'}</span>{!r.partnerCode && <span className="muted" style={{ fontSize: 11.5, fontWeight: 400, marginLeft: 10 }}>— mã chưa nhập lần nào và chưa NCC nào khai bán: vào hồ sơ NCC → thẻ Mặt hàng & giá mua → Thêm mã (hoặc Nhập dữ liệu khởi đầu MH20, thẻ giá mua)</span>}</span>}
            emptyText={parent ? (quick === 'need' ? 'Không có mã nào cần nhập theo công thức hiện tại.' : 'Không có mã nào.') : 'Chọn chi nhánh cha.'} /></div>
        )}
      </div>
      {why && <Modal title={`Vì sao ${why.sku} cần nhập ${qtyFmt(why.need)} ${why.baseUnit}`} onClose={() => setWhy(null)} footer={<button className="btn" onClick={() => setWhy(null)}>Đóng</button>}>
        <div className="full"><div className="muted" style={{ marginBottom: 6 }}>{why.name}</div>
          <table className="tm-terms tm-example"><tbody>
            {why.parts.map((p) => <tr key={p.key}><td>{p.signed < 0 ? '−' : '+'} {p.label}</td><td className="num">{qtyFmt(Math.abs(p.signed))}</td></tr>)}
            <tr><td><b>= SL cần nhập</b></td><td className={`num ${why.need > 0 ? 'tm-need' : 'tm-need-neg'}`}><b>{qtyFmt(why.need)}</b></td></tr>
            {why.pack && <tr><td>Quy cách</td><td className="num">1 {why.packUnit} = {why.pack} {why.baseUnit} → gợi ý {why.options.map(qtyFmt).join(' / ') || '—'}</td></tr>}
          </tbody></table>
          {why.orders.length > 0 && <div style={{ marginTop: 8, fontSize: 12.5 }}><b>Đơn đặt chưa về:</b> {why.orders.map((o) => `${o.docNo} (${names.partnerName(o.partnerCode)}, ${o.date}) còn ${qtyFmt(o.remaining)}`).join('; ')}</div>}
          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>{why.shopsWithMax} shop có max, {why.shopsBelowMax} shop đang dưới max. Đổi cách tính ở <Link to="/mua-hang/cong-thuc">Công thức đặt hàng</Link>.</div>
        </div>
      </Modal>}
    </>
  );
}
