-- [2026-11-09 10:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-17 (K3 thêm chặt, chữ chốt docs/phases/PHASE-004-MOT-CUA-GHI-SO/21-CHOT-VET-E2-CSDL-VA-E1.md §4, D004-15, Q004-4): E1 (điền giá vốn) đi qua hàm SECURITY DEFINER thay cho cờ phiên
-- =============================================================================
-- 0091 — E1 qua hàm: ứng dụng không còn sửa trực tiếp được số tiền của sổ cái
--
--   Trước: trigger guard_ledger_line_mutation (0006/0066) và nhánh (c) của guard_ledger_entry_mutation (0049) cho đổi debit / credit của dòng
--   giá vốn chờ (cost_fill) và total của bút toán khi giao dịch bật cờ phiên ketoan.cost_overwrite. Cờ do ỨNG DỤNG tự đặt nên bất kỳ phiên
--   ketoan_app nào đặt cờ rồi UPDATE được số tiền các dòng giá vốn, KHÔNG để lại dấu vết, miễn mỗi cặp vẫn cân.
--
--   Sau:
--     1. Vai trò NOLOGIN ketoan_ledger_cost là chủ của hai hàm SECURITY DEFINER (search_path cố định, không SQL động, EXECUTE chỉ cho ketoan_app):
--          ledger_fill_cost_lines(ids bigint[], debits numeric[], credits numeric[])   — đổi debit / credit của dòng cost_fill
--          ledger_fill_entry_totals(ids bigint[], deltas numeric[])                     — cộng delta vào total của bút toán
--        Mỗi hàm tự kiểm lại điều kiện (dòng cost_fill, bút toán posted, không đảo, số ≥ 0; số dòng sửa phải bằng số dòng nhận) và ghi MỘT dòng
--        audit_logs 'ledger.cost_fill' cho mỗi đơn vị với số dòng, tổng trước / sau.
--     2. Hai trigger bỏ điều kiện cờ phiên, thay bằng current_user = 'ketoan_ledger_cost' (trong hàm SECURITY DEFINER current_user là chủ hàm;
--        ứng dụng không đặt được). Cờ ketoan.cost_overwrite không còn tác dụng gì.
--     3. Thu quyền của ketoan_app: ledger_lines chỉ còn UPDATE (item_id) (bizcity_item_fill_refs điền định danh mặt hàng một lần, NULL → có giá trị);
--        ledger_entries chỉ còn UPDATE các cột trạng thái và thông tin đầu (không có total). Cột mới thêm về sau mặc nhiên KHÔNG sửa được.
--   Chưa được (ghi rõ): ketoan_app vẫn gọi được hàm với số tiền tuỳ ý cho các dòng cost_fill (bản chất của việc điền giá vốn); phạm vi thu hẹp từ
--   "mọi dòng, không dấu vết" xuống "chỉ dòng giá vốn chờ, có dấu vết".
--   Không đổi dữ liệu. Chỉ tiến (R-REL-5). Cần quyền tạo vai trò: nếu vai trò chưa có và người chạy không tạo được thì migration DỪNG (không để E1 hỏng ngầm).
-- =============================================================================

-- ── Vai trò chủ hàm ─────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_ledger_cost') THEN
    BEGIN
      CREATE ROLE ketoan_ledger_cost NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'Migration 0091 dừng: % không có quyền tạo vai trò ketoan_ledger_cost. Nhờ quản trị CSDL chạy: CREATE ROLE ketoan_ledger_cost NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; rồi chạy lại.', current_user;
    END;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO ketoan_ledger_cost;
GRANT SELECT ON public.ledger_lines, public.ledger_entries, public.audit_logs TO ketoan_ledger_cost;
GRANT UPDATE (debit, credit) ON public.ledger_lines TO ketoan_ledger_cost;
GRANT UPDATE (total) ON public.ledger_entries TO ketoan_ledger_cost;
GRANT INSERT ON public.audit_logs TO ketoan_ledger_cost;
GRANT USAGE ON SEQUENCE public.audit_logs_id_seq TO ketoan_ledger_cost;
-- Chuỗi băm nhật ký (0036) đọc dòng cuối của đơn vị và lấy khoá tư vấn: chỉ cần SELECT / INSERT ở trên.

-- ── Hàm 1: đổi số tiền dòng giá vốn chờ ──────────────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.ledger_fill_cost_lines(p_ids bigint[], p_debits numeric[], p_credits numeric[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
    AS $$
DECLARE
  v_n      integer;
  v_want   integer := coalesce(cardinality(p_ids), 0);
  v_before jsonb;
  v_after  jsonb;
  t        record;
BEGIN
  IF v_want = 0 THEN RETURN 0; END IF;
  IF p_debits IS NULL OR p_credits IS NULL OR cardinality(p_debits) <> v_want OR cardinality(p_credits) <> v_want THEN
    RAISE EXCEPTION 'ledger_fill_cost_lines: ba mảng phải cùng độ dài' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_ids) i WHERE i IS NULL) OR EXISTS (SELECT 1 FROM unnest(p_debits) d WHERE d IS NULL OR d < 0)
     OR EXISTS (SELECT 1 FROM unnest(p_credits) c WHERE c IS NULL OR c < 0) THEN
    RAISE EXCEPTION 'ledger_fill_cost_lines: id và số tiền không được rỗng hoặc âm' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF (SELECT count(DISTINCT i) FROM unnest(p_ids) i) <> v_want THEN
    RAISE EXCEPTION 'ledger_fill_cost_lines: id dòng trùng nhau' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT coalesce(jsonb_object_agg(x.tenant_id::text, jsonb_build_object('lines', x.n, 'debit', x.d, 'credit', x.c)), '{}'::jsonb) INTO v_before
    FROM (SELECT l.tenant_id, count(*) n, sum(l.debit) d, sum(l.credit) c FROM public.ledger_lines l WHERE l.id = ANY (p_ids) GROUP BY l.tenant_id) x;

  UPDATE public.ledger_lines l SET debit = v.debit, credit = v.credit
    FROM (SELECT * FROM unnest(p_ids, p_debits, p_credits) AS u(id, debit, credit)) v
   WHERE l.id = v.id AND l.cost_fill IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.ledger_entries e WHERE e.id = l.entry_id AND e.status = 'posted' AND NOT e.is_reversal);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> v_want THEN
    RAISE EXCEPTION 'ledger_fill_cost_lines: chỉ sửa được dòng giá vốn chờ của bút toán còn hiệu lực (nhận %, hợp lệ %)', v_want, v_n USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT coalesce(jsonb_object_agg(x.tenant_id::text, jsonb_build_object('lines', x.n, 'debit', x.d, 'credit', x.c)), '{}'::jsonb) INTO v_after
    FROM (SELECT l.tenant_id, count(*) n, sum(l.debit) d, sum(l.credit) c FROM public.ledger_lines l WHERE l.id = ANY (p_ids) GROUP BY l.tenant_id) x;

  FOR t IN SELECT key AS tenant FROM jsonb_each(v_before) LOOP
    INSERT INTO public.audit_logs (tenant_id, actor, actor_kind, actor_via, module_id, action, object_type, object_id, before_data, after_data)
    VALUES (t.tenant::bigint, session_user, 'system', 'db-function', 'kernel', 'ledger.cost_fill', 'ledger_lines', NULL,
            v_before -> t.tenant,
            (v_after -> t.tenant) || jsonb_build_object('_txid', pg_current_xact_id()::text, '_function', 'ledger_fill_cost_lines'));
  END LOOP;
  RETURN v_n;
