/**
 * BH18 Khuyến mại (phiếu NT-BH-016, chữ chốt docs/nghiep-vu/22): danh sách khuyến mại (khuôn `sale.promo.*` ở sổ đăng ký chính sách của Core),
 * Thêm theo 6 loại, Sửa (bản mới từ ngày chọn), Ngừng (bản mới kết thúc hôm trước ngày ngừng), Thử tính trên giỏ hàng. Chỉ gọi API chính sách
 * có sẵn của Core — module không lưu gì. Chương trình bán có hạn mức (BH12) không hiện ở đây.
 */
// [2026-11-14 01:20 AM Võ Hoàng] NGHIEM-THU — NT-BH-016: màn Khuyến mại BH18 (đóng góp)
import { useMemo, useState } from 'react';
import { BranchPicker, DataGrid, ErrorBox, Field, Loading, Modal, PageHeader, errorText, useApi, useCan, useMutation, useQuery, useQueryClient, type GridColumn } from '@bizcity/ui-kit';
import { Badge, vnd } from '../lib';
import { KmForm } from './khuyen-mai/KmForm';
import { KIND_BY_CONTRACT, KIND_INFO, STATUS_LABEL, STOP_REASON, emptyForm, fromParams, statusOf, stopParams, type Form, type PromoKind } from './khuyen-mai/model';

type Version = { version: number; effectiveFrom: string | null; effectiveTo: string | null; status: string; scope: { branchCodes?: string[] }; reason: string | null; applied: number; publishedBy: string; publishedAt: string };
type RegPolicy = { policyKey: string; ruleContract: string; versions: Version[]; current: number | null };
type PolicyView = { policyKey: string; version: number; ruleContract: string; params: Record<string, unknown> | null; scope: { branchCodes?: string[] }; effectiveFrom: string | null };
type Row = {
  key: string; kind: PromoKind; contract: string; version: number; branches: string; from: string; to: string; status: keyof typeof STATUS_LABEL; applied: number; note: string; last: Version;
};

const today = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

const cols: GridColumn<Row>[] = [
  { key: 'key', header: 'Mã', type: 'code', width: 150 },
  { key: 'kind', header: 'Loại', width: 230, value: (r) => KIND_INFO[r.kind].label },
  { key: 'branches', header: 'Cửa hàng', width: 150 },
  { key: 'from', header: 'Từ ngày', width: 100 },
  { key: 'to', header: 'Đến ngày', width: 100 },
  { key: 'status', header: 'Trạng thái', width: 100, value: (r) => STATUS_LABEL[r.status].label, render: (r) => <Badge map={STATUS_LABEL} value={r.status} /> },
  { key: 'version', header: 'Bản', type: 'number', width: 60 },
  { key: 'applied', header: 'Chứng từ đã áp', type: 'number', sum: true, width: 110 },
  { key: 'note', header: 'Tên / ghi chú', width: 260 },
];

