// @bizcity-layer P apps/api
/**
 * Danh sách add-in có sẵn. Thêm add-in mới: tạo thư mục src/addins/<ma>/index.ts
 * export default defineAddIn({...}) rồi thêm vào mảng dưới đây.
 */
import type { ApiAddIn } from '../core/addins.js';
import excelExport from './excel-export/index.js';
import spreadsheetAi from './spreadsheet-ai/index.js';
import troLy from './tro-ly/index.js';

export const BUILTIN_ADDINS: ApiAddIn[] = [excelExport, spreadsheetAi, troLy];
