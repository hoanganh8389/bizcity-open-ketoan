-- Đơn đặt hàng (module phieu-ban, phiếu NT-BH-023): đơn nháp (= báo giá có hạn) → gửi (kiểm hạn mức / nợ quá hạn → chờ duyệt) → đã gửi
-- (giữ hàng bằng chứng từ chuyển kho sang kho KCB) → giao nhiều lần (mỗi lần một phiếu bán BH10 nháp) → đóng / huỷ.
-- Chạy bằng vai trò mod_phieu_ban_owner trong schema mod_phieu_ban: không tạo / sửa được bảng của Core. Mọi bảng: tenant_id, RLS, COMMENT.
-- Số đơn DH + yyMM + 6 số theo cửa hàng dùng chung bộ đếm code_counters (kind = 'order').
-- [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: bảng đơn đặt hàng + lịch sử đơn (đóng góp)

CREATE TABLE orders (
  order_id            uuid        NOT NULL PRIMARY KEY,
  tenant_id           bigint      NOT NULL,
  branch_code         text        NOT NULL,
  warehouse_code      text        NOT NULL,
  hold_warehouse_code text,
  order_no            text        NOT NULL,
  order_date          date        NOT NULL,
  valid_until         date,
  status              text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'open', 'closed', 'cancelled')),
  source              text        NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'livestream')),
  partner_code        text,
  phone               text,
  body                jsonb       NOT NULL,
  total               numeric(18,2) NOT NULL DEFAULT 0,
  hold_seq            integer     NOT NULL DEFAULT 0,
  pending_reasons     jsonb,
  close_reason        text,
  created_by          text        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          text        NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  approved_by         text,
  approved_at         timestamptz,
  CONSTRAINT orders_no_unique UNIQUE (tenant_id, branch_code, order_no)
);
CREATE INDEX orders_list ON orders (tenant_id, order_date DESC, created_at DESC);
CREATE INDEX orders_partner_open ON orders (tenant_id, partner_code) WHERE status IN ('pending', 'open');
CREATE INDEX orders_phone ON orders (tenant_id, phone, created_at DESC) WHERE phone IS NOT NULL;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders USING (public.bizcity_tenant_visible(tenant_id)) WITH CHECK (public.bizcity_tenant_visible(tenant_id));
COMMENT ON TABLE orders IS 'Đơn đặt hàng (NT-BH-023): nháp (báo giá có hạn) → chờ duyệt / đã gửi (giữ hàng ở kho KCB) → giao nhiều lần (phiếu bán BH10 nháp) → đã đóng / đã huỷ. Không có doanh thu, không bút toán tiền.';
COMMENT ON COLUMN orders.order_id IS 'Định danh đơn (uuid); chứng từ giữ hàng trong sổ mang docKey phieu-ban:dh:<order_id>:<lần>.';
COMMENT ON COLUMN orders.tenant_id IS 'Đơn vị (RLS).';
COMMENT ON COLUMN orders.branch_code IS 'Cửa hàng bán (bizcity_read.branches.code).';
COMMENT ON COLUMN orders.warehouse_code IS 'Kho bán của đơn (kho xuất khi giữ hàng, kho nhận lại khi đóng / huỷ); trống lúc lập = kho mặc định của cửa hàng.';
COMMENT ON COLUMN orders.hold_warehouse_code IS 'Kho KCB (hàng chờ bán) đang giữ hàng cho đơn — chốt lúc giữ lần đầu theo cấu hình bizcity.phieu_ban.hold_warehouses; phiếu bán giao hàng xuất từ kho này.';
COMMENT ON COLUMN orders.order_no IS 'Số đơn: DH + yyMM + 6 số theo cửa hàng × tháng (bộ đếm code_counters, kind order).';
COMMENT ON COLUMN orders.order_date IS 'Ngày đơn.';
COMMENT ON COLUMN orders.valid_until IS 'Hạn hiệu lực của đơn nháp (báo giá); quá hạn thì không gửi được — gia hạn hoặc lập đơn mới. Trống = không hạn.';
COMMENT ON COLUMN orders.status IS 'draft (nháp / báo giá) / pending (chờ duyệt: vượt hạn mức hoặc nợ quá hạn) / open (đã gửi, đang giữ hàng, giao dần) / closed (giao đủ hoặc bấm Đóng) / cancelled (huỷ khi chưa giao gì).';
COMMENT ON COLUMN orders.source IS 'Nguồn đơn: manual (lập tay) / livestream (nhập tay hoặc nạp từ Excel, lọc trùng SĐT + mã hàng trong 24 giờ).';
COMMENT ON COLUMN orders.partner_code IS 'Mã khách (bizcity_read.partners.code); trống = khách chưa có mã (đơn livestream) — phải chọn khách trước khi giao.';
COMMENT ON COLUMN orders.phone IS 'Số điện thoại người đặt (chỉ chữ số) — để lọc trùng đơn livestream.';
COMMENT ON COLUMN orders.body IS 'Nội dung đơn đã tính ở máy chủ: khách, dòng hàng (sku, ĐVT, SL, đơn giá, chiết khấu, khuyến mại, thuế, delivered = đã giao, held = đang giữ), tổng tiền, ghi chú, các lần giao (phiếu bán nối đơn).';
COMMENT ON COLUMN orders.total IS 'Tổng tiền đơn sau thuế — để lọc / cộng ở danh sách và tính đơn đang mở khi kiểm hạn mức.';
COMMENT ON COLUMN orders.hold_seq IS 'Số lần đã nộp chứng từ chuyển kho giữ / trả hàng của đơn (đặt docKey không trùng).';
COMMENT ON COLUMN orders.pending_reasons IS 'Lý do chờ duyệt lần gửi gần nhất (mảng câu: vượt hạn mức, nợ quá hạn); trống khi không phải duyệt.';
COMMENT ON COLUMN orders.close_reason IS 'Lý do đóng: delivered (giao đủ — xoá phiếu giao thì đơn mở lại) / manual (bấm Đóng đơn, phần còn giữ đã trả về kho bán).';
COMMENT ON COLUMN orders.created_by IS 'Người lập (actor id) — không được tự duyệt đơn của mình.';
COMMENT ON COLUMN orders.created_at IS 'Lúc lập.';
COMMENT ON COLUMN orders.updated_by IS 'Người sửa gần nhất.';
COMMENT ON COLUMN orders.updated_at IS 'Lúc sửa gần nhất.';
COMMENT ON COLUMN orders.approved_by IS 'Người duyệt đơn chờ duyệt (kế toán trưởng / chủ đơn vị).';
COMMENT ON COLUMN orders.approved_at IS 'Lúc duyệt.';

