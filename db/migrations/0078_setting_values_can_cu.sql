-- [2026-11-06 04:07 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-43 (bizcity_settings@1 1.2.0-draft §2.1): căn cứ pháp lý của từng phiên bản cấu hình — chữ chốt docs/contracts/BIZCITY-SETTINGS-MATRIX-v1.md
-- =============================================================================
-- 0078 setting_values.basis: căn cứ (văn bản, điều, khoản, điểm, đường dẫn, ngày hiệu lực văn bản) của MỘT phiên bản cấu hình.
--   Tuỳ chọn, kể cả khoá loại A (D030-12: một người có quyền đổi thẳng, chỉ ghi nhật ký; thiếu căn cứ chỉ nhắc ở màn HT13).
--   Chỉ thêm cột, không đổi dòng nào: bảng vẫn chỉ-thêm (trigger chặn UPDATE / DELETE / TRUNCATE giữ nguyên).
-- =============================================================================

ALTER TABLE setting_values
  ADD COLUMN basis jsonb CHECK (basis IS NULL OR jsonb_typeof(basis) = 'object');

COMMENT ON COLUMN setting_values.basis IS 'Căn cứ của phiên bản này: { doc, article?, clause?, point?, url?, effectiveFrom? } (bizcity_settings@1 1.2.0). Rỗng = chưa khai căn cứ; không bắt buộc.';
