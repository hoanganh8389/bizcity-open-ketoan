# PHASE-011 · 50 — Đặc tả định khoản `manual_journal` (chờ kế toán trưởng ký)
<!-- [2026-11-02 06:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.15 (ADR-0015 Q1): đặc tả định khoản manual_journal theo lý do loại journal — bản để kế toán trưởng ký trước khi viết mã (K2) -->

> **Trạng thái:** ⛔ **chờ kế toán trưởng ký** — chưa viết mã định khoản. Mức Kernel **K2** (luật định khoản mới): ký xong mới làm, có người duyệt thứ hai, mục "Thay đổi định khoản" trong CHANGELOG, bộ tình huống trên đơn vị sạch + `scripts/doi-chieu-ke-toan.sql` (R-REV-6).
> **Nguồn:** [ADR-0015](../../adr/ADR-0015-chot-sdk-v1-moi-thu-qua-be-su-kien.md) Q1 · luật [R-EVENT-14](../../rules/RULE-EVENT.md) · lộ trình **3.15** · năng lực `ledger.manual-journal`.

## 1. Bài toán

Module (không phải lõi Kế toán) cần ghi một nghiệp vụ không thuộc chứng từ mua / bán / thu / chi / kho có sẵn, ví dụ:

- phân bổ chi phí trả trước (Nợ chi phí / Có chi phí trả trước);
- trích trước chi phí (Nợ chi phí / Có chi phí phải trả);
- ghi nhận doanh thu chưa thực hiện vào doanh thu kỳ này.

Ràng buộc đã chốt (ADR-0015):

1. Đi **bể sự kiện**: `ctx.ledger.submit({ docType: 'manual_journal', … })` → `accounting_events` → luật định khoản → sổ.
2. Dòng phiếu mang **`reasonCode` bắt buộc**, **không** mang số tài khoản. AccountResolver tra tài khoản theo lý do (câu 4).
3. Chỉ lõi `ke-toan` tự chọn tài khoản (phiếu kế toán hiện có, đi `eventStore`, **không đổi**).

Vướng mắc: lý do hôm nay chỉ có **một** tài khoản đối ứng (`counter_account`) theo loại `in` / `out` / `receipt` / `payment` — đủ cho chứng từ có một vế cố định (tiền, kho), không đủ cho phiếu kế toán cần cả hai vế.

## 2. Phương án

| | A. Lý do loại `journal` có hai tài khoản (**đề xuất**) | B. Mỗi dòng hai lý do (Nợ, Có) | C. Dòng chọn "vế" + một lý do |
|---|---|---|---|
| Khuôn dòng | `{ reasonCode, amount, partnerCode?, description }` | `{ debitReason, creditReason, amount, … }` | `{ side: 'debit'\|'credit', reasonCode, amount }` |
| Ai quyết cặp tài khoản | kế toán (gói định khoản), một chỗ | module ghép hai lý do | module ghép vế |
| Module chọn được bút toán sai? | **không** — cặp cố định theo lý do | có (ghép lý do sai) | có (lệch Nợ / Có, phải kiểm cân) |
| Đổi dữ liệu | thêm `debit_account`, `credit_account` cho lý do; `kind` thêm `journal` | thêm `kind` | không |

**Đề xuất A:** kế toán định nghĩa sẵn từng loại nghiệp vụ thành một lý do `journal` (vd `PB-TRTRUOC` "Phân bổ chi phí trả trước": Nợ 6422 / Có 242). Module chỉ chọn lý do và số tiền — đúng tinh thần "module nộp sự việc, Kernel định khoản".

## 3. Đặc tả (phương án A)

### 3.1 Dữ liệu

- Bảng lý do (`posting_reasons`): thêm `debit_account`, `credit_account` (null với loại khác); `kind` nhận thêm `journal`. Migration mới, có `COMMENT ON`.
- Gói định khoản (`bizcity_posting_template@1` §`reasons`): lý do `journal` khai `debitAccount`, `creditAccount`; kiểm lúc cài: hai tài khoản có thật, là tài khoản chi tiết, khác nhau.

### 3.2 Khuôn nạp (`bizcity_ledger_intake@1` minor)

```json
{
  "docType": "manual_journal",
  "docKey": "<module>:CN01:PB-2026-10",
  "version": 1, "branchCode": "CN01", "docNo": "PB-2026-10", "docDate": "2026-10-31",
  "description": "Phân bổ chi phí trả trước tháng 10",
  "lines": [
    { "lineKey": "l1", "reasonCode": "PB-TRTRUOC", "amount": 1500000, "description": "Phần mềm kế toán 12 tháng" }
  ],
  "totals": { "total": 1500000 }
}
```

### 3.3 Luật định khoản

Mỗi dòng: **Nợ** `reason.debit_account` / **Có** `reason.credit_account`, số tiền `amount`, diễn giải dòng, chi nhánh của chứng từ. Bút toán theo chứng từ = gộp các dòng.

### 3.4 Kiểm (chặn — đi cùng bộ tiền kiểm PHASE-021, mã `IN-*`)

| Kiểm | Lỗi |
|---|---|
| Lý do có, đang dùng, `kind = journal` | lý do lạ / sai loại |
| `amount > 0`, `Σ lines.amount = totals.total` (tới xu) | số tiền / tổng lệch |
| Tài khoản Nợ hoặc Có theo dõi theo đối tượng (131, 331, 141…) → dòng **bắt buộc** `partnerCode` có thật | thiếu đối tượng |
| Dòng **không** có trường số tài khoản (`account`, `debitAccount`…) khi nguồn không phải `ke-toan` | module tự chọn tài khoản |
| Không thuế GTGT trong `manual_journal` (thuế đi chứng từ mua / bán) | có thuế |
| Kỳ khoá, khoá dữ liệu theo ngày, chủ chứng từ (`<module>:`) — như mọi chứng từ | như hiện có |

### 3.5 Sửa, huỷ, phiên bản

Như mọi chứng từ qua cửa nạp: phiên bản mới → đảo bút toán cũ, ghi theo bản mới; huỷ → `ctx.ledger.cancel` (đảo + huỷ hoặc Chờ huỷ theo chế độ định khoản). Chế độ định khoản của `manual_journal` mặc định **chờ duyệt** (ACC14) — phiếu tay từ module nên có kế toán xem trước.

### 3.6 Bộ tình huống (chạy trên đơn vị sạch trước khi gộp)

1. Phân bổ trả trước một dòng → Nợ 6422 / Có 242 đúng số; sổ cân; `DG-LEDGER-*` xanh.
2. Hai dòng hai lý do → hai cặp Nợ / Có, một bút toán.
3. Lý do có tài khoản theo dõi đối tượng, thiếu `partnerCode` → chặn; có → công nợ đối tượng khớp 131 / 331 (`doi-chieu-ke-toan.sql`).
4. Gửi phiên bản 2 đổi số tiền → đảo bản 1, ghi bản 2; số dư đúng bản 2.
5. Huỷ → đảo toàn bộ; số dư về như trước.
6. Dòng có `account` từ module khác `ke-toan` → chặn.
7. Kỳ đã khoá → chặn.

## 4. Câu hỏi cho kế toán trưởng

- **K1:** Chấp nhận phương án A (lý do `journal` hai tài khoản)?
- **K2:** Danh sách lý do `journal` khởi đầu cho gói nền (vd phân bổ trả trước, trích trước, kết chuyển doanh thu chưa thực hiện)?
- **K3:** Mặc định `manual_journal` **chờ duyệt** ở ACC14 (không ghi ngay)?
- **K4:** Danh sách tài khoản "bắt buộc đối tượng" lấy theo cờ theo dõi đối tượng của hệ thống tài khoản hiện có?

## 5. Ký duyệt

| Vai trò | Họ tên | Ngày | Ý kiến |
|---|---|---|---|
| Kế toán trưởng | | | |
| Chủ dự án | Johnny Chu – Chu Hoàng Anh | | |
