/**
 * QUÀ TẶNG (MH09) — sổ nhập-xuất-tồn quà theo mã, nguồn (NCC tặng theo chương trình / ngoài hợp đồng / TGS tự mua / KM
 * người tiêu dùng kèm hoá đơn mua), chương trình, có / không VAT, chi nhánh — từ chứng từ mua hàng đã duyệt (nhận quà, xuất
 * quà tặng, dòng quà trên phiếu nhập); đối chiếu: xuất vượt tồn, số quà nhận so với số được hưởng theo chương trình.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { giftPlan } from '@ketoan/contracts/mua-hang';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { GIFT_SOURCE, P, useMuaHang, useNames, vnd } from '../du-lieu';
import { dmy } from '../chung';
import '../mua-hang.css';

interface GiftRow { sku: string; name: string; branchCode: string; source: string; program: string; hasVat: boolean; openQty: number; inQty: number; outQty: number; onHand: number; unitValue: number; docs: string[] }
interface Budget { policy: string; name: string; program: string; amount: number; bought: number; used: number; left: number; pct: number }

export function QuaTangPage() {
  const { data } = useMuaHang();
  const names = useNames();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const q = useQuery({ queryKey: ['mua-hang', 'gifts', from, to], queryFn: () => api.get<{ rows: GiftRow[]; budgets: Budget[] }>(`${P}/gifts`, { from: from || undefined, to: to || undefined }) });
  const [group, setGroup] = useState<'detail' | 'source' | 'program'>('detail');
  const rows = q.data?.rows ?? [];
  const budgets = q.data?.budgets ?? [];
  const over = rows.filter((r) => r.onHand < 0);
  // Cùng phép tính quà theo chương trình với phiếu nhập (giftPlan): nhãn theo từng mặt hàng.
  const entitlement = useMemo(() => (data ? data.docs.filter((d) => d.kind === 'receipt' && d.status === 'approved')
    .flatMap((d) => giftPlan(d, data.policies).map((g) => ({ doc: d.docNo, name: g.policy.name, expected: g.expected, got: g.got }))) : []), [data]);
  const grouped = useMemo(() => {
    if (group === 'detail') return null;
    const m = new Map<string, { key: string; inQty: number; outQty: number; value: number }>();
    for (const r of rows) {
      const k = group === 'source' ? `${GIFT_SOURCE[r.source] ?? r.source} · ${r.hasVat ? 'có VAT' : 'không VAT'}` : r.program || '(không chương trình)';
      const x = m.get(k) ?? { key: k, inQty: 0, outQty: 0, value: 0 };
      x.inQty += r.inQty; x.outQty += r.outQty; x.value += Math.max(0, r.onHand) * r.unitValue; m.set(k, x);
    }
    return [...m.values()];
  }, [rows, group]);
  const outs = (data?.docs ?? []).filter((d) => d.kind === 'gift_out' && d.status === 'approved');
  return (
    <>
      <PageHeader title="Quà tặng" code="MH09" helpKey="mua-hang-qua-tang" subtitle="Nhập - xuất - tồn quà theo nguồn, chương trình, VAT, chi nhánh; đối chiếu số được hưởng, cảnh báo thiếu / thừa / xuất vượt" />
      <div className="row" style={{ gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 13 }}>Kỳ báo cáo</span><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /> <span>→</span> <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <span className="muted" style={{ fontSize: 12 }}>Trống = toàn bộ. Có "từ ngày" thì tách tồn đầu kỳ.</span>
      </div>
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {q.isLoading ? <Loading /> : <>
        <div className="kpis">
          <div className="card kpi"><div className="label" title="Quà NCC tặng theo chương trình, ngoài hợp đồng và quà kèm hoá đơn mua (KM người tiêu dùng)">Quà NCC tặng (chương trình, ngoài HĐ, kèm HĐ mua)</div><div className="value">{rows.filter((r) => r.source.startsWith('ncc') || r.source === 'promo_consumer').reduce((s, r) => s + r.inQty, 0)}</div></div>
          <div className="card kpi"><div className="label">TGS tự mua — có VAT / không VAT</div><div className="value">{rows.filter((r) => r.source === 'self_buy' && r.hasVat).reduce((s, r) => s + r.inQty, 0)} / {rows.filter((r) => r.source === 'self_buy' && !r.hasVat).reduce((s, r) => s + r.inQty, 0)}</div></div>
          <div className="card kpi"><div className="label">Đã xuất tặng</div><div className="value">{rows.reduce((s, r) => s + r.outQty, 0)}</div></div>
          <div className="card kpi"><div className="label">Giá trị tồn quà</div><div className="value">{vnd(rows.reduce((s, r) => s + Math.max(0, r.onHand) * r.unitValue, 0))}</div></div>
        </div>
        {budgets.filter((b) => b.bought > b.amount).map((b) => <div key={`vuot-${b.policy}`} className="alert alert-warn" style={{ marginBottom: 6 }}>Chương trình {b.program}: đã mua / nhận {vnd(b.bought)} vượt ngân sách {vnd(b.amount)} ({vnd(b.bought - b.amount)})</div>)}
        {budgets.length > 0 && (
          <div className="card card-body" style={{ marginBottom: 8 }}>
            <h4 style={{ margin: '0 0 6px' }}>Ngân sách quà theo chương trình</h4>
            <table className="mh-mini"><thead><tr><th>Chương trình</th><th className="num">Ngân sách</th><th className="num">Đã mua / nhận</th><th className="num">Đã xuất tặng</th><th className="num">Còn lại</th><th style={{ width: '30%' }} /></tr></thead><tbody>
              {budgets.map((b) => <tr key={b.policy}><td className="mono">{b.program} <span className="muted">{b.name}</span></td><td className="num">{vnd(b.amount)}</td><td className="num">{vnd(b.bought)}</td><td className="num">{vnd(b.used)}</td><td className={`num ${b.left < 0 ? 'mh-bad' : ''}`}>{vnd(b.left)}</td><td><div className="mh-bar"><span className={b.pct > 100 ? 'over' : 'used'} style={{ width: `${Math.min(100, b.pct)}%` }} /></div></td></tr>)}
            </tbody></table>
          </div>
        )}
        {over.map((r, i) => <div key={i} className="mh-check error">⛔ Xuất vượt tồn: {r.name} tại {names.branchName(r.branchCode)} ({r.program || 'không chương trình'}) — nhập {r.inQty}, xuất {r.outQty}. Kiểm tra phiếu nhập quà chưa duyệt hoặc xuất sai chương trình.</div>)}
        {entitlement.filter((e) => e.expected !== e.got).map((e, i) => <div key={i} className="mh-check warn">⚠ {e.doc}: {e.name} — được hưởng {e.expected}, ghi nhận {e.got} ({e.got < e.expected ? `thiếu ${e.expected - e.got}` : `thừa ${e.got - e.expected}`})</div>)}
        <div className="card" style={{ marginTop: 8 }}>
          <div className="tabs">{([['detail', 'Chi tiết theo mã / chi nhánh'], ['source', 'Tổng hợp theo nguồn & VAT'], ['program', 'Tổng hợp theo chương trình']] as const).map(([k, l]) => <button key={k} className={`tab ${group === k ? 'active' : ''}`} onClick={() => setGroup(k)}>{l}</button>)}</div>
          <div className="table-wrap">
            {grouped ? (
              <table className="grid"><thead><tr><th>Nhóm</th><th className="num">Nhập</th><th className="num">Xuất</th><th className="num">Tồn</th><th className="num">Giá trị tồn</th></tr></thead><tbody>
                {grouped.map((g) => <tr key={g.key}><td>{g.key}</td><td className="num">{g.inQty}</td><td className="num">{g.outQty}</td><td className={`num ${g.inQty - g.outQty < 0 ? 'mh-bad' : ''}`}>{g.inQty - g.outQty}</td><td className="num">{vnd(g.value)}</td></tr>)}
              </tbody></table>
            ) : (
              <table className="grid"><thead><tr><th>Mã quà</th><th>Tên</th><th>Chi nhánh</th><th>Nguồn</th><th>Chương trình</th><th>VAT</th><th className="num">Đầu kỳ</th><th className="num">Nhập</th><th className="num">Xuất</th><th className="num">Tồn</th><th className="num">Đơn giá trị</th><th>Chứng từ</th></tr></thead><tbody>
                {rows.map((r, i) => <tr key={i}><td className="mono">{r.sku}</td><td>{r.name}</td><td>{names.branchName(r.branchCode)}</td><td>{GIFT_SOURCE[r.source] ?? r.source}</td><td className="mono">{r.program}</td><td>{r.hasVat ? 'Có' : 'Không'}</td><td className="num">{r.openQty || ''}</td><td className="num">{r.inQty}</td><td className="num">{r.outQty}</td><td className={`num ${r.onHand < 0 ? 'mh-bad' : ''}`}><b>{r.onHand}</b></td><td className="num">{vnd(r.unitValue)}</td><td style={{ fontSize: 12 }}>{r.docs.join(', ')}</td></tr>)}
                {!rows.length && <tr><td colSpan={12} className="muted" style={{ textAlign: 'center', padding: 12 }}>Chưa có quà — ghi bằng phiếu Nhận quà / Xuất quà tặng hoặc dòng quà trên phiếu nhập (MH11)</td></tr>}
              </tbody></table>
            )}
          </div>
        </div>
        {outs.length > 0 && (
          <div className="card card-body">
            <h4 style={{ margin: '0 0 6px' }}>Phiếu xuất quà tặng đã duyệt</h4>
            <table className="mh-mini"><thead><tr><th>Ngày</th><th>Phiếu</th><th>Chi nhánh</th><th>Quà</th><th>Ghi chú</th></tr></thead><tbody>
              {outs.map((d) => <tr key={d.id}><td>{dmy(d.docDate)}</td><td className="mono">{d.docNo}</td><td>{names.branchName(d.branchCode)}</td><td>{d.lines.map((l) => `${l.sku} × ${l.qty}${l.program ? ` (${l.program})` : ''}`).join(', ')}</td><td>{d.note}</td></tr>)}
            </tbody></table>
          </div>
        )}
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Hạch toán: quà NCC tặng không hoá đơn Nợ 1561 (kho quà) / Có 711 theo giá trị hợp lý; quà tự mua như hàng mua (có VAT thì 1331); xuất tặng Nợ 641 / Có 1561 theo giá vốn.</div>
      </>}
    </>
  );
}
