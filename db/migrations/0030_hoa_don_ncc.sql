-- =============================================================================
-- 0030 Hoá đơn đầu vào của nhà cung cấp (Mua hàng → Hoá đơn NCC) và dữ liệu học nhận diện mã hàng NCC.
--   - supplier_invoices: mỗi hoá đơn NCC gửi một dòng (mẫu số, ký hiệu, số, ngày, MST, tổng tiền); nguồn gõ tay / Excel / AI / API.
--     Đối soát với phiếu nhập cùng NCC + số hoá đơn. Chỉ huỷ (status = cancelled), không xoá.
--   - supplier_invoice_lines: dòng theo cách NCC ghi (mã / tên / ĐVT bên NCC) + mã, ĐVT bên mình đã nhận diện.
--   - supplier_item_aliases: NCC × mã / tên / ĐVT bên NCC → mã + ĐVT bên mình; ghi khi người dùng chọn mã, lần sau tự nhận.
-- Khuôn theo apps/api/src/db/types.ts (SupplierInvoicesTable, SupplierInvoiceLinesTable, SupplierItemAliasesTable).
-- Trùng hoá đơn (NCC × ký hiệu × số, "101" = "0000101") do code kiểm (findDuplicate) để hoá đơn đã huỷ không chặn nhập lại.
-- =============================================================================

CREATE TABLE IF NOT EXISTS supplier_invoices (
  id               bigserial PRIMARY KEY,
  tenant_id        bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  partner_code     text   NOT NULL,
  invoice_form     text   NOT NULL DEFAULT '',
  invoice_series   text   NOT NULL DEFAULT '',
  invoice_no       text   NOT NULL,
  invoice_date     date,
  seller_tax_code  text   NOT NULL DEFAULT '',
  seller_name      text   NOT NULL DEFAULT '',
  buyer_tax_code   text   NOT NULL DEFAULT '',
  total_before_tax numeric(18,2) NOT NULL DEFAULT 0,
  total_discount   numeric(18,2) NOT NULL DEFAULT 0,
  total_tax        numeric(18,2) NOT NULL DEFAULT 0,
  total            numeric(18,2) NOT NULL DEFAULT 0,
  source           text   NOT NULL DEFAULT 'manual',
  status           text   NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  data             jsonb  NOT NULL DEFAULT '{}'::jsonb,
  note             text   NOT NULL DEFAULT '',
  created_by       text   NOT NULL DEFAULT '',
  updated_by       text   NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  cancelled_by     text,
  cancelled_at     timestamptz,
  cancel_reason    text
);
CREATE INDEX IF NOT EXISTS supplier_invoices_partner_idx ON supplier_invoices (tenant_id, partner_code, invoice_no);
CREATE INDEX IF NOT EXISTS supplier_invoices_date_idx ON supplier_invoices (tenant_id, invoice_date);

