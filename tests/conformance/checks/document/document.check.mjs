// [2026-11-05 08:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — W1: SC-DOC-7 (bizcity_document@1 §7.2) — đường ghi lịch sử chứng từ đúng một chỗ; bút toán luôn mang phiên bản chứng từ
/**
 * Truy vết chứng từ gốc (DOC-01 / DOC-02 / DOC-03) giữ được cho MỌI module, plugin, API chỉ khi không có đường ghi lệch:
 *   (1) `accounting_event_versions` chỉ được thêm ở `document.repository.ts` (lúc sự việc đổi phiên bản); `document_versions` /
 *       `document_links` chỉ ở `packages/platform/src/core/documents.ts` (runtime `ctx.documents`). Chỗ khác ghi thẳng = lịch sử
 *       có phiên bản không qua cửa chung, không băm, không kiểm quyền chủ chứng từ.
 *   (2) Tệp gọi `ledgerService.post(` mà dựng bút toán có `sourceDocumentId:` thì cùng khối phải có `sourceVersion:` — bút toán không
 *       mang phiên bản chứng từ thì không truy vết đúng phiên bản được (ENTRY_NO_VERSION).
 * Cổng đọc (GET /api/v1/documents/history) dựng từ chính các cột này; đường ghi lệch làm nó nói sai.
 */
import { LAYER_ROOTS } from '../../lib/layers.mjs';

const VERSION_TABLE = { accounting_event_versions: 'packages/kernel/src/modules/documents/document.repository.ts' };
const PLATFORM_DOCS = 'packages/platform/src/core/documents.ts';
const SHARED_TABLES = ['document_versions', 'document_links'];
/** Số dòng quanh `sourceDocumentId:` được tìm `sourceVersion:` (cùng khối đối tượng). */
const WINDOW = 4;

export const checks = [
  {
    id: 'SC-DOC-7',
    title: 'Lịch sử chứng từ: bảng phiên bản / liên kết chỉ ghi ở một chỗ; bút toán dựng với sourceDocumentId phải kèm sourceVersion',
    gate: 'CONF-STATIC', contract: 'bizcity_document', rules: ['STD-DOC-2'], conf: [], tier: 1, enforce: 'block', weight: 3, targets: ['repo'],
    run(ctx) {
      const findings = []; let examined = 0;
      for (const f of ctx.repo.files({ under: LAYER_ROOTS, ext: ['.ts'] })) {
        if (/\.test\.ts$|\/test\//.test(f)) continue;
        const text = ctx.repo.read(f) ?? '';
        const lines = text.split('\n');
        examined++;
        lines.forEach((line, i) => {
          if (/^\s*(\/\/|\*)/.test(line)) return;
          // (1) ghi thẳng bảng lịch sử
          for (const [table, allowed] of Object.entries(VERSION_TABLE)) {
            if (new RegExp(`insertInto\\(\\s*'${table}'|INSERT\\s+INTO\\s+${table}\\b`, 'i').test(line) && f !== allowed) {
              findings.push(ctx.finding(f, i + 1, `ghi thẳng ${table} ngoài ${allowed} — phiên bản sự việc chỉ cất qua eventStore / cửa nạp (lịch sử chứng từ, DOC-02)`, `write:${table}:${f}`));
            }
          }
          for (const table of SHARED_TABLES) {
            if (new RegExp(`insertInto\\(\\s*'${table}'|INSERT\\s+INTO\\s+${table}\\b`, 'i').test(line) && f !== PLATFORM_DOCS) {
              findings.push(ctx.finding(f, i + 1, `ghi thẳng ${table} ngoài ${PLATFORM_DOCS} — dùng ctx.documents.saveVersion / link (băm nội dung, kiểm quyền chủ chứng từ)`, `write:${table}:${f}`));
            }
          }
        });
        // (2) bút toán mang phiên bản — chỉ tệp thật sự gọi ledgerService.post
        if (!/ledgerService\.post\(/.test(text)) continue;
        lines.forEach((line, i) => {
          if (/^\s*(\/\/|\*)/.test(line) || !/\bsourceDocumentId\s*:/.test(line)) return;
          // khai kiểu (`sourceDocumentId: string;`) không phải dựng bút toán
          if (/\bsourceDocumentId\s*:\s*(string|number|null)\b[^,]*;?\s*$/.test(line) && !/[=(]/.test(line)) return;
          const from = Math.max(0, i - WINDOW), to = Math.min(lines.length, i + WINDOW + 1);
          if (!lines.slice(from, to).some((l) => /\bsourceVersion\s*:/.test(l))) {
            findings.push(ctx.finding(f, i + 1, 'dựng bút toán có sourceDocumentId nhưng không kèm sourceVersion — bút toán không biết sinh từ phiên bản nào của chứng từ (DOC-01 / DOC-03)', `version:${f}:${i + 1}`));
          }
        });
      }
      return { examined, findings };
    },
  },
];
