-- [2026-11-18 Nguyễn Văn Thủy] Gom bảng về lõi, đợt 2: ngưỡng duyệt cấp 2 của yêu cầu thanh toán về setting_values, bỏ payment_request_settings (đóng góp)
--
-- Bảng chỉ có một con số mỗi đơn vị → khoá cấu hình bizcity.payment.approval_thresholds trên kho chung setting_values
-- (phạm vi đơn vị, có phiên bản, ngày hiệu lực). Ngưỡng cũ áp từ 2000-01-01 để mọi chứng từ cũ tính như trước. 0 / không có = một cấp.

DO $$
DECLARE n_src bigint; n_dst bigint;
BEGIN
  IF to_regclass('payment_request_settings') IS NULL THEN RETURN; END IF;
  INSERT INTO setting_values (tenant_id, key, scope_type, scope_id, value, valid_from, version, reason, created_by, created_at)
  SELECT s.tenant_id, 'bizcity.payment.approval_thresholds', 'tenant', '', to_jsonb(round(s.second_level_from)::bigint), DATE '2000-01-01',
         COALESCE((SELECT max(v.version) FROM setting_values v WHERE v.tenant_id = s.tenant_id AND v.key = 'bizcity.payment.approval_thresholds' AND v.scope_type = 'tenant'), 0) + 1,
         'chuyển từ payment_request_settings (0159)', COALESCE(NULLIF(s.updated_by, ''), 'system'), COALESCE(s.updated_at, now())
    FROM payment_request_settings s
   WHERE s.second_level_from IS NOT NULL AND s.second_level_from > 0;
  SELECT count(*) INTO n_src FROM payment_request_settings WHERE second_level_from IS NOT NULL AND second_level_from > 0;
  SELECT count(DISTINCT tenant_id) INTO n_dst FROM setting_values WHERE key = 'bizcity.payment.approval_thresholds';
  IF n_dst < n_src THEN RAISE EXCEPTION '0159: chuyển payment_request_settings thiếu (% / %)', n_dst, n_src; END IF;
  DROP TABLE payment_request_settings;
END $$;
