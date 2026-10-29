-- 0024 Phần tồn quà khuyến mại người tiêu dùng (giá 0) trong cùng mã hàng: nhập kèm phiếu mua (inventory_movements.exclude_cost),
--      xuất tặng khách (dòng bán hàng tặng) lấy từ phần này trước với giá vốn 0; hết phần quà mới lấy hàng thường theo đơn giá.
--      Giá trị tồn cuối = (tồn cuối − tồn quà) × đơn giá → tổng giá vốn khớp đúng tiền đã trả NCC.
ALTER TABLE inventory_costs ADD COLUMN IF NOT EXISTS gift_qty numeric(18,4) NOT NULL DEFAULT 0;
COMMENT ON COLUMN inventory_costs.gift_qty IS 'Tồn cuối tháng phần quà KM người tiêu dùng (giá 0) nằm trong closing_qty; không có giá trị, không vào đơn giá.';
