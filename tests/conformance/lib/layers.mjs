// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 10:29 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — tự chẩn đoán L1 / L3, diagnostic_runs, khoá kỳ chặn khi sổ lỗi (PHASES 2.10).
// [2026-10-30 11:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — runtime action defineAction, idempotency, dry-run (PHASES 2.5).
// [2026-10-30 11:27 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — bằng chứng chỉ thêm, chuỗi băm theo đơn vị, biên nhận (PHASES 2.6).
// [2026-10-30 11:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — MCP cho trợ lý AI: POST /mcp, công cụ sinh từ action, xác nhận trước khi ghi (PHASES 2.11, 2.12).
// [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp.
// [2026-10-30 12:50 PM Johnny Chu - Chu Hoàng Anh] CONG-BO — bản công bố kiến trúc: 4 lớp hợp đồng, luật hạ tầng, checklist nhận việc.
// [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — transactional outbox, subscriber, đồng hồ, correlation_id.
// [2026-10-30 09:36 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — cổng công khai apps/api/src/kernel/public.ts, SC-KERNEL-6: ngoài Kernel chỉ import qua cổng.
// [2026-10-31 03:34 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — core/workflow.ts → P documents (máy trạng thái khai báo documents.workflow).
// [2026-10-31 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — bỏ modules/reports/: báo cáo đã về phan-he/ke-toan/reports (lớp D modules/ke-toan theo quy tắc phan-he/); documentChecks về modules/periods (K)
// [2026-11-01 12:16 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — core/documents.ts, modules/doc-refs/ → P documents (documents.*, PHASES 2.7)
// [2026-11-01 03:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — modules/inventory/inventory-report.routes.ts → D modules/kho (route báo cáo kho tách khỏi Kernel)
// [2026-11-01 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — LAYER_ROOTS thêm packages/platform/src; nhãn masterdata/, system/diagnostics.ts, documents/signature.routes.ts của gói
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — LAYER_ROOTS thêm packages/kernel/src; index.ts (cổng công khai) và fastify-swagger.d.ts của gói là K
// [2026-11-01 04:13 PM Johnny Chu - Chu Hoàng Anh] ADR-0010 — OpenTelemetry từ lõi (PHASE-018 W5): span ở khớp nối Platform + cổng Kernel, lọc thuộc tính, traceparent qua outbox
// [2026-11-01 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — core/module-manifest.ts → P module-sdk (nạp bizcity.module.json, PHASES 3.2)
// [2026-11-02 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — LAYER_ROOTS thêm packages/module-sdk/src (khoá có tiền tố gốc packages/… so đường dẫn đầy đủ); core/settings.ts → P bizcity.config
// [2026-11-02 10:43 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.14: core/apps.ts, modules/apps/ → P apps.external; ung-dung/index.ts → P apps/api (app ngoài tiến trình, ADR-0011 mức 2)
// [2026-11-02 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.13: core/module-registry.ts, core/module-lifecycle.ts → P module-sdk; cli/ → P cli (lệnh module)
// [2026-11-02 04:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.10: db/module-db.ts → P data (CSDL theo module, ADR-0011 D4)
// [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: modules/intake/ → K kernel/intake (bộ tiền kiểm)
/**
 * Bảng lớp của code hiện tại (REUSE-MAP §3, docs/standard/REUSE-MAP.md): tệp nào sẽ về Kernel / Platform / Module…
 * Nguồn duy nhất cho nhãn đầu tệp `// @bizcity-layer <lớp> <đích>` (PHASES 1.2): scripts/gan-nhan-lop.mjs ghi nhãn từ bảng này,
 * check SC-LAYER-1 kiểm mọi tệp có nhãn và nhãn khớp bảng. Đổi phân loại → sửa REUSE-MAP + bảng này, chạy lại script.
 */

