-- [2026-11-10 06:30 PM Nguyễn Văn Thủy] PHASE-026 — quản lý theo lô xuyên suốt: lô theo số lô + hạn dùng của NCC, tên hàng lúc mua, phân lô tự động khi xuất (đóng góp)
-- =============================================================================
-- 0098 Lô hàng (docs/nghiep-vu/16-lo-hang.md).
--
--   item_lots          Một lô = (mặt hàng, số lô NCC, hạn dùng). Giữ TÊN HÀNG LÚC MUA (tên trên phiếu nhập / hoá đơn NCC lần đầu
--                      nhập lô) — kê khai bán ra theo tên này, kể cả khi danh mục đổi tên. Hàng không có số lô / hạn dùng gom
--                      vào một lô "không số" của mặt hàng.
--   inventory_lot_moves Mỗi dòng hàng vào / ra kho (inventory_movements) chia ra các lô: hàng vào → lô của dòng; hàng ra →
--                      lô của dòng nếu nguồn ghi, không thì tự động lô hết hạn sớm trước (rồi nhập trước); khách trả → về đúng lô
--                      đã xuất của phiếu bán gốc; chuyển kho → bên nhận nhận đúng các lô bên xuất đã xuất.
--                      Theo phiên bản chứng từ: dòng hàng ghi lại thì phân lô ghi lại (xoá theo inventory_movements).
--
--   Giá vốn vẫn bình quân tháng (inventory_costs) — lô không đổi giá vốn, chỉ theo dõi số lượng, hạn dùng, tên.
--   item_id xuyên suốt: lô và phân lô gắn item_id; mã (sku) chỉ là ảnh chụp lúc ghi.
-- =============================================================================

CREATE TABLE item_lots (
  id             bigserial   PRIMARY KEY,
  tenant_id      bigint      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_id        text,
  sku            text        NOT NULL,
  item_key       text        NOT NULL,
  lot_no         text        NOT NULL DEFAULT '',
  exp_date       date,
  mfg_date       date,
  purchase_name  text        NOT NULL DEFAULT '',
  purchase_unit  text        NOT NULL DEFAULT '',
  names_seen     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  partner_id     bigint,
  first_event_id bigint,
  first_doc_no   text        NOT NULL DEFAULT '',
  first_date     date,
  note           text        NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, item_id) REFERENCES items (tenant_id, item_id),
  CONSTRAINT item_lots_names_chk CHECK (jsonb_typeof(names_seen) = 'array')
);
CREATE UNIQUE INDEX item_lots_key ON item_lots (tenant_id, item_key, lot_no, COALESCE(exp_date, '0001-01-01'::date));
CREATE INDEX item_lots_exp ON item_lots (tenant_id, item_key, exp_date NULLS LAST, first_date);

COMMENT ON TABLE item_lots IS 'Lô hàng: mặt hàng + số lô NCC + hạn dùng; giữ tên hàng lúc mua để kê khai bán ra (0098).';
COMMENT ON COLUMN item_lots.id IS 'Khoá.';
COMMENT ON COLUMN item_lots.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN item_lots.item_id IS 'Định danh mặt hàng (xuyên suốt qua đổi mã).';
COMMENT ON COLUMN item_lots.sku IS 'Mã hàng lúc tạo lô (ảnh chụp).';
COMMENT ON COLUMN item_lots.item_key IS 'Khoá mặt hàng của lô: item_id, mặt hàng chưa có định danh thì "sku:<mã>".';
COMMENT ON COLUMN item_lots.lot_no IS 'Số lô của nhà cung cấp; trống = lô không số.';
COMMENT ON COLUMN item_lots.exp_date IS 'Hạn dùng; trống = không có hạn dùng.';
COMMENT ON COLUMN item_lots.mfg_date IS 'Ngày sản xuất (nếu có).';
COMMENT ON COLUMN item_lots.purchase_name IS 'Tên hàng lúc mua (trên phiếu nhập / hoá đơn NCC lần đầu nhập lô) — tên kê khai khi bán ra lô này.';
COMMENT ON COLUMN item_lots.purchase_unit IS 'Đơn vị tính lúc mua.';
COMMENT ON COLUMN item_lots.names_seen IS 'Các tên khác đã gặp khi nhập thêm cùng lô: [{name, docNo, date}].';
COMMENT ON COLUMN item_lots.partner_id IS 'Nhà cung cấp của lần nhập đầu.';
COMMENT ON COLUMN item_lots.first_event_id IS 'Chứng từ nhập đầu tiên tạo lô.';
COMMENT ON COLUMN item_lots.first_doc_no IS 'Số phiếu nhập đầu tiên.';
COMMENT ON COLUMN item_lots.first_date IS 'Ngày nhập đầu tiên (xếp nhập trước xuất trước khi cùng hạn).';
COMMENT ON COLUMN item_lots.note IS 'Ghi chú.';
COMMENT ON COLUMN item_lots.created_at IS 'Lúc tạo.';
COMMENT ON COLUMN item_lots.updated_at IS 'Lúc sửa gần nhất.';

