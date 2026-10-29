/**
 * MẪU IN (HT05): quản lý toàn bộ mẫu in của phần mềm theo danh mục trung tâm (components/print/catalog.ts).
 *   - Phạm vi: cả đơn vị / một chi nhánh (chi nhánh cha áp cho các shop con) / một người dùng / của tôi.
 *   - Mỗi mẫu: bật / tắt, đặt mặc định của màn, chỉnh nội dung (tiêu đề, số liên, khổ, chữ ký, dòng căn cứ, ghi chú cuối, logo),
 *     bỏ cấu hình (về như mẫu gốc). Bố cục mẫu nằm trong code; ở đây chỉ lưu phần khác (bảng print_template_settings).
 *   - Ưu tiên khi in: người dùng → chi nhánh / shop → chi nhánh cha → cả đơn vị → mẫu gốc.
 * Người không có quyền cấu hình (settings:write) chỉ đặt được cho chính mình.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PrintOverrides, PrintScope, PrintSetting } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { BranchPicker } from '@/components/filters';
import { ErrorBox, Field, Loading, Modal } from '@/components/ui';
import { PAPER_LABEL, getPrintCatalog, templateCode, type CatalogScreen, type CatalogTemplate, type Paper } from '@/components/print';

type View = 'tenant' | 'branch' | 'user' | 'me';
interface UserLite { id: string; fullName: string; email: string; isActive: boolean }
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const PAPERS = Object.keys(PAPER_LABEL) as Paper[];

/** Tóm tắt phần chỉnh để hiện cạnh mẫu. */
function summary(o: PrintOverrides): string {
  return [
    o.title && `tiêu đề "${o.title}"`, o.copies && `${o.copies} liên`, o.paper && PAPER_LABEL[o.paper], o.signs?.length && `${o.signs.length} ô ký`,
    o.formNote !== undefined && (o.formNote ? 'dòng căn cứ riêng' : 'không in dòng căn cứ'), o.footer && 'ghi chú cuối', o.showLogo === false && 'không logo',
  ].filter(Boolean).join(' · ');
}

