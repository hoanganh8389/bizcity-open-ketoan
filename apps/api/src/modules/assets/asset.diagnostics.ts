// @bizcity-layer D modules/tai-san
// [2026-11-10 09:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B2c-2 (S032-35): phép kiểm trỏ điều kiện khoá sổ closeRef (RULE-SELF-DIAGNOSTICS §2b, PHASE-032 · 70 §3a)
// [2026-11-02 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W2: kiểm L3 DEPRECIATION_OPEN — tháng đã qua 30 ngày có tài sản cần khấu hao / phân bổ mà chưa có phiếu khấu hao tháng; cùng mã với lane DG-FA-1.
/**
 * Khấu hao, phân bổ — CHỈ ĐỌC, mức warn (R-VNC-10). Tháng đã trích của một tài sản: có dòng asset_depreciations của tháng đó, hoặc
 * tháng nằm trong khoảng dồn [covers_from, tháng của dòng) khi trích bù (asset.service: dồn tháng thiếu vào tháng đang tính).
 * Tài sản cần trích trong tháng: bắt đầu trước cuối tháng, chưa hết thời gian dùng, chưa ghi giảm trước đầu tháng; mở sổ giữa vòng đời
 * (opening_as_of) thì chỉ xét từ sau ngày mở sổ. Ngưỡng 30 ngày sau cuối tháng là quy chế nội bộ; xét tối đa 24 tháng gần nhất.
 * SQL chép sang lane diagnostics (tests/conformance/diagnostics/asset.diag.mjs). Đổi một bên thì đổi bên kia (R-DIAG-9).
 */
import { sql } from 'kysely';
import { SCREENS } from '@ketoan/contracts';
import { sqlCounts, type DiagCheck, type DiagScope } from '@bizcity/platform/system/diagnostics';

const SAMPLE = 20;

/** (chi nhánh, tháng) có tài sản cần trích, tháng đã kết thúc quá 30 ngày; kèm cờ đã có phiếu khấu hao. */
const due = (s: DiagScope) => sql`
  WITH m AS (SELECT gs::date AS ms, (gs + interval '1 month - 1 day')::date AS me
               FROM generate_series(date_trunc('month', current_date - 30) - interval '24 months', date_trunc('month', current_date - 30) - interval '1 month', interval '1 month') gs),
       u AS (SELECT a.id AS asset_id, a.branch_id, m.ms, to_char(m.ms, 'YYYY-MM') AS ym,
                    (extract(year FROM m.ms) * 12 + extract(month FROM m.ms) - 1)::int AS idx
               FROM assets a JOIN m ON a.start_date <= m.me
                AND (a.start_date + make_interval(months => a.useful_life_months)) > m.ms
                AND (a.status <> 'disposed' OR a.disposed_date >= m.ms)
                AND (a.opening_as_of IS NULL OR a.opening_as_of < m.me)
              WHERE a.tenant_id = ${s.tenantId} ${s.branchId ? sql`AND a.branch_id = ${s.branchId}` : sql``}
                ${s.from ? sql`AND m.me >= ${s.from}::date` : sql``} ${s.to ? sql`AND m.ms <= ${s.to}::date` : sql``})
  SELECT u.branch_id, u.ms, u.ym,
         bool_and(EXISTS (SELECT 1 FROM asset_depreciations d WHERE d.asset_id = u.asset_id
                          AND ((d.year * 12 + d.month - 1) = u.idx OR (d.covers_from IS NOT NULL AND d.covers_from <= u.idx AND u.idx < d.year * 12 + d.month - 1)))) AS done
    FROM u GROUP BY u.branch_id, u.ms, u.ym`;

export const ASSET_DIAGNOSTICS: DiagCheck[] = [
  {
    code: 'DEPRECIATION_OPEN', closeRef: 'PC-014', layer: 'L3', level: 'warn', scoped: true,
    remedy: {
      steps: [
        { text: 'Tính khấu hao, phân bổ cho tháng / chi nhánh trong mẫu (tháng cũ trước)', screen: SCREENS.ACC31, role: 'chief_accountant' },
        { text: 'Kết chuyển lại tháng đó nếu đã kết chuyển', screen: SCREENS.ACC6, role: 'chief_accountant' },
      ],
      owner: 'chief_accountant', verify: { code: 'DEPRECIATION_OPEN' },
    },
    title: 'Tháng đã qua quá 30 ngày có tài sản cần khấu hao / phân bổ thì đã có phiếu khấu hao tháng',
    fix: 'Chưa trích khấu hao / phân bổ thì chi phí tháng thiếu, lợi nhuận và giá trị còn lại của tài sản sai. Mẫu: <chi nhánh>:<YYYY-MM>.',
    run: (trx, s) => sqlCounts(trx,
      sql`WITH d AS (${due(s)}) SELECT count(*)::int AS n FROM d`,
      sql`WITH d AS (${due(s)})
          SELECT b.code || ':' || d.ym AS key, count(*) OVER ()::int AS total FROM d JOIN branches b ON b.id = d.branch_id
           WHERE NOT d.done ORDER BY d.ms, b.code LIMIT ${SAMPLE}`),
  },
];
