-- [2026-11-13 Nguyễn Văn Thủy] Bộ phận thành cây theo sơ đồ phòng ban của công ty (đóng góp)
--
-- Phần công ty: Giám đốc điều hành → BP Tài chính kế toán / Kế hoạch kinh doanh / Truyền thông / Hành chính pháp chế → phòng → tổ.
-- Phần chi nhánh (mã CN-…): Giám đốc chi nhánh → Kế toán (gồm Logistic: kho, đội xe) / Marketing / Kinh doanh (QL kinh doanh,
-- Cửa hàng, Mua hàng) / Hành chính nhân sự. Chứng từ ghi vào phòng ban cấp cuối; báo cáo cộng lên cấp trên.
-- Chi nhánh / cửa hàng đang gắn Bán hàng (BH) → Cửa hàng (CN-CH). Mã cũ không còn trong sơ đồ (BH, MH, MKT, VP, IT, KHO)
-- ngừng dùng, không xoá (dòng sổ cũ vẫn giữ mã). Sơ đồ đổi: sửa trên màn Phòng ban, không cần sửa mã nguồn.

CREATE TEMP TABLE _bp (code text, name text, parent text, ord int) ON COMMIT DROP;
INSERT INTO _bp VALUES
    ('BGD', 'Giám đốc điều hành', NULL, 0),
    ('TCKT', 'BP Tài chính kế toán', 'BGD', 1),
    ('KSTC', 'Kiểm soát tài chính', 'TCKT', 2),
    ('KHTC', 'Kế hoạch tài chính', 'KSTC', 3),
    ('KSNB', 'Kiểm soát nội bộ', 'KSTC', 4),
    ('KT', 'Kế toán', 'TCKT', 5),
    ('KTQT', 'Kế toán quản trị', 'KT', 6),
    ('KTTH', 'Kế toán thuế', 'KT', 7),
    ('KHKD', 'BP Kế hoạch kinh doanh', 'BGD', 8),
    ('HH', 'Hàng hoá', 'KHKD', 9),
    ('HH-MH', 'Mua hàng, định giá', 'HH', 10),
    ('HH-TD', 'Theo dõi hàng', 'HH', 11),
    ('PTD', 'Phát triển điểm, xây dựng cơ bản', 'KHKD', 12),
    ('PTD-PT', 'Phát triển điểm', 'PTD', 13),
    ('PTD-XD', 'Xây dựng cơ bản', 'PTD', 14),
    ('KD', 'Kinh doanh', 'KHKD', 15),
    ('KD-ONL', 'Kinh doanh online', 'KD', 16),
    ('KD-OFF', 'Kinh doanh offline', 'KD', 17),
    ('TT', 'BP Truyền thông', 'BGD', 18),
    ('DM', 'Digital marketing', 'TT', 19),
    ('DM-CT', 'Content', 'DM', 20),
    ('DM-MD', 'Media', 'DM', 21),
    ('CSKH', 'Chăm sóc khách hàng', 'TT', 22),
    ('TTNB', 'Truyền thông nội bộ', 'TT', 23),
    ('HCPC', 'BP Hành chính pháp chế', 'BGD', 24),
    ('VHDN', 'Văn hoá doanh nghiệp', 'HCPC', 25),
    ('VHNB', 'Văn hoá nội bộ', 'VHDN', 26),
    ('DT', 'Đào tạo', 'VHDN', 27),
    ('HCNS', 'Hành chính nhân sự', 'HCPC', 28),
    ('TCNS', 'Tổ chức nhân sự', 'HCNS', 29),
    ('HCQT', 'Hành chính quản trị', 'HCNS', 30),
    ('PC', 'Pháp chế', 'HCNS', 31),
    ('VTLT', 'Văn thư lưu trữ', 'HCNS', 32),
    ('DN', 'Đối ngoại', 'HCNS', 33),
    ('CN', 'Giám đốc chi nhánh', NULL, 34),
    ('CN-KT', 'Kế toán chi nhánh', 'CN', 35),
    ('CN-KTNB', 'Kế toán nội bộ, thanh toán', 'CN-KT', 36),
    ('CN-KTT', 'Kế toán thuế chi nhánh', 'CN-KT', 37),
    ('CN-LOG', 'Logistic', 'CN-KT', 38),
    ('CN-KHO', 'Kho', 'CN-LOG', 39),
    ('CN-XE', 'Đội xe, giao nhận', 'CN-LOG', 40),
    ('CN-MKT', 'Marketing chi nhánh', 'CN', 41),
    ('CN-KD', 'Kinh doanh chi nhánh', 'CN', 42),
    ('CN-QLKD', 'Quản lý kinh doanh', 'CN-KD', 43),
    ('CN-CH', 'Cửa hàng', 'CN-KD', 44),
    ('CN-MH', 'Mua hàng chi nhánh', 'CN-KD', 45),
    ('CN-HCNS', 'Hành chính nhân sự chi nhánh', 'CN', 46),
    ('CN-HCQT', 'Quản trị hành chính', 'CN-HCNS', 47),
    ('CN-TCNS', 'Tổ chức nhân sự chi nhánh', 'CN-HCNS', 48),
    ('CN-IT', 'IT', 'CN-HCNS', 49),
    ('CN-BV', 'Bảo vệ, tạp vụ', 'CN-HCNS', 50);

-- chỉ đơn vị đã dùng danh mục bộ phận
INSERT INTO dimensions (tenant_id, kind, code, name, parent_code)
SELECT t.tenant_id, 'department', b.code, b.name, b.parent
  FROM (SELECT DISTINCT tenant_id FROM dimensions WHERE kind = 'department') t CROSS JOIN _bp b
 WHERE NOT EXISTS (SELECT 1 FROM dimensions d WHERE d.tenant_id = t.tenant_id AND d.kind = 'department' AND d.code = b.code);

UPDATE dimensions d SET name = b.name, parent_code = b.parent, is_active = true
  FROM _bp b WHERE d.kind = 'department' AND d.code = b.code;

UPDATE branches SET department_code = 'CN-CH'
 WHERE department_code = 'BH'
   AND EXISTS (SELECT 1 FROM dimensions d WHERE d.tenant_id = branches.tenant_id AND d.kind = 'department' AND d.code = 'CN-CH');

UPDATE dimensions SET is_active = false WHERE kind = 'department' AND code IN ('BH', 'MH', 'MKT', 'VP', 'IT', 'KHO');