COMMENT ON TABLE supplier_invoices IS 'Hoá đơn đầu vào của nhà cung cấp: mỗi hoá đơn một dòng, nguồn gõ tay / Excel / AI / API; đối soát với phiếu nhập cùng NCC + số hoá đơn. Chỉ huỷ, không xoá.';
COMMENT ON COLUMN supplier_invoices.partner_code IS 'Mã nhà cung cấp (danh mục đối tượng).';
COMMENT ON COLUMN supplier_invoices.invoice_form IS 'Mẫu số hoá đơn (vd 1, 01GTKT).';
COMMENT ON COLUMN supplier_invoices.invoice_series IS 'Ký hiệu hoá đơn (vd C26TAA).';
COMMENT ON COLUMN supplier_invoices.invoice_no IS 'Số hoá đơn như NCC ghi; so trùng bỏ số 0 đứng đầu ("101" = "0000101").';
COMMENT ON COLUMN supplier_invoices.invoice_date IS 'Ngày lập hoá đơn.';
COMMENT ON COLUMN supplier_invoices.seller_tax_code IS 'Mã số thuế người bán ghi trên hoá đơn.';
COMMENT ON COLUMN supplier_invoices.seller_name IS 'Tên người bán ghi trên hoá đơn.';
COMMENT ON COLUMN supplier_invoices.buyer_tax_code IS 'Mã số thuế người mua ghi trên hoá đơn (để phát hiện hoá đơn xuất nhầm đơn vị).';
COMMENT ON COLUMN supplier_invoices.total_before_tax IS 'Cộng tiền hàng chưa thuế (đồng).';
COMMENT ON COLUMN supplier_invoices.total_discount IS 'Cộng chiết khấu thương mại (đồng).';
COMMENT ON COLUMN supplier_invoices.total_tax IS 'Cộng tiền thuế GTGT (đồng).';
COMMENT ON COLUMN supplier_invoices.total IS 'Tổng tiền thanh toán (đồng).';
COMMENT ON COLUMN supplier_invoices.source IS 'Nguồn nhập: manual (gõ tay), excel, ai (đọc bằng dịch vụ AI — INVOICE_AI_URL), api.';
COMMENT ON COLUMN supplier_invoices.status IS 'active = còn hiệu lực; cancelled = đã huỷ (không xoá để giữ dấu vết).';
COMMENT ON COLUMN supplier_invoices.data IS 'Dữ liệu gốc thêm (vd kết quả đọc của AI) — JSON, không dùng để tính tiền.';
COMMENT ON COLUMN supplier_invoices.note IS 'Ghi chú.';
COMMENT ON COLUMN supplier_invoices.created_by IS 'Người / khoá tạo (actor).';
COMMENT ON COLUMN supplier_invoices.updated_by IS 'Người / khoá sửa gần nhất (actor).';
COMMENT ON COLUMN supplier_invoices.cancelled_by IS 'Người huỷ.';
COMMENT ON COLUMN supplier_invoices.cancelled_at IS 'Thời điểm huỷ.';
COMMENT ON COLUMN supplier_invoices.cancel_reason IS 'Lý do huỷ.';

CREATE TABLE IF NOT EXISTS supplier_invoice_lines (
  id               bigserial PRIMARY KEY,
  tenant_id        bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id       bigint NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  line_no          integer NOT NULL,
  ncc_sku          text   NOT NULL DEFAULT '',
  ncc_name         text   NOT NULL DEFAULT '',
  ncc_unit         text   NOT NULL DEFAULT '',
  qty              numeric(18,4) NOT NULL DEFAULT 0,
  price            numeric(18,4) NOT NULL DEFAULT 0,
  discount_amount  numeric(18,2) NOT NULL DEFAULT 0,
  amount           numeric(18,2) NOT NULL DEFAULT 0,
  tax_rate         numeric(6,2),
  tax_amount       numeric(18,2) NOT NULL DEFAULT 0,
  is_gift          boolean NOT NULL DEFAULT false,
  sku              text,
  unit             text,
  match_source     text   NOT NULL DEFAULT 'none',
  data             jsonb  NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (invoice_id, line_no)
);
CREATE INDEX IF NOT EXISTS supplier_invoice_lines_invoice_idx ON supplier_invoice_lines (tenant_id, invoice_id);

COMMENT ON TABLE supplier_invoice_lines IS 'Dòng hàng hoá đơn NCC: theo cách NCC ghi (mã / tên / ĐVT bên NCC, SL, giá chưa thuế, thuế suất) + mã, ĐVT bên mình đã nhận diện. Sửa hoá đơn = ghi lại toàn bộ dòng.';
COMMENT ON COLUMN supplier_invoice_lines.invoice_id IS 'Hoá đơn (supplier_invoices.id).';
COMMENT ON COLUMN supplier_invoice_lines.line_no IS 'Số thứ tự dòng trên hoá đơn, từ 1.';
COMMENT ON COLUMN supplier_invoice_lines.ncc_sku IS 'Mã hàng bên NCC ghi trên hoá đơn.';
COMMENT ON COLUMN supplier_invoice_lines.ncc_name IS 'Tên hàng bên NCC ghi trên hoá đơn.';
COMMENT ON COLUMN supplier_invoice_lines.ncc_unit IS 'ĐVT bên NCC ghi trên hoá đơn.';
COMMENT ON COLUMN supplier_invoice_lines.qty IS 'Số lượng theo ĐVT của NCC.';
COMMENT ON COLUMN supplier_invoice_lines.price IS 'Đơn giá chưa thuế theo ĐVT của NCC.';
COMMENT ON COLUMN supplier_invoice_lines.discount_amount IS 'Chiết khấu của dòng (đồng).';
COMMENT ON COLUMN supplier_invoice_lines.amount IS 'Thành tiền chưa thuế sau chiết khấu (đồng).';
COMMENT ON COLUMN supplier_invoice_lines.tax_rate IS 'Thuế suất GTGT (%); NULL = không chịu thuế / không ghi.';
COMMENT ON COLUMN supplier_invoice_lines.tax_amount IS 'Tiền thuế GTGT của dòng (đồng).';
COMMENT ON COLUMN supplier_invoice_lines.is_gift IS 'Dòng hàng tặng / khuyến mại (giá 0).';
COMMENT ON COLUMN supplier_invoice_lines.sku IS 'Mã hàng bên mình đã nhận diện; NULL = chưa nhận diện, chọn sau.';
COMMENT ON COLUMN supplier_invoice_lines.unit IS 'ĐVT bên mình tương ứng ĐVT của NCC (một ĐVT của mặt hàng).';
COMMENT ON COLUMN supplier_invoice_lines.match_source IS 'Cách nhận diện mã: none (chưa), manual (người chọn), auto (tự nhận theo dữ liệu học), ai.';
COMMENT ON COLUMN supplier_invoice_lines.data IS 'Dữ liệu gốc thêm của dòng — JSON.';