END $$;

COMMENT ON FUNCTION public.ledger_fill_cost_lines(bigint[], numeric[], numeric[]) IS 'E1 (0091): đổi debit / credit của dòng giá vốn chờ (cost_fill) của bút toán posted không đảo; chủ hàm ketoan_ledger_cost là điều kiện để trigger cho qua; ghi audit_logs ledger.cost_fill.';

-- ── Hàm 2: cộng chênh lệch vào tổng tiền bút toán ────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.ledger_fill_entry_totals(p_ids bigint[], p_deltas numeric[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
    AS $$
DECLARE
  v_n      integer;
  v_want   integer := coalesce(cardinality(p_ids), 0);
  v_before jsonb;
  v_after  jsonb;
  t        record;
BEGIN
  IF v_want = 0 THEN RETURN 0; END IF;
  IF p_deltas IS NULL OR cardinality(p_deltas) <> v_want THEN
    RAISE EXCEPTION 'ledger_fill_entry_totals: hai mảng phải cùng độ dài' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_ids) i WHERE i IS NULL) OR EXISTS (SELECT 1 FROM unnest(p_deltas) d WHERE d IS NULL) THEN
    RAISE EXCEPTION 'ledger_fill_entry_totals: id và chênh lệch không được rỗng' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF (SELECT count(DISTINCT i) FROM unnest(p_ids) i) <> v_want THEN
    RAISE EXCEPTION 'ledger_fill_entry_totals: id bút toán trùng nhau' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT coalesce(jsonb_object_agg(x.tenant_id::text, jsonb_build_object('entries', x.n, 'total', x.s)), '{}'::jsonb) INTO v_before
    FROM (SELECT e.tenant_id, count(*) n, sum(e.total) s FROM public.ledger_entries e WHERE e.id = ANY (p_ids) GROUP BY e.tenant_id) x;

  UPDATE public.ledger_entries e SET total = e.total + v.delta
    FROM (SELECT * FROM unnest(p_ids, p_deltas) AS u(id, delta)) v
   WHERE e.id = v.id AND e.status = 'posted' AND NOT e.is_reversal AND e.total + v.delta >= 0;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> v_want THEN
    RAISE EXCEPTION 'ledger_fill_entry_totals: chỉ sửa được tổng của bút toán còn hiệu lực và không để âm (nhận %, hợp lệ %)', v_want, v_n USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT coalesce(jsonb_object_agg(x.tenant_id::text, jsonb_build_object('entries', x.n, 'total', x.s)), '{}'::jsonb) INTO v_after
    FROM (SELECT e.tenant_id, count(*) n, sum(e.total) s FROM public.ledger_entries e WHERE e.id = ANY (p_ids) GROUP BY e.tenant_id) x;

  FOR t IN SELECT key AS tenant FROM jsonb_each(v_before) LOOP
    INSERT INTO public.audit_logs (tenant_id, actor, actor_kind, actor_via, module_id, action, object_type, object_id, before_data, after_data)
    VALUES (t.tenant::bigint, session_user, 'system', 'db-function', 'kernel', 'ledger.cost_fill', 'ledger_entries', NULL,
            v_before -> t.tenant,
            (v_after -> t.tenant) || jsonb_build_object('_txid', pg_current_xact_id()::text, '_function', 'ledger_fill_entry_totals'));
  END LOOP;
  RETURN v_n;
