// [2026-11-11 Nguyễn Văn Thủy] KHAI THUẾ (ACC66) làm lại theo mẫu chuẩn: danh sách tờ khai → Lập tờ khai (chọn kỳ, phụ lục) → hộp tờ khai (đóng góp)
/**
 * Bố cục đúng như phần mềm mẫu, không thêm phần giải thích:
 *   Trang: thanh trên (Thiết lập thông tin cơ quan thuế · Tải lại · Khai bổ sung ▾ · Lập tờ khai ▾), bảng "Tờ khai tháng / quý"
 *          (Kỳ kê khai, Loại tờ khai, Thông tư áp dụng, Trạng thái, Chức năng: Xem ▾ Đánh dấu TCT chấp nhận / Xoá),
 *          khung phải "Tờ khai cần lập tháng này / năm nay"; chưa có tờ khai thì "Hiện tại chưa có tờ khai nào…".
 *   Chọn kỳ tính thuế: Tháng (Quý), Năm, Danh mục ngành nghề, Chọn phụ lục kê khai, Lấy lên HHDV mua vào thuộc nhóm 4.
 *   Hộp tờ khai: thẻ Tờ khai + phụ lục đã chọn (+ Phụ lục), Chọn CT không tính thuế, Lấy lại dữ liệu; cuối tờ khai Nhân viên đại lý
 *          thuế, Người ký, Ngày ký; chân Hủy · Ghi · Ghi và In; xem: In ▾ · Tiện ích ▾ · Sửa.
 * Số tờ khai, bảng kê, phụ lục lấy từ /api/v1/vat-returns/build (sổ hoá đơn); "Tiện ích" giữ các bảng kiểm tra (hoá đơn mua vào
 * từ 5 triệu, chi tiết theo thuế suất, đối chiếu sổ cái) và Xuất Excel.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, RefreshCw, Settings } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { date, money, today } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { Empty, ErrorBox, Field, Loading, Modal, Money } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { PrintButton } from '@/components/print';
import { VAT_RETURN_TEMPLATES } from '../mauIn/baoCaoThue';
import { BangKe, BKBR_GROUPS, BKMV_GROUPS, MANUAL, SupplementDialog, computeForm, type BkRow, type FormLine, type Manual } from './StatementPages';

type Kind = 'month' | 'quarter';
type Appx = 'BKBR' | 'BKMV' | 'PL204';
const APPX: { code: Appx; ma: string; ten: string }[] = [
  { code: 'BKBR', ma: 'BKBR_01-1/GTGT', ten: 'Bảng kê bán ra thuế GTGT' },
  { code: 'BKMV', ma: 'BKMV_01-2/GTGT', ten: 'Bảng kê mua vào thuế GTGT' },
  { code: 'PL204', ma: 'PL 142/2024/QH15-174/2024/QH15-204/2025/QH15', ten: 'Giảm thuế giá trị gia tăng theo Nghị quyết 204/2025/QH15' },
];
const TAB_NAME: Record<Appx, string> = { BKBR: 'BKBR_01-1/GTGT', BKMV: 'BKMV_01-2/GTGT', PL204: 'PL 204/2025/QH15' };
const NGANH = ['Hoạt động sản xuất kinh doanh thông thường'];
const THONG_TU = 'TT80/2021/TT-BTC';

interface Info { activity?: string; appendices?: Appx[]; group4?: boolean; excluded?: string[]; signer?: string; signDate?: string; agentStaff?: string; agentCert?: string }
interface Saved { periodKind: Kind; year: number; period: number; label: string; scope: string; status: 'draft' | 'final'; revision: number; info: Info; updatedAt: string }
type Row = BkRow & { id: string };
interface VatData {
  form: FormLine[]; label: string; from: string; to: string; scope: string;
  values: Record<string, number>; auto: Record<string, number>; manual: Manual;
  saved: { status: 'draft' | 'final'; revision: number; values: Record<string, number> } | null;
  previous: { carried43: number | null } | null;
  breakdown: { direction: string; group: string; rate: number; amount: number; tax: number; invoices: number; line: string }[];
  reduced: { rows: { name: string; amount: number; tax: number; reducedTax: number }[]; totals: { amount: number; tax: number; reducedTax: number }; inputRows: { name: string; amount: number; tax: number }[]; inputTotals: { amount: number; tax: number } };
  salesList: Row[]; purchaseList: Row[]; excludedList: Row[];
  bigPurchases: { invoiceNo: string; serial: string; date: string; seller: string; taxCode: string; docNo: string; branchCode: string; total: number; tax: number }[];
  ledger: { input: number; output: number; carried: number };
  info: Info;
}
interface Open { kind: Kind; year: number; period: number; appendices: Appx[]; group4: boolean; activity: string; seq: number }

const kyText = (k: Kind, y: number, p: number) => (k === 'month' ? `Tháng ${p} năm ${y}` : `Quý ${p} năm ${y}`);

/* ------------------------------------------------------------------ trang danh sách */
export function KhaiThuePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = useAuth();
  const write = can('documents:write');
  const list = useQuery({ queryKey: ['vat-returns'], queryFn: () => api.get<Saved[]>('/api/v1/vat-returns') });
  const [chon, setChon] = useState(false);
  const [open, setOpen] = useState<Open | null>(null);
  const [bs, setBs] = useState<Saved | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const reload = () => { void qc.invalidateQueries({ queryKey: ['vat-returns'] }); void qc.invalidateQueries({ queryKey: ['vat-return'] }); };
  const act = useMutation({
    mutationFn: ({ s, kind }: { s: Saved; kind: 'accept' | 'delete' }) => {
      const q = { periodKind: s.periodKind, year: s.year, period: s.period, scope: s.scope, revision: s.revision };
      return kind === 'accept' ? api.post('/api/v1/vat-returns/accept', q) : api.delete(`/api/v1/vat-returns?${new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)])).toString()}`);
    },
    onSuccess: reload,
  });
  const rows = list.data ?? [];
  const xem = (s: Saved) => setOpen({ kind: s.periodKind, year: s.year, period: s.period, appendices: s.info?.appendices ?? ['BKBR', 'BKMV'], group4: Boolean(s.info?.group4), activity: s.info?.activity ?? NGANH[0]!, seq: Date.now() });
  const now = new Date();

  const canLap = (
    <div className="kt-can-lap">
      <h3>Tờ khai cần lập tháng này</h3>
      <div>01/GTGT - Tờ khai thuế GTGT khấu trừ</div>
      {write && <a href="#" onClick={(e) => { e.preventDefault(); setChon(true); }}>Lập tờ khai</a>}
      <h3>Tờ khai cần lập năm nay</h3>
      <div>03/TNDN - Tờ khai quyết toán thuế TNDN</div>
      <a href="#" onClick={(e) => { e.preventDefault(); navigate('/thue/quyet-toan-tndn'); }}>Lập tờ khai</a>
    </div>
  );
  const finals = rows.filter((r) => r.status === 'final');

  return (
    <div className="page" onClick={() => menu && setMenu(null)}>
      <PageHeader title="Khai thuế" code="ACC66" helpKey="to-khai-gtgt" />
      <div className="card kt-bar">
        <a href="#" onClick={(e) => { e.preventDefault(); navigate('/thue/nguoi-nop-thue'); }}><Settings size={14} /> Thiết lập thông tin cơ quan thuế, tổ chức, cá nhân cung cấp dịch vụ thuế</a>
        <a href="#" onClick={(e) => { e.preventDefault(); reload(); }}><RefreshCw size={14} /> Tải lại</a>
        <span style={{ marginLeft: 'auto' }} />
        <span className="kt-dd">
          <button className="btn" disabled={!write || !finals.length} title={finals.length ? 'Lập tờ khai bổ sung cho kỳ đã được cơ quan thuế chấp nhận' : 'Chưa có tờ khai đã được chấp nhận'} onClick={(e) => { e.stopPropagation(); setMenu(menu === 'kbs' ? null : 'kbs'); }}>Khai bổ sung <ChevronDown size={14} /></button>
          {menu === 'kbs' && <div className="kt-pop">{finals.map((s) => <button key={`${s.periodKind}${s.year}${s.period}${s.scope}${s.revision}`} onClick={() => setBs(s)}>{kyText(s.periodKind, s.year, s.period)}{s.revision ? ` (bổ sung lần ${s.revision})` : ''}</button>)}</div>}
        </span>
        <span className="kt-dd">
          <span className="vf-split">
            <button className="btn btn-primary" disabled={!write} onClick={() => setChon(true)}>Lập tờ khai</button>
            <button className="btn btn-primary" disabled={!write} style={{ paddingInline: 8, marginLeft: 1 }} onClick={(e) => { e.stopPropagation(); setMenu(menu === 'lap' ? null : 'lap'); }}><ChevronDown size={14} /></button>
          </span>
          {menu === 'lap' && <div className="kt-pop"><button onClick={() => setChon(true)}>Tờ khai thuế GTGT khấu trừ (01/GTGT)</button><button onClick={() => navigate('/thue/quyet-toan-tndn')}>Tờ khai quyết toán thuế TNDN năm (03/TNDN)</button></div>}
        </span>
      </div>
      <ErrorBox error={list.error ? errorText(list.error) : act.error ? errorText(act.error) : null} />
      {list.isLoading ? <Loading /> : !rows.length ? (
        <div className="card kt-empty">
          <h2>Hiện tại chưa có tờ khai nào, bạn hãy lập tờ khai</h2>
          {canLap}
        </div>
      ) : (
        <div className="kt-main">
          <div className="card kt-list">
            {(['month', 'quarter'] as const).map((k) => {
              const rs = rows.filter((r) => r.periodKind === k);
              if (!rs.length) return null;
              return (
                <div key={k}>
                  <h3>{k === 'month' ? 'Tờ khai tháng' : 'Tờ khai quý'}</h3>
                  <table className="grid">
                    <thead><tr><th>Kỳ kê khai</th><th style={{ width: 150 }}>Loại tờ khai</th><th style={{ width: 170 }}>Thông tư áp dụng</th><th style={{ width: 170 }}>Trạng thái</th><th style={{ width: 120 }}>Chức năng</th></tr></thead>
                    <tbody>
                      <tr className="bold"><td colSpan={5}>01/GTGT - Tờ khai thuế GTGT khấu trừ</td></tr>
                      {rs.map((s) => {
                        const key = `${s.periodKind}${s.year}${s.period}${s.scope}${s.revision}`;
                        return (
                          <tr key={key} className="clickable" onDoubleClick={() => xem(s)}>
                            <td style={{ paddingLeft: 22 }}>{kyText(s.periodKind, s.year, s.period)}{s.scope ? ` (${s.scope})` : ''}</td>
                            <td>{s.revision ? `Bổ sung lần ${s.revision}` : 'Lần đầu'}</td>
                            <td>{THONG_TU}</td>
                            <td>{s.status === 'final' ? <span className="badge badge-ok">TCT đã chấp nhận</span> : 'Chưa nộp tờ khai'}</td>
                            <td className="kt-dd" onClick={(e) => e.stopPropagation()}>
                              <a href="#" onClick={(e) => { e.preventDefault(); xem(s); }}>Xem</a>
                              <button className="kt-caret" onClick={() => setMenu(menu === key ? null : key)} aria-label="Chức năng"><ChevronDown size={14} /></button>
                              {menu === key && (
                                <div className="kt-pop">
                                  <button onClick={() => { setMenu(null); xem(s); }}>Xem</button>
                                  {write && s.status !== 'final' && <button onClick={() => { setMenu(null); if (confirm(`Đánh dấu cơ quan thuế đã chấp nhận tờ khai ${kyText(s.periodKind, s.year, s.period)}? Sau đó muốn sửa số phải lập tờ khai bổ sung.`)) act.mutate({ s, kind: 'accept' }); }}>Đánh dấu TCT chấp nhận</button>}
                                  {write && s.status !== 'final' && <button className="text-bad" onClick={() => { setMenu(null); if (confirm(`Xoá tờ khai ${kyText(s.periodKind, s.year, s.period)}?`)) act.mutate({ s, kind: 'delete' }); }}>Xóa</button>}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
            <div className="kt-total">Tổng số: <b>{rows.length}</b> tờ khai đã lập</div>
          </div>
          <div className="card kt-side">{canLap}</div>
        </div>
      )}
      {chon && <ChonKy defaults={{ year: now.getFullYear(), month: now.getMonth() + 1 }} onClose={() => setChon(false)} onOk={(o) => { setChon(false); setOpen(o); }} />}
      {open && <ToKhai key={open.seq} o={open} existing={rows.find((r) => r.periodKind === open.kind && r.year === open.year && r.period === open.period && !r.scope)} onClose={() => setOpen(null)} onSaved={reload} />}
      {bs && <SupplementDialog f={{ periodKind: bs.periodKind, year: bs.year, period: bs.period, branchCodes: bs.scope }} manual={{}} label={kyText(bs.periodKind, bs.year, bs.period)} onClose={() => setBs(null)} onSaved={() => { setBs(null); reload(); }} />}
    </div>
  );
}

/* ------------------------------------------------------------------ chọn kỳ tính thuế */
function ChonKy({ defaults, onClose, onOk }: { defaults: { year: number; month: number }; onClose: () => void; onOk: (o: Open) => void }) {
  const [kind, setKind] = useState<Kind>('month');
  const [period, setPeriod] = useState(defaults.month);
  const [year, setYear] = useState(defaults.year);
  const [activity, setActivity] = useState(NGANH[0]!);
  const [pick, setPick] = useState<Appx[]>(['BKBR', 'BKMV']);
  const [group4, setGroup4] = useState(false);
  const toggle = (c: Appx) => setPick((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  return (
    <Modal title="Chọn kỳ tính thuế" onClose={onClose}
      footer={<>
        <label style={{ marginRight: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={group4} onChange={(e) => setGroup4(e.target.checked)} /> Lấy lên HHDV mua vào thuộc nhóm 4 - Hàng hóa, dịch vụ không đủ điều kiện được khấu trừ</label>
        <button className="btn" onClick={onClose}>Hủy</button>
        <button className="btn btn-primary" onClick={() => onOk({ kind, year, period, appendices: APPX.map((a) => a.code).filter((c) => pick.includes(c)), group4, activity, seq: Date.now() })}>Đồng ý</button>
      </>}>
      <div className="full">Tờ khai: <b>Tờ khai thuế GTGT khấu trừ (01/GTGT)</b></div>
      <Field label="Kỳ kê khai">
        <select className="select input" value={kind} onChange={(e) => { const k = e.target.value as Kind; setKind(k); setPeriod(k === 'month' ? defaults.month : Math.ceil(defaults.month / 3)); }}>
          <option value="month">Theo tháng</option><option value="quarter">Theo quý</option>
        </select>
      </Field>
      <Field label={kind === 'month' ? 'Tháng' : 'Quý'}>
        <select className="select input" value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
          {Array.from({ length: kind === 'month' ? 12 : 4 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
        </select>
      </Field>
      <Field label="Năm"><input className="input" type="number" min={2000} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value) || defaults.year)} /></Field>
      <Field label="Danh mục ngành nghề" full>
        <select className="select input" value={activity} onChange={(e) => setActivity(e.target.value)}>{NGANH.map((n) => <option key={n}>{n}</option>)}</select>
      </Field>
      <div className="full">
        <div style={{ fontWeight: 600, margin: '6px 0' }}>Chọn phụ lục kê khai</div>
        <table className="grid">
          <thead><tr><th style={{ width: 36 }}><input type="checkbox" checked={pick.length === APPX.length} onChange={(e) => setPick(e.target.checked ? APPX.map((a) => a.code) : [])} /></th><th style={{ width: 330 }}>Mã phụ lục</th><th>Tên phụ lục</th></tr></thead>
          <tbody>{APPX.map((a) => <tr key={a.code} className="clickable" onClick={() => toggle(a.code)}><td><input type="checkbox" checked={pick.includes(a.code)} readOnly /></td><td>{a.ma}</td><td>{a.ten}</td></tr>)}</tbody>
        </table>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ hộp tờ khai */
function ToKhai({ o, existing, onClose, onSaved }: { o: Open; existing?: Saved; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [appx, setAppx] = useState<Appx[]>(o.appendices);
  const [tab, setTab] = useState<'TK' | Appx>('TK');
  const [excluded, setExcluded] = useState<string[] | undefined>(undefined);
  const params = { periodKind: o.kind, year: o.year, period: o.period, ...(excluded ? { excluded: excluded.join(',') } : {}) };
  const q = useQuery({ queryKey: ['vat-return', params], queryFn: () => api.get<VatData>('/api/v1/vat-returns/build', params) });
  const taxpayer = useQuery({ queryKey: ['taxpayer'], queryFn: () => api.get<{ name?: string; taxCode?: string; agentName?: string; agentTaxCode?: string; agentContract?: string; signer?: string }>('/api/v1/taxpayer'), staleTime: 60_000 });
  const d = q.data;
  const [manual, setManual] = useState<Manual>({});
  const [info, setInfo] = useState<Info>({});
  const [loaded, setLoaded] = useState(false);
  const [ctOpen, setCtOpen] = useState(false);
  const [tienIch, setTienIch] = useState<null | 'mua-vao' | 'thue-suat' | 'so-cai'>(null);
  useEffect(() => {
    if (!d || loaded) return;
    setManual(d.manual);
    const sv = existing ? d.info : {};
    setInfo({ activity: o.activity, group4: o.group4, ...sv, appendices: existing ? (sv.appendices ?? o.appendices) : o.appendices, signer: sv.signer || taxpayer.data?.signer || '', signDate: sv.signDate || today(), excluded: sv.excluded });
    if (existing && sv.appendices) setAppx(sv.appendices);
    if (existing) setExcluded(sv.excluded ?? []);
    setLoaded(true);
  }, [d, loaded, existing, o, taxpayer.data]);
  const final = existing?.status === 'final';
  // Khung hộp giữ cố định từ lúc mở: ghi xong danh sách nạp lại (existing đổi) không dựng lại hộp — lệnh In sau Ghi không bị mất.
  const [moXem] = useState(() => Boolean(existing) && existing?.status !== 'final');
  const recomputed = useMemo(() => (d ? computeForm(d.auto, manual) : {}), [d, manual]);
  const values = final && d?.saved ? d.saved.values : recomputed;
  const group4 = Boolean(info.group4);
  const purchases = (d?.purchaseList ?? []).filter((r) => group4 || r.group !== 4);
  const save = useMutation({
    mutationFn: () => api.put('/api/v1/vat-returns', { periodKind: o.kind, year: o.year, period: o.period, status: 'draft', manual, info: { ...info, appendices: appx, excluded: excluded ?? info.excluded ?? [] } }),
    onSuccess: () => { onSaved(); void qc.invalidateQueries({ queryKey: ['vat-return'] }); },
  });
  const editable = (k?: string) => Boolean(k && (MANUAL as readonly string[]).includes(k)) && can('documents:write') && !final;
  const cell = (k?: string): ReactNode => {
    if (!k) return null;
    if (k === '21') return <input type="checkbox" checked={Boolean(manual['21'])} disabled={!editable(k)} onChange={(e) => setManual((m) => ({ ...m, '21': e.target.checked ? 1 : 0 }))} />;
    if (editable(k)) {
      const val = manual[k as keyof Manual];
      return <input className="input num" inputMode="numeric" value={val === undefined ? '' : money(val, { blankZero: false })} placeholder={k === '25' ? money(d?.auto['25'] ?? values['24'] ?? 0, { blankZero: false }) : '0'}
        onChange={(e) => { const s = e.target.value.replace(/[^\d-]/g, ''); setManual((m) => ({ ...m, [k]: s === '' ? undefined : Number(s) })); }} />;
    }
    const v = values[k] ?? 0;
    return <span className={v < 0 ? 'text-bad' : undefined}>{v < 0 ? `(${money(-v, { blankZero: false })})` : money(v, { blankZero: false })}</span>;
  };
  const docs = () => (d ? [{ label: d.label, from: d.from, to: d.to, branchCodes: '', status: existing?.status ?? null, revision: d.saved?.revision ?? 0, form: d.form, values, reduced: d.reduced, signer: info.signer, signDate: info.signDate, salesList: d.salesList, purchaseList: purchases, appendices: appx, group4 }] : []);
  const ghi = (andPrint: boolean) => save.mutate(undefined, { onSuccess: () => { if (andPrint) (document.querySelector('.kt-in button') as HTMLButtonElement | null)?.click(); } });
  const exportExcel = () => d && void xuatExcel(d, values, purchases, group4);

  const body = !d ? (q.error ? <ErrorBox error={errorText(q.error)} /> : <Loading />) : (
    <div className="kt-body">
      <div className="tabs kt-tabs">
        <button className={`tab ${tab === 'TK' ? 'active' : ''}`} onClick={() => setTab('TK')}>Tờ khai</button>
        {appx.map((a) => <button key={a} className={`tab ${tab === a ? 'active' : ''}`} onClick={() => setTab(a)}>{TAB_NAME[a]}</button>)}
        {!final && APPX.some((a) => !appx.includes(a.code)) && (
          <select className="select input kt-add" value="" onChange={(e) => { const c = e.target.value as Appx; if (c) { setAppx((x) => APPX.map((a) => a.code).filter((k) => x.includes(k) || k === c)); setTab(c); } }}>
            <option value="">+ Phụ lục</option>{APPX.filter((a) => !appx.includes(a.code)).map((a) => <option key={a.code} value={a.code}>{a.ma}</option>)}
          </select>
        )}
      </div>
      {save.error && <ErrorBox error={errorText(save.error)} />}
      {save.isSuccess && <div className="alert alert-ok">Đã ghi tờ khai {d.label}.</div>}
      {final && <div className="alert alert-info">Tờ khai đã được cơ quan thuế chấp nhận: muốn sửa số, lập tờ khai bổ sung (nút Khai bổ sung ở danh sách).</div>}
      {tab === 'TK' && (
        <div className="kt-form">
          {!final && <div className="kt-tools"><button className="btn btn-sm" onClick={() => setCtOpen(true)}>Chọn CT không tính thuế</button><button className="btn btn-sm" onClick={() => { setManual(d.previous?.carried43 != null ? { '22': d.previous.carried43 } : {}); void q.refetch(); }}>Lấy lại dữ liệu</button></div>}
          <div className="vat-title">TỜ KHAI THUẾ GIÁ TRỊ GIA TĂNG (01/GTGT)</div>
          <div className="muted" style={{ textAlign: 'center' }}>(Áp dụng đối với người nộp thuế tính thuế theo phương pháp khấu trừ có hoạt động sản xuất kinh doanh)</div>
          <div className="vat-info">
            <span>[01a] Tên hoạt động sản xuất kinh doanh</span>
            <select className="select input" style={{ maxWidth: 420 }} disabled={final} value={info.activity ?? NGANH[0]} onChange={(e) => setInfo({ ...info, activity: e.target.value })}>{NGANH.map((n) => <option key={n}>{n}</option>)}</select>
            <span>[01b] Kỳ tính thuế:</span><span>{kyText(o.kind, o.year, o.period)}</span>
            <span>[02] Lần đầu: <input type="checkbox" checked={!d.saved?.revision} readOnly /></span><span>[03] Bổ sung lần thứ: {d.saved?.revision || ''}</span>
            <span>[04] Tên người nộp thuế:</span><b>{taxpayer.data?.name ?? ''}</b>
            <span>[05] Mã số thuế:</span><b className="mono">{taxpayer.data?.taxCode ?? ''}</b>
            <span>[06] Tên đại lý thuế:</span><span>{taxpayer.data?.agentName ?? ''}</span>
            <span>[07] Mã số thuế:</span><span className="mono">{taxpayer.data?.agentTaxCode ?? ''}</span>
            <span>[08] Hợp đồng đại lý thuế:</span><span>{taxpayer.data?.agentContract ?? ''}</span>
          </div>
          <div style={{ textAlign: 'right', margin: '8px 0 4px' }}>Đồng Việt Nam</div>
          <table className="grid vat-form kt-tk">
            <thead><tr><th style={{ width: 50 }}>STT</th><th>Chỉ tiêu</th><th colSpan={2} style={{ width: 260 }}>Giá trị hàng hóa, dịch vụ (chưa có thuế giá trị gia tăng)</th><th colSpan={2} style={{ width: 260 }}>Thuế giá trị gia tăng</th></tr></thead>
            <tbody>
              {d.form.map((l, i) => (
                <tr key={i} className={l.bold ? 'bold' : ''}>
                  <td className="center">{l.stt}</td><td>{l.name}</td>
                  <td className="mono" style={{ width: 56 }}>{l.value ? `[${l.value}]` : ''}</td><td className="num">{cell(l.value)}</td>
                  <td className="mono" style={{ width: 56 }}>{l.tax ? `[${l.tax}]` : ''}</td><td className="num">{cell(l.tax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="kt-sign">
            <div><b>NHÂN VIÊN ĐẠI LÝ THUẾ</b></div><div />
            <Field label="Họ và tên"><input className="input" disabled={final} value={info.agentStaff ?? ''} onChange={(e) => setInfo({ ...info, agentStaff: e.target.value })} /></Field>
            <Field label="Người ký (*)"><input className="input" disabled={final} value={info.signer ?? ''} onChange={(e) => setInfo({ ...info, signer: e.target.value })} /></Field>
            <Field label="Chứng chỉ hành nghề số"><input className="input" disabled={final} value={info.agentCert ?? ''} onChange={(e) => setInfo({ ...info, agentCert: e.target.value })} /></Field>
            <Field label="Ngày ký (*)"><input className="input" type="date" disabled={final} value={info.signDate ?? ''} onChange={(e) => setInfo({ ...info, signDate: e.target.value })} /></Field>
          </div>
        </div>
      )}
      {tab === 'BKBR' && <BangKe rows={d.salesList} groups={BKBR_GROUPS} kind="ban" />}
      {tab === 'BKMV' && <BangKe rows={purchases} groups={group4 ? BKMV_GROUPS : BKMV_GROUPS.slice(0, 3)} kind="mua" />}
      {tab === 'PL204' && <PhuLuc204 d={d} />}
    </div>
  );

  return (
    <>
      <Modal wide title="Tờ khai thuế GTGT khấu trừ (01/GTGT)" onClose={onClose} viewFirst={moXem}
        viewActions={<><span className="kt-in"><PrintButton screen="ACC66" templates={VAT_RETURN_TEMPLATES} disabled={!d} getDocs={docs} /></span><TienIch onPick={setTienIch} onExcel={exportExcel} /></>}
        footer={final ? <><span className="kt-in"><PrintButton screen="ACC66" templates={VAT_RETURN_TEMPLATES} disabled={!d} getDocs={docs} /></span><TienIch onPick={setTienIch} onExcel={exportExcel} /><button className="btn" onClick={onClose}>Đóng</button></> : <>
          <span className="kt-in" style={{ display: 'none' }}><PrintButton screen="ACC66" templates={VAT_RETURN_TEMPLATES} disabled={!d} getDocs={docs} /></span>
          <button className="btn" onClick={onClose}>Hủy</button>
          <button className="btn" disabled={!d || save.isPending} onClick={() => ghi(false)}>Ghi</button>
          <button className="btn btn-primary" disabled={!d || save.isPending} onClick={() => ghi(true)}>Ghi và In</button>
        </>}>
        {body}
        {ctOpen && d && <ChonCt rows={[...d.salesList, ...d.excludedList]} chosen={excluded ?? d.excludedList.map((r) => r.id)} onClose={() => setCtOpen(false)} onOk={(ids) => { setCtOpen(false); setExcluded(ids); }} />}
        {tienIch && d && <TienIchView kind={tienIch} d={d} values={values} onClose={() => setTienIch(null)} />}
      </Modal>
    </>
  );
}

function TienIch({ onPick, onExcel }: { onPick: (k: 'mua-vao' | 'thue-suat' | 'so-cai') => void; onExcel: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="kt-dd" data-view-ok>
      <button type="button" className="btn" data-view-ok onClick={() => setOpen((x) => !x)}>Tiện ích <ChevronDown size={14} /></button>
      {open && (
        <div className="kt-pop kt-pop-up" data-view-ok onMouseLeave={() => setOpen(false)}>
          <button data-view-ok onClick={() => { setOpen(false); onExcel(); }}>Xuất Excel</button>
          <button data-view-ok onClick={() => { setOpen(false); onPick('mua-vao'); }}>Hoá đơn mua vào từ 5 triệu</button>
          <button data-view-ok onClick={() => { setOpen(false); onPick('thue-suat'); }}>Chi tiết theo thuế suất</button>
          <button data-view-ok onClick={() => { setOpen(false); onPick('so-cai'); }}>Đối chiếu sổ cái</button>
        </div>
      )}
    </span>
  );
}

function PhuLuc204({ d }: { d: VatData }) {
  const r = d.reduced;
  return (
    <div className="kt-form">
      <div className="vat-title">GIẢM THUẾ GIÁ TRỊ GIA TĂNG THEO NGHỊ QUYẾT SỐ 204/2025/QH15</div>
      <div style={{ textAlign: 'right' }}>Đơn vị tiền: Đồng Việt Nam</div>
      <div className="field-title">I. Hàng hóa, dịch vụ mua vào trong kỳ được áp dụng mức thuế suất thuế giá trị gia tăng 8%</div>
      <table className="grid">
        <thead><tr><th style={{ width: 50 }}>STT</th><th>Tên hàng hóa, dịch vụ</th><th className="num" style={{ width: 220 }}>Giá trị hàng hóa, dịch vụ chưa có thuế GTGT</th><th className="num" style={{ width: 180 }}>Thuế GTGT</th></tr></thead>
        <tbody>
          {r.inputRows.map((x, i) => <tr key={i}><td className="center">{i + 1}</td><td>{x.name}</td><td className="num"><Money value={x.amount} blankZero={false} /></td><td className="num"><Money value={x.tax} blankZero={false} /></td></tr>)}
          <tr className="bold"><td /><td>Tổng cộng</td><td className="num"><Money value={r.inputTotals.amount} blankZero={false} /></td><td className="num"><Money value={r.inputTotals.tax} blankZero={false} /></td></tr>
        </tbody>
      </table>
      <div className="field-title" style={{ marginTop: 12 }}>II. Hàng hóa, dịch vụ bán ra trong kỳ</div>
      <table className="grid">
        <thead><tr><th style={{ width: 50 }}>STT</th><th>Tên hàng hóa, dịch vụ</th><th className="num" style={{ width: 200 }}>Giá trị hàng hóa, dịch vụ chưa có thuế GTGT/ Doanh thu hàng hóa, dịch vụ chịu thuế</th><th style={{ width: 120 }}>Thuế suất theo quy định</th><th style={{ width: 120 }}>Thuế suất sau giảm</th><th className="num" style={{ width: 150 }}>Thuế GTGT được giảm</th></tr></thead>
        <tbody>
          {r.rows.map((x, i) => <tr key={i}><td className="center">{i + 1}</td><td>{x.name}</td><td className="num"><Money value={x.amount} blankZero={false} /></td><td className="center">10%</td><td className="center">8%</td><td className="num"><Money value={x.reducedTax} blankZero={false} /></td></tr>)}
          <tr className="bold"><td /><td>Tổng cộng</td><td className="num"><Money value={r.totals.amount} blankZero={false} /></td><td /><td /><td className="num"><Money value={r.totals.reducedTax} blankZero={false} /></td></tr>
        </tbody>
      </table>
      <div style={{ marginTop: 12 }}>III. Chênh lệch thuế GTGT của hàng hoá, dịch vụ bán ra và mua vào trong kỳ được áp dụng mức thuế suất thuế giá trị gia tăng 8%: [09] = [08] - [06]: <b>{money(r.totals.reducedTax - r.inputTotals.tax, { blankZero: false })}</b> đồng</div>
    </div>
  );
}

/** Chọn chứng từ hàng hóa, dịch vụ bán ra không tính thuế: tích hoá đơn → lên [32a], không lên bảng kê 01-1. */
function ChonCt({ rows, chosen, onClose, onOk }: { rows: Row[]; chosen: string[]; onClose: () => void; onOk: (ids: string[]) => void }) {
  const [sel, setSel] = useState(new Set(chosen));
  const [s, setS] = useState('');
  const shown = rows.filter((r) => !s || `${r.invoiceNo} ${r.docNo} ${r.name} ${r.taxCode}`.toLowerCase().includes(s.toLowerCase()));
  const tog = (id: string) => setSel((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <Modal wide title="Chọn chứng từ hàng hóa, dịch vụ bán ra không tính thuế" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn btn-primary" onClick={() => onOk([...sel])}>Đồng ý</button></>}>
      <div className="full kt-ct">
        <input className="input" style={{ width: 260, marginBottom: 8 }} placeholder="Nhập từ khóa tìm kiếm" value={s} onChange={(e) => setS(e.target.value)} />
        <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 300px)', overflow: 'auto' }}>
          <table className="grid">
            <thead><tr><th style={{ width: 36 }}><input type="checkbox" checked={shown.length > 0 && shown.every((r) => sel.has(r.id))} onChange={(e) => setSel((x) => { const n = new Set(x); shown.forEach((r) => (e.target.checked ? n.add(r.id) : n.delete(r.id))); return n; })} /></th>
              <th>Số hóa đơn</th><th>Ngày hóa đơn</th><th>Số chứng từ</th><th>Tên người mua</th><th>Mã số thuế</th><th className="num">Giá trị HHDV</th></tr></thead>
            <tbody>
              <tr className="bold"><td /><td>Tổng</td><td /><td /><td /><td /><td className="num"><Money value={shown.filter((r) => sel.has(r.id)).reduce((x, r) => x + r.amount, 0)} blankZero={false} /></td></tr>
              {shown.map((r) => <tr key={r.id} className="clickable" onClick={() => tog(r.id)}><td><input type="checkbox" checked={sel.has(r.id)} readOnly /></td><td className="mono">{r.invoiceNo}</td><td>{date(r.date)}</td><td className="mono">{r.docNo}</td><td>{r.name}</td><td className="mono">{r.taxCode}</td><td className="num"><Money value={r.amount} blankZero={false} /></td></tr>)}
            </tbody>
          </table>
          {!shown.length && <Empty text="Không có dữ liệu" />}
        </div>
      </div>
    </Modal>
  );
}

function TienIchView({ kind, d, values, onClose }: { kind: 'mua-vao' | 'thue-suat' | 'so-cai'; d: VatData; values: Record<string, number>; onClose: () => void }) {
  const title = kind === 'mua-vao' ? 'Hoá đơn mua vào từ 5 triệu' : kind === 'thue-suat' ? 'Chi tiết theo thuế suất' : 'Đối chiếu sổ cái';
  return (
    <Modal wide title={title} onClose={onClose} footer={<button className="btn" onClick={onClose}>Đóng</button>}>
      <div className="full">
        {kind === 'mua-vao' && (d.bigPurchases.length ? (
          <DataGrid storageKey="acc66-mua-vao" rows={d.bigPurchases} rowKey={(r, i) => `${r.serial}-${r.invoiceNo}-${i}`} exportName="hoa-don-mua-vao-tu-5-trieu" note="cần chứng từ thanh toán không dùng tiền mặt mới được khấu trừ"
            columns={[
              { key: 'date', header: 'Ngày HĐ', type: 'date' }, { key: 'serial', header: 'Ký hiệu', type: 'code' }, { key: 'invoiceNo', header: 'Số HĐ', type: 'code' },
              { key: 'seller', header: 'Người bán' }, { key: 'taxCode', header: 'Mã số thuế', type: 'code' }, { key: 'docNo', header: 'Số chứng từ', type: 'code' },
              { key: 'branchCode', header: 'Chi nhánh', type: 'code' }, { key: 'total', header: 'Tổng thanh toán', type: 'money', sum: true }, { key: 'tax', header: 'Thuế GTGT', type: 'money', sum: true },
            ] satisfies Column<VatData['bigPurchases'][number]>[]} />
        ) : <Empty text="Không có hoá đơn mua vào từ 5 triệu đồng trong kỳ" />)}
        {kind === 'thue-suat' && (
          <DataGrid storageKey="acc66-thue-suat" rows={d.breakdown} rowKey={(r, i) => `${r.direction}-${r.group}-${i}`} footerLabel={false}
            columns={[
              { key: 'direction', header: 'Chiều', value: (r) => (r.direction === 'input' ? 'Mua vào' : 'Bán ra') }, { key: 'group', header: 'Nhóm', type: 'code' },
              { key: 'rate', header: 'Thuế suất', value: (r) => `${r.rate}%` }, { key: 'invoices', header: 'Số hoá đơn', type: 'number' },
              { key: 'amount', header: 'Giá trị chưa thuế', type: 'money' }, { key: 'tax', header: 'Thuế GTGT', type: 'money' }, { key: 'line', header: 'Lên chỉ tiêu', type: 'code' },
            ] satisfies Column<VatData['breakdown'][number]>[]} />
        )}
        {kind === 'so-cai' && (
          <table className="grid" style={{ maxWidth: 760 }}>
            <thead><tr><th>So sánh với sổ kế toán</th><th className="num">Tờ khai</th><th className="num">Sổ cái</th><th className="num">Chênh lệch</th></tr></thead>
            <tbody>
              {([['Thuế GTGT mua vào [24] — phát sinh Nợ 133', values['24'] ?? 0, d.ledger.input], ['Thuế GTGT bán ra [28] — phát sinh Có 33311', values['28'] ?? 0, d.ledger.output], ['Thuế còn được khấu trừ kỳ trước [22] — dư Nợ 133 đầu kỳ', values['22'] ?? 0, d.ledger.carried]] as const).map(([t, a, b]) => (
                <tr key={t}><td>{t}</td><td className="num"><Money value={a} blankZero={false} /></td><td className="num"><Money value={b} blankZero={false} /></td><td className="num"><Money value={a - b} blankZero={false} /></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}

/** Xuất Excel một tệp như phần mềm mẫu: Tờ khai, Bảng kê bán ra, Bảng kê mua vào, Giảm thuế NQ 204 (kèm cột Chi nhánh). */
async function xuatExcel(d: VatData, values: Record<string, number>, purchases: Row[], group4: boolean) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const sheet = (name: string, rows: (string | number)[][]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  sheet('TO KHAI THUE GTGT', [['TỜ KHAI THUẾ GIÁ TRỊ GIA TĂNG'], [`Kỳ tính thuế: ${d.label}`], [], ['STT', 'Chỉ tiêu', 'Mã', 'Giá trị hàng hóa, dịch vụ (chưa có thuế giá trị gia tăng)', 'Mã', 'Thuế giá trị gia tăng'],
    ...d.form.map((l) => [l.stt, l.name, l.value ? `[${l.value}]` : '', l.value ? (l.value === '21' ? (values['21'] ? 'Có' : 'Không') : values[l.value] ?? 0) : '', l.tax ? `[${l.tax}]` : '', l.tax ? values[l.tax] ?? 0 : ''])]);
  const bk = (title: string, groups: string[], rows: Row[], kind: 'ban' | 'mua') => {
    const out: (string | number)[][] = [[title], [`Kỳ tính thuế: ${d.label}`], [],
      ['STT', 'Số hóa đơn', 'Ngày, tháng, năm lập hóa đơn', kind === 'ban' ? 'Tên người mua' : 'Tên người bán', kind === 'ban' ? 'Mã số thuế người mua' : 'Mã số thuế người bán', kind === 'ban' ? 'Doanh thu chưa có thuế GTGT' : 'Giá trị HHDV mua vào chưa có thuế', 'Thuế GTGT', 'Chi nhánh']];
    groups.forEach((g, gi) => {
      const list = rows.filter((r) => r.group === gi + 1);
      out.push([`${gi + 1}. ${g}`]);
      list.forEach((r, i) => out.push([i + 1, r.invoiceNo, date(r.date), r.name, r.taxCode, r.amount, r.tax, r.branchCode]));
      out.push([`Tổng nhóm ${gi + 1}`, '', '', '', '', list.reduce((x, r) => x + r.amount, 0), list.reduce((x, r) => x + r.tax, 0)]);
    });
    return out;
  };
  const ban = bk('BẢNG KÊ HOÁ ĐƠN, CHỨNG TỪ HÀNG HOÁ, DỊCH VỤ BÁN RA', BKBR_GROUPS, d.salesList, 'ban');
  ban.push(['Tổng doanh thu hàng hóa, dịch vụ bán ra chịu thuế GTGT:', '', '', '', '', d.salesList.filter((r) => r.group > 1).reduce((x, r) => x + r.amount, 0)], ['Tổng số thuế GTGT của hàng hóa, dịch vụ bán ra:', '', '', '', '', '', d.salesList.reduce((x, r) => x + r.tax, 0)]);
  sheet('BKBR 01-1 GTGT', ban);
  const mua = bk('BẢNG KÊ HOÁ ĐƠN, CHỨNG TỪ CỦA HÀNG HOÁ, DỊCH VỤ MUA VÀO', group4 ? BKMV_GROUPS : BKMV_GROUPS.slice(0, 3), purchases, 'mua');
  mua.push(['Tổng giá trị hàng hóa, dịch vụ mua vào:', '', '', '', '', purchases.reduce((x, r) => x + r.amount, 0)], ['Tổng thuế GTGT của hàng hóa, dịch vụ mua vào:', '', '', '', '', '', purchases.reduce((x, r) => x + r.tax, 0)],
    ['Tổng thuế GTGT của HHDV mua vào đủ điều kiện được khấu trừ:', '', '', '', '', '', purchases.filter((r) => r.group !== 4).reduce((x, r) => x + r.tax, 0)]);
  sheet('BKMV 01-2 GTGT', mua);
  const r = d.reduced;
  sheet('GIAM THUE NQ204', [['GIẢM THUẾ GIÁ TRỊ GIA TĂNG THEO NGHỊ QUYẾT SỐ 204/2025/QH15'], [`Kỳ tính thuế: ${d.label}`], [],
    ['I. Hàng hóa, dịch vụ mua vào trong kỳ được áp dụng mức thuế suất thuế giá trị gia tăng 8%'], ['STT', 'Tên hàng hóa, dịch vụ', 'Giá trị hàng hóa, dịch vụ chưa có thuế GTGT', 'Thuế GTGT'],
    ...r.inputRows.map((x, i) => [i + 1, x.name, x.amount, x.tax]), ['', 'Tổng cộng', r.inputTotals.amount, r.inputTotals.tax], [],
    ['II. Hàng hóa, dịch vụ bán ra trong kỳ'], ['STT', 'Tên hàng hóa, dịch vụ', 'Doanh thu hàng hóa, dịch vụ chịu thuế', 'Thuế suất theo quy định', 'Thuế suất sau giảm', 'Thuế GTGT được giảm'],
    ...r.rows.map((x, i) => [i + 1, x.name, x.amount, '10%', '8%', x.reducedTax]), ['', 'Tổng cộng', r.totals.amount, '', '', r.totals.reducedTax], [],
    ['III. Chênh lệch thuế GTGT của hàng hoá, dịch vụ bán ra và mua vào trong kỳ được áp dụng mức thuế suất thuế giá trị gia tăng 8%: [09] = [08] - [06]', '', r.totals.reducedTax - r.inputTotals.tax]]);
  XLSX.writeFile(wb, `to-khai-01-gtgt-${d.label.replace(/[^\dA-Za-z]+/g, '-')}.xlsx`);
}

