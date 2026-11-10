// [2026-11-11 01:15 AM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B4a (S032-31 phần xem): thẻ Kết quả từng tuần trên Bàn làm việc kế toán — đọc lượt tự kiểm đã lưu, chỉ tô màu chỗ có việc
/**
 * KẾT QUẢ TỪNG TUẦN (PHASE-032 · 00 §6a bước B4a, 60 §9). Chỉ đọc:
 *   GET /api/v1/system/diagnostics/weeks   lượt tự kiểm L3 cả sổ đã lưu, gom theo tuần ISO, tuần vắt hai tháng tách hai dòng
 * Mức màu theo 60 §9.2: đạt 100 % không màu · ≥ 90 % cam · < 90 % đỏ; lỗi toàn vẹn còn mở > 0 đỏ; việc cũ nhất > 7 ngày cam, > 14 ngày đỏ;
 * việc mới nhiều hơn việc đã đóng hai tuần liền thì cam. Không màu là đạt (bản mẫu mockups/the-mat-hang-hai-so.html, 10 §2a).
 * Lượt giữ 90 ngày (R-DIAG-5) nên xem được khoảng 12 tuần; bản lưu tuần lâu dài và nút Đã xem tuần là bước B4b.
 */
import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { REMEDY_ROLE_LABELS } from '@ketoan/contracts';
import { ErrorBox, Loading } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { dateTime } from '@/lib/format';

type Outcome = 'pass' | 'empty' | 'info' | 'warn' | 'error';
interface WeekIssue { code: string; title: string; level: Outcome; count: number; since: string; owner?: string; closeTitle?: string }
interface WeekResult {
  week: string; period: string; from: string; to: string; runs: number; days: number; lastAt: string;
  applicable: number; passed: number; errors: number; open: WeekIssue[]; opened: string[]; closed: string[]; oldestDays: number | null;
}

const dm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const weekNo = (w: string) => Number(w.slice(-2));
const monthLabel = (p: string) => `Tháng ${p.slice(5, 7)}/${p.slice(0, 4)}`;
const LEVEL: Record<string, { text: string; cls: string }> = {
  error: { text: 'Lỗi toàn vẹn sổ', cls: 'badge-bad' },
  warn: { text: 'Nên xử lý', cls: 'badge-warn' },
  info: { text: 'Để biết', cls: 'badge-info' },
};
const ownerLabel = (o?: string) => {
  const s = o ? REMEDY_ROLE_LABELS[o as keyof typeof REMEDY_ROLE_LABELS] ?? o : 'kế toán viên';
  return s.charAt(0).toUpperCase() + s.slice(1);
};
/** Chỉ trả lớp màu khi có việc; đạt thì không màu. */
const rateCls = (w: WeekResult) => {
  if (!w.applicable) return '';
  const r = w.passed / w.applicable;
  return r >= 1 ? '' : r >= 0.9 ? 'badge badge-warn' : 'badge badge-bad';
};
const ageCls = (d: number | null) => (d === null ? '' : d > 14 ? 'badge badge-bad' : d > 7 ? 'badge badge-warn' : '');

export function KetQuaTuan() {
  const q = useQuery({ queryKey: ['ket-qua-tuan'], queryFn: () => api.get<WeekResult[]>('/api/v1/system/diagnostics/weeks', { weeks: 12 }) });
  const [open, setOpen] = useState<string | null>(null);
  const rows = q.data ?? [];
  // Việc mới > việc đã đóng hai tuần liền (so với dòng tuần trước nó trong danh sách, mới nhất trước).
  const growing = (i: number) => rows[i]!.opened.length > rows[i]!.closed.length && !!rows[i + 1] && rows[i + 1]!.opened.length > rows[i + 1]!.closed.length;

  return (
    <div>
      <div className="card card-body rb-head">
        <span className="muted">Mỗi dòng là một tuần; tuần vắt hai tháng tách hai dòng, mỗi tháng có đủ tuần của chính nó. Kết quả tuần là lượt tự kiểm cuối tuần đó. Không màu là đạt. Bấm một tuần để xem việc còn mở.</span>
      </div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : !rows.length ? (
        <div className="card card-body">Chưa có lượt tự kiểm nào được lưu. Phần mềm tự kiểm lúc 01:00 mỗi đêm; sáng mai thẻ này sẽ có tuần đầu tiên.</div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr><th>Tuần</th><th className="num">Phép kiểm đạt</th><th className="num">Lỗi toàn vẹn còn mở</th><th className="num">Việc mới / đã đóng</th><th className="num">Việc cũ nhất</th><th className="num">Ngày có tự kiểm</th></tr>
              </thead>
              <tbody>
                {rows.map((w, i) => {
                  const k = `${w.week}|${w.period}`;
                  const span = Math.round((Date.parse(w.to) - Date.parse(w.from)) / 86400_000) + 1;
                  return (
                    <Fragment key={k}>
                      {(i === 0 || rows[i - 1]!.period !== w.period) && <tr><td colSpan={6} style={{ fontWeight: 700, background: 'var(--soft, #f3f4f6)' }}>{monthLabel(w.period)}</td></tr>}
                      <tr style={{ cursor: 'pointer' }} onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k}>
                        <td>{open === k ? '▾' : '▸'} Tuần {weekNo(w.week)} <span className="muted">· {dm(w.from)}–{dm(w.to)}</span></td>
                        <td className="num"><span className={rateCls(w)}>{w.passed} / {w.applicable}</span></td>
                        <td className="num">{w.errors ? <span className="badge badge-bad">{w.errors}</span> : '0'}</td>
                        <td className="num"><span className={growing(i) ? 'badge badge-warn' : ''}>{w.opened.length} / {w.closed.length}</span></td>
                        <td className="num">{w.oldestDays === null ? '—' : <span className={ageCls(w.oldestDays)}>{w.oldestDays} ngày</span>}</td>
                        <td className="num"><span className={w.days < span ? 'muted' : ''}>{w.days} / {span}</span></td>
                      </tr>
                      {open === k && (
                        <tr>
                          <td colSpan={6} style={{ padding: 0 }}>
                            {w.open.length ? w.open.map((x) => (
                              <div className="rb-case" key={x.code}>
                                <div className="rb-row">
                                  <span className={`badge ${LEVEL[x.level]?.cls ?? 'badge-info'}`}>{LEVEL[x.level]?.text ?? x.level}</span>
                                  <span className="rb-title">{x.title}</span>
                                  {x.count > 0 && <span className="muted">{x.count} chỗ</span>}
                                  <span className="muted">· có từ {dm(x.since)}{w.opened.includes(x.code) ? ' (mới tuần này)' : ''}</span>
                                  <span className="muted">· {ownerLabel(x.owner)}</span>
                                </div>
                                {x.closeTitle && <div className="muted rb-note">Điều kiện khoá sổ: {x.closeTitle}</div>}
                              </div>
                            )) : <div className="rb-case">✔ Cuối tuần không còn việc nào mở.</div>}
                            {w.closed.length > 0 && <div className="rb-case muted">Đã đóng trong tuần: {w.closed.length} việc.</div>}
                            <div className="rb-case muted">Theo lượt tự kiểm lúc {dateTime(w.lastAt)} · {w.runs} lượt trong tuần.</div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="muted rb-foot">Lượt tự kiểm được giữ 90 ngày, nên thẻ xem được khoảng 12 tuần gần nhất. Bản lưu tuần lâu dài và nút <i>Đã xem tuần</i> có ở bản sau.</p>
    </div>
  );
}
