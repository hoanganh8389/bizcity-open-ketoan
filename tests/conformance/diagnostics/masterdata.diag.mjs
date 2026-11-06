// [2026-11-06 10:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — E6 đợt 1 (S029-13, 30 §6): lane dữ liệu gốc mặt hàng — ITEM_CODE_CASE_DUP, UNIT_BASE_INVALID
/**
 * Dữ liệu gốc mặt hàng — kiểm trên CSDL thật, CHỈ ĐỌC, cùng mã với kiểm L3 trong app
 * (packages/kernel/src/modules/inventory/inventory.diagnostics.ts, R-DIAG-9). Mức warn (enforce info). Thay mục 6b / 7 chạy tay của
 * scripts/doi-chieu-ke-toan.sql. Đổi một bên thì đổi bên kia.
 */
import { sqlCheck } from '../lib/diag.mjs';

export const checks = [
  sqlCheck({
    id: 'DG-MD-1', code: 'ITEM_CODE_CASE_DUP',
    title: 'Mã hàng không trùng nhau khi bỏ khoảng trắng và không phân biệt hoa / thường',
    rules: ['R-REV-6'], conf: [], tier: 2, enforce: 'info', weight: 1,
    count: `SELECT count(*)::int AS n FROM products`,
    sql: `SELECT t.code AS tenant, x.k AS key, json_build_object('codes', x.codes) AS detail
          FROM (SELECT p.tenant_id, upper(btrim(p.sku)) AS k, string_agg(p.sku, ' | ' ORDER BY p.sku) AS codes
                  FROM products p GROUP BY 1, 2 HAVING count(*) > 1) x JOIN tenants t ON t.id = x.tenant_id
          ORDER BY t.code, x.k LIMIT 200`,
  }),
  sqlCheck({
    id: 'DG-MD-2', code: 'UNIT_BASE_INVALID',
    title: 'Mặt hàng có khai ĐVT thì có đúng một ĐVT gốc tỉ lệ 1 và không quá một ĐVT mua mặc định',
    rules: ['R-REV-6'], conf: [], tier: 2, enforce: 'info', weight: 1,
    count: `SELECT count(*)::int AS n FROM (SELECT DISTINCT tenant_id, sku FROM product_units) x`,
    sql: `SELECT t.code AS tenant, x.sku AS key, json_build_object('base', x.base, 'purchase_default', x.pd) AS detail
          FROM (SELECT u.tenant_id, u.sku, count(*) FILTER (WHERE u.ratio = 1) AS base, count(*) FILTER (WHERE u.is_purchase_default) AS pd
                  FROM product_units u GROUP BY 1, 2) x JOIN tenants t ON t.id = x.tenant_id
          WHERE x.base <> 1 OR x.pd > 1
          ORDER BY t.code, x.sku LIMIT 200`,
  }),
];
