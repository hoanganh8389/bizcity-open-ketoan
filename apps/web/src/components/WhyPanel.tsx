// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 — S023-15: khung "Vì sao" cho form danh mục (nhắc · hướng dẫn · cảnh báo mềm · chặn) + hộp ghi lý do khi lưu còn cảnh báo mềm (D023-6, D023-7)
/**
 * Dùng trong form danh mục (tài khoản, đối tượng…):
 *   const why = useCatalogWhy('/api/v1/accounts/validate', draft, enabled)   — gọi kiểm thử khi bản khai báo đổi (trễ 300 ms)
 *   <WhyPanel findings={why.findings} onFix={(set) => setForm(set)} />        — đặt dưới nhóm ô, không che form
 *   const ack = useWarnAck(why.findings)                                       — nút Ghi: ack.label; bấm → ack.request(save)
 *   <WarnAckBox ack={ack} />                                                   — hộp lý do bắt buộc ≥ 5 ký tự
 * Cảnh báo mềm không chặn lưu; chặn (block) thì nút Ghi tắt.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WARN_ACK_MIN_REASON, type CatalogFinding, type CatalogWarnAck } from '@ketoan/contracts';
import { api } from '@/lib/api';

const ICON: Record<CatalogFinding['level'], string> = { info: 'ℹ', guide: '▶', warn: '⚠', block: '✘' };

/** Gọi kiểm thử một bản khai báo; trễ 300 ms sau lần đổi cuối. */
export function useCatalogWhy(url: string, draft: Record<string, unknown>, enabled = true) {
  const key = JSON.stringify(draft);
  const [debounced, setDebounced] = useState(key);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(key), 300);
    return () => clearTimeout(t);
  }, [key]);
  const q = useQuery({
    queryKey: ['catalog-why', url, debounced],
    queryFn: () => api.post<{ findings: CatalogFinding[] }>(url, JSON.parse(debounced)),
    // Chỉ gọi khi nội dung đã ổn định: form vừa nạp xong mà còn khoá cũ thì sẽ gửi mã trống, máy chủ báo lỗi.
    enabled: enabled && debounced === key,
    staleTime: 30_000,
  });
  const findings = q.data?.findings ?? [];
  return { findings, blocked: findings.some((f) => f.level === 'block'), loading: q.isFetching };
}

