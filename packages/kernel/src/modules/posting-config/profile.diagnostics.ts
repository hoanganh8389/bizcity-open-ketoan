// @bizcity-layer K kernel/config
// [2026-11-02 07:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W1: remedy có cấu trúc cho từng kiểm (bizcity_remedy@1, R-FIX-1).
// [2026-11-02 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — kiểm cấu hình tầng L5 của Conformance Engine: PROFILE_DECLARED, PROFILE_PACK_REGIME (ADR-0012 T1, ADR-0013); cùng mã với lane DG-PROFILE-1, DG-PROFILE-2.
/**
 * Tầng L5 (Tuân thủ) của tự chẩn đoán — lớp Cấu hình của Conformance Engine (ADR-0012 T1: dùng lại khung DiagCheck, không bộ chạy thứ hai).
 * Chỉ đọc, mức warn: phân tích để người dùng quyết định, không chặn ghi sổ (R-VNC-10). Bản lane: tests/conformance/diagnostics/profile.diag.mjs.
 * Ngày xét = scope.to (nếu có) hoặc hôm nay.
 */
import { sql } from 'kysely';
import { sqlCounts, type DiagCheck } from '@bizcity/platform/system/diagnostics';
import { SCREENS } from '@ketoan/contracts';

/** Chế độ của hồ sơ áp cho ngày asOf của đơn vị t (NULL = chưa khai). */
const regimeAt = (asOf: string) => sql`(SELECT p.regime FROM accounting_profiles p WHERE p.tenant_id = t.id AND p.effective_from <= ${asOf}::date
                     ORDER BY p.effective_from DESC, p.version DESC LIMIT 1)`;
const day = (to?: string) => to ?? new Date().toISOString().slice(0, 10);

export const PROFILE_DIAGNOSTICS: DiagCheck[] = [
  {
    code: 'PROFILE_DECLARED', layer: 'L5', level: 'warn', scoped: false,
    remedy: { steps: [{ text: 'Mở Hồ sơ kế toán', screen: SCREENS.HT07 }, { text: 'Chọn năm tài chính, chế độ kế toán, loại pháp nhân; ghi căn cứ', screen: SCREENS.HT07, role: 'chief_accountant' }, { text: 'Phát hành', screen: SCREENS.HT07, role: 'chief_accountant' }], owner: 'chief_accountant', verify: { code: 'PROFILE_DECLARED' } },
    title: 'Đơn vị đã khai hồ sơ kế toán (năm tài chính, chế độ kế toán, loại pháp nhân) áp cho ngày xét',
    fix: 'Chưa khai hồ sơ thì Kiểm chuẩn không chọn được quy định theo chế độ / năm tài chính (ca ra "cần rà soát"). Khai ở Cấu hình hạch toán → Hồ sơ kế toán (accounting.profile.publish). Ghi sổ vẫn chạy bình thường.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM tenants t WHERE t.id = ${s.tenantId}`,
      sql`SELECT 'accounting_profile' AS key, count(*) OVER ()::int AS total FROM tenants t
           WHERE t.id = ${s.tenantId} AND ${regimeAt(day(s.to))} IS NULL`),
  },
  {
    code: 'PROFILE_PACK_REGIME', layer: 'L5', level: 'warn', scoped: false,
    remedy: { steps: [{ text: 'Kiểm chế độ trong Hồ sơ kế toán có đúng không', screen: SCREENS.HT07 }, { text: 'Đúng: cài gói định khoản của chế độ đó cho năm tài chính kế tiếp (không đổi giữa năm)', role: 'owner' }, { text: 'Hồ sơ sai: phát hành hồ sơ mới', screen: SCREENS.HT07, role: 'chief_accountant' }], owner: 'chief_accountant', verify: { code: 'PROFILE_PACK_REGIME' } },
    title: 'Gói định khoản đang cài cùng chế độ kế toán với hồ sơ của đơn vị',
    fix: 'Gói định khoản khác chế độ đã khai: tài khoản / lý do có thể không theo chế độ đơn vị áp dụng. Kiểm lại hồ sơ hoặc cài gói đúng chế độ; quyết định là của kế toán trưởng.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM config_packs c JOIN tenants t ON t.id = c.tenant_id
           WHERE c.tenant_id = ${s.tenantId} AND c.status = 'installed' AND ${regimeAt(day(s.to))} IS NOT NULL`,
      sql`SELECT c.pack_id AS key, count(*) OVER ()::int AS total FROM config_packs c JOIN tenants t ON t.id = c.tenant_id
           WHERE c.tenant_id = ${s.tenantId} AND c.status = 'installed' AND ${regimeAt(day(s.to))} IS NOT NULL
             AND c.regime <> ${regimeAt(day(s.to))}`),
  },
];
