/**
 * DANH MỤC MẪU IN TRUNG TÂM: mọi màn có nút In và các mẫu của màn đó, mỗi mẫu một mã cố định "<mã màn>:<id mẫu>" (vd BH10:a5) —
 * cấu hình ở màn Mẫu in (HT05, bảng print_template_settings) trỏ tới mã này.
 *
 * Lõi không import phân hệ, nên danh mục được nạp từ gốc ứng dụng (src/printCatalog.ts gọi setPrintCatalog lúc khởi động).
 * Thêm mẫu cho một màn: thêm vào mảng mẫu của màn (tệp mauIn / *Print.tsx) — danh mục tự có; màn mới: thêm một dòng ở src/printCatalog.ts.
 */
import type { Paper, PrintTemplate } from './PrintHost';

export interface CatalogTemplate { id: string; name: string; paper: Paper; source?: string; copies?: number; screen?: boolean }
export interface CatalogScreen { code: string; title: string; templates: CatalogTemplate[] }

let catalog: CatalogScreen[] = [];

/** Gom các danh sách mẫu (nhiều biến thể của cùng một màn) thành danh sách không trùng id, giữ thứ tự xuất hiện. */
export function uniqTemplates(...lists: PrintTemplate<never>[][]): CatalogTemplate[] {
  const out = new Map<string, CatalogTemplate>();
  for (const l of lists) for (const t of l) if (!out.has(t.id)) out.set(t.id, { id: t.id, name: t.name, paper: t.paper, source: t.source, copies: t.copies, screen: t.screen });
  return [...out.values()];
}

export function setPrintCatalog(list: CatalogScreen[]) { catalog = list; }
export function getPrintCatalog(): CatalogScreen[] { return catalog; }
/** Mã cấu hình của một mẫu trong một màn. */
export const templateCode = (screen: string, id: string) => `${screen}:${id}`;
