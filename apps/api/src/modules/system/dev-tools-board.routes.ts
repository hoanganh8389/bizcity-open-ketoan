// @bizcity-layer P module-sdk
// [2026-11-11 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B5a (S034-8): thẻ Nhà phát triển ở HT10 — bảng tiến độ công cụ DEV01..09 × T1..T6 (cong-cu-dev.json, tiêu chí sinh từ repo)
/**
 * GET /api/v1/system/dev-tools — bizcity_devtools@1 (docs/standard/cong-cu-dev.json). Tiêu chí T1..T6 do scripts/cong-cu-dev.mjs sinh từ repo,
 * SC-DEV-2 giữ khớp; API chỉ đọc tệp và tính mức = số tiêu chí đạt / 6. Tệp thuộc bản dựng (ảnh api chép kèm, R-REL-11). Không có đường ghi.
 * Ai đăng nhập cũng xem được bảng (không có dữ liệu đơn vị); chạy công cụ vẫn cần devtools:read ở màn của công cụ (D034-7).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { requireAuthenticated } from '../../core/auth.js';
import { Errors } from '../../core/errors.js';
import { ok } from '../../core/http.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const DEVTOOLS_FILE = 'docs/standard/cong-cu-dev.json';

interface Criterion { state: 'co' | 'chua'; ev: string }
interface Tool { code: string; label: string; path: string; page: string; api: string[]; sources: string[]; singleInstall?: boolean; criteria: Record<string, Criterion> }
interface DevToolsFile { contract: string; version: string; updated: string; criteria: Record<string, string>; tools: Tool[] }

let cache: DevToolsFile | null | undefined;
export function devToolsBoard() {
  if (cache === undefined) {
    try { cache = JSON.parse(readFileSync(path.join(root, DEVTOOLS_FILE), 'utf8')) as DevToolsFile; } catch { cache = null; }
  }
  if (!cache) return null;
  const keys = Object.keys(cache.criteria);
  return {
    contract: cache.contract, version: cache.version, updated: cache.updated, criteria: cache.criteria,
    tools: cache.tools.map((t) => {
      const met = keys.filter((k) => t.criteria?.[k]?.state === 'co').length;
      return { ...t, met, pct: keys.length ? Math.round((met / keys.length) * 100) : 0 };
    }),
  };
}

export async function devToolsBoardRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get('/api/v1/system/dev-tools', {
    preHandler: requireAuthenticated(),
    schema: { tags: ['Hệ thống'], summary: 'Công cụ nhà phát triển DEV01..09 × tiêu chí hoàn thiện T1..T6 (docs/standard/cong-cu-dev.json, sinh từ repo) — cho thẻ Nhà phát triển ở HT10; chỉ đọc' },
    handler: async () => {
      const b = devToolsBoard();
      if (!b) throw Errors.notFound(`bảng công cụ nhà phát triển (${DEVTOOLS_FILE} không có trong bản cài)`);
      return ok(b);
    },
  });
}
