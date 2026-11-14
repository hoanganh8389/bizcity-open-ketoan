// [2026-11-11 Nguyễn Văn Thủy] LẬP BÁO CÁO TÀI CHÍNH (ACC99): chọn kỳ → lập B01, B02, B03 → sửa số → người ký → Ghi; danh sách đã lập (đóng góp)
/**
 * Theo quy trình chuẩn của kế toán:
 *   1. Danh sách BCTC đã lập (Kỳ báo cáo, Tên báo cáo, Thông tư áp dụng, Người lập, Ngày lập, Xem / Xoá); chưa có thì màn trống + nút lập.
 *   2. "Lập báo cáo tài chính ▾" → Chọn tham số: Kỳ báo cáo, Năm, Từ – Đến, giả định hoạt động liên tục, chọn mẫu B01 / B02 / B03.
 *   3. Hộp lập: mỗi mẫu một thẻ, số lấy từ sổ (cùng cách tính các màn B01, B02, B03), sửa tay được ô chỉ tiêu chi tiết — dòng tổng tự
 *      tính lại; "Lấy lại dữ liệu" lấy lại số từ sổ. Cuối: Người lập, Người đại diện theo pháp luật, Ngày lập (bắt buộc, điền sẵn theo
 *      Hồ sơ in HT16). Chân: Kiểm tra báo cáo · Hủy · Ghi · Ghi và In.
 * Lưu bảng financial_statements (API /api/v1/financial-statements). Thuyết minh B09 ở màn riêng (mở từ nút ▾).
 */
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileBarChart, Plus, Trash2 } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { date, money, today } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { useThaoTac } from '@/lib/manHinh';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal, NumInput } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { LedgerForm, PrintButton, type PrintTemplate, type Sign } from '@/components/print';
import { usePrintProfile } from '@/components/print/profile';
import { useWorkBranch } from '@/lib/workBranch';

type Rep = 'B01-DN' | 'B02-DN' | 'B03-DN';
const REPS: { code: Rep | 'B03-DN-GT'; name: string; soon?: boolean }[] = [
  { code: 'B01-DN', name: 'Báo cáo tình hình tài chính' },
  { code: 'B02-DN', name: 'Báo cáo kết quả hoạt động kinh doanh' },
  { code: 'B03-DN', name: 'Báo cáo lưu chuyển tiền tệ (Phương pháp trực tiếp)' },
  { code: 'B03-DN-GT', name: 'Báo cáo lưu chuyển tiền tệ (Phương pháp gián tiếp)', soon: true },
];
const TITLE: Record<Rep, string> = { 'B01-DN': 'BÁO CÁO TÌNH HÌNH TÀI CHÍNH', 'B02-DN': 'BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH', 'B03-DN': 'BÁO CÁO LƯU CHUYỂN TIỀN TỆ' };
const THONG_TU = 'Thông tư 99/2025/TT-BTC';
const OPINIONS = ['Chấp nhận toàn phần', 'Ngoại trừ', 'Trái ngược', 'Từ chối đưa ra ý kiến'];

/** Mục thuyết minh in cạnh chỉ tiêu (theo mẫu ban hành kèm Thông tư 99). */
const NOTE: Record<Rep, Record<string, string>> = {
  'B01-DN': { 110: 'V.1', 121: 'V.2(a)', 123: 'V.2(b)', 131: 'V.3(a)', 135: 'V.4(a)', 137: 'V.5', 140: 'V.7', 151: 'V.12.1.1', 152: 'V.12.1.2', 161: 'V.14(a)', 163: 'V.19(b)', 164: 'V.23', 165: 'V.15(a)', 221: 'V.9', 224: 'V.11', 227: 'V.10', 232: 'V.12.1.3', 233: 'V.12.2', 240: 'V.13', 271: 'V.14(b)', 272: 'V.26(a)', 274: 'V.15(b)', 311: 'V.17(a)', 314: 'V.19(a)', 316: 'V.20(a)', 319: 'V.22(a)', 320: 'V.21(a)', 321: 'V.16(a)', 322: 'V.25(a)', 325: 'V.23', 331: 'V.17(b)', 333: 'V.19(b)', 334: 'V.20(b)', 337: 'V.22(b)', 338: 'V.21(b)', 339: 'V.16(b)', 341: 'V.24', 342: 'V.26(b)', 343: 'V.25(b)', 411: 'V.27(b)', '411a': 'V.27(d)', '411b': 'V.27(d)', 412: 'V.27(e)', 413: 'V.27(e)', 415: 'V.27(e)', 416: 'V.28', 417: 'V.29' },
  'B02-DN': { '01': 'VI.1', '02': 'VI.2', 11: 'VI.3', 21: 'VI.4', 22: 'VI.5', 23: 'VI.6', 25: 'VI.9', 26: 'VI.9', 31: 'VI.7', 32: 'VI.8', 51: 'VI.11', 52: 'VI.11' },
  'B03-DN': { 21: 'V.8', 70: 'V.1' },
};

