// @bizcity-layer P apps/api
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
/**
 * Danh sách add-in có sẵn. Thêm add-in mới: tạo thư mục src/addins/<ma>/index.ts
 * export default defineAddIn({...}) rồi thêm vào mảng dưới đây.
 */
import type { ApiAddIn } from '../core/addins.js';
import excelExport from './excel-export/index.js';
import spreadsheetAi from './spreadsheet-ai/index.js';
import troLy from './tro-ly/index.js';

export const BUILTIN_ADDINS: ApiAddIn[] = [excelExport, spreadsheetAi, troLy];
