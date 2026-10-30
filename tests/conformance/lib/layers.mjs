/**
 * Bảng lớp của code hiện tại (REUSE-MAP §3, docs/standard/REUSE-MAP.md): tệp nào sẽ về Kernel / Platform / Module…
 * Nguồn duy nhất cho nhãn đầu tệp `// @bizcity-layer <lớp> <đích>` (PHASES 1.2): scripts/gan-nhan-lop.mjs ghi nhãn từ bảng này,
 * check SC-LAYER-1 kiểm mọi tệp có nhãn và nhãn khớp bảng. Đổi phân loại → sửa REUSE-MAP + bảng này, chạy lại script.
 */

/** K Kernel kế toán · P Platform chung · M Danh mục chuẩn · D Module nghiệp vụ · A Adapter · U UI kit (REUSE-MAP §1). */
export const LAYERS = ['K', 'P', 'M', 'D', 'A', 'U'];
export const LAYER_ROOTS = ['apps/api/src'];
export const TAG_RE = /^\/\/ @bizcity-layer ([KPMDAU](?:\+[KPMDAU])*) (\S+)\s*$/;

/**
 * [tiền tố đường dẫn (sau apps/api/src/), lớp, đích]. Tiền tố dài nhất thắng; tiền tố kết thúc '/' là thư mục.
 * Đích viết theo TARGET-LAYOUT: kernel/…, data/…, permissions… (packages/*), modules/<key>, adapters/<x>, ui-kit/….
 */
