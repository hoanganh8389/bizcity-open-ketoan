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
import { DataGrid } from '@/components/DataGrid';
import type { CreditStatus } from '@bizcity/mua-hang-domain';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { P, purchaseApi, today, useNames, vnd } from '../du-lieu';
import { UsageBar, dmy } from '../chung';

interface Credit {
  asOf: string;
  partners: (CreditStatus & { partnerCode: string; contractCode?: string })[];
  brands: { policy: string; id: string; brandCode: string; limit: number; allocated: number; unallocated: number; branches: (CreditStatus & { branchCode: string })[] }[];
  supply: { policy: string; name: string; brandCode?: string; period: string; branches: { branchCode: string; target: number; done: number; pct: number }[] }[];
}
interface Due { asOf: string; buckets: { label: string; amount: number; count: number }[]; rows: { partnerCode: string; partnerName: string; branchCode: string; docNo: string; contractCode?: string; seq?: number; docDate: string; dueDate: string; amount: number; paid: number; remaining: number; bucket: number; daysOverdue: number; daysToDue: number }[] }

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
  const hd = useQuery({ queryKey: ['mua-hang', 'contracts'], queryFn: () => purchaseApi.contracts(), staleTime: 60_000 });
  const tenHd = (c: string) => hd.data?.find((x) => x.code === c)?.name ?? '';
  const [tim, setTim] = useState('');
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={errorText(q.error)} />;
  const c = q.data!;
  return (
    <>
      {/* [2026-11-21 Nguyễn Văn Thủy] hạn mức theo NCC chia theo hợp đồng / ngoài hợp đồng — khai ở hợp đồng (bước Điều khoản) hoặc thẻ Không theo hợp đồng của NCC (đóng góp) */}
      <h4 style={{ margin: '0 0 6px' }} title="Hạn mức công nợ là điều khoản hợp đồng: khai ở Hợp đồng mua hàng (bước Điều khoản hợp đồng) hoặc hồ sơ NCC, thẻ Không theo hợp đồng. Hạn mức của hợp đồng tính trên các phiếu thuộc hợp đồng; hạn mức chung / ngoài hợp đồng tính trên toàn bộ nợ của NCC">Theo nhà cung cấp · hợp đồng</h4>
      {!c.partners.length && <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Chưa khai hạn mức NCC — khai ở Hợp đồng mua hàng (bước Điều khoản hợp đồng) hoặc hồ sơ NCC, thẻ Không theo hợp đồng.</div>}
      {c.partners.length > 2 && <input className="input" style={{ width: 300, marginBottom: 8 }} placeholder="Tìm NCC / hợp đồng…" value={tim} onChange={(e) => setTim(e.target.value)} />}
      {[...new Set(c.partners.filter((p) => { const k = tim.trim().toLowerCase(); return !k || `${p.partnerCode} ${names.partnerName(p.partnerCode)} ${p.contractCode ?? ''} ${tenHd(p.contractCode ?? '')}`.toLowerCase().includes(k); }).map((p) => p.partnerCode))].map((ncc) => (
        <div key={ncc} style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13, margin: '4px 0' }}>{names.partnerName(ncc)} <span className="muted mono" style={{ fontWeight: 400, fontSize: 11 }}>{ncc}</span></div>
          <div className="mh-grid2">
            {c.partners.filter((p) => p.partnerCode === ncc).sort((a, b) => (a.contractCode ?? '').localeCompare(b.contractCode ?? '')).map((p) => (
              <div key={p.policy} className="mh-panel">
                <div className="muted" style={{ fontSize: 11 }} title={`Mã chính sách ${p.policy}`}>{p.contractCode ? 'Theo hợp đồng' : 'Ngoài hợp đồng · hạn mức chung của NCC'}</div>
                <UsageBar s={{ ...p, scope: p.contractCode ? `Hợp đồng ${p.contractCode}${tenHd(p.contractCode) ? ` — ${tenHd(p.contractCode)}` : ''}` : 'Ngoài hợp đồng' }} />
              </div>
            ))}
          </div>
        </div>
      ))}
      {c.brands.map((b) => <BrandLimit key={b.policy} b={b} onChanged={() => void q.refetch()} />)}
      {c.supply.map((s) => (
        <div key={s.policy} className="mh-panel">
          <h4>Chỉ tiêu cung ứng — {s.name} ({s.period})</h4>
          <table className="mh-mini"><thead><tr><th>Chi nhánh</th><th className="num">Chỉ tiêu</th><th className="num">Đã nhập (trước thuế)</th><th className="num">Tỷ lệ</th><th style={{ width: '35%' }} /></tr></thead><tbody>
            {s.branches.map((r) => <tr key={r.branchCode}><td>{names.branchName(r.branchCode)}</td><td className="num">{vnd(r.target)}</td><td className="num">{vnd(r.done)}</td><td className="num">{Number(r.pct).toLocaleString('vi-VN')}%</td><td><div className="mh-bar"><span className="used" style={{ width: `${Math.min(100, r.pct)}%` }} /></div></td></tr>)}
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

// [2026-11-21 Nguyễn Văn Thủy] đến hạn / quá hạn: tìm nhanh, lọc hợp đồng / không theo hợp đồng, bấm ô tuổi nợ để lọc; bảng chuẩn (lọc cột, sắp xếp, Excel) thay chuỗi dòng cảnh báo (đóng góp)
function DueTab({ asOf }: { asOf: string }) {
  const [partner, setPartner] = useState('');
  const [branch, setBranch] = useState('');
  const [hd, setHd] = useState('*');
  const [tim, setTim] = useState('');
  const [tuoi, setTuoi] = useState<number | null>(null);
  const st = useQuery({ queryKey: ['mua-hang', 'settings'], queryFn: () => api.get<{ warnDays: number }>(`${P}/settings`) });
  const warnDays = st.data?.warnDays ?? 3;
  const q = useQuery({ queryKey: ['mua-hang', 'due', asOf], queryFn: () => api.get<Due>(`${P}/due`, { asOf }) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={errorText(q.error)} />;
  const all = q.data!.rows;
  const k = tim.trim().toLowerCase();
  const base = all.filter((r) => (!partner || r.partnerCode === partner) && (!branch || r.branchCode === branch) && (hd === '*' || (r.contractCode ?? '') === hd)
    && (!k || `${r.partnerName} ${r.partnerCode} ${r.docNo} ${r.contractCode ?? ''} ${r.branchCode}`.toLowerCase().includes(k)));
  const rows = tuoi === null ? base : base.filter((r) => r.bucket === tuoi);
  const branchList = [...new Set(all.map((r) => r.branchCode))].sort();
  const hdList = [...new Set(all.map((r) => r.contractCode ?? '').filter(Boolean))].sort();
  const buckets = q.data!.buckets.map((b, i) => ({ ...b, amount: base.filter((r) => r.bucket === i).reduce((s, r) => s + r.remaining, 0), count: base.filter((r) => r.bucket === i).length }));
  const soon = base.filter((r) => r.daysToDue > 0 && r.daysToDue <= warnDays);
  const partners = [...new Map(all.map((r) => [r.partnerCode, r.partnerName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  return (
    <>
      <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <input className="input" style={{ width: 260 }} placeholder="Tìm: NCC, số chứng từ, hợp đồng, chi nhánh" value={tim} onChange={(e) => setTim(e.target.value)} />
        <select className="select input" style={{ width: 260 }} value={partner} onChange={(e) => setPartner(e.target.value)}><option value="">Mọi nhà cung cấp</option>{partners.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
        <select className="select input" style={{ width: 200 }} value={hd} onChange={(e) => setHd(e.target.value)} title="Công nợ theo hợp đồng hay không theo hợp đồng"><option value="*">Mọi hợp đồng</option><option value="">Không theo hợp đồng</option>{hdList.map((c) => <option key={c} value={c}>Hợp đồng {c}</option>)}</select>
        <select className="select input" style={{ width: 160 }} value={branch} onChange={(e) => setBranch(e.target.value)}><option value="">Mọi chi nhánh</option>{branchList.map((b) => <option key={b} value={b}>{b}</option>)}</select>
        <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>Báo trước hạn {warnDays} ngày{soon.length ? ` · ${soon.length} khoản sắp đến hạn` : ''}</span>
      </div>
      <div className="kpis">
        {buckets.map((b, i) => <button type="button" key={b.label} className={`card kpi${tuoi === i ? ' active' : ''}`} style={{ textAlign: 'left', cursor: 'pointer', outline: tuoi === i ? '2px solid var(--brand-500, #3b82f6)' : undefined }} title={tuoi === i ? 'Bấm lần nữa để bỏ lọc' : `Chỉ xem khoản "${b.label}"`} onClick={() => setTuoi(tuoi === i ? null : i)}>
          <div className="label">{b.label}</div><div className={`value ${i >= 2 && b.amount ? 'mh-bad' : i === 1 && b.amount ? 'mh-warn' : ''}`}>{vnd(b.amount)}</div><div className="hint">{b.count} khoản</div></button>)}
      </div>
      <DataGrid<Due['rows'][number]> storageKey="mh05-den-han" rows={rows} rowKey={(r, i) => `${r.docNo}-${r.seq ?? 0}-${i}`} maxHeight="60vh" exportName="cong-no-den-han"
        emptyText="Không có khoản phải trả đang mở khớp điều kiện"
        columns={[
          { key: 'partnerName', header: 'Nhà cung cấp', width: 220 },
          { key: 'contractCode', header: 'Hợp đồng', width: 130, value: (r) => r.contractCode || 'Không theo HĐ', render: (r) => r.contractCode ? <span className="mono">{r.contractCode}</span> : <span className="muted">không theo HĐ</span> },
          { key: 'branchCode', header: 'Chi nhánh', width: 100 },
          { key: 'docNo', header: 'Chứng từ', type: 'code', width: 120 },
          { key: 'seq', header: 'Đợt', width: 50, value: (r) => (r.seq ? String(r.seq) : '') },
          { key: 'docDate', header: 'Ngày', width: 90, value: (r) => dmy(r.docDate) },
          { key: 'dueDate', header: 'Hạn', width: 100, value: (r) => (r.dueDate ? dmy(r.dueDate) : 'công nợ cố định') },
          { key: 'amount', header: 'Phải trả', type: 'money', width: 120 },
          { key: 'paid', header: 'Đã trả', type: 'money', width: 120 },
          { key: 'remaining', header: 'Còn lại', type: 'money', width: 120 },
          { key: 'bucket', header: 'Tình trạng', width: 150, value: (r) => q.data!.buckets[r.bucket]?.label ?? '', render: (r) => <span className={`badge ${r.bucket >= 2 ? 'badge-bad' : r.bucket === 1 ? 'badge-warn' : 'badge-gray'}`}>{q.data!.buckets[r.bucket]?.label}{r.bucket >= 2 ? ` · ${r.daysOverdue} ngày` : r.daysToDue > 0 && r.daysToDue <= warnDays ? ` · còn ${r.daysToDue} ngày` : ''}</span> },
        ]} />
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Số liệu lấy từ công nợ theo chứng từ của sổ kế toán (mọi phiếu ghi Có tài khoản 331, kể cả phiếu từ hệ thống khác). Hạn theo điều khoản từng phiếu / điều khoản thanh toán của hợp đồng hoặc của NCC (ngoài hợp đồng); phiếu có lịch trả nhiều đợt hiện từng đợt.</div>
    </>
  );
}
