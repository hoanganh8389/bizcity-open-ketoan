/**
 * Thiết lập nhanh (TI15, PHASE-036 · 00 §12) — hộp thoại bốn bước cho đơn vị trắng: Bắt đầu → Công ty → Nạp gì → Đang nạp / Xong.
 * Chỉ giao diện: đọc / ghi qua API Core (core.setup.status / presets / plan / run, POST …/apply chạy nền, core.tenant.update).
 * "Xem công ty mẫu" (B5a, 00 §14): mở Công ty Mẫu riêng của bản cài (is_sample) — đăng xuất, trang đăng nhập điền sẵn mã đơn vị mẫu.
 * Không nạp chứng từ mẫu vào đơn vị đang dùng (Q036-1).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { ErrorBox, Field, Loading, PageHeader, Steps, errorText, useApi, useCan, useMutation, useQuery, useQueryClient } from '@bizcity/ui-kit';
import {
  COMING_INDUSTRIES, STEPS, sampleCard, activeRun, blocksParam, ownCompanyRows, runOutcome, stepLine, taxCodeError, tenantChanged,
  type PresetInfo, type SetupPlan, type SetupRun, type SetupStatus, type TenantInfo,
} from '../lib/thiet-lap';

type Form = Pick<TenantInfo, 'name' | 'taxCode' | 'address' | 'phone'>;
const NEXT_LINKS = [
  { href: '/nghiep-vu/so-du-tai-khoan', label: 'Nhập số dư đầu kỳ' },
  { href: '/nghiep-vu/phieu-thu', label: 'Lập phiếu thu đầu tiên' },
  { href: '/tien-ich/du-lieu-goc', label: 'Xem danh mục chuẩn (TI08)' },
];

export function ThietLapPage() {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['setup', 'status'], queryFn: () => api.get<SetupStatus>('/api/v1/setup/status') });
  const presets = useQuery({ queryKey: ['setup', 'presets'], queryFn: () => api.get<PresetInfo[]>('/api/v1/setup/presets') });
  const tenant = useQuery({ queryKey: ['tenant'], queryFn: () => api.get<TenantInfo>('/api/v1/tenant') });

  const [step, setStep] = useState(0);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [runId, setRunId] = useState<string | null>(null);

  // mở lại giữa chừng: còn lần chạy đang chạy → vào thẳng bước cuối
  useEffect(() => {
    const r = activeRun(status.data);
    if (r && !runId) { setRunId(r.id); setStep(3); }
  }, [status.data, runId]);
  useEffect(() => { if (!presetId && presets.data?.[0]) setPresetId(presets.data[0].id); }, [presets.data, presetId]);
  useEffect(() => { if (!form && tenant.data) setForm({ name: tenant.data.name, taxCode: tenant.data.taxCode ?? '', address: tenant.data.address ?? '', phone: tenant.data.phone ?? '' }); }, [tenant.data, form]);

  const blocks = blocksParam(picked);
  const fullPlan = useQuery({
    queryKey: ['setup', 'plan', presetId], enabled: step === 2 && Boolean(presetId),
    queryFn: () => api.get<SetupPlan>(`/api/v1/setup/presets/${presetId}/plan`),
  });
  const chosenPlan = useQuery({
    queryKey: ['setup', 'plan', presetId, blocks], enabled: step === 2 && Boolean(presetId),
    queryFn: () => api.get<SetupPlan>(`/api/v1/setup/presets/${presetId}/plan`, { blocks }),
  });
  const run = useQuery({
    queryKey: ['setup', 'run', runId], enabled: Boolean(runId),
    queryFn: () => api.get<SetupRun>(`/api/v1/setup/runs/${runId}`),
    refetchInterval: (q) => ((q.state.data as SetupRun | undefined)?.status === 'running' || !q.state.data ? 1000 : false),
  });

  const saveTenant = useMutation({
    mutationFn: (f: Form) => api.put<TenantInfo>('/api/v1/tenant', { name: f.name.trim(), taxCode: f.taxCode.trim(), address: f.address.trim(), phone: f.phone.trim() }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['tenant'] }); setStep(2); },
  });
  const apply = useMutation({
    mutationFn: () => api.post<{ runId: string; status: string; fresh: boolean }>(`/api/v1/setup/presets/${presetId}/apply?blocks=${encodeURIComponent(blocks)}`, {}),
    onSuccess: (r) => { setRunId(r.runId); setStep(3); void qc.invalidateQueries({ queryKey: ['setup', 'status'] }); },
    // đang có lần chạy khác (SETUP_RUNNING): đọc lại trạng thái — effect ở trên đưa vào lần chạy đó
    onError: () => { void qc.invalidateQueries({ queryKey: ['setup', 'status'] }); },
  });

  if (!can('settings:write')) {
    return <Shell><div className="card card-body">Chỉ người có quyền <b>Cấu hình</b> (chủ đơn vị, kế toán trưởng) chạy được Thiết lập nhanh. Nhờ chủ đơn vị thiết lập.</div></Shell>;
  }
  if (status.isLoading || presets.isLoading || tenant.isLoading) return <Shell><Loading /></Shell>;
  if (status.error || presets.error || tenant.error) return <Shell><ErrorBox error={errorText(status.error ?? presets.error ?? tenant.error)} /></Shell>;
  const st = status.data!;
  if (!st.empty && !st.runs.length && !runId) {
    return (
      <Shell>
        <div className="card card-body">
          <b>Đơn vị đã có dữ liệu nghiệp vụ.</b>
          <p className="muted">Thiết lập nhanh chỉ chạy trên đơn vị trắng, để không lẫn cấu hình mẫu vào sổ thật. Danh mục chuẩn: xem ở Dữ liệu gốc (TI08).</p>
          <div className="row"><a className="btn" href="/">Về Tổng quan</a><a className="btn" href="/tien-ich/du-lieu-goc">Mở TI08</a></div>
        </div>
      </Shell>
    );
  }

  const f = form ?? { name: '', taxCode: '', address: '', phone: '' };
  const mau = sampleCard(st);
  const mstErr = taxCodeError(f.taxCode);
  const outcome = runOutcome(run.data);

  return (
    <Shell>
      <div className="card" style={{ maxWidth: 820 }}>
        <div className="card-body">
          <Steps steps={STEPS} current={outcome === 'ok' ? STEPS.length : step} />
        </div>

        {step === 0 && (
          <div className="card-body">
            <p className="muted">Mất khoảng 1 phút. Đóng màn này giữa chừng không sao — mở lại ở menu Thiết lập nhanh (TI15).</p>
            <div className="row" style={{ alignItems: 'stretch', gap: 12, flexWrap: 'wrap' }}>
              <div className="card card-body" style={{ flex: '1 1 300px', opacity: mau.open ? 1 : 0.6 }} title={mau.note}>
                <b>Xem công ty mẫu</b> {!mau.open && <span className="badge badge-gray">{mau.code ? 'đang xem' : 'chưa có'}</span>}
                <p className="muted">Ba tháng nghiệp vụ hư cấu, báo cáo có số ngay — ở một đơn vị mẫu riêng, không đụng dữ liệu của bạn. {mau.note}.</p>
                {mau.open && <div><button type="button" className="btn" onClick={() => moCongTyMau(mau.code!)}>Mở Công ty Mẫu</button></div>}
              </div>
              <label className="card card-body" style={{ flex: '1 1 300px', cursor: 'pointer', outline: '2px solid var(--brand-600)' }}>
                <span className="row"><input type="radio" checked readOnly /> <b>Thiết lập công ty của tôi</b></span>
                <p className="muted">Thông tin công ty, chế độ ghi sổ chuẩn; danh mục mẫu nếu muốn. Sổ để trống để nhập số thật.</p>
              </label>
            </div>
            <Foot>
              <a className="btn" href="/">Để sau</a>
              <button type="button" className="btn btn-primary" onClick={() => setStep(1)}>Tiếp</button>
            </Foot>
          </div>
        )}

        {step === 1 && (
          <div className="card-body">
            <div className="form-grid">
              <Field label="Tên công ty *">
                <input className="input" value={f.name} maxLength={255} onChange={(e) => setForm({ ...f, name: e.target.value })} />
                {!f.name.trim() && <span className="o-loi-chu">Cần nhập tên công ty</span>}
              </Field>
              <Field label="Mã số thuế">
                <input className="input mono" value={f.taxCode} maxLength={14} onChange={(e) => setForm({ ...f, taxCode: e.target.value })} />
                {mstErr && <span className="o-loi-chu">{mstErr}</span>}
              </Field>
              <Field label="Địa chỉ" full><input className="input" value={f.address} maxLength={500} onChange={(e) => setForm({ ...f, address: e.target.value })} /></Field>
              <Field label="Điện thoại"><input className="input" value={f.phone} maxLength={64} onChange={(e) => setForm({ ...f, phone: e.target.value })} /></Field>
              <Field label="Chế độ kế toán"><input className="input" value="Thông tư 99 (doanh nghiệp)" disabled title="Phần mềm áp dụng một chế độ" /></Field>
              <Field label="Phương pháp tính thuế GTGT"><input className="input" value="Khấu trừ" disabled title="Phần mềm áp dụng một phương pháp" /></Field>
              <Field label="Ngành" full>
                <div className="row" style={{ flexWrap: 'wrap', gap: 16 }}>
                  {(presets.data ?? []).map((p) => (
                    <label key={p.id} className="checkbox"><input type="radio" name="nganh" checked={presetId === p.id} onChange={() => setPresetId(p.id)} /> {p.title}</label>
                  ))}
                  {COMING_INDUSTRIES.map((n) => <span key={n} className="muted" title="Chưa có gói mẫu cho ngành này">{n} <span className="badge badge-gray">sắp có</span></span>)}
                </div>
              </Field>
            </div>
            <ErrorBox error={saveTenant.error ? errorText(saveTenant.error) : null} />
            <Foot>
              <button type="button" className="btn" onClick={() => setStep(0)}>Quay lại</button>
              <button type="button" className="btn btn-primary" disabled={!f.name.trim() || Boolean(mstErr) || !presetId || saveTenant.isPending}
                title={!presetId ? 'Bản cài chưa có gói mẫu nào (thư mục presets/)' : !f.name.trim() ? 'Cần nhập tên công ty' : mstErr ?? (saveTenant.isPending ? 'Đang lưu thông tin công ty' : undefined)}
                onClick={() => (tenant.data && tenantChanged(f, tenant.data) ? saveTenant.mutate(f) : setStep(2))}>
                {saveTenant.isPending ? 'Đang lưu…' : 'Tiếp'}
              </button>
            </Foot>
          </div>
        )}

        {step === 2 && (
          <div className="card-body">
            {fullPlan.isLoading ? <Loading /> : fullPlan.error ? <ErrorBox error={errorText(fullPlan.error)} /> : (
              <table className="grid">
                <thead><tr><th style={{ width: 32 }} /><th>Khối</th><th className="num">Tổng</th><th className="num">Đã có</th><th className="num">Sẽ thêm</th></tr></thead>
                <tbody>
                  {ownCompanyRows(fullPlan.data!.blocks).map((b) => (
                    <tr key={b.key}>
                      <td><input type="checkbox" checked={b.locked || picked.includes(b.key)} disabled={b.locked}
                        title={b.locked ? 'Cấu hình luôn nạp (chỉ ở lần đầu, khi đơn vị còn trắng)' : undefined}
                        onChange={(e) => setPicked(e.target.checked ? [...picked, b.key] : picked.filter((x) => x !== b.key))} /></td>
                      <td>{b.locked ? b.label : `Danh mục mẫu · ${b.label}`}{!b.locked && <span className="muted"> (hư cấu)</span>}</td>
                      <td className="num">{b.total}</td><td className="num">{b.existing}</td><td className="num">{b.toAdd}</td>
                    </tr>
                  ))}
                  <tr>
                    <td><input type="checkbox" checked disabled title="Đã nạp lúc tạo đơn vị" /></td>
                    <td>Danh mục chuẩn (hệ thống tài khoản, loại thuế…) <span className="muted">— đã có từ lúc tạo đơn vị, xem ở <a href="/tien-ich/du-lieu-goc">TI08</a></span></td>
                    <td colSpan={3} />
                  </tr>
                </tbody>
              </table>
            )}
            <p className="muted">Danh mục mẫu mặc định tắt: chỉ tick khi muốn thử với mặt hàng, đối tượng hư cấu. Đã có mã thì bỏ qua, không sửa bản ghi của bạn.</p>
            {chosenPlan.data && !chosenPlan.data.allowed && <ErrorBox error={chosenPlan.data.reason} />}
            <ErrorBox error={apply.error ? errorText(apply.error) : chosenPlan.error ? errorText(chosenPlan.error) : null} />
            <Foot>
              <button type="button" className="btn" onClick={() => setStep(1)}>Quay lại</button>
              <button type="button" className="btn btn-primary" disabled={!chosenPlan.data?.allowed || apply.isPending}
                title={!chosenPlan.data ? 'Đang xem trước ở máy chủ' : !chosenPlan.data.allowed ? chosenPlan.data.reason ?? 'Máy chủ không cho chạy' : apply.isPending ? 'Đang gửi lệnh nạp' : undefined}
                onClick={() => apply.mutate()}>{apply.isPending ? 'Đang gửi…' : 'Nạp dữ liệu'}</button>
            </Foot>
          </div>
        )}

        {step === 3 && (
          <div className="card-body">
            {!run.data ? <Loading text="Đang bắt đầu…" /> : (
              <>
                <table className="grid">
                  <tbody>
                    {run.data.steps.map((s) => {
                      const l = stepLine(s);
                      return (
                        <tr key={s.key}>
                          <td>{s.label}</td>
                          <td><span className={`badge ${l.badge}`}>{l.text}</span></td>
                          <td className="muted">{s.firstError ? `${s.firstError.code}: ${s.firstError.message} (mã tra ${s.firstError.requestId})` : ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {run.data.error && <ErrorBox error={run.data.error} />}
                {outcome === 'retry' && <p className="muted">Phần đã nạp giữ nguyên. <b>Thử lại</b> nạp tiếp phần còn thiếu, không nhân đôi.</p>}
                {outcome === 'ok' && (
                  <>
                    <p><b>Xong.</b> Bước tiếp theo:</p>
                    <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>{NEXT_LINKS.map((x) => <a key={x.href} className="btn" href={x.href}>{x.label}</a>)}</div>
                  </>
                )}
              </>
            )}
            <ErrorBox error={apply.error ? errorText(apply.error) : null} />
            <Foot>
              {outcome === 'retry' && <button type="button" className="btn" disabled={apply.isPending} title={apply.isPending ? 'Đang gửi lệnh nạp' : undefined} onClick={() => apply.mutate()}>Thử lại</button>}
              <a className={`btn${outcome === 'ok' ? ' btn-primary' : ''}`} href="/">{outcome === 'running' ? 'Đóng (vẫn nạp tiếp ở máy chủ)' : 'Mở Tổng quan'}</a>
            </Foot>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div>
      <PageHeader title="Thiết lập nhanh" code="TI15" subtitle="Đơn vị mới: thông tin công ty, chế độ ghi sổ chuẩn, danh mục mẫu nếu muốn — nạp qua đúng đường của chứng từ thật" />
      {children}
    </div>
  );
}

function Foot({ children }: { children: ReactNode }) {
  return <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>{children}</div>;
}

/** Mở Công ty Mẫu: xin khung giao diện (sự kiện ketoan:open-sample) điền sẵn mã đơn vị mẫu, đăng xuất và tải lại — module không chạm vé đăng nhập. */
function moCongTyMau(code: string) {
  window.dispatchEvent(new CustomEvent('ketoan:open-sample', { detail: { code } }));
}
