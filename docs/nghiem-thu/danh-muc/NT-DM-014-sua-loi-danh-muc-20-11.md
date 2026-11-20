# NT-DM-014 · Sửa lỗi danh mục đợt kiểm thử 20/11/2026 — nhập Excel mặt hàng (nhóm hàng), loại kho (TK, nhập Excel)
<!-- [2026-11-20 kiennt] NGHIEM-THU — gộp 3 lỗi của bảng theo dõi kiểm thử (dòng 32, 34, 35; người test Phương) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Danh mục |
| Màn hình | DM10 Mặt hàng → Nhập Excel · DM18 Loại kho (form Sửa, Nhập / Xuất Excel) |
| Bộ phận yêu cầu | Kiểm thử (Phương) |
| Ngày tạo | 20/11/2026 |
| Trạng thái | Đã chốt (kiennt, 20/11/2026 — gộp 3 lỗi, làm luôn) |

Dòng 33 của bảng theo dõi chưa có nội dung (cột hiện trạng trống) — ngoài phiếu này.

## L1 · Nhập Excel mặt hàng nhận nhóm hàng không thuộc ngành / nhãn (bảng theo dõi dòng 32)

**Hiện tượng.** Nhãn Vinamilk (ngành Sữa bột) không có nhóm mã `26`. Nhập Excel dòng ghi Ngành Sữa bột, Nhãn Vinamilk, Nhóm `26` → phần mềm nhận nhóm "Sữa bà bầu" (nhóm mã `26` ở nhãn khác), dòng báo "Thêm mới" hợp lệ.

**Nguyên nhân.** Cột Nhóm hàng được tra theo mã / tên trên **toàn danh mục**, không đối chiếu với Ngành, Nhãn cùng dòng; dòng không ghi Ngành / Nhãn thì phần mềm còn tự gán Ngành / Nhãn theo nhóm vừa tra được.

**Sau khi sửa.**
- Dòng có Ngành và / hoặc Nhãn: nhóm phải **nằm dưới** đúng nhãn / ngành đó. Tra mã hoặc tên nhóm chỉ trong nhánh đó.
- Nhóm không có trong nhánh → **lỗi**, dòng không ghi: "Nhóm hàng "26" không có dưới nhãn Vinamilk (ngành Sữa bột)". Không tự gán sang nhóm khác.
- Mã hàng mới đúng 9 chữ số mà 6 số đầu (Ngành 2 + Nhãn 3 + Nhóm 1) khác đoạn mã của nhóm → **lỗi** "Mã hàng … không khớp đoạn mã của nhóm … (…)".

## L2 · Loại kho KNB: chọn được TK nhưng Ghi báo lỗi (dòng 34)

**Hiện tượng.** Sửa loại kho KNB – Kho hàng nhận giữ hộ, ô Tài khoản hạch toán hiện 1569; bấm Ghi báo "Hàng không thuộc sở hữu không ghi sổ kho — để trống TK kho", không ghi được.

**Nguyên nhân.** Máy chủ chặn đúng nghiệp vụ (hàng giữ hộ không phải tài sản của đơn vị → không ghi sổ kho). Form không hiện cờ *Thuộc sở hữu* (bỏ từ 13/11) nhưng vẫn mở ô Tài khoản → chọn được TK, đến lúc Ghi mới bị từ chối.

**Sau khi sửa.**
- Loại **không thuộc sở hữu**: ô Tài khoản khoá, ghi chú "Hàng nhận giữ hộ không thuộc sở hữu — không ghi sổ kho, để trống TK".
- Dữ liệu đang lỡ có TK: hiện cảnh báo, có nút **Bỏ TK** → Ghi được.
- Lưới loại kho: loại không thuộc sở hữu hiện "không ghi sổ" ở cột Tài khoản.

## L3 · Nhập Excel loại kho thiếu cột (dòng 35)

**Hiện tượng.** Tệp hợp lệ (tệp Xuất của màn) có cột mà bước nhập không nhận / không hiện.

**Sau khi sửa.**
- Xuất và Nhập cùng bộ cột: Mã · Tên loại kho · Công dụng · Tài khoản hạch toán · **Được bán** · **Thuộc sở hữu** · **Theo dõi hạn dùng** · **Hoạt động** (4 cột sau ẩn trên lưới, bật bằng nút Cột; luôn có trong tệp xuất) · **Số kho** (chỉ xem — có trong tệp, bước nhập nhận cột nhưng bỏ qua).
- Kiểm như máy chủ: không thuộc sở hữu thì không được bán và không có TK kho.

## Phạm vi

Tệp: `apps/api/src/modules/catalog/catalog-import.ts` (chỉ tra nhóm hàng theo ngành / nhãn, khớp đoạn mã), `apps/web/src/features/catalog/WarehouseTypesPage.tsx`, `apps/web/src/lib/nhapExcelDanhMuc.ts` (chỉ loại nhập Loại kho), `apps/api/test/nt-dm-014-sua-loi-danh-muc.test.ts` (đề xuất — tạo khi code), `docs/huong-dan/loai-kho.md`.

Chồng phạm vi PHASE-026 · mã số cha – con (Nguyễn Văn Thủy) ở `catalog-import.ts` — chỉ phần tra nhóm hàng.

## Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Nhập Excel mặt hàng: Ngành Sữa bột, Nhãn Vinamilk, Nhóm `26` (nhóm 26 ở nhãn khác) | Lỗi "không có dưới nhãn Vinamilk", dòng không ghi |
| 2 | Như 1 nhưng Nhóm là nhóm có thật dưới Vinamilk | Hợp lệ, nhóm đúng |
| 3 | Dòng chỉ ghi Nhóm (không Ngành / Nhãn), nhóm cấp 3 có thật | Hợp lệ như cũ, Ngành / Nhãn tự theo nhóm |
| 4 | Mã hàng mới 9 số, 6 số đầu khác đoạn mã của nhóm | Lỗi "không khớp đoạn mã của nhóm" |
| 5 | Sửa loại kho KNB | Ô Tài khoản khoá, có ghi chú; Ghi được |
| 6 | KNB đang lỡ có TK 1569 | Cảnh báo + nút Bỏ TK; bỏ rồi Ghi được |
| 7 | Xuất Excel Loại kho rồi nhập lại tệp đó | Đủ 9 cột được nhận (Số kho: chỉ xem), không lỗi, không đổi gì |
| 8 | Nhập dòng Thuộc sở hữu = Không, Được bán = Có | Lỗi "không thuộc sở hữu thì không được bán" |
| 9 | Nhập dòng Thuộc sở hữu = Không, có Tài khoản | Lỗi "không thuộc sở hữu không ghi sổ kho — để trống TK" |

## Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test | 4 lệnh kiểm; test L1 phía máy chủ |

## Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 20/11/2026 | Tạo, gộp dòng 32, 34, 35 của bảng theo dõi kiểm thử |
