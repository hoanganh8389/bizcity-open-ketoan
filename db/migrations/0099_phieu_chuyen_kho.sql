-- [2026-11-10 08:30 PM Nguyễn Văn Thủy] PHASE-026 — phiếu chuyển kho lập trên phần mềm kế toán (KHO01): xuất là trừ tồn bên chuyển, thủ kho nhập xác nhận mới cộng tồn bên nhận (đóng góp)
-- =============================================================================
-- 0099 Phiếu chuyển kho (docs/nghiep-vu/17-chuyen-kho.md).
--
--   stock_transfer_docs  Một phiếu = một lần chuyển, cả hai đầu (chi nhánh + phân kho xuất → chi nhánh + phân kho nhập).
--                        Không có sổ riêng: phiếu vào sổ thành HAI chứng từ "transfer" một đầu của lõi:
--                          out_doc_key  đầu xuất — ghi ngay khi lưu phiếu (tồn bên chuyển giảm, Nợ hàng đang chuyển / Có kho)
--                          in_doc_key   đầu nhập — ghi khi thủ kho nhập xác nhận (tồn bên nhận tăng theo SL thực nhận)
--                        Nhận thiếu: phần chênh giữ trên tài khoản hàng đang chuyển để xử lý. Từ chối nhận: huỷ đầu xuất (trả tồn).
--                        Huỷ phiếu: huỷ cả hai đầu (đảo bút toán bằng số âm), không xoá phiếu.
--   Phiếu chuyển từ website bán hàng (cầu nối) vẫn đi thẳng vào sổ như cũ, không qua bảng này.
-- =============================================================================

CREATE TABLE stock_transfer_docs (
  id               bigserial   PRIMARY KEY,
  tenant_id        bigint      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doc_no           text        NOT NULL,
  doc_date         date        NOT NULL,
  from_branch_code text        NOT NULL,
  from_warehouse   text        NOT NULL DEFAULT '',
  to_branch_code   text        NOT NULL,
  to_warehouse     text        NOT NULL DEFAULT '',
  reason_code      text,
  note             text        NOT NULL DEFAULT '',
  status           text        NOT NULL DEFAULT 'shipped',
  lines            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  received_date    date,
  received_by      text,
  received_note    text        NOT NULL DEFAULT '',
  out_doc_key      text        NOT NULL,
  in_doc_key       text        NOT NULL,
  created_by       text,
  updated_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_transfer_docs_status_chk CHECK (status IN ('shipped', 'received', 'rejected', 'cancelled')),
  CONSTRAINT stock_transfer_docs_lines_chk CHECK (jsonb_typeof(lines) = 'array')
);
CREATE UNIQUE INDEX stock_transfer_docs_no ON stock_transfer_docs (tenant_id, doc_no);
CREATE INDEX stock_transfer_docs_date ON stock_transfer_docs (tenant_id, doc_date DESC, id DESC);

COMMENT ON TABLE stock_transfer_docs IS 'Phiếu chuyển kho lập trên phần mềm kế toán; vào sổ thành hai chứng từ transfer một đầu (0099).';
COMMENT ON COLUMN stock_transfer_docs.id IS 'Khoá.';
COMMENT ON COLUMN stock_transfer_docs.tenant_id IS 'Đơn vị.';
COMMENT ON COLUMN stock_transfer_docs.doc_no IS 'Số phiếu (CK + năm 2 số + số thứ tự), duy nhất trong đơn vị.';
COMMENT ON COLUMN stock_transfer_docs.doc_date IS 'Ngày xuất.';
COMMENT ON COLUMN stock_transfer_docs.from_branch_code IS 'Chi nhánh xuất.';
COMMENT ON COLUMN stock_transfer_docs.from_warehouse IS 'Phân kho xuất; trống = kho mặc định của chi nhánh xuất.';
COMMENT ON COLUMN stock_transfer_docs.to_branch_code IS 'Chi nhánh nhập (bằng chi nhánh xuất = chuyển giữa hai kho trong chi nhánh).';
COMMENT ON COLUMN stock_transfer_docs.to_warehouse IS 'Phân kho nhập; trống = kho mặc định của chi nhánh nhập.';
COMMENT ON COLUMN stock_transfer_docs.reason_code IS 'Lý do xuất (posting_reasons.code); trống = lý do mặc định của chuyển kho.';
COMMENT ON COLUMN stock_transfer_docs.note IS 'Diễn giải.';
COMMENT ON COLUMN stock_transfer_docs.status IS 'shipped đã xuất chờ nhận · received đã nhận · rejected bên nhận từ chối (trả tồn) · cancelled đã huỷ.';
COMMENT ON COLUMN stock_transfer_docs.lines IS 'Dòng hàng: [{lineKey, sku, name, unit, qty, receivedQty, lotNo, expDate, note}]; qty theo ĐVT tồn kho.';
COMMENT ON COLUMN stock_transfer_docs.received_date IS 'Ngày nhận (ngày ghi đầu nhập).';
COMMENT ON COLUMN stock_transfer_docs.received_by IS 'Người xác nhận nhận hàng.';
COMMENT ON COLUMN stock_transfer_docs.received_note IS 'Ghi chú khi nhận (nhận thiếu, hàng hỏng…).';
COMMENT ON COLUMN stock_transfer_docs.out_doc_key IS 'Khoá chứng từ đầu xuất trong sổ.';
COMMENT ON COLUMN stock_transfer_docs.in_doc_key IS 'Khoá chứng từ đầu nhập trong sổ.';
COMMENT ON COLUMN stock_transfer_docs.created_by IS 'Người lập.';
COMMENT ON COLUMN stock_transfer_docs.updated_by IS 'Người sửa gần nhất.';
COMMENT ON COLUMN stock_transfer_docs.created_at IS 'Lúc lập.';
COMMENT ON COLUMN stock_transfer_docs.updated_at IS 'Lúc sửa gần nhất.';

ALTER TABLE stock_transfer_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_docs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON stock_transfer_docs USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON stock_transfer_docs TO ketoan_app;
    GRANT USAGE ON SEQUENCE stock_transfer_docs_id_seq TO ketoan_app;
  END IF;
END $$;
