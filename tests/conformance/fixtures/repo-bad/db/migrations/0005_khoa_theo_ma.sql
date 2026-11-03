-- SC-ITEM-2 (mẫu sai): khoá ngoại theo mã hàng; thêm cột mã vào sổ sau khi đã có item_id.
ALTER TABLE ledger_lines ADD COLUMN item_id text;
ALTER TABLE ledger_lines ADD CONSTRAINT ledger_lines_sku_fk FOREIGN KEY (tenant_id, product_sku) REFERENCES products (tenant_id, sku);
ALTER TABLE inventory_movements ADD COLUMN lot_sku text;
-- Không tính: khoá ngoại theo item_id.
ALTER TABLE inventory_costs ADD CONSTRAINT inventory_costs_item_fk FOREIGN KEY (tenant_id, item_id) REFERENCES items (tenant_id, item_id);
