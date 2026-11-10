# 17. Phiếu chuyển kho lập trên phần mềm kế toán

<!-- [2026-11-10 08:30 PM Nguyễn Văn Thủy] PHASE-026 — phiếu chuyển kho KHO01 (đóng góp) -->

Phần mềm kế toán là gốc. Phiếu chuyển kho lập ở **KHO01**. Website bán hàng vẫn gửi phiếu chuyển qua cầu nối như trước; giữ cầu nối này để dùng khi cần.

## Dữ liệu

Bảng `stock_transfer_docs` (migration 0099): mỗi dòng là một phiếu, có cả hai đầu.

| Cột | Ý nghĩa |
|---|---|
| `from_branch_code`, `from_warehouse` | Đầu xuất. Kho lưu là mã kho thật: trống thì đã quy về kho mặc định khi lưu |
| `to_branch_code`, `to_warehouse` | Đầu nhập |
| `status` | `shipped` đã xuất, chờ nhận · `received` đã nhận · `rejected` bên nhận từ chối · `cancelled` đã huỷ |
| `lines` | `[{lineKey, sku, name, unit, qty, receivedQty, lotNo, expDate, note}]`. `receivedQty` trống nghĩa là nhận đủ |
| `out_doc_key`, `in_doc_key` | `erp:ck:<id>:out` / `erp:ck:<id>:in`: hai chứng từ trong sổ |

## Vào sổ

Không có sổ riêng. Mỗi phiếu thành **hai chứng từ `transfer` một đầu** (`leg`) qua `postDocumentIn` của lõi, cùng `extra.transferGroup = erp:ck:<id>` để Bảng kê chuyển kho (HH01) ghép hai đầu.

| Việc | Chứng từ | Tồn | Bút toán |
|---|---|---|---|
| Ghi phiếu | Đầu xuất (`leg: out`), ngày phiếu | Chi nhánh + kho xuất giảm | Nợ 1579 / Có 1561 (khác đơn vị hạch toán: 13681) |
| Nhận hàng | Đầu nhập (`leg: in`), ngày nhận, theo số thực nhận | Chi nhánh + kho nhập tăng | Nợ 1561 / Có 1579 |
| Sửa | Phiên bản mới của từng đầu đang có hiệu lực | Ghi lại | Lõi đảo bút toán cũ bằng số âm |
| Bỏ nhận | Huỷ đầu nhập | Bên nhận trừ lại | Đảo |
| Từ chối | Huỷ đầu xuất | Bên chuyển trả lại | Đảo |
| Huỷ phiếu | Huỷ cả hai đầu | Như chưa chuyển | Đảo |

- **Nhận thiếu**: số dư 1579 còn lại bằng phần chênh. Kế toán xử lý tiếp bằng phiếu điều chỉnh / phiếu kế toán.
- Cùng chi nhánh (hai kho): mặc định ghi luôn đầu nhập khi lưu (`receiveNow`).
- Giá trị dòng gửi 0: giá vốn tháng tự định giá như mọi phiếu chuyển.

## Lô

- Đầu xuất: dòng có `lotNo` thì xuất đúng lô đó. Trống thì lõi tự chọn lô hạn sớm trước ở đúng kho xuất (`allocateLots`).
- Đầu nhập: dòng có lô thì nhận đúng lô đó. Không có thì đọc **các lô đầu xuất đã xuất** cho dòng (`documentLots`), chia số thực nhận theo thứ tự các lô đó. Phần còn lại vào lô không số.
- Màn gợi ý lô qua `GET /api/v1/lots/suggest?…&except=<out_doc_key>`. `except` để phiếu đang sửa không tự giữ chỗ lô của chính nó.

## API

| Lệnh | Đường dẫn |
|---|---|
| GET | `/api/v1/kho/transfers?from=&to=&branchCodes=&warehouses=&status=&search=`. `status=pending` lọc phiếu chờ nhận |
| GET | `/api/v1/kho/transfers/:id`: kèm `outLots` (lô đã xuất từng dòng) và `ledger` (trạng thái hai chứng từ trong sổ) |
| GET | `/api/v1/kho/transfers/stock?branchCode=&warehouse=&date=&skus=&exceptId=`: tồn để hiện ở cột Tồn |
| POST | `/api/v1/kho/transfers`: lập phiếu, tức là xuất |
| PUT | `/api/v1/kho/transfers/:id`: sửa |
| POST | `/api/v1/kho/transfers/:id/receive` `{receivedDate, lines:[{lineKey, receivedQty}], note}` |
| POST | `/api/v1/kho/transfers/:id/unreceive` · `/reject` `{reason}` · `/cancel` `{reason}` |

Action tương ứng: `kho.transfer.create / update / receive / unreceive / reject / cancel` (quyền `documents:write`).

## Kiểm thử

`apps/api/test/phieu-chuyen-kho.test.ts` kiểm các tình huống:
- xuất xong thì trừ tồn ngay;
- nhận thiếu đúng lô;
- sửa phiếu đã nhận;
- bỏ nhận, từ chối, huỷ;
- cùng chi nhánh thì nhận luôn, trùng kho thì chặn;
- lọc danh sách.
