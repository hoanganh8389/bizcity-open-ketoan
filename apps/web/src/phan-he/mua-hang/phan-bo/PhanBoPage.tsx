/**
 * PHÂN BỔ & GIÁ VỐN THỰC TẾ (MH07)
 *   Chi phí mua hàng: phiếu chi phí (vận chuyển, bốc xếp…) gắn phiếu nhập → phân bổ theo giá trị / số lượng, tổng khớp tới
 *   đồng → giá vốn trước / sau từng mã (khi duyệt: kho ghi điều chỉnh giá trị, SL 0). Cảnh báo chi phí chưa gắn phiếu nhập,
 *   một phiếu nhập có nhiều phiếu chi phí.
 *   Thưởng: các phiếu thưởng (MH06) và phần phân bổ theo mã.
 *   Giá vốn thực tế: giá gốc → CK → quà chia giá → chi phí → giá cuối từng mã của một phiếu nhập.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { P, STATUS_LABEL, useMuaHang, useNames, vnd, type MhData, type StoredDoc } from '../du-lieu';
import { dmy } from '../chung';
import { ChonChungTu, OChonChungTu } from '../thanh-phan/ChonChungTu';
import '../mua-hang.css';

interface Alloc { cost: { docNo: string; amount?: number }; receipts: { docNo: string; docDate: string; partnerCode: string }[]; basis?: string; rows: { sku: string; name: string; qty: number; value: number; amount: number; ratio: number; unitBefore: number; unitAfter: number }[]; warnings: string[] }
interface Real { receipt: { docNo: string }; adjustments: { docNo: string; kind: string; amount?: number }[]; rows: { sku: string; name: string; qty: number; giftQty: number; gross: number; disc: number; before: number; cost: number; rebate: number }[] }

export function PhanBoPage() {
  const { data, isLoading } = useMuaHang();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'chi-phi';
  return (
    <>
      <PageHeader title="Phân bổ & giá vốn thực tế" code="MH07" helpKey="mua-hang-phan-bo" subtitle="Phân bổ chi phí mua hàng (tăng giá vốn), thưởng (giảm giá vốn) theo mã; giá thực tế từng mã sau CK, quà, chi phí" />
      <div className="card">
        <div className="tabs">
          {[['chi-phi', 'Chi phí mua hàng'], ['thuong', 'Thưởng giảm giá vốn'], ['gia-von', 'Giá vốn thực tế theo phiếu']].map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setParams(k === 'chi-phi' ? {} : { tab: k! })}>{l}</button>)}
        </div>
        <div className="card-body">{isLoading || !data ? <Loading /> : tab === 'thuong' ? <Rebates data={data} /> : tab === 'gia-von' ? <RealCost data={data} /> : <Costs data={data} />}</div>
      </div>
    </>
  );
}

function Costs({ data }: { data: MhData }) {
  const names = useNames();
  const costs = data.docs.filter((d) => d.kind === 'cost' && d.status !== 'cancelled');
  const [id, setId] = useState('');
  const cur = id || costs[0]?.id || '';
  const [basis, setBasis] = useState<'' | 'value' | 'qty'>('');
  const [pick, setPick] = useState(false);
  const q = useQuery({ queryKey: ['mua-hang', 'alloc', cur, basis], enabled: Boolean(cur), queryFn: () => api.get<Alloc>(`${P}/allocations/${cur}`, { basis: basis || undefined }) });
  if (!costs.length) return <div className="muted">Chưa có phiếu chi phí mua hàng — lập ở Tổng hợp mua hàng (MH11) → + Thêm chứng từ → Chi phí mua hàng, chọn phiếu nhập cần phân bổ.</div>;
  const r = q.data;
  return (
    <>
      <div className="row" style={{ gap: 8, alignItems: 'flex-end', marginBottom: 8, flexWrap: 'wrap' }}>
        <div className="field" style={{ width: 460 }}><label>Phiếu chi phí</label>
          <OChonChungTu count={costs.length} onOpen={() => setPick(true)} placeholder="Chọn phiếu chi phí…"
            text={(() => { const d = costs.find((x) => x.id === cur); return d ? `${d.docNo} · ${dmy(d.docDate)} · ${names.partnerName(d.partnerCode)} · ${vnd(d.amount)} · ${STATUS_LABEL[d.status]}` : undefined; })()} /></div>
        {pick && <ChonChungTu<StoredDoc> title="Chọn phiếu chi phí mua hàng" storageKey="mh-chon-chi-phi" rows={costs} rowKey={(d) => d.id} dateOf={(d) => d.docDate}
          searchOf={(d) => [d.docNo, d.note, d.partnerCode, names.partnerName(d.partnerCode)].join(' ')} onPick={(d) => setId(d.id)} onClose={() => setPick(false)}
          columns={[
            { key: 'docNo', header: 'Số phiếu', type: 'code', width: 120 },
            { key: 'docDate', header: 'Ngày', width: 90, value: (d) => dmy(d.docDate) },
            { key: 'partner', header: 'Đơn vị nhận tiền', width: 220, value: (d) => names.partnerName(d.partnerCode) },
            { key: 'amount', header: 'Số tiền', type: 'money', width: 120, value: (d) => d.amount ?? 0 },
            { key: 'status', header: 'Trạng thái', width: 110, value: (d) => STATUS_LABEL[d.status] },
            { key: 'note', header: 'Ghi chú', width: 220, value: (d) => d.note ?? '' },
          ]} />}
        <div className="field"><label>Tiêu thức</label><select className="select input" value={basis || r?.basis || 'value'} onChange={(e) => setBasis(e.target.value as 'value')}><option value="value">Theo giá trị hàng</option><option value="qty">Theo số lượng</option></select></div>
        {r?.receipts.length ? <span className="muted" style={{ fontSize: 12 }}>→ phiếu nhập {r.receipts.map((x) => <b key={x.docNo}>{x.docNo} </b>)}({r.receipts.map((x) => names.partnerName(x.partnerCode)).filter((v, i, a) => a.indexOf(v) === i).join(', ')})</span> : null}
      </div>
      {q.error && <ErrorBox error={errorText(q.error)} />}
      {r?.warnings.map((w, i) => <div key={i} className="mh-check warn">⚠ {w}</div>)}
      {q.isLoading ? <Loading /> : r && (
        <table className="mh-mini"><thead><tr><th>Mã hàng</th><th className="num">SL</th><th className="num">Giá trị hàng</th><th className="num">Tỷ lệ</th><th className="num">Chi phí phân bổ</th><th className="num">Giá vốn / ĐVT trước</th><th className="num">Giá vốn / ĐVT sau</th></tr></thead><tbody>
          {r.rows.map((l) => <tr key={l.sku}><td>{l.sku} <span className="muted">{l.name}</span></td><td className="num">{l.qty}</td><td className="num">{vnd(l.value)}</td><td className="num">{l.ratio}%</td><td className="num"><b>{vnd(l.amount)}</b></td><td className="num">{vnd(l.unitBefore)}</td><td className="num"><b>{vnd(l.unitAfter)}</b></td></tr>)}
          {r.rows.length > 0 && <tr><td><b>Cộng</b></td><td className="num">{r.rows.reduce((s, l) => s + l.qty, 0)}</td><td className="num">{vnd(r.rows.reduce((s, l) => s + l.value, 0))}</td><td className="num">100%</td>
            <td className={`num ${r.rows.reduce((s, l) => s + l.amount, 0) === r.cost.amount ? 'mh-ok' : 'mh-bad'}`}><b>{vnd(r.rows.reduce((s, l) => s + l.amount, 0))}</b> / {vnd(r.cost.amount)}</td><td /><td /></tr>}
        </tbody></table>
      )}
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Khi duyệt phiếu chi phí: Nợ 1561 theo từng mã (kho ghi điều chỉnh giá trị, SL 0) · Nợ 1331 nếu có hoá đơn / Có 331 đơn vị dịch vụ. Giá vốn bình quân tự nhận phần tăng.</div>
    </>
  );
}

function Rebates({ data }: { data: MhData }) {
  const names = useNames();
  const docs = data.docs.filter((d) => d.kind === 'rebate' && d.status !== 'cancelled');
  if (!docs.length) return <div className="muted">Chưa có phiếu thưởng — tính ở màn "Tính thưởng cuối kỳ" (MH06), bấm "Tạo phiếu thưởng".</div>;
  return (
    <table className="mh-mini"><thead><tr><th>Phiếu</th><th>Ngày</th><th>NCC</th><th>Chính sách · kỳ</th><th className="num">Tiền thưởng</th><th>Phân bổ theo mã</th><th>Trạng thái</th></tr></thead><tbody>
      {docs.map((d) => <tr key={d.id}><td className="mono">{d.docNo}</td><td>{dmy(d.docDate)}</td><td>{names.partnerName(d.partnerCode)}</td><td>{d.rebate?.policyCode} · {d.rebate?.period}</td><td className="num"><b>{vnd(d.amount)}</b></td><td style={{ fontSize: 12 }}>{(d.allocation ?? []).map((a) => `${a.sku}: ${vnd(a.amount)}`).join(' · ')}</td><td>{STATUS_LABEL[d.status]}</td></tr>)}
    </tbody></table>
  );
}

function RealCost({ data }: { data: MhData }) {
  const names = useNames();
  const receipts = data.docs.filter((d) => d.kind === 'receipt' && d.status === 'approved');
  const [pick, setPick] = useState(false);
  const [id, setId] = useState('');
  const cur = id || receipts[0]?.id || '';
  const q = useQuery({ queryKey: ['mua-hang', 'real', cur], enabled: Boolean(cur), queryFn: () => api.get<Real>(`${P}/real-cost/${cur}`) });
  if (!receipts.length) return <div className="muted">Chưa có phiếu nhập đã duyệt.</div>;
  const rows = q.data?.rows ?? [];
  return (
    <>
      <div className="field" style={{ marginBottom: 8, width: 520 }}><label>Phiếu nhập</label>
        <OChonChungTu count={receipts.length} onOpen={() => setPick(true)} placeholder="Chọn phiếu nhập…"
          text={(() => { const d = receipts.find((x) => x.id === cur); return d ? `${d.docNo} · ${dmy(d.docDate)} · ${names.partnerName(d.partnerCode)} · ${vnd(d.totals.total)}` : undefined; })()} /></div>
      {pick && <ChonChungTu<StoredDoc> title="Chọn phiếu nhập đã duyệt" storageKey="mh-chon-phieu-nhap-gv" rows={receipts} rowKey={(d) => d.id} dateOf={(d) => d.docDate}
        searchOf={(d) => [d.docNo, d.note, d.invoice?.no, d.partnerCode, names.partnerName(d.partnerCode), d.branchCode, ...d.lines.flatMap((l) => [l.sku, l.name])].join(' ')}
        onPick={(d) => setId(d.id)} onClose={() => setPick(false)}
        columns={[
          { key: 'docNo', header: 'Số phiếu', type: 'code', width: 120 },
          { key: 'docDate', header: 'Ngày', width: 90, value: (d) => dmy(d.docDate) },
          { key: 'partner', header: 'Nhà cung cấp', width: 220, value: (d) => names.partnerName(d.partnerCode) },
          { key: 'branchCode', header: 'Chi nhánh', width: 90 },
          { key: 'invoice', header: 'Số HĐ', type: 'code', width: 110, value: (d) => d.invoice?.no ?? '' },
          { key: 'total', header: 'Tổng tiền', type: 'money', width: 120, value: (d) => d.totals.total },
          { key: 'items', header: 'Mặt hàng', width: 280, value: (d) => d.lines.filter((l) => l.sku).map((l) => `${l.sku} ${l.name}`).join('; ') },
        ]} />}
      {q.error && <ErrorBox error={errorText(q.error)} />}
      {q.isLoading ? <Loading /> : (
        <table className="mh-mini"><thead><tr><th>Mã hàng</th><th className="num">SL mua</th><th className="num">SL quà chia giá</th><th className="num">Giá gốc / ĐVT</th><th className="num">CK / ĐVT</th><th className="num">Sau CK, chia quà</th><th className="num">+ Chi phí / ĐVT</th><th className="num">− CK sau mua / ĐVT</th><th className="num">Giá thực tế cuối</th></tr></thead><tbody>
          {rows.map((x) => { const qty = x.qty + x.giftQty; return (
            <tr key={x.sku}><td>{x.sku} <span className="muted">{x.name}</span></td><td className="num">{x.qty}</td><td className="num">{x.giftQty || ''}</td><td className="num">{vnd(x.qty ? x.gross / x.qty : 0)}</td><td className="num">{x.disc ? `− ${vnd(x.disc / x.qty)}` : ''}</td><td className="num">{vnd(x.before / qty)}</td><td className="num">{x.cost ? `+ ${vnd(x.cost / qty)}` : ''}</td><td className="num">{x.rebate ? `− ${vnd(x.rebate / qty)}` : ''}</td><td className="num"><b>{vnd((x.before + x.cost - x.rebate) / qty)}</b></td></tr>); })}
          <tr><td><b>Cộng giá trị</b></td><td /><td /><td /><td /><td className="num">{vnd(rows.reduce((s, x) => s + x.before, 0))}</td><td className="num">{vnd(rows.reduce((s, x) => s + x.cost, 0))}</td><td className="num">{vnd(rows.reduce((s, x) => s + x.rebate, 0))}</td><td className="num"><b>{vnd(rows.reduce((s, x) => s + x.before + x.cost - x.rebate, 0))}</b></td></tr>
        </tbody></table>
      )}
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Tổng giá trị khớp chứng từ (tiền hàng sau CK + chi phí đã phân bổ). Chi phí và chiết khấu / giảm giá sau mua gắn phiếu này đã tính vào; thưởng cuối kỳ phân bổ theo kỳ (tab Thưởng, báo cáo Tổng hợp mua hàng). Trước thuế, đơn vị đồng.</div>
    </>
  );
}