/** K Kernel kế toán · P Platform chung · M Danh mục chuẩn · D Module nghiệp vụ · A Adapter · U UI kit (REUSE-MAP §1). */
export const LAYERS = ['K', 'P', 'M', 'D', 'A', 'U'];
/** Gốc mã nguồn có nhãn lớp. Khoá LAYER_MAP là đường dẫn tương đối với gốc (cùng bảng cho mọi gốc). packages/platform: D010-7 chặng 2. */
export const LAYER_ROOTS = ['apps/api/src', 'packages/platform/src', 'packages/kernel/src', 'packages/module-sdk/src'];
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
  ['core/json-schema.ts', 'P', 'actions'],
  ['core/actions.ts', 'P', 'actions'],
  ['core/metrics.ts', 'P', 'observability'],
  ['core/observability.ts', 'P', 'observability'],
  ['core/request-context.ts', 'P', 'observability'],
  ['core/tracing.ts', 'P', 'observability'],
  ['core/events.ts', 'P', 'events'],
  ['core/auth.ts', 'P', 'permissions'],
  ['core/security/', 'P', 'permissions'],
  ['core/audit.ts', 'P', 'audit'],
  ['core/catalog-warn.ts', 'P', 'audit'], // [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 — ghi nhận cảnh báo mềm form danh mục
  ['core/addins.ts', 'P', 'module-sdk'],
  ['core/module-manifest.ts', 'P', 'module-sdk'],
  ['core/settings.ts', 'P', 'bizcity.config'],
  ['core/apps.ts', 'P', 'apps.external'],
  ['core/module-registry.ts', 'P', 'module-sdk'],
  ['core/module-lifecycle.ts', 'P', 'module-sdk'],
  ['db/module-db.ts', 'P', 'data'],
  ['cli/', 'P', 'cli'],
  // Khoá có tiền tố gốc (packages/…) so với đường dẫn đầy đủ — gói có tên tệp trùng gói khác (index.ts của Kernel là K).
  ['packages/module-sdk/src/', 'P', 'module-sdk'],
  ['core/date-rules.ts', 'P', 'documents'],
  ['core/workflow.ts', 'P', 'documents'],
  ['core/documents.ts', 'P', 'documents'],
  ['core/posting-modes.ts', 'K', 'kernel/config'],
  ['core/version.ts', 'P', 'cli'],
  ['db/client.ts', 'P+A', 'data'],
  ['db/migrate.ts', 'P+A', 'data'],
  ['db/paths.ts', 'P', 'data'],
  ['db/setup.ts', 'A', 'adapters/postgres'],
  ['db/seed.ts', 'K', 'kernel/seeds'],
  ['db/types.ts', 'P', 'data'],

  ['modules/documents/', 'K', 'kernel/intake'],
  ['modules/intake/', 'K', 'kernel/intake'],
  ['modules/posting/', 'K', 'kernel/posting'],
  ['modules/posting-config/', 'K', 'kernel/config'],
  ['modules/ledger/', 'K', 'kernel/ledger'],
  ['modules/periods/', 'K', 'kernel/periods'],
  ['modules/accounts/', 'K', 'kernel/accounts'],
  ['modules/debts/', 'K', 'kernel/subledgers/debts'],
  ['modules/inventory/', 'K', 'kernel/subledgers/inventory'],
  // Báo cáo nhập xuất tồn chỉ đọc inventory_movements: module, không phải sổ phụ.
  ['modules/inventory/inventory-report.service.ts', 'D', 'modules/kho'],
  ['modules/inventory/inventory-report.routes.ts', 'D', 'modules/kho'],
  ['modules/tax-invoices/', 'K', 'kernel/tax'],
  ['modules/tax-info/', 'K', 'kernel/tax'],
  ['modules/tax-codes/', 'K', 'kernel/tax'],
  // ADR-0004: dòng bán (sales_lines) do Kernel dựng khi ghi sổ; ba tệp ở đây chỉ là báo cáo bán hàng.
  ['modules/sales/', 'D', 'modules/ban-hang'],
  ['modules/closing/', 'K', 'kernel/closing'],
  // [2026-11-02 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — Conformance Engine (ADR-0012): trụ cột Kernel, chỉ đọc sổ
  ['modules/conformance/', 'K', 'kernel/conformance'],
  // [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W4: Bàn đánh giá theo vai (danh mục F22 + checklist), chỉ đọc.
  ['modules/review/', 'K', 'kernel/review'],
  ['kernel/', 'K', 'kernel/public'],
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
  ['modules/doc-refs/', 'P', 'documents'],
  ['modules/print-templates/', 'U', 'ui-kit/print'],
  ['modules/voucher-templates/', 'D', 'modules/ke-toan'],
  ['modules/assets/', 'D', 'modules/tai-san'],
  ['modules/access/', 'P', 'permissions'],
  ['modules/apps/', 'P', 'apps.external'],
  ['modules/auth/', 'P', 'permissions'],
  ['modules/auth/wp-sso.ts', 'A', 'adapters/wordpress'],
  ['modules/system/', 'P', 'module-sdk'],
  ['modules/system/presence.ts', 'P', 'permissions'],
  ['modules/system/system.routes.ts', 'P', 'cli'],
  ['modules/system/diagnostics.ts', 'P', 'cli'],
  // packages/platform/src (D010-7 chặng 2): core/, db/, config/ dùng chung dòng ở trên; ba thư mục riêng của gói:
  ['masterdata/', 'M', 'data/masterdata'],
  ['system/diagnostics.ts', 'P', 'cli'],
  ['documents/signature.routes.ts', 'P', 'documents/signatures'],
  // packages/kernel/src (D010-7 chặng 3): modules/…, core/posting-modes.ts, db/seed.ts dùng chung dòng ở trên; gốc gói là cổng công khai.
  ['index.ts', 'K', 'kernel/public'],
  ['fastify-swagger.d.ts', 'K', 'kernel/public'],
  ['modules/system/evidence.routes.ts', 'P', 'audit'],
  ['modules/system/events.routes.ts', 'P', 'events'],
  ['modules/system/mcp.routes.ts', 'P', 'mcp'],
  ['modules/system/metrics.routes.ts', 'P', 'observability'],
  // [2026-11-01 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W2: Bàn điều tra (API trung gian đọc trace / log) → P observability
  ['modules/system/devtools.routes.ts', 'P', 'observability'],
  ['modules/system/devtools.sources.ts', 'P', 'observability'],
  ['modules/system/devtools.trace.ts', 'P', 'observability'],
  ['modules/connections/', 'A', 'adapters/wordpress'],

  // Danh sách phân hệ / add-in bật và route lõi: lắp ráp (apps/server, LAYOUT-6), không phải SDK. Kiểu ApiModule mới là SDK.
  ['phan-he/index.ts', 'P', 'apps/api'],
  ['phan-he/loi.ts', 'P', 'apps/api'],
  ['phan-he/types.ts', 'P', 'module-sdk'],
  ['phan-he/', 'D', 'modules/<key>'],
  ['addins/index.ts', 'P', 'apps/api'],
  ['ung-dung/index.ts', 'P', 'apps/api'],
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
    const key = prefix.startsWith('packages/') ? file : rel;
    const hit = prefix.endsWith('/') ? key.startsWith(prefix) : key === prefix;
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
