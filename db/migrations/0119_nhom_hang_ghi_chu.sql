-- [2026-11-12 Nguyễn Văn Thủy] nhóm hàng: ghi chú (đóng góp)
-- 0119 item_classes.note: ghi chú của nhóm. Không chạm sổ.
ALTER TABLE item_classes ADD COLUMN note text NOT NULL DEFAULT '';
