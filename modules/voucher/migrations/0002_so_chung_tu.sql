-- Module voucher (phiếu NT-BH-033, docs/nghiep-vu/26): chiến dịch voucher vào sổ chứng từ chung (business_documents) bằng trigger gọi
-- public.bizcity_doc_put. Chạy bằng vai trò mod_voucher_owner trong schema mod_voucher: không tạo / sửa bảng Core, không thêm bảng.
-- Hàm lõi chạy SECURITY DEFINER và kiểm đơn vị của phiên (migration lõi 0167) nên trigger chạy được dưới vai trò mod_voucher_rw.
--   voucher.campaign:<campaign_id>  pricing.voucher  active → in_progress (quá hạn valid_to → done, status_raw expired) · stopped → cancelled
-- Chiến dịch không nộp chứng từ kế toán (tiền voucher đi trên chứng từ bán) nên không có liên kết ledger.
-- Bản chụp bỏ trạng thái, người / lúc sửa: ngừng / chạy lại không sinh phiên bản; sửa mệnh giá, hạn, điều kiện thì sinh.
-- "Quá hạn" tính lúc dòng được ghi (như chính sách mua 0166): chiến dịch hết hạn mà không ai sửa thì sổ vẫn ghi đang thực hiện tới lần ghi sau.
-- Nạp dữ liệu cũ bằng SELECT gọi hàm ghi (không UPDATE bảng nguồn).
-- [2026-11-19 Võ Hoàng] NGHIEM-THU — NT-BH-033: chiến dịch voucher vào sổ chứng từ chung (đóng góp)

CREATE OR REPLACE FUNCTION mod_voucher.doc_put_campaign(c mod_voucher.campaigns) RETURNS void
  LANGUAGE plpgsql SET search_path = mod_voucher, public, pg_temp AS $$
DECLARE
  v_raw text := CASE WHEN c.status = 'stopped' THEN 'stopped' WHEN c.valid_to IS NOT NULL AND c.valid_to < current_date THEN 'expired' ELSE c.status END;
BEGIN
  PERFORM public.bizcity_doc_put(c.tenant_id, 'voucher.campaign:' || c.campaign_id, 'voucher', 'pricing.voucher', c.code, c.valid_from, '',
    CASE WHEN c.issuer = 'brand' THEN COALESCE(c.issuer_partner_code, '') ELSE '' END,
    'Chiến dịch voucher', 0, v_raw,
    CASE v_raw WHEN 'stopped' THEN 'cancelled' WHEN 'expired' THEN 'done' ELSE 'in_progress' END,
    to_jsonb(c) - ARRAY['status', 'created_at', 'updated_at', 'updated_by'],
    jsonb_strip_nulls(jsonb_build_object('name', c.name, 'voucherKind', c.kind, 'issuer', c.issuer, 'faceValue', c.face_value,
      'validFrom', c.valid_from, 'validTo', c.valid_to, 'issueMode', c.issue_mode)),
    COALESCE(NULLIF(c.created_by_name, ''), c.created_by), c.created_at, c.updated_at, '', NULL);
END $$;
COMMENT ON FUNCTION mod_voucher.doc_put_campaign(mod_voucher.campaigns) IS 'NT-BH-033: ghi chiến dịch voucher vào sổ chứng từ chung (voucher.campaign:<campaign_id>, pricing.voucher).';

CREATE OR REPLACE FUNCTION mod_voucher.doc_sync_campaign() RETURNS trigger
  LANGUAGE plpgsql SET search_path = mod_voucher, public, pg_temp AS $$
BEGIN
  PERFORM mod_voucher.doc_put_campaign(NEW);
  RETURN NULL;
END $$;
COMMENT ON FUNCTION mod_voucher.doc_sync_campaign() IS 'NT-BH-033: trigger đồng bộ chiến dịch voucher vào sổ chứng từ chung.';

DROP TRIGGER IF EXISTS business_documents_sync ON mod_voucher.campaigns;
CREATE TRIGGER business_documents_sync AFTER INSERT OR UPDATE ON mod_voucher.campaigns FOR EACH ROW EXECUTE FUNCTION mod_voucher.doc_sync_campaign();
COMMENT ON TRIGGER business_documents_sync ON mod_voucher.campaigns IS 'NT-BH-033: mọi đường ghi chiến dịch voucher đều vào sổ chứng từ chung.';

-- Nạp dữ liệu cũ.
SELECT mod_voucher.doc_put_campaign(c) FROM mod_voucher.campaigns c ORDER BY c.created_at;
