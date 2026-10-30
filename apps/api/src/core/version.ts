// @bizcity-layer P cli
// [2026-10-29 11:31 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — bộ kiểm chuẩn xanh, gia cố R-API-6, R-BOUND-2, R-SEC-11, R-REL-1.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 10:29 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — tự chẩn đoán L1 / L3, diagnostic_runs, khoá kỳ chặn khi sổ lỗi (PHASES 2.10).
/**
 * Phiên bản của bản đang chạy (R-REL-1) — trả ở GET /api/v1/system/health để vận hành, bộ kiểm, Cell biết đang nói chuyện với bản nào.
 *   version   sản phẩm Bizcity Core = package.json GỐC (nguồn sự thật khi phát hành, tag vX.Y.Z)
 *   kernel    phiên bản Kernel (R-KER-10). Chưa tách gói packages/kernel (PHASES 2.3) nên tạm bằng version
 *   standard  Bizcity Framework Standard = docs/standard/bizcity-standard.json (image api chép kèm tệp này); không có thì null
 * Như db/paths.ts: chạy từ src (tsx) hay dist (node) thì <gốc repo> đều cách 4 cấp.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path.join(root, file), 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readVersion(file: string): string | null {
  const v = readJson(file)?.version;
  return typeof v === 'string' ? v : null;
}

/** Bảng năng lực Bizcity Standard (bizcity-standard.json) cho GET /api/v1/system/capabilities; không có tệp thì null. */
export const STANDARD = readJson('docs/standard/bizcity-standard.json');

const version = readVersion('package.json') ?? '0.0.0';

export const BUILD_VERSION = {
  version,
  kernel: version,
  standard: typeof STANDARD?.version === 'string' ? STANDARD.version : null,
} as const;
