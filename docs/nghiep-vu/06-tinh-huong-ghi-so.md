# Tình huống ghi sổ: bán, thu nợ, hoàn hàng, sửa, huỷ, quà tặng

Mỗi tình huống dưới đây ghi rõ: chứng từ gửi vào là gì, bút toán ra sao, và **lưu vào những bảng nào**. Tài khoản theo cấu hình mặc định (lý do XBA, nhóm hàng HH-BANLE); đơn vị đổi cấu hình thì tài khoản đổi theo.

Ví dụ chung: 1 hộp sữa giá **300.000** chưa thuế, thuế 8% **24.000**, tổng **324.000**; giá vốn **200.000**.

## Tóm tắt: khi nào đảo, khi nào ghi mới

| Tình huống | Cách ghi | Bút toán cũ | Liên kết (`ledger_links`) |
|---|---|---|---|
| Bán, thu nợ, nhập mua, chuyển kho | Ghi bút toán mới | — | — |
| **Hoàn hàng** (khách trả lại) | **Ghi bút toán mới** (hàng bán bị trả lại) | Giữ nguyên, vẫn có hiệu lực | `return` → bút toán bán gốc |
| **Sửa phiếu** (gửi phiên bản mới) | **Đảo** bút toán cũ (ghi số âm) + ghi bút toán đúng | Bị đảo, trạng thái "đã đảo" | `reversal` → bút toán cũ |
| **Huỷ phiếu** | **Đảo** bút toán cũ (ghi số âm) | Bị đảo | `reversal` → bút toán cũ |
| Quà tặng kèm (hàng 0 đồng) | Nằm trong chính phiếu bán | — | — |
| Hoá đơn mua vào về muộn | Chờ định khoản lại; định khoản lại = đảo + ghi lại (thêm thuế đầu vào) | Bị đảo | `reversal` |
| Sai sót ở kỳ đã khoá | Phiếu kế toán điều chỉnh ở kỳ sau | Giữ nguyên | `adjustment` (dành sẵn) |

**Quy tắc nhớ**: chuyện **mới xảy ra** (khách trả hàng, khách trả nợ) thì **ghi mới**. Chuyện **ghi sai** (nhập nhầm giá, phiếu không có thật) thì **đảo**.

## 1. Bán lẻ, khách trả tiền ngay

Chứng từ: `sale` có `payments: [{ methodCode: 'TM', amount: 324000 }]`.

| Nợ | Có | Số tiền | Phần |
|---|---|---|---|
| 1311 | 51111 | 300.000 | tiền hàng |
| 1311 | 33311 | 24.000 | thuế |
| 1111 | 1311 | 324.000 | thanh toán |
| 6321 | 1561 | 200.000 | giá vốn (nếu phiếu đã có giá vốn; không thì ghi khi tính giá vốn cuối tháng) |

1311 của khách này về 0. Lưu:

| Bảng | Ghi gì |
|---|---|
| `accounting_events` | 1 dòng: nội dung phiếu nguyên bản (in lại được phiếu bán) |
| `ledger_entries`, `ledger_lines` | 1 bút toán trong sổ nhật ký chung |
| `ledger_balances_daily` | cộng phát sinh theo ngày, tài khoản, đối tượng |
| `tax_invoices`, `tax_invoice_lines` | có hoá đơn thì 1 hoá đơn bán ra (lên bảng kê, tờ khai) |
| `sales_lines`, `sales_payments` | dòng hàng, tiền mặt (báo cáo bán hàng) |
| `inventory_movements` | hàng ra khỏi kho (nhập xuất tồn, giá vốn) |

## 2. Bán chịu

Như trên nhưng `payments: []`. Không có dòng "thanh toán", nên 1311 của khách **dư Nợ 324.000**. Lên Sổ chi tiết công nợ, tuổi nợ, công nợ theo mặt hàng, theo nhân viên (nếu phiếu có `employee`).

## 3. Khách trả nợ

Chứng từ: `customer_payment`, `methodCode: 'CK'`, 324.000.

| Nợ | Có | Số tiền |
|---|---|---|
| 11210005 (TK ngân hàng của hình thức CK) | 1311 | 324.000 |

Lưu: `accounting_events`, `ledger_entries` / `ledger_lines`, `ledger_balances_daily`. Không có hoá đơn, không có dòng hàng.

## 4. Hoàn hàng: khách trả lại hàng

Chứng từ: `sale_return`, `originalDocKey` = docKey của phiếu bán gốc, trả lại tiền mặt.

| Nợ | Có | Số tiền | Ý nghĩa |
|---|---|---|---|
| 52131 | 1311 | 300.000 | hàng bán bị trả lại (giảm doanh thu) |
| 33311 | 1311 | 24.000 | giảm thuế đầu ra |
| 1561 | 6321 | 200.000 | hàng nhập lại kho, giảm giá vốn |
| 1311 | 1111 | 324.000 | trả tiền lại khách |

