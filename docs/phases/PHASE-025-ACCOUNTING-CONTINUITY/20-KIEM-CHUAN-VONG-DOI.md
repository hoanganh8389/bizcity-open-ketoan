# PHASE-025 · 20 — Kiểm chuẩn vòng đời: Gate C
<!-- [2026-11-03 06:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — Gate C: kiểm theo sự kiện và theo vòng đời, họ mã CT-*, checklist xuất bán, điều kiện khoá kỳ -->

## 1. Ba cổng, ba thời điểm

| Cổng | Khi nào | Kiểm gì | Không đạt → |
|---|---|---|---|
| A — danh mục | lúc khai báo | khai báo đúng chưa | nháp |
| B — trước ghi sổ | lúc chứng từ vào | chứng từ đúng chưa | bể chờ |
| **C — vòng đời** | **sau ghi sổ** (ngay, theo lô), **đêm**, **trước khoá kỳ** | **các chứng từ có nối với nhau thành chuỗi đúng không** | mã `CT-*` trên dòng thời gian, Bàn đánh giá, chặn khoá kỳ với mức chặn |

Gate C không chặn ghi sổ (R-GATE-9: không dừng bán hàng). Nó chặn **khoá kỳ** (R-CONT-6).

## 2. Kiểm theo sự kiện kinh tế

| Sự kiện | Phải kiểm | Mã |
|---|---|---|
| Tạo / đổi mã hàng | `item_id` bất biến; mã không trùng hiệu lực; phiên bản hợp lệ; không đổi bản chất khi đã có tồn | `CT-MD-001..003` (+ Gate A) |
| Mua hàng | nhà cung cấp, mặt hàng, số lượng, giá, thuế, đơn vị tính, chính sách | Gate B (`IN-*`) |
| Nhập kho | tham chiếu chứng từ mua; đúng kho; đúng mặt hàng; tạo lớp giá vốn (FIFO / đích danh) hoặc góp vào bể (bình quân) | `CT-INV-001`, `CT-COST-001` |
| Điều chuyển | đúng kho nguồn / đích; cùng nhóm tính giá thì không đổi giá trị; khác nhóm thì mang giá trị nhóm gửi; không sinh doanh thu / giá vốn | `CT-INV-002..003` |
| Bán hàng | đúng khách, chứng từ, giá bán, thuế, thời điểm ghi nhận doanh thu | Gate B |
| Xuất kho | đủ tồn theo chính sách; phân bổ đúng lớp; không ghi trùng | `CT-COST-002..004` |
| Trả hàng bán | tham chiếu giao dịch gốc; hoàn lượng và **giá vốn của lần bán gốc** | `CT-REV-001..002` |
| Huỷ chứng từ | đã ghi sổ chưa; kỳ đã khoá chưa; nghiệp vụ điều chỉnh hợp lệ | `CT-REV-003` |
| Đổi ánh xạ tài khoản | phiên bản, ngày hiệu lực, tác động tới giao dịch và số dư | `CT-ACC-004` |
| Khoá sổ | giao dịch chưa xử lý; chênh lệch kho – sổ cái; đối chiếu và nghiệp vụ cuối kỳ | `CT-PER-*` |
| Kết chuyển | tài khoản và số dư kết chuyển; không trùng; bút toán cân | `CT-PER-004..005` |

## 3. Kiểm theo vòng đời (thứ mà kiểm từng chứng từ không thấy)

| Mã | Bất biến | Phát hiện ca |
|---|---|---|
| `CT-LIN-001` | mọi dòng xuất đã ghi giá vốn có phân bổ về lớp | phiếu bán đúng nhưng không nối được về phiếu nhập |
| `CT-LIN-002` | mọi lớp có nguồn (phiếu nhập / tồn đầu / bể có nguồn) | lớp "mồ côi" |
| `CT-MD-002` | đổi mã giữa kỳ không đổi `item_id` của dòng đã ghi; báo cáo theo mã đọc phiên bản tại ngày | đứt lịch sử FIFO / lãi lỗ theo mã |
| `CT-REV-001` | dòng trả hàng có `original_line_id`; giá vốn hoàn = giá vốn đã phân bổ cho dòng gốc (tỷ lệ lượng) | trả hàng hợp lệ nhưng hoàn sai giá vốn |
| `CT-REC-001` | Σ giá trị tồn theo lớp = số dư tài khoản hàng tồn kho (từng nhóm, cuối kỳ) | Nợ = Có nhưng chi tiết ≠ sổ cái |
| `CT-REC-002` | Σ phân bổ kỳ = phát sinh Nợ giá vốn từ xuất kho | giá vốn sổ cái không giải thích được |
| `CT-PER-001` | không còn mục bể chờ / nháp chặn của kỳ | khoá khi còn chứng từ treo |
| `CT-PER-002` | không còn dòng xuất của kỳ chưa phân bổ | khoá khi chưa tính giá |
| `CT-PER-003` | `CT-REC-*` = 0 | khoá khi sổ lệch |

Mã nào cũng vào `bizcity_findings@1` (cổng C), có vì sao, cách sửa, chỗ sửa (màn / bước), căn cứ (VAS 02 / Thông tư 99 / Luật Kế toán…) — R-GATE-10 / 11.

## 4. Checklist một sự kiện — ví dụ xuất bán theo FIFO

| Mã (bản mẫu) | Mã thư viện | Kiểm |
|---|---|---|
| MD-001 | `CT-MD-001` | xác định được `item_id`, `variant_id` |
| MD-002 | `CT-MD-002` | phiên bản mã đúng ngày hiệu lực |
| INV-001 | `CT-INV-001` | đúng kho và nhóm tính giá |
| FIFO-001 | `CT-COST-002` | đủ lượng tồn có thể xuất |
| FIFO-002 | `CT-COST-004` | các lớp được phân bổ đúng thứ tự (theo phương pháp) |
| FIFO-003 | `CT-COST-003` | giá trị xuất khớp phân bổ |
| ACC-001 | `CT-ACC-001` | xác định đúng tài khoản hạch toán (chính sách tại ngày) |
| ACC-002 | `CT-ACC-002` | bút toán Nợ = Có |
| ACC-003 | `CT-ACC-003` | không ghi trùng doanh thu / giá vốn |
| PER-001 | `CT-PER-006` | kỳ kế toán cho phép ghi sổ |

**PASS do engine tính** từ dữ liệu và rule pack; không ai tự tích (R-CONT-7). Mức: lỗi đứt chuỗi / lệch sổ = chặn khoá kỳ; lệch nhỏ theo ngưỡng chính sách = cảnh báo (chấp nhận có lý do, theo phân quyền).

## 5. Engine

- **Theo sự kiện**: sau khi một chứng từ ghi sổ, chạy các mã của loại sự kiện đó trên chuỗi chạm tới (dòng, lớp, phân bổ, bút toán) — kết quả ghi vào `continuity_checks` (chỉ thêm: mã, đối tượng, kỳ, đạt / không, chi tiết, lần chạy).
- **Theo kỳ**: đêm và trước khoá kỳ chạy các mã `CT-LIN-*`, `CT-REC-*`, `CT-PER-*`.
- Dùng chung khung kiểm chuẩn hiện có (rule pack, `diagnostic_runs`, Bàn đánh giá), không dựng engine thứ hai.
