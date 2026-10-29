# API nhận chứng từ — tài liệu cho bên gửi

Viết cho team lập trình các hệ thống nghiệp vụ (bán hàng, kho, mua hàng…) cần gửi chứng từ sang phần mềm kế toán. Bên gửi lấy dữ liệu từ đâu là việc của bên gửi; tài liệu này quy định **gửi vào cái gì, theo khuôn nào**.

Mọi file mẫu trong [`vi-du/`](vi-du/) được kiểm tự động mỗi lần chạy test (`apps/api/test/api-examples.test.ts`): mẫu gửi vào phải ghi sổ thành công. Cứ chép mẫu rồi thay số là chạy được.

## Mục lục

| Trang | Nội dung | File mẫu |
|---|---|---|
| [01-quy-uoc.md](01-quy-uoc.md) | Địa chỉ, khoá API, khuôn phản hồi, mã lỗi, `docKey` / `version`, gửi lô | |
| [02-ban-hang.md](02-ban-hang.md) | Hoá đơn bán hàng `sale`, bán nội bộ cho chi nhánh khác | `ban-hang.json`, `ban-noi-bo.json` |
| [03-tra-hang-ban.md](03-tra-hang-ban.md) | Hàng bán trả lại `sale_return` | `tra-hang-ban.json` |
| [04-nhap-mua.md](04-nhap-mua.md) | Nhập mua hàng `purchase` | `nhap-mua.json` |
| [05-tra-hang-ncc.md](05-tra-hang-ncc.md) | Trả hàng nhà cung cấp `purchase_return` | `tra-hang-ncc.json` |
| [06-chuyen-kho.md](06-chuyen-kho.md) | Chuyển kho giữa chi nhánh `transfer` (hai bước: xuất, nhận) | `chuyen-kho-da-xuat.json`, `chuyen-kho-da-nhan.json` |
| [07-dieu-chinh-kho.md](07-dieu-chinh-kho.md) | Điều chỉnh kho, kiểm kê `stock_adjustment` | `dieu-chinh-kho-giam.json`, `dieu-chinh-kho-tang.json` |
| [08-sua-huy.md](08-sua-huy.md) | Sửa chứng từ (phiên bản mới), huỷ chứng từ | `huy-chung-tu.json` |
| [09-danh-muc.md](09-danh-muc.md) | Các mã phải khớp: chi nhánh, loại thuế, hình thức thanh toán, lý do | |
| [10-chuyen-tien.md](10-chuyen-tien.md) | Chuyển tiền giữa chi nhánh, nộp / rút tiền ngân hàng `cash_transfer` | `chuyen-tien.json`, `nop-tien-ngan-hang.json` |
| [11-thu-tien-khach.md](11-thu-tien-khach.md) | Thu tiền khách trả nợ, thu hộ chi nhánh khác `customer_payment` | `thu-tien-khach.json` |
| [12-tra-tien-ncc.md](12-tra-tien-ncc.md) | Trả tiền nhà cung cấp, trả hộ chi nhánh khác `supplier_payment` | `tra-tien-ncc.json` |
| [13-phieu-nhap-tay.md](13-phieu-nhap-tay.md) | **Đề xuất** — phiếu nhập tay trong phần mềm (bán, trả lại, mua, trả NCC, chuyển kho) `/api/v1/trade-documents` | `apps/web/src/phan-he/*/…/mau-*.json` |

## Năm điều phải nhớ

1. **Chỉ gửi sự việc**: bán / mua / chuyển gì, bao nhiêu, thuế bao nhiêu, thu chi bằng gì. **Không gửi tài khoản Nợ / Có**: định khoản là việc của phần mềm kế toán.
2. **Số tiền là số đã chốt ở nguồn**, đúng như trên hoá đơn. Phần mềm kế toán không tính lại thuế, chỉ kiểm tổng các dòng khớp tổng chứng từ (tới đồng lẻ).
3. **`docKey` duy nhất và không bao giờ đổi** cho mỗi chứng từ. Gửi lại cùng `docKey` + cùng `version` là an toàn (không ghi trùng).
4. **Sửa chứng từ = gửi lại cùng `docKey` với `version` lớn hơn.** Khi định khoản lại, phần mềm kế toán tự ghi số âm bút toán cũ rồi ghi bút toán mới.
5. **Mọi mã** (chi nhánh, loại thuế, hình thức thanh toán, lý do) phải có sẵn trong danh mục bên kế toán. Thiếu mã thì chứng từ báo lỗi, kế toán bổ sung rồi định khoản lại ở màn **Định khoản tự động (ACC14)**.

## Gửi thử nhanh

```bash
curl -X POST https://<máy chủ>/api/v1/documents \
  -H "X-Api-Key: <khoá API>" -H "Content-Type: application/json" \
  --data @docs/api/vi-du/ban-hang.json
```

Khoá API do kế toán tạo ở màn **Hệ thống → Khoá API** (chọn quyền "Gửi chứng từ"). Nên thử trên một **đơn vị thử nghiệm** trước khi gửi vào đơn vị thật.

Danh sách đầy đủ mọi API, thử trực tiếp trên trình duyệt: `https://<máy chủ>/api/docs`.

## Bên gửi tự kiểm sau khi gửi

| Việc | Lời gọi |
|---|---|
| Trạng thái một chứng từ | `GET /api/v1/documents?search=<docKey>` |
| Chứng từ đang lỗi | `GET /api/v1/documents?status=error` |
| Đối chiếu doanh thu, thuế theo ngày | `GET /api/v1/reports/sales-invoices?from=&to=&branchCodes=` |