export function KhuyenMaiPage() {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const writable = can('settings:write');
  const reg = useQuery({ queryKey: ['km', 'registry'], queryFn: () => api.get<{ items: RegPolicy[] }>('/api/v1/policy-registry') });
  const cur = useQuery({ queryKey: ['km', 'current'], queryFn: () => api.get<{ items: PolicyView[] }>('/api/v1/policies', { domain: 'sale' }) });
  const [pick, setPick] = useState<Row | null>(null);
  const [form, setForm] = useState<{ f: Form; editing: boolean } | null>(null);
  const [chooseKind, setChooseKind] = useState(false);
  const [trial, setTrial] = useState<string[] | null>(null);
  const [stopOf, setStopOf] = useState<Row | null>(null);
  const [msg, setMsg] = useState('');
  const d0 = today();

  const rows: Row[] = useMemo(() => {
    const params = new Map((cur.data?.items ?? []).map((p) => [p.policyKey, p.params ?? {}]));
    return (reg.data?.items ?? []).filter((p) => KIND_BY_CONTRACT[p.ruleContract]).map((p) => {
      const last = p.versions[p.versions.length - 1]!;
      const shown = p.versions.find((v) => v.version === p.current) ?? last;
      const pr = (params.get(p.policyKey) ?? {}) as { validFrom?: string; validTo?: string };
      return {
        key: p.policyKey, kind: KIND_BY_CONTRACT[p.ruleContract]!, contract: p.ruleContract, version: last.version,
        branches: (shown.scope?.branchCodes ?? []).join(', ') || 'Mọi cửa hàng', from: pr.validFrom ?? shown.effectiveFrom ?? '', to: pr.validTo ?? last.effectiveTo ?? '',
        status: statusOf({ validFrom: pr.validFrom ?? last.effectiveFrom, validTo: pr.validTo, lastReason: last.reason, effectiveTo: last.effectiveTo }, d0),
        applied: p.versions.reduce((s, v) => s + (v.applied ?? 0), 0), note: p.versions[0]?.reason ?? '', last,
      };
    }).sort((a, b) => b.from.localeCompare(a.from) || a.key.localeCompare(b.key));
  }, [reg.data, cur.data, d0]);

  /** Nội dung bản mới nhất của một khuyến mại (đọc tại ngày áp của bản đó — bản sắp chạy chưa phủ hôm nay). */
  const loadParams = async (r: Row) => {
    const at = r.last.effectiveFrom && r.last.effectiveFrom > d0 ? r.last.effectiveFrom : d0;
    const list = (await api.get<{ items: PolicyView[] }>('/api/v1/policies', { domain: 'sale', at })).items;
    const p = list.find((x) => x.policyKey === r.key);
    if (!p?.params) throw new Error(`Không đọc được nội dung khuyến mại ${r.key} tại ngày ${at}`);
    return p;
  };
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['km'] })]);
  const edit = useMutation({
    mutationFn: async (r: Row) => {
      const p = await loadParams(r);
      const f = fromParams(r.contract, p.params!, { key: r.key, branchCodes: p.scope?.branchCodes, today: d0 });
      if (!f) throw new Error('Loại khuyến mại này chưa sửa được ở màn');
      return { ...f, effectiveFrom: d0 > (r.last.effectiveFrom ?? '') ? nextDay(d0) : (r.last.effectiveFrom ?? d0), reason: '' };
    },
    onSuccess: (f) => setForm({ f, editing: true }),
  });
  const stop = useMutation({
    mutationFn: async ({ r, from }: { r: Row; from: string }) => {
      const p = await loadParams(r);
      return api.post('/api/v1/policies', {
        key: r.key, ruleContract: r.contract, params: stopParams(p.params!, from), effectiveFrom: from,
        ...(p.scope?.branchCodes?.length ? { scope: { branchCodes: p.scope.branchCodes } } : {}), reason: `${STOP_REASON} từ ${from}`,
      });
    },
    onSuccess: (_x, v) => { setStopOf(null); setMsg(`Đã ngừng ${v.r.key} từ ${v.from}.`); void refresh(); },
  });

  if (reg.isLoading || cur.isLoading) return <Loading />;
  if (reg.error || cur.error) return <ErrorBox error={errorText(reg.error ?? cur.error)} />;
  return (
    <div>
      <PageHeader title="Khuyến mại" code="BH18" subtitle="Khuyến mại máy bán và phiếu bán áp tự động: giảm theo bậc, theo tổng đơn / mã giảm giá, quà theo tổng đơn, combo, món rẻ nhất, mua X tặng Y. Chương trình có hạn mức theo cửa hàng khai ở Chương trình bán (BH12)." />
      <div className="row" style={{ gap: 8, margin: '8px 0', alignItems: 'center' }}>
        {writable && <button type="button" className="btn btn-primary" onClick={() => setChooseKind(true)}>+ Thêm</button>}
        {writable && <button type="button" className="btn" disabled={!pick || edit.isPending} title={pick ? '' : 'Chọn một khuyến mại ở bảng'} onClick={() => pick && edit.mutate(pick)}>Sửa</button>}
        {writable && <button type="button" className="btn" disabled={!pick || pick.status === 'stopped' || pick.status === 'ended'} title={pick ? '' : 'Chọn một khuyến mại ở bảng'} onClick={() => setStopOf(pick)}>Ngừng</button>}
        <button type="button" className="btn" onClick={() => setTrial(pick ? [pick.key] : [])}>Thử tính{pick ? ` ${pick.key}` : ' (mọi khuyến mại)'}</button>
        {msg && <span className="muted">{msg}</span>}
        {!writable && <span className="muted">Chỉ người có quyền ghi cấu hình (kế toán trưởng / quản trị) thêm, sửa, ngừng được.</span>}
      </div>
      {edit.error && <ErrorBox error={errorText(edit.error)} />}
      <DataGrid rows={rows} columns={cols} rowKey={(r) => r.key} storageKey="pos.khuyen-mai" onRowClick={setPick} onRowDoubleClick={(r) => writable && edit.mutate(r)}
        rowClassName={(r) => (r.key === pick?.key ? 'selected' : '')} emptyText="Chưa có khuyến mại — bấm Thêm" exportName="khuyen-mai" exportTitle="Khuyến mại" />

      {chooseKind && (
        <Modal title="Thêm khuyến mại — chọn loại" onClose={() => setChooseKind(false)}>
          <div style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
            {(Object.keys(KIND_INFO) as PromoKind[]).map((k) => (
              <button key={k} type="button" className="btn" style={{ textAlign: 'left' }} onClick={() => { setChooseKind(false); setForm({ f: emptyForm(k, d0), editing: false }); }}>
                <b>{KIND_INFO[k].label}</b><br /><span className="muted">{KIND_INFO[k].hint}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {form && <KmForm initial={form.f} editing={form.editing} onClose={() => setForm(null)} onDone={(k) => { setForm(null); setMsg(`Đã phát hành ${k}.`); void refresh(); }} />}
      {stopOf && <StopDialog row={stopOf} pending={stop.isPending} error={stop.error ? errorText(stop.error) : ''} onClose={() => setStopOf(null)} onStop={(from) => stop.mutate({ r: stopOf, from })} />}
      {trial && <TrialDialog keys={trial} onClose={() => setTrial(null)} />}
    </div>
  );
}

function StopDialog({ row, pending, error, onClose, onStop }: { row: Row; pending: boolean; error: string; onClose: () => void; onStop: (from: string) => void }) {
  const [from, setFrom] = useState(today());
  return (
    <Modal title={`Ngừng khuyến mại ${row.key}`} onClose={onClose} footer={<div className="row" style={{ gap: 8 }}>
      <button type="button" className="btn btn-primary" disabled={pending || !from} onClick={() => onStop(from)}>Ngừng</button><button type="button" className="btn" onClick={onClose}>Đóng</button></div>}>
      <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 8 }}>
      <Field label="Ngừng từ ngày" hint="Hôm nay = ngừng ngay: đơn từ ngày này không còn được giảm. Chứng từ đã bán giữ nguyên."><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      {error && <ErrorBox error={error} />}
      </div>
    </Modal>
  );
}

type TrialLine = { sku: string; qty: string; price: string };
type EvalOut = {
  applied: { policyRef: { key: string; version: number }; explain: string }[]; skipped: { key: string; reason: string }[];
  discounts: { lineKey: string; sku: string; amount: number; policyRef: { key: string } }[]; gifts: { sku: string; qty: number; policyRef: { key: string } }[];
  capped?: { lineKey: string; key: string; before: number; after: number; capPct: number }[];
};

/** Thử tính trên giỏ hàng: gọi bộ tính của Core (như máy bán) với các khuyến mại đã phát hành; không ghi gì. */
function TrialDialog({ keys, onClose }: { keys: string[]; onClose: () => void }) {
  const api = useApi();
  const [date, setDate] = useState(today());
  const [branch, setBranch] = useState('');
  const [time, setTime] = useState('');
  const [coupon, setCoupon] = useState('');
  const [lines, setLines] = useState<TrialLine[]>([{ sku: '', qty: '1', price: '' }]);
  const run = useMutation({
    mutationFn: () => api.post<EvalOut>('/api/v1/policies/evaluate', {
      docDate: date, ...(branch ? { branchCode: branch } : {}), ...(keys.length ? { policies: keys.map((key) => ({ key })) } : {}),
      ...(time ? { at: { time } } : {}), ...(coupon.trim() ? { coupons: coupon.split(/[\s,]+/).filter(Boolean) } : {}),
      lines: lines.filter((l) => l.sku.trim()).map((l, i) => ({ lineKey: `L${i + 1}`, sku: l.sku.trim(), qty: Number(l.qty) || 0, ...(l.price.trim() ? { price: Number(l.price.replace(/\./g, '')) } : {}) })),
    }),
  });
  const set = (i: number, p: Partial<TrialLine>) => setLines(lines.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const r = run.data;
  return (
    <Modal wide title={`Thử tính — ${keys.length ? keys.join(', ') : 'mọi khuyến mại đang hiệu lực'}`} onClose={onClose} footer={<div className="row" style={{ gap: 8 }}>
      <button type="button" className="btn btn-primary" disabled={run.isPending || !lines.some((l) => l.sku.trim())} onClick={() => run.mutate()}>Tính</button><button type="button" className="btn" onClick={onClose}>Đóng</button></div>}>
      <div style={{ display: 'grid', gap: 8, gridColumn: '1 / -1' }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Field label="Ngày bán"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Cửa hàng"><BranchPicker value={branch} onChange={setBranch} /></Field>
          <Field label="Giờ bán"><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          <Field label="Mã giảm giá khách đọc"><input className="input" value={coupon} onChange={(e) => setCoupon(e.target.value)} /></Field>
        </div>
        <b>Giỏ hàng</b>
        {lines.map((l, i) => (
          <div key={i} className="row" style={{ gap: 6 }}>
            Mã <input className="input" style={{ width: 150 }} value={l.sku} onChange={(e) => set(i, { sku: e.target.value })} />
            SL <input className="input" style={{ width: 70 }} value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} />
            Đơn giá <input className="input" style={{ width: 120 }} value={l.price} placeholder="gồm thuế" onChange={(e) => set(i, { price: e.target.value })} />
            {lines.length > 1 && <button type="button" className="btn btn-xs" onClick={() => setLines(lines.filter((_, j) => j !== i))}>×</button>}
          </div>
        ))}
        <div><button type="button" className="btn btn-xs" onClick={() => setLines([...lines, { sku: '', qty: '1', price: '' }])}>+ Thêm dòng</button></div>
        {run.error && <ErrorBox error={errorText(run.error)} />}
        {r && (
          <div style={{ display: 'grid', gap: 4 }}>
            <b>Áp được</b>
            {r.applied.length ? r.applied.map((a) => <div key={a.policyRef.key}>✔ {a.policyRef.key} (bản {a.policyRef.version}): {a.explain}</div>) : <div className="muted">Không khuyến mại nào áp.</div>}
            {r.discounts.map((d, i) => <div key={i} className="muted">— dòng {d.lineKey} {d.sku}: giảm {vnd(d.amount)} ({d.policyRef.key})</div>)}
            {r.gifts.map((g, i) => <div key={i} className="muted">— tặng {g.qty} {g.sku} ({g.policyRef.key})</div>)}
            {(r.capped ?? []).map((c, i) => <div key={i} className="muted">— dòng {c.lineKey}: {c.key} bị kẹp theo trần {c.capPct} % ({vnd(c.before)} → {vnd(c.after)})</div>)}
            {r.skipped.length > 0 && <><b>Không áp</b>{r.skipped.map((s, i) => <div key={i} className="muted">✘ {s.key}: {s.reason}</div>)}</>}
          </div>
        )}
      </div>
    </Modal>
  );
}
