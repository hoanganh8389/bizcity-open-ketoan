// [2026-11-02 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — lane cho hai kiểm cấu hình tầng L5 của Conformance Engine: đơn vị đã khai hồ sơ kế toán, gói định khoản cùng chế độ với hồ sơ (ADR-0012 T1, ADR-0013).
/**
 * Lớp Cấu hình của Conformance Engine (ADR-0012) — kiểm trên CSDL thật, CHỈ ĐỌC, cùng mã với kiểm L5 trong app
 * (packages/kernel/src/modules/posting-config/profile.diagnostics.ts, R-DIAG-9).
 * Mức warn (enforce info): là phân tích để người dùng quyết định, không chặn ghi sổ (R-VNC-10).
 */
import { sqlCheck } from '../lib/diag.mjs';

/** Hồ sơ áp cho hôm nay của đơn vị t: effective_from ≤ current_date lớn nhất, bằng nhau thì version lớn nhất. */
const PROFILE_NOW = `(SELECT p.regime FROM accounting_profiles p WHERE p.tenant_id = t.id AND p.effective_from <= current_date
                     ORDER BY p.effective_from DESC, p.version DESC LIMIT 1)`;

export const checks = [
  sqlCheck({
    id: 'DG-PROFILE-1', code: 'PROFILE_DECLARED',
    title: 'Đơn vị đã khai hồ sơ kế toán (năm tài chính, chế độ kế toán, loại pháp nhân) áp cho hôm nay (ADR-0013)',
    rules: ['R-VNC-4'], conf: [], tier: 1, enforce: 'info', weight: 1, contract: 'kernel',
    count: 'SELECT count(*)::int AS n FROM tenants t WHERE t.is_active',
    sql: `SELECT t.code AS tenant, 'accounting_profile' AS key
          FROM tenants t WHERE t.is_active AND ${PROFILE_NOW} IS NULL
          LIMIT 200`,
  }),
  sqlCheck({
    id: 'DG-PROFILE-2', code: 'PROFILE_PACK_REGIME',
    title: 'Gói định khoản đang cài cùng chế độ kế toán với hồ sơ của đơn vị (ADR-0013, bizcity_posting_template@1)',
    rules: ['R-VNC-4'], conf: [], tier: 1, enforce: 'info', weight: 1, contract: 'kernel',
    count: `SELECT count(*)::int AS n FROM config_packs c JOIN tenants t ON t.id = c.tenant_id
            WHERE c.status = 'installed' AND ${PROFILE_NOW} IS NOT NULL`,
    sql: `SELECT t.code AS tenant, c.pack_id AS key, json_build_object('pack_regime', c.regime, 'profile_regime', ${PROFILE_NOW}) AS detail
          FROM config_packs c JOIN tenants t ON t.id = c.tenant_id
          WHERE c.status = 'installed' AND ${PROFILE_NOW} IS NOT NULL AND c.regime <> ${PROFILE_NOW}
          LIMIT 200`,
  }),
];
