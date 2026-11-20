-- Module loyalty (phiếu NT-BH-033, docs/nghiep-vu/26): chương trình tích điểm vào sổ chứng từ chung (business_documents) bằng trigger
-- gọi public.bizcity_doc_put. Chạy bằng vai trò mod_loyalty_owner trong schema mod_loyalty: không tạo / sửa bảng Core, không thêm bảng.
-- Hàm lõi chạy SECURITY DEFINER và kiểm đơn vị của phiên (migration lõi 0167) nên trigger chạy được dưới vai trò mod_loyalty_rw.
--   loyalty.program:<chi nhánh>:<bản>  pricing.loyalty  bản đang dùng (nhận sau cùng của chi nhánh) → in_progress (status_raw current)
--                                                       · bản cũ → done (status_raw superseded)
-- Mỗi bản là một chứng từ (bảng chỉ thêm bản mới); nhận bản mới thì bản đang dùng trước đó chuyển done — không sinh phiên bản vì nội
-- dung không đổi. Không có liên kết ledger (điểm chỉ hạch toán lúc đổi, trên chứng từ bán).
-- Nạp dữ liệu cũ bằng SELECT gọi hàm ghi (không UPDATE bảng nguồn).
-- [2026-11-19 Võ Hoàng] NGHIEM-THU — NT-BH-033: chương trình tích điểm vào sổ chứng từ chung (đóng góp)

CREATE OR REPLACE FUNCTION mod_loyalty.doc_put_program(p mod_loyalty.programs) RETURNS void
  LANGUAGE plpgsql SET search_path = mod_loyalty, public, pg_temp AS $$
DECLARE
  v_current boolean := NOT EXISTS (
    SELECT 1 FROM mod_loyalty.programs x
     WHERE x.tenant_id = p.tenant_id AND x.branch_code = p.branch_code AND x.version <> p.version
       AND (x.received_at, x.version) > (p.received_at, p.version));
BEGIN
  PERFORM public.bizcity_doc_put(p.tenant_id,
    'loyalty.program:' || regexp_replace(p.branch_code, '\s', '_', 'g') || ':' || regexp_replace(p.version, '\s', '_', 'g'),
    'loyalty', 'pricing.loyalty', p.version, (p.received_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, p.branch_code, '',
    'Chương trình tích điểm', 0,
    CASE WHEN v_current THEN 'current' ELSE 'superseded' END,
    CASE WHEN v_current THEN 'in_progress' ELSE 'done' END,
    to_jsonb(p) - ARRAY['received_at'],
    jsonb_strip_nulls(jsonb_build_object('storeId', NULLIF(p.store_id, 0), 'name', p.program ->> 'name')),
    p.received_by, p.received_at, p.received_at, '', NULL);
END $$;
COMMENT ON FUNCTION mod_loyalty.doc_put_program(mod_loyalty.programs) IS 'NT-BH-033: ghi một bản chương trình tích điểm vào sổ chứng từ chung (loyalty.program:<chi nhánh>:<bản>, pricing.loyalty): bản nhận sau cùng của chi nhánh = in_progress, bản cũ = done.';

CREATE OR REPLACE FUNCTION mod_loyalty.doc_sync_program() RETURNS trigger
  LANGUAGE plpgsql SET search_path = mod_loyalty, public, pg_temp AS $$
DECLARE
  r mod_loyalty.programs;
BEGIN
  -- Ghi mọi bản của chi nhánh: bản mới → đang dùng, bản đang dùng trước đó → done (bản không đổi thì hàm ghi không chạm sổ).
  FOR r IN SELECT * FROM mod_loyalty.programs x WHERE x.tenant_id = NEW.tenant_id AND x.branch_code = NEW.branch_code LOOP
    PERFORM mod_loyalty.doc_put_program(r);
  END LOOP;
  RETURN NULL;
END $$;
COMMENT ON FUNCTION mod_loyalty.doc_sync_program() IS 'NT-BH-033: trigger đồng bộ chương trình tích điểm của chi nhánh vào sổ chứng từ chung.';

DROP TRIGGER IF EXISTS business_documents_sync ON mod_loyalty.programs;
CREATE TRIGGER business_documents_sync AFTER INSERT OR UPDATE ON mod_loyalty.programs FOR EACH ROW EXECUTE FUNCTION mod_loyalty.doc_sync_program();
COMMENT ON TRIGGER business_documents_sync ON mod_loyalty.programs IS 'NT-BH-033: mọi bản chương trình tích điểm nhận về đều vào sổ chứng từ chung.';

-- Nạp dữ liệu cũ.
SELECT mod_loyalty.doc_put_program(p) FROM mod_loyalty.programs p ORDER BY p.received_at;
