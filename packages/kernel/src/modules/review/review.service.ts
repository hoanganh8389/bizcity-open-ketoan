// @bizcity-layer K kernel/review
// [2026-11-02 10:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W4: Bàn đánh giá theo vai — dựng checklist từ danh mục F22 + tự chẩn đoán L1/L3/L5 (chỉ đọc) + các lần xác nhận cảnh báo; ba vai là lăng kính (D022-3, D022-5).
/**
 * BÀN ĐÁNH GIÁ (HT08, PHASE-022 §4). Không bộ chạy thứ hai: dùng runDiagnostics (giao dịch READ ONLY) và danh mục FAULT_CATALOG.
 *
 *   reviewBoard(trx, tenant, persona)   nhóm → ca → trạng thái: ok · warn · error · block_ok (Kernel chặn đúng theo thiết kế) ·
 *                                       untested (chưa có kiểm / chưa có dữ liệu) · elsewhere (kiểm ở màn khác: bảng kiểm khoá kỳ…)
 *   recheck(tenant, code)               chạy lại đúng một mã kiểm (R-FIX-4)
 *
 * Không số tiền (R-DIAG-6); đơn vị chỉ thấy mình (RLS); vai không mở thêm dữ liệu, chỉ đổi thứ tự và lời mở đầu.
 */
import { sql } from 'kysely';
import type { Remedy } from '@ketoan/contracts';
import type { Db } from '@bizcity/platform/db/client';
import { listDiagnostics, runDiagnostics, type DiagLayer, type DiagResult } from '@bizcity/platform/system/diagnostics';
import { FAULT_CATALOG, type FaultCase } from './fault-catalog.js';

export const PERSONAS = {
  chief_accountant: { label: 'Kế toán trưởng', intro: 'Việc còn tồn trước khi khoá kỳ, nộp tờ khai.', order: ['DOC', 'STK', 'CLOSE', 'TAX', 'DEBT', 'CASH', 'FA', 'LEDGER', 'ENV', 'SEC'], onlyTodo: true },
  auditor: { label: 'Kiểm soát / ban kiểm soát', intro: 'Sổ có toàn vẹn, bằng chứng liền mạch, phân quyền đúng. Hiện cả mục đạt và rào chắn còn.', order: ['LEDGER', 'ENV', 'SEC', 'CLOSE', 'DOC', 'DEBT', 'CASH', 'STK', 'TAX', 'FA'], onlyTodo: false },
  tax_inspector: { label: 'Thanh tra thuế — tự rà trước', intro: 'Điểm sẽ bị hỏi khi thanh tra — đơn vị tự rà trước. Không phải kết luận của cơ quan thuế.', order: ['TAX', 'STK', 'CASH', 'FA', 'DEBT', 'DOC', 'CLOSE', 'LEDGER'], onlyTodo: true },
} as const;
export type Persona = keyof typeof PERSONAS;
export type BoardStatus = 'ok' | 'warn' | 'error' | 'block_ok' | 'untested' | 'elsewhere';

const RANK: Record<string, number> = { error: 3, warn: 2, info: 2, pass: 0, empty: -1 };

export interface BoardCase {
  id: string; title: string; level: FaultCase['level']; status: BoardStatus; primary: boolean;
  detectors: string[]; count: number; sample: string[]; consequence: string; remedy: Remedy | null; remedyText: string; verifyCode: string | null; note: string | null;
}

/** Tất cả mã kiểm đang đăng ký, theo tầng. */
function codesByLayer(): Map<string, DiagLayer> {
  const m = new Map<string, DiagLayer>();
  for (const l of ['L1', 'L3', 'L5'] as DiagLayer[]) for (const c of listDiagnostics(l)) m.set(c.code, l);
  return m;
}

