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

function readVersion(file: string): string | null {
  try {
    const v = (JSON.parse(readFileSync(path.join(root, file), 'utf8')) as { version?: unknown }).version;
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

const version = readVersion('package.json') ?? '0.0.0';

export const BUILD_VERSION = {
  version,
  kernel: version,
  standard: readVersion('docs/standard/bizcity-standard.json'),
} as const;
