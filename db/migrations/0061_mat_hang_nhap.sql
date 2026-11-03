-- [2026-11-03 12:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-28 (ADR-0019, R-GATE-3 / R-GATE-6): mặt hàng NHÁP — khai báo còn lỗi chặn thì lưu nháp, chưa dùng được trên chứng từ
-- =============================================================================
-- 0061 Mặt hàng nháp (Gate A của hai cổng kiểm chuẩn).
--      Lưu mặt hàng khi khai báo còn lỗi chặn (thiếu đơn vị tính gốc, thiếu nhóm hạch toán mà đơn vị không có nhóm mặc định):
--      không mất bản khai, nhưng mặt hàng chưa kích hoạt — cửa nạp từ chối chứng từ có mặt hàng nháp (IN-ITEM-009), ô chọn mặt
--      hàng của phiếu không hiện nháp. Sửa hết lỗi chặn → tự kích hoạt (is_draft = false), chứng từ ở bể chờ được kiểm lại.
--      Trạng thái: nháp (is_draft) · đang dùng (is_active, không nháp) · ngừng (is_active = false).
--      Bước trung gian trước bảng items của Item Master (ADR-0017): khi có items, cờ này chuyển thành items.status.
-- =============================================================================

ALTER TABLE products ADD COLUMN is_draft boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN draft_codes text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN products.is_draft IS 'Mặt hàng nháp (0061): khai báo còn lỗi chặn của Gate A; chưa dùng được trên chứng từ (IN-ITEM-009), không hiện ở ô chọn của phiếu.';
COMMENT ON COLUMN products.draft_codes IS 'Mã lỗi chặn khiến mặt hàng còn nháp (ITEM-BLOCK-*), lần lưu gần nhất (0061).';
