# NT-DM-013 · Mặt hàng (DM10): mã biến thể — phần cuối nhận cả chữ số
<!-- [2026-11-20 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (ảnh form "Thêm mặt hàng" — Mã biến thể, ô chữ cuối) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Danh mục |
| Màn hình | DM10 Mặt hàng — Thêm mặt hàng, kiểu **Mã biến thể** (ô *chữ đầu* · mã cha · *chữ cuối*); Nhập Excel mặt hàng |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 20/11/2026 |
| Trạng thái | Đã chốt (kiennt, 20/11/2026 — chọn: chỉ phần **cuối** nhận số, phần đầu vẫn chỉ chữ cái) |

## 1. Yêu cầu

| Trước | Sau |
|---|---|
| Ô *chữ đầu* và *chữ cuối* chỉ nhận chữ cái A–Z (gõ số bị bỏ) | Ô **chữ đầu**: vẫn chỉ chữ cái. Ô **chữ cuối**: nhận **chữ cái và chữ số** |
| Tổng phần thêm tối đa 2 ký tự | Giữ nguyên |

Ví dụ mã cha `100011001`: `100011001Z`, `1000110015`, `10001100101`, `100011001Z1`, `A100011001`, `A100011001Z` đều là mã biến thể của `100011001`.

## 2. Vì sao phần đầu không nhận số

Phần mềm **suy mã cha từ mã hàng** (cả máy chủ và CSDL — trigger `products_parent_fill`). Nếu cả hai đầu nhận số, có mã đọc được hai cách: `1000110012` là `100011001` + cuối `2`, hay đầu `1` + `000110012`. Chỉ cho số ở cuối thì mã cha luôn là **9 chữ số ngay sau phần chữ đầu** — không nhập nhằng.

Thêm một ràng buộc để giữ một cách đọc: **có chữ đầu thì phần cuối chỉ chữ cái** (vd `A100011001Z` được, `A1000110015` không). Mã quà KM dạng chữ + 8 số (`Q12345678`) làm mã cha: phần cuối vẫn chỉ chữ cái.

Hướng này khớp `docs/nghiep-vu/12-phuong-an-bo-chu-khoi-ma-hang.md` (mã con = mã cha + số ở cuối).

## 3. Quy tắc suy mã cha (sau khi sửa)

| Dạng mã | Mã cha | Ghi chú |
|---|---|---|
| chữ 0–3 + 9 chữ số + chữ 0–3, có ít nhất một chữ | 9 chữ số | Như cũ (0115) |
| 9 chữ số + 1–3 ký tự chữ / số (không chữ đầu) | 9 chữ số đầu | **Mới** |
| 1 chữ + 8 chữ số + chữ 1–3 | 9 ký tự đầu | Như cũ |
| 9 chữ số (mã chính) | không có | Như cũ |

- Mã mới thêm qua form / Excel có dạng mới mà 9 số đầu chưa có trong danh mục → báo "chưa có mã cha … — khai mã cha trước" (như mã có đuôi chữ hiện nay).
- **Không** tính lại mã cha cho mặt hàng đang có: chỉ mặt hàng thêm mới hoặc đổi mã sau bản sửa.
- Biến thể (ô Biến thể) của mã đuôi số: mặc định **Thường**, chọn lại được trên form như mọi mã con.

## 4. Phạm vi

Tệp:
- `db/migrations/0170_ma_bien_the_duoi_so.sql` — thay hàm `bizcity_parent_from_sku` (không đổi trigger, không tính lại dữ liệu cũ).
- `apps/api/src/modules/catalog/sku-rule.ts` — `parentFromSku` trùng hàm SQL.
- `apps/api/src/modules/catalog/catalog.service.ts`, `apps/api/src/modules/catalog/catalog-import.ts` — chỉ câu báo ("2 ký tự" thay "2 chữ").
- `apps/web/src/features/catalog/ProductFullForm.tsx` — ô *chữ cuối* nhận số, `parentFromSku` phía form, gợi ý.
- `apps/api/test/nt-dm-013-ma-bien-the-duoi-so.test.ts`; `docs/huong-dan/mat-hang.md`.

Chồng phạm vi với **PHASE-026 · mã số cha – con** (Nguyễn Văn Thủy): `ProductFullForm.tsx`, `catalog.service.ts`, `catalog-import.ts` — chỉ sửa phần nêu trên; đã báo người giữ.

## 5. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Thêm mặt hàng → Mã biến thể, mã cha `100011001`, gõ `5` ở ô chữ cuối | Mã = `1000110015`; ghi được; mã cha `100011001` |
| 2 | Gõ `01` ở chữ cuối | Mã `10001100101`, mã cha `100011001` |
| 3 | Gõ `Z1` ở chữ cuối | Mã `100011001Z1`, mã cha `100011001` |
| 4 | Gõ `1` ở ô chữ đầu | Không nhận (bỏ ký tự số) |
| 5 | Chữ đầu `A`, gõ `5` ở chữ cuối | Không nhận số ở cuối khi đã có chữ đầu |
| 6 | Nhập Excel dòng mới `1000110015`, mã cha `100011001` có sẵn | Nhận là mã biến thể của `100011001` |
| 7 | Nhập Excel dòng mới `9990000015` (chưa có `999000001`) | Báo "Mã cha 999000001 chưa có" |
| 8 | Mã cũ có đuôi chữ (`100011001Z`, `A100011001`) | Như cũ |

## 6. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test | `apps/api/test/nt-dm-013-ma-bien-the-duoi-so.test.ts`; 4 lệnh kiểm |

## 7. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 8. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 20/11/2026 | Tạo và chốt: chỉ phần cuối nhận số; có chữ đầu thì phần cuối chỉ chữ cái |
