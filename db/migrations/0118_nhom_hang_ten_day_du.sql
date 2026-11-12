-- [2026-11-12 Nguyễn Văn Thủy] nhóm hàng: thêm Tên nhóm hàng đầy đủ (đóng góp)
-- 0118 item_classes.full_name: tên đầy đủ của nhóm (vd "BỈM/ TÃ Angel Bỉm/tã quần trẻ em"); name là mã nhóm hàng hiện trên cây.
--   Nhóm có từ trước: ghép tên các cấp từ gốc xuống. Không chạm sổ.
ALTER TABLE item_classes ADD COLUMN full_name text NOT NULL DEFAULT '';
WITH RECURSIVE t(tenant_id, kind, code, full_name) AS (
  SELECT tenant_id, kind, code, name FROM item_classes WHERE kind = 'group' AND (parent_code IS NULL OR parent_code = code)
  UNION ALL
  SELECT c.tenant_id, c.kind, c.code, CASE WHEN t.full_name ~* '^nhóm hàng$' THEN c.name ELSE t.full_name || ' ' || c.name END
    FROM item_classes c JOIN t ON c.tenant_id = t.tenant_id AND c.kind = t.kind AND c.parent_code = t.code AND c.code <> t.code
)
UPDATE item_classes i SET full_name = t.full_name FROM t
 WHERE i.tenant_id = t.tenant_id AND i.kind = t.kind AND i.code = t.code AND i.full_name = '';