export const LAYER_MAP = [
  ['app.ts', 'P', 'apps/api'],
  ['main.ts', 'P', 'apps/api'],
  ['config/', 'P', 'bizcity.config'],
  ['core/errors.ts', 'P', 'actions'],
  ['core/http.ts', 'P', 'actions'],
  ['core/auth.ts', 'P', 'permissions'],
  ['core/security/', 'P', 'permissions'],
  ['core/audit.ts', 'P', 'audit'],
  ['core/addins.ts', 'P', 'module-sdk'],
  ['core/date-rules.ts', 'P', 'documents'],
  ['core/posting-modes.ts', 'K', 'kernel/config'],
  ['core/version.ts', 'P', 'cli'],
  ['db/client.ts', 'P+A', 'data'],
  ['db/migrate.ts', 'P+A', 'data'],
  ['db/paths.ts', 'P', 'data'],
  ['db/setup.ts', 'A', 'adapters/postgres'],
  ['db/seed.ts', 'K', 'kernel/seeds'],
  ['db/types.ts', 'P', 'data'],

  ['modules/documents/', 'K', 'kernel/intake'],
  ['modules/posting/', 'K', 'kernel/posting'],
  ['modules/posting-config/', 'K', 'kernel/config'],
  ['modules/ledger/', 'K', 'kernel/ledger'],
  ['modules/periods/', 'K', 'kernel/periods'],
  ['modules/accounts/', 'K', 'kernel/accounts'],
  ['modules/debts/', 'K', 'kernel/subledgers/debts'],
  ['modules/inventory/', 'K', 'kernel/subledgers/inventory'],
  // Báo cáo nhập xuất tồn chỉ đọc inventory_movements: module, không phải sổ phụ.
  ['modules/inventory/inventory-report.service.ts', 'D', 'modules/kho'],
  ['modules/tax-invoices/', 'K', 'kernel/tax'],
  ['modules/tax-info/', 'K', 'kernel/tax'],
  ['modules/tax-codes/', 'K', 'kernel/tax'],
  // ADR-0004: dòng bán (sales_lines) do Kernel dựng khi ghi sổ; ba tệp ở đây chỉ là báo cáo bán hàng.
  ['modules/sales/', 'D', 'modules/ban-hang'],
  ['modules/closing/', 'K', 'kernel/closing'],
  ['modules/vouchers/voucher.service.ts', 'K', 'kernel/intake'],
  ['modules/vouchers/', 'K+D', 'kernel/intake'],
  ['modules/default-data/', 'K', 'kernel/seeds'],

  ['modules/partners/', 'M', 'data/masterdata'],
  // Tra cứu MST qua dịch vụ ngoài.
  ['modules/partners/tra-mst.ts', 'A', 'adapters/tax-lookup'],
  ['modules/products/', 'M', 'data/masterdata'],
  ['modules/branches/', 'M', 'data/masterdata'],
  ['modules/warehouses/', 'M', 'data/masterdata'],
  ['modules/unit-names/', 'M', 'data/masterdata'],
  ['modules/bank-accounts/', 'M', 'data/masterdata'],
  ['modules/catalog/', 'M', 'data/masterdata'],
  ['modules/catalog/catalog-notify.ts', 'P', 'events'],
  ['modules/dimensions/', 'P', 'data'],
  // ADR-0003: lịch hợp đồng là nghiệp vụ của module hop-dong.
  ['modules/dimensions/contract-schedule.routes.ts', 'D', 'modules/hop-dong'],
  ['modules/signatures/', 'P', 'documents/signatures'],
  ['modules/reference-documents/', 'P', 'documents/links'],
  ['modules/print-templates/', 'U', 'ui-kit/print'],
  ['modules/voucher-templates/', 'D', 'modules/ke-toan'],
  ['modules/reports/', 'D', 'modules/ke-toan'],
  ['modules/assets/', 'D', 'modules/tai-san'],
  ['modules/access/', 'P', 'permissions'],
  ['modules/auth/', 'P', 'permissions'],
  ['modules/auth/wp-sso.ts', 'A', 'adapters/wordpress'],
  ['modules/system/', 'P', 'module-sdk'],
  ['modules/system/presence.ts', 'P', 'permissions'],
  ['modules/system/system.routes.ts', 'P', 'cli'],
  ['modules/connections/', 'A', 'adapters/wordpress'],

  // Danh sách phân hệ / add-in bật và route lõi: lắp ráp (apps/server, LAYOUT-6), không phải SDK. Kiểu ApiModule mới là SDK.
  ['phan-he/index.ts', 'P', 'apps/api'],
  ['phan-he/loi.ts', 'P', 'apps/api'],
  ['phan-he/types.ts', 'P', 'module-sdk'],
  ['phan-he/', 'D', 'modules/<key>'],
  ['addins/index.ts', 'P', 'apps/api'],
  ['addins/tro-ly/', 'A+P', 'adapters/cell'],
  ['addins/spreadsheet-ai/', 'A', 'adapters/cell'],
  ['addins/excel-export/', 'D', 'modules/xuat-excel'],
];

/** Lớp + đích mong đợi của một tệp (đường dẫn tương đối repo), hoặc null nếu bảng chưa phủ. */
export function expectedLayer(file) {
  const root = LAYER_ROOTS.find((r) => file.startsWith(r + '/'));
  if (!root) return null;
  const rel = file.slice(root.length + 1);
  let best = null;
  for (const [prefix, layer, target] of LAYER_MAP) {
    const hit = prefix.endsWith('/') ? rel.startsWith(prefix) : rel === prefix;
    if (hit && (!best || prefix.length > best.prefix.length)) best = { prefix, layer, target };
  }
  if (!best) return null;
  // phan-he/<key>/… → modules/<key>
  const target = best.target === 'modules/<key>' ? `modules/${rel.split('/')[1]}` : best.target;
  return { layer: best.layer, target };
}

export const tagLine = ({ layer, target }) => `// @bizcity-layer ${layer} ${target}`;

/** Nhãn đang có ở dòng đầu tệp (bỏ BOM), hoặc null. */
export function readTag(text) {
  const first = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0];
  const m = TAG_RE.exec(first);
  return m ? { layer: m[1], target: m[2] } : null;
}
