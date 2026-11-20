# Module `tra-cuu` — Tra cứu

Nhóm **Tra cứu** ở đầu menu trái: các màn **chỉ đọc** để trả lời nhanh một câu hỏi nghiệp vụ. Sau này thêm màn tra cứu mới vào đây.

**Chỉ giao diện** (như `thiet-lap`, `thu-vien`): không action, không bảng, không sự kiện. Mỗi màn gọi API sẵn có của phân hệ / Core qua HTTP (`useApi()`). Module không import phân hệ khác (SC-MOD-1), nên phần tính toán nằm ở API của phân hệ sở hữu nghiệp vụ.

## Màn

| Mã | Đường dẫn | Màn | Quyền | API |
|---|---|---|---|---|
| TC01 | `/app/tra-cuu/chinh-sach` | Tra chính sách theo mã hàng | `mua-hang:chinh-sach-xem` | `GET /api/v1/purchase/policy-lookup` (Mua hàng) |

**Quyền:** mỗi màn tra cứu gác bằng quyền **xem** của chính dữ liệu nó tra — đúng quyền máy chủ chặn ở API đó. Module không khai quyền riêng: quyền chỉ để ẩn menu là quyền mồ côi (SC-AUTH-11), và người dùng sẽ phải xin hai quyền cho một màn.

Hướng dẫn người dùng: [docs/huong-dan/tra-cuu-chinh-sach.md](../../docs/huong-dan/tra-cuu-chinh-sach.md).

## TC01 — Tra chính sách theo mã hàng

Chọn mã hàng (và NCC, số lượng, ĐVT, đơn giá, chi nhánh, ngày). Máy chủ dựng **phiếu nhập giả một dòng** và chạy đúng bộ máy phiếu nhập thật (`syncGifts` → `computeDoc` → `promoBoard`, `exclusiveBySku` của `@bizcity/mua-hang-domain`), rồi trả từng chính sách khớp mã:

| Trạng thái | Nghĩa |
|---|---|
| Đang áp | Chính sách đang giảm tiền / tặng quà cho dòng này; "thắng áp riêng" nếu là chương trình áp riêng được chọn |
| Chưa đủ điều kiện | Khớp mã, chưa đạt SL tối thiểu / tổng đơn — kèm gợi ý mua thêm |
| Bị áp riêng chặn | Khớp mã nhưng mã đang nhận một chương trình áp riêng khác |
| Không dùng | Khớp mã nhưng bộ máy chọn nguồn khác (CK dòng chỉ lấy một nguồn; CK trên đơn chỉ lấy một chính sách) |

Cột **Nếu chỉ mình nó** cho biết chính sách đó giảm / tặng bao nhiêu khi đứng một mình — để so khi quyết định tích "Áp riêng" hay đặt ưu tiên. Có ≥ 2 chương trình áp riêng cùng khớp thì màn nói vì sao cái thắng thắng (ưu tiên, rồi lợi hơn, rồi mã chính sách).

Vì dùng lại đúng hàm của phiếu nhập, kết quả khớp phiếu thật lập cùng số liệu. Không lưu gì, không chạm sổ.

## Thêm một màn tra cứu

1. Màn ở `web/screens/<Ten>Page.tsx`, logic thuần ở `web/lib/` + test ở `test/`.
2. Một mục `menu` + một `routes` ở `web/index.tsx` (đường dẫn dưới `/app/tra-cuu/`, `permission` = quyền xem của màn).
3. `permission` của menu / route = quyền xem mà API được gọi đang chặn (không khai quyền mới).
4. Thêm đường dẫn vào nhóm `tra-cuu` ở `apps/web/src/layout/menu-gon.ts`, và `docs/huong-dan/<khoá menu>.md`.
5. Cần tính toán mới → API chỉ đọc ở phân hệ sở hữu nghiệp vụ (không đặt luật nghiệp vụ trong module này).