CREATE TABLE order_events (
  event_id    bigint      GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id   bigint      NOT NULL,
  order_id    uuid        NOT NULL REFERENCES orders (order_id),
  at          timestamptz NOT NULL DEFAULT now(),
  actor       text        NOT NULL,
  actor_name  text,
  action      text        NOT NULL,
  changes     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  note        text
);
CREATE INDEX order_events_order ON order_events (tenant_id, order_id, at);
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON order_events USING (public.bizcity_tenant_visible(tenant_id)) WITH CHECK (public.bizcity_tenant_visible(tenant_id));
COMMENT ON TABLE order_events IS 'Lịch sử đơn đặt hàng (NT-BH-023 Q3): mỗi lần lập, sửa (giá, giảm, số lượng, khách), gửi, chờ duyệt, duyệt, từ chối, giữ / trả hàng, giao, đóng, huỷ — người, lúc, giá trị cũ → mới. Chỉ thêm.';
COMMENT ON COLUMN order_events.event_id IS 'Số dòng lịch sử (tăng dần).';
COMMENT ON COLUMN order_events.tenant_id IS 'Đơn vị (RLS).';
COMMENT ON COLUMN order_events.order_id IS 'Đơn đặt hàng.';
COMMENT ON COLUMN order_events.at IS 'Lúc xảy ra.';
COMMENT ON COLUMN order_events.actor IS 'Người làm (actor id).';
COMMENT ON COLUMN order_events.actor_name IS 'Tên người làm lúc đó.';
COMMENT ON COLUMN order_events.action IS 'Việc: create, update, send, pending, approve, reject, hold, release, deliver, delivery_returned, merge, close, cancel.';
COMMENT ON COLUMN order_events.changes IS 'Các thay đổi [{ field, from, to }] (field: partner, validUntil, warehouse, note, line <lineKey> qty / unitPrice / discount, held, delivered…).';
COMMENT ON COLUMN order_events.note IS 'Ghi chú / lý do (duyệt, từ chối, đóng, huỷ) hoặc số phiếu bán của lần giao.';
