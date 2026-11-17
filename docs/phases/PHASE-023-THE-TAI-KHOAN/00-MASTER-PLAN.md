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
| D023-9 | **Bỏ tên tiếng Anh của tài khoản** (`accounts.name_en`, ô *Tên tài khoản theo ngôn ngữ* ở ACC1): cột chỉ để hiển thị, không dùng trong định khoản / báo cáo / bản in → xoá khỏi màn, API, dữ liệu mẫu và CSDL; giá trị cũ chép sang bảng lưu trước khi xoá. Chữ chốt ở [§9](#9-chữ-chốt-d023-9--bỏ-tên-tiếng-anh-của-tài-khoản) <!-- [2026-11-17 10:30 AM kiennt] PHASE-023 — đề xuất D023-9 (đóng góp) --> | **chờ chủ duyệt** — cột thừa làm form tài khoản rối; giữ dữ liệu cũ để không vi phạm ECP-13 |

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

## 9. Chữ chốt D023-9 — bỏ tên tiếng Anh của tài khoản
<!-- [2026-11-17 10:30 AM kiennt] PHASE-023 — chữ chốt D023-9 (R-FLOW-2: đổi lược đồ), chờ chủ duyệt (đóng góp) -->

**Trạng thái:** đề xuất, **chờ chủ duyệt**. Việc con S023-19, ca T023-8. Phiếu nghiệm thu [NT-DM-001](../../nghiem-thu/danh-muc/NT-DM-001-bo-ten-tieng-anh-tai-khoan.md).

**Vấn đề.** Form tài khoản (ACC1) có khung *Tên tài khoản theo ngôn ngữ* (ô *Tên tiếng Anh*, cột `accounts.name_en`). Người dùng yêu cầu bỏ. Đọc mã trên `main` (17/11/2026):
- **Hiển thị / nhập liệu:** form ACC1, cột ẩn "Tên tiếng Anh" trên lưới, cột Excel xuất / nhập (`apps/web/src/lib/nhapExcel.ts`).
- **Lưu / trả qua API:** `packages/kernel/src/modules/accounts/` (`account.schemas`, `account.service`, `account.repository`), kiểu `packages/platform/src/db/types.ts`.
- **Dữ liệu mẫu:** cột `name_en` của `db/seeds/tai-khoan.csv`, đọc ở `packages/kernel/src/db/seed.ts` và `default-data.service.ts` (khôi phục dữ liệu mặc định).
- **Không dùng ở đâu khác:** định khoản, `AccountResolver`, báo cáo, BCTC, bản in, MCP đều không đọc; không có khung nhìn `bizcity_read` nào chứa cột này; plugin WordPress (cầu nối kế toán, POS) không đọc `nameEn`.

**Lựa chọn.**

| # | Cách | Chọn |
|---|---|---|
| A | Chỉ ẩn trên màn, giữ cột | không — cột vẫn sống trong API / Excel / dữ liệu mẫu, người sau lại hiện ra |
| B | Xoá cột, chép giá trị cũ sang bảng lưu | **chọn** — gọn lược đồ, không mất dữ liệu đã nhập (ECP-13) |
| C | Xoá cột không lưu | không — mất tên tiếng Anh đơn vị đã khai, không quay lui được |

**Hình dạng.**
1. Migration `0147_bo_ten_tieng_anh_tai_khoan.sql` (số lấy bằng `scripts/so-tiep-theo.mjs`):
   ```sql
   CREATE TABLE accounts_name_en_luu (
     tenant_id bigint NOT NULL, code text NOT NULL, name_en text NOT NULL,
     archived_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id, code));
   -- COMMENT ON TABLE / mọi cột (SC-DATA-3); RLS tenant_isolation + quyền ketoan_app chỉ SELECT (như 0041)
   INSERT INTO accounts_name_en_luu (tenant_id, code, name_en)
     SELECT tenant_id, code, name_en FROM accounts WHERE COALESCE(btrim(name_en), '') <> '';
   ALTER TABLE accounts DROP COLUMN name_en;
   ```
2. **API:** bỏ `nameEn` khỏi `AccountDto` và schema nhập. Client cũ còn gửi `nameEn` thì zod bỏ qua (không lỗi). Thay đổi trả về là **bỏ trường**, nên ghi vào CHANGELOG.
3. **Web ACC1:** bỏ khung *Tên tài khoản theo ngôn ngữ*, cột lưới, cột Excel. Tệp Excel cũ có cột "Tên tiếng Anh" thì bỏ qua cột đó.
4. **Dữ liệu mẫu:** bỏ cột `name_en` khỏi `db/seeds/tai-khoan.csv`, `seed.ts`, `default-data.service.ts`.
5. `schema-catalog.ts`: thêm bảng `accounts_name_en_luu`.

**Ảnh hưởng.**
- **Mức Kernel K1:** không đổi định khoản, không đụng `ledger_*`, không đổi bút toán đã ghi. Là đổi hợp đồng API nhỏ (bỏ một trường tuỳ chọn chỉ để hiển thị).
- Ai đọc `nameEn` từ API sẽ nhận `undefined`. Trong repo và các plugin WP hiện không có chỗ nào đọc.
- **Đường lui:** migration ngược khôi phục được từ bảng lưu: `ALTER TABLE accounts ADD COLUMN name_en text; UPDATE … FROM accounts_name_en_luu`.

**Kiểm bằng gì.**
- **Ca T023-8:** sau migration, `accounts` không còn cột; mọi tên tiếng Anh cũ có trong `accounts_name_en_luu`; ACC1 tạo / sửa / nhập Excel tài khoản vẫn chạy; gửi `nameEn` không lỗi.
- **Lệnh kiểm:** `scripts/kiem-nang-cap.sh` (đổi bảng có dữ liệu), bốn lệnh kiểm bàn giao.

