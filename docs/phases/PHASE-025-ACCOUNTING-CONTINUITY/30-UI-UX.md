# PHASE-025 · 30 — UI / UX: thấy được vòng đời, thấy được tiến bộ
<!-- [2026-11-03 06:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — UI/UX Accounting Continuity: Hành trình mặt hàng, dòng sự kiện vận hành / kế toán, checklist sự kiện, Sẵn sàng khoá kỳ, small win -->

Bản mẫu bấm thử: [mockups/continuity.html](mockups/continuity.html).

## 1. Nguyên tắc trình bày

1. **Một mặt hàng, một câu chuyện.** Người dùng mở một `item_id` và đọc từ trái qua phải: mua → nhập (lớp) → xuất (phân bổ) → bút toán → trả / huỷ → lãi lỗ. Đổi mã hiện như một mốc trên cùng trục, không phải một mặt hàng khác.
2. **Kế toán hay vận hành nhìn là biết.** Sự kiện đổi sổ có viền đậm và số tiền; sự kiện vận hành nhạt hơn, không số tiền (R-CONT-8).
3. **Chỗ đứt nằm ngay trên chuỗi.** Mã `CT-*` gắn vào đúng nút bị đứt, với một nút "sửa ở đâu" (remedy của thư viện mã). Không có danh sách lỗi tách rời mà người dùng phải tự dò lại.
4. **Small win.** Mỗi màn có một con số đi lên: "giá vốn kỳ này giải thích được 98,6%", "1.240 / 1.245 sự kiện đạt", "Sẵn sàng khoá kỳ 5 / 6 điều kiện". Sửa xong một chỗ → thanh tiến độ nhích ngay, mã chuyển xanh, có dòng "vừa sửa".
5. **Engine quyết định, người dùng hành động.** Không có ô tích "đạt". Nút duy nhất là "mở chỗ sửa" và (với mức cảnh báo, theo phân quyền) "chấp nhận có lý do".
6. **Một ngôn ngữ.** Câu chữ của mọi kiểm lấy từ thư viện mã, có căn cứ (R-GATE-10 / 11).

## 2. Màn

### 2.1 Hành trình mặt hàng (từ thẻ mặt hàng, hoặc bấm vào dòng sổ 632 / 156)

```text
┌ ITEM 01JC…K7 · "Sữa bột 900g"   mã: SUA01 (01/2026–09/2026) → SUA-900 (10/2026–)   [Đổi mã: vận hành]
│
├─ Lớp giá vốn (FIFO)          L001  PN-0101  100 hộp × 100.000  còn 0      ✔
│                              L002  PN-0215  80 hộp × 120.000   còn 30     ✔
├─ Xuất / bán                  HD-0450  120 hộp → L001 100 × 100k + L002 20 × 120k = 12.400.000  ✔ CT-COST-003
│                              HD-0461   30 hộp → L002 30 × 120k = 3.600.000                     ✔
├─ Bút toán                    Nợ 632 / Có 156  12.400.000 (HD-0450)  · 3.600.000 (HD-0461)
├─ Trả / huỷ                   TL-0012 trả 5 hộp của HD-0450, phiếu hoàn theo giá nhập mới nhất 125.000/hộp
│                              ⚠ CT-REV-002 — giá vốn gốc của HD-0450 là 103.333/hộp (12.400.000 ÷ 120) → hoàn 516.667
└─ Lãi lỗ kỳ 10                doanh thu 19.800.000 · giá vốn 16.000.000 · lãi gộp 3.800.000
```

Bấm vào một lớp → mọi lần xuất đã lấy từ lớp đó (lineage xuôi). Bấm vào bút toán 632 → phân bổ → lớp → phiếu nhập → hoá đơn mua (lineage ngược).

### 2.2 Dòng sự kiện của kỳ

Bảng theo thời gian, mỗi dòng một sự kiện kinh tế: loại, chứng từ, **effect** (kế toán / vận hành), số mã `CT-*` đạt / tổng, trạng thái. Lọc "chỉ sự kiện đổi sổ", "chỉ chỗ đứt".

### 2.3 Checklist một sự kiện

Mở một sự kiện (ví dụ xuất bán) → danh sách mã kiểm của loại sự kiện đó với dấu ✔ / ✘ do engine tính, câu chữ từ thư viện, căn cứ, và nút sửa ở dòng ✘. Dòng chân: "Kết quả do engine tính từ dữ liệu và rule pack — không đánh dấu tay".

### 2.4 Sẵn sàng khoá kỳ

| Điều kiện (R-CONT-6) | Hiện |
|---|---|
| Không còn chứng từ ở bể chờ / mặt hàng nháp của kỳ | số còn lại → mở Trạm kiểm tra |
| Mọi dòng xuất đã phân bổ giá vốn | số dòng chưa phân bổ → chạy tính giá |
| Tồn chi tiết = số dư hàng tồn kho | chênh lệch theo nhóm → mở đối chiếu |
| Giá vốn phân bổ = phát sinh Nợ giá vốn | chênh lệch → mở danh sách dòng |
| Trả / huỷ tham chiếu đúng gốc | số dòng sai → mở hành trình mặt hàng |
| Kết chuyển cân, không trùng | trạng thái kết chuyển |

Mỗi điều kiện là một thanh tiến độ; đủ 6/6 thì nút **Khoá kỳ** sáng. Chưa đủ thì nút ghi rõ còn thiếu gì.

## 3. Ai thấy gì

| Vai | Màn chính | Câu hỏi được trả lời |
|---|---|---|
| Kế toán kho / giá vốn | Hành trình mặt hàng | giá vốn này từ phiếu nhập nào; vì sao trả hàng hoàn giá này |
| Kế toán tổng hợp | Sẵn sàng khoá kỳ | còn gì phải xử lý trước khi khoá |
| Dev / plugin | API `bizcity_lineage@1`, mã `CT-*` | chứng từ mình gửi có nối được không |
| CEO | Bàn đánh giá: % giá vốn giải thích được, số sự kiện đạt | sổ sách có liền mạch không |
