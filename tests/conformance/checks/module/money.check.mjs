// [2026-11-06 06:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-19: SC-STD-5 — tiền trong modules/** chỉ làm tròn bằng roundMoney và chỉ chia bằng allocate / schedule (R-MONEY-2, R-MONEY-3; PHASE-030 · 17 STD-030-5, · 18)
/**
 * STD-030-5 (R-MSTD-5): tiền là số nguyên đồng, làm tròn nửa xa số 0, chia bằng một `allocate`.
 *   (a) hàm chia tiền tự viết (allocate / spread* / split* / chia* / phanBo*) mà tệp không dùng bản chung → chặn;
 *   (b) làm tròn một đại lượng tiền bằng Math.round / floor / ceil / trunc / toFixed → dùng roundMoney.
 * Phạm vi: `modules/**` (không tính test, dist) và, khi chạy `bizcity module check`, toàn bộ module. `apps/api/src/phan-he` đóng
 * băng (ADR-0024) nên không quét; sửa khi chuyển sang `modules/` (N030-2). `ratchet`: nợ cũ ở baseline, chỉ chỗ mới mới đỏ.
 * Thông báo cho dev theo khuôn: `SC-STD-5 ✗ <tệp>:<dòng> <điều sai> — <cách sửa> (PHASE-030 · 18)`.
 */

const NOT_TEST = /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
const opts = (ctx) => (ctx.mode === 'module' ? { ext: ['.ts', '.mjs', '.js'], not: NOT_TEST } : { under: ['modules'], ext: ['.ts', '.tsx'], not: NOT_TEST });

/** Hàm chia tiền (không phải chia lượng như allocateTransfers). */
const SPLITTER_DECL = /\b(?:function|const|let|var)\s+(allocate|spread[A-Za-z0-9_]*|split(?:ByPercent|ByDays|ByRatio|Money|Amount|Cost[A-Za-z0-9_]*)|chia[A-Za-z0-9_]*|phanBo[A-Za-z0-9_]*|phan_bo[A-Za-z0-9_]*)\b/;
/** Tệp đã dùng bản chung: import allocate / schedule / roundMoney từ contracts hoặc module-sdk. */
const USES_SHARED = /import\s*(?:type\s*)?\{[^}]*\b(allocate|schedule|roundMoney)\b[^}]*\}\s*from\s*['"](@ketoan\/contracts|@bizcity\/module-sdk)['"]/;
const ROUNDING = /\bMath\.(round|floor|ceil|trunc)\s*\(|\.toFixed\s*\(/;
const MONEY_WORD = /(amount|total|money|price|payable|beforetax|aftertax|\btax|vat|discount|cost|\bfee|salary|thanhtien|tien[A-Z_]|dongia|giamua|giavon|chietkhau|luong|ck[A-Z_]|rebate)/i;
const SHARED_IMPORT_HINT = "import { allocate, schedule, roundMoney } from '@bizcity/module-sdk'";

export default {
  id: 'SC-STD-5',
  title: 'Tiền trong modules/**: làm tròn bằng roundMoney, chia bằng allocate / schedule (STD-030-5, R-MONEY)',
  gate: 'CONF-STATIC', contract: 'bizcity_module', rules: ['R-MONEY-2', 'R-MONEY-3'], tier: 0, enforce: 'ratchet', weight: 3, targets: ['repo', 'module'], scope: 'module',
  run(ctx) {
    const o = opts(ctx);
    const files = ctx.repo.files(o);
    const findings = [];
    for (const file of files) {
      const text = ctx.repo.read(file) ?? '';
      const shared = USES_SHARED.test(text);
      ctx.repo.lines(file).forEach((t, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(t)) return;
        const d = SPLITTER_DECL.exec(t);
        if (d && !shared) {
          findings.push(ctx.finding(file, i + 1, `tự viết hàm chia tiền "${d[1]}" — dùng allocate / schedule: ${SHARED_IMPORT_HINT} (PHASE-030 · 18)`, `splitter:${d[1]}`));
          return;
        }
        if (ROUNDING.test(t) && MONEY_WORD.test(t)) {
          findings.push(ctx.finding(file, i + 1, `${t.trim().slice(0, 130)} — làm tròn tiền bằng roundMoney (nửa xa số 0), không Math.round / toFixed (PHASE-030 · 18 §2.1)`, `round:${t.replace(/\s+/g, '').slice(0, 90)}`));
        }
      });
    }
    return { examined: files.length, findings };
  },
};
