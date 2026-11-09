// [2026-11-09 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B1 (S032-36, S032-39): Khoá thử hôm nay trên Bàn làm việc kế toán — ghép kiểm khoá kỳ, cảnh báo kiểm chuẩn, xem trước kết chuyển có sẵn; không ghi sổ; lời kế toán (70 §7)
/**
 * KHOÁ THỬ HÔM NAY (PHASE-032 · 00 §6a bước B1, R-DIAG-14 phần không cần lớp giá vốn).
 * Chỉ đọc, dùng đúng các đường khoá thật đang dùng — không API mới:
 *   GET  /api/v1/periods/check          bảng kiểm trước khoá (lỗi toàn vẹn sổ = R-DIAG-4, chứng từ lỗi, giá vốn, kết chuyển…)
 *   GET  /api/v1/conformance/advisories cảnh báo kiểm chuẩn của kỳ (màn khoá kỳ đòi lý do khi còn cảnh báo)
 *   GET  /api/v1/periods/lock-grid      chi nhánh và các khoá đang có
 *   POST /api/v1/closing/preview        kết chuyển thử (core.closing.preview, effect read — không ghi gì)
 * Kết luận nói đúng như khoá thật hôm nay: chỉ lỗi toàn vẹn sổ và cảnh báo kiểm chuẩn đòi lý do; mọi mục khác là
 * "nên xử lý", phần mềm không chặn (ADR-0020). Danh sách chặn hẳn của D032-11 có hiệu lực ở bước B7, chưa ở đây.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { Remedy } from '@ketoan/contracts';
import { ErrorBox, Loading, Money } from '@/components/ui';
import { RemedyView } from '@/components/RemedyView';
import { api, ApiError, errorText } from '@/lib/api';
import { dateTime } from '@/lib/format';
import type { Advisory, AdvisoryReply } from './conformance';

interface CheckItem { key: string; label: string; count: number; amount?: number; detail?: string; link?: string; remedy?: Remedy }
interface Grid { branches: { code: string; name: string; isActive: boolean }[]; locks: { branch: string | null; docType: string }[] }
interface Preview { branchCode: string; branchName: string; profit: number | null; alreadyClosed: boolean; staleReasons: string[]; blockers: string[]; residuals: { account: string; balance: number }[]; lines: unknown[] }

type Level = 'reason' | 'todo' | 'pass' | 'untested';
const LV: Record<Level, { text: string; cls: string; icon: string }> = {
  reason: { text: 'Phải ghi lý do khi khoá', cls: 'badge-bad', icon: '✎' },
  todo: { text: 'Nên xử lý trước khi khoá', cls: 'badge-warn', icon: '⚠' },
  pass: { text: 'Đạt', cls: 'badge-ok', icon: '✔' },
  untested: { text: 'Phần mềm chưa tự kiểm được', cls: 'badge-gray', icon: '○' },
};
/** Mục của bảng kiểm khoá kỳ thuộc bước nào trong năm bước khoá. */
const STEP_OF: Record<string, 1 | 2 | 3 | 4> = {
  integrity: 1, errors: 1, entryMismatch: 1, balanceMismatch: 1, orphanReturns: 1, paymentRequests: 1,
  cogs: 2, closing: 3, closingStale: 3, closingResidual: 4,
};
const STALE: Record<string, string> = { data: 'số liệu kỳ đổi', opening: 'số dư đầu 911 đổi', rules: 'bút toán kết chuyển mẫu đổi' };
const pad = (n: number) => String(n).padStart(2, '0');

