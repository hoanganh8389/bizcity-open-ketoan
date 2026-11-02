# PHASE-023 · 30 — UI / UX: thẻ tài khoản
<!-- [2026-11-02 09:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 — UI / UX: thẻ ba lớp, ô chọn có chú giải, hai cột dư ở sổ, nút Vì sao, chế độ học, trang Học -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> Bản mẫu bấm thử: [mockups/the-tai-khoan.html](mockups/the-tai-khoan.html).

## 1. Thẻ tài khoản (lớp 1 + 2 + 3)

```text
┌ 131 · Phải thu của khách hàng ─────────────────────────── Lưỡng tính · Theo đối tượng · Chi tiết ┐
│ MỘT CÂU   Khách hàng còn nợ mình, hoặc đã trả trước cho mình.                                      │
├ BẢN CHẤT ───────────────────────────────────────────────────────────────────────────────────────┤
│        Nợ 131                      │                       Có 131                                 │
│  bán chịu → khách nợ thêm          │  khách trả tiền                                               │
│  trả lại tiền thừa cho khách       │  khách trả trước · chiết khấu / hàng trả lại trừ vào nợ       │
│  ──────────────────────────────────┴─────────────────────────────────────────────────────────────  │
│  VÌ SAO LƯỠNG TÍNH  Mỗi khách có thể đang NỢ (dư Nợ) hoặc đã TRẢ TRƯỚC (dư Có). Hai sự thật khác   │
│  nhau → theo dõi riêng từng khách, không bù trừ khách này với khách kia.                           │
│  VÌ SAO BẮT BUỘC ĐỐI TƯỢNG  Không có đối tượng thì không biết ai nợ, ai trả trước; số tổng vô nghĩa │
│  LÊN BÁO CÁO  dư Nợ → CĐKT 131 Phải thu KH · dư Có → CĐKT 312 Người mua trả trước  (TT99 Đ.18 ▸)   │
├ SỐ CỦA ĐƠN VỊ (02/11/2026) ──────────────────────────────────────────────────────────────────────┤
│  Dư Nợ  120.400.000  (34 khách)     Dư Có  15.000.000  (3 khách trả trước)                          │
│  ✗ Không lấy 120,4 − 15 = 105,4: 15 tr là nghĩa vụ của mình với khách, không phải khoản giảm phải thu│
│  Phát sinh T10: Nợ 310 tr · Có 298 tr · 412 dòng   [Sổ chi tiết →] [Công nợ theo khách →]          │
├ ĐANG CÓ ─────────────────────────────────────────────────────────────────────────────────────────┤
│  ⚠ DEBT_MATCH_LEDGER  2 khách lệch sổ phụ ↔ sổ cái   [Vì sao? ▸] [Cách khắc phục ▸]                 │
│  ○ Bài học liên quan: "131 / 331 lưỡng tính" (7 tình huống, 15 phút)  [Học ▸]                        │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Luật của thẻ:
- Lớp 1 và 2 lấy từ danh mục giải nghĩa đã duyệt; tài khoản con không có mục riêng thì hiện mục cha kèm "theo 131".
- Lớp 3 chỉ hiện khi người dùng có quyền đọc sổ; số đối tượng luôn hiện, số tiền theo quyền (R-DIAG-6).
- Tài khoản lưỡng tính: **không bao giờ** hiện một số dư ròng ở lớp 3.
- Mọi dòng "Đang có" dùng `remedy` của PHASE-022; "Vì sao?" mở đúng mục bản chất.

## 2. Ô chọn tài khoản (lớp 1)

```text
┌ Tài khoản ▾ ──────────────────────────────────────────────────────────┐
│ 131    Phải thu của khách hàng        Lưỡng tính · Đối tượng           │
│        ↳ Khách còn nợ mình, hoặc đã trả trước cho mình.                 │
│ 1311   Phải thu KH ngắn hạn           Lưỡng tính · Đối tượng (theo 131) │
│ 133    Thuế GTGT được khấu trừ        Dư Nợ                              │
│ 331    Phải trả người bán             Lưỡng tính · Đối tượng           │
└────────────────────────────────────────────────────────────────────────┘
```

- Nhãn cố định cạnh tên: `Dư Nợ` / `Dư Có` / `Lưỡng tính`, thêm `Đối tượng` khi `track_partner`. Dòng đang chọn (bàn phím / di chuột) hiện một câu.
- Chọn tài khoản theo dõi đối tượng mà phiếu chưa có đối tượng → ô đối tượng viền vàng ngay, chưa cần bấm Ghi.

## 3. Sổ chi tiết và cân đối phát sinh (lớp 3 tại chỗ)

- Đầu trang sổ chi tiết tài khoản: một dòng tóm tắt lớp 1 + nhãn.
- Tài khoản `both`: cột số dư tách **Dư Nợ** và **Dư Có** (theo đối tượng, không bù trừ); cân đối phát sinh có chú thích chân trang "131, 331: dư Nợ và dư Có lấy theo từng đối tượng (lưỡng tính)".

## 4. Nút "Vì sao?" ở lỗi và cảnh báo

| Lỗi / kiểm | Mở mục |
|---|---|
| "Tài khoản 335 bắt buộc phải chọn đối tượng" (`validateLines`) | 335 → *Vì sao bắt buộc đối tượng* |
| `ACCOUNT_WRONG_SIDE` (1111 dư Có) | 1111 → *Dư bên nào và vì sao* + "dư Có nghĩa là chi quá số có — kiểm phiếu chi chưa có phiếu thu" |
| `UNBALANCED_ENTRY` | khái niệm chung *Nợ = Có* (thẻ "0 — Nguyên tắc ghi sổ kép") |
| Thiếu cấu hình hạch toán ("chưa đặt tài khoản ngầm định receivable") | 131 → *Lên báo cáo* + nút mở Cấu hình |
| `DEBT_MATCH_LEDGER`, `DEBT_*` | 131 / 331 → *Vì sao lưỡng tính* |
| IN-POST-002 (không tra được tài khoản) | thẻ của tài khoản gợi ý + mở gói định khoản |

Khuôn: thông báo lỗi giữ nguyên câu ngắn; thêm hai nút `[Vì sao?]` `[Cách khắc phục]`; "Vì sao?" là ngăn trượt, không rời màn.

## 5. Chế độ học

```text
┌ Phiếu thu PT-00231 · Khách A trả nợ 5.000.000 ──────────── [Chế độ học: BẬT] ┐
│ ...form như thường...                                                         │
├ XEM TRƯỚC (chữ T) ────────────────────────────────────────────────────────────┤
│  1111 Tiền mặt ▲ tăng            │  131 Phải thu (A) ▼ giảm                    │
│  Nợ 5.000.000                    │  Có 5.000.000                               │
│  Tiền vào két                    │  A bớt nợ. Nếu A không nợ mà trả → A đang    │
│                                  │  TRẢ TRƯỚC: 131 (A) dư Có. [Vì sao? ▸]       │
│  Thử: đổi thành "A đặt cọc 5 tr" — dòng nào đổi? [Thử ▸]                       │
└────────────────────────────────────────────────────────────────────────────────┘
```

- Xem trước = bút toán **dựng thật trong giao dịch rồi huỷ** (như MCP, STD-MCP-4) — không phải mô phỏng riêng, nên luôn đúng luật hiện hành.
- Tắt chế độ học: khối xem trước ẩn; form không đổi.

## 6. Trang Học (W3)

- Menu Trợ giúp → Học theo vai. Chọn vai → danh sách bài → mỗi tình huống: đề bài, lập trên **tenant mẫu** (nút mở màn tương ứng với dữ liệu mẫu), câu hỏi trắc nghiệm về số dư / bên, chấm ngay, giải thích trỏ về thẻ.
- Tiến độ theo người dùng; không điểm công khai; gợi ý bài từ bảng điểm đầu vào (021).

## 7. Ngôn ngữ

- Nói "dư Nợ / dư Có", "bên Nợ / bên Có", "lưỡng tính", "theo dõi theo đối tượng"; tránh "debit / credit" trong câu tiếng Việt.
- Mỗi "vì sao" tối đa 3 câu; câu đầu là kết luận.
- Căn cứ pháp lý hiện mã ngắn (`TT99 Đ.18`) mở kho căn cứ, không chép điều luật vào thẻ.
