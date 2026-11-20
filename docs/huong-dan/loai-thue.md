# Loại thuế (ACC43)
<!-- [2026-11-19 kiennt] NT-DM-012 — loại thuế GTGT cố định theo quy định nhà nước: chỉ xem, dùng chung mua / bán, TK theo Quy tắc hạch toán (đóng góp) -->

<!-- [2026-11-20 kiennt] NT-DM-012 — đưa dòng giải thích từ màn ACC43 vào hướng dẫn (đóng góp) -->
Danh mục do phần mềm cấu hình sẵn theo quy định (Luật Thuế GTGT, nghị quyết giảm thuế) — **không thêm, sửa, xoá**; thuế suất thay đổi được cập nhật trong bản phần mềm mới. Một loại dùng cho cả phiếu mua và phiếu bán; tiền thuế ghi vào tài khoản ở **Quy tắc hạch toán (ACC41)**: mua hàng hoá, dịch vụ 1331 · mua tài sản cố định 1332 · bán ra 33311.

| Loại | Dùng cho | Hiệu lực | Căn cứ |
|---|---|---|---|
| KCT — Không chịu thuế | Hàng hoá, dịch vụ không chịu thuế GTGT | — | Luật Thuế GTGT 48/2024/QH15 |
| 0% | Hàng xuất khẩu, dịch vụ xuất khẩu… | — | Luật Thuế GTGT 48/2024/QH15 |
| 5% | Nhóm hàng hoá, dịch vụ thiết yếu theo Điều 9 Luật Thuế GTGT | — | Luật Thuế GTGT 48/2024/QH15 |
| 8% | Nhóm hàng được giảm từ 10% | đến hết 31/12/2026 | Nghị quyết 204/2025/QH15; Nghị định 174/2025/NĐ-CP |
| 10% | Thuế suất thông thường | — | Luật Thuế GTGT 48/2024/QH15 |
| KKKN — Không kê khai | Khoản không phải kê khai, tính nộp thuế GTGT | — | Luật Thuế GTGT 48/2024/QH15 và văn bản hướng dẫn |

## Một loại cho cả mua và bán

Không còn phân biệt "đầu ra" / "đầu vào": cùng một loại 10% dùng cho phiếu bán và phiếu mua. Chứng từ quyết định là hoá đơn bán ra hay mua vào. Mặt hàng chỉ khai **một** loại thuế.

## Tài khoản thuế — theo Quy tắc hạch toán

Loại thuế không khai tài khoản. Tiền thuế ghi vào tài khoản ở **Quy tắc hạch toán** (ACC41):

| Nghiệp vụ | Khoá | Tài khoản (TT 99/2025) |
|---|---|---|
| Bán hàng, trả hàng bán, phiếu thu Có 5… / 7… | Thuế GTGT đầu ra | 33311 |
| Mua hàng hoá, dịch vụ | Thuế GTGT đầu vào | 1331 |
| Mua tài sản cố định (Nợ 211 / 213 / 217 / 241) | Thuế GTGT đầu vào của TSCĐ | 1332 |

Phiếu thu / chi / kế toán: dòng Có TK 5… hoặc 7… là thuế đầu ra, còn lại là thuế đầu vào.

## Hiệu lực

Chứng từ có ngày ngoài hiệu lực của loại thuế thì **không ghi sổ được** và báo rõ (ví dụ 8% sau 31/12/2026). Ô chọn thuế làm mờ loại đã hết hiệu lực ở ngày chứng từ.

## Mã cũ (V…, R…)

Các mã cũ (R08, V10, V13K…) **giữ nguyên** để chứng từ đã ghi, máy bán POS và cầu nối website vẫn ghi sổ như trước. Tích **Xem mã cũ** để xem chúng kèm loại thay thế; ô chọn thuế không cho chọn mã cũ. Mặt hàng đang dùng mã cũ đã được đổi sang loại tương ứng.

Một số mã cũ chưa xác định được loại (R05B, R08B, R10B, V05B, V05S, V071, V20…): nhập Excel mặt hàng với mã đó sẽ **báo lỗi**, ghi lại bằng KCT, 0, 5, 8, 10 hoặc KKKN.

## Màn hình

Lưới chỉ xem: Mã, Loại thuế, Thuế suất, Nhóm bảng kê / tờ khai, Hiệu lực, Căn cứ. Tích *Xem mã cũ*: Mã cũ, Tên, Thuế suất, Chiều cũ, TK cũ, Thay bằng. Thanh nút: Nạp · Xuất. Màn này không còn Thêm / Sửa / Xoá / Nhập Excel.
