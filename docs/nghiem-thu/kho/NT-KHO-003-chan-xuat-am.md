# NT-KHO-003 · Công tắc "Cho phép xuất quá số tồn" — chặn ở các màn lập tay trong kế toán
<!-- [2026-11-12 kiennt] NGHIEM-THU — tạo phiếu. -->

| | |
|---|---|
| Phân hệ | kho |
| Màn hình | Tuỳ chọn kho (công tắc); KHO01 Phiếu chuyển kho; MH11 Trả lại hàng mua |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 12/11/2026 |
| Trạng thái | Đã chốt (12/11/2026, kiennt) |

## 1. Mục đích quản trị
Đơn vị muốn kế toán **không lập được** phiếu làm kho âm (chuyển kho, trả hàng nhà cung cấp quá số đang có).
Theo R-GATE-9 / ADR-0020: mặc định **cho phép + nhắc** như hôm nay; chặn là lựa chọn của người có quyền
(`settings:write`), có lý do, ghi nhật ký. Chỉ áp cho **màn lập tay trong phần mềm kế toán**; chứng từ từ hệ thống bán hàng
(POS / WP) vẫn vào sổ (hàng đã bán thật) và vẫn được nhắc tồn âm như hôm nay (INVENTORY_NEGATIVE). Không sửa lõi.

## 2. Khai báo trước
- Khoá cài đặt mới `bizcity.kho.negative_stock` (registry `bizcity-settings`, chủ = phân hệ kho, lưu `tenants.settings.kho`):
  `allow_warn` (mặc định) · `block`.
- Chi nhánh CN-A, kho `KA-1`, `KA-2`; CN-B kho `KB-1`. Mặt hàng `HANG01`.

## 3. Các bước thao tác
1. Kho → Tuỳ chọn → "Cho phép xuất quá số tồn": đổi sang **Không**, ghi lý do (≥ 10 ký tự), Lưu.
2. Lập phiếu chuyển kho CN-A/KA-1 → CN-B/KB-1, ngày 10/11/2026, HANG01 số lượng 130. Bấm Ghi.
3. Sửa số lượng thành 120, Ghi.
4. Lập phiếu trả lại hàng mua CN-A/KA-1, ngày 10/11/2026, HANG01 số lượng 5 (sau bước 3). Ghi.

## 4. Số liệu đầu vào

| Ngày | Chứng từ | Chi nhánh / kho | HANG01 |
|---|---|---|---|
| 01/11/2026 | Nhập mua | CN-A / KA-1 | +100 |
| 08/11/2026 | Nhập mua | CN-A / KA-1 | +20 |
| 03/11/2026 | Nhập mua | CN-A / KA-2 | +30 |

## 5. Kết quả mong đợi

**Trên chứng từ / màn hình:**

| Mục | Mong đợi |
|---|---|
| Công tắc = Cho phép (mặc định), chuyển 130 | Hỏi "Vượt tồn … vẫn ghi?" như hôm nay; đồng ý thì ghi được |
| Công tắc = Không, chuyển 130 (tồn KA-1 ngày 10/11 = 120) | **Không ghi được**; báo theo mã lỗi: `HANG01 cần 130, tồn 120 ở KA-1 ngày 10/11/2026`; nút Ghi không vượt được |
| Công tắc = Không, chuyển 120 | Ghi được |
| Trả hàng mua 5 sau khi đã chuyển 120 | Không ghi được (tồn KA-1 = 0) |
| Chặn ở **máy chủ** | Gọi thẳng API lập phiếu (không qua giao diện) cũng bị từ chối, mã lỗi giống trên |
| Nhật ký | Đổi công tắc ghi người, giờ, giá trị cũ / mới, lý do |
| Phiếu bán từ POS làm âm kho KA-1 | Vẫn vào sổ; Việc hôm nay / kiểm chuẩn vẫn báo INVENTORY_NEGATIVE như cũ |

**Bút toán:** không đổi (công tắc chỉ quyết định có cho ghi hay không).

**Báo cáo phải thấy:** —

**Sai số làm tròn chấp nhận:** 0.

## 6. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Sửa phiếu chuyển kho đã ghi (100 → 110) khi công tắc = Không | Tính tồn **không trừ chính phiếu đang sửa**: tồn 120 ≥ 110 → cho ghi |
| 2 | Phiếu có hai dòng cùng mã HANG01 (60 + 70) | Cộng theo mã: 130 > 120 → chặn |
| 3 | Ngày phiếu 05/11 (tồn KA-1 ngày 05/11 = 100), chuyển 110 | Chặn (tồn theo ngày phiếu, không theo hôm nay) |
| 4 | Người không có quyền `settings:write` đổi công tắc | Không đổi được |
| 5 | Ghi lùi một phiếu xuất vào ngày trước một phiếu đã ghi, làm phiếu sau thành âm | Chỉ kiểm phiếu đang ghi tại ngày của nó; phiếu sau không bị huỷ, kiểm chuẩn nhắc như cũ |

## 7. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | `apps/api/test/chan-xuat-am.test.ts` |

| Mục | Mong đợi | Phần mềm | Chênh | Giải thích |
|---|---|---|---|---|
