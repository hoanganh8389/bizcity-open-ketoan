/**
 * TÍNH THƯỞNG CUỐI KỲ (MH06) — thưởng doanh số theo kỳ, chỉ tiêu nhãn tháng / quý / năm, thưởng theo giai đoạn trong tháng.
 * Chọn chính sách + kỳ → máy chủ cộng doanh số mua thuần từ phiếu đã duyệt (nhập − trả, trước thuế) → ngưỡng đạt → tiền
 * thưởng → phân bổ theo mã (theo doanh số mua) → "Tạo phiếu thưởng" (nháp, duyệt ở MH11: giảm công nợ NCC, giảm giá trị
 * hàng nhập — giá vốn bình quân tháng tự chia cho hàng còn tồn và hàng đã bán). NCC chốt số khác thì nhập doanh số tay.
 * Một chính sách + một kỳ chỉ một phiếu (chặn tính trùng). Hoá đơn gốc giữ nguyên.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { POLICY_LABEL, brandShare } from '@ketoan/contracts/mua-hang';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { P, purchaseApi, today, useMuaHang, useNames, vnd } from '../du-lieu';
import { ruleText } from '../chinh-sach/quyTac';
import '../mua-hang.css';

interface Overview { policy: string; name: string; kind: string; brandCode?: string; partnerCode?: string; period: string; base: number; target: number | null; completion: number | null; rate: number; amount: number; doc: { id: string; docNo: string; status: string; amount: number; diff: number } | null }
interface Preview { policy: string; period: string; from: string; to: string; docsTotal: number; base: number; rate: number; amount: number; detail: string[]; allocation: { sku: string; name: string; purchased: number; qty: number; onHand: number; amount: number; stock: number; sold: number }[]; existing: { id: string; docNo: string } | null }
const periodOf = (kind: string, d = today()) => (kind === 'year' ? d.slice(0, 4) : kind === 'quarter' ? `${d.slice(0, 4)}-Q${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1}` : d.slice(0, 7));

export function ThuongPage() {
  const { data, isLoading, refresh } = useMuaHang();
  const names = useNames();
  const rebates = (data?.policies ?? []).filter((p) => ['period_rebate', 'target_rebate', 'stage_rebate'].includes(p.kind) && p.isActive);
  const [code, setCode] = useState('');
  const p = rebates.find((x) => x.code === code) ?? rebates[0];
  const [period, setPeriod] = useState('');
  const per = period || (p ? periodOf(String(p.rule.period ?? 'month')) : '');
  const [manual, setManual] = useState<number | undefined>();
  const [partner, setPartner] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [vat, setVat] = useState('');
  const [month, setMonth] = useState(today().slice(0, 7));
  const ov = useQuery({ queryKey: ['mua-hang', 'rebate-overview', month], queryFn: () => api.get<Overview[]>(`${P}/rebates/overview`, { month }) });
  const q = useQuery({ queryKey: ['mua-hang', 'rebate', p?.code, per, manual], enabled: Boolean(p && per), queryFn: () => api.post<Preview>(`${P}/rebates/preview`, { policyCode: p!.code, period: per, manualTotal: manual }) });
  const r = q.data;
  const partnerCode = p?.scope.partnerCode ?? partner;

  const create = async () => {
    if (!p || !r || !partnerCode) return;
    setMsg(null);
    try {
      const doc = await purchaseApi.save({
        id: `new-${Date.now()}`, kind: 'rebate', status: 'draft', docNo: '', docDate: r.to > today() ? today() : r.to, branchCode: data?.docs.find((d) => d.partnerCode === partnerCode)?.branchCode ?? '', partnerCode, brandCode: p.scope.brandCode,
        priceIncludesVat: false, lines: [], amount: r.amount, taxCode: vat || undefined, rebate: { policyCode: p.code, period: per, base: r.base, rate: r.rate, detail: r.detail },
        allocation: r.allocation.map((a) => ({ sku: a.sku, name: a.name, amount: a.amount })), note: `${p.name} — kỳ ${per}`,
      });
      setMsg({ ok: true, text: `Đã tạo phiếu thưởng ${doc.docNo} (nháp) — mở ở Chứng từ mua hàng → Chi phí / thưởng để duyệt (ghi sổ).` });
      void q.refetch(); void ov.refetch(); void refresh();
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); }
  };

  return (
    <>
      <PageHeader title="Tính thưởng cuối kỳ" code="MH06" helpKey="mua-hang-thuong" subtitle="Thưởng doanh số, chỉ tiêu nhãn tháng / quý / năm, thưởng theo giai đoạn — tính từ phiếu đã duyệt, phân bổ theo mã, lập phiếu" />
      <div className="card" style={{ marginBottom: 10 }}>
        <div className="row" style={{ padding: '8px 12px', gap: 8, alignItems: 'center' }}>
          <b>Tổng hợp thưởng theo tháng</b>
          <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value || today().slice(0, 7))} />
          <span className="muted" style={{ fontSize: 12 }}>Mọi chính sách thưởng đang áp; chỉ tiêu quý / năm tính theo kỳ chứa tháng này. Bấm một dòng để xem chi tiết bên dưới.</span>
        </div>
        {ov.isLoading ? <Loading /> : (
          <div className="table-wrap" style={{ maxHeight: 260 }}><table className="grid"><thead><tr><th>Chính sách</th><th>Kỳ</th><th className="num">Doanh số mua thuần</th><th className="num">Chỉ tiêu</th><th className="num">Hoàn thành</th><th className="num">Mức</th><th className="num">Được hưởng</th><th>Phiếu thưởng</th></tr></thead><tbody>
            {(ov.data ?? []).map((o) => (
              <tr key={o.policy + o.period} style={{ cursor: 'pointer' }} className={o.policy === p?.code ? 'selected' : ''} onClick={() => { setCode(o.policy); setPeriod(o.period); setManual(undefined); setMsg(null); }}>
                <td>{o.policy} <span className="muted">{o.name}</span></td><td className="mono">{o.period}</td><td className="num">{vnd(o.base)}</td><td className="num">{o.target ? vnd(o.target) : ''}</td>
                <td className="num">{o.completion !== null ? `${Number(o.completion).toLocaleString('vi-VN')}%` : ''}</td><td className="num">{o.kind === 'stage_rebate' ? 'giai đoạn' : `${Number(o.rate).toLocaleString('vi-VN')}%`}</td><td className="num"><b>{vnd(o.amount)}</b></td>
                <td>{o.doc ? <span>{o.doc.docNo} · {o.doc.status === 'approved' ? <span className="mh-ok">đã hạch toán</span> : <span className="mh-warn">chưa duyệt</span>}{o.doc.diff ? <span className="mh-bad"> · chênh {vnd(o.doc.diff)}</span> : null}</span> : o.amount ? <span className="mh-warn">chưa lập</span> : <span className="muted">chưa đạt</span>}</td>
              </tr>
            ))}
            {!(ov.data ?? []).length && <tr><td colSpan={8} className="muted">Chưa có chính sách thưởng</td></tr>}
          </tbody></table></div>
        )}
      </div>
      {isLoading ? <Loading /> : !p ? <div className="alert alert-info">Chưa có chính sách thưởng — thêm ở Chính sách mua hàng (MH04): Thưởng doanh số theo kỳ / Thưởng theo chỉ tiêu nhãn / Thưởng theo giai đoạn.</div> : (
        <div className="mh-grid2" style={{ gridTemplateColumns: '360px minmax(0,1fr)' }}>
          <div className="card card-body">
            <div className="field"><label>Chính sách thưởng</label>
              <select className="select input" value={p.code} onChange={(e) => { setCode(e.target.value); setPeriod(''); setManual(undefined); setMsg(null); }}>{rebates.map((x) => <option key={x.code} value={x.code}>{x.code} — {x.name}</option>)}</select>
            </div>
            <div className="muted" style={{ fontSize: 12, margin: '6px 0' }}>{POLICY_LABEL[p.kind]} · {p.scope.brandCode ? `nhãn ${p.scope.brandCode}` : ''}{p.scope.partnerCode ? ` · ${names.partnerName(p.scope.partnerCode)}` : ''}</div>
            <div className="mh-check info">{ruleText(p)}</div>
            <div className="field" style={{ marginTop: 8 }}><label>Kỳ (YYYY-MM · YYYY-Qn · YYYY)</label><input className="input mono" value={per} onChange={(e) => setPeriod(e.target.value.trim())} /></div>
            {p.kind !== 'stage_rebate'
              ? <div className="field"><label>Doanh số NCC chốt (để trống = tính từ phiếu)</label><input className="input num" value={manual === undefined ? '' : manual.toLocaleString('vi-VN')} placeholder={r ? vnd(r.docsTotal) : ''} onChange={(e) => setManual(e.target.value ? Number(e.target.value.replace(/\./g, '')) || 0 : undefined)} /></div>
              : <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Thưởng giai đoạn tính theo doanh số từng ngày của phiếu đã duyệt (hàng trả lại tự trừ đúng ngày).</div>}
            <div className="field"><label>Hoá đơn điều chỉnh giảm của NCC</label><select className="select input" value={vat} onChange={(e) => setVat(e.target.value)}><option value="">Không có — chỉ giảm giá trị hàng</option><option value="V05">Có — giảm VAT 5%</option><option value="V08">Có — giảm VAT 8%</option><option value="V10">Có — giảm VAT 10%</option></select></div>
            {!p.scope.partnerCode && <div className="field"><label>Nhà cung cấp trả thưởng (*)</label><select className="select input" value={partner} onChange={(e) => setPartner(e.target.value)}><option value="">— chọn —</option>{[...new Set((data?.docs ?? []).filter((d) => !p.scope.brandCode || brandShare(d, p.scope.brandCode) > 0).map((d) => d.partnerCode))].map((c) => <option key={c} value={c}>{names.partnerName(c)}</option>)}</select></div>}
          </div>
          <div>
            {q.error && <ErrorBox error={errorText(q.error)} />}
            {q.isLoading || !r ? <Loading /> : <>
              <div className="kpis">
                <div className="card kpi"><div className="label">Doanh số mua thuần {manual !== undefined ? '(NCC chốt)' : '(từ phiếu)'}</div><div className="value">{vnd(r.base)}</div><div className="hint">{r.from.split('-').reverse().join('/')} – {r.to.split('-').reverse().join('/')} · từ phiếu: {vnd(r.docsTotal)}</div></div>
                <div className="card kpi"><div className="label">Mức thưởng</div><div className="value">{p.kind === 'stage_rebate' ? 'theo giai đoạn' : `${Number(r.rate).toLocaleString('vi-VN')}%`}</div></div>
                <div className="card kpi"><div className="label">Tiền thưởng</div><div className="value mh-ok">{vnd(r.amount)}</div><div className="hint">{vat ? `VAT ${vat.slice(1)}%: ${vnd(Math.round(r.amount * Number(vat.slice(1)) / 100))} · tổng giảm công nợ ${vnd(r.amount + Math.round(r.amount * Number(vat.slice(1)) / 100))}` : 'Không có hoá đơn điều chỉnh: giảm công nợ đúng số thưởng'}</div></div>
              </div>
              <div className="card card-body" style={{ marginBottom: 10 }}>
                <h4 style={{ margin: '0 0 6px' }}>Cách tính</h4>
                {r.detail.map((d, i) => <div key={i} className="mh-check info">{d}</div>)}
              </div>
              <div className="card card-body">
                <h4 style={{ margin: '0 0 6px' }}>Phân bổ thưởng theo mã (theo doanh số mua trong kỳ)</h4>
                <table className="mh-mini"><thead><tr><th>Mã hàng</th><th className="num">Doanh số mua</th><th className="num">SL mua</th><th className="num">Còn tồn</th><th className="num">Thưởng phân bổ</th><th className="num">→ phần hàng còn tồn</th><th className="num">→ phần đã bán</th><th className="num">Giảm / ĐVT</th></tr></thead><tbody>
                  {r.allocation.map((a) => <tr key={a.sku}><td>{a.sku} <span className="muted">{a.name}</span></td><td className="num">{vnd(a.purchased)}</td><td className="num">{a.qty}</td><td className="num">{a.onHand}</td><td className="num"><b>{vnd(a.amount)}</b></td><td className="num">{vnd(a.stock)}</td><td className="num">{vnd(a.sold)}</td><td className="num">{a.qty ? vnd(a.amount / a.qty) : ''}</td></tr>)}
                  {!r.allocation.length && <tr><td colSpan={8} className="muted">Kỳ này chưa có phiếu nhập đã duyệt khớp chính sách.</td></tr>}
                  <tr><td><b>Cộng</b></td><td className="num">{vnd(r.allocation.reduce((s, a) => s + a.purchased, 0))}</td><td /><td /><td className={`num ${r.allocation.reduce((s, a) => s + a.amount, 0) === r.amount ? 'mh-ok' : 'mh-bad'}`}>{vnd(r.allocation.reduce((s, a) => s + a.amount, 0))}</td><td className="num">{vnd(r.allocation.reduce((s, a) => s + a.stock, 0))}</td><td className="num">{vnd(r.allocation.reduce((s, a) => s + a.sold, 0))}</td><td /></tr>
                </tbody></table>
                <div className="row" style={{ gap: 8, marginTop: 8, alignItems: 'center' }}>
                  <button className="btn btn-primary btn-sm" disabled={!r.amount || !r.allocation.length || Boolean(r.existing) || !partnerCode} onClick={() => void create()}>Tạo phiếu thưởng</button>
                  {r.existing ? <span className="mh-warn">Kỳ này đã có phiếu {r.existing.docNo} — chặn tính trùng (huỷ / bỏ duyệt phiếu cũ để tính lại khi có hàng trả, HĐ điều chỉnh)</span> : <span className="muted" style={{ fontSize: 12 }}>Khi duyệt: Nợ 331 / Có 1561 theo từng mã; giá vốn bình quân tháng tự chia cho hàng còn tồn và hàng đã bán (632).</span>}
                </div>
                {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'}`} style={{ marginTop: 6 }}>{msg.text}</div>}
              </div>
            </>}
          </div>
        </div>
      )}
    </>
  );
}
