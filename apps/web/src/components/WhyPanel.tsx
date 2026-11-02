// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 — S023-15: khung "Vì sao" cho form danh mục (nhắc · hướng dẫn · cảnh báo mềm · chặn) + hộp ghi lý do khi lưu còn cảnh báo mềm (D023-6, D023-7)
/**
 * Dùng trong form danh mục (tài khoản, đối tượng…):
 *   const why = useCatalogWhy('/api/v1/accounts/validate', draft, enabled)   — gọi kiểm thử khi bản khai báo đổi (trễ 300 ms)
 *   <WhyPanel findings={why.findings} onFix={(set) => setForm(set)} />        — đặt dưới nhóm ô, không che form
 *   const ack = useWarnAck(why.findings)                                       — nút Ghi: ack.label; bấm → ack.request(save)
 *   <WarnAckBox ack={ack} />                                                   — hộp lý do bắt buộc ≥ 5 ký tự
 * Cảnh báo mềm không chặn lưu; chặn (block) thì nút Ghi tắt.
 */
import { useEffect, useMemo, useState } from 'react';
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
    enabled,
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
              <div className="why-meta">
                {f.fix && onFix && <button type="button" className="btn btn-xs" onClick={() => onFix(f.fix!.set)}>{f.fix.label}</button>}
                <span className="why-code">{f.code}{f.rule ? ` · ${f.rule}` : ''}{f.draft ? ' · nội dung nháp, chờ kế toán trưởng duyệt' : ''}</span>
              </div>
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
    label: warns.length ? `Ghi (có ${warns.length} cảnh báo)` : 'Ghi',
    asking, reason, setReason, valid,
    /** Bấm Ghi: không có cảnh báo mềm → lưu ngay; có → mở hộp lý do, lưu khi xác nhận. */
    request(save: (ack?: CatalogWarnAck) => void) {
      if (!warns.length) { save(undefined); return; }
      setPending(() => save);
      setAsking(true);
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
