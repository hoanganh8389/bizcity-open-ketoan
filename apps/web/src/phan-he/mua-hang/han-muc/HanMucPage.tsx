/**
 * HẠN MỨC & CÔNG NỢ ĐẾN HẠN (MH05) — số liệu thật theo sổ.
 *   Tab Hạn mức: hạn mức theo NCC (nợ đã ghi trên 331 + hàng đang đặt / chờ duyệt) và hạn mức nhãn phân bổ chi nhánh (phần
 *   chưa trả của phiếu nhập đã duyệt), điều chuyển hạn mức giữa chi nhánh (ghi nhật ký trước / sau), chỉ tiêu cung ứng.
 *   Tab Đến hạn: mọi khoản phải trả NCC đang mở (kể cả từ nguồn khác), phiếu có lịch trả nhiều đợt tách từng đợt; tiền đã trả
 *   trừ vào đợt sớm trước; cảnh báo sắp đến hạn / đến hạn / quá hạn, tuổi nợ 6 nhóm.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { CreditStatus } from '@ketoan/contracts/mua-hang';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { P, purchaseApi, today, useNames, vnd } from '../du-lieu';
import { UsageBar, dmy } from '../chung';

interface Credit {
  asOf: string;
  partners: (CreditStatus & { partnerCode: string })[];
  brands: { policy: string; id: string; brandCode: string; limit: number; allocated: number; unallocated: number; branches: (CreditStatus & { branchCode: string })[] }[];
  supply: { policy: string; name: string; brandCode?: string; period: string; branches: { branchCode: string; target: number; done: number; pct: number }[] }[];
}
interface Due { asOf: string; buckets: { label: string; amount: number; count: number }[]; rows: { partnerCode: string; partnerName: string; branchCode: string; docNo: string; seq?: number; docDate: string; dueDate: string; amount: number; paid: number; remaining: number; bucket: number; daysOverdue: number; daysToDue: number }[] }

export function HanMucPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'den-han' ? 'den-han' : 'han-muc';
  const [asOf, setAsOf] = useState(today());
  return (
    <>
      <PageHeader title="Hạn mức & công nợ đến hạn" code="MH05" helpKey="mua-hang-han-muc" subtitle="Hạn mức theo NCC / nhãn / chi nhánh, điều chuyển hạn mức, chỉ tiêu cung ứng; cảnh báo đến hạn, quá hạn, tuổi nợ — theo sổ" />
      <div className="card">
        <div className="tabs">
          <button className={`tab ${tab === 'han-muc' ? 'active' : ''}`} onClick={() => setParams({})}>Hạn mức công nợ</button>
          <button className={`tab ${tab === 'den-han' ? 'active' : ''}`} onClick={() => setParams({ tab: 'den-han' })}>Đến hạn / quá hạn / tuổi nợ</button>
          <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12 }}>Tính đến ngày <input className="input" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value || today())} /></span>
        </div>
        <div className="card-body">{tab === 'han-muc' ? <Limits asOf={asOf} /> : <DueTab asOf={asOf} />}</div>
      </div>
    </>
  );
}

function Limits({ asOf }: { asOf: string }) {
  const names = useNames();
  const q = useQuery({ queryKey: ['mua-hang', 'credit', asOf], queryFn: () => api.get<Credit>(`${P}/credit`, { asOf }) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={errorText(q.error)} />;
  const c = q.data!;
  return (
    <>
      <h4 style={{ margin: '0 0 6px' }}>Theo nhà cung cấp</h4>
      {!c.partners.length && <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Chưa khai hạn mức NCC — thêm chính sách "Hạn mức công nợ" ở MH04 (phạm vi = nhà cung cấp).</div>}
      <div className="mh-grid2">
        {c.partners.map((p) => <div key={p.policy} className="mh-panel"><div className="muted" style={{ fontSize: 11 }}>{p.policy}</div><UsageBar s={{ ...p, scope: names.partnerName(p.partnerCode) }} /></div>)}
      </div>
      {c.brands.map((b) => <BrandLimit key={b.policy} b={b} onChanged={() => void q.refetch()} />)}
      {c.supply.map((s) => (
        <div key={s.policy} className="mh-panel">
          <h4>Chỉ tiêu cung ứng — {s.name} ({s.period})</h4>
          <table className="mh-mini"><thead><tr><th>Chi nhánh</th><th className="num">Chỉ tiêu</th><th className="num">Đã nhập (trước thuế)</th><th className="num">Tỷ lệ</th><th style={{ width: '35%' }} /></tr></thead><tbody>
            {s.branches.map((r) => <tr key={r.branchCode}><td>{names.branchName(r.branchCode)}</td><td className="num">{vnd(r.target)}</td><td className="num">{vnd(r.done)}</td><td className="num">{r.pct}%</td><td><div className="mh-bar"><span className="used" style={{ width: `${Math.min(100, r.pct)}%` }} /></div></td></tr>)}
          </tbody></table>
        </div>
      ))}
    </>
  );
}

function BrandLimit({ b, onChanged }: { b: Credit['brands'][number]; onChanged: () => void }) {
  const names = useNames();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(b.branches[0]?.branchCode ?? '');
  const [amount, setAmount] = useState(50_000_000);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  // Chuyển từ chi nhánh chỉ được phần còn trống; phần đã bị nợ / phiếu chờ chiếm vẫn nằm ở chi nhánh đó (API kiểm tra lại)
  const src = b.branches.find((x) => x.branchCode === from);
  const max = from ? Math.max(0, src?.remaining ?? 0) : Math.max(0, b.unallocated);
  const transfer = async () => {
    setErr(''); setMsg('');
    try { await purchaseApi.transferLimit(b.id, { from, to, amount }); setMsg(`Đã chuyển ${vnd(amount)} sang ${names.branchName(to)} (ghi nhật ký)`); onChanged(); } catch (e) { setErr(errorText(e)); }
  };
  return (
    <div className="mh-panel" style={{ marginTop: 10 }}>
      <h4>Hạn mức toàn nhãn {b.brandCode}: {vnd(b.limit)} <span className="badge badge-info">đã phân bổ {vnd(b.allocated)} · chưa phân bổ {vnd(b.unallocated)}</span></h4>
      <div className="mh-grid2">{b.branches.map((s) => <UsageBar key={s.branchCode} s={{ ...s, scope: names.branchName(s.branchCode) }} />)}</div>
      <div className="row" style={{ gap: 6, alignItems: 'flex-end', marginTop: 6, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 12 }}>Điều chuyển hạn mức:</b>
        <select className="select input" value={from} onChange={(e) => setFrom(e.target.value)}><option value="">Phần chưa phân bổ</option>{b.branches.map((x) => <option key={x.branchCode} value={x.branchCode}>{names.branchName(x.branchCode)}</option>)}</select>
        <span>→</span>
        <select className="select input" value={to} onChange={(e) => setTo(e.target.value)}>{b.branches.map((x) => <option key={x.branchCode} value={x.branchCode}>{names.branchName(x.branchCode)}</option>)}</select>
        <input className="input num" style={{ width: 130 }} value={amount.toLocaleString('vi-VN')} onChange={(e) => setAmount(Number(e.target.value.replace(/\./g, '')) || 0)} />
        <button className="btn btn-sm btn-primary" disabled={amount <= 0 || amount > max} onClick={() => void transfer()}>Chuyển</button>
        <span className="muted" style={{ fontSize: 11 }}>Tối đa {vnd(max)}{from ? ' (phần còn trống = hạn mức − nợ đã ghi − đang chờ)' : ''}</span>
        <span className="muted" style={{ fontSize: 11 }}>Theo phân quyền; mỗi lần chuyển ghi nhật ký trước / sau (MH10)</span>
      </div>
      {err && <div className="alert alert-bad" style={{ marginTop: 6 }}>{err}</div>}
      {msg && <div className="alert alert-ok" style={{ marginTop: 6 }}>{msg}</div>}
    </div>
  );
}

function DueTab({ asOf }: { asOf: string }) {
  const [partner, setPartner] = useState('');
  const [branch, setBranch] = useState('');
  const st = useQuery({ queryKey: ['mua-hang', 'settings'], queryFn: () => api.get<{ warnDays: number }>(`${P}/settings`) });
  const warnDays = st.data?.warnDays ?? 3;
  const q = useQuery({ queryKey: ['mua-hang', 'due', asOf], queryFn: () => api.get<Due>(`${P}/due`, { asOf }) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={errorText(q.error)} />;
  const all = q.data!.rows;
  const rows = all.filter((r) => (!partner || r.partnerCode === partner) && (!branch || r.branchCode === branch));
  const branchList = [...new Set(all.map((r) => r.branchCode))];
  const buckets = q.data!.buckets.map((b, i) => ({ ...b, amount: rows.filter((r) => r.bucket === i).reduce((s, r) => s + r.remaining, 0), count: rows.filter((r) => r.bucket === i).length }));
  const soon = rows.filter((r) => r.daysToDue > 0 && r.daysToDue <= warnDays);
  const partners = [...new Map(all.map((r) => [r.partnerCode, r.partnerName])).entries()];
  return (
    <>
      <div className="row" style={{ gap: 8, marginBottom: 8 }}>
        <select className="select input" style={{ width: 300 }} value={partner} onChange={(e) => setPartner(e.target.value)}><option value="">Mọi nhà cung cấp</option>{partners.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
        <select className="select input" style={{ width: 180 }} value={branch} onChange={(e) => setBranch(e.target.value)}><option value="">Mọi chi nhánh</option>{branchList.map((b) => <option key={b} value={b}>{b}</option>)}</select>
        <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>Báo trước hạn {warnDays} ngày (đổi ở Cài đặt mua hàng)</span>
      </div>
      <div className="kpis">
        {buckets.map((b, i) => <div key={b.label} className="card kpi"><div className="label">{b.label}</div><div className={`value ${i >= 2 && b.amount ? 'mh-bad' : i === 1 && b.amount ? 'mh-warn' : ''}`}>{vnd(b.amount)}</div><div className="hint">{b.count} khoản</div></div>)}
      </div>
      <div style={{ marginBottom: 8 }}>
        {rows.filter((r) => r.bucket >= 2).map((r, i) => <div key={`o${i}`} className="mh-check error">⛔ Quá hạn {r.daysOverdue} ngày: {r.partnerName} — {r.docNo}{r.seq ? ` đợt ${r.seq}` : ''}, còn {vnd(r.remaining)} (hạn {dmy(r.dueDate)})</div>)}
        {rows.filter((r) => r.bucket === 1).map((r, i) => <div key={`d${i}`} className="mh-check warn">⚠ Đến hạn hôm nay: {r.partnerName} — {r.docNo}, {vnd(r.remaining)}</div>)}
        {soon.map((r, i) => <div key={`s${i}`} className="mh-check info">ℹ Sắp đến hạn ({r.daysToDue} ngày nữa): {r.partnerName} — {r.docNo}{r.seq ? ` đợt ${r.seq}` : ''}, {vnd(r.remaining)} (hạn {dmy(r.dueDate)})</div>)}
      </div>
      <div className="table-wrap"><table className="grid"><thead><tr><th>Nhà cung cấp</th><th>Chi nhánh</th><th>Chứng từ</th><th>Đợt</th><th>Ngày</th><th>Hạn</th><th className="num">Phải trả</th><th className="num">Đã trả</th><th className="num">Còn lại</th><th>Tình trạng</th></tr></thead><tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{r.partnerName}</td><td>{r.branchCode}</td><td className="mono">{r.docNo}</td><td>{r.seq ?? ''}</td><td>{dmy(r.docDate)}</td><td>{r.dueDate ? dmy(r.dueDate) : <span className="muted">công nợ cố định</span>}</td>
            <td className="num">{vnd(r.amount)}</td><td className="num">{vnd(r.paid)}</td><td className="num"><b>{vnd(r.remaining)}</b></td>
            <td><span className={`badge ${r.bucket >= 2 ? 'badge-bad' : r.bucket === 1 ? 'badge-warn' : 'badge-gray'}`}>{q.data!.buckets[r.bucket]?.label}</span></td>
          </tr>
        ))}
        {!rows.length && <tr><td colSpan={10} className="muted" style={{ textAlign: 'center', padding: 12 }}>Không có khoản phải trả đang mở</td></tr>}
      </tbody></table></div>
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Số liệu lấy từ công nợ theo chứng từ của sổ kế toán (mọi phiếu ghi Có tài khoản 331, kể cả phiếu từ hệ thống khác). Hạn theo điều khoản từng phiếu / chính sách NCC; phiếu có lịch trả nhiều đợt hiện từng đợt.</div>
    </>
  );
}
