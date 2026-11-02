// [2026-11-02 03:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-20: màn Hệ thống → Kiểm chuẩn (HT06) — ba lớp, ma trận ca theo 6 trạng thái, Vì sao, Việc cần làm, xu hướng; theo ma trận BizCity, không điểm %.
/**
 * KIỂM CHUẨN (HT06, ADR-0012 §5). Ba câu hỏi, ba thẻ: Module · Cấu hình · Doanh nghiệp — mỗi lớp một kết quả riêng (layer_results).
 * Ma trận: hàng = ca, cột = căn cứ (điều khoản + trạng thái rà) / trạng thái (6 mức, có chữ) / Vì sao / Việc cần làm.
 * Không có điểm tuân thủ % (T5): mỗi lớp chỉ hiện số ca theo trạng thái và số ca có bằng chứng. Không nút sửa sổ / tắt kiểm / bỏ qua.
 * Nút "Chạy kiểm chuẩn" (quyền conformance:run) chỉ đọc sổ và lưu thêm một ảnh chụp; lịch đêm chạy lúc 01:00 giờ VN.
 */
import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime } from '@/lib/format';
import {
  ENTITY_LABEL, LAYERS, REGIME_LABEL, RESULT, STATUS, STATUS_ORDER, hasEvidence, todoForCase, useLatestRun, useProfile, useRuns,
  type ConformanceCase, type ConformanceRun, type Layer, type RunSummary,
} from './conformance';

const who = (actor: string) => (actor === 'system:nightly' ? 'lịch đêm' : actor.startsWith('user:') ? 'chạy tay' : actor);

export function ConformancePage() {
  const { can } = useAuth();
  const latest = useLatestRun();
  const runs = useRuns();
  const profile = useProfile();
  const qc = useQueryClient();
  const [layer, setLayer] = useState<Layer>('enterprise');
  const run = useMutation({
    mutationFn: () => api.post<ConformanceRun>('/api/v1/conformance/runs', {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['conformance'] }); },
  });
  const r = latest.data;
  const prof = profile.data?.current;

  return (
    <div>
      <PageHeader title="Kiểm chuẩn" code="HT06" subtitle="Đơn vị đáp ứng đến đâu theo bộ quy định có hiệu lực — phân tích để bạn quyết định, không chặn ghi sổ"
        actions={<>
          <Link className="btn" to="/he-thong/ho-so-ke-toan">Hồ sơ kế toán</Link>
          {can('conformance:run') && (
            <button type="button" className="btn btn-primary" disabled={run.isPending} onClick={() => run.mutate()} title="Chỉ đọc sổ; lưu thêm một ảnh chụp kết quả">
              {run.isPending ? 'Đang kiểm…' : 'Chạy kiểm chuẩn'}
            </button>
          )}
        </>} />
      {run.error && <ErrorBox error={errorText(run.error)} />}
      {latest.isLoading ? <Loading /> : latest.error ? <ErrorBox error={errorText(latest.error)} /> : !r ? (
        <div className="dev-answer warn"><b>Chưa có lượt kiểm chuẩn nào</b><p>Lượt đầu chạy theo lịch đêm (01:00), hoặc bấm <b>Chạy kiểm chuẩn</b>. Nên khai <Link to="/he-thong/ho-so-ke-toan">hồ sơ kế toán</Link> trước để chọn đúng bộ quy định.</p></div>
      ) : (
        <>
          <div className="cf-head card card-body">
            <div><span className={`badge ${RESULT[r.result].cls}`}>{RESULT[r.result].text}</span> <span className="muted">· nhãn: {r.label}</span></div>
            <div className="muted">
              Lượt {dateTime(r.createdAt)} ({who(r.actor)}) · ngày đánh giá {r.asOf} · kho rulepack {r.kitVersion ?? '—'}
              {' · '}{r.rulepacks.filter((p) => p.status === 'approved').length}/{r.rulepacks.length} rulepack đã duyệt
            </div>
            <div className="muted">
              Hồ sơ: {prof ? <>{REGIME_LABEL[prof.regime] ?? prof.regime} · {ENTITY_LABEL[prof.entityType] ?? prof.entityType} · năm tài chính từ tháng {prof.fiscalYearStartMonth} (bản {prof.version})</> : <b className="text-bad">chưa khai — ca lớp Cấu hình và Doanh nghiệp chờ duyệt</b>}
            </div>
          </div>

          <div className="cf-layers">
            {LAYERS.map((l) => <LayerCard key={l.key} run={r} layer={l.key} active={layer === l.key} onPick={() => setLayer(l.key)} />)}
          </div>

          <Matrix cases={r.cases.filter((c) => c.layer === layer)} rulepacks={r.rulepacks} />

          <Trend list={runs.data ?? []} />

          <div className="card card-body cf-foot">
            {r.knownExclusions.length > 0 && (
              <><b>Ngoài phạm vi lượt này</b><ul>{r.knownExclusions.map((x) => <li key={x.scope}><b>{x.scope}</b>: {x.reason}</li>)}</ul></>
            )}
            <p className="muted">Ma trận C-1..C-9 ở Kiến trúc đo năng lực của Core; màn này đo đơn vị của bạn. Không có điểm tuân thủ %: "Chờ duyệt" và "Chưa kiểm được" không bao giờ là đạt.</p>
            <p className="muted">{r.disclaimer}</p>
          </div>
        </>
      )}
      {runs.error && <ErrorBox error={errorText(runs.error)} />}
    </div>
  );
}