interface BRow { code: string; name: string; bold: boolean; level?: number; formula?: [string, number][]; cur: number | null; prev: number | null }
type Built = Partial<Record<Rep, BRow[]>>;
type Vals = Record<string, Record<string, [number | null, number | null]>>;
interface Saved {
  id?: number; periodKind: string; periodLabel: string; year: number; from: string; to: string; goingConcern: boolean; reports: Rep[];
  data: Vals; audited: boolean; auditOpinion: string; preparer: string; legalRep: string; preparedDate: string;
}
interface ListRow { id: number; periodLabel: string; year: number; from: string; to: string; reports: string[]; preparer: string; preparedDate: string }

/* ------------------------------------------------------------------ kỳ báo cáo */
const KY = [
  { k: 'year', label: 'Năm' }, { k: 'half1', label: '6 tháng đầu năm' }, { k: 'half2', label: '6 tháng cuối năm' },
  { k: 'q1', label: 'Quý I' }, { k: 'q2', label: 'Quý II' }, { k: 'q3', label: 'Quý III' }, { k: 'q4', label: 'Quý IV' }, { k: 'custom', label: 'Tùy chọn' },
];
const last = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
function kyRange(k: string, y: number): [string, string] {
  const r: Record<string, [number, number]> = { year: [1, 12], half1: [1, 6], half2: [7, 12], q1: [1, 3], q2: [4, 6], q3: [7, 9], q4: [10, 12] };
  const [a, b] = r[k] ?? [1, 12];
  return [`${y}-${String(a).padStart(2, '0')}-01`, last(y, b)];
}
function kyLabel(k: string, y: number, from: string, to: string) {
  if (k === 'custom') return `Từ ${date(from)} đến ${date(to)}`;
  if (k.startsWith('q')) return `${KY.find((x) => x.k === k)!.label}/${y}`;
  return `${KY.find((x) => x.k === k)!.label} ${y}`;
}
const isYear = (s: Pick<Saved, 'from' | 'to'>) => s.from.endsWith('-01-01') && s.to.endsWith('-12-31') && s.from.slice(0, 4) === s.to.slice(0, 4);
/** Tiêu đề cột theo kỳ: báo cáo năm "Số cuối năm / Số đầu năm", "Năm nay / Năm trước"; giữa niên độ "Số cuối kỳ", "Kỳ này / Kỳ trước". */
function colNames(rep: Rep, s: Pick<Saved, 'from' | 'to'>): [string, string] {
  if (rep === 'B01-DN') return isYear(s) ? ['Số cuối năm', 'Số đầu năm'] : ['Số cuối kỳ', 'Số đầu năm'];
  return isYear(s) ? ['Năm nay', 'Năm trước'] : ['Kỳ này', 'Cùng kỳ năm trước'];
}
function subTitle(rep: Rep, s: Pick<Saved, 'from' | 'to'>) {
  const [y, m, d] = s.to.split('-');
  if (rep === 'B01-DN') return `Tại ngày ${Number(d)} tháng ${Number(m)} năm ${y}`;
  return isYear(s) ? `Năm ${y}` : `Từ ngày ${date(s.from)} đến ngày ${date(s.to)}`;
}

