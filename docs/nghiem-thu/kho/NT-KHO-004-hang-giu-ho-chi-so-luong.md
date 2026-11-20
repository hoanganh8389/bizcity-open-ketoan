# NT-KHO-004 · Hàng nhận giữ hộ (kho KNB): chỉ ghi số lượng, không ghi giá trị
<!-- [2026-11-20 kiennt] NGHIEM-THU — tạo phiếu theo quyết định người dùng: hàng giữ hộ chỉ ghi nhận số lượng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Kho |
| Màn hình / luồng | Mọi chứng từ có dòng hàng ở kho thuộc loại **không thuộc sở hữu** (KNB – Kho hàng nhận giữ hộ): phiếu nhập / xuất kho khác, chuyển kho, mua, bán; giá vốn tháng |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 20/11/2026 |
| Trạng thái | Đã chốt (kiennt, 20/11/2026) |

## 1. Quyết định

- **Hàng nhận giữ hộ chỉ ghi số lượng, không ghi giá trị.** Hàng của bên khác không phải tài sản của đơn vị → không vào sổ cái, không vào giá vốn.
- **Chặn chuyển kho** giữa kho giữ hộ và kho của đơn vị (cả hai chiều). Hàng giữ hộ thành của mình (chủ hàng bán / tặng lại): xuất trả khỏi kho KNB (chỉ số lượng) + lập phiếu nhập mua / nhận quà vào kho của mình (có giá trị, có chứng từ).
- Phiếu vào / ra kho giữ hộ có ghi đơn giá, thành tiền → **tự bỏ giá trị** (thành tiền = 0), giữ số lượng.

## 2. Hiện trạng (lỗ hổng)

- Quy tắc "hàng không thuộc sở hữu không ghi sổ kho" (13/11) mới chặn việc **đặt TK** cho loại kho. Phần ghi sổ không đọc cờ thuộc sở hữu: phiếu có giá trị vào kho KNB (TK trống) vẫn sinh bút toán theo TK kho ngầm định (1561).
- Giá vốn tháng tính một đơn giá chung cho mọi kho của đơn vị hạch toán → số lượng giữ hộ (giá trị 0) bị cộng vào tồn, **kéo đơn giá bình quân xuống**.
- Luật "loại kho dùng cho nghiệp vụ" mới kiểm ở phân hệ Mua hàng, cửa nhận chứng từ chung chưa kiểm.

## 3. Sau khi sửa

| Chứng từ | Dòng ở kho giữ hộ |
|---|---|
| Nhập / xuất kho khác (điều chỉnh) | Thành tiền = 0, giữ số lượng → thẻ kho có số lượng, **không** bút toán |
| Chuyển kho giữ hộ → giữ hộ | Thành tiền = 0, không bút toán |
| Chuyển kho giữ hộ ↔ kho của đơn vị | **Chặn**: "Không chuyển giữa kho giữ hộ … và kho của đơn vị … — hàng giữ hộ chỉ theo dõi số lượng" |
| Mua / bán / trả hàng — dòng có giá trị | **Chặn**: "Kho … là kho hàng nhận giữ hộ — không mua / bán có giá trị" |
| Mua / bán — dòng hàng tặng (0 đồng) | Nhận; không tính vào giá vốn |
| Giá vốn tháng | Loại kho không thuộc sở hữu **luôn tính riêng** (như ô "Loại kho tính chung" bỏ chọn) → tồn giữ hộ không kéo đơn giá kho của đơn vị |

- Kho của dòng để trống = kho mặc định của chi nhánh (như cách ghi sổ hiện nay).
- Chứng từ đã ghi trước bản sửa giữ nguyên; muốn bỏ giá trị thì ghi lại chứng từ.

## 4. Phạm vi

Tệp:
- `packages/kernel/src/modules/inventory/kho-giu-ho.ts` (đề xuất — tạo khi code) — một hàm kiểm / bỏ giá trị dùng chung.
- `packages/kernel/src/modules/documents/document.service.ts` — gọi hàm trên ở cửa nhận (mọi đường nộp chứng từ).
- `packages/kernel/src/modules/inventory/costing.service.ts` — loại kho không thuộc sở hữu luôn tính riêng.
- `apps/api/test/nt-kho-004-hang-giu-ho.test.ts` (đề xuất); `docs/huong-dan/loai-kho.md`.

Lõi (kernel) — người chỉ đạo đồng ý sửa. **Không** đụng `posting/rules/stock.rule.ts`, `posting/account-resolver.ts` (đang thuộc S024-33): dòng tiền 0 vốn đã không sinh bút toán.

## 5. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Phiếu nhập kho khác 10 hộp, 1.000.000đ vào kho KNB | Ghi được; thẻ kho KNB +10; thành tiền 0; không bút toán |
| 2 | Phiếu xuất kho khác 4 hộp khỏi kho KNB | Thẻ kho −4; không bút toán |
| 3 | Chuyển kho KNB → kho hàng kinh doanh | Bị chặn, báo rõ |
| 4 | Chuyển kho hàng kinh doanh → KNB | Bị chặn, báo rõ |
| 5 | Phiếu bán có dòng ở kho KNB, có tiền | Bị chặn, báo rõ |
| 6 | Tính giá vốn tháng có tồn ở cả kho kinh doanh và KNB | Đơn giá kho kinh doanh không đổi so với khi không có hàng giữ hộ |

## 6. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test | `apps/api/test/nt-kho-004-hang-giu-ho.test.ts` (đề xuất); 4 lệnh kiểm |

## 7. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 8. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 20/11/2026 | Tạo và chốt: chỉ số lượng; chặn chuyển giữ hộ ↔ của mình; tự bỏ giá trị |
