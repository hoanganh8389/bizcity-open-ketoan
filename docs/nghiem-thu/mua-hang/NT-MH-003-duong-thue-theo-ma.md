# NT-MH-003 — Đường thuế theo mã ở mua hàng, kho, xuất quà

<!-- [2026-11-10 10:30 AM Nguyễn Văn Thủy] PHASE-026 — kịch bản test đường thuế theo mã (đóng góp) -->

## 1. Mục đích

Mỗi mã hàng đi trọn một đường thuế, để tồn thuế và giá vốn không loạn:

- Mã **gửi thuế** chỉ nhận hàng có hoá đơn đầu vào.
- Mã **không gửi thuế** (mã quà, Nội bộ) nhận hàng không hoá đơn.
- Xuất quà tặng chỉ từ mã không gửi thuế.

Căn cứ: tài liệu 14, mục *Quy tắc thuế theo mã*. Bám mô tả 25 trường hợp mua hàng (TH1, TH2, TH12, TH20).

## 2. Luật kiểm

| Chứng từ | Dòng | Mã gửi thuế | Mã không gửi thuế |
|---|---|---|---|
| Phiếu nhập, đơn đặt có hoá đơn (không phải quà) | Hàng mua, KM chia giá | Đạt | **Chặn** `tax_path_invoice` |
| Phiếu nhập có hoá đơn | KM người tiêu dùng (0đ) | **Nhắc** `tax_path_invoiced_gift` | Đạt |
| Nhận quà / quà tự mua **không** hoá đơn | Mọi dòng | **Chặn** `tax_path_gift`, chỉ mã quà cùng họ; chưa có thì báo khai báo danh mục | Đạt |
| Quà tự mua **có** VAT | Mọi dòng | Đạt | Đạt (thuế đầu vào của quà chờ kế toán chốt) |
| Xuất quà | Mọi dòng | **Nhắc** `tax_path_invoiced_gift` | Đạt |

Phía hệ thống bán hàng (WordPress, phiếu kho): `TGS_Item_Variant::ticket_tax_path`
- Nhập không hoá đơn (NMH9, NTR9, NTT9, NVT9) bằng mã gửi thuế: **chặn**.
- Nhập theo hoá đơn (NMH1, NMH3, NMH4, NTR1, NTT1, NVT1, NVT4), dòng hàng bằng mã không gửi thuế: **chặn**. Hàng tặng kèm không kiểm.
- Xuất tặng (XTA, XTA3) bằng mã gửi thuế: theo công tắc *Chặn tặng mã có gửi thuế*. Tắt thì vẫn lưu và ghi `gift_tax_warnings` vào phiếu; bật thì chặn.

Loại dòng trên phiếu mua tự suy theo **ô của mặt hàng**, không theo chữ cuối mã:
- Biến thể *Khuyến mại*, Loại hàng *Quà*, hoặc mã không gửi thuế → hàng tặng người tiêu dùng.
- Biến thể *Chia giá* → KM người bán, chia vào giá.

## 3. Kịch bản test

| # | Tình huống | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| 1 | TH2 — quà ngoài hợp đồng 05 thùng sữa, không hoá đơn | Phiếu Nhận quà, nguồn NCC ngoài hợp đồng, không VAT, chọn **mã sữa chính** | Chặn. Báo "chưa có mã không gửi thuế… tạo sản phẩm con" |
| 2 | TH2 sau khi tạo mã quà | DM10 → mã sữa → Thêm sản phẩm con, Biến thể *Khuyến mại*, bỏ tích Gửi lên thuế; lập lại phiếu bằng mã chính | Chặn, câu báo chỉ đúng mã quà vừa tạo |
| 3 | TH2 dùng mã quà | Phiếu Nhận quà bằng mã quà | Đạt, duyệt được |
| 4 | TH1 — nhập mua hoá đơn 3181 | Phiếu nhập có hoá đơn, dòng hàng chọn **mã quà** | Chặn `tax_path_invoice` |
| 5 | TH1 đúng mã | Dòng hàng mã chuẩn | Không có cảnh báo đường thuế |
| 6 | TH12 — KM người bán 120 chia giá trên hoá đơn | Dòng KM chia giá, mã chuẩn | Không nhắc |
| 7 | TH12 — KM người tiêu dùng 240 trên hoá đơn bằng mã chuẩn | Dòng KM người tiêu dùng mã chuẩn | Nhắc, không chặn |
| 8 | TH12 — KM người tiêu dùng bằng mã quà | Dòng KM người tiêu dùng mã quà | Không nhắc |
| 9 | TH20 — 30 bộ quà tự mua không VAT | Phiếu nhập quà tự mua, không VAT, mã gửi thuế | Chặn; dùng mã quà thì đạt |
| 10 | TH20 — 50 bộ quà tự mua có VAT | Phiếu nhập quà tự mua, có VAT | Không chặn |
| 11 | Xuất quà | Phiếu xuất quà bằng mã quà / mã gửi thuế | Mã quà: đạt. Mã gửi thuế: nhắc |
| 12 | WP — nhập NMH9 | Phiếu nhập kho lý do NMH9, mã gửi thuế | Chặn, nêu mã sai |
| 13 | WP — nhập NMH1 | Phiếu nhập kho NMH1, dòng hàng mã quà | Chặn |
| 14 | WP — xuất XTA | Phiếu xuất XTA bằng mã gửi thuế | Công tắc tắt: lưu, ghi cảnh báo. Bật: chặn |

**Bút toán:** không đổi định khoản. Luật chỉ chặn chọn sai mã.

## 4. Còn chờ kế toán chốt

- **Quà có hoá đơn** (KM người tiêu dùng ghi trên hoá đơn NCC, quà tự mua có VAT): ghi sổ thuế thế nào khi tặng khách. Hiện chỉ nhắc.
- **Phiếu chuyển đổi** mã chính sang mã quà khi hết quà: chưa làm.
- **Giá vốn:** quà không hoá đơn nằm ở mã riêng, nên giá vốn mã chính chỉ gồm hàng có hoá đơn và KM chia giá. Đúng hướng bản thuế. Phần quà giá 0 trong cùng mã (KM người tiêu dùng trên hoá đơn) vẫn tính như cũ cho tới khi kế toán chốt.

## 5. Kết quả chạy

- `apps/api/test/mua-hang-duong-thue.test.ts`: 7 ca, đạt (10/11/2026).
- Bộ Mua hàng hiện có (25 trường hợp, KB, 28/10, 30/10…): 125 ca đạt. Dữ liệu mẫu cập nhật: mã quà của phiếu nhận quà / quà tự mua không VAT được khai không gửi thuế.
- WordPress `TGS_Item_Variant::ticket_tax_path`: 11 ca, đạt (chạy tay trên máy local).