/* ------------------------------------------------------------------ tính lại dòng tổng */
function recalc(rows: BRow[], v: Record<string, [number | null, number | null]>) {
  const out = { ...v };
  for (let pass = 0; pass < 4; pass++) {
    for (const r of rows) {
      if (!r.code || !r.formula?.length) continue;
      const col = (i: 0 | 1) => r.formula!.reduce((s, [c, sign]) => s + sign * (Number(out[c]?.[i]) || 0), 0);
      out[r.code] = [Math.round(col(0) * 100) / 100, Math.round(col(1) * 100) / 100];
    }
  }
  return out;
}
/** Số trên báo cáo tài chính: số âm ghi trong ngoặc đơn (mẫu ban hành kèm Thông tư 99). */
const so = (v: number | null | undefined) => (v === null || v === undefined ? '' : v < 0 ? `(${money(-v, { blankZero: false })})` : money(v, { blankZero: false }));
const fromRows = (rows: BRow[]) => Object.fromEntries(rows.filter((r) => r.code).map((r) => [r.code, [r.cur, r.prev] as [number | null, number | null]]));

/* ------------------------------------------------------------------ kiểm tra báo cáo */
function kiemTra(s: Saved): { ok: boolean; text: string }[] {
  const v = (rep: Rep, code: string, i: 0 | 1) => Number(s.data[rep]?.[code]?.[i]) || 0;
  const out: { ok: boolean; text: string }[] = [];
  const has = (r: Rep) => s.reports.includes(r);
  if (has('B01-DN')) for (const i of [0, 1] as const) {
    const d = v('B01-DN', '280', i) - v('B01-DN', '440', i);
    out.push({ ok: Math.abs(d) < 1, text: `B01-DN ${colNames('B01-DN', s)[i]}: Tổng tài sản [280] ${d ? '≠' : '='} Tổng nguồn vốn [440]${d ? ` (lệch ${money(d)})` : ''}` });
  }
  if (has('B01-DN') && has('B03-DN')) {
    const d = v('B03-DN', '70', 0) - v('B01-DN', '110', 0);
    out.push({ ok: Math.abs(d) < 1, text: `Tiền cuối kỳ B03-DN [70] ${d ? '≠' : '='} Tiền và tương đương tiền B01-DN [110]${d ? ` (lệch ${money(d)})` : ''}` });
    if (isYear(s)) {
      const d2 = v('B03-DN', '60', 0) - v('B01-DN', '110', 1);
      out.push({ ok: Math.abs(d2) < 1, text: `Tiền đầu kỳ B03-DN [60] ${d2 ? '≠' : '='} Số đầu năm B01-DN [110]${d2 ? ` (lệch ${money(d2)})` : ''}` });
    }
  }
  if (has('B01-DN') && has('B02-DN') && s.from.endsWith('-01-01')) {
    const d = v('B02-DN', '60', 0) - v('B01-DN', '420b', 0);
    out.push({ ok: Math.abs(d) < 1, text: `Lợi nhuận sau thuế B02-DN [60] ${d ? '≠' : '='} LNST chưa phân phối kỳ này B01-DN [420b]${d ? ` (lệch ${money(d)}: kiểm tra phân phối lợi nhuận trong năm)` : ''}` });
  }
  return out;
}

/* ------------------------------------------------------------------ mẫu in */
interface PSheet { s: Saved; rows: Built }
const signs = (s: Saved): Sign[] => [{ title: 'Người lập biểu', name: s.preparer }, { title: 'Kế toán trưởng' }, { title: 'Người đại diện theo pháp luật', note: '(Ký, họ tên, đóng dấu)', name: s.legalRep }];
export const LAP_BCTC_TEMPLATES: PrintTemplate<PSheet>[] = [{
  id: 'bctc', name: 'Báo cáo tài chính (các mẫu đã lập)', paper: 'A4', source: 'B01-DN, B02-DN, B03-DN',
  render: ({ s, rows }, ctx) => (
    <>
      {s.reports.map((rep, i) => {
        const [c1, c2] = colNames(rep, s);
        const list = (rows[rep] ?? []).map((r) => ({ ...r, v: s.data[rep]?.[r.code] ?? [null, null] }));
        return (
          <div key={rep} style={i ? { breakBefore: 'page' } : undefined}>
            <LedgerForm ctx={ctx} d={{
              title: TITLE[rep], form: `Mẫu số ${rep}`, period: subTitle(rep, s), to: s.preparedDate, info: [['Đơn vị tính', 'Đồng']], rows: list, total: false, signs: signs(s),
              cols: [
                { key: 'ct', h: 'Chỉ tiêu', v: (r) => <span style={{ paddingLeft: Math.max((r.level ?? 3) - 1, 0) * 10 }}>{r.bold ? <b>{r.name}</b> : r.name}</span> },
                { key: 'ma', h: 'Mã số', w: 44, center: true, v: (r) => (r.bold ? <b>{r.code}</b> : r.code) },
                { key: 'tm', h: 'Thuyết minh', w: 60, center: true, v: (r) => NOTE[rep][r.code] ?? '' },
                { key: 'c1', h: c1, w: 108, num: true, v: (r) => (r.v[0] === null ? '' : r.bold ? <b>{so(r.v[0])}</b> : so(r.v[0])) },
                { key: 'c2', h: c2, w: 108, num: true, v: (r) => (r.v[1] === null ? '' : r.bold ? <b>{so(r.v[1])}</b> : so(r.v[1])) },
              ],
            }} />
          </div>
        );
      })}
    </>
  ),
}];

