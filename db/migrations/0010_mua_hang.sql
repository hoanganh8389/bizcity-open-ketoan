-- Phân hệ Mua hàng (23/10/2026): 2 bảng.
--   purchase_documents  mọi chứng từ phía mua (đơn đặt, nhập mua, trả / đổi hàng, nhận / xuất quà, chi phí, thưởng, ứng trước,
--                       trả tiền) — cột cho thứ cần lọc, data jsonb cho dòng hàng, điều khoản, cảnh báo, vết chính sách.
--   purchase_policies   bộ máy chính sách: loại + phạm vi + hiệu lực + quy tắc (jsonb).
-- Duyệt chứng từ mua → ghi sổ qua cổng chứng từ có sẵn (accounting_events, bút toán, công nợ, kho); không có sổ riêng.
-- Thiết kế: docs/nghiep-vu/08-mua-hang.md.

CREATE TABLE purchase_documents (
  id               bigserial PRIMARY KEY,
  tenant_id        bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind             text   NOT NULL CHECK (kind IN ('order','receipt','return','exchange','gift_in','gift_out','cost','rebate','prepayment','payment')),
  status           text   NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','cancelled')),
  doc_no           text   NOT NULL,
  doc_date         date   NOT NULL,
  branch_code      text   NOT NULL,
  partner_code     text   NOT NULL,
  brand_code       text,
  invoice_no       text,
  invoice_serial   text   NOT NULL DEFAULT '',
  invoice_date     date,
  due_date         date,
  total_before_tax numeric(18,2) NOT NULL DEFAULT 0,
  total_tax        numeric(18,2) NOT NULL DEFAULT 0,
  total            numeric(18,2) NOT NULL DEFAULT 0,
  ref_ids          bigint[] NOT NULL DEFAULT '{}',
  revision         integer NOT NULL DEFAULT 0,
  links            jsonb  NOT NULL DEFAULT '[]',
  data             jsonb  NOT NULL DEFAULT '{}',
  is_demo          boolean NOT NULL DEFAULT false,
  created_by       text   NOT NULL DEFAULT '',
  created_by_name  text   NOT NULL DEFAULT '',
  approved_by      text,
  approved_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, kind, doc_no)
);
CREATE INDEX purchase_documents_partner_idx ON purchase_documents (tenant_id, partner_code, doc_date);
CREATE INDEX purchase_documents_brand_idx ON purchase_documents (tenant_id, brand_code, branch_code, doc_date);
CREATE INDEX purchase_documents_status_idx ON purchase_documents (tenant_id, status, kind);
-- Một hoá đơn (NCC + ký hiệu + số) chỉ vào một chứng từ đang hiệu lực: chặn ở mức cơ sở dữ liệu, kể cả khi hai người duyệt cùng lúc.
CREATE UNIQUE INDEX purchase_documents_invoice_uniq ON purchase_documents (tenant_id, partner_code, invoice_serial, invoice_no)
  WHERE invoice_no IS NOT NULL AND status IN ('pending_approval','approved') AND kind IN ('receipt','cost');

COMMENT ON TABLE purchase_documents IS 'Chứng từ mua hàng (phân hệ Mua hàng): mọi loại phiếu phía mua trong một bảng, phân biệt bằng kind. Duyệt → ghi sổ qua cổng chứng từ.';
COMMENT ON COLUMN purchase_documents.kind IS 'order đơn đặt · receipt nhập mua · return trả NCC · exchange đổi hàng · gift_in nhận quà không HĐ · gift_out xuất quà tặng · cost chi phí mua hàng · rebate thưởng / CK cuối kỳ · prepayment ứng trước · payment trả tiền';
COMMENT ON COLUMN purchase_documents.status IS 'draft nháp → pending_approval chờ duyệt → approved đã duyệt (đã ghi sổ) · cancelled đã huỷ';
COMMENT ON COLUMN purchase_documents.brand_code IS 'Nhãn hàng chính của phiếu: hạn mức nhãn theo chi nhánh, thưởng theo nhãn';
COMMENT ON COLUMN purchase_documents.total IS 'Phải trả NCC (đổi hàng: chênh lệch nhận − trả; phiếu tiền: số tiền). Máy chủ tính lại từ dòng, không nhận số gửi lên';
COMMENT ON COLUMN purchase_documents.ref_ids IS 'Chứng từ liên quan: đơn đặt (phiếu nhập, ứng trước), phiếu gốc (trả, đổi), phiếu nhập được phân bổ (chi phí), hoá đơn được trả (trả tiền)';
COMMENT ON COLUMN purchase_documents.revision IS 'Số lần duyệt — làm version của chứng từ kế toán khi duyệt lại sau khi bỏ duyệt';
COMMENT ON COLUMN purchase_documents.links IS 'Chứng từ kế toán đã sinh khi duyệt: [{ docKey, docNo, eventId, role }] — bỏ duyệt thì huỷ đúng các chứng từ này';
COMMENT ON COLUMN purchase_documents.data IS 'Phần hay đổi: dòng hàng (loại dòng, lô, hạn dùng), CK đơn, điều khoản, CKTT, lịch trả, quà, phân bổ, cảnh báo và vết chính sách lúc duyệt';
COMMENT ON COLUMN purchase_documents.is_demo IS 'Dữ liệu mẫu 25 tình huống (nạp ở bản thử) — xoá được bằng "Xoá dữ liệu mẫu"';

CREATE TABLE purchase_policies (
  id          bigserial PRIMARY KEY,
  tenant_id   bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code        text   NOT NULL,
  kind        text   NOT NULL,
  name        text   NOT NULL,
  scope       jsonb  NOT NULL DEFAULT '{}',
  valid_from  date,
  valid_to    date,
  priority    integer NOT NULL DEFAULT 0,
  rule        jsonb  NOT NULL DEFAULT '{}',
  is_active   boolean NOT NULL DEFAULT true,
  is_demo     boolean NOT NULL DEFAULT false,
  updated_by  text   NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX purchase_policies_kind_idx ON purchase_policies (tenant_id, kind) WHERE is_active;

COMMENT ON TABLE purchase_policies IS 'Chính sách mua hàng: chiết khấu, bậc số lượng, khuyến mại, CKTT, thưởng, hạn mức, điều khoản thanh toán, giá mua cố định, chỉ tiêu cung ứng, theo dõi lô. Thêm loại mới không cần thêm bảng.';
COMMENT ON COLUMN purchase_policies.scope IS 'Phạm vi áp: { partnerCode?, brandCode?, sku?, branchCode? } — phạm vi hẹp nhất thắng, rồi tới priority';
COMMENT ON COLUMN purchase_policies.rule IS 'Quy tắc theo kind (máy chủ kiểm khuôn): ví dụ { "pct": 7 }, { "tiers": [...] }, { "limit": 600000000, "branches": {...} }';
