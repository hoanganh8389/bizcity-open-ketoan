# NT-BH-037 · Đơn đặt hàng BH20, form khuyến mại BH18, đợt voucher cùng mẫu phiếu mua (khung phiếu ở `@bizcity/ui-kit`)
<!-- [2026-11-21 Võ Hoàng] NGHIEM-THU — chốt NT-BH-037 (anh Hoàng, 21/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — module `phieu-ban`, `pos` (khuyến mại), `voucher`; giao diện dùng chung `@bizcity/ui-kit` |
| Màn hình | BH20 Đơn đặt hàng (hộp thoại Lập / sửa đơn); BH18 Chương trình khuyến mại (form Thêm / Sửa); Voucher (form đợt voucher) |
| Ngày tạo | 21/11/2026 |
| Trạng thái | **Đã chốt 21/11/2026** (Võ Hoàng) |
| Căn cứ | Sau NT-BH-036 (BH10 / BH11 cùng mẫu phiếu mua, #521) anh Hoàng rà các màn: hộp thoại "Lập đơn đặt hàng" BH20 vỡ bố cục (ô bị ép hẹp, chữ xuống dòng), nút Hướng dẫn sát tiêu đề; form khuyến mại, đợt voucher khác mẫu |

## 1. Hiện trạng
- Ba form nằm trong **module** (`modules/<key>/web`), chỉ được import `@bizcity/ui-kit` (STD-EXT-3). ui-kit chỉ có `Modal` (khung hộp thoại chung, tự thêm nút Hướng dẫn ở tiêu đề) — không có khung phiếu kiểu phiếu mua.
- Khung phiếu kiểu phiếu mua đã có ở Core cho BH10 / BH11: `apps/web/src/components/phieu-hang/KhungPhieu.tsx` (NT-BH-036) — module không dùng được.

## 2. Đã chốt (21/11/2026, Võ Hoàng)
| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Làm màn nào | Chỉ **phần hành bán hàng của mình**: BH20 Đơn đặt hàng + **form khuyến mại** + **form đợt voucher**. Hộp xác nhận nhỏ (từ chối, ngừng, duyệt…) giữ `Modal` |
| Q2 | Màn của người khác (Chuyển kho KHO01 có 2 nút Hướng dẫn; Phiếu thu / chi tiền, tiền gửi, phiếu kế toán khác kiểu khác, không có nút Hướng dẫn) | **Không động gì** |
| Q3 | Module dùng khung phiếu thế nào | Thêm khung phiếu vào `@bizcity/ui-kit` (như lần 1.4.0-draft); **sửa luôn hợp đồng** `BIZCITY-EXTENSION-v1.md` §3c (1.5.0-draft) dù tệp đang trong giữ chỗ NT-HT-003 — **báo kiennt / khanhtd** |

## 3. Thiết kế (chữ chốt R-FLOW-2 — đổi `packages/ui-kit`, hợp đồng)
1. **ui-kit thêm 2 thành phần** (minor, chỉ thêm; chữ ký ở `BIZCITY-EXTENSION-v1.md` §3c):
   - `DocSheet` — khung cửa sổ một phiếu, bản thật = `KhungPhieu` của Core (`apps/web/src/lib/uiKitHost.ts` trỏ tới). Props: `title`, `badges?`, `total?: { label, value }`, `helpKey?`, `viewing?`, `readOnly?`, `onEdit?`, `onClose`, `sideTitle?`, `side?`, `footNote?`, `footer`, `keys?`, `children`. Một nút "? Hướng dẫn" duy nhất; không có `side` → thân một cột.
   - `DocSheetPanel` — một khối của cột Trợ lý (`title`, `badge?`, `children`), cùng kiểu khối "Kiểm tra / Khuyến mại / Tổng tiền" của phiếu mua.
2. `KhungPhieu` nới cho dùng chung: `total` không bắt buộc (form khuyến mại / voucher không có tổng tiền), `side` không bắt buộc. Hành vi BH10 / BH11 **không đổi**.
3. **BH20 Lập / sửa đơn** (`modules/phieu-ban/web/screens/OrderEditor.tsx`): `DocSheet` — tiêu đề "Đơn đặt hàng (mới) / số đơn" + nhãn trạng thái, tổng "Giá trị đơn"; khối đầu phiếu (cửa hàng, kho bán, ngày đơn, hiệu lực đến, khách, người đặt, SĐT, nguồn, ghi chú) trên lưới cột đủ rộng; thẻ **Hàng hoá** (bảng dòng), **Giao hàng** (thông tin giao + chuyến giao), **Lịch sử** (nhật ký đơn đang có); Trợ lý: *Kiểm tra*, *Giữ hàng* (đang giữ / thiếu tồn), *Tổng tiền*. Nút như hiện tại (Ghi, Gửi, Duyệt, Giao…, Đóng).
4. **Form khuyến mại** (`modules/pos/web/screens/khuyen-mai/KmForm.tsx`, `HanMucForm.tsx`): `DocSheet` — khối đầu (mã, tên, loại, hiệu lực, chi nhánh), thân theo loại như hiện tại; Trợ lý: *Kiểm tra* (lỗi đang hiện), *Tóm tắt* (áp cho, mức thưởng, hạn mức), *Trùng chương trình* (danh sách trùng đang có).
5. **Form đợt voucher** (`modules/voucher/web/screens/VoucherPage.tsx`): `DocSheet` — khối đầu (mã đợt, tên, loại, hiệu lực, chi nhánh), thân như hiện tại; Trợ lý: *Kiểm tra*, *Tóm tắt* (giá trị, điều kiện, số lượng).
6. **Không đổi nghiệp vụ**: lời gọi API, dữ liệu gửi, quyền, in giữ nguyên. Không sửa màn của người khác (Q2).

## 4. Kết quả mong đợi
| Mục | Mong đợi |
|---|---|
| BH20 "+ Lập đơn", mở đơn có sẵn | Một nút Hướng dẫn; bố cục đầu phiếu / thẻ / Trợ lý như phiếu mua; ô không bị ép hẹp |
| BH20 lập → gửi → giao → đóng | Kết quả như trước (test API nt-bh-023, 032, 035 đạt) |
| BH18 Thêm / Sửa khuyến mại | Cùng khung; lưu, duyệt như cũ |
| Thêm / sửa đợt voucher | Cùng khung; lưu như cũ |
| BH10 / BH11 | Không đổi |

## 5. Kiểm
- typecheck (`UiKitImpl` thiếu trường → không biên dịch), build web; test API các module đạt.
- Bản cài Docker dựng từ nhánh: chụp BH20 (mới / có sẵn), BH18, đợt voucher; lập + ghi thử một đơn BH20, một khuyến mại nháp.

## 6. Kết quả chạy
_(điền khi code xong)_

## 7. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 21/11/2026 | Tạo phiếu, chốt Q1–Q3, thiết kế §3; giữ chỗ code |
