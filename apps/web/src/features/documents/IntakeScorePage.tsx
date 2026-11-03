/**
 * Bảng điểm đầu vào (ACC94, PHASE-021 W4; ADR-0014 Q3) — mọi kế toán xem được. Chỉ mã lỗi, điểm, số đếm; không nội dung chứng từ.
 * Ô số: đạt lần đầu, điểm TB mục bể, mục đang mở, thời gian xử lý, sửa tại bể. Bảng theo nguồn / người lập / loại chứng từ,
 * mười mã nhiều nhất (bấm → bài học), xu hướng đạt lần đầu theo tuần (một chuỗi: không cần chú giải, nhãn số chỉ ở tuần cuối).
 * Công thức ở máy chủ (GET /api/v1/intake/score — packages/kernel/src/modules/intake/score.ts).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DOC_TYPE_LABELS, INTAKE_CATALOG, type DocType, type IntakeCode } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { dateTimeShort } from '@/components/voucher/VoucherListPage';
import { LessonDrawer } from './IntakeStation';

interface Row { key: string; label?: string; sent: number; firstPass: number; firstPassRate: number | null; avgScore: number | null; topCode: string | null }
interface Score {
  totals: { sent: number; firstPass: number; firstPassRate: number | null; avgScore: number | null; open: number; oldestOpenAt: string | null; oldestOpenKey: string | null; closed: number; patchedAtInbox: number; patchedRate: number | null; medianResolveHours: number | null };
  bySource: Row[]; byActor: Row[]; byDocType: Row[]; byWeek: Row[]; topCodes: { code: string; n: number }[];
}

const pct = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('vi-VN')}%`);
const ageText = (iso: string | null) => {
  if (!iso) return '—';
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  return h < 24 ? `${Math.max(1, Math.round(h))} giờ` : `${Math.round(h / 24)} ngày`;
};
const sourceText = (k: string) => (k === 'manual' ? 'Nhập tay' : k.startsWith('app:') ? `app: ${k.slice(4)}` : k || 'không rõ');

export function IntakeScorePage() {
  const [days, setDays] = useState(30);
  const [lesson, setLesson] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['intake-score', days], queryFn: () => api.get<Score>('/api/v1/intake/score', { days }) });
  const week = useQuery({ queryKey: ['intake-score', 7], queryFn: () => api.get<Score>('/api/v1/intake/score', { days: 7 }), enabled: days !== 7 });
  const s = q.data;
  const t = s?.totals;
  const w7 = days === 7 ? t : week.data?.totals;

  return (
    <>
      <PageHeader title="Bảng điểm đầu vào" code="ACC94" helpKey="chung-tu"
        subtitle="Chứng từ gửi vào có đạt ngay lần đầu không, lỗi nào hay gặp — để cùng học cách nhập đúng"
        actions={<select className="select input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>7 ngày gần nhất</option><option value={30}>30 ngày gần nhất</option><option value={90}>90 ngày gần nhất</option>
        </select>} />
      <div className="alert alert-ok" style={{ marginBottom: 10 }}>Bảng này để cùng học cách nhập đúng, không để đánh giá cá nhân. Chỉ có mã lỗi, điểm và số mục — không có nội dung chứng từ.</div>
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {q.isLoading || !s || !t ? <Loading /> : (
        <>
          <div className="kpis">
            <Tile label={`Đạt lần đầu (${days} ngày)`} value={pct(t.firstPassRate)} hint={`${t.firstPass.toLocaleString('vi-VN')} / ${t.sent.toLocaleString('vi-VN')} chứng từ${days !== 7 && w7 ? ` · 7 ngày: ${pct(w7.firstPassRate)}` : ''}`} />
            <Tile label="Điểm TB mục bể" value={t.avgScore === null ? '—' : String(t.avgScore)} hint="0 = còn lỗi chặn" />
            <Tile label="Mục đang mở" value={t.open.toLocaleString('vi-VN')} hint={t.oldestOpenAt ? `lâu nhất ${ageText(t.oldestOpenAt)} (${t.oldestOpenKey})` : 'không có'} />
            <Tile label="Thời gian xử lý (trung vị)" value={t.medianResolveHours === null ? '—' : `${t.medianResolveHours.toLocaleString('vi-VN')} giờ`} hint="từ nhận tới đóng" />
            <Tile label="Sửa tại bể (lệch nguồn)" value={t.patchedAtInbox.toLocaleString('vi-VN')} hint={`trên ${t.closed.toLocaleString('vi-VN')} mục đã đóng · ${pct(t.patchedRate)}`} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
            <GroupTable title="Theo nguồn" head="Nguồn" rows={s.bySource} label={(r) => sourceText(r.key)} onCode={setLesson} />
            <GroupTable title="Theo người lập" head="Người lập" rows={s.byActor} label={(r) => r.label ?? r.key} onCode={setLesson} />
            <GroupTable title="Theo loại chứng từ" head="Loại" rows={s.byDocType} label={(r) => DOC_TYPE_LABELS[r.key as DocType] ?? r.key} onCode={setLesson} />
            <div className="card" style={{ padding: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Mười mã lỗi nhiều nhất</div>
              {!s.topCodes.length ? <div className="muted">Không có mục bể nào trong khung.</div> : (
                <table className="grid full">
                  <thead><tr><th>Mã</th><th>Tên</th><th style={{ textAlign: 'right' }}>Mục</th><th /></tr></thead>
                  <tbody>{s.topCodes.map((c) => (
                    <tr key={c.code}><td><code>{c.code}</code></td><td>{INTAKE_CATALOG[c.code as IntakeCode]?.title ?? ''}</td><td style={{ textAlign: 'right' }}>{c.n}</td>
                      <td><button type="button" className="btn btn-xs" onClick={() => setLesson(c.code)}>Bài học</button></td></tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </div>
          <WeekTrend rows={s.byWeek} />
        </>
      )}
      {lesson && <LessonDrawer code={lesson} onClose={() => setLesson(null)} />}
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Cập nhật {dateTimeShort(new Date().toISOString())}. Đạt lần đầu = chứng từ (theo docKey) vào thẳng sổ mà chưa từng bị cửa nạp giữ lại ÷ số chứng từ gửi trong khung.</div>
    </>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="card kpi"><div className="label">{label}</div><div className="value">{value}</div><div className="hint">{hint}</div></div>;
}

function GroupTable({ title, head, rows, label, onCode }: { title: string; head: string; rows: Row[]; label: (r: Row) => string; onCode: (c: string) => void }) {
  return (
    <div className="card" style={{ padding: 10 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div>
      {!rows.length ? <div className="muted">Chưa có chứng từ trong khung.</div> : (
        <table className="grid full">
          <thead><tr><th>{head}</th><th style={{ textAlign: 'right' }}>Gửi</th><th style={{ textAlign: 'right' }}>Đạt lần đầu</th><th style={{ textAlign: 'right' }}>Điểm TB</th><th>Hay gặp</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.key}>
              <td>{label(r)}</td><td style={{ textAlign: 'right' }}>{r.sent.toLocaleString('vi-VN')}</td><td style={{ textAlign: 'right' }}>{pct(r.firstPassRate)}</td>
              <td style={{ textAlign: 'right' }}>{r.avgScore ?? '—'}</td>
              <td>{r.topCode ? <button type="button" className="btn btn-xs" onClick={() => onCode(r.topCode!)}>{r.topCode}</button> : '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

/** Đạt lần đầu theo tuần: cột mảnh, nền 0–100%, rê chuột hiện số; nhãn số chỉ ở tuần cuối. */
function WeekTrend({ rows }: { rows: Row[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (rows.length < 2) return null;
  const H = 120;
  const last = rows.length - 1;
  return (
    <div className="card" style={{ padding: 10, marginTop: 12 }}>
      <div style={{ fontWeight: 600 }}>Đạt lần đầu theo tuần</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Trục đứng 0–100%. {hover !== null ? `${rows[hover]!.key}: ${pct(rows[hover]!.firstPassRate)} (${rows[hover]!.firstPass} / ${rows[hover]!.sent})` : 'Rê chuột lên cột để xem số.'}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: H + 18, borderBottom: '1px solid var(--line)' }} onMouseLeave={() => setHover(null)}>
        {rows.map((r, i) => (
          <div key={r.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', cursor: 'default' }} onMouseEnter={() => setHover(i)}
            title={`${r.key}: ${pct(r.firstPassRate)} (${r.firstPass} / ${r.sent})`}>
            {i === last && <span style={{ fontSize: 11, color: 'var(--ink-700)' }}>{pct(r.firstPassRate)}</span>}
            <div style={{ width: '60%', maxWidth: 28, height: Math.max(2, ((r.firstPassRate ?? 0) / 100) * H), background: 'var(--brand-500)', opacity: hover === null || hover === i ? 1 : 0.45, borderRadius: '4px 4px 0 0' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 2 }}>{rows.map((r) => <div key={r.key} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--ink-500)' }}>{r.key.slice(5)}</div>)}</div>
    </div>
  );
}
