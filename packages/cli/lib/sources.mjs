// [2026-11-03 01:55 PM Johnny Chu - Chu Hoàng Anh] G3-01 — nguồn sự thật cho lệnh kiểm kế toán: đọc bản dựng của repo, không giữ luật riêng
/**
 * NGUỒN SỰ THẬT của `bizcity event check` / `bizcity explain` (và ba skill kế toán).
 * Lệnh CLI không viết lại luật: nó nạp đúng hàm / danh mục mà cửa nạp và API dùng.
 *
 *   contracts   packages/contracts/dist/index.js     ingestDocumentSchema, FINDINGS_LIBRARY, ERROR_CATALOG, INTAKE_REMEDIES…
 *   totals      packages/kernel/dist/…/document.service.js   totalsProblems — cùng hàm cửa nạp dùng cho IN-SUM-*
 *   faults      danh mục F22 (bizcity_fault_catalog@1): bản dựng, hoặc đọc khối JSON trong tệp nguồn (tệp sinh, chỉ dữ liệu)
 *   diag        packages/vn-rulepacks/diag-codes.json   DG-* → mã tự chẩn đoán
 *
 * Thiếu bản dựng → trả { missing: lý do }. Người gọi báo SKIP kèm lệnh dựng; không bao giờ coi là PASS.
 * BIZCITY_ROOT đổi gốc repo (dùng khi chạy từ dự án khác, và cho test).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = process.env.BIZCITY_ROOT
  ? path.resolve(process.env.BIZCITY_ROOT)
  : path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));

export const BUILD_HINT = 'npm ci && npm run build -w @ketoan/contracts -w @bizcity/mua-hang-domain -w @bizcity/platform -w @bizcity/kernel';

const at = (rel) => path.join(ROOT, rel);

async function importRel(rel) {
  const file = at(rel);
  if (!existsSync(file)) return { missing: `chưa dựng ${rel}` };
  try {
    return { mod: await import(pathToFileURL(file).href) };
  } catch (err) {
    return { missing: `nạp ${rel} lỗi: ${String(err?.message ?? err).split('\n')[0]}` };
  }
}

let contractsP;
/** @returns {Promise<{mod?: any, missing?: string}>} */
export function loadContracts() {
  contractsP ??= importRel('packages/contracts/dist/index.js');
  return contractsP;
}

let totalsP;
/** totalsProblems của cửa nạp (IN-SUM-001/002/005/006). */
export async function loadTotals() {
  totalsP ??= importRel('packages/kernel/dist/modules/documents/document.service.js').then((r) =>
    r.mod && typeof r.mod.totalsProblems === 'function' ? { fn: r.mod.totalsProblems } : { missing: r.missing ?? 'bản dựng kernel không xuất totalsProblems' });
  return totalsP;
}

let faultsP;
/** Danh mục F22. Bản dựng trước; không có thì đọc khối JSON của tệp nguồn sinh tự động (không chạy mã). */
export async function loadFaults() {
  faultsP ??= (async () => {
    const built = await importRel('packages/kernel/dist/modules/review/fault-catalog.js');
    if (built.mod?.FAULT_CATALOG) return { catalog: built.mod.FAULT_CATALOG };
    const src = at('packages/kernel/src/modules/review/fault-catalog.ts');
    if (!existsSync(src)) return { missing: 'không có danh mục F22' };
    const text = readFileSync(src, 'utf8');
    const start = text.indexOf('FAULT_CATALOG: FaultCatalog = {');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < start) return { missing: 'khuôn tệp F22 đổi — dựng kernel rồi chạy lại' };
    try {
      return { catalog: JSON.parse(text.slice(text.indexOf('{', start), end + 1)) };
    } catch (err) {
      return { missing: `đọc F22 lỗi: ${err.message}` };
    }
  })();
  return faultsP;
}

/** DG-* → mã tự chẩn đoán trong app. */
export function loadDiagCodes() {
  const file = at('packages/vn-rulepacks/diag-codes.json');
  if (!existsSync(file)) return { missing: 'không có diag-codes.json' };
  return { codes: JSON.parse(readFileSync(file, 'utf8')).codes ?? {} };
}
