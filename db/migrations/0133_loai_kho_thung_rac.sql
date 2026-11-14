-- [2026-11-13 Nguyễn Văn Thủy] Loại kho có thùng rác: Xoá = chuyển vào thùng rác (vẫn trong CSDL), khôi phục / xoá vĩnh viễn ở thùng rác (đóng góp)
--
-- deleted_at / deleted_by: thời điểm, người chuyển vào thùng rác. Loại trong thùng rác coi như ngừng dùng (is_active = false):
-- không hiện ở danh sách, không chọn được cho kho / nghiệp vụ. Khôi phục: bỏ deleted_at, dùng lại. Xoá vĩnh viễn: xoá dòng
-- (nhật ký ghi đủ nội dung). Chứng từ, bút toán đã ghi với kho thuộc loại đó giữ nguyên.

ALTER TABLE warehouse_types ADD COLUMN deleted_at timestamptz;
ALTER TABLE warehouse_types ADD COLUMN deleted_by text NOT NULL DEFAULT '';
COMMENT ON COLUMN warehouse_types.deleted_at IS 'Thời điểm chuyển vào thùng rác (0133); NULL = đang dùng. Thùng rác: khôi phục hoặc xoá vĩnh viễn.';
COMMENT ON COLUMN warehouse_types.deleted_by IS 'Người chuyển vào thùng rác (0133).';
