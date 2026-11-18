/**
 * BH21 Voucher (phiếu NT-BH-026): thẻ Đợt phát (lập / sửa / ngừng đợt; sinh mã cho danh sách SĐT, nạp mã có sẵn kèm SĐT — dán từ Excel;
 * danh sách mã của đợt, Excel), Tra cứu mã (mã → đợt, khách, hạn, đã dùng ở đơn nào / ngày / cửa hàng, nhật ký; SĐT → mọi mã của khách),
 * Báo cáo (theo đợt / người phát: phát hành, còn, đã dùng, hết hạn, thu hồi; theo cửa hàng dùng; Excel).
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: màn Voucher (đóng góp)
import { useState } from 'react';
import {
  BranchCheckList, DataGrid, ErrorBox, Field, Loading, Modal, PageHeader, errorText, useApi, useCan, useMutation, useQuery, useQueryClient, type GridColumn,
} from '@bizcity/ui-kit';

const M = '/api/v1/m/voucher';
const today = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const list = (s: string) => s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

type Counts = { issued: number; active: number; used: number; expired: number; revoked: number };
type Campaign = {
  id: string; code: string; name: string; kind: 'cash' | 'next_purchase'; issuer: 'tgs' | 'brand'; issuerPartnerCode: string | null; paymentMethodCode: string | null;
  faceValue: number; minOrder: number; validFrom: string; validTo: string | null; validDays: number | null; skus: string[]; brandCodes: string[];
  issueMode: 'manual' | 'auto'; autoRule: { skus: string[]; brandCodes: string[]; minQty: number; branches: string[] } | null; status: 'active' | 'stopped';
  note: string | null; counts: Counts;
};
type Code = {
  code: string; phone: string; state: string; source: string; expiresOn: string | null; issuedAt: string; issuedOrderCode: string | null; usedRefCode: string | null;
  usedSource: string | null; usedBranch: string | null; usedOn: string | null; usedAmount: number | null; revokeReason: string | null; campaignId: string;
};

const KIND = { cash: 'Tương đương tiền', next_purchase: 'Lần mua sau (sản phẩm / nhãn)' } as const;
const ISSUER = { tgs: 'TGS (chiết khấu)', brand: 'Hãng / NCC (thanh toán)' } as const;
const STATE: Record<string, [string, string]> = {
  active: ['Còn', 'badge-ok'], used: ['Đã dùng', 'badge-info'], expired: ['Hết hạn', 'badge-warn'], revoked: ['Thu hồi', 'badge-gray'],
};
const stateBadge = (s: string) => <span className={`badge ${STATE[s]?.[1] ?? 'badge-gray'}`}>{STATE[s]?.[0] ?? s}</span>;

const campaignCols: GridColumn<Campaign>[] = [
  { key: 'code', header: 'Mã đợt', type: 'code', width: 120 },
  { key: 'name', header: 'Tên đợt', width: 200 },
  { key: 'kind', header: 'Loại', width: 190, value: (r) => KIND[r.kind] },
  { key: 'issuer', header: 'Người phát', width: 170, value: (r) => (r.issuer === 'brand' ? `Hãng ${r.issuerPartnerCode ?? ''}` : 'TGS') },
  { key: 'faceValue', header: 'Mệnh giá', type: 'money', width: 100 },
  { key: 'validTo', header: 'Hạn', width: 100, value: (r) => r.validTo ?? (r.validDays ? `${r.validDays} ngày` : 'Không hạn') },
  { key: 'issueMode', header: 'Kiểu phát', width: 100, value: (r) => (r.issueMode === 'auto' ? 'Tự động' : 'Thủ công') },
  { key: 'issued', header: 'Đã phát', type: 'number', sum: true, width: 80, value: (r) => r.counts.issued },
  { key: 'used', header: 'Đã dùng', type: 'number', sum: true, width: 80, value: (r) => r.counts.used },
  { key: 'active', header: 'Còn', type: 'number', sum: true, width: 70, value: (r) => r.counts.active },
  { key: 'status', header: 'Trạng thái', width: 90, value: (r) => (r.status === 'active' ? 'Đang dùng' : 'Đã ngừng') },
];
const codeCols: GridColumn<Code>[] = [
  { key: 'code', header: 'Mã voucher', type: 'code', width: 130 },
  { key: 'phone', header: 'SĐT khách', width: 110 },
  { key: 'state', header: 'Trạng thái', width: 90, value: (r) => STATE[r.state]?.[0] ?? r.state, render: (r) => stateBadge(r.state) },
  { key: 'expiresOn', header: 'Hạn', width: 100 },
  { key: 'source', header: 'Nguồn', width: 100, value: (r) => ({ generate: 'Sinh', import: 'Nạp', auto: `Tự phát ${r.issuedOrderCode ?? ''}` }[r.source] ?? r.source) },
  { key: 'usedRefCode', header: 'Dùng ở', width: 130 },
  { key: 'usedOn', header: 'Ngày dùng', width: 100 },
  { key: 'usedBranch', header: 'Cửa hàng', width: 90 },
  { key: 'usedAmount', header: 'Tiền trừ', type: 'money', sum: true, width: 100 },
  { key: 'revokeReason', header: 'Lý do thu hồi', width: 180, hidden: true },
];

type Form = {
  code: string; name: string; kind: Campaign['kind']; issuer: Campaign['issuer']; issuerPartnerCode: string; paymentMethodCode: string; faceValue: string; minOrder: string;
  validFrom: string; validTo: string; validDays: string; skus: string; brandCodes: string; issueMode: Campaign['issueMode'];
  autoSkus: string; autoBrands: string; autoMinQty: string; autoBranches: string; note: string; status: Campaign['status'];
};
const emptyForm = (): Form => ({
  code: '', name: '', kind: 'cash', issuer: 'tgs', issuerPartnerCode: '', paymentMethodCode: '', faceValue: '', minOrder: '0', validFrom: today(), validTo: '', validDays: '',
  skus: '', brandCodes: '', issueMode: 'manual', autoSkus: '', autoBrands: '', autoMinQty: '1', autoBranches: '', note: '', status: 'active',
});
const toForm = (c: Campaign): Form => ({
  code: c.code, name: c.name, kind: c.kind, issuer: c.issuer, issuerPartnerCode: c.issuerPartnerCode ?? '', paymentMethodCode: c.paymentMethodCode ?? '', faceValue: String(c.faceValue),
  minOrder: String(c.minOrder), validFrom: c.validFrom, validTo: c.validTo ?? '', validDays: c.validDays ? String(c.validDays) : '', skus: c.skus.join(', '), brandCodes: c.brandCodes.join(', '),
  issueMode: c.issueMode, autoSkus: c.autoRule?.skus.join(', ') ?? '', autoBrands: c.autoRule?.brandCodes.join(', ') ?? '', autoMinQty: String(c.autoRule?.minQty ?? 1),
  autoBranches: c.autoRule?.branches.join(', ') ?? '', note: c.note ?? '', status: c.status,
});
const toBody = (f: Form) => ({
  code: f.code.trim(), name: f.name.trim(), kind: f.kind, issuer: f.issuer, issuerPartnerCode: f.issuer === 'brand' ? f.issuerPartnerCode.trim() || null : null,
  paymentMethodCode: f.issuer === 'brand' ? f.paymentMethodCode.trim() || null : null, faceValue: Number(f.faceValue) || 0, minOrder: Number(f.minOrder) || 0,
  validFrom: f.validFrom, validTo: f.validTo || null, validDays: f.validDays ? Number(f.validDays) : null, skus: list(f.skus), brandCodes: list(f.brandCodes), issueMode: f.issueMode,
  autoRule: f.issueMode === 'auto' ? { skus: list(f.autoSkus), brandCodes: list(f.autoBrands), minQty: Number(f.autoMinQty) || 1, branches: list(f.autoBranches) } : null,
  note: f.note.trim() || null,
});

function CampaignForm({ initial, id, onClose }: { initial: Form; id?: string; onClose: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const [f, setF] = useState(initial);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useMutation({
    mutationFn: () => (id ? api.put(`${M}/campaigns/${id}`, { ...toBody(f), status: f.status }) : api.post(`${M}/campaigns`, toBody(f))),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['voucher'] }); onClose(); },
  });
  return (
    <Modal title={id ? `Sửa đợt ${initial.code}` : 'Thêm đợt phát voucher'} onClose={onClose} wide
      footer={<><button type="button" className="btn" onClick={onClose}>Đóng</button><button type="button" className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Lưu</button></>}>
      <ErrorBox error={save.error ? errorText(save.error) : null} />
      <div className="grid-form" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
        <Field label="Mã đợt"><input className="input" value={f.code} onChange={set('code')} placeholder="ABBOTT50K" /></Field>
        <Field label="Tên đợt"><input className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label="Loại">
          <select className="input" value={f.kind} onChange={set('kind')}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label="Người phát" hint="TGS = chiết khấu trên hoá đơn (giảm doanh thu + thuế); hãng = hình thức thanh toán (phải thu hãng)">
          <select className="input" value={f.issuer} onChange={set('issuer')}>{Object.entries(ISSUER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        {f.issuer === 'brand' && <Field label="Hãng / NCC (mã đối tượng)"><input className="input" value={f.issuerPartnerCode} onChange={set('issuerPartnerCode')} /></Field>}
        {f.issuer === 'brand' && (
          <Field label="Hình thức thanh toán" hint="Kế toán khai tài khoản phải thu hãng ở Danh mục hình thức thanh toán">
            <input className="input" value={f.paymentMethodCode} onChange={set('paymentMethodCode')} placeholder="VC-ABBOTT" />
          </Field>
        )}
        <Field label="Mệnh giá (đồng)"><input className="input" type="number" value={f.faceValue} onChange={set('faceValue')} /></Field>
        <Field label="Đơn tối thiểu (đồng)"><input className="input" type="number" value={f.minOrder} onChange={set('minOrder')} /></Field>
        <Field label="Từ ngày"><input className="input" type="date" value={f.validFrom} onChange={set('validFrom')} /></Field>
        <Field label="Hết hạn ngày"><input className="input" type="date" value={f.validTo} onChange={set('validTo')} /></Field>
        <Field label="Hạn mỗi mã (ngày từ ngày phát)"><input className="input" type="number" value={f.validDays} onChange={set('validDays')} /></Field>
        {f.kind === 'next_purchase' && <Field label="Mã hàng áp dụng (cách nhau dấu phẩy)"><input className="input" value={f.skus} onChange={set('skus')} /></Field>}
        {f.kind === 'next_purchase' && <Field label="Nhãn áp dụng (mã nhãn)"><input className="input" value={f.brandCodes} onChange={set('brandCodes')} /></Field>}
        <Field label="Kiểu phát">
          <select className="input" value={f.issueMode} onChange={set('issueMode')}><option value="manual">Thủ công (sinh / nạp mã)</option><option value="auto">Tự động khi mua đủ điều kiện</option></select>
        </Field>
        {f.issueMode === 'auto' && <Field label="Điều kiện: mã hàng mua"><input className="input" value={f.autoSkus} onChange={set('autoSkus')} /></Field>}
        {f.issueMode === 'auto' && <Field label="Điều kiện: nhãn mua"><input className="input" value={f.autoBrands} onChange={set('autoBrands')} /></Field>}
        {f.issueMode === 'auto' && <Field label="Số lượng tối thiểu (đơn vị nhỏ nhất)"><input className="input" type="number" value={f.autoMinQty} onChange={set('autoMinQty')} /></Field>}
        {f.issueMode === 'auto' && <Field label="Cửa hàng (trống = mọi cửa hàng)"><input className="input" value={f.autoBranches} onChange={set('autoBranches')} /></Field>}
        {id && (
          <Field label="Trạng thái">
            <select className="input" value={f.status} onChange={set('status')}><option value="active">Đang dùng</option><option value="stopped">Ngừng</option></select>
          </Field>
        )}
        <Field label="Ghi chú" full><input className="input" value={f.note} onChange={set('note')} /></Field>
      </div>
      <p className="muted">Đợt đã phát mã thì không đổi loại, người phát, mệnh giá, đơn tối thiểu, phạm vi — lập đợt mới. Mỗi mã dùng một lần, phần dư mất.</p>
    </Modal>
  );
}

function IssueBox({ campaign }: { campaign: Campaign }) {
  const api = useApi();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'generate' | 'import'>('generate');
  const [text, setText] = useState('');
  const [per, setPer] = useState('1');
  const run = useMutation({
    mutationFn: () => {
      const rows = text.split(/\r?\n/).map((l) => l.split(/[\t,;]+/).map((x) => x.trim())).filter((r) => r[0]);
      return mode === 'generate'
        ? api.post<{ created: unknown[]; skipped: { row: number; reason: string }[] }>(`${M}/campaigns/${campaign.id}/generate`, { phones: rows.map((r) => r[0]), perPhone: Number(per) || 1 })
        : api.post<{ created: unknown[]; skipped: { row: number; reason: string }[] }>(`${M}/campaigns/${campaign.id}/import`, { items: rows.map((r) => ({ code: r[0], phone: r[1] ?? '' })) });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['voucher'] }); setText(''); },
  });
  return (
    <div className="card" style={{ padding: 8, marginBottom: 8 }}>
      <div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Phát mã">
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value as 'generate' | 'import')}><option value="generate">Sinh mã cho SĐT</option><option value="import">Nạp mã có sẵn</option></select>
        </Field>
        {mode === 'generate' && <Field label="Số mã mỗi SĐT"><input className="input" type="number" value={per} onChange={(e) => setPer(e.target.value)} style={{ width: 80 }} /></Field>}
        <button type="button" className="btn btn-primary" disabled={!text.trim() || run.isPending || campaign.status !== 'active'} onClick={() => run.mutate()}>Phát</button>
      </div>
      <textarea className="input" rows={4} style={{ width: '100%', marginTop: 6 }} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={mode === 'generate' ? 'Mỗi dòng một SĐT khách (dán cột từ Excel)' : 'Mỗi dòng: MÃ <tab hoặc dấu phẩy> SĐT khách (dán hai cột từ Excel)'} />
      <ErrorBox error={run.error ? errorText(run.error) : null} />
      {run.data && (
        <p className="muted">Đã phát {run.data.created.length} mã{run.data.skipped.length ? `; bỏ qua ${run.data.skipped.length}: ${run.data.skipped.slice(0, 10).map((s) => `dòng ${s.row} (${s.reason})`).join('; ')}` : ''}</p>
      )}
    </div>
  );
}

function CampaignDetail({ campaign, onClose, onEdit }: { campaign: Campaign; onClose: () => void; onEdit: () => void }) {
  const api = useApi();
  const can = useCan();
  const codes = useQuery({ queryKey: ['voucher', 'codes', campaign.id], queryFn: () => api.get<Code[]>(`${M}/codes`, { campaignId: campaign.id }) });
  return (
    <Modal title={`${campaign.code} · ${campaign.name}`} onClose={onClose} wide footer={<>{can('voucher:write') && <button type="button" className="btn" onClick={onEdit}>Sửa / ngừng</button>}<button type="button" className="btn" onClick={onClose}>Đóng</button></>}>
      <p className="muted">
        {KIND[campaign.kind]} · {campaign.issuer === 'brand' ? `Hãng ${campaign.issuerPartnerCode} — thanh toán ${campaign.paymentMethodCode}` : 'TGS — chiết khấu'} · mệnh giá {campaign.faceValue.toLocaleString('vi-VN')}đ
        {campaign.minOrder ? ` · đơn tối thiểu ${campaign.minOrder.toLocaleString('vi-VN')}đ` : ''} · từ {campaign.validFrom}{campaign.validTo ? ` đến ${campaign.validTo}` : ''}
        {campaign.skus.length || campaign.brandCodes.length ? ` · áp dụng ${[...campaign.skus, ...campaign.brandCodes.map((b) => `nhãn ${b}`)].join(', ')}` : ''}
        {campaign.autoRule ? ` · tự phát khi mua ${[...campaign.autoRule.skus, ...campaign.autoRule.brandCodes.map((b) => `nhãn ${b}`)].join(', ')} ≥ ${campaign.autoRule.minQty}` : ''}
      </p>
      {can('voucher:write') && campaign.issueMode === 'manual' && <IssueBox campaign={campaign} />}
      {codes.isLoading ? <Loading /> : codes.error ? <ErrorBox error={errorText(codes.error)} /> : (
        <DataGrid rows={codes.data ?? []} columns={codeCols} rowKey={(r) => r.code} storageKey="voucher.codes" maxHeight="40vh"
          exportName={`voucher-${campaign.code}`} exportTitle={`Mã voucher đợt ${campaign.code}`} emptyText="Chưa phát mã" />
      )}
    </Modal>
  );
}

function CampaignTab() {
  const api = useApi();
  const can = useCan();
  const q = useQuery({ queryKey: ['voucher', 'campaigns'], queryFn: () => api.get<Campaign[]>(`${M}/campaigns`) });
  const [pick, setPick] = useState<Campaign | null>(null);
  const [form, setForm] = useState<{ initial: Form; id?: string } | null>(null);
  return (
    <div>
      {can('voucher:write') && <div style={{ margin: '4px 0 8px' }}><button type="button" className="btn btn-primary" onClick={() => setForm({ initial: emptyForm() })}>Thêm đợt</button></div>}
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : (
        <DataGrid rows={q.data ?? []} columns={campaignCols} rowKey={(r) => r.id} storageKey="voucher.campaigns" onRowClick={setPick}
          exportName="dot-phat-voucher" exportTitle="Đợt phát voucher" emptyText="Chưa có đợt phát" />
      )}
      {pick && !form && <CampaignDetail campaign={(q.data ?? []).find((c) => c.id === pick.id) ?? pick} onClose={() => setPick(null)} onEdit={() => setForm({ initial: toForm(pick), id: pick.id })} />}
      {form && <CampaignForm initial={form.initial} {...(form.id ? { id: form.id } : {})} onClose={() => { setForm(null); setPick(null); }} />}
    </div>
  );
}

type LogRow = { action: string; source: string | null; refCode: string | null; branchCode: string | null; amount: number | null; note: string | null; at: string };
type CodeDetail = Code & { campaign: { code: string; name: string; issuer: string; faceValue: number }; log: LogRow[] };
const ACTION: Record<string, string> = { issue: 'Phát', use: 'Dùng', release: 'Trả lại', revoke: 'Thu hồi', conflict: 'Dùng trùng' };
const logCols: GridColumn<LogRow>[] = [
  { key: 'at', header: 'Lúc', width: 160, value: (r) => r.at.replace('T', ' ').slice(0, 19) },
  { key: 'action', header: 'Việc', width: 100, value: (r) => ACTION[r.action] ?? r.action },
  { key: 'refCode', header: 'Đơn / phiếu', width: 130 },
  { key: 'branchCode', header: 'Cửa hàng', width: 90 },
  { key: 'amount', header: 'Tiền', type: 'money', width: 100 },
  { key: 'note', header: 'Ghi chú', width: 280 },
];

function LookupTab() {
  const api = useApi();
  const qc = useQueryClient();
  const can = useCan();
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [find, setFind] = useState<{ code?: string; phone?: string }>({});
  const one = useQuery({ queryKey: ['voucher', 'code', find.code], enabled: Boolean(find.code), queryFn: () => api.get<CodeDetail>(`${M}/codes/${encodeURIComponent(find.code!)}`) });
  const many = useQuery({ queryKey: ['voucher', 'phone', find.phone], enabled: Boolean(find.phone), queryFn: () => api.get<Code[]>(`${M}/codes`, { phone: find.phone }) });
  const revoke = useMutation({
    mutationFn: (reason: string) => api.post(`${M}/codes/${encodeURIComponent(find.code!)}/revoke`, { reason }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['voucher'] }); },
  });
  const d = one.data;
  return (
    <div>
      <div className="row" style={{ gap: 8, margin: '4px 0 8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Mã voucher"><input className="input" value={code} onChange={(e) => setCode(e.target.value)} /></Field>
        <button type="button" className="btn btn-primary" onClick={() => setFind({ code: code.trim().toUpperCase() })} disabled={!code.trim()}>Tra mã</button>
        <Field label="SĐT khách"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <button type="button" className="btn" onClick={() => setFind({ phone: phone.trim() })} disabled={!phone.trim()}>Mã của khách</button>
      </div>
      {find.code && (one.isLoading ? <Loading /> : one.error ? <ErrorBox error={errorText(one.error)} /> : d && (
        <div className="card" style={{ padding: 8 }}>
          <p>
            <b>{d.code}</b> {stateBadge(d.state)} · đợt {d.campaign.code} ({d.campaign.name}) · {d.campaign.issuer === 'brand' ? 'hãng phát' : 'TGS phát'} · mệnh giá {d.campaign.faceValue.toLocaleString('vi-VN')}đ
            · SĐT {d.phone} · hạn {d.expiresOn ?? 'không hạn'}
          </p>
          {d.usedRefCode && <p>Đã dùng ở {d.usedSource === 'phieu-ban' ? 'phiếu' : 'đơn'} <b>{d.usedRefCode}</b> ngày {d.usedOn} tại {d.usedBranch} — trừ {(d.usedAmount ?? 0).toLocaleString('vi-VN')}đ</p>}
          {d.revokeReason && <p>Thu hồi: {d.revokeReason}</p>}
          {can('voucher:write') && d.state === 'active' && (
            <button type="button" className="btn btn-xs" onClick={() => { const r = window.prompt('Lý do thu hồi'); if (r) revoke.mutate(r); }}>Thu hồi</button>
          )}
          <ErrorBox error={revoke.error ? errorText(revoke.error) : null} />
          <DataGrid rows={d.log} columns={logCols} rowKey={(r, i) => `${r.at}-${i}`} storageKey="voucher.log" maxHeight="30vh" exportName={`nhat-ky-${d.code}`} />
        </div>
      ))}
      {find.phone && (many.isLoading ? <Loading /> : many.error ? <ErrorBox error={errorText(many.error)} /> : (
        <DataGrid rows={many.data ?? []} columns={codeCols} rowKey={(r) => r.code} storageKey="voucher.codes-phone" exportName={`voucher-${find.phone}`} emptyText="Khách chưa có voucher" />
      ))}
    </div>
  );
}

type RepCampaign = { campaignId: string; code: string; name: string; issuer: string; issuerPartnerCode: string | null; kind: string; faceValue: number } & Counts & { usedAmount: number };
type RepBranch = { campaignId: string; code: string; name: string; issuer: string; branchCode: string; source: string; used: number; usedAmount: number };
const issuerText = (r: { issuer: string; issuerPartnerCode?: string | null }) => (r.issuer === 'brand' ? `Hãng ${r.issuerPartnerCode ?? ''}` : 'TGS');
const repCols: GridColumn<RepCampaign>[] = [
  { key: 'code', header: 'Mã đợt', type: 'code', width: 120 },
  { key: 'name', header: 'Tên đợt', width: 200 },
  { key: 'issuer', header: 'Người phát', width: 130, value: issuerText },
  { key: 'faceValue', header: 'Mệnh giá', type: 'money', width: 100 },
  { key: 'issued', header: 'Phát hành', type: 'number', sum: true, width: 90 },
  { key: 'used', header: 'Đã dùng', type: 'number', sum: true, width: 80 },
  { key: 'active', header: 'Còn', type: 'number', sum: true, width: 70 },
  { key: 'expired', header: 'Hết hạn', type: 'number', sum: true, width: 80 },
  { key: 'revoked', header: 'Thu hồi', type: 'number', sum: true, width: 80 },
  { key: 'usedAmount', header: 'Tiền đã trừ', type: 'money', sum: true, width: 120 },
];
const branchCols: GridColumn<RepBranch>[] = [
  { key: 'code', header: 'Mã đợt', type: 'code', width: 120 },
  { key: 'name', header: 'Tên đợt', width: 200 },
  { key: 'issuer', header: 'Người phát', width: 100, value: issuerText },
  { key: 'branchCode', header: 'Cửa hàng', type: 'code', width: 90 },
  { key: 'source', header: 'Nơi dùng', width: 110, value: (r) => (r.source === 'phieu-ban' ? 'Phiếu bán BH10' : 'Máy bán') },
  { key: 'used', header: 'Số mã dùng', type: 'number', sum: true, width: 100 },
  { key: 'usedAmount', header: 'Tiền đã trừ', type: 'money', sum: true, width: 120 },
];

function ReportTab() {
  const api = useApi();
  const [draft, setDraft] = useState({ from: `${today().slice(0, 8)}01`, to: today(), issuer: '', branches: '' });
  const [f, setF] = useState(draft);
  const q = useQuery({ queryKey: ['voucher', 'report', f], queryFn: () => api.get<{ campaigns: RepCampaign[]; byBranch: RepBranch[] }>(`${M}/report`, Object.fromEntries(Object.entries(f).filter(([, v]) => v))) });
  return (
    <div>
      <div className="row" style={{ gap: 8, margin: '4px 0 8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Từ ngày"><input className="input" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></Field>
        <Field label="Đến ngày"><input className="input" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></Field>
        <Field label="Người phát">
          <select className="input" value={draft.issuer} onChange={(e) => setDraft({ ...draft, issuer: e.target.value })}><option value="">Tất cả</option><option value="tgs">TGS</option><option value="brand">Hãng / NCC</option></select>
        </Field>
        <Field label="Cửa hàng"><BranchCheckList value={draft.branches} onChange={(branches) => setDraft({ ...draft, branches })} /></Field>
        <button type="button" className="btn btn-primary" onClick={() => setF(draft)}>Xem</button>
      </div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : (
        <>
          <DataGrid rows={q.data?.campaigns ?? []} columns={repCols} rowKey={(r) => r.campaignId} storageKey="voucher.report" maxHeight="36vh"
            exportName="bao-cao-voucher" exportTitle={`Báo cáo voucher theo đợt ${f.from} – ${f.to}`} emptyText="Không có đợt phát" />
          <div className="card" style={{ marginTop: 8, padding: 8 }}>
            <b>Đã dùng theo cửa hàng</b>
            <DataGrid rows={q.data?.byBranch ?? []} columns={branchCols} rowKey={(r) => `${r.campaignId}|${r.branchCode}|${r.source}`} storageKey="voucher.report.branch" maxHeight="30vh"
              exportName="voucher-theo-cua-hang" exportTitle={`Voucher đã dùng theo cửa hàng ${f.from} – ${f.to}`} emptyText="Chưa có voucher dùng trong kỳ" />
          </div>
        </>
      )}
      <p className="muted">Phần theo đợt đếm mã phát trong kỳ (ngày phát); phần theo cửa hàng đếm mã dùng trong kỳ (ngày bán). Còn / hết hạn tính tới hôm nay.</p>
    </div>
  );
}

type Tab = 'dot' | 'tra-cuu' | 'bao-cao';
const TABS: [Tab, string][] = [['dot', 'Đợt phát'], ['tra-cuu', 'Tra cứu mã'], ['bao-cao', 'Báo cáo']];

export function VoucherPage() {
  const [tab, setTab] = useState<Tab>('dot');
  return (
    <div>
      <PageHeader title="Voucher" code="BH21" subtitle="Voucher tương đương tiền / lần mua sau sản phẩm – nhãn; TGS hoặc hãng phát; gắn SĐT khách; dùng một lần (voucher đổi điểm ở Điểm thành viên)" />
      <div className="row" style={{ gap: 4, marginBottom: 8 }}>
        {TABS.map(([k, label]) => <button key={k} type="button" className={`btn ${tab === k ? 'btn-primary' : ''}`} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      {tab === 'dot' && <CampaignTab />}
      {tab === 'tra-cuu' && <LookupTab />}
      {tab === 'bao-cao' && <ReportTab />}
    </div>
  );
}
