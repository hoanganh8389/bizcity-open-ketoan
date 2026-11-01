// @bizcity-layer P apps/api
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
/**
 * Danh sách add-in có sẵn. Thêm add-in mới: tạo thư mục src/addins/<ma>/index.ts
 * export default defineAddIn({...}) + bizcity.module.json (kind "addin") rồi thêm vào mảng dưới đây.
 */
import type { ApiAddIn } from '../core/addins.js';
import { loadModuleManifest, type ModuleManifest } from '../core/module-manifest.js';
import excelExport from './excel-export/index.js';
import spreadsheetAi from './spreadsheet-ai/index.js';
import troLy from './tro-ly/index.js';

export const BUILTIN_ADDINS: ApiAddIn[] = [excelExport, spreadsheetAi, troLy];

// [2026-11-01 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — manifest add-in (kind addin): khớp id / name / version với defineAddIn
/** Manifest (bizcity.module.json) của add-in, theo mã. Lệch với defineAddIn → lỗi khi nạp tệp này. */
export const ADDIN_MANIFESTS: ReadonlyMap<string, ModuleManifest> = new Map(
  BUILTIN_ADDINS.map((a) => [a.manifest.id, loadModuleManifest(new URL(`./${a.manifest.id}/bizcity.module.json`, import.meta.url), { key: a.manifest.id, kind: 'addin', label: a.manifest.name, version: a.manifest.version })]),
);
