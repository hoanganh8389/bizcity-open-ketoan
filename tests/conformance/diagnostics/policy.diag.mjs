// [2026-11-21 08:40 AM Võ Hoàng] PHASE-031 — S031-17: rulepack `policy` của Conformance Engine (10-THIET-KE §9) — năm kiểm DG-POLICY-1..5, chỉ đọc, không chặn
/**
 * Lane diagnostics — chính sách nghiệp vụ (PHASE-031 · 10 §9, D-POL-8). Cấp ĐƠN VỊ, CHỈ ĐỌC (R-DIAG-2): đọc phong bì `policy_registry`,
 * khung nhìn `bizcity_read.policy_application` (0080), `accounting_events` và `posting_reasons`. Không đọc bảng của module chủ, không chặn
 * giao dịch, không ghi sổ, không tự phát hành / ngừng chính sách (R-VNC-10). Mức info: khuyến nghị để người dùng quyết.
 *
 *   DG-POLICY-1  POLICY_L4B_WARN         sự việc có cảnh báo L4b (IN-POL-*) theo kỳ × nguồn × chi nhánh × chính sách, kèm tỷ lệ
 *   DG-POLICY-2  POLICY_REASON_MISSING   chính sách `published` còn hiệu lực mà lý do định khoản của `treatment` không có / đã tắt
 *   DG-POLICY-3  POLICY_REFS_MISSING     nguồn ngoài gửi chứng từ bán không kèm policyRefs trong khi có chính sách bán hiệu lực (POL-REF-000)
 *   DG-POLICY-4  POLICY_EXPIRING_IN_USE  bản chính sách hết hạn trong 30 ngày tới mà 30 ngày qua vẫn có sự việc tham chiếu
 *   DG-POLICY-5  POLICY_PROMO_NOTICE     khuyến mại thuộc diện thông báo Sở Công Thương (NĐ81 Điều 17) chưa có số — CHƯA ĐỦ CĂN CỨ, bỏ qua
 *
 * Mỗi phát hiện mở đầu bằng `[mã đơn vị]`, khoá `<đơn vị>:…` — một lượt chạy trên cả bản cài, đọc theo từng đơn vị. `ctx.args.tenant`
 * (mã đơn vị) thu lượt chạy về MỘT đơn vị (Conformance Engine cấp đơn vị, test); mã sai khuôn thì bỏ qua lọc, không ghép vào SQL.
 */

/**
 * Bản chép `treatment` của Rule Contract (apps/api/src/modules/system/rule-contracts/*.ts) — đổi bên kia thì đổi ở đây.
 * Chỉ chép phần quà: lý do XTA1.4 (hàng tặng kèm bán) có trong bảng lý do `posting_reasons`. Phần giảm giá (`GGHB`) không phải mã của
 * `posting_reasons` (giảm giá đi cột chiết khấu của dòng bán) nên CHƯA ĐỦ CĂN CỨ để kiểm — không đưa vào đây.
 */
const GIFT_REASON = 'XTA1.4';
const GIFT_CONTRACTS = [
  'sale.promo.buy_x_get_y@1', 'sale.program.gift@1',
  'sale.promo.tiered@1', 'sale.promo.order_discount@1', 'sale.promo.order_gift@1', 'sale.promo.combo@1', 'sale.promo.cheapest_free@1',
];
const SOON_DAYS = 30;
const RECENT_DAYS = 30;
const LIMIT = 200;

const hasView = async (ctx) => {
  const [t] = await ctx.db.query("SELECT to_regclass('bizcity_read.policy_application') IS NOT NULL AND to_regclass('public.policy_registry') IS NOT NULL AS ok");
  return Boolean(t?.ok);
};
const NO_VIEW = { examined: 0, findings: [], notes: ['CSDL chưa áp migration 0079 / 0080 (sổ đăng ký chính sách, khung nhìn policy_application) — xem DG-DB-1'] };
/** Điều kiện lọc một đơn vị theo `ctx.args.tenant` (mã đơn vị, chỉ chữ / số / . _ -). */
const only = (ctx, alias = 't') => {
  const code = ctx.args?.tenant;
  return typeof code === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(code) ? ` AND ${alias}.code = '${code}'` : '';
};
const pct = (n, d) => (d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : '—');
const meta = { gate: 'CONF-RUN', contract: 'bizcity_ledger_intake', rules: ['R-DIAG-2', 'R-VNC-10'], conf: [], tier: 2, enforce: 'info', weight: 1 };