/* ------------------------------------------------------------------ màn chính */
export function LapBctcPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  // [2026-11-13 08:00 PM kiennt] NT-HT-003 — lập / lưu theo thao tác màn ACC99 (đóng góp)
  const tt = useThaoTac('ke-toan.lap-bctc');
  const canWrite = can('documents:write') && Boolean(tt.luu);
  const list = useQuery({ queryKey: ['bctc', 'list'], queryFn: () => api.get<ListRow[]>('/api/v1/financial-statements') });
  const [thamSo, setThamSo] = useState(false);
  const [open, setOpen] = useState<{ init?: Saved; id?: number; seq: number } | null>(null);
  const del = useMutation({ mutationFn: (id: number) => api.delete(`/api/v1/financial-statements/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['bctc'] }) });
  const [menu, setMenu] = useState(false);

  const lapBtn = (
    <span className="vf-split" style={{ position: 'relative' }}>
      <button className="btn btn-primary" disabled={!canWrite} onClick={() => setThamSo(true)}><Plus size={15} /> Lập báo cáo tài chính</button>
      <button className="btn btn-primary" disabled={!canWrite} onClick={() => setMenu((x) => !x)} aria-label="Thêm lựa chọn" style={{ paddingInline: 8, marginLeft: 1 }}>▾</button>
      {menu && (
        <div className="vf-split-pop" onMouseLeave={() => setMenu(false)}>
          <button onClick={() => { setMenu(false); setThamSo(true); }}>Báo cáo tài chính</button>
          <button onClick={() => { setMenu(false); navigate('/bao-cao/thuyet-minh'); }}>Thuyết minh báo cáo tài chính</button>
        </div>
      )}
    </span>
  );

  const cols: Column<ListRow>[] = [
    { key: 'periodLabel', header: 'Kỳ báo cáo', width: 200, title: 'Kỳ của bộ báo cáo đã lập' },
    { key: 'name', header: 'Tên báo cáo', width: 220, value: () => 'Báo cáo tài chính', title: 'Các mẫu đã lập rê chuột ở cột Mẫu' },
    { key: 'reports', header: 'Mẫu', width: 200, value: (r) => r.reports.join(', ') },
    { key: 'tt', header: 'Thông tư áp dụng', width: 200, value: () => THONG_TU },
    { key: 'preparer', header: 'Người lập', width: 180 },
    { key: 'preparedDate', header: 'Ngày lập', width: 110, type: 'date' },
    { key: 'fn', header: 'Chức năng', width: 130, noSort: true, render: (r) => (
      <span style={{ display: 'inline-flex', gap: 10 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen({ id: r.id, seq: Date.now() }); }}>Xem</a>
      </span>
    ) },
  ];

  return (
    <div className="page">
      <PageHeader title="Lập báo cáo tài chính" code="ACC99" helpKey="lap-bao-cao-tai-chinh" actions={list.data?.length ? lapBtn : undefined} />
      {list.isLoading ? <Loading /> : list.error ? <ErrorBox error={errorText(list.error)} /> : !list.data?.length ? (
        <div className="card" style={{ padding: '64px 24px', textAlign: 'center' }}>
          <FileBarChart size={56} style={{ color: 'var(--nav, #2457b3)', opacity: 0.8 }} />
          <div style={{ fontSize: 18, fontWeight: 600, margin: '18px auto 20px', maxWidth: 720 }}>Lập báo cáo tài chính cuối kỳ để cung cấp thông tin về tình hình tài chính, kết quả kinh doanh và các luồng tiền trong kỳ</div>
          {lapBtn}
        </div>
      ) : (
        <div className="card"><DataGrid rows={list.data} columns={cols} rowKey={(r) => String(r.id)} storageKey="lap-bctc-v1" onRowDoubleClick={(r) => setOpen({ id: r.id, seq: Date.now() })} /></div>
      )}
      {del.error && <ErrorBox error={errorText(del.error)} />}
      {thamSo && <ThamSo onClose={() => setThamSo(false)} onOk={(init) => { setThamSo(false); setOpen({ init, seq: Date.now() }); }} />}
      {open && <BctcForm key={open.seq} id={open.id} init={open.init} onClose={() => setOpen(null)} onSaved={() => qc.invalidateQueries({ queryKey: ['bctc'] })} />}
    </div>
  );
}

/* ------------------------------------------------------------------ chọn tham số */
function ThamSo({ onClose, onOk }: { onClose: () => void; onOk: (s: Saved) => void }) {
  const y0 = Number(today().slice(0, 4));
  const [ky, setKy] = useState('year');
  const [year, setYear] = useState(y0);
  const [range, setRange] = useState<[string, string]>(() => kyRange('year', y0));
  const [going, setGoing] = useState(true);
  const [pick, setPick] = useState<Rep[]>(['B01-DN', 'B02-DN', 'B03-DN']);
  const setK = (k: string, y = year) => { setKy(k); if (k !== 'custom') setRange(kyRange(k, y)); };
  const toggle = (c: Rep) => setPick((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  const ok = () => onOk({
    periodKind: ky, periodLabel: kyLabel(ky, year, range[0], range[1]), year, from: range[0], to: range[1], goingConcern: going,
    reports: REPS.map((r) => r.code).filter((c): c is Rep => pick.includes(c as Rep)), data: {}, audited: false, auditOpinion: '', preparer: '', legalRep: '', preparedDate: today(),
  });
  return (
    <Modal title="Chọn tham số: Báo cáo tài chính" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn btn-primary" disabled={!pick.length || range[0] > range[1]} title={!pick.length ? 'Chọn ít nhất một báo cáo' : undefined} onClick={ok}>Đồng ý</button></>}>
      <div className="form-grid">
        <Field label="Kỳ báo cáo"><select className="select input" value={ky} onChange={(e) => setK(e.target.value)}>{KY.map((k) => <option key={k.k} value={k.k}>{k.label}</option>)}</select></Field>
        <Field label="Năm"><input className="input" type="number" min={2000} max={2100} value={year} onChange={(e) => { const y = Number(e.target.value) || y0; setYear(y); setK(ky, y); }} /></Field>
        <Field label="Từ"><input className="input" type="date" value={range[0]} disabled={ky !== 'custom'} onChange={(e) => setRange([e.target.value, range[1]])} /></Field>
        <Field label="Đến"><input className="input" type="date" value={range[1]} disabled={ky !== 'custom'} onChange={(e) => setRange([range[0], e.target.value])} /></Field>
      </div>
      <div style={{ display: 'grid', gap: 6, margin: '12px 0' }}>
        <label><input type="radio" checked={going} onChange={() => setGoing(true)} /> Doanh nghiệp đáp ứng giả định hoạt động liên tục</label>
        <label><input type="radio" checked={!going} onChange={() => setGoing(false)} /> Doanh nghiệp không đáp ứng giả định hoạt động liên tục</label>
      </div>
      <div style={{ fontWeight: 600, margin: '8px 0' }}>Chọn báo cáo tài chính</div>
      <table className="table">
        <thead><tr><th style={{ width: 36 }} /><th style={{ width: 120 }}>Mã báo cáo</th><th>Tên báo cáo</th></tr></thead>
        <tbody>{REPS.map((r) => (
          <tr key={r.code} style={r.soon ? { opacity: 0.55 } : undefined} title={r.soon ? 'Đang phát triển' : undefined}>
            <td><input type="checkbox" disabled={r.soon} checked={pick.includes(r.code as Rep)} onChange={() => toggle(r.code as Rep)} /></td>
            <td className="mono">{r.code}</td><td>{r.name}{r.soon && <i className="muted"> (đang phát triển)</i>}</td>
          </tr>
        ))}</tbody>
      </table>
    </Modal>
  );
}

/* ------------------------------------------------------------------ hộp lập / xem */
function BctcForm({ id, init, onClose, onSaved }: { id?: number; init?: Saved; onClose: () => void; onSaved: () => void }) {
  const branch = useWorkBranch();
  const profile = usePrintProfile(branch).data?.effective;
  const saved = useQuery({ queryKey: ['bctc', id], enabled: Boolean(id), queryFn: () => api.get<Saved & { id: number }>(`/api/v1/financial-statements/${id}`) });
  const head = init ?? saved.data;
  const built = useQuery({
    queryKey: ['bctc', 'build', head?.from, head?.to, head?.reports.join(',')], enabled: Boolean(head), staleTime: 0,
    queryFn: () => api.get<Built>('/api/v1/financial-statements/build', { from: head!.from, to: head!.to, reports: head!.reports.join(',') }),
  });
  const [s, setS] = useState<Saved | null>(null);
  const [tab, setTab] = useState<Rep | null>(null);
  const [checks, setChecks] = useState<{ ok: boolean; text: string }[] | null>(null);
  // Nạp lần đầu: phiếu đã lưu giữ số đã lưu; lập mới lấy số từ sổ; người ký điền sẵn theo Hồ sơ in.
  if (!s && head && built.data) {
    const data: Vals = {};
    for (const rep of head.reports) data[rep] = head.data?.[rep] && Object.keys(head.data[rep]!).length ? head.data[rep]! : recalc(built.data[rep] ?? [], fromRows(built.data[rep] ?? []));
    const sign = (role: string) => profile?.signers.find((x) => x.role === role)?.name ?? '';
    setS({ ...head, data, preparer: head.preparer || sign('preparer'), legalRep: head.legalRep || sign('director') });
    setTab(head.reports[0] ?? null);
  }
  const save = useMutation({
    mutationFn: (x: Saved) => api.put<{ id: number }>('/api/v1/financial-statements', x),
    onSuccess: (r) => { setS((p) => (p ? { ...p, id: r.id } : p)); onSaved(); },
  });
  const set = (rep: Rep, code: string, i: 0 | 1, v: number | null) => setS((p) => {
    if (!p) return p;
    const cur = { ...(p.data[rep] ?? {}) };
    const pair: [number | null, number | null] = [...(cur[code] ?? [null, null])] as [number | null, number | null];
    pair[i] = v; cur[code] = pair;
    return { ...p, data: { ...p.data, [rep]: recalc(built.data?.[rep] ?? [], cur) } };
  });
  const layLai = () => { if (s && built.data) { setS({ ...s, data: Object.fromEntries(s.reports.map((r) => [r, recalc(built.data![r] ?? [], fromRows(built.data![r] ?? []))])) }); setChecks(null); } };

  if (!s || !tab) {
    return <Modal key="bctc-loading" title="Báo cáo tài chính" wide onClose={onClose} footer={<button className="btn" onClick={onClose}>Hủy</button>}>{(saved.error || built.error) ? <ErrorBox error={errorText(saved.error ?? built.error)} /> : <Loading />}</Modal>;
  }
  const rows = built.data?.[tab] ?? [];
  const [c1, c2] = colNames(tab, s);
  const vals = s.data[tab] ?? {};
  const printDocs = () => [{ s, rows: built.data ?? {} }];
  const ghi = (andPrint: boolean) => save.mutate(s, { onSuccess: () => { if (andPrint) (document.querySelector('.bctc-in button') as HTMLButtonElement | null)?.click(); } });
  const cell = (r: BRow, i: 0 | 1): ReactNode => {
    const v = vals[r.code]?.[i];
    if (!r.code || (v === null && !r.formula)) return '';
    if (r.formula?.length) return <b>{so(v ?? 0)}</b>;
    return <NumInput value={v ?? 0} blankZero={false} decimals={0} allowNegative onChange={(x) => set(tab, r.code, i, x ?? 0)} className="input num bctc-o" title="Sửa tay được; dòng tổng tự tính lại" />;
  };

  return (
    <Modal key="bctc-loaded" title="Báo cáo tài chính" wide viewFirst={Boolean(id)} onClose={onClose}
      viewActions={<span className="bctc-in"><PrintButton screen="ACC99" templates={LAP_BCTC_TEMPLATES} getDocs={printDocs} /></span>}
      footer={<>
        <button className="btn" style={{ marginRight: 'auto' }} onClick={() => setChecks(kiemTra(s))} data-view-ok>Kiểm tra báo cáo</button>
        <span className="bctc-in" style={{ display: 'none' }}><PrintButton screen="ACC99" templates={LAP_BCTC_TEMPLATES} getDocs={printDocs} /></span>
        <button className="btn" onClick={onClose}>Hủy</button>
        <button className="btn" disabled={save.isPending} onClick={() => ghi(false)}>Ghi</button>
        <button className="btn btn-primary" disabled={save.isPending} onClick={() => ghi(true)}>Ghi và In</button>
      </>}>
      <div className="bctc-body">
      <div className="tabs" style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
        {s.reports.map((r) => <button key={r} type="button" className={`tab ${r === tab ? 'active' : ''}`} onClick={() => setTab(r)}>{r}</button>)}
        <span style={{ marginLeft: 'auto' }} />
        <button type="button" className="btn btn-sm" onClick={layLai} title="Lấy lại số từ sổ cho cả các mẫu (bỏ số đã sửa tay)">Lấy lại dữ liệu</button>
      </div>
      {save.error && <ErrorBox error={errorText(save.error)} />}
      {save.isSuccess && <div className="alert alert-ok">Đã ghi báo cáo tài chính {s.periodLabel}.</div>}
      {checks && (
        <div className={`alert ${checks.every((c) => c.ok) ? 'alert-ok' : 'alert-warn'}`}>
          {checks.length ? checks.map((c, i) => <div key={i}>{c.ok ? '✓' : '✗'} {c.text}</div>) : 'Không có chỉ tiêu cần đối chiếu giữa các mẫu đã chọn.'}
        </div>
      )}
      <div style={{ textAlign: 'center', margin: '6px 0 10px' }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{TITLE[tab]}</div>
        <i>{subTitle(tab, s)}</i>{!s.goingConcern && <div className="text-warn">Doanh nghiệp không đáp ứng giả định hoạt động liên tục</div>}
      </div>
      {tab === 'B01-DN' && (
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', margin: '0 0 10px' }}>
          <label><input type="checkbox" checked={s.audited} onChange={(e) => setS({ ...s, audited: e.target.checked, auditOpinion: e.target.checked ? s.auditOpinion : '' })} /> BCTC đã được kiểm toán</label>
          <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>Ý kiến kiểm toán
            <select className="select input" style={{ width: 260 }} disabled={!s.audited} value={s.auditOpinion} onChange={(e) => setS({ ...s, auditOpinion: e.target.value })}>
              <option value="" />{OPINIONS.map((o) => <option key={o}>{o}</option>)}
            </select>
          </label>
        </div>
      )}
      <div className="bctc-wrap">
        <table className="table bctc-bang">
          <thead><tr><th>Chỉ tiêu</th><th style={{ width: 70 }}>Mã số</th><th style={{ width: 100 }}>Thuyết minh</th><th style={{ width: 170 }} className="num">{c1}</th><th style={{ width: 170 }} className="num">{c2}</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={`${r.code}-${i}`} className={r.bold ? 'bctc-dam' : undefined}>
              <td style={{ paddingLeft: 8 + Math.max((r.level ?? 3) - 1, 0) * 12 }}>{r.name}</td>
              <td className="mono">{r.code}</td><td>{NOTE[tab][r.code] ?? ''}</td>
              <td className="num">{cell(r, 0)}</td><td className="num">{cell(r, 1)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginTop: 14 }}>
        <Field label="Người lập (*)"><input className="input" value={s.preparer} onChange={(e) => setS({ ...s, preparer: e.target.value })} /></Field>
        <Field label="Người đại diện theo pháp luật (*)"><input className="input" value={s.legalRep} onChange={(e) => setS({ ...s, legalRep: e.target.value })} /></Field>
        <Field label="Ngày lập (*)"><input className="input" type="date" value={s.preparedDate} onChange={(e) => setS({ ...s, preparedDate: e.target.value })} /></Field>
      </div>
      </div>
    </Modal>
  );
}