export function PrintTemplatesPage() {
  const { user, can } = useAuth();
  const admin = can('settings:write');
  const qc = useQueryClient();
  const [view, setView] = useState<View>(admin ? 'tenant' : 'me');
  const [branch, setBranch] = useState('');
  const [userId, setUserId] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ screen: CatalogScreen; tpl: CatalogTemplate } | null>(null);
  const scope: PrintScope = view === 'me' ? 'user' : view;
  const scopeRef = view === 'tenant' ? '' : view === 'branch' ? branch : view === 'user' ? userId : user?.id ?? '';
  const ready = scope === 'tenant' || Boolean(scopeRef);

  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserLite[]>('/api/v1/users'), enabled: admin, retry: false });
  const rowsQ = useQuery({
    queryKey: ['print-settings', 'list', scope, scopeRef],
    queryFn: () => api.get<PrintSetting[]>('/api/v1/print-templates/settings', { scope, scopeRef }),
    enabled: ready,
  });
  // Cấu hình chung của đơn vị — hiện "đang kế thừa" khi xem phạm vi chi nhánh / người dùng.
  const tenantQ = useQuery({ queryKey: ['print-settings', 'list', 'tenant', ''], queryFn: () => api.get<PrintSetting[]>('/api/v1/print-templates/settings', { scope: 'tenant', scopeRef: '' }), enabled: scope !== 'tenant' });
  const rows = useMemo(() => new Map((rowsQ.data ?? []).map((r) => [r.templateCode, r])), [rowsQ.data]);
  const inherited = useMemo(() => new Map((tenantQ.data ?? []).map((r) => [r.templateCode, r])), [tenantQ.data]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['print-settings'] });
  const save = useMutation({
    mutationFn: (b: { templateCode: string; isEnabled: boolean; isDefault: boolean; overrides: PrintOverrides }) => api.put('/api/v1/print-templates/settings', { ...b, scope, scopeRef }),
    onSuccess: () => { setEditing(null); void refresh(); },
  });
  const reset = useMutation({
    mutationFn: (code: string) => api.delete(`/api/v1/print-templates/settings?${new URLSearchParams({ templateCode: code, scope, scopeRef })}`),
    onSuccess: () => void refresh(),
  });
  /** Ghi một mẫu, giữ các phần không đổi của dòng đang có. */
  const put = (code: string, patch: Partial<{ isEnabled: boolean; isDefault: boolean; overrides: PrintOverrides }>) => {
    const cur = rows.get(code);
    save.mutate({ templateCode: code, isEnabled: cur?.isEnabled ?? true, isDefault: cur?.isDefault ?? false, overrides: cur?.overrides ?? {}, ...patch });
  };

  const q = fold(search.trim());
  const screens = getPrintCatalog().filter((s) => !q || fold(`${s.code} ${s.title} ${s.templates.map((x) => x.name).join(' ')}`).includes(q));

  return (
    <>
      <PageHeader title="Mẫu in" code="HT05" subtitle="Bật / tắt mẫu, đặt mẫu mặc định, chỉnh tiêu đề, số liên, chữ ký… theo đơn vị, chi nhánh hoặc người dùng — không phải sửa code" />
      <div className="card" style={{ padding: 10, marginBottom: 8 }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <b>Áp cho:</b>
          {admin && <label className="checkbox"><input type="radio" checked={view === 'tenant'} onChange={() => setView('tenant')} /> Cả đơn vị</label>}
          {admin && <label className="checkbox"><input type="radio" checked={view === 'branch'} onChange={() => setView('branch')} /> Chi nhánh / shop</label>}
          {admin && view === 'branch' && <div style={{ width: 280 }}><BranchPicker value={branch} onChange={setBranch} placeholder="Chọn chi nhánh (chi nhánh cha áp cho shop con)" /></div>}
          {admin && users.data && <label className="checkbox"><input type="radio" checked={view === 'user'} onChange={() => setView('user')} /> Người dùng</label>}
          {admin && view === 'user' && (
            <select className="select input" style={{ height: 30, width: 260 }} value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Chọn người dùng…</option>
              {(users.data ?? []).filter((u) => u.isActive).map((u) => <option key={u.id} value={u.id}>{u.fullName} ({u.email})</option>)}
            </select>
          )}
          <label className="checkbox"><input type="radio" checked={view === 'me'} onChange={() => setView('me')} /> Của tôi</label>
          <input className="input" style={{ width: 260, height: 30, marginLeft: 'auto' }} placeholder="Tìm màn, mẫu (mã hoặc tên)" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Khi in, cấu hình áp theo thứ tự <b>của người dùng → chi nhánh / shop → chi nhánh cha → cả đơn vị → mẫu gốc</b>. Phần chỉnh nội dung gộp từ chung tới riêng
          (đơn vị đặt chữ ký, shop chỉ đổi số liên thì vẫn giữ chữ ký của đơn vị). Hàng chữ ký riêng thay cho mọi hàng ký của mẫu (trừ ô ngân hàng trên uỷ nhiệm chi).
        </div>
      </div>
      <ErrorBox error={save.error ? errorText(save.error) : reset.error ? errorText(reset.error) : rowsQ.error ? errorText(rowsQ.error) : null} />
      {!ready ? <div className="card muted" style={{ padding: 16 }}>{view === 'branch' ? 'Chọn chi nhánh để xem / đặt cấu hình riêng của chi nhánh.' : 'Chọn người dùng.'}</div>
        : rowsQ.isLoading ? <Loading /> : (
          <div className="pt-list">
            {screens.map((s) => {
              const def = s.templates.find((x) => rows.get(templateCode(s.code, x.id))?.isDefault);
              const inhDef = scope !== 'tenant' ? s.templates.find((x) => inherited.get(templateCode(s.code, x.id))?.isDefault) : undefined;
              return (
                <div key={s.code} className="card pt-screen">
                  <div className="pt-head">
                    <span className="code">{s.code}</span> <b>{s.title}</b>
                    <span className="muted"> · {s.templates.length} mẫu{def ? ` · mặc định: ${def.name}` : inhDef ? ` · mặc định theo đơn vị: ${inhDef.name}` : ''}</span>
                    {def && <button className="btn btn-xs" style={{ marginLeft: 8 }} disabled={save.isPending} onClick={() => put(templateCode(s.code, def.id), { isDefault: false })} title="Bỏ mẫu mặc định ở phạm vi này (theo phạm vi chung hơn / lựa chọn trên máy)">Bỏ mặc định</button>}
                  </div>
                  <table className="grid-table pt-table">
                    <thead><tr><th style={{ width: '38%' }}>Mẫu</th><th style={{ width: 64 }}>Dùng</th><th style={{ width: 76 }}>Mặc định</th><th>Chỉnh nội dung</th><th style={{ width: 230 }} /></tr></thead>
                    <tbody>
                      {s.templates.map((x) => {
                        const code = templateCode(s.code, x.id);
                        const r = rows.get(code);
                        const inh = inherited.get(code);
                        const enabled = r ? r.isEnabled : inh ? inh.isEnabled : true;
                        return (
                          <tr key={x.id} className={enabled ? undefined : 'muted'}>
                            <td>
                              <b>{x.name}</b>
                              <div className="muted" style={{ fontSize: 11.5 }}>{code} · {PAPER_LABEL[x.paper]}{x.copies && x.copies > 1 ? ` · ${x.copies} liên` : ''}</div>
                            </td>
                            <td className="c"><input type="checkbox" checked={enabled} disabled={save.isPending} title={!r && inh ? 'Đang theo cấu hình cả đơn vị' : undefined} onChange={(e) => put(code, { isEnabled: e.target.checked, ...(e.target.checked ? {} : { isDefault: false }) })} /></td>
                            <td className="c"><input type="radio" name={`def-${s.code}`} checked={Boolean(r?.isDefault)} disabled={save.isPending || !enabled || x.screen} onChange={() => put(code, { isDefault: true, isEnabled: true })} /></td>
                            <td style={{ fontSize: 12.5 }}>
                              {r && summary(r.overrides) ? summary(r.overrides) : <span className="muted">{inh && summary(inh.overrides) ? `theo đơn vị: ${summary(inh.overrides)}` : '—'}</span>}
                              {r && <div className="muted" style={{ fontSize: 11 }}>Sửa {dateTime(r.updatedAt)} · {r.updatedBy}</div>}
                            </td>
                            <td className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                              {!x.screen && <button className="btn btn-xs" onClick={() => setEditing({ screen: s, tpl: x })}>Chỉnh nội dung…</button>}
                              {r && <button className="btn btn-xs" disabled={reset.isPending} title="Xoá cấu hình ở phạm vi này, về như phạm vi chung / mẫu gốc" onClick={() => { if (window.confirm(`Bỏ cấu hình mẫu "${x.name}" ở phạm vi này?`)) reset.mutate(code); }}>Bỏ cấu hình</button>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
            {!screens.length && <div className="card muted" style={{ padding: 16 }}>Không có màn / mẫu nào khớp "{search}".</div>}
          </div>
        )}
      {editing && (
        <OverridesForm screen={editing.screen} tpl={editing.tpl} value={rows.get(templateCode(editing.screen.code, editing.tpl.id))?.overrides ?? {}} saving={save.isPending} error={save.error}
          onClose={() => setEditing(null)} onSave={(overrides) => put(templateCode(editing.screen.code, editing.tpl.id), { overrides })} />
      )}
    </>
  );
}

/** Hộp chỉnh nội dung một mẫu: ô để trống = theo mẫu gốc (hoặc phạm vi chung hơn). */
function OverridesForm({ screen, tpl, value, saving, error, onClose, onSave }: {
  screen: CatalogScreen; tpl: CatalogTemplate; value: PrintOverrides; saving: boolean; error: unknown; onClose: () => void; onSave: (o: PrintOverrides) => void;
}) {
  const [v, setV] = useState<PrintOverrides>(value);
  const set = (p: Partial<PrintOverrides>) => setV((x) => ({ ...x, ...p }));
  const clean = (o: PrintOverrides): PrintOverrides => Object.fromEntries(Object.entries(o).filter(([k, x]) => x !== undefined && x !== '' || (k === 'formNote' && x === ''))) as PrintOverrides;
  const signs = v.signs ?? [];
  const setSign = (i: number, p: Partial<NonNullable<PrintOverrides['signs']>[number]>) => set({ signs: signs.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  return (
    <Modal wide title={`Chỉnh nội dung — ${screen.code} · ${tpl.name}`} onClose={onClose}
      footer={<>
        <button className="btn btn-primary" disabled={saving || signs.some((s) => !s.title.trim())} onClick={() => onSave(clean({ ...v, signs: signs.length ? signs : undefined }))}>Ghi</button>
        <button className="btn" onClick={() => setV({})} title="Xoá mọi phần chỉnh (về như mẫu gốc)">Về mẫu gốc</button>
        <button className="btn" onClick={onClose}>Thoát</button>
      </>}>
      <div className="full muted" style={{ fontSize: 12.5 }}>Ô để trống = giữ như mẫu gốc (hoặc như phạm vi chung hơn). Bố cục, cột số liệu của mẫu không đổi ở đây.</div>
      <Field label="Tiêu đề tờ in" hint="Vd PHIẾU XUẤT KHO KIÊM BẢO HÀNH"><input className="input" value={v.title ?? ''} onChange={(e) => set({ title: e.target.value || undefined })} /></Field>
      <Field label="Số liên" hint={`Mẫu gốc: ${tpl.copies ?? 1}`}><input className="input num" type="number" min={1} max={5} value={v.copies ?? ''} onChange={(e) => set({ copies: e.target.value ? Math.max(1, Math.min(5, Math.floor(Number(e.target.value)))) : undefined })} /></Field>
      <Field label="Khổ giấy" hint={`Mẫu gốc: ${PAPER_LABEL[tpl.paper]}`}>
        <select className="select input" value={v.paper ?? ''} onChange={(e) => set({ paper: (e.target.value || undefined) as Paper | undefined })}>
          <option value="">Theo mẫu gốc</option>{PAPERS.map((p) => <option key={p} value={p}>{PAPER_LABEL[p]}</option>)}
        </select>
      </Field>
      <Field label="Logo đơn vị"><label className="checkbox"><input type="checkbox" checked={v.showLogo !== false} onChange={(e) => set({ showLogo: e.target.checked ? undefined : false })} /> In logo (logo đặt ở Thông tin đơn vị, HT03)</label></Field>
      <Field label="Dòng căn cứ dưới mẫu số" full hint="Để trống = theo mẫu gốc; tích 'Không in' để bỏ hẳn dòng này">
        <div className="row" style={{ gap: 8 }}>
          <input className="input" style={{ flex: 1 }} disabled={v.formNote === ''} value={v.formNote ?? ''} placeholder="(Ban hành theo Thông tư số …)" onChange={(e) => set({ formNote: e.target.value || undefined })} />
          <label className="checkbox"><input type="checkbox" checked={v.formNote === ''} onChange={(e) => set({ formNote: e.target.checked ? '' : undefined })} /> Không in</label>
        </div>
      </Field>
      <Field label="Ghi chú cuối tờ" full hint="Vd chính sách đổi trả, số tài khoản nhận tiền"><textarea className="input" rows={2} value={v.footer ?? ''} onChange={(e) => set({ footer: e.target.value || undefined })} /></Field>
      <div className="full">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <b>Hàng chữ ký</b>
          <span className="muted" style={{ fontSize: 12 }}>Để trống = theo mẫu gốc. Chức danh trùng mẫu gốc thì vẫn giữ dấu "Đã ký xác nhận".</span>
        </div>
        {signs.map((s, i) => (
          <div key={i} className="row" style={{ gap: 6, marginTop: 4 }}>
            <input className="input" style={{ width: 200 }} placeholder="Chức danh (vd Kế toán trưởng)" value={s.title} onChange={(e) => setSign(i, { title: e.target.value })} />
            <input className="input" style={{ width: 200 }} placeholder="Ghi chú (vd (Ký, họ tên))" value={s.note ?? ''} onChange={(e) => setSign(i, { note: e.target.value || undefined })} />
            <input className="input" style={{ flex: 1 }} placeholder="Tên in sẵn (nếu có)" value={s.name ?? ''} onChange={(e) => setSign(i, { name: e.target.value || undefined })} />
            <button className="btn btn-xs" onClick={() => set({ signs: signs.filter((_, j) => j !== i) })}>×</button>
          </div>
        ))}
        {signs.length < 8 && <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => set({ signs: [...signs, { title: '' }] })}>+ Thêm ô ký</button>}
      </div>
      {Boolean(error) && <div className="alert alert-bad full">{errorText(error)}</div>}
    </Modal>
  );
}