export function WhyPanel({ findings, onFix }: { findings: readonly CatalogFinding[]; onFix?: (set: Record<string, unknown>) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!findings.length) return null;
  return (
    <div className="why full" role="status" aria-live="polite">
      <div className="why-t">Vì sao</div>
      {findings.map((f) => {
        const expandable = f.level === 'guide';
        const shown = !expandable || open[f.code];
        return (
          <div key={f.code} className={`why-ln why-${f.level}`}>
            <span className="why-i" aria-hidden>{ICON[f.level]}</span>
            <div>
              {expandable
                ? <button type="button" className="why-q" onClick={() => setOpen((o) => ({ ...o, [f.code]: !o[f.code] }))}>{f.title}</button>
                : <b>{f.title}</b>}
              {shown && <div className="why-why">{f.why}</div>}
              {shown && f.howTo && <div className="why-why"><b>Cách sửa:</b> {f.howTo}</div>}
              <div className="why-meta">
                {f.fix && onFix && <button type="button" className="btn btn-xs" onClick={() => onFix(f.fix!.set)}>{f.fix.label}</button>}
                {/* [2026-11-03 02:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — ADR-0020: không còn nhãn "chờ kế toán trưởng duyệt"; có căn cứ (R-GATE-11) */}
                <span className="why-code">{f.code}{f.rule ? ` · ${f.rule}` : ''}{f.lowered ? ' · đơn vị đã hạ xuống nhắc' : ''}</span>
              </div>
              {shown && f.basis?.length ? <div className="why-basis">Căn cứ: {f.basis.join('; ')}</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Lưu khi còn cảnh báo mềm: phải ghi lý do (D023-6); người lưu tự chịu trách nhiệm vì đã được cảnh báo (D023-7). */
export function useWarnAck(findings: readonly CatalogFinding[]) {
  const warns = useMemo(() => findings.filter((f) => f.level === 'warn'), [findings]);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<((ack?: CatalogWarnAck) => void) | null>(null);
  useEffect(() => { if (!warns.length) setAsking(false); }, [warns.length]);
  const valid = reason.trim().length >= WARN_ACK_MIN_REASON;
  return {
    count: warns.length,
    label: 'Ghi',
    asking, reason, setReason, valid,
    // [2026-11-12 Nguyễn Văn Thủy] bỏ hộp bắt ghi lý do cảnh báo mềm: bấm Ghi là lưu, cảnh báo tự ghi nhận vào nhật ký (đóng góp)
    request(save: (ack?: CatalogWarnAck) => void) {
      save(warns.length ? { reason: 'Tự ghi nhận cảnh báo khi lưu', codes: warns.map((w) => w.code) } : undefined);
    },
    confirm() {
      if (!valid || !pending) return;
      pending({ reason: reason.trim(), codes: warns.map((w) => w.code) });
      setAsking(false);
    },
    cancel() { setAsking(false); },
  };
}

export function WarnAckBox({ ack }: { ack: ReturnType<typeof useWarnAck> }) {
  if (!ack.asking) return null;
  return (
    <div className="alert alert-warn full warn-ack">
      <b>{ack.count} cảnh báo mềm.</b> Lý do bạn vẫn lưu (bắt buộc, ít nhất {WARN_ACK_MIN_REASON} ký tự, ghi vào nhật ký).
      Bạn đã được cảnh báo; lưu là tự chịu trách nhiệm về khai báo này.
      <input className="input" autoFocus value={ack.reason} onChange={(e) => ack.setReason(e.target.value)} placeholder="vd: tài khoản tạm theo dõi, kế toán trưởng đồng ý" />
      <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
        <button type="button" className="btn btn-primary btn-xs" disabled={!ack.valid} onClick={() => ack.confirm()}>Ghi và ghi nhận</button>
        <button type="button" className="btn btn-xs" onClick={() => ack.cancel()}>Quay lại sửa</button>
      </div>
    </div>
  );
}

// [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — HT09: dòng nhắc sau khi lưu — người dùng thấy cảnh báo TRƯỚC khi bấm Ghi (khung Vì sao); sau khi lưu chỉ nhắc ngắn còn gì
let flashText: string | null = null;
let flashTimer: ReturnType<typeof setTimeout> | undefined;
const flashSubs = new Set<() => void>();
const notify = () => flashSubs.forEach((f) => f());

/** Hiện một dòng nhắc ngắn ở góc màn (tự tắt sau 6 giây). */
export function flashSaved(text: string | null) {
  if (!text) return;
  flashText = text;
  notify();
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { flashText = null; notify(); }, 6000);
}

/** Câu nhắc sau khi lưu bản khai báo: còn cảnh báo mềm (đã ghi lý do) / lưu nháp vì còn lỗi chặn. Không còn gì → null. */
export function savedNote(findings: readonly CatalogFinding[], opts: { draft?: boolean } = {}): string | null {
  const blocks = findings.filter((f) => f.level === 'block').length;
  const warns = findings.filter((f) => f.level === 'warn').length;
  if (opts.draft && blocks) return `Đã lưu nháp — còn ${blocks} lỗi chặn; chưa dùng được trên chứng từ cho tới khi sửa xong.`;
  if (warns) return `Đã lưu — còn ${warns} cảnh báo mềm (lý do đã ghi vào nhật ký).`;
  return null;
}

/** Chỗ hiện dòng nhắc — gắn một lần ở khung ứng dụng. */
export function SavedFlash() {
  const text = useSyncExternalStore((cb) => { flashSubs.add(cb); return () => { flashSubs.delete(cb); }; }, () => flashText);
  if (!text) return null;
  return (
    <div className="why-flash" role="status" aria-live="polite">
      <span>{text}</span>
      <button type="button" className="btn btn-xs" onClick={() => { flashText = null; notify(); }} aria-label="Đóng">×</button>
    </div>
  );
}
