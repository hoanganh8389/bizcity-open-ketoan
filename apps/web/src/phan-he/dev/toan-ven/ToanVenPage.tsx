// [2026-11-02 10:42 AM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W4: màn Toàn vẹn (DEV07) — tự chẩn đoán gần nhất nói gì; dùng lại /api/v1/system/diagnostics*
/**
 * TOÀN VẸN (DEV07): lượt tự chẩn đoán gần nhất của đơn vị (diagnostic_runs — sẵn có) và kết quả từng mã kiểm. ?kiem=MA làm nổi một mã
 * (Kịch bản TH-05 → EVENT_PENDING_AGE, TH-06 → EVENT_DEAD). Chọn lượt cũ hơn ở danh sách bên dưới.
 * Nút "Chạy lại" gọi GET /api/v1/system/diagnostics (L3, giao dịch READ ONLY — không đổi sổ; chỉ lưu thêm một lượt chẩn đoán).
 * Sổ có lỗi toàn vẹn là sev1 (Sổ tay TH-10): không tự đảo bút toán, không mở khoá kỳ, không sửa ledger_*.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { devParams } from '@ketoan/contracts';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useDiagRun, useDiagRuns, type DiagCheckResult } from '../api';
import { Answer, DevBanner, DevGuard, Src, when } from '../ui';

const LEVEL: Record<DiagCheckResult['level'], { text: string; cls: string }> = {
  error: { text: 'lỗi', cls: 'err' }, warn: { text: 'cảnh báo', cls: 'rej' }, info: { text: 'thông tin', cls: '' }, pass: { text: 'đạt', cls: 'ok' }, empty: { text: 'không có dữ liệu', cls: '' },
};
const RANK = { error: 0, warn: 1, info: 2, empty: 3, pass: 4 } as const;

export function ToanVenPage() {
  const [params] = useSearchParams();
  const { kiem } = devParams('/dev/toan-ven', params);
  const runs = useDiagRuns();
  const [picked, setPicked] = useState<string | null>(null);
  const latest = runs.data?.find((r) => r.layer === 'L3') ?? runs.data?.[0];
  const id = picked ?? latest?.id ?? null;
  const run = useDiagRun(id);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const rerun = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.get<{ runId: string }>('/api/v1/system/diagnostics', { layer: 'L3' });
      await qc.invalidateQueries({ queryKey: ['devtools', 'diag-runs'] });
      setPicked(r.runId);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  useEffect(() => {
    if (kiem && run.data) document.getElementById(`kiem-${kiem}`)?.scrollIntoView({ block: 'center' });
  }, [kiem, run.data]);

  return (
    <DevGuard>
      <PageHeader title="Toàn vẹn" code="DEV07" helpKey="ban-dieu-tra" subtitle="Tự chẩn đoán sổ của đơn vị — lượt gần nhất nói gì" actions={
        <button type="button" className="btn" onClick={() => void rerun()} disabled={busy} title="L3, chỉ đọc sổ; lưu thêm một lượt chẩn đoán">{busy ? 'Đang chạy…' : 'Chạy lại (chỉ đọc sổ)'}</button>
      } />
      <DevBanner />
      {Boolean(err) && <ErrorBox error={errorText(err)} />}
      {runs.isLoading ? <Loading /> : runs.error ? <ErrorBox error={errorText(runs.error)} /> : !latest ? (
        <Answer level="warn"><p>Chưa có lượt tự chẩn đoán nào cho đơn vị này — bấm <b>Chạy lại</b> (chỉ đọc sổ), hoặc chờ lượt chạy theo lịch.</p></Answer>
      ) : run.isLoading ? <Loading /> : run.error ? <ErrorBox error={errorText(run.error)} /> : run.data && (
        <>
          <Answer level={run.data.errorCount ? 'bad' : run.data.checks.some((c) => c.level === 'warn') ? 'warn' : 'ok'} title={run.data.errorCount ? `${run.data.errorCount} mã kiểm báo lỗi` : 'Sổ đạt'}>
            <ul>
              <li>Lượt {run.data.layer} {when(run.data.at)} ({run.data.trigger === 'manual' ? 'chạy tay' : run.data.trigger}).</li>
              {run.data.errorCount > 0 && <li>Sổ có lỗi toàn vẹn — sev1 (Sổ tay TH-10): đọc RUNBOOK-CANH-BAO § LedgerIntegrityError, báo Nhóm Lõi. Không tự đảo bút toán, không mở khoá kỳ, không sửa sổ.</li>}
              {run.data.checks.filter((c) => c.level === 'warn').map((c) => <li key={c.code}><code>{c.code}</code> — {c.title}: {c.count}. {c.fix}</li>)}
            </ul>
          </Answer>
          <div className="card">
            <div className="table-wrap"><table className="grid">
              <thead><tr><th>Mã kiểm</th><th>Kết quả</th><th>Kiểm gì</th><th style={{ textAlign: 'right' }}>Đã xét</th><th style={{ textAlign: 'right' }}>Sai</th><th>Mẫu</th><th>Cách sửa</th></tr></thead>
              <tbody>{[...run.data.checks].sort((a, b) => RANK[a.level] - RANK[b.level]).map((c) => (
                <tr key={c.code} id={`kiem-${c.code}`} className={c.code === kiem ? 'dev-row-on' : undefined}>
                  <td><code>{c.code}</code></td>
                  <td><span className={`dev-tag ${LEVEL[c.level].cls}`}>{LEVEL[c.level].text}</span></td>
                  <td>{c.title}</td>
                  <td style={{ textAlign: 'right' }}>{c.examined}</td>
                  <td style={{ textAlign: 'right' }}>{c.count}</td>
                  <td>{c.sample.slice(0, 5).map((s) => <code key={s} className="dev-code-chip">{s}</code>)}{c.sample.length > 5 ? ` +${c.sample.length - 5}` : ''}</td>
                  <td className="muted">{c.level === 'pass' || c.level === 'empty' ? '' : c.fix}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </div>
          <div className="card">
            <div className="card-body" style={{ paddingBottom: 0 }}><b>Các lượt gần đây</b></div>
            <div className="table-wrap"><table className="grid">
              <thead><tr><th>Lúc</th><th>Lớp</th><th>Kiểu</th><th style={{ textAlign: 'right' }}>Lỗi</th><th /></tr></thead>
              <tbody>{runs.data!.map((r) => (
                <tr key={r.id} className={r.id === id ? 'dev-row-on' : undefined}>
                  <td>{when(r.at)}</td><td>{r.layer}</td><td>{r.trigger}</td>
                  <td style={{ textAlign: 'right' }}>{r.errorCount ? <b className="text-bad">{r.errorCount}</b> : 0}</td>
                  <td>{r.id !== id && <button type="button" className="btn btn-xs btn-ghost" onClick={() => setPicked(r.id)}>xem</button>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </div>
        </>
      )}
      <Src>nguồn: GET /api/v1/system/diagnostics/runs, /runs/:id — diagnostic_runs của đơn vị; mẫu chỉ là khoá chứng từ / số bút toán; mã kiểm: docs/ops/DIAGNOSTICS.md §2</Src>
    </DevGuard>
  );
}
