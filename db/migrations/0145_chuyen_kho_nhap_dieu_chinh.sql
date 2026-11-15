-- [2026-11-15 Nguyễn Văn Thủy] Phiếu chuyển kho: nháp → duyệt xuất; sửa sau duyệt bằng bản điều chỉnh; lưu vết phiếu điện tử (đóng góp)
--
-- status thêm 'draft' (nháp — chưa trừ tồn, chưa vào sổ). Duyệt xuất = 'shipped' (như cũ: ghi đầu xuất).
-- adjust       Đang điều chỉnh phiếu đã duyệt xuất: { reason, by, at, both, confirmedBy?, confirmedAt?, snapshot }.
--              both = phiếu đã nhận → điều chỉnh cả hai đầu, cần bên nhận xác nhận trước khi duyệt.
--              Đang điều chỉnh: đầu nhận bị khoá nhận; sổ giữ bản đã duyệt cho tới khi duyệt điều chỉnh.
-- adjustments  Lịch sử các lần điều chỉnh đã duyệt và biên bản chênh lệch nhận (mảng).
-- einvoice     Phiếu xuất kho kiêm vận chuyển nội bộ điện tử đã phát hành: { no, serial, date } (khung liên kết; cách lập
--              thay thế / điều chỉnh theo quy định do kế toán xác nhận).

ALTER TABLE stock_transfer_docs DROP CONSTRAINT IF EXISTS stock_transfer_docs_status_chk;
ALTER TABLE stock_transfer_docs ADD CONSTRAINT stock_transfer_docs_status_chk CHECK (status IN ('draft', 'shipped', 'received', 'rejected', 'cancelled'));
ALTER TABLE stock_transfer_docs ADD COLUMN IF NOT EXISTS adjust jsonb;
ALTER TABLE stock_transfer_docs ADD COLUMN IF NOT EXISTS adjustments jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE stock_transfer_docs ADD COLUMN IF NOT EXISTS einvoice jsonb;

COMMENT ON COLUMN stock_transfer_docs.status IS 'draft nháp · shipped đã duyệt xuất, chờ nhận · received đã nhận · rejected bên nhận từ chối (trả tồn) · cancelled đã huỷ.';
COMMENT ON COLUMN stock_transfer_docs.adjust IS 'Đang điều chỉnh phiếu đã duyệt xuất (lý do, người lập, cả hai đầu?, xác nhận bên nhận, bản chụp); trống = không điều chỉnh (0145).';
COMMENT ON COLUMN stock_transfer_docs.adjustments IS 'Lịch sử điều chỉnh đã duyệt và biên bản chênh lệch nhận (0145).';
COMMENT ON COLUMN stock_transfer_docs.einvoice IS 'Phiếu xuất kho kiêm vận chuyển nội bộ điện tử đã phát hành {no, serial, date} (0145).';