CREATE TABLE IF NOT EXISTS supplier_item_aliases (
  id               bigserial PRIMARY KEY,
  tenant_id        bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  partner_code     text   NOT NULL,
  ncc_sku          text   NOT NULL DEFAULT '',
  ncc_name         text   NOT NULL DEFAULT '',
  ncc_name_key     text   NOT NULL DEFAULT '',
  ncc_unit         text   NOT NULL DEFAULT '',
  sku              text   NOT NULL,
  unit             text   NOT NULL,
  hits             integer NOT NULL DEFAULT 1,
  source           text   NOT NULL DEFAULT 'manual',
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  created_by       text   NOT NULL DEFAULT '',
  updated_by       text   NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
-- Một cách ghi của NCC chỉ trỏ một mã bên mình (khớp cách tra trong learn(): mã, ĐVT không phân biệt hoa thường; tên theo khoá chuẩn hoá).
CREATE UNIQUE INDEX IF NOT EXISTS supplier_item_aliases_uniq ON supplier_item_aliases (tenant_id, partner_code, lower(ncc_sku), ncc_name_key, lower(ncc_unit));
CREATE INDEX IF NOT EXISTS supplier_item_aliases_sku_idx ON supplier_item_aliases (tenant_id, sku);

COMMENT ON TABLE supplier_item_aliases IS 'Nhận diện mã hàng NCC (dữ liệu học): NCC × mã / tên / ĐVT bên NCC → mã + ĐVT bên mình; ghi khi người dùng chọn mã cho dòng hoá đơn, lần sau tự nhận.';
COMMENT ON COLUMN supplier_item_aliases.partner_code IS 'Mã nhà cung cấp.';
COMMENT ON COLUMN supplier_item_aliases.ncc_sku IS 'Mã hàng bên NCC.';
COMMENT ON COLUMN supplier_item_aliases.ncc_name IS 'Tên hàng bên NCC (nguyên văn lần gặp đầu).';
COMMENT ON COLUMN supplier_item_aliases.ncc_name_key IS 'Tên hàng bên NCC đã chuẩn hoá (nameKey / normText của @ketoan/contracts/mua-hang) để so khớp.';
COMMENT ON COLUMN supplier_item_aliases.ncc_unit IS 'ĐVT bên NCC.';
COMMENT ON COLUMN supplier_item_aliases.sku IS 'Mã hàng bên mình tương ứng.';
COMMENT ON COLUMN supplier_item_aliases.unit IS 'ĐVT bên mình tương ứng.';
COMMENT ON COLUMN supplier_item_aliases.hits IS 'Số lần cách ghi này đã gặp (xếp ưu tiên khi gợi ý).';
COMMENT ON COLUMN supplier_item_aliases.source IS 'Ai dạy: manual (người chọn), ai.';
COMMENT ON COLUMN supplier_item_aliases.last_seen_at IS 'Lần gặp gần nhất.';
COMMENT ON COLUMN supplier_item_aliases.created_by IS 'Người / khoá tạo (actor).';
COMMENT ON COLUMN supplier_item_aliases.updated_by IS 'Người / khoá sửa gần nhất (actor).';
