# PHASE-023 · 00 — Master plan: Thẻ tài khoản
<!-- [2026-11-02 09:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 — master plan: ba lớp, năm chỗ đặt, danh mục giải nghĩa máy đọc, chế độ học, bài theo vai, D023-*, Q023-*, W0–W3 -->

> **Ký hiệu:** ☐ chưa làm · 🟡 có mã + test · ✅ có bằng chứng · ⛔ chờ chủ · ❌ huỷ.
> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

## 1. Vì sao

Người dùng không mở trang lý thuyết để đọc. Họ gặp tài khoản ở ô chọn, ở sổ, ở thông báo lỗi. Nếu lúc đó có một thẻ nói đúng ba điều — *tài khoản này theo dõi gì · bản chất ra sao · số của đơn vị mình đang thế nào* — thì họ vừa làm được việc, vừa học được bản chất, vừa tôn trọng luật ghi sổ vì hiểu nó. Thẻ tài khoản vì thế không phải "trợ giúp", mà là **một phần của lớp bảo vệ sổ**: cùng nguồn luật với trigger và kiểm, chỉ khác là nói bằng tiếng người.

## 2. Ba lớp của một thẻ

| Lớp | Nội dung | Nguồn | Ví dụ 131 (lưỡng tính) |
|---|---|---|---|
| **1. Một câu** | tài khoản theo dõi gì, nhãn: `Dư Nợ` / `Dư Có` / `Lưỡng tính` / `Theo đối tượng` | danh mục giải nghĩa + cờ `accounts` | "Khách còn nợ mình, hoặc đã trả trước cho mình" · Lưỡng tính · Theo đối tượng |
| **2. Bản chất** | chữ T: Nợ ghi gì, Có ghi gì; dư bên nào và vì sao; vì sao lưỡng tính; vì sao bắt buộc đối tượng; lên chỉ tiêu nào của BCTC; căn cứ | danh mục giải nghĩa; `docs/can-cu` | Nợ = bán chịu (khách nợ thêm) · Có = khách trả tiền / trả trước. Lưỡng tính vì **mỗi khách** có thể đang nợ hoặc đang trả trước — hai sự thật khác nhau, không bù trừ. Lên CĐKT: dư Nợ → mã 131 Phải thu; dư Có → mã 312 Người mua trả trước |
| **3. Số của đơn vị** | dư Nợ / dư Có **tách theo đối tượng**, số đối tượng mỗi bên, biến động kỳ, cảnh báo đang có trên tài khoản này | API đọc mới `core.account.card` (ledger.query) | "Dư Nợ 120 tr (34 khách) · Dư Có 15 tr (3 khách trả trước). **Không** lấy 120 − 15: 15 tr là nghĩa vụ của mình với khách" |

Lớp 3 là thứ phần mềm thường không làm, và là thứ dạy nhanh nhất: người dùng nhìn **tiền của mình** tách thành hai bên là hiểu "lưỡng tính" ngay.

## 3. Năm chỗ đặt

| # | Chỗ | Lớp | Khi nào hiện |
|---|---|---|---|
| P-1 | **Ô chọn tài khoản** (`AccountPicker`) | 1 | di chuột / chạm vào một dòng; nhãn nhỏ cạnh mã |
| P-2 | **Hệ thống tài khoản (ACC1)** | 1 + 2 + 3 | bấm dòng → ngăn bên phải; ô "Tài khoản lưỡng tính" trên form có giải thích hệ quả (cách lên báo cáo, bắt buộc đối tượng) |
| P-3 | **Sổ chi tiết tài khoản, cân đối phát sinh** | 1 + 3 | dòng tóm tắt đầu trang; tài khoản lưỡng tính hiện **hai cột dư Nợ / dư Có theo đối tượng**, không một số ròng |
| P-4 | **Thông báo lỗi và cảnh báo** ("bắt buộc chọn đối tượng", `ACCOUNT_WRONG_SIDE`, `UNBALANCED_ENTRY`, thiếu cấu hình hạch toán) | 2 | nút **"Vì sao?"** mở đúng mục bản chất của tài khoản liên quan; cùng khối `remedy` (R-FIX) |
| P-5 | **Chế độ học** (bật / tắt theo người dùng) | 2 | màn lập chứng từ hiện chữ T xem trước của bút toán sắp ghi, mũi tên tăng / giảm từng tài khoản; tắt thì gọn như cũ |

## 4. Danh mục giải nghĩa máy đọc

Tệp theo chế độ kế toán: `data/giai-nghia-tai-khoan/vn-tt99.json` (và `vn-tt133.json`), hợp đồng nhỏ `bizcity_account_card@1`:

```json
{
  "contract": "bizcity_account_card@1", "regime": "vn-tt99-2025", "version": "1.0.0", "status": "draft",
  "approvedBy": null, "approvedAt": null,
  "accounts": {
    "131": {
      "motCau": "Khách hàng còn nợ mình, hoặc đã trả trước cho mình.",
      "no": "Bán chịu, khách nợ thêm; trả lại tiền thừa cho khách.",
      "co": "Khách trả tiền; khách trả trước; chiết khấu, giảm giá, hàng trả lại trừ vào nợ.",
      "soDu": "both",
      "viSaoLuongTinh": "Mỗi khách có thể đang nợ (dư Nợ) hoặc đã trả trước (dư Có). Hai sự thật khác nhau, phải theo dõi riêng từng khách, không bù trừ khách này với khách kia.",
      "viSaoDoiTuong": "Không có đối tượng thì không biết ai nợ, ai trả trước — số tổng vô nghĩa và không lên được chỉ tiêu CĐKT.",
      "bctc": { "duNo": "CĐKT 131 Phải thu ngắn hạn của khách hàng", "duCo": "CĐKT 312 Người mua trả tiền trước ngắn hạn" },
      "viDu": [{ "tinhHuong": "Khách A đặt cọc 10 tr khi chưa giao hàng", "butToan": "Nợ 1111 / Có 131 (A)", "hoiHoc": "Số dư 131 của A giờ bên nào? Vì sao?" }],
      "canCu": ["tt99-2025:dieu-18"],
      "lienQuan": ["331", "3387", "1388"]
    }
  }
}
```

- Tài khoản con **kế thừa** giải nghĩa của cha; đơn vị thêm ghi chú riêng (`account_notes`, không sửa tệp gói).
- Nội dung là kiến thức nghiệp vụ: `status: draft → approved` do kế toán trưởng (quyền `conformance:approve`, như rulepack ADR-0016); bản cài tự duyệt ghi chú "duyệt tại đơn vị". **AI không tự viết rồi dùng luôn**; AI chỉ soạn nháp.
- Check **SC-ACC-1** (DOCS, block): mọi tài khoản cấp 1–2 trong gói nền có mục giải nghĩa đủ `motCau`, `no`, `co`, `soDu` khớp `normal_side` của hệ thống tài khoản; tài khoản `both` phải có `viSaoLuongTinh`; `track_partner` phải có `viSaoDoiTuong`; `canCu` tồn tại trong `docs/can-cu`.

## 5. Chế độ học và bài theo vai

- **Chế độ học** (`bizcity.ui.learning_mode`, theo người dùng): chữ T xem trước ở màn lập chứng từ; nhãn tăng / giảm; gợi ý "Thử: nếu khách trả trước thì dòng nào đổi bên?". Tắt mặc định cho kế toán có kinh nghiệm; bật mặc định cho vai `viewer` / người mới.
- **Bài theo vai** (`docs/huong-dan/dao-tao-theo-vai-tro.md` mở rộng → trang "Học" trong ứng dụng): thu ngân (1111, 112, 131 thu tiền), kế toán viên (131 / 331 lưỡng tính, 133 / 3331, 156 / 632, 242 / 335), kế toán trưởng (411, 421, kết chuyển, 3387). Mỗi bài 5–7 tình huống; lập **trên tenant mẫu** (preset hư cấu), xem sổ đổi ra sao, trả lời câu hỏi, chấm ngay.
- **Gợi ý theo lỗi đã mắc**: bảng điểm đầu vào (PHASE-021) biết người lập hay sai mã nào → thẻ gợi ý bài tương ứng (ai hay thiếu đối tượng trên 131 / 331 → bài lưỡng tính).

## 6. Quyết định đề xuất D023-* (chờ chủ duyệt)

> **Chủ duyệt 2026-11-05** (Johnny Chu – Chu Hoàng Anh: *"đồng ý với toàn bộ đề xuất của bro"*): D023-1..5 duyệt. Nội dung giải nghĩa vẫn phải kế toán trưởng duyệt từng mục (D023-4, S023-5). <!-- [2026-11-05 04:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 — chủ duyệt D023-* -->

| # | Quyết định | Vì sao |
|---|---|---|
| D023-1 | Giải nghĩa là **tệp theo chế độ kế toán** trong repo (`data/giai-nghia-tai-khoan/*.json`), phát hành cùng bản dựng; đơn vị chỉ thêm ghi chú | một nguồn, có review, có phiên bản; như rulepack |
| D023-2 | Lớp 3 qua **một action đọc** `core.account.card` (`accounts:read`): dư Nợ / dư Có tách theo đối tượng tại ngày, số đối tượng mỗi bên, phát sinh kỳ, cảnh báo đang có — dùng `ledger.query`, không truy vấn thẳng bảng sổ từ web | R-KER, SC-KERNEL-7 |
| D023-3 | Nút "Vì sao?" là **một trường của `remedy`** (`why: { accountCode, section }`) — kiểm / lỗi nào liên quan tài khoản thì khai; web mở thẻ đúng mục | dùng lại `bizcity_remedy@1`, không thêm cơ chế |
| D023-4 | Nội dung giải nghĩa phải `approved` (kế toán trưởng) mới hiện cho vai ngoài kế toán trưởng; bản `draft` chỉ kế toán trưởng thấy, có nhãn "nháp" | kiến thức nghiệp vụ không để nháp lộ ra người học |
| D023-5 | Phủ khởi đầu: ~30 tài khoản hay dùng (111, 112, 131, 133, 138, 141, 152–156, 211, 214, 242, 331, 333, 334, 335, 338, 411, 421, 511, 515, 521, 632, 635, 641, 642, 711, 811, 911); mở rộng tới cấp 2 của gói nền trước khi bật SC-ACC-1 block | làm được ngay, có giá trị ngay |

## 7. Câu hỏi cần chủ chốt (Q023-*)

> **Chủ chốt 2026-11-05:** Q023-1..3 theo cột "Đề xuất" — Q023-1 AI soạn nháp 30 tài khoản theo khuôn + căn cứ TT99, kế toán trưởng sửa và duyệt từng mục; Q023-2 chế độ học bật cho `viewer`, `developer`, người dùng mới dưới 30 ngày; Q023-3 không có `ledger:read` thì chỉ lớp 1 + 2. <!-- [2026-11-05 04:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 — chủ chốt Q023-* -->

| # | Câu hỏi | Đề xuất |
|---|---|---|
| Q023-1 | Ai soạn nháp giải nghĩa 30 tài khoản đầu: AI soạn → kế toán trưởng duyệt, hay kế toán trưởng viết? | AI soạn nháp theo khuôn + căn cứ TT99; kế toán trưởng sửa và duyệt từng mục |
| Q023-2 | Chế độ học mặc định bật cho vai nào? | `viewer`, `developer`, người dùng mới tạo dưới 30 ngày; tắt với `accountant` / `chief_accountant` |
| Q023-3 | Lớp 3 có hiện cho vai không có quyền xem sổ (`viewer` chỉ một số báo cáo)? | Theo quyền: không có `ledger:read` thì chỉ lớp 1 + 2 |
| Q023-4 | Có đưa thẻ vào MCP (AI trả lời "tài khoản 131 là gì" bằng chính nội dung đã duyệt)? | Có, action đọc `core.account.card` `expose.mcp = true`, `ai: 'read'` — AI trích đúng nguồn duyệt, không bịa |

## 8. Bốn đợt

| Đợt | Nội dung | Bằng chứng |
|---|---|---|
| **W0** | Tài liệu, bản mẫu, D / Q | chủ duyệt bố cục |
| **W1** | Hợp đồng `bizcity_account_card@1`, tệp giải nghĩa 30 TK (nháp → duyệt), SC-ACC-1 (warn → block khi đủ), action `core.account.card` | T023-1, 2 |
| **W2** | Thẻ ở ACC1, ô chọn, sổ chi tiết (hai cột dư), nút "Vì sao?" qua `remedy.why` ở 6 lỗi / kiểm liên quan tài khoản | T023-3, 4 |
| **W3** | Chế độ học, trang Học với 3 bài theo vai trên tenant mẫu, gợi ý theo lỗi (nối 021) | T023-5 |
