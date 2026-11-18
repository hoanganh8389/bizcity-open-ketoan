-- [2026-11-17 Nguyễn Văn Thủy] Bảng giá vốn đủ cột + nhập Excel là ĐGBQ ĐẦU KỲ (đóng góp)
--
-- detail (jsonb) mỗi dòng giá vốn tháng / lần tính, theo dòng chảy trong kỳ (số lượng dương, giá trị theo đơn giá nguồn):
--   openingUnit        ĐGBQ đầu kỳ (= tồn đầu $ / SL, hoặc giá nhập Excel)      importUnit  ĐGBQ đầu kỳ nhập từ Excel (nếu có)
--   purchaseQty/Value  Nhập mua NCC (giá Net)        returnQty/Value   Xuất trả NCC (giá trị đưa vào công thức)
--   adjInQty/Value     Nhập điều chỉnh tính giá      tInQty/tInValue   Nhập nội bộ (khác chi nhánh có giá; cùng chi nhánh chỉ SL)
--   tOutQty            Xuất nội bộ                   saleQty           Xuất bán      saleReturnQty  Nhập trả (khách trả)
--   adjOutQty          Xuất điều chỉnh               periodUnit        ĐGBQ trong kỳ (nhập trong kỳ $ / SL)
--   lastPurchaseUnit   Giá nhập lần cuối (đến hết kỳ)
-- cost_source = 'import': ĐGBQ đầu kỳ lấy theo tệp Excel (đơn giá cuối kỳ vẫn bình quân với chứng từ trong tháng).

ALTER TABLE inventory_costs ADD COLUMN IF NOT EXISTS detail jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN inventory_costs.detail IS 'Chi tiết dòng chảy trong kỳ và ĐGBQ đầu kỳ / trong kỳ / giá nhập lần cuối (0152).';
ALTER TABLE costing_run_lines ADD COLUMN IF NOT EXISTS detail jsonb NOT NULL DEFAULT '{}'::jsonb;
