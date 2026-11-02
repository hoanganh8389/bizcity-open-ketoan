# PHASE-022 · 30 — UI / UX: Hệ thống → Bàn đánh giá (HT08)
<!-- [2026-11-02 07:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — UI / UX Bàn đánh giá: ba vai, checklist theo nhóm, bốn khối Hiện tượng · Vì sao · Cách khắc phục · Kiểm lại, biên bản in; luật UX; bản mẫu tĩnh mockups/ban-danh-gia.html. -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> Bản mẫu bấm thử: [mockups/ban-danh-gia.html](mockups/ban-danh-gia.html) (mở trực tiếp bằng trình duyệt, không cần máy chủ).

## 1. Vị trí

- Menu **Hệ thống → Bàn đánh giá** (HT08, `/he-thong/ban-danh-gia`), cạnh Kiểm chuẩn (HT06) và Hồ sơ kế toán (HT07).
- HT06 trả lời "đơn vị đáp ứng bộ quy định đến đâu" (theo lớp kỹ thuật). HT08 trả lời "**tôi** (với vai của tôi) cần làm gì" (theo người đọc). Cùng dữ liệu, khác cách sắp.
- Từ dải cảnh báo ở phiếu, ACC14, khoá kỳ: link "Xem trên Bàn đánh giá" mở đúng ca.

## 2. Bố cục

```text
┌ Bàn đánh giá ─────────────────────────────────────────────────────────────────────────────── [Kiểm lại tất cả] [In biên bản] ┐
│ Vai:  (●) Kế toán trưởng   ( ) Kiểm soát / ban kiểm soát   ( ) Thanh tra thuế — tự rà trước                                │
│ "Việc còn tồn trước khi khoá kỳ, nộp tờ khai" · Kỳ: 10/2026 ▾ · Lượt chẩn đoán 01:00 hôm nay · Kiểm chuẩn 01:02 hôm nay      │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  ✘ 1 lỗi     ⚠ 6 cảnh báo     ✔ 41 đạt     ⛔ 15 chặn đúng     ○ 9 chưa kiểm được            [ Chỉ hiện việc cần làm ☑ ]     │
├──────────────────────────────── CHECKLIST ─────────────────────────────────────────────────────────────────────────────────┤
│ ▾ Chứng từ (2 ⚠)                                                                                                            │
│   ⚠ F22-DOC-11  Chứng từ chờ định khoản quá 3 ngày          14 chứng từ   Ai làm: kế toán viên      [Cách khắc phục ▸]      │
│   ⚠ F22-DOC-12  Định khoản lỗi vì thiếu cấu hình              3 chứng từ   Ai làm: kế toán viên      [Cách khắc phục ▸]      │
│   ✔ F22-DOC-13  Chứng từ đã ghi sổ có bút toán hiệu lực                                                                    │
│ ▾ Kho, giá vốn (2 ⚠)                                                                                                        │
│   ⚠ F22-STK-01  Tồn kho âm                                     2 mã hàng     Ai làm: kế toán kho       [Cách khắc phục ▾]      │
│   ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│   │ HIỆN TƯỢNG  CN01 · kho chính · SUA01 âm từ 03/10/2026 (−6) ; CN02 · kho chính · QUA01 âm từ 12/10/2026                 │ │
│   │ VÌ SAO      Hàng xuất trước khi có phiếu nhập → giá vốn bình quân của mã đó sai, chi phí không có cơ sở khi thanh tra.  │ │
│   │ CÁCH KHẮC PHỤC                                                                                                          │ │
│   │   ① Mở Nhập xuất tồn tại ngày âm đầu tiên                                         [Mở ACC83 →]                         │ │
│   │   ② Tìm phiếu nhập thiếu / trễ / sai kho / sai mã; bổ sung hoặc sửa ở nguồn                                             │ │
│   │   ③ Tính lại giá vốn tháng 10                                                      [Mở ACC49 →]   (kế toán trưởng)      │ │
│   │   ✗ Không điều chỉnh kho cho "khớp"                                                                                      │ │
│   │ KIỂM LẠI    [Kiểm lại INVENTORY_NEGATIVE]  — lần trước 01:00 hôm nay                                                     │ │
│   └───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│ ▸ Cuối kỳ (1 ⚠) · ▸ Thuế, hoá đơn (1 ⚠) · ▸ Công nợ (○ 6) · ▸ Sổ, lệch sổ (✘ 1) · ▸ Môi trường · ▸ Phân quyền (⛔ 6)          │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## 3. Bốn khối của một ca (R-FIX)

| Khối | Nội dung | Luật |
|---|---|---|
| **Hiện tượng** | cái gì sai, ở đâu: mẫu khoá chứng từ / mã hàng / chi nhánh / kỳ, số lượng | không số tiền (R-DIAG-6); mẫu tối đa 10, có "xem tất cả" |
| **Vì sao** | hậu quả cho sổ / báo cáo / thuế, nói bằng ngôn ngữ kế toán; căn cứ (nếu là luật) + trạng thái rà | ngưỡng nội bộ ghi rõ "quy chế nội bộ"; luật ghi "căn cứ chờ rà" nếu chưa rà |
| **Cách khắc phục** | bước ①②③, mỗi bước một nút mở đúng màn, ghi vai cần có; bước cấm ghi bằng ✗ | không nút ghi sổ / tắt kiểm / bỏ qua (R-FIX-2); thiếu quyền thì "nhờ <vai>" (R-FIX-3) |
| **Kiểm lại** | nút chạy lại đúng mã; thời điểm kiểm gần nhất | chỉ đọc; dòng đổi trạng thái ngay (R-FIX-4) |

Ca Tier 0 (`stopTheLine`): khối Cách khắc phục mở đầu bằng dải đỏ "Dừng ghi sổ · báo nhóm Lõi kèm mã tra cứu `<mã>`", có nút chép mã tra cứu.

## 4. Ba vai

| | Kế toán trưởng | Kiểm soát / ban kiểm soát | Thanh tra thuế (tự rà trước) |
|---|---|---|---|
| Lời mở đầu | "Việc còn tồn trước khi khoá kỳ, nộp tờ khai" | "Sổ có toàn vẹn, bằng chứng liền mạch, phân quyền đúng" | "Điểm sẽ bị hỏi khi thanh tra — không phải kết luận của cơ quan thuế" |
| Nhóm đầu | Chứng từ → Kho, giá vốn → Cuối kỳ → Thuế | Sổ, lệch sổ → Môi trường → Phân quyền → Cuối kỳ | Thuế, hoá đơn → Kho, giá vốn → Tiền → Tài sản |
| Mặc định lọc | chỉ việc cần làm (⚠ ✘) | hiện cả ✔ và ⛔ (ban kiểm soát cần thấy rào chắn còn) | chỉ việc cần làm |
| Thêm | nút "Giao việc" (copy link ca gửi người phụ trách) | cột "lần xác nhận cảnh báo" (ai, lý do, lúc) | căn cứ pháp lý + trạng thái rà ở mỗi ca |

## 5. Biên bản in

```text
BIÊN BẢN TỰ RÀ — Vai: Kiểm soát / ban kiểm soát · Đơn vị: …… · Kỳ 10/2026 · In lúc 02/11/2026 19:00
Nguồn: tự chẩn đoán lượt #812 (01:00), kiểm chuẩn lượt #67 (01:02), bảng kiểm khoá kỳ 10/2026
──────────────────────────────────────────────────────────────────────────────────────────────
STT  Mã ca          Nội dung                                  Trạng thái   Phương án / xác nhận
1    F22-LEDGER-01  Bút toán Nợ = Có                          ✔ đạt        —
2    F22-ENV-02     Trigger bảo vệ sổ còn đủ                  ✔ đạt        —
3    F22-CLOSE-06   Khoá kỳ 09/2026 khi còn cảnh báo          ⚠ đã xác nhận  N.V.A (KTT) 05/10 "Tồn âm SUA01, bổ sung phiếu nhập kỳ sau"
…
Không phải kết luận của cơ quan nhà nước. Không ghi số tiền; chi tiết tra theo mã chứng từ trên hệ thống.
Người lập ……………      Kế toán trưởng ……………      Trưởng ban kiểm soát ……………
```

## 6. Luật UX

1. **Trạng thái luôn có chữ**, không chỉ màu: "Đạt", "Cảnh báo", "Lỗi", "Chặn đúng", "Chưa kiểm được" (kế thừa U2 của Bàn điều tra PHASE-019).
2. **Câu trả lời trước, dữ liệu sau**: dải đầu nói có bao nhiêu việc, nhóm nào trước.
3. **Một ca, một hành động chính**: nút của bước ① to nhất; các bước sau là link.
4. **Không cuộn ngang ở khổ điện thoại**: hàng ca thành thẻ, bốn khối xếp dọc.
5. **"Chưa kiểm được" khác "Đạt"**: màu xám, có lý do + ticket; không tính vào số "đạt".
6. **Không có điểm %**; số đếm theo trạng thái là đủ (ADR-0012 T5).
7. **Người dùng chỉ thấy đơn vị mình** (R-TEN); vai không mở thêm dữ liệu, chỉ đổi cách sắp.
