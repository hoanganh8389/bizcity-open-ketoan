-- [2026-11-17 09:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-7 B5b (ADR-0034, RULE-LEDGER E3): xoá CẢ đơn vị Công ty Mẫu (tenants.is_sample) — tự kiểm is_sample trong giao dịch, đếm lại sau xoá
-- Gọi qua scripts/xoa-cong-ty-mau.sh (sao lưu + câu xác nhận trước). Chạy tay:
--   psql -v ON_ERROR_STOP=1 -v tenant=<mã đơn vị mẫu> < scripts/xoa-cong-ty-mau.sql      (vai trò superuser CSDL)
-- Một giao dịch. Đơn vị không phải is_sample → RAISE, không xoá dòng nào. Còn sót dòng của đơn vị sau khi xoá → RAISE, huỷ cả giao dịch.
-- Cơ chế E3: SET LOCAL session_replication_role = replica (tắt trigger sổ chỉ trong giao dịch này) — chỉ dùng ở đây và xoa-chung-tu.sh (SC-KERNEL-4).
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL session_replication_role = replica;
SELECT set_config('bizcity.purge_sample_code', :'tenant', true);

DO $$
DECLARE
  v_code text := current_setting('bizcity.purge_sample_code');
  tid bigint;
  r record;
  n bigint;
  total bigint := 0;
BEGIN
  SELECT id INTO tid FROM tenants WHERE tenants.code = v_code AND is_sample FOR UPDATE;
  IF tid IS NULL THEN
    RAISE EXCEPTION 'Không có Công ty Mẫu mã "%" — script chỉ xoá đơn vị is_sample (đơn vị thật: không bao giờ đi đường này)', v_code;
  END IF;

  -- bốn bảng con không có tenant_id: xoá theo bảng cha
  DELETE FROM accounting_event_versions v USING accounting_events e WHERE v.event_id = e.id AND e.tenant_id = tid;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM tax_invoice_lines l USING tax_invoices i WHERE l.tax_invoice_id = i.id AND i.tenant_id = tid;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM asset_allocations a USING assets s WHERE a.asset_id = s.id AND s.tenant_id = tid;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  DELETE FROM asset_depreciation_overrides o USING assets s WHERE o.asset_id = s.id AND s.tenant_id = tid;
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;

  -- mọi bảng có tenant_id (mọi schema của ứng dụng, gồm mod_*)
  FOR r IN
    SELECT c.table_schema AS s, c.table_name AS t
      FROM information_schema.columns c
      JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
     WHERE c.column_name = 'tenant_id' AND tb.table_type = 'BASE TABLE'
       AND c.table_schema NOT IN ('pg_catalog', 'information_schema')
       AND c.table_name <> 'tenants'
     ORDER BY 1, 2
  LOOP
    EXECUTE format('DELETE FROM %I.%I WHERE tenant_id = $1', r.s, r.t) USING tid;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE NOTICE '  % dòng  %.%', n, r.s, r.t; END IF;
    total := total + n;
  END LOOP;
  DELETE FROM tenants WHERE id = tid;

  -- đếm lại: còn dòng nào của đơn vị → huỷ cả giao dịch
  FOR r IN
    SELECT c.table_schema AS s, c.table_name AS t
      FROM information_schema.columns c
      JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
     WHERE c.column_name = 'tenant_id' AND tb.table_type = 'BASE TABLE' AND c.table_schema NOT IN ('pg_catalog', 'information_schema')
  LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I WHERE tenant_id = $1', r.s, r.t) INTO n USING tid;
    IF n > 0 THEN RAISE EXCEPTION 'Còn % dòng ở %.% sau khi xoá — huỷ', n, r.s, r.t; END IF;
  END LOOP;
  RAISE NOTICE 'Đã xoá Công ty Mẫu % (đơn vị %): % dòng', v_code, tid, total;
END $$;
COMMIT;