CREATE TRIGGER item_lots_item_id BEFORE INSERT OR UPDATE OF sku ON item_lots FOR EACH ROW EXECUTE FUNCTION bizcity_config_item_id();

CREATE TABLE inventory_lot_moves (
  id             bigserial     PRIMARY KEY,
  tenant_id      bigint        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  movement_id    bigint        NOT NULL REFERENCES inventory_movements(id) ON DELETE CASCADE,
  event_id       bigint        NOT NULL,
  lot_id         bigint        NOT NULL REFERENCES item_lots(id),
  branch_id      bigint        NOT NULL,
  warehouse_code text          NOT NULL DEFAULT '',
  item_id        text,
  sku            text          NOT NULL,
  kind           text          NOT NULL,
  doc_date       date          NOT NULL,
  qty            numeric(18,4) NOT NULL,
  how            text          NOT NULL,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, item_id) REFERENCES items (tenant_id, item_id),
  CONSTRAINT inventory_lot_moves_how_chk CHECK (how IN ('line', 'fifo', 'return', 'transfer', 'shortage', 'nolot'))
);
CREATE INDEX inventory_lot_moves_stock ON inventory_lot_moves (tenant_id, lot_id, branch_id, warehouse_code);
CREATE INDEX inventory_lot_moves_event ON inventory_lot_moves (event_id);
CREATE INDEX inventory_lot_moves_movement ON inventory_lot_moves (movement_id);

COMMENT ON TABLE inventory_lot_moves IS 'Phân lô của từng dòng hàng vào / ra kho; tồn theo lô = cộng qty theo lô, chi nhánh, kho (0098).';
COMMENT ON COLUMN inventory_lot_moves.id IS 'Khoá.';
COMMENT ON COLUMN inventory_lot_moves.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN inventory_lot_moves.movement_id IS 'Dòng hàng vào / ra (inventory_movements) — ghi lại chứng từ thì phân lô ghi lại.';
COMMENT ON COLUMN inventory_lot_moves.event_id IS 'Chứng từ (accounting_events).';
COMMENT ON COLUMN inventory_lot_moves.lot_id IS 'Lô.';
COMMENT ON COLUMN inventory_lot_moves.branch_id IS 'Chi nhánh.';
COMMENT ON COLUMN inventory_lot_moves.warehouse_code IS 'Kho.';
COMMENT ON COLUMN inventory_lot_moves.item_id IS 'Định danh mặt hàng.';
COMMENT ON COLUMN inventory_lot_moves.sku IS 'Mã hàng lúc ghi.';
COMMENT ON COLUMN inventory_lot_moves.kind IS 'Loại hàng vào / ra như inventory_movements.kind.';
COMMENT ON COLUMN inventory_lot_moves.doc_date IS 'Ngày chứng từ.';
COMMENT ON COLUMN inventory_lot_moves.qty IS 'Số lượng: dương = vào lô, âm = ra lô.';
COMMENT ON COLUMN inventory_lot_moves.how IS 'Cách chọn lô: line (dòng ghi số lô), fifo (tự động hạn sớm / nhập trước), return (về lô đã bán), transfer (theo lô bên xuất), shortage (thiếu tồn lô — ghi vào lô không số), nolot (hàng vào không số lô).';
COMMENT ON COLUMN inventory_lot_moves.created_at IS 'Lúc ghi.';

ALTER TABLE item_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_lots FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON item_lots USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));
ALTER TABLE inventory_lot_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_lot_moves FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON inventory_lot_moves USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON item_lots, inventory_lot_moves TO ketoan_app;
    GRANT USAGE ON SEQUENCE item_lots_id_seq, inventory_lot_moves_id_seq TO ketoan_app;
  END IF;
END $$;
