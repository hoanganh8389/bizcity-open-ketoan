-- [2026-11-11 Nguyễn Văn Thủy] 0105 Mục thu / chi theo danh mục chuẩn: Loại (mục thu / mục chi), phát sinh định kỳ, 42 mục mặc định (đóng góp)
-- Sửa 0104: bỏ hai gốc THU / CHI; loại ghi ở extra.loai ('thu' | 'chi'), phát sinh định kỳ hàng tháng ở extra.dinhKy; "Thuộc" = parent_code (tuỳ chọn).
-- Mã mặc định cũ không có trong danh mục chuẩn: chưa dùng thì xoá, đã dùng trên sổ thì ngừng theo dõi (giữ để đọc sổ cũ).

UPDATE public.dimensions SET extra = extra || jsonb_build_object('loai', CASE WHEN parent_code = 'THU' THEN 'thu' ELSE 'chi' END), parent_code = NULL
 WHERE kind = 'cash_item' AND parent_code IN ('THU', 'CHI');

INSERT INTO public.dimensions (tenant_id, kind, code, name, parent_code, note, extra)
SELECT t.id, 'cash_item', v.code, v.name, NULL, '', v.extra::jsonb
  FROM tenants t
 CROSS JOIN (VALUES
   ('100', 'Thu từ bán hàng thu tiền ngay', '{"loai": "thu", "dinhKy": false}'),
   ('101', 'Thu nợ từ bán hàng', '{"loai": "thu", "dinhKy": false}'),
   ('102', 'Thu nợ từ hợp đồng bán', '{"loai": "thu", "dinhKy": false}'),
   ('103', 'Thu tiền góp vốn', '{"loai": "thu", "dinhKy": false}'),
   ('104', 'Thu tiền vay', '{"loai": "thu", "dinhKy": false}'),
   ('105', 'Thu từ lãi tiền gửi ngân hàng, các khoản cho vay', '{"loai": "thu", "dinhKy": true}'),
   ('106', 'Thu lãi từ các khoản đầu tư', '{"loai": "thu", "dinhKy": true}'),
   ('107', 'Thu nhận ký quỹ, ký cược', '{"loai": "thu", "dinhKy": true}'),
   ('108', 'Thu hồi các khoản đi ký cược, ký quỹ', '{"loai": "thu", "dinhKy": true}'),
   ('109', 'Thu từ thanh lý, nhượng bán', '{"loai": "thu", "dinhKy": false}'),
   ('110', 'Thu tiền từ lãi cổ tức', '{"loai": "thu", "dinhKy": false}'),
   ('111', 'Thu khác', '{"loai": "thu", "dinhKy": false}'),
   ('200', 'Chi tiền mua TSCĐ', '{"loai": "chi", "dinhKy": false}'),
   ('201', 'Chi tiền mua CCDC', '{"loai": "chi", "dinhKy": false}'),
   ('202', 'Chi mua hàng hóa thanh toán ngay', '{"loai": "chi", "dinhKy": false}'),
   ('203', 'Chi trả nợ từ mua hàng', '{"loai": "chi", "dinhKy": false}'),
   ('204', 'Chi trả nợ từ hợp đồng mua', '{"loai": "chi", "dinhKy": false}'),
   ('205', 'Chi tiền lương', '{"loai": "chi", "dinhKy": true}'),
   ('206', 'Chi tiền thưởng', '{"loai": "chi", "dinhKy": true}'),
   ('207', 'Chi tiền phụ cấp', '{"loai": "chi", "dinhKy": true}'),
   ('208', 'Chi thanh toán bảo hiểm', '{"loai": "chi", "dinhKy": false}'),
   ('209', 'Chi tiền tạm ứng', '{"loai": "chi", "dinhKy": true}'),
   ('210', 'Chi tiền công tác phí', '{"loai": "chi", "dinhKy": true}'),
   ('211', 'Chi tiền điện', '{"loai": "chi", "dinhKy": true}'),
   ('212', 'Chi tiền nước', '{"loai": "chi", "dinhKy": true}'),
   ('213', 'Chi tiền điện thoại', '{"loai": "chi", "dinhKy": true}'),
   ('214', 'Chi tiền thuê văn phòng, cửa hàng, thuê tài sản', '{"loai": "chi", "dinhKy": true}'),
   ('215', 'Chi tiền bốc dỡ, vận chuyển', '{"loai": "chi", "dinhKy": true}'),
   ('216', 'Chi tiền hoa hồng đại lý', '{"loai": "chi", "dinhKy": true}'),
   ('217', 'Chi tiền bảo trì, bảo dưỡng tài sản', '{"loai": "chi", "dinhKy": false}'),
   ('218', 'Chi tiền mua văn phòng phẩm', '{"loai": "chi", "dinhKy": true}'),
   ('219', 'Chi tiền nộp thuế', '{"loai": "chi", "dinhKy": false}'),
   ('220', 'Chi tiền trả tiền lãi vay, chi phí tài chính', '{"loai": "chi", "dinhKy": true}'),
   ('221', 'Chi tiền đào tạo cán bộ', '{"loai": "chi", "dinhKy": false}'),
   ('222', 'Chi tiền hội nghị', '{"loai": "chi", "dinhKy": false}'),
   ('223', 'Chi tiền tiếp khách', '{"loai": "chi", "dinhKy": true}'),
   ('224', 'Chi tiền tuyển dụng', '{"loai": "chi", "dinhKy": true}'),
   ('225', 'Chi tiền quảng cáo, giới thiệu sản phẩm, hàng hóa', '{"loai": "chi", "dinhKy": true}'),
   ('226', 'Chi tiền cầm cố, ký cược, ký quỹ', '{"loai": "chi", "dinhKy": true}'),
   ('227', 'Chi tiền đầu tư xây dựng cơ bản', '{"loai": "chi", "dinhKy": false}'),
   ('228', 'Chi khác', '{"loai": "chi", "dinhKy": false}'),
   ('229', 'Chi tiền trả nợ gốc vay', '{"loai": "chi", "dinhKy": false}')
 ) AS v(code, name, extra)
ON CONFLICT (tenant_id, kind, code) DO UPDATE SET name = EXCLUDED.name, parent_code = NULL, is_active = true, extra = public.dimensions.extra || EXCLUDED.extra;

DELETE FROM public.dimensions d
 WHERE d.kind = 'cash_item' AND d.code NOT IN ('100', '101', '102', '103', '104', '105', '106', '107', '108', '109', '110', '111', '200', '201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212', '213', '214', '215', '216', '217', '218', '219', '220', '221', '222', '223', '224', '225', '226', '227', '228', '229')
   AND NOT EXISTS (SELECT 1 FROM public.ledger_lines l WHERE l.tenant_id = d.tenant_id AND l.dims->>'cashItem' = d.code);
UPDATE public.dimensions SET is_active = false
 WHERE kind = 'cash_item' AND code NOT IN ('100', '101', '102', '103', '104', '105', '106', '107', '108', '109', '110', '111', '200', '201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212', '213', '214', '215', '216', '217', '218', '219', '220', '221', '222', '223', '224', '225', '226', '227', '228', '229');
