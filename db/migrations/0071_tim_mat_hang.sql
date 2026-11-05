-- [2026-11-05 04:30 PM Nguyễn Văn Thủy] PHASE-026 — S026-14 (docs/core/06-xuong-ca-dinh-danh.md): tìm mặt hàng và lọc theo nhóm chịu được danh mục lớn (đóng góp)
-- [2026-11-05 05:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-026 — nhận đóng góp vào framework: Nguyễn Văn Thủy rà và gộp theo uỷ quyền review / merge của chủ dự án; chủ dự án chưa tự rà riêng tệp này
-- =============================================================================
-- 0071 Tìm mặt hàng trên danh mục lớn.
--   Đo trên 21 triệu mặt hàng: tìm kiếm quét toàn bảng hết 76 giây, lọc theo nhóm 14 giây.
--   bizcity_item_search_text  gộp mã + tên + ghi chú, bỏ dấu, chữ thường. Cùng một biểu thức cho chỉ mục và câu tìm.
--   products_search           chỉ mục trigram cho LIKE '%từ%'.
--   products_group            chỉ mục lọc theo nhóm hàng.
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION bizcity_item_search_text(p_sku text, p_name text, p_note text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT translate(lower(p_sku || ' ' || p_name || ' ' || COALESCE(p_note, '')),
                   'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ',
                   'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd')
$$;
COMMENT ON FUNCTION bizcity_item_search_text(text, text, text) IS 'Chuỗi tìm kiếm của mặt hàng: mã + tên + ghi chú, bỏ dấu, chữ thường. Bảng ký tự phải khớp plainVi ở product.routes.ts (0071).';

CREATE INDEX products_search ON products USING gin (bizcity_item_search_text(sku, name, note) gin_trgm_ops);
COMMENT ON INDEX products_search IS 'Tìm mặt hàng theo một phần mã, tên, ghi chú (0071).';
CREATE INDEX products_group ON products (tenant_id, group_code) WHERE group_code IS NOT NULL;
COMMENT ON INDEX products_group IS 'Lọc mặt hàng theo nhóm hàng (0071).';