function Trend({ list }: { list: RunSummary[] }) {
  if (list.length < 2) return null;
  return (
    <div className="card">
      <div className="card-body" style={{ paddingBottom: 0 }}><b>Xu hướng {list.length} lượt gần đây</b></div>
      <div className="table-wrap"><table className="grid">
        <thead><tr><th>Lúc</th><th>Ngày đánh giá</th><th>Ai</th>{LAYERS.map((l) => <th key={l.key}>{l.label}</th>)}<th>Chung</th></tr></thead>
        <tbody>{list.map((x) => (
          <tr key={x.id}>
            <td>{dateTime(x.createdAt)}</td><td>{x.asOf}</td><td>{who(x.actor)}</td>
            {LAYERS.map((l) => { const v = x.layerResults[l.key]; return <td key={l.key}>{v ? <span className={`badge ${RESULT[v].cls}`}>{RESULT[v].text}</span> : <span className="muted">—</span>}</td>; })}
            <td><span className={`badge ${RESULT[x.result].cls}`}>{RESULT[x.result].text}</span></td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

function LayerCard({ run, layer, active, onPick }: { run: ConformanceRun; layer: Layer; active: boolean; onPick: () => void }) {
  const meta = LAYERS.find((l) => l.key === layer)!;
  const cases = run.cases.filter((c) => c.layer === layer);
  const applicable = cases.filter((c) => c.status !== 'NOT_APPLICABLE');
  const res = run.layerResults[layer];
  return (
    <button type="button" className={`cf-layer card${active ? ' on' : ''}`} onClick={onPick} aria-pressed={active}>
      <div className="cf-layer-top"><b>{meta.label}</b>{res && <span className={`badge ${RESULT[res].cls}`}>{RESULT[res].text}</span>}</div>
      <div className="muted cf-q">{meta.question}</div>
      <div className="cf-counts">
        {STATUS_ORDER.map((s) => { const n = cases.filter((c) => c.status === s).length; return n ? <span key={s} className={`badge ${STATUS[s].cls}`} title={STATUS[s].hint}>{STATUS[s].text} {n}</span> : null; })}
      </div>
      <div className="muted">Có bằng chứng: {applicable.filter(hasEvidence).length}/{applicable.length} ca áp dụng</div>
    </button>
  );
}

function Matrix({ cases, rulepacks }: { cases: ConformanceCase[]; rulepacks: ConformanceRun['rulepacks'] }) {
  const [open, setOpen] = useState<string | null>(null);
  const sorted = [...cases].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.id.localeCompare(b.id));
  if (!sorted.length) return <div className="card card-body muted">Lớp này chưa có ca nào trong kho rulepack.</div>;
  return (
    <div className="card">
      <div className="table-wrap"><table className="grid cf-matrix">
        <thead><tr><th>Ca kiểm</th><th>Căn cứ (điều khoản)</th><th>Trạng thái</th><th>Vì sao</th><th>Việc cần làm</th></tr></thead>
        <tbody>{sorted.map((c) => {
          const todo = c.status === 'PASS' || c.status === 'NOT_APPLICABLE' ? [] : todoForCase(c.id);
          const pack = rulepacks.find((p) => p.id === c.rulepack);
          return (
            <Fragment key={c.id}>
              <tr>
                <td><div>{c.title ?? c.id}</div><code className="muted cf-id">{c.id}@{c.version} · {c.priority}</code></td>
                <td>{(c.legal_basis ?? []).map((b) => (
                  <div key={`${b.source_id}${b.provision_ref}`}>{b.label}{b.provision_ref && b.provision_ref !== 'REVIEW_REQUIRED' ? ` · ${b.provision_ref}` : ''} <span className={`badge ${b.review_status === 'reviewed' ? 'badge-ok' : 'badge-gray'}`}>{b.review_status === 'reviewed' ? 'đã rà' : 'chưa rà'}</span></div>
                ))}</td>
                <td><span className={`badge ${STATUS[c.status].cls}`} title={STATUS[c.status].hint}>{STATUS[c.status].text}</span></td>
                <td><button type="button" className="btn btn-xs btn-ghost" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id}>{open === c.id ? 'Ẩn' : 'Vì sao'}</button></td>
                <td>{todo.length ? todo.map((t) => <Link key={t.path} className="cf-todo" to={t.path}>{t.label}</Link>) : <span className="muted">—</span>}</td>
              </tr>
              {open === c.id && (
                <tr className="cf-why"><td colSpan={5}>
                  {c.reason && <p><b>Kết luận:</b> {c.reason}</p>}
                  <b>Bằng chứng</b>
                  <ul>{c.evidence.length ? c.evidence.map((e) => <li key={e}>{e}</li>) : <li className="muted">không có</li>}</ul>
                  <p className="muted">Rulepack {c.rulepack}{pack ? `@${pack.version} (${pack.status})` : ''}. Ngưỡng số ngày trong ca là quy chế nội bộ, không phải luật.</p>
                </td></tr>
              )}
            </Fragment>
          );
        })}</tbody>
      </table></div>
    </div>
  );
}
