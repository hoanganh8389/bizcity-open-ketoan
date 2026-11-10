// [2026-11-10 10:15 PM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B2 (S034-4): khuôn chung của HT10 — ScoreBar, ReadinessItem, báo thiếu tệp nguồn có Cách sửa, thẻ "sắp có"
/**
 * Phần dùng chung của năm thẻ HT10 (PHASE-034 · 00 §6, D034-8):
 *   - `ScoreBar`: một thanh mức đạt, một bảng màu (≥ 80 xanh · ≥ 40 cam · còn lại đỏ) cho mọi thẻ.
 *   - `ReadinessItem`: khuôn hiển thị một mục (trụ cột, mã kiểm, bộ máy, công cụ) — mỗi sổ JSON giữ cấu trúc riêng, API / màn ánh xạ sang khuôn này.
 *   - `SourceError`: tệp nguồn của bảng không có trong bản cài (NOT_FOUND) thì nói rõ cách sửa, không đổ câu lỗi thô (R-REL-11).
 *   - `ComingSoon`: thẻ đã có chỗ nhưng chưa có dữ liệu — nói thẻ sẽ trả lời câu gì và bước nào làm.
 */
import type { ReactNode } from 'react';
import { ErrorBox } from '@/components/ui';
import { ApiError, errorText } from '@/lib/api';

export type ReadinessStatus = 'dat' | 'mot-phan' | 'tai-lieu' | 'chua';
export type SignalState = 'co' | 'nhanh' | 'chua';
export interface ReadinessSignal { kind: 'check' | 'diag' | 'test' | 'task' | 'criterion'; ref: string; state: SignalState }
export interface ReadinessItem {
  id: string; title: string; group?: string;
  status: ReadinessStatus;
  signals: ReadinessSignal[];
  next?: string; phase?: string; links?: { to: string; label: string }[];
}

/** Trọng số tín hiệu: chạy được 1 · ở nhánh ½ · chưa có 0 (cùng cách SC-CORE-1 đọc nen-mong.json). */
export const SIGNAL_WEIGHT: Record<SignalState, number> = { co: 1, nhanh: 0.5, chua: 0 };

/** Mức của một mục theo tín hiệu (0..100); không có tín hiệu thì 0. */
export function signalScore(signals: ReadinessSignal[]): number {
  if (!signals.length) return 0;
  return Math.round((signals.reduce((s, x) => s + SIGNAL_WEIGHT[x.state], 0) / signals.length) * 100);
}

export const scoreColor = (pct: number) => (pct >= 80 ? 'var(--ok, #1a7f4b)' : pct >= 40 ? 'var(--warn, #b26a00)' : 'var(--bad, #c62828)');

/** Thanh mức đạt dùng chung cho mọi thẻ HT10. */
export function ScoreBar({ pct, title, showPct = true }: { pct: number; title?: string; showPct?: boolean }) {
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title={title}>
      <div role="meter" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={title ?? 'mức đạt'}
        style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--line, #e6ebf2)', overflow: 'hidden' }}>
        <div style={{ width: `${v}%`, height: '100%', background: scoreColor(v) }} />
      </div>
      {showPct && <b style={{ fontSize: 12 }}>{v}%</b>}
    </div>
  );
}

/** Lỗi khi đọc bảng nguồn. NOT_FOUND = bản cài thiếu tệp (ảnh api không chép) → nói cách sửa; lỗi khác hiện như thường. */
export function SourceError({ error, file }: { error: unknown; file: string }) {
  if (error instanceof ApiError && error.code === 'NOT_FOUND') {
    return (
      <div className="alert alert-warn" style={{ margin: 12 }}>
        <b>Bản cài chưa có tệp <span className="mono">{file}</span>.</b>
        <div style={{ marginTop: 4 }}>Màn này đọc tệp đó lúc chạy. Bản cài Docker dựng từ mã cũ chưa chép tệp vào ảnh api.</div>
        <div style={{ marginTop: 4 }}>
          <b>Cách sửa:</b> cập nhật bản cài (<span className="mono">./scripts/cap-nhat.sh</span>, hoặc kéo mã mới rồi <span className="mono">docker compose up -d --build api</span>).
          Chạy từ mã nguồn (<span className="mono">npm run dev</span>) thì không gặp lỗi này.
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Phép kiểm SC-REL-3 (R-REL-11) giữ cho tệp đọc lúc chạy luôn có trong ảnh.</div>
      </div>
    );
  }
  return <ErrorBox error={errorText(error)} />;
}

/** Thẻ đã có chỗ ở HT10 nhưng chưa có dữ liệu: nói thẻ trả lời câu gì, lấy dữ liệu từ đâu, bước nào làm. */
export function ComingSoon({ question, source, step, children }: { question: string; source: string; step: string; children?: ReactNode }) {
  return (
    <div className="card" style={{ padding: '12px 14px', maxWidth: 820 }}>
      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><span className="badge badge-info">sắp có</span><b>{question}</b></div>
      <dl style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '4px 8px', fontSize: 13, margin: '8px 0 0' }}>
        <dt className="muted">Dữ liệu từ</dt><dd style={{ margin: 0 }}>{source}</dd>
        <dt className="muted">Bước làm</dt><dd style={{ margin: 0 }}>{step}</dd>
      </dl>
      {children && <div style={{ marginTop: 8, fontSize: 13 }}>{children}</div>}
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Mức đạt đi theo bằng chứng chạy được (check / chẩn đoán / test / mốc việc), không ai tích tay (R-CONT-7). Kế hoạch: docs/phases/PHASE-034-HT10-BANG-HOAN-THIEN-CORE.</div>
    </div>
  );
}