export function KhoaThuHomNay() {
  const now = new Date();
  const [ym, setYm] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`);
  const [year, month] = ym.split('-').map(Number) as [number, number];

  const check = useQuery({ queryKey: ['khoa-thu', 'check', ym], queryFn: () => api.get<CheckItem[]>('/api/v1/periods/check', { year, month }) });
  const adv = useQuery({ queryKey: ['conformance', 'advisories', 'period', year, month, ''], queryFn: () => api.get<AdvisoryReply>('/api/v1/conformance/advisories', { year, month }), retry: false });
  const grid = useQuery({ queryKey: ['khoa-thu', 'grid', ym], queryFn: () => api.get<Grid>('/api/v1/periods/lock-grid', { year, month }) });
  const codes = useMemo(() => (grid.data?.branches ?? []).filter((b) => b.isActive).map((b) => b.code), [grid.data]);
  const preview = useQuery({
    queryKey: ['khoa-thu', 'preview', ym, codes],
    enabled: codes.length > 0,
    retry: false,
    queryFn: () => api.post<Preview[]>('/api/v1/closing/preview', { period: ym, branchCodes: codes }),
  });

  const items = check.data ?? [];
  const advisories = adv.data?.advisories ?? [];
  /** Bản cài chưa có đường cảnh báo kiểm chuẩn (404): nói thật là chưa kiểm được, không báo lỗi đỏ. */
  const advMissing = adv.error instanceof ApiError && adv.error.status === 404;
  const levelOf = (c: CheckItem): Level => (c.count <= 0 ? 'pass' : c.key === 'integrity' ? 'reason' : 'todo');
  const needReason = items.some((c) => levelOf(c) === 'reason') || advisories.length > 0;
  const blockedBranches = (preview.data ?? []).filter((p) => p.blockers.length > 0);
  const todo = items.filter((c) => levelOf(c) === 'todo').length + blockedBranches.length;
  const locked = (grid.data?.locks ?? []).length;
  /** Mục phần mềm chưa tự kiểm được: giá vốn tính tạm (B6–B7), quyền và phạm vi khoá (B7), cảnh báo kiểm chuẩn khi bản cài chưa có. */
  const untested = 2 + (advMissing ? 1 : 0);
  const loading = check.isLoading || adv.isLoading || grid.isLoading;
  const refetch = () => { void check.refetch(); void adv.refetch(); void grid.refetch(); void preview.refetch(); };

  const stepItems = (s: number) => items.filter((c) => STEP_OF[c.key] === s);

  return (
    <div className="kt">
      <div className="card card-body rb-head">
        <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field"><label htmlFor="kt-ky">Kỳ khoá thử</label><input id="kt-ky" type="month" className="input" value={ym} onChange={(e) => e.target.value && setYm(e.target.value)} /></div>
          <button type="button" className="btn" onClick={refetch} disabled={check.isFetching || preview.isFetching}>{check.isFetching || preview.isFetching ? 'Đang khoá thử…' : 'Khoá thử lại'}</button>
          <span className="muted">Khoá thử chạy đủ các bước như khoá thật nhưng <b>không ghi gì vào sổ</b>, không khoá kỳ.</span>
        </div>
      </div>

      {loading ? <Loading /> : check.error ? <ErrorBox error={errorText(check.error)} /> : (
        <>
          <div className="card card-body" role="status" aria-live="polite">
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {needReason ? '✎ Khoá được, nhưng phải ghi lý do' : '✔ Phần mềm cho khoá kỳ này'}
              <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}> · tháng {month}/{year}</span>
            </div>
            <div style={{ marginTop: 4 }}>
              {needReason && <div>Khi bấm khoá, phần mềm sẽ đòi lý do chấp nhận (ít nhất 10 ký tự) vì còn lỗi toàn vẹn sổ hoặc cảnh báo kiểm chuẩn. Lý do được lưu vào nhật ký khoá.</div>}
              <div>{todo > 0 ? `Còn ${todo} việc nên xử lý trước khi khoá. Phần mềm không chặn các việc này, nhưng số trên báo cáo của kỳ sẽ chưa đúng.` : 'Không còn việc nào cần xử lý trước khi khoá.'}</div>
              <div className="muted">Còn {untested} mục phần mềm chưa tự kiểm được (dấu ○ bên dưới). Kết luận trên chỉ dựa vào các mục đã kiểm.</div>
              {locked > 0 && <div className="muted">Kỳ này đã có {locked} ô khoá ở màn Đóng / mở kỳ kế toán.</div>}
            </div>
            <div className="muted" style={{ marginTop: 6 }}>Khoá thử lúc {dateTime(new Date().toISOString())} · <Link to="/cau-hinh/ky-ke-toan">Mở màn Đóng / mở kỳ kế toán</Link></div>
          </div>

          <div className="card">
            <Step n={1} title="Kiểm chứng từ và số liệu">
              {stepItems(1).map((c) => <ItemRow key={c.key} c={c} level={levelOf(c)} />)}
              {advMissing ? <div className="rb-case"><div className="rb-row"><Badge level="untested" /><span className="rb-title">Cảnh báo kiểm chuẩn của kỳ</span></div><div className="muted rb-note">Bản cài này chưa có phần kiểm chuẩn. Cập nhật phần mềm để khoá thử kiểm được mục này.</div></div>
                : adv.error ? <div className="rb-case"><ErrorBox error={errorText(adv.error)} /></div> : advisories.length > 0
                ? advisories.map((a) => <AdvisoryRow key={a.code} a={a} />)
                : <div className="rb-case"><div className="rb-row"><Badge level="pass" /><span className="rb-title">Cảnh báo kiểm chuẩn của kỳ</span></div></div>}
            </Step>
            <Step n={2} title="Giá vốn">
              {stepItems(2).map((c) => <ItemRow key={c.key} c={c} level={levelOf(c)} />)}
              <div className="rb-case"><div className="rb-row"><Badge level="untested" /><span className="rb-title">Giá vốn tính tạm và chốt giá vốn theo lần tính</span></div>
                <div className="muted rb-note">Có ở bước nâng cấp sau. Hôm nay khoá thử chỉ biết chi nhánh nào đã có chứng từ giá vốn của tháng.</div></div>
            </Step>
            <Step n={3} title="Kết chuyển thử">
              {stepItems(3).map((c) => <ItemRow key={c.key} c={c} level={levelOf(c)} />)}
              <PreviewTable q={preview} noBranch={!grid.isLoading && codes.length === 0} />
            </Step>
            <Step n={4} title="Kiểm sau kết chuyển">
              {stepItems(4).map((c) => <ItemRow key={c.key} c={c} level={levelOf(c)} />)}
            </Step>
            <Step n={5} title="Kiểm quyền và phạm vi khoá">
              <div className="rb-case"><div className="rb-row"><Badge level="untested" /><span className="rb-title">Người khoá có đủ quyền, khoá đủ mọi chi nhánh cùng nhóm tính giá</span></div>
                <div className="muted rb-note">Phần mềm chưa tự kiểm được bước này. Màn Đóng / mở kỳ kế toán vẫn kiểm quyền khi bấm khoá thật.</div></div>
            </Step>
          </div>
        </>
      )}
    </div>
  );
}

function Badge({ level }: { level: Level }) {
  return <span className={`badge ${LV[level].cls}`}>{LV[level].icon} {LV[level].text}</span>;
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <details className="rb-group" open>
      <summary>Bước {n}. {title}</summary>
      {children}
    </details>
  );
}

function ItemRow({ c, level }: { c: CheckItem; level: Level }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rb-case">
      <div className="rb-row">
        <Badge level={level} />
        <span className="rb-title">{c.label}</span>
        {c.count > 0 && <span className="muted">{c.count} chỗ{c.amount ? <> · <Money value={c.amount} /></> : null}</span>}
        {c.count > 0 && c.link && <Link className="btn btn-xs" to={c.link}>Mở màn</Link>}
        {c.count > 0 && c.remedy && <button type="button" className="btn btn-xs" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Ẩn' : 'Cách khắc phục'}</button>}
      </div>
      {c.count > 0 && c.detail && <div className="muted rb-note" title={c.detail}>{c.detail.length > 240 ? `${c.detail.slice(0, 240)}…` : c.detail}</div>}
      {open && c.remedy && <div className="rb-blocks"><div className="rb-blk"><b>Cách khắc phục</b><div><RemedyView remedy={c.remedy} compact /></div></div></div>}
    </div>
  );
}

function AdvisoryRow({ a }: { a: Advisory }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rb-case">
      <div className="rb-row">
        <Badge level="reason" />
        <span className="rb-title">{a.title}</span>
        <span className="muted">{a.count} chỗ</span>
        <button type="button" className="btn btn-xs" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Ẩn' : 'Vì sao, cách sửa'}</button>
      </div>
      {open && (
        <div className="rb-blocks">
          <div className="rb-blk"><b>Vì sao</b><div>{a.why}</div></div>
          {a.remedy && <div className="rb-blk"><b>Cách khắc phục</b><div><RemedyView remedy={a.remedy} compact /></div></div>}
        </div>
      )}
    </div>
  );
}

function PreviewTable({ q, noBranch }: { q: { data?: Preview[]; isLoading: boolean; error: unknown }; noBranch: boolean }) {
  if (noBranch) return <div className="rb-case muted">Chưa có chi nhánh đang dùng để kết chuyển thử.</div>;
  if (q.isLoading) return <div className="rb-case"><Loading /></div>;
  if (q.error) return <div className="rb-case"><div className="rb-row"><Badge level="todo" /><span className="rb-title">Chưa kết chuyển thử được</span></div><ErrorBox error={errorText(q.error)} /></div>;
  const rows = q.data ?? [];
  if (!rows.length) return null;
  return (
    <div className="rb-case">
      <div className="muted" style={{ marginBottom: 6 }}>Nếu kết chuyển ngay bây giờ (không ghi sổ):</div>
      <div className="table-wrap"><table className="grid">
        <thead><tr><th>Chi nhánh</th><th className="num">Lãi (+) / lỗ (−) tạm</th><th>Đã kết chuyển</th><th>Cần làm</th></tr></thead>
        <tbody>{rows.map((p) => (
          <tr key={p.branchCode}>
            <td>{p.branchCode} · {p.branchName}</td>
            <td className="num">{p.profit == null ? <span className="muted">—</span> : <Money value={p.profit} blankZero={false} />}</td>
            <td>{p.alreadyClosed ? (p.staleReasons.length ? `Có, nhưng đã cũ (${p.staleReasons.map((r) => STALE[r] ?? r).join(', ')})` : 'Có') : 'Chưa'}</td>
            <td>{p.blockers.length ? <span className="text-bad">Kết chuyển tháng {p.blockers.join(', ')} trước</span>
              : p.residuals.length ? `Tài khoản còn số dư sau kết chuyển: ${p.residuals.map((r) => r.account).join(', ')}`
                : !p.alreadyClosed && p.lines.length ? 'Kết chuyển ở màn Kết chuyển' : p.staleReasons.length ? 'Kết chuyển lại' : <span className="muted">—</span>}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
