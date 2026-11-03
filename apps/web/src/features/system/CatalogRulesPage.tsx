// [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — HT09 "Quy định dữ liệu danh mục": mặt hàng mới từ chứng từ (D024-3) + duyệt luật nhắc của khung Vì sao (D023-4 / D023-8)
/**
 * QUY ĐỊNH DỮ LIỆU DANH MỤC (HT09) — công cụ cho người có quyền ([2026-11-03 02:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — ADR-0020: Core không mã hoá quy trình theo chức danh):
 *   1. Mặt hàng mới từ chứng từ: xem hệ thống bán hàng đã tự thêm gì (7 ngày), rồi tự quyết tắt / bật — có lý do, ghi nhật ký.
 *   2. Luật nhắc: mỗi luật hiện ĐÚNG như người dùng thấy trong form (bản xem trước) kèm căn cứ; luật chạy ngay. Sửa câu chữ ·
 *      Hạ xuống nhắc (chỉ cảnh báo mềm, bắt buộc lý do) · Về mặc định.
 * Quyền (phân quyền quyết định, không theo chức danh): đổi tự thêm mặt hàng = settings:write; chỉnh luật = conformance:approve.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { WARN_ACK_MIN_REASON, type CatalogFinding } from '@ketoan/contracts';
import { PageHeader } from '@/components/PageHeader';
import { WhyPanel } from '@/components/WhyPanel';
import { ErrorBox, Field, Loading } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime } from '@/lib/format';
import { autoCreatedSummary, useAutoCreate } from '../catalog/autoCreate';

type Entity = 'account' | 'partner' | 'item';
interface Rule {
  code: string; entity: Entity; level: CatalogFinding['level']; effectiveLevel: CatalogFinding['level']; rule: string | null;
  status: 'default' | 'edited' | 'lowered'; edited: boolean; canLower: boolean; vars: string[]; basis: string[];
  defaults: { title: string; why: string; fix: string | null };
  overrides: { title: string | null; why: string | null; fix: string | null };
  preview: CatalogFinding;
  review: { note: string; by: string; at: string } | null;
  stale: boolean;
}
const ENTITY_LABEL: Record<Entity, string> = { account: 'Tài khoản', partner: 'Đối tượng', item: 'Mặt hàng' };
const LEVEL_LABEL: Record<CatalogFinding['level'], string> = { info: 'nhắc', guide: 'hướng dẫn', warn: 'cảnh báo mềm', block: 'chặn' };
// [2026-11-03 02:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — ADR-0020: không có trạng thái "chờ duyệt" — luật chạy ngay; đơn vị chỉ chỉnh nếu muốn (ai được chỉnh là việc của phân quyền)
const STATUS: Record<Rule['status'], { text: string; cls: string }> = {
  default: { text: 'Mặc định', cls: '' }, edited: { text: 'Đơn vị đã sửa câu chữ', cls: 'badge-ok' }, lowered: { text: 'Đơn vị đã hạ xuống nhắc', cls: 'badge-info' },
};

export function CatalogRulesPage() {
  const { can } = useAuth();
  const canWrite = can('settings:write');
  const canReview = can('conformance:approve');
  return (
    <div>
      <PageHeader title="Quy định dữ liệu danh mục" code="HT09" helpKey="quy-dinh-du-lieu-danh-muc" subtitle="Đơn vị quyết định: mặt hàng mới từ chứng từ vào sổ thế nào, và khung Vì sao nhắc người nhập điều gì" />
      <AutoCreateSection canWrite={canWrite} />
      <RulesSection canWrite={canReview} />
    </div>
  );
}

function AutoCreateSection({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient();
  const { setting, report } = useAutoCreate();
  const [reason, setReason] = useState('');
  const mode = setting.data?.mode;
  const next = mode === 'on' ? 'off' : 'on';
  const save = useMutation({
    mutationFn: () => api.put('/api/v1/settings/item-auto-create', { mode: next, reason: reason.trim() }),
    onSuccess: () => { setReason(''); void qc.invalidateQueries({ queryKey: ['item-auto-create'] }); },
  });
  return (
    <section className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginTop: 0 }}>Mặt hàng mới từ chứng từ</h3>
      {setting.isLoading ? <Loading /> : setting.error ? <ErrorBox error={errorText(setting.error)} /> : (
        <>
          <div className={`dev-answer ${mode === 'on' ? 'warn' : ''}`}>
            {mode === 'on'
              ? <>Đang <b>BẬT</b> (mặc định): mã hàng lạ trên chứng từ được tự thêm vào danh mục và vào sổ ngay, theo nhóm hạch toán mặc định; kế toán được nhắc kiểm qua thông báo và dải nhắc ở danh sách mặt hàng.</>
              : <>Đang <b>TẮT</b>: mã hàng lạ thành <b>mặt hàng nháp</b> (điền sẵn tên, đơn vị tính từ dòng chứng từ); chứng từ chờ ở Trạm kiểm tra tới khi kế toán kích hoạt mặt hàng.</>}
            {setting.data?.last && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Lần đổi gần nhất: {dateTime(setting.data.last.at)} · {setting.data.last.by}{setting.data.last.reason ? ` · "${setting.data.last.reason}"` : ''}</div>}
          </div>
          {report.data && (
            <div style={{ margin: '8px 0', fontSize: 13 }}>
              {autoCreatedSummary(report.data)} <Link to="/danh-muc/mat-hang">Xem danh mục mặt hàng</Link>
            </div>
          )}
          {canWrite && (
            <div className="alert alert-info" style={{ marginTop: 8 }}>
              {next === 'off'
                ? <>Khi <b>tắt</b>: hệ thống bán hàng vẫn bán bình thường, chứng từ vẫn được nhận nhưng <b>chưa vào sổ</b> nếu có mã hàng mới. Kế toán sẽ có việc mới là kích hoạt mặt hàng nháp (có nút kích hoạt hàng loạt ở danh mục mặt hàng). Nên báo trước bên tích hợp POS đồng bộ danh mục trước khi gửi chứng từ.</>
                : <>Khi <b>bật lại</b>: mã hàng lạ vào sổ ngay theo nhóm mặc định, không qua kiểm — đơn vị tính / nhóm hạch toán sai sẽ làm sai kho và giá vốn.</>}
              <Field label={`Lý do (bắt buộc, ≥ ${WARN_ACK_MIN_REASON} ký tự — ghi vào nhật ký)`} full>
                <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={next === 'off' ? 'vd đã báo bên POS ngày 03/11' : 'vd tạm bật trong đợt nhập danh mục đầu kỳ'} />
              </Field>
              <button className="btn btn-primary btn-sm" disabled={reason.trim().length < WARN_ACK_MIN_REASON || save.isPending} onClick={() => save.mutate()}>
                {next === 'off' ? 'Tắt tự thêm mặt hàng' : 'Bật lại tự thêm mặt hàng'}
              </button>
              <ErrorBox error={save.error ? errorText(save.error) : null} />
            </div>
          )}
        </>
      )}
    </section>
  );
}

function RulesSection({ canWrite }: { canWrite: boolean }) {
  const [entity, setEntity] = useState<Entity>('account');
  const q = useQuery({ queryKey: ['catalog-rules'], queryFn: () => api.get<{ items: Rule[]; total: number; customized: number }>('/api/v1/catalog-rules') });
  const items = q.data?.items ?? [];
  const of = (e: Entity) => items.filter((r) => r.entity === e);
  return (
    <section className="card">
      <h3 style={{ marginTop: 0 }}>Luật nhắc của khung Vì sao</h3>
      <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
        Mỗi luật hiện đúng như người nhập sẽ thấy trong form, kèm căn cứ. Luật chạy ngay; đơn vị có thể sửa câu chữ hoặc hạ cảnh báo mềm xuống nhắc — mỗi lần chỉnh ghi vào nhật ký.
      </div>
      <div role="tablist" className="row" style={{ gap: 4, marginBottom: 10 }}>
        {(Object.keys(ENTITY_LABEL) as Entity[]).map((e) => {
          const list = of(e);
          return <button key={e} role="tab" className={`tab ${entity === e ? 'active' : ''}`} onClick={() => setEntity(e)}>{ENTITY_LABEL[e]} <small className="muted">{list.length}</small></button>;
        })}
      </div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : of(entity).map((r) => <RuleCard key={r.code} rule={r} canWrite={canWrite} />)}
    </section>
  );
}

function RuleCard({ rule, canWrite }: { rule: Rule; canWrite: boolean }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<null | 'edit' | 'lower'>(null);
  const [t, setT] = useState({ title: '', why: '', fix: '', note: '' });
  const review = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<Rule>(`/api/v1/catalog-rules/${rule.code}/review`, body),
    onSuccess: () => { setMode(null); void qc.invalidateQueries({ queryKey: ['catalog-rules'] }); void qc.invalidateQueries({ queryKey: ['catalog-why'] }); },
  });
  const openEdit = () => {
    setT({ title: rule.overrides.title ?? rule.defaults.title, why: rule.overrides.why ?? rule.defaults.why, fix: rule.overrides.fix ?? rule.defaults.fix ?? '', note: '' });
    setMode('edit');
  };
  // Gửi null cho ô trùng mặc định → giữ theo bản mặc định (sau này bản mặc định được sửa thì đơn vị hưởng luôn).
  const diff = (v: string, d: string | null) => (v.trim() === (d ?? '').trim() ? null : v.trim());
  const st = STATUS[rule.status];
  return (
    <div style={{ border: '1px solid var(--line, #dfe6ef)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
      <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <b>{rule.code}</b>
        <span className="muted" style={{ fontSize: 12 }}>mức: {LEVEL_LABEL[rule.level]}{rule.effectiveLevel !== rule.level ? ` → ${LEVEL_LABEL[rule.effectiveLevel]} (tại đơn vị)` : ''}{rule.rule ? ` · ${rule.rule}` : ''}</span>
        {rule.status !== 'default' && <span className={`badge ${st.cls}`}>{st.text}</span>}
        {rule.stale && <span className="badge badge-warn" title="Luật gốc đã đổi ở bản phát hành sau lần chỉnh; phần chỉnh cũ không còn áp">luật đã đổi — phần chỉnh cũ hết hiệu lực</span>}
      </div>
      <WhyPanel findings={[rule.preview]} />
      {rule.review && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{rule.review.by} · {dateTime(rule.review.at)}{rule.review.note ? ` · "${rule.review.note}"` : ''}</div>}
      {canWrite && !mode && (
        <div className="row" style={{ gap: 6, marginTop: 8 }}>
          <button className="btn btn-xs" onClick={openEdit}>Sửa câu chữ</button>
          {rule.canLower && rule.status !== 'lowered' && <button className="btn btn-xs" onClick={() => { setT({ ...t, note: '' }); setMode('lower'); }}>Hạ xuống nhắc</button>}
          {rule.status === 'lowered' && <button className="btn btn-xs" disabled={review.isPending} onClick={() => review.mutate({ decision: 'unlower' })}>Bỏ hạ mức</button>}
          {rule.status !== 'default' && <button className="btn btn-xs" disabled={review.isPending} onClick={() => review.mutate({ decision: 'reset' })}>Về mặc định</button>}
        </div>
      )}
      {mode === 'edit' && (
        <div style={{ marginTop: 8 }}>
          <div className="muted" style={{ fontSize: 12 }}>Biến dùng được: {rule.vars.length ? rule.vars.map((v) => `{${v}}`).join(', ') : 'không có'} — phần mềm thay bằng giá trị thật khi hiện trong form.</div>
          <Field label="Câu ngắn" full><input className="input" value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} /></Field>
          <Field label="Vì sao" full><textarea className="input" rows={3} value={t.why} onChange={(e) => setT({ ...t, why: e.target.value })} /></Field>
          {(rule.level === 'warn' || rule.level === 'block') && <Field label="Cách sửa" full><textarea className="input" rows={2} value={t.fix} onChange={(e) => setT({ ...t, fix: e.target.value })} /></Field>}
          <Field label="Ghi chú (tuỳ chọn)" full><input className="input" value={t.note} onChange={(e) => setT({ ...t, note: e.target.value })} /></Field>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-primary btn-xs" disabled={!t.title.trim() || !t.why.trim() || review.isPending}
              onClick={() => review.mutate({ decision: 'edit', title: diff(t.title, rule.defaults.title), why: diff(t.why, rule.defaults.why), fix: diff(t.fix, rule.defaults.fix), note: t.note.trim() })}>Lưu câu chữ</button>
            <button className="btn btn-xs" onClick={() => setMode(null)}>Huỷ</button>
          </div>
        </div>
      )}
      {mode === 'lower' && (
        <div className="alert alert-warn" style={{ marginTop: 8 }}>
          Cảnh báo này sẽ thành <b>nhắc</b> ở đơn vị bạn: người lưu không phải ghi lý do nữa. Quyết định của kế toán trưởng, ghi vào nhật ký.
          <Field label={`Lý do hạ mức (bắt buộc, ≥ ${WARN_ACK_MIN_REASON} ký tự)`} full><input className="input" autoFocus value={t.note} onChange={(e) => setT({ ...t, note: e.target.value })} /></Field>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-primary btn-xs" disabled={t.note.trim().length < WARN_ACK_MIN_REASON || review.isPending} onClick={() => review.mutate({ decision: 'lower', note: t.note.trim() })}>Hạ xuống nhắc</button>
            <button className="btn btn-xs" onClick={() => setMode(null)}>Huỷ</button>
          </div>
        </div>
      )}
      <ErrorBox error={review.error ? errorText(review.error) : null} />
    </div>
  );
}
