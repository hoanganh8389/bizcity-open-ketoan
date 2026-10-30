/**
 * Ma trận tuân thủ (`bizcity_compliance_matrix@1`, docs/standard/compliance-matrix.json — bizcity_compliance@1 §2):
 * mỗi yêu cầu bắt buộc → trạng thái tính từ tín hiệu đo được (dùng chung bộ đánh giá với lộ trình). Không tự đánh dấu đạt bằng tay
 * (tín hiệu manual cần doneAt + by). Nguyên tắc AP-7: tuân thủ được kiểm, không chỉ viết.
 */
import { signalEvaluator } from './roadmap.mjs';

export const COMPLIANCE_FILE = 'docs/standard/compliance-matrix.json';

export function evaluateCompliance({ matrix, results, standard, coverage, repo }) {
  const { evalSignal, describe } = signalEvaluator({ results, standard, coverage, repo });
  const rows = matrix.rows.map((r) => {
    const signals = r.done.map((s) => ({ text: describe(s), ok: evalSignal(s), manual: Boolean(s.manual) }));
    const t = signals.filter((s) => s.ok === true).length;
    const unknown = signals.filter((s) => s.ok === null).length;
    const status = t === signals.length ? 'pass' : unknown === signals.length ? 'unknown' : t > 0 ? 'partial' : 'missing';
    return { id: r.id, std: r.std, requirement: r.requirement, risk: r.risk, rule: r.rule, status, progress: Math.round((100 * t) / signals.length), signals };
  });
  return {
    updated: matrix.updated,
    score: Math.round(rows.reduce((a, r) => a + r.progress, 0) / rows.length),
    counts: { pass: rows.filter((r) => r.status === 'pass').length, partial: rows.filter((r) => r.status === 'partial').length, missing: rows.filter((r) => r.status === 'missing').length, unknown: rows.filter((r) => r.status === 'unknown').length },
    rows,
  };
}