**Đây không phải bút toán đảo.** Bút toán bán gốc giữ nguyên, vẫn có hiệu lực, vì việc bán đã thật sự xảy ra. Ghi riêng như vậy thì báo cáo kết quả kinh doanh có chỉ tiêu "Các khoản giảm trừ doanh thu" (521). Nếu đảo bút toán bán thì số liệu hàng trả lại biến mất.

Lưu:

| Bảng | Ghi gì |
|---|---|
| `accounting_events` | 1 dòng mới cho phiếu hoàn (in lại được phiếu hoàn) |
| `ledger_entries`, `ledger_lines` | bút toán mới |
| **`ledger_links`** | `return`: bút toán hoàn → bút toán bán gốc, mỗi bộ sổ một dòng |
| `tax_invoices` | hoá đơn điều chỉnh giảm, `sign = -1` (bảng kê, tờ khai ghi âm) |
| `sales_lines`, `sales_payments` | `sign = -1` (báo cáo bán hàng trừ đi) |
| `inventory_movements` | hàng vào lại kho |

Hoàn hàng **đổi sang hàng khác** (đối trừ, không trả tiền): phiếu hoàn không có `payments`, khách dư Có 1311; phiếu bán hàng mới sẽ trừ vào số dư đó.

## 5. Sửa phiếu bán (hệ thống bán hàng gửi phiên bản mới)

Ví dụ phiếu 324.000 bị sửa giá thành 216.000 (200.000 + thuế 16.000). Bên bán hàng gửi lại cùng `docKey`, `version: 2`.

| Bút toán | Nợ 1311 | Có 51111 | Có 33311 |
|---|---|---|---|
| Gốc (v1) | 324.000 | 300.000 | 24.000 |
| **Đảo** v1 (ghi số âm) | −324.000 | −300.000 | −24.000 |
| Mới (v2) | 216.000 | 200.000 | 16.000 |

Lưu:

| Bảng | Ghi gì |
|---|---|
| `accounting_events` | dòng cũ được cập nhật sang nội dung v2 |
| `accounting_event_versions` | cất nguyên bản v1 (tra lại được) |
| `ledger_entries`, `ledger_lines` | **thêm** bút toán đảo + bút toán mới; bút toán v1 không bị sửa, chỉ đánh dấu "đã đảo" |
| **`ledger_links`** | `reversal`: bút toán đảo → bút toán v1 |
| `tax_invoices`, `sales_lines`, `sales_payments`, `inventory_movements` | ghi lại theo v2 (đây là bảng tra cứu dựng từ chứng từ, không phải sổ kế toán) |

Sổ và báo cáo mặc định chỉ hiện bút toán đang hiệu lực (v2). Tích "Hiện cả bút toán gốc đã sửa và bút toán ghi số âm" để thấy đủ ba bút toán.

## 6. Huỷ phiếu

Phiếu không có thật (lập nhầm). Chỉ có bút toán **đảo** v1, không có bút toán mới.

- `accounting_events.status = 'cancelled'`, lý do huỷ lưu ở `error_message`.
- `ledger_links`: `reversal`.
- `tax_invoices`, `sales_lines`, `inventory_movements` của phiếu bị xoá khỏi bảng tra cứu.

Hoá đơn đã phát hành mà huỷ thì cần hoá đơn huỷ / thay thế theo quy định hoá đơn điện tử. Phần mềm kế toán chỉ phản ánh trạng thái hoá đơn bên hệ thống bán hàng gửi sang.

## 7. Quà tặng kèm, hàng khuyến mại

Dòng hàng `isGift: true`, tiền 0, nằm **trong chính phiếu bán**.

| Nợ | Có | Số tiền |
|---|---|---|
| 6321 (hoặc 64184 chi phí khuyến mại, nếu lý do bật "giá vốn hàng tặng vào chi phí khuyến mại") | 1561 | giá vốn hàng tặng |

Không có doanh thu, không có thuế đầu ra (đúng với hàng khuyến mại đã đăng ký). Không đảo, không liên kết.

## 8. Hoá đơn mua vào về muộn

Phiếu nhập mua đã định khoản (chưa có hoá đơn). Kế toán bổ sung số, ngày hoá đơn ở màn **Bổ sung thông tin thuế (ACC78)**:

- `tax_info_patches`: lưu phần bổ sung. Nội dung gốc ở `accounting_events` không đổi.
- Chứng từ chuyển về **chờ định khoản lại** ở ACC14. Kế toán định khoản lại thì **đảo** bút toán cũ (`ledger_links`: `reversal`) + ghi bút toán mới (thêm Nợ 1331), nhật ký định khoản ghi `repost`.
- `tax_invoices`: thêm hoá đơn mua vào; kỳ kê khai theo lựa chọn ở ACC78.

## 9. Sai sót phát hiện sau khi đã khoá kỳ

Kỳ đã khoá thì không ghi, không đảo được vào kỳ đó. Kế toán lập **phiếu kế toán** điều chỉnh ở kỳ đang mở (ghi bổ sung hoặc ghi số âm phần chênh lệch). Loại liên kết `adjustment` trong `ledger_links` để dành cho trường hợp này (chưa có ô chọn bút toán gốc trên phiếu kế toán).
