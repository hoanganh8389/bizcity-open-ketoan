// [2026-11-02 03:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-21: Posting Gate chỉ thông tin ở màn lập chứng từ và trước khoá kỳ (ADR-0012 T3 / T4) — cảnh báo, Vì sao, Việc cần làm; người tiếp tục thì ghi bằng chứng.
/**
 * POSTING GATE — CẢNH BÁO, KHÔNG CHẶN (ADR-0012 §3).
 *   useDocumentGate(date)          cảnh báo cho ngày chứng từ (GET /api/v1/conformance/advisories?date); lưu chứng từ xong mà còn cảnh báo thì
 *                                  acknowledge({ docType, docDate, docNo }) ghi một dòng bằng chứng (core.conformance.acknowledge). Ghi bằng
 *                                  chứng lỗi không làm hỏng việc lưu chứng từ — cảnh báo không bao giờ thành từ chối.
 *   usePeriodGate(year, month)     cảnh báo trước khoá kỳ; còn cảnh báo thì người khoá ghi lý do (≥ 10 ký tự), acknowledge() trước khi khoá (T3).
 *                                  Khoá kỳ vẫn do API khoá kỳ quyết như cũ (R-DIAG-4 chỉ chặn lỗi mức error).
 * Chỉ người đăng nhập xác nhận; khoá API / AI không xác nhận thay (API trả 403).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { TODO_BY_CODE, type Advisory, type AdvisoryReply } from '@/features/system/conformance';

export interface DocumentRef { docType: string; docDate: string; docNo?: string; docKey?: string }

export function useDocumentGate(date: string | undefined) {
  const { can } = useAuth();
  const q = useQuery({
    queryKey: ['conformance', 'advisories', 'document', date],
    queryFn: () => api.get<AdvisoryReply>('/api/v1/conformance/advisories', { date }),
    enabled: Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date)) && can('documents:read'),
    staleTime: 60_000,
  });
  const advisories = q.data?.advisories ?? [];
  const acknowledge = (ref: DocumentRef) => {
    if (!advisories.length || !can('documents:write')) return;
    void api.post('/api/v1/conformance/advisories/ack', { context: { kind: 'document', ...ref }, codes: advisories.map((a) => a.code) }).catch(() => undefined);
  };
  return { advisories, acknowledge };
}

export function usePeriodGate(year: number, month: number, branchCode?: string) {
  const q = useQuery({
    queryKey: ['conformance', 'advisories', 'period', year, month, branchCode ?? ''],
    queryFn: () => api.get<AdvisoryReply>('/api/v1/conformance/advisories', { year, month, branchCode: branchCode || undefined }),
    staleTime: 30_000,
  });
  const [note, setNote] = useState('');
  const advisories = q.data?.advisories ?? [];
  const ready = !advisories.length || note.trim().length >= 10;
  /** Gọi ngay trước khi khoá: có cảnh báo thì ghi bằng chứng (người, mã, kỳ, lý do); không có thì không làm gì. */
  const acknowledge = async () => {
    if (!advisories.length) return;
    await api.post('/api/v1/conformance/advisories/ack', {
      context: { kind: 'period', year, month, ...(branchCode ? { branchCode } : {}) }, codes: advisories.map((a) => a.code), note: note.trim(),
    });
  };
  return { loading: q.isLoading, advisories, note, setNote, ready, acknowledge };
}

function AdvisoryItems({ advisories }: { advisories: Advisory[] }) {
  return (
    <ul className="cf-adv">
      {advisories.map((a) => (
        <li key={a.code}>
          <div><b>{a.title}</b> <span className="muted">· {a.count} · <code>{a.code}</code></span></div>
          <div className="muted">Vì sao: {a.why}</div>
          {a.sample.length > 0 && <div>{a.sample.slice(0, 6).map((s) => <code key={s} className="dev-code-chip">{s}</code>)}{a.sample.length > 6 ? ` +${a.sample.length - 6}` : ''}</div>}
          {(TODO_BY_CODE[a.code] ?? []).length > 0 && <div>Việc cần làm: {TODO_BY_CODE[a.code]!.map((t) => <Link key={t.path} className="cf-todo" to={t.path}>{t.label}</Link>)}</div>}
        </li>
      ))}
    </ul>
  );
}

/** Dải cảnh báo ở màn lập / duyệt chứng từ. Không có nút chặn; lưu bình thường là "tiếp tục" và được ghi bằng chứng. */
export function DocumentGateBanner({ advisories }: { advisories: Advisory[] }) {
  const [open, setOpen] = useState(false);
  if (!advisories.length) return null;
  return (
    <div className="cf-gate full" role="note">
      <button type="button" className="cf-gate-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="badge badge-warn">Cảnh báo kiểm chuẩn</span> {advisories.length} điều cần biết cho ngày chứng từ này — chỉ thông tin, vẫn lưu được. <span className="cf-link">{open ? 'Ẩn' : 'Xem'}</span>
      </button>
      {open && <><AdvisoryItems advisories={advisories} /><div className="muted">Lưu chứng từ khi còn cảnh báo thì hệ thống ghi lại: ai, lúc nào, cảnh báo nào (bằng chứng).</div></>}
    </div>
  );
}

/** Khối cảnh báo trước khoá kỳ + ô lý do khi người dùng đang khoá. */
export function PeriodGateBox({ gate, locking, year, month }: { gate: ReturnType<typeof usePeriodGate>; locking: boolean; year: number; month: number }) {
  if (gate.loading || !gate.advisories.length) return null;
  return (
    <div className="cf-gate" style={{ marginBottom: 10 }}>
      <div><span className="badge badge-warn">Cảnh báo kiểm chuẩn</span> <b>tháng {month}/{year}</b> — chỉ thông tin, không chặn khoá kỳ.</div>
      <AdvisoryItems advisories={gate.advisories} />
      {locking && (
        <div className="field">
          <label>Vẫn khoá: ghi lý do (ít nhất 10 ký tự) — lưu làm bằng chứng cùng các mã cảnh báo</label>
          <input className="input" value={gate.note} onChange={(e) => gate.setNote(e.target.value)} placeholder="vd Đã biết tồn âm SUA01, bổ sung phiếu nhập ở kỳ sau" />
        </div>
      )}
    </div>
  );
}
