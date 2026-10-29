# 10. Chuyển tiền — `cash_transfer`

Hai trường hợp:

- **Chuyển tiền giữa hai chi nhánh** (cửa hàng nộp tiền về văn phòng, văn phòng bổ sung quỹ cửa hàng…): `toBranchCode` khác `branchCode`. Mẫu [`vi-du/chuyen-tien.json`](vi-du/chuyen-tien.json).
- **Trong một chi nhánh** (nộp tiền quỹ vào ngân hàng, rút tiền ngân hàng về quỹ): `toBranchCode` = `branchCode`, hai hình thức khác nhau. Mẫu [`vi-du/nop-tien-ngan-hang.json`](vi-du/nop-tien-ngan-hang.json).

```json
{
  "docType": "cash_transfer",
  "docKey": "quy:CN01:cash_transfer:451",
  "version": 1,
  "branchCode": "CN01",
  "toBranchCode": "CN02",
  "docNo": "CT0000451",
  "docDate": "2026-10-12",
  "fromMethodCode": "TM",
  "toMethodCode": "TM",
  "status": "received",
  "totals": { "total": 5000000 }
}
```

## Trường riêng

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `branchCode` | chuỗi | ✓ | Chi nhánh **chuyển** tiền |
| `toBranchCode` | chuỗi | ✓ | Chi nhánh **nhận** tiền (bằng `branchCode` nếu chuyển trong một chi nhánh) |
| `fromMethodCode` | chuỗi | | Hình thức phía chuyển, quyết định tài khoản tiền: `TM` quỹ tiền mặt, `CK` ngân hàng… Mặc định `TM` |
| `toMethodCode` | chuỗi | | Hình thức phía nhận. Mặc định `TM` |
| `fromBankCode` | chuỗi | | Mã tài khoản ngân hàng **rút** tiền (danh mục Tài khoản ngân hàng). Có thì tài khoản tiền phía chuyển là TK kế toán của ngân hàng đó, bỏ qua `fromMethodCode` |
| `toBankCode` | chuỗi | | Mã tài khoản ngân hàng **nộp** tiền phía nhận, tương tự |
| `reasonCode` | chuỗi | | Lý do **chi** (phía chuyển). Bỏ trống = lý do mặc định "chuyển tiền giữa chi nhánh" |
| `toReasonCode` | chuỗi | | Lý do **thu** (phía nhận). Xem bảng Ghi sổ |
| `status` | `sent` · `received` | | `sent` đã chuyển, nơi nhận chưa xác nhận; `received` nơi nhận đã nhận (mặc định) |
| `totals.total` | tiền > 0 | ✓ | Số tiền chuyển |
| `lines`, `partner`, `invoice`, `payments` | | | Không dùng |

Hai bước giống chuyển kho: gửi `version: 1, status: "sent"` khi chuyển, rồi gửi lại cùng `docKey` với `version: 2, status: "received"` khi nơi nhận xác nhận. Không có bước xác nhận thì gửi một lần `received`.

**Kế toán xác nhận đã nhận tiền** (hệ thống bán hàng TGS: nhân viên cửa hàng không xác nhận). Chứng từ đến ở `sent`; kế toán đối chiếu quỹ / sao kê rồi bấm **Xác nhận đã nhận tiền** ở ACC14:

| Endpoint | Ai gọi | Việc |
|---|---|---|
| `POST /api/v1/documents/:id/confirm-receipt` `{ note? }` | Người dùng có quyền `documents:write` (khoá API bị từ chối) | Lưu xác nhận (số tiền, chi nhánh nhận, ngân hàng nhận lúc xác nhận) rồi định khoản lại: thêm bút toán nơi nhận |
| `DELETE /api/v1/documents/:id/confirm-receipt` | như trên | Bỏ xác nhận (nhầm): định khoản lại, đảo bút toán nơi nhận |
| `GET /api/v1/documents/receipt-confirmations?docKeys=a,b` | Hệ thống nguồn (khoá API) | Đọc xác nhận theo `docKey` để hiện trạng thái, khoá sửa phiếu |

Nguồn gửi bản mới đổi số tiền / chi nhánh nhận / ngân hàng nhận thì xác nhận hết hiệu lực (`valid: false`): định khoản lại đảo bút toán nơi nhận, kế toán xác nhận lại.

Hình thức ghi nợ (`CONGNO`, `DOI_TRU`) không phải tiền: không dùng được ở đây.

## Ghi sổ

| Trường hợp | Bút toán tại | Nợ | Có |
|---|---|---|---|
| Khác chi nhánh, cùng đơn vị hạch toán (mặc định) | Nơi chuyển (ngay) | 11319 tiền đang chuyển (đối tượng: nơi nhận) | Tiền phía chuyển (1111…) |
| | Nơi nhận (khi `received`) | Tiền phía nhận | 11319 (đối tượng: nơi chuyển) |
| Khác đơn vị hạch toán — **cấp tiền** (mặc định; hoặc lý do thu đối ứng 33681) | Nơi chuyển | 13681 phải thu nội bộ (nơi nhận) | Tiền phía chuyển |
| | Nơi nhận | Tiền phía nhận | 33681 phải trả nội bộ (nơi chuyển) |
| **Trả nợ nội bộ** — lý do thu đối ứng 13681 (TBNH "Thu tiền BH các CN khác"), hoặc lý do chi đối ứng 33681 | Nơi chuyển | 33681 phải trả nội bộ (nơi nhận) | Tiền phía chuyển |
| | Nơi nhận | Tiền phía nhận | 13681 phải thu nội bộ (nơi chuyển) |
| Cùng chi nhánh | Chi nhánh đó | Tiền phía nhận (112…) | Tiền phía chuyển (1111) |

Số dư 11319 = tiền đã chuyển mà nơi nhận chưa xác nhận. Cặp 13681 / 33681 theo từng chi nhánh cho biết chi nhánh nào đang nợ chi nhánh nào, như thu hộ / trả hộ.

Lý do:

- Lý do có cờ `postToLedger: false` (CPCT "Phiếu Chi chuyển tiền", TPCT "Phiếu Thu chuyển tiền" chép từ HTsoft — bên HTsoft không ghi sổ) coi như bỏ trống: dùng lý do mặc định và hạch toán theo bảng trên.
- Lý do chi có tài khoản đối ứng khác 13681 / 33681 thì dùng tài khoản đó thay cho 11319 ở cả hai phía.
- Lý do thu có tài khoản đối ứng khác (1311, 13888…): chưa có cách hạch toán phía chuyển cho cân → chứng từ **Lỗi định khoản**, chờ kế toán xác nhận.