function statusOf(c: FaultCase, results: Map<string, DiagResult>): { status: BoardStatus; hit: DiagResult[]; note: string | null } {
  if (c.status === 'blocked') return { status: 'block_ok', hit: [], note: 'Kernel chặn theo thiết kế; bộ chạy giả định lỗi chứng minh bị chặn đúng mã' };
  if (c.status !== 'done') return { status: 'untested', hit: [], note: c.statusNote ?? (c.status === 'planned-021' ? 'Mã tiền kiểm của Trạm tiền kiểm (PHASE-021) chưa có' : 'Chưa có kiểm') };
  const hit = c.detectors.map((d) => results.get(d)).filter((x): x is DiagResult => Boolean(x));
  if (!hit.length) return { status: 'elsewhere', hit: [], note: `Kiểm ở màn khác: ${c.verifyText || c.detectText}` };
  const worst = hit.reduce((a, b) => ((RANK[b.level] ?? 0) > (RANK[a.level] ?? 0) ? b : a));
  if (worst.level === 'error') return { status: 'error', hit, note: null };
  if (worst.level === 'warn' || worst.level === 'info') return { status: 'warn', hit, note: null };
  if (worst.level === 'empty') return { status: 'untested', hit, note: 'Chưa có dữ liệu để xét (đạt rỗng không phải đạt)' };
  return { status: 'ok', hit, note: null };
}

export async function reviewBoard(trx: Db, tenantId: string, persona: Persona) {
  const p = PERSONAS[persona];
  const results = new Map<string, DiagResult>();
  for (const layer of ['L1', 'L3', 'L5'] as DiagLayer[]) {
    for (const r of (await runDiagnostics({ tenantId, ...(layer === 'L5' ? { to: new Date().toISOString().slice(0, 10) } : {}) }, { layer })).checks) results.set(r.code, r);
  }
  const groups = p.order.map((g) => {
    const cases: BoardCase[] = FAULT_CATALOG.cases.filter((c) => c.group === g && c.personas.includes(persona)).map((c) => {
      const s = statusOf(c, results);
      const lead = s.hit.find((h) => h.level !== 'pass' && h.level !== 'empty') ?? s.hit[0];
      return {
        id: c.id, title: c.title, level: c.level, status: s.status, primary: c.primary.includes(persona), detectors: c.detectors,
        count: s.hit.reduce((n, h) => n + (h.level === 'pass' || h.level === 'empty' ? 0 : h.count), 0), sample: lead && lead.level !== 'pass' ? lead.sample.slice(0, 10) : [],
        consequence: c.consequence, remedy: lead?.remedy ?? null, remedyText: c.remedyText, verifyCode: lead?.code ?? null, note: s.note,
      };
    });
    cases.sort((a, b) => Number(b.primary) - Number(a.primary) || a.id.localeCompare(b.id));
    return { key: g, label: FAULT_CATALOG.groups[g] ?? g, cases };
  }).filter((g) => g.cases.length);
  const all = groups.flatMap((g) => g.cases);
  const counts = Object.fromEntries((['error', 'warn', 'ok', 'block_ok', 'untested', 'elsewhere'] as BoardStatus[]).map((s) => [s, all.filter((c) => c.status === s).length]));
  const acks = await sql<{ at: Date; actor: string; object_id: string | null; after_data: unknown }>`
    SELECT created_at AS at, actor, object_id, after_data FROM audit_logs
     WHERE tenant_id = ${tenantId} AND action = 'core.conformance.acknowledge' AND result_ok
     ORDER BY id DESC LIMIT 50`.execute(trx);
  return {
    persona, label: p.label, intro: p.intro, onlyTodo: p.onlyTodo, generatedAt: new Date().toISOString(), counts, groups,
    acknowledgements: acks.rows.map((r) => {
      type Ack = { codes?: string[]; note?: string };
      const d = (typeof r.after_data === 'string' ? JSON.parse(r.after_data) : r.after_data) as { notes?: Ack; input?: Ack } | null;
      return { at: new Date(r.at).toISOString(), actor: r.actor, context: r.object_id ?? '', codes: d?.notes?.codes ?? d?.input?.codes ?? [], note: d?.notes?.note ?? d?.input?.note ?? null };
    }),
    disclaimer: 'Không phải kết luận của cơ quan nhà nước. Không có điểm tuân thủ %; "Chưa kiểm được" không tính là đạt. Không có nút sửa sổ, tắt kiểm hay bỏ qua.',
  };
}

/** Chạy lại đúng một mã kiểm (chỉ đọc). */
export async function recheck(tenantId: string, code: string): Promise<DiagResult | null> {
  const layer = codesByLayer().get(code);
  if (!layer) return null;
  const r = await runDiagnostics({ tenantId, ...(layer === 'L5' ? { to: new Date().toISOString().slice(0, 10) } : {}) }, { layer, codes: [code] });
  return r.checks[0] ?? null;
}
