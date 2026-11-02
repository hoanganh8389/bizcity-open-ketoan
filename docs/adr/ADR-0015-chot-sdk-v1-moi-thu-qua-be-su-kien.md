# ADR-0015 · Chốt SDK v1: phiếu kế toán từ module, đối trừ công nợ, dữ liệu mẫu, gói giao diện — mọi thứ chạm sổ qua bể sự kiện
<!-- [2026-11-02 05:55 PM Johnny Chu - Chu Hoàng Anh] ADR-0015 — chủ chốt §6 API.md (câu 1, 2, 4, 5) + nguyên tắc "mọi thứ phải vào bể sự kiện, accounting event qua thì mới vào được" -->

- Trạng thái: **Chấp nhận** — chủ dự án (Johnny Chu) duyệt 2026-11-02: "đồng ý theo các hướng bro đề xuất. Hợp lý. Phiếu kế toán nhập tay từ module: đề xuất thêm docType manual_journal, bắt buộc có reasonCode. Chỉ module ke-toan được tự do chọn tài khoản. Nguyên tắc mọi thứ phải vào bể sự kiện. Accounting event qua thì mới vào được."
- Ngày: 2026-11-02 · Người quyết: Johnny Chu – Chu Hoàng Anh · Mức Kernel: **K0** cho ADR này (chưa đổi mã định khoản). Thi hành `manual_journal`: **K2** (luật định khoản mới — mục "Thay đổi định khoản" trong CHANGELOG, người duyệt thứ hai, kế toán trưởng ký đặc tả).
- Luật / hợp đồng liên quan: bốn câu không thương lượng, R-EVENT-1, R-EVENT-2, R-EVENT-14 (mới), ADR-0011 D5, [`bizcity_ledger_intake@1`](../contracts/BIZCITY-LEDGER-INTAKE-v1.md), [`bizcity_module@1`](../contracts/BIZCITY-MODULE-v1.md), [SDK API.md §6](../../packages/module-sdk/API.md).

## Bối cảnh

`@bizcity/module-sdk` v0.2 có đủ mã cho việc 3.1 (`ctx.ledger.submit / cancel / get / query`, `ctx.data.module`, quyền module, nạp theo registry). Còn bốn câu hỏi mở ở API.md §6 chặn việc "bỏ bản nháp": phiếu kế toán từ module, đối trừ công nợ, dữ liệu mẫu tạo danh mục, gói giao diện.

## Quyết định

### Nguyên tắc: mọi thứ chạm sổ qua bể sự kiện

Mọi thay đổi số liệu sổ — kể cả phiếu kế toán module lập, cấn trừ công nợ khác tài khoản — phải thành **sự việc kế toán** (`accounting_events`) qua cửa nạp (`postDocumentIn` / `eventStore`) **trước**, rồi luật định khoản mới ghi sổ. Không có đường nào từ module vào sổ mà bỏ qua bể sự kiện. Đây là câu 1 + 3 của bốn câu không thương lượng, nay ghi thành **R-EVENT-14** cho module.

Thứ **không** chạm sổ thì không cần sự việc: đối trừ hai khoản công nợ cùng đối tượng, cùng tài khoản chỉ ghép khoản trong sổ chi tiết công nợ (`debt_allocations`), số dư tài khoản không đổi.

### Q1 · Phiếu kế toán nhập tay từ module → `docType: manual_journal`

- Khuôn nạp `bizcity_ledger_intake@1` thêm `manual_journal`: dòng mang **`reasonCode` bắt buộc** (+ mã đối tượng, số tiền, diễn giải), **không** mang số tài khoản. AccountResolver tra tài khoản theo lý do (câu 4).
- Chỉ module lõi `ke-toan` được tự chọn tài khoản (phiếu kế toán hiện có, đi `eventStore` như nay). Module khác nộp `manual_journal` → Kernel từ chối dòng có số tài khoản.
- Đi đúng bể sự kiện: `ctx.ledger.submit({ docType: 'manual_journal', docKey: '<module>:…', … })` → `accounting_events` → luật định khoản `manual_journal` → sổ.
- **Trước khi viết mã** (mức K2): đặc tả luật định khoản — mỗi dòng ghi Nợ / Có theo cặp lý do hay lý do có hai vế (`debit_account` / `credit_account` của lý do loại `journal`); kế toán trưởng ký đặc tả; bộ tình huống trên đơn vị sạch + `scripts/doi-chieu-ke-toan.sql` (R-REV-6).

### Q2 · Đối trừ công nợ → `ctx.ledger.allocateDebt`

- `ctx.ledger.allocateDebt({ partnerCode, from: docKey, to: docKey, amount })`: chỉ chứng từ của chính module (`<module>:…`), Kernel kiểm cùng đối tượng, cùng tài khoản, không vượt phần còn lại (dùng lại `debt.service.allocate`), cùng giao dịch action.
- Khác tài khoản (cấn trừ) **không** qua hàm này: là chứng từ, nộp qua `submit` → bể sự kiện (nguyên tắc trên).

### Q4 · Dữ liệu mẫu tạo danh mục → `seed` trong manifest

- Manifest thêm `seed[]`: danh sách lời gọi action công khai `core.*.upsert` (đối tượng, mặt hàng, chi nhánh, kho) với dữ liệu hư cấu. Trình cài chạy bằng quyền người cài, có bằng chứng. Module **không** ghi bảng danh mục.

### Q5 · Gói giao diện → `@bizcity/module-sdk/web`

- Một gói danh tính: `defineWebModule`, kiểu menu / slot / màn ở `@bizcity/module-sdk/web`; `@bizcity/ui-kit` chỉ là thành phần giao diện.

### SDK v1

API.md bỏ "bản nháp": chữ ký §3 là hợp đồng v1. Bốn mục trên có **kiểu** ngay trong SDK; năng lực còn `planned` (`ledger.manual-journal`, `ledger.allocate-debt`, `module.seed`, `ui.web-module`) thì runtime ném `CAPABILITY_MISSING` (API.md nguyên tắc 2) tới khi làm xong.

## Hệ quả

**Được:** SDK v1 chốt, module viết được dựa trên hợp đồng ổn định; không còn đường nào từ module vào sổ bỏ qua bể sự kiện; tài khoản vẫn chỉ AccountResolver chọn (trừ `ke-toan`).

**Mất:** `manual_journal` chưa dùng được ngay — cần đặc tả định khoản và kế toán trưởng ký trước (K2). Phân hệ `quy` vẫn dùng phiếu của `ke-toan` tới khi có.

**Việc phải làm** (lộ trình, PHASE-011 giai đoạn 2):

| Việc | Nội dung | Mức |
|---|---|---|
| 3.15 | `manual_journal`: đặc tả định khoản (kế toán trưởng ký) → khuôn nạp + luật định khoản + bộ tình huống | K2 |
| 3.16 | `ctx.ledger.allocateDebt` qua cổng Kernel | K1 |
| 3.17 | `seed[]` trong manifest, trình cài gọi `core.*.upsert` | K0 |
| 3.18 | `@bizcity/module-sdk/web` (`defineWebModule`) | K0 |

## Phương án đã cân nhắc

- **Module tự ghi số tài khoản trong phiếu:** loại — trái câu 4; chỉ lõi `ke-toan` được.
- **Đối trừ khác tài khoản qua `allocateDebt`:** loại — có bút toán thì phải là sự việc qua bể sự kiện.
- **Module ghi thẳng bảng danh mục khi dựng dữ liệu mẫu:** loại — danh mục chỉ qua action `core.*`.