END $$;

COMMENT ON FUNCTION public.ledger_fill_entry_totals(bigint[], numeric[]) IS 'E1 (0091): cộng chênh lệch vào total của bút toán posted không đảo (không để âm); chủ hàm ketoan_ledger_cost; ghi audit_logs ledger.cost_fill.';

ALTER FUNCTION public.ledger_fill_cost_lines(bigint[], numeric[], numeric[]) OWNER TO ketoan_ledger_cost;
ALTER FUNCTION public.ledger_fill_entry_totals(bigint[], numeric[]) OWNER TO ketoan_ledger_cost;
REVOKE ALL ON FUNCTION public.ledger_fill_cost_lines(bigint[], numeric[], numeric[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ledger_fill_entry_totals(bigint[], numeric[]) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT EXECUTE ON FUNCTION public.ledger_fill_cost_lines(bigint[], numeric[], numeric[]) TO ketoan_app;
    GRANT EXECUTE ON FUNCTION public.ledger_fill_entry_totals(bigint[], numeric[]) TO ketoan_app;
  END IF;
END $$;

-- ── Trigger dòng: giữ nguyên mọi điều kiện, thay cờ phiên bằng chủ hàm ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_ledger_line_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- 0066 (B2b): gắn định danh mặt hàng cho dòng đã ghi — chỉ từ NULL → có giá trị, mọi cột khác giữ nguyên.
  IF TG_OP = 'UPDATE' AND OLD.item_id IS NULL AND NEW.item_id IS NOT NULL
     AND (to_jsonb(NEW) - 'item_id') = (to_jsonb(OLD) - 'item_id') THEN
    RETURN NEW;
  END IF;
  -- 0091 (E1): điền giá vốn chỉ qua hàm ledger_fill_cost_lines (chủ hàm ketoan_ledger_cost); cờ phiên cũ không còn tác dụng.
  IF TG_OP = 'UPDATE'
     AND current_user = 'ketoan_ledger_cost'
     AND OLD.cost_fill IS NOT NULL AND NEW.cost_fill IS NOT DISTINCT FROM OLD.cost_fill
     AND NEW.entry_id = OLD.entry_id AND NEW.tenant_id = OLD.tenant_id AND NEW.branch_id = OLD.branch_id
     AND NEW.posting_date = OLD.posting_date AND NEW.line_no = OLD.line_no AND NEW.pair_no = OLD.pair_no
     AND NEW.account_code = OLD.account_code AND NEW.part = OLD.part
     AND NEW.partner_id IS NOT DISTINCT FROM OLD.partner_id AND NEW.product_sku IS NOT DISTINCT FROM OLD.product_sku
     AND NEW.item_id IS NOT DISTINCT FROM OLD.item_id
     AND NEW.debit >= 0 AND NEW.credit >= 0
     AND EXISTS (SELECT 1 FROM ledger_entries e WHERE e.id = OLD.entry_id AND e.status = 'posted' AND NOT e.is_reversal)
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Sổ cái chỉ được thêm. Hãy ghi bút toán đảo thay vì sửa hoặc xoá.'
    USING ERRCODE = 'insufficient_privilege';
END $$;

-- ── Trigger bút toán: nhánh (c) đổi điều kiện cờ phiên → chủ hàm ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_ledger_entry_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     -- định danh, nguồn, kỳ, ngày, chi nhánh, chiều đảo, dấu vân tay thân, chính sách: không bao giờ đổi
     AND NEW.id = OLD.id AND NEW.tenant_id = OLD.tenant_id AND NEW.branch_id = OLD.branch_id
     AND NEW.period_id IS NOT DISTINCT FROM OLD.period_id AND NEW.entry_no = OLD.entry_no AND NEW.doc_type = OLD.doc_type
     AND NEW.event_id IS NOT DISTINCT FROM OLD.event_id AND NEW.doc_date IS NOT DISTINCT FROM OLD.doc_date
     AND NEW.posting_date = OLD.posting_date AND NEW.is_reversal = OLD.is_reversal
     AND NEW.reverses_entry_id IS NOT DISTINCT FROM OLD.reverses_entry_id
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by AND NEW.created_at = OLD.created_at
     AND NEW.body_hash IS NOT DISTINCT FROM OLD.body_hash AND NEW.policy_version IS NOT DISTINCT FROM OLD.policy_version
  THEN
    -- (a) đảo: chỉ trạng thái posted → reversed
    IF OLD.status = 'posted' AND NEW.status = 'reversed'
       AND NEW.total = OLD.total AND NEW.doc_no IS NOT DISTINCT FROM OLD.doc_no
       AND NEW.invoice_no IS NOT DISTINCT FROM OLD.invoice_no AND NEW.reason_code IS NOT DISTINCT FROM OLD.reason_code
       AND NEW.partner_id IS NOT DISTINCT FROM OLD.partner_id AND NEW.description IS NOT DISTINCT FROM OLD.description
       AND NEW.content_hash IS NOT DISTINCT FROM OLD.content_hash AND NEW.event_version IS NOT DISTINCT FROM OLD.event_version
    THEN
      RETURN NEW;
    END IF;
    -- (b) E2: thông tin đầu, tiền và trạng thái giữ nguyên
    IF OLD.status = 'posted' AND NEW.status = 'posted' AND NEW.total = OLD.total THEN
      RETURN NEW;
    END IF;
    -- (c) E1: điền giá vốn đổi tổng tiền, mọi thông tin đầu giữ nguyên — chỉ qua hàm ledger_fill_entry_totals (chủ hàm ketoan_ledger_cost)
    IF current_user = 'ketoan_ledger_cost'
       AND OLD.status = 'posted' AND NEW.status = 'posted' AND NOT OLD.is_reversal AND NEW.total >= 0
       AND NEW.doc_no IS NOT DISTINCT FROM OLD.doc_no AND NEW.invoice_no IS NOT DISTINCT FROM OLD.invoice_no
       AND NEW.reason_code IS NOT DISTINCT FROM OLD.reason_code AND NEW.partner_id IS NOT DISTINCT FROM OLD.partner_id
       AND NEW.description IS NOT DISTINCT FROM OLD.description AND NEW.content_hash IS NOT DISTINCT FROM OLD.content_hash
       AND NEW.event_version IS NOT DISTINCT FROM OLD.event_version
    THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'Sổ cái chỉ được thêm. Hãy ghi bút toán đảo thay vì sửa hoặc xoá bút toán.'
    USING ERRCODE = 'insufficient_privilege';
END $$;

-- ── Thu quyền của ketoan_app ──────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    REVOKE UPDATE ON public.ledger_lines FROM ketoan_app;
    GRANT UPDATE (item_id) ON public.ledger_lines TO ketoan_app; -- bizcity_item_fill_refs (0066)
    REVOKE UPDATE ON public.ledger_entries FROM ketoan_app;
    GRANT UPDATE (status, doc_no, invoice_no, reason_code, partner_id, description, content_hash, event_version, partner_name, partner_attr_id)
      ON public.ledger_entries TO ketoan_app; -- đảo (status) + chín cột đầu của E2; KHÔNG có total
  END IF;
END $$;

-- ── Tự kiểm ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['ledger_fill_cost_lines', 'ledger_fill_entry_totals'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
                    WHERE p.proname = f AND p.pronamespace = 'public'::regnamespace AND p.prosecdef AND r.rolname = 'ketoan_ledger_cost'
                      AND p.proconfig::text LIKE '%search_path%') THEN
      RAISE EXCEPTION 'Migration 0091 dừng: hàm % phải SECURITY DEFINER, chủ ketoan_ledger_cost, có search_path cố định', f;
    END IF;
  END LOOP;
  IF pg_get_functiondef('public.guard_ledger_line_mutation'::regproc) LIKE '%cost_overwrite%'
     OR pg_get_functiondef('public.guard_ledger_entry_mutation'::regproc) LIKE '%cost_overwrite%' THEN
    RAISE EXCEPTION 'Migration 0091 dừng: trigger sổ cái còn nhắc cờ phiên cost_overwrite';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    IF has_column_privilege('ketoan_app', 'public.ledger_lines', 'debit', 'UPDATE') OR has_column_privilege('ketoan_app', 'public.ledger_lines', 'credit', 'UPDATE')
       OR has_column_privilege('ketoan_app', 'public.ledger_entries', 'total', 'UPDATE') THEN
      RAISE EXCEPTION 'Migration 0091 dừng: ketoan_app còn UPDATE được số tiền sổ cái';
    END IF;
  END IF;
END $$;
