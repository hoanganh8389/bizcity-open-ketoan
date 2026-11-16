-- [2026-11-15 03:20 PM Võ Hoàng] LOYALTY — NT-BH-020 bước 1: chính sách theo cửa hàng, sổ điểm chỉ thêm (đóng góp)
-- Điểm thành viên (module loyalty). Chạy bằng vai trò mod_loyalty_owner trong schema mod_loyalty: không chạm bảng Core.
-- Mọi bảng: tenant_id, RLS (ENABLE + FORCE), COMMENT ON từng cột. Khách theo mã đối tượng (partner_code) — khung nhìn
-- bizcity_read.partners chỉ mở mã ("module lưu partner_code"), như module pos lưu customer_code.

CREATE TABLE programs (
  tenant_id    bigint      NOT NULL,
  branch_code  text        NOT NULL,
  version      text        NOT NULL,
  store_id     integer     NOT NULL DEFAULT 0,
  program      jsonb       NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  received_by  text        NOT NULL,
  PRIMARY KEY (tenant_id, branch_code, version)
);
CREATE INDEX programs_latest ON programs (tenant_id, branch_code, received_at DESC);
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON programs USING (public.bizcity_tenant_visible(tenant_id)) WITH CHECK (public.bizcity_tenant_visible(tenant_id));
COMMENT ON TABLE programs IS 'Chính sách tích điểm từng cửa hàng do website đẩy sang (LoyaltyProgram của tgs_loyalty_points), giữ mọi phiên bản; bản mới nhất theo received_at dùng để tính điểm.';
COMMENT ON COLUMN programs.tenant_id IS 'Đơn vị (RLS).';
COMMENT ON COLUMN programs.branch_code IS 'Mã chi nhánh (cửa hàng) áp chính sách.';
COMMENT ON COLUMN programs.version IS 'Phiên bản chính sách website gửi (băm nội dung); gửi lại cùng phiên bản không thêm dòng.';
COMMENT ON COLUMN programs.store_id IS 'Mã site cửa hàng ở website (blog_id) — bộ tính lọc chính sách theo applyToBlogIds.';
COMMENT ON COLUMN programs.program IS 'Nội dung LoyaltyProgram: settings, tiers (hạng + hệ số), policies (loại 1–6, rules).';
COMMENT ON COLUMN programs.received_at IS 'Lúc nhận.';
COMMENT ON COLUMN programs.received_by IS 'Người / khoá gửi (actor).';

CREATE TABLE entries (
  tenant_id       bigint        NOT NULL,
  entry_id        uuid          NOT NULL,
  partner_code    text          NOT NULL,
  kind            text          NOT NULL CHECK (kind IN ('earn', 'redeem', 'expire', 'adjust', 'reverse')),
  points          numeric(14,2) NOT NULL,
  at              timestamptz   NOT NULL,
  expires_at      timestamptz,
  allocations     jsonb,
  ref_type        text          NOT NULL CHECK (ref_type IN ('order', 'return', 'manual')),
  ref_id          text          NOT NULL,
  ref_code        text,
  branch_code     text,
  program_version text,
  meta            jsonb,
  note            text,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, entry_id),
  UNIQUE (tenant_id, ref_type, ref_id, kind)
);
CREATE INDEX entries_partner ON entries (tenant_id, partner_code, at);
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON entries USING (public.bizcity_tenant_visible(tenant_id)) WITH CHECK (public.bizcity_tenant_visible(tenant_id));
COMMENT ON TABLE entries IS 'Sổ điểm thành viên, chỉ thêm: mỗi lần tích / đổi / hết hạn / điều chỉnh / hoàn là một dòng có dấu. Dòng dương là lô (expires_at); dòng âm ghi phân bổ theo lô. Số dư = tổng points.';
COMMENT ON COLUMN entries.tenant_id IS 'Đơn vị (RLS).';
COMMENT ON COLUMN entries.entry_id IS 'Định danh dòng (dòng dương: cũng là mã lô).';
COMMENT ON COLUMN entries.partner_code IS 'Mã đối tượng (khách) ở danh mục đối tượng — bizcity_read.partners.code (máy bán: SĐT).';
COMMENT ON COLUMN entries.kind IS 'earn tích · redeem đổi · expire hết hạn · adjust điều chỉnh · reverse hoàn khi trả hàng.';
COMMENT ON COLUMN entries.points IS 'Số điểm có dấu: tích / điều chỉnh tăng > 0; đổi / hết hạn / hoàn < 0.';
COMMENT ON COLUMN entries.at IS 'Thời điểm phát sinh (lúc lập đơn / phiếu trả).';
COMMENT ON COLUMN entries.expires_at IS 'Dòng dương: lô hết hạn lúc nào; NULL = không hết hạn.';
COMMENT ON COLUMN entries.allocations IS 'Dòng âm: trừ vào lô nào bao nhiêu [{lotId, points}].';
COMMENT ON COLUMN entries.ref_type IS 'Chứng từ gốc: order đơn máy bán · return phiếu trả · manual điều chỉnh tay.';
COMMENT ON COLUMN entries.ref_id IS 'Định danh chứng từ gốc; cùng (ref_type, ref_id, kind) chỉ một dòng — chống ghi hai lần khi sự kiện giao lại.';
COMMENT ON COLUMN entries.ref_code IS 'Mã chứng từ gốc để in / tra (HD…, TH…).';
COMMENT ON COLUMN entries.branch_code IS 'Chi nhánh phát sinh.';
COMMENT ON COLUMN entries.program_version IS 'Phiên bản chính sách đã dùng để tính (dòng tích).';
COMMENT ON COLUMN entries.meta IS 'Chi tiết tính: tổng đơn, hệ số hạng, điểm theo từng chính sách; dòng hoàn: tiền trả / tổng đơn.';
COMMENT ON COLUMN entries.note IS 'Ghi chú (vd thiếu điểm khi hoàn).';
COMMENT ON COLUMN entries.created_at IS 'Lúc ghi vào sổ.';
