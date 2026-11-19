-- Giao hàng cho đơn đặt hàng + copy đơn (module phieu-ban, phiếu NT-BH-032): thông tin giao trên đơn (người nhận, SĐT, địa chỉ, phí ship
-- thu khách, hãng, mã vận đơn, COD), chuyến giao (Chờ lấy → Đang giao → Đã giao | Hoàn) ghi sổ hai bước qua kho KHG "Kho hàng gửi bán"
-- bằng chứng từ chuyển kho sẵn có, đơn copy ghi số gốc. Chạy bằng vai trò mod_phieu_ban_owner trong schema mod_phieu_ban; không chạm bảng Core.
-- [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-032: thông tin giao, chuyến giao, copy đơn (đóng góp)

ALTER TABLE orders ADD COLUMN ship_receiver text;
ALTER TABLE orders ADD COLUMN ship_phone    text;
ALTER TABLE orders ADD COLUMN ship_address  text;
ALTER TABLE orders ADD COLUMN ship_fee      numeric(18,2) NOT NULL DEFAULT 0 CHECK (ship_fee >= 0);
ALTER TABLE orders ADD COLUMN carrier_code  text;
ALTER TABLE orders ADD COLUMN tracking_no   text;
ALTER TABLE orders ADD COLUMN cod_amount    numeric(18,2) NOT NULL DEFAULT 0 CHECK (cod_amount >= 0);
ALTER TABLE orders ADD COLUMN copied_from   text;
COMMENT ON COLUMN orders.ship_receiver IS 'Người nhận hàng (NT-BH-032 Q1); trống = khách của đơn.';
COMMENT ON COLUMN orders.ship_phone IS 'Số điện thoại người nhận — dữ liệu cá nhân (STD-DATA-10).';
COMMENT ON COLUMN orders.ship_address IS 'Địa chỉ giao — dữ liệu cá nhân (STD-DATA-10).';
COMMENT ON COLUMN orders.ship_fee IS 'Phí ship thu khách (gồm thuế, đồng) — mặc định của chuyến giao đầu tiên; thành dòng dịch vụ (mã khai ở BH17) trên phiếu bán của chuyến.';
COMMENT ON COLUMN orders.carrier_code IS 'Hãng vận chuyển: SELF = tự giao, hoặc mã hãng (vd GHN) — chọn hình thức thanh toán "COD — <hãng>" theo cấu hình bizcity.phieu_ban.cod_methods.';
COMMENT ON COLUMN orders.tracking_no IS 'Mã vận đơn của hãng (nhập tay — chưa nối API hãng).';
COMMENT ON COLUMN orders.cod_amount IS 'Tiền thu hộ (COD) hãng thu của khách (đồng) — mặc định của chuyến giao đầu tiên; thành dòng thanh toán COD trên phiếu bán (phải thu hãng).';
COMMENT ON COLUMN orders.copied_from IS 'Đơn copy từ đâu: order:<số đơn> / sale:<số phiếu BH10> / pos:<mã đơn máy bán>; trống = lập mới. Giá + khuyến mại tính lại lúc copy.';

CREATE TABLE order_shipments (
  shipment_id         uuid          NOT NULL PRIMARY KEY,
  tenant_id           bigint        NOT NULL,
  order_id            uuid          NOT NULL REFERENCES orders (order_id),
  seq                 integer       NOT NULL CHECK (seq >= 1),
  status              text          NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'shipping', 'delivered', 'returned')),
  carrier_code        text,
  tracking_no         text,
  ship_fee            numeric(18,2) NOT NULL DEFAULT 0 CHECK (ship_fee >= 0),
  cod_amount          numeric(18,2) NOT NULL DEFAULT 0 CHECK (cod_amount >= 0),
  ship_warehouse_code text,
  lines               jsonb         NOT NULL,
  sale_doc_id         uuid,
  sale_doc_no         text,
  log                 jsonb         NOT NULL DEFAULT '[]'::jsonb,
  created_by          text          NOT NULL,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_by          text          NOT NULL,
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT order_shipments_seq_unique UNIQUE (tenant_id, order_id, seq)
);
CREATE INDEX order_shipments_order ON order_shipments (tenant_id, order_id, seq);
CREATE INDEX order_shipments_doc ON order_shipments (tenant_id, sale_doc_id) WHERE sale_doc_id IS NOT NULL;
ALTER TABLE order_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_shipments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON order_shipments USING (public.bizcity_tenant_visible(tenant_id)) WITH CHECK (public.bizcity_tenant_visible(tenant_id));
COMMENT ON TABLE order_shipments IS 'Chuyến giao của đơn đặt hàng (NT-BH-032): Chờ lấy hàng → Đang giao (chứng từ chuyển kho KCB → KHG) → Đã giao (phiếu bán BH10 nháp xuất từ KHG, dòng phí ship, thanh toán COD) | Hoàn (chuyển kho KHG → KCB). Không bút toán tiền ở module.';
COMMENT ON COLUMN order_shipments.shipment_id IS 'Định danh chuyến (uuid).';
COMMENT ON COLUMN order_shipments.tenant_id IS 'Đơn vị (RLS).';
COMMENT ON COLUMN order_shipments.order_id IS 'Đơn đặt hàng của chuyến.';
COMMENT ON COLUMN order_shipments.seq IS 'Số thứ tự chuyến trong đơn (1, 2…).';
COMMENT ON COLUMN order_shipments.status IS 'waiting (chờ lấy hàng — hàng còn ở KCB) / shipping (đang giao — hàng ở KHG) / delivered (đã giao — phiếu bán nháp đã sinh) / returned (hoàn — hàng về KCB, giữ lại cho đơn).';
COMMENT ON COLUMN order_shipments.carrier_code IS 'Hãng của chuyến: SELF = tự giao, hoặc mã hãng; lấy từ đơn lúc lập chuyến, sửa được khi đổi trạng thái.';
COMMENT ON COLUMN order_shipments.tracking_no IS 'Mã vận đơn của chuyến (nhập tay).';
COMMENT ON COLUMN order_shipments.ship_fee IS 'Phí ship thu khách của chuyến (gồm thuế, đồng) — dòng dịch vụ trên phiếu bán khi Đã giao.';
COMMENT ON COLUMN order_shipments.cod_amount IS 'Tiền COD của chuyến (đồng) — dòng thanh toán hình thức "COD — <hãng>" trên phiếu bán khi Đã giao.';
COMMENT ON COLUMN order_shipments.ship_warehouse_code IS 'Kho KHG (hàng gửi bán) của cửa hàng nhận hàng khi Đang giao — chốt lúc đi giao theo cấu hình bizcity.phieu_ban.ship_warehouses; phiếu bán của chuyến xuất từ kho này.';
COMMENT ON COLUMN order_shipments.lines IS 'Dòng của chuyến [{ lineKey, sku, name, unit, qty }] — lineKey là dòng của đơn; mỗi dòng ≤ số còn lại lúc lập.';
COMMENT ON COLUMN order_shipments.sale_doc_id IS 'Phiếu bán BH10 nháp sinh khi Đã giao (mod_phieu_ban.docs.doc_id); xoá phiếu nháp thì trống lại, chuyến về Đang giao.';
COMMENT ON COLUMN order_shipments.sale_doc_no IS 'Số phiếu bán của chuyến.';
COMMENT ON COLUMN order_shipments.log IS 'Nhật ký đổi trạng thái [{ at, by, byName, from, to, note, docNo }] — ai đổi, lúc nào (cùng ghi order_events action ship_status).';
COMMENT ON COLUMN order_shipments.created_by IS 'Người lập chuyến (actor id).';
COMMENT ON COLUMN order_shipments.created_at IS 'Lúc lập chuyến.';
COMMENT ON COLUMN order_shipments.updated_by IS 'Người đổi gần nhất.';
COMMENT ON COLUMN order_shipments.updated_at IS 'Lúc đổi gần nhất.';

COMMENT ON COLUMN order_events.action IS 'Việc: create, update, send, pending, approve, reject, hold, release, deliver, update_delivery, delivery_returned, merge, close, cancel; NT-BH-032: copy (lập từ đơn / hoá đơn khác), ship_create (lập chuyến giao), ship_status (đổi trạng thái chuyến).';
