/**
 * LÔ & HẠN DÙNG (MH08) — tồn theo mã / lô / hạn dùng / chi nhánh: lô lấy từ phiếu nhập đã duyệt (số lô, hạn dùng trên dòng),
 * số tồn thật lấy từ kho (mọi nguồn xuất: bán, chuyển, kiểm kê…) — phần đã xuất trừ vào lô hạn gần trước (FEFO). Truy được
 * phiếu nhập nguồn; cảnh báo hết hạn và mốc 30 / 15 / 7 ngày; cột "Xuất trước" tự đánh thứ tự lô nên xuất (hết hạn trước xuất trước).
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LotStock } from '@ketoan/contracts/mua-hang';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { P, today, useNames, vnd } from '../du-lieu';
import { dmy } from '../chung';
import '../mua-hang.css';

type Lot = LotStock & { received: number; days: number; level: 'ok' | 'm30' | 'm15' | 'm7' | 'expired' };
const LEVEL: Record<string, [string, string]> = { expired: ['Đã hết hạn', 'badge-bad'], m7: ['≤ 7 ngày', 'badge-bad'], m15: ['≤ 15 ngày', 'badge-warn'], m30: ['≤ 30 ngày', 'badge-warn'], ok: ['Còn hạn', 'badge-ok'] };

export function LoHanPage() {
  const names = useNames();
  const [asOf, setAsOf] = useState(today());
  const q = useQuery({ queryKey: ['mua-hang', 'lots', asOf], queryFn: () => api.get<{ lots: Lot[] }>(`${P}/lots`, { asOf }) });
  const lots = q.data?.lots ?? [];
  const [branch, setBranch] = useState('');
  const [sku, setSku] = useState('');
  const [onlyWarn, setOnlyWarn] = useState(false);
  const [partner, setPartner] = useState('');
  const partners = useMemo(() => [...new Set(lots.map((l) => l.partnerCode))], [lots]);
  const rows = lots.filter((l) => (!branch || l.branchCode === branch) && (!sku || l.sku === sku) && (!partner || l.partnerCode === partner) && (!onlyWarn || l.level !== 'ok'));
  const sum = (lv: string[]) => lots.filter((l) => lv.includes(l.level));
  const skus = useMemo(() => [...new Set(lots.map((l) => l.sku))], [lots]);
  const branches = useMemo(() => [...new Set(lots.map((l) => l.branchCode))], [lots]);
  // Thứ tự xuất (FEFO): cùng mã, cùng chi nhánh, còn tồn → lô hạn dùng sớm hơn xuất trước. Không phải chọn / thử gì.
  const order = useMemo(() => {
    const m = new Map<string, { rank: number; of: number }>();
    const groups = new Map<string, Lot[]>();
    for (const l of lots.filter((x) => x.qty > 0)) groups.set(`${l.sku}|${l.branchCode}`, [...(groups.get(`${l.sku}|${l.branchCode}`) ?? []), l]);
    for (const g of groups.values()) g.sort((a, b) => a.expDate.localeCompare(b.expDate)).forEach((l, i) => m.set(`${l.sku}|${l.branchCode}|${l.lotNo}`, { rank: i + 1, of: g.length }));
    return m;
  }, [lots]);
  const warn = lots.some((l) => l.level !== 'ok' && l.qty > 0);
  return (
    <>
      <PageHeader title="Lô & hạn dùng" code="MH08" helpKey="mua-hang-lo-han" subtitle="Tồn theo lô / hạn dùng / chi nhánh, nguồn nhập, cảnh báo cận date 30-15-7 ngày, xuất theo FEFO" />
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {q.isLoading ? <Loading /> : <>
        <div className="kpis">
          {([['Đã hết hạn', ['expired']], ['Còn ≤ 7 ngày', ['m7']], ['Còn ≤ 15 ngày', ['m15']], ['Còn ≤ 30 ngày', ['m30']]] as [string, string[]][]).map(([t, lv]) => { const r = sum(lv); return (
            <div key={t} className="card kpi"><div className="label">{t}</div><div className={`value ${r.length ? 'mh-bad' : ''}`}>{r.length} lô</div><div className="hint">{r.reduce((s, l) => s + l.qty, 0)} ĐVT · giá trị {vnd(r.reduce((s, l) => s + l.qty * l.unitCost, 0))}</div></div>); })}
        </div>
        <div className="card">
          <div className="filters">
            <select className="select input" value={branch} onChange={(e) => setBranch(e.target.value)}><option value="">Mọi chi nhánh</option>{branches.map((b) => <option key={b} value={b}>{names.branchName(b)}</option>)}</select>
            <select className="select input" value={sku} onChange={(e) => setSku(e.target.value)}><option value="">Mọi mã hàng</option>{skus.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <select className="select input" value={partner} onChange={(e) => setPartner(e.target.value)}><option value="">Mọi nhà cung cấp</option>{partners.map((c) => <option key={c} value={c}>{names.partnerName(c)}</option>)}</select>
            <label className="row" style={{ gap: 4, fontSize: 13 }}><input type="checkbox" checked={onlyWarn} onChange={(e) => setOnlyWarn(e.target.checked)} /> Chỉ lô cần xử lý</label>
            <span style={{ fontSize: 12 }}>Tính đến <input className="input" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value || today())} /></span>
          </div>
          <div className="table-wrap"><table className="grid"><thead><tr><th>Mã hàng</th><th>Lô</th><th>NSX</th><th>Hạn dùng</th><th className="num">Còn (ngày)</th><th>Chi nhánh</th><th className="num">Đã nhập</th><th className="num">Còn tồn</th><th title="Cùng mã, cùng chi nhánh: lô hạn dùng sớm hơn xuất trước (FEFO)">Xuất trước</th><th className="num">Giá trị</th><th>Nguồn nhập</th><th>Tình trạng</th></tr></thead><tbody>
            {rows.map((l, i) => (
              <tr key={i}><td className="mono">{l.sku}</td><td className="mono">{l.lotNo}</td><td>{dmy(l.mfgDate)}</td><td>{dmy(l.expDate)}</td><td className="num">{l.days}</td><td>{names.branchName(l.branchCode)}</td>
                <td className="num">{l.received}</td><td className="num"><b>{l.qty}</b></td>
                <td>{(() => { const o = order.get(`${l.sku}|${l.branchCode}|${l.lotNo}`); return !o ? <span className="muted">hết tồn</span> : o.of === 1 ? <span className="muted">lô duy nhất</span> : o.rank === 1 ? <span className="badge badge-info">xuất lô này trước</span> : <span className="muted">thứ {o.rank} / {o.of}</span>; })()}</td>
                <td className="num">{vnd(l.qty * l.unitCost)}</td><td style={{ fontSize: 12 }}>{l.docNo} · {dmy(l.receivedAt)} · {names.partnerName(l.partnerCode)}</td>
                <td><span className={`badge ${LEVEL[l.level]![1]}`}>{LEVEL[l.level]![0]}</span></td></tr>
            ))}
            {!rows.length && <tr><td colSpan={12} className="muted" style={{ textAlign: 'center', padding: 12 }}>Chưa có lô — nhập số lô, hạn dùng trên dòng phiếu nhập (bắt buộc với mặt hàng có chính sách "Theo dõi lô / hạn dùng")</td></tr>}
          </tbody></table></div>
        </div>
        {warn && <div className="alert alert-warn" style={{ fontSize: 13 }}>Lô cận date / hết hạn: đẩy bán hoặc làm khuyến mại, trả nhà cung cấp (phiếu <b>Trả hàng NCC</b> ghi đúng số lô), hoặc huỷ hàng có biên bản. Lọc nhanh: tích <b>Chỉ lô cần xử lý</b>.</div>}
      </>}
    </>
  );
}
