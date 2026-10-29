# 08. Sửa và huỷ chứng từ

Sổ kế toán **không được sửa, không được xoá**. Sửa sai bằng cách ghi số âm bút toán cũ rồi ghi bút toán mới; phần mềm kế toán tự làm việc này, bên gửi chỉ cần gửi đúng như sau.

## Sửa chứng từ

Gửi lại **cùng `docKey`** với **`version` lớn hơn** và toàn bộ nội dung mới (không gửi phần chênh lệch).

| Gửi | Kết quả |
|---|---|
| Cùng `docKey`, cùng `version`, đã ghi sổ | `unchanged` — không làm gì |
| Cùng `docKey`, `version` lớn hơn | Bút toán cũ được ghi số âm, ghi bút toán theo nội dung mới, bản cũ lưu vào lịch sử |
| Cùng `docKey`, `version` nhỏ hơn bản đang có | `409 CONFLICT` — bị từ chối |

Cách tăng `version` đơn giản ở bên gửi: lưu `version` đã gửi cùng mã băm nội dung; nội dung đổi thì tăng 1.

Ví dụ chuyển kho: bước "đã nhận" chính là một lần sửa (`version` 1 → 2, `status` → `received`).

## Huỷ chứng từ

```
POST /api/v1/documents/cancel
{ "docKey": "pos:CN01:sale:3058", "reason": "Khách huỷ đơn" }
```

Mẫu: [`vi-du/huy-chung-tu.json`](vi-du/huy-chung-tu.json). Kết quả `{ "reversed": <số bút toán đã ghi số âm> }`. Chứng từ được bỏ khỏi bảng kê hoá đơn, khỏi số liệu bán hàng và tồn kho.

## Kỳ đã khoá sổ

- Gửi chứng từ mới hoặc phiên bản mới vào tháng đã khoá sổ: nhận `status: "error"`, mã `PERIOD_LOCKED`. Chứng từ vẫn được lưu; bên gửi không cần làm gì thêm, kế toán quyết định mở khoá hoặc ghi điều chỉnh sang kỳ sau.
- Huỷ chứng từ thuộc tháng đã khoá: bị từ chối, HTTP 409, mã `PERIOD_LOCKED`. Báo kế toán xử lý.