export const checks = [
  {
    ...meta, id: 'DG-POLICY-1', code: 'POLICY_L4B_WARN',
    title: 'Sự việc áp chính sách qua L4b sạch — đếm cảnh báo IN-POL-* theo kỳ, nguồn, chi nhánh, chính sách (tỷ lệ để xem, không chặn)',
    async run(ctx) {
      if (!(await hasView(ctx))) return NO_VIEW;
      const [n] = await ctx.db.query(`SELECT count(*)::int AS n FROM bizcity_read.policy_application a JOIN tenants t ON t.id = a.tenant_id WHERE a.status <> 'cancelled'${only(ctx)}`);
      const rows = await ctx.db.query(`
        SELECT t.code AS tenant, to_char(a.doc_date, 'YYYY-MM') AS period, a.source_system AS source, coalesce(b.code, '') AS branch,
               a.policy_key, count(*)::int AS refs, count(*) FILTER (WHERE NOT a.ok)::int AS warn,
               string_agg(array_to_string(a.codes, ','), ',') FILTER (WHERE NOT a.ok) AS codes
          FROM bizcity_read.policy_application a
          JOIN tenants t ON t.id = a.tenant_id
          LEFT JOIN branches b ON b.id = a.branch_id
         WHERE a.status <> 'cancelled'${only(ctx)}
         GROUP BY t.code, to_char(a.doc_date, 'YYYY-MM'), a.source_system, b.code, a.policy_key
        HAVING count(*) FILTER (WHERE NOT a.ok) > 0
         ORDER BY 2 DESC, 1, 3, 4, 5 LIMIT ${LIMIT}`);
      return {
        examined: n?.n ?? 0, unitBy: 'key',
        findings: rows.map((r) => ctx.finding(null, null,
          `[${r.tenant}] ${r.period} · nguồn ${r.source} · chi nhánh ${r.branch || '—'} · ${r.policy_key}: ${r.warn}/${r.refs} tham chiếu có cảnh báo L4b (${pct(r.warn, r.refs)}; ${[...new Set(String(r.codes ?? '').split(',').filter(Boolean))].sort().join(', ')})`,
          `${r.tenant}:${r.period}:${r.source}:${r.branch}:${r.policy_key}`)),
        metrics: { code: 'POLICY_L4B_WARN', truncated: rows.length >= LIMIT },
      };
    },
  },
  {
    ...meta, id: 'DG-POLICY-2', code: 'POLICY_REASON_MISSING',
    title: 'Chính sách bán có quà đang phát hành có lý do định khoản quà (XTA1.4) trong bảng lý do của đơn vị — phần giảm giá chưa đủ căn cứ để kiểm',
    async run(ctx) {
      if (!(await hasView(ctx))) return NO_VIEW;
      const list = GIFT_CONTRACTS.map((c) => `'${c}'`).join(', ');
      const live = `r.status = 'published' AND (r.effective_to IS NULL OR r.effective_to >= current_date) AND r.rule_contract IN (${list})`;
      const [n] = await ctx.db.query(`SELECT count(*)::int AS n FROM policy_registry r JOIN tenants t ON t.id = r.tenant_id WHERE ${live}${only(ctx)}`);
      const rows = await ctx.db.query(`
        SELECT t.code AS tenant, r.policy_key, r.version, r.rule_contract
          FROM policy_registry r JOIN tenants t ON t.id = r.tenant_id
         WHERE ${live}${only(ctx)}
           AND NOT EXISTS (SELECT 1 FROM posting_reasons p WHERE p.tenant_id = r.tenant_id AND p.code = '${GIFT_REASON}' AND p.is_active)
         ORDER BY t.code, r.policy_key, r.version LIMIT ${LIMIT}`);
      return {
        examined: n?.n ?? 0, unitBy: 'key',
        findings: rows.map((r) => ctx.finding(null, null,
          `[${r.tenant}] ${r.policy_key}@${r.version} (${r.rule_contract}): quà ghi theo lý do ${GIFT_REASON} nhưng bảng lý do của đơn vị không có / đã tắt — dòng quà sẽ không định khoản được`,
          `${r.tenant}:${r.policy_key}@${r.version}`)),
        notes: ['Phần giảm giá (GGHB) chưa đủ căn cứ: không phải mã của bảng lý do; chỉ kiểm lý do quà.'],
        metrics: { code: 'POLICY_REASON_MISSING', truncated: rows.length >= LIMIT },
      };
    },
  },
  {
    ...meta, id: 'DG-POLICY-3', code: 'POLICY_REFS_MISSING',
    title: 'Nguồn ngoài gửi chứng từ bán kèm tham chiếu chính sách (policyRefs) khi có chính sách bán hiệu lực tại ngày chứng từ, chi nhánh, kênh',
    async run(ctx) {
      if (!(await hasView(ctx))) return NO_VIEW;
      // Sự việc "lẽ ra có chính sách" (POL-REF-000): bán, không huỷ, không lập tay trong Core, có ít nhất một bản sale.* published phủ
      // ngày chứng từ + chi nhánh (scope.branchCodes) + kênh (scope.channels, kênh lấy từ payload.channel). Có policy hiệu lực không có
      // nghĩa đơn nào cũng đủ điều kiện áp — vì vậy chỉ info, đọc theo tỷ lệ.
      const eligible = `
        FROM accounting_events e
        JOIN tenants t ON t.id = e.tenant_id
        JOIN branches b ON b.id = e.branch_id
       WHERE e.doc_type = 'sale' AND e.status <> 'cancelled' AND e.source_system <> 'manual'${only(ctx)}
         AND EXISTS (SELECT 1 FROM policy_registry r
                      WHERE r.tenant_id = e.tenant_id AND r.status = 'published' AND r.rule_contract LIKE 'sale.%'
                        AND (r.effective_from IS NULL OR r.effective_from <= e.doc_date) AND (r.effective_to IS NULL OR r.effective_to >= e.doc_date)
                        AND (jsonb_array_length(coalesce(r.scope->'branchCodes', '[]'::jsonb)) = 0 OR r.scope->'branchCodes' ? b.code)
                        AND (jsonb_array_length(coalesce(r.scope->'channels', '[]'::jsonb)) = 0 OR r.scope->'channels' ? coalesce(e.payload->>'channel', '')))`;
      const noRefs = `jsonb_array_length(CASE WHEN jsonb_typeof(e.payload->'policyRefs') = 'array' THEN e.payload->'policyRefs' ELSE '[]'::jsonb END) = 0`;
      const [n] = await ctx.db.query(`SELECT count(*)::int AS n ${eligible}`);
      const rows = await ctx.db.query(`
        SELECT t.code AS tenant, to_char(e.doc_date, 'YYYY-MM') AS period, e.source_system AS source,
               count(*)::int AS events, count(*) FILTER (WHERE ${noRefs})::int AS missing
          ${eligible}
         GROUP BY t.code, to_char(e.doc_date, 'YYYY-MM'), e.source_system
        HAVING count(*) FILTER (WHERE ${noRefs}) > 0
         ORDER BY 2 DESC, 1, 3 LIMIT ${LIMIT}`);
      return {
        examined: n?.n ?? 0, unitBy: 'key',
        findings: rows.map((r) => ctx.finding(null, null,
          `[${r.tenant}] ${r.period} · nguồn ${r.source}: ${r.missing}/${r.events} chứng từ bán không gửi policyRefs dù có chính sách bán hiệu lực (${pct(r.missing, r.events)})`,
          `${r.tenant}:${r.period}:${r.source}`)),
        notes: ['Nguồn "manual" (lập tay trong Core) không tính; chỉ xét miền bán vì chỉ miền này có Rule Contract.'],
        metrics: { code: 'POLICY_REFS_MISSING', truncated: rows.length >= LIMIT },
      };
    },
  },
  {
    ...meta, id: 'DG-POLICY-4', code: 'POLICY_EXPIRING_IN_USE',
    title: `Bản chính sách hết hạn trong ${SOON_DAYS} ngày tới mà ${RECENT_DAYS} ngày qua vẫn có sự việc tham chiếu — nguồn cần tải bản kế tiếp hoặc dừng áp`,
    async run(ctx) {
      if (!(await hasView(ctx))) return NO_VIEW;
      const soon = `r.status = 'published' AND r.effective_to IS NOT NULL AND r.effective_to BETWEEN current_date AND current_date + ${SOON_DAYS}`;
      const [n] = await ctx.db.query(`SELECT count(*)::int AS n FROM policy_registry r JOIN tenants t ON t.id = r.tenant_id WHERE ${soon}${only(ctx)}`);
      const rows = await ctx.db.query(`
        SELECT t.code AS tenant, r.policy_key, r.version, r.effective_to::text AS effective_to, u.events,
               (SELECT min(nx.version) FROM policy_registry nx WHERE nx.tenant_id = r.tenant_id AND nx.policy_id = r.policy_id AND nx.version > r.version AND nx.status = 'published') AS next_version
          FROM policy_registry r
          JOIN tenants t ON t.id = r.tenant_id
          CROSS JOIN LATERAL (
            SELECT count(DISTINCT a.event_id)::int AS events FROM bizcity_read.policy_application a
             WHERE a.tenant_id = r.tenant_id AND a.version = r.version AND a.status <> 'cancelled'
               AND (a.policy_id = r.policy_id OR (a.policy_id IS NULL AND a.policy_key = r.policy_key))
               AND a.doc_date >= current_date - ${RECENT_DAYS}) u
         WHERE ${soon}${only(ctx)} AND u.events > 0
         ORDER BY r.effective_to, t.code, r.policy_key LIMIT ${LIMIT}`);
      return {
        examined: n?.n ?? 0, unitBy: 'key',
        findings: rows.map((r) => ctx.finding(null, null,
          `[${r.tenant}] ${r.policy_key}@${r.version} hết hạn ${r.effective_to}, ${r.events} sự việc ${RECENT_DAYS} ngày qua còn tham chiếu — ${r.next_version ? `có bản kế tiếp @${r.next_version}: nguồn cần tải bản mới (tránh IN-POL-003)` : 'không có bản kế tiếp: sau ngày này tham chiếu sẽ ra IN-POL-002'}`,
          `${r.tenant}:${r.policy_key}@${r.version}`)),
        metrics: { code: 'POLICY_EXPIRING_IN_USE', truncated: rows.length >= LIMIT },
      };
    },
  },
  {
    ...meta, id: 'DG-POLICY-5', code: 'POLICY_PROMO_NOTICE',
    title: 'Khuyến mại thuộc diện thông báo Sở Công Thương (NĐ81/2018 Điều 17) có số thông báo — chưa đủ căn cứ, bỏ qua an toàn',
    async run() {
      // Chưa đủ căn cứ: phong bì policy_registry và tham số Rule Contract chưa có trường "số thông báo / văn bản xác nhận" nào, cũng
      // chưa có tiêu chí diện phải thông báo (địa bàn, tổng giá trị). Không suy từ legal_ref (chữ tự do) — không bịa kết quả.
      const why = 'chưa đủ căn cứ: sổ đăng ký chính sách chưa có trường số thông báo khuyến mại và tiêu chí diện phải thông báo (NĐ81 Điều 17)';
      return { skip: why, examined: 0, findings: [], notes: [why] };
    },
  },
];
