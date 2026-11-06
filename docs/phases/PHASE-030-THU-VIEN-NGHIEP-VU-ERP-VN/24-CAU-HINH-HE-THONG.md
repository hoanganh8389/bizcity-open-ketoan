# PHASE-030 · 24 — Cấu hình hệ thống (HT13): tham số có căn cứ, từ màn cấu hình tới cảnh báo trên ô nhập
<!-- [2026-11-06 01:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — chủ dự án: "core master data trong phần cấu hình, hệ thống là một trong các nền tảng cốt lõi … contract action, authz ok thì vai trò gate, validator mới rõ ràng, cụ thể hoá được từ UI UX cấu hình, cho đến cảnh báo input, selector, gợi ý, warning, notify và nhật ký hệ thống" — chữ chốt + bản mẫu HT13 (S030-37) -->

> **Trạng thái:** 🟡 tài liệu + [bản mẫu](mockups/cau-hinh-he-thong.html) (S030-37), chờ chủ dự án duyệt D030-10..14. Chưa có mã.
> **Nguồn yêu cầu:** chủ dự án 2026-11-06 — *"Hãy nhớ, core master data trong phần cấu hình, hệ thống là một trong các nền tảng cốt lõi, trụ cột đảm bảo tính nhất quán, minh bạch, xuyên suốt continuity, tracebility … contract liên quan đến action, authz ok, thì vai trò gate, validator mới rõ ràng, cụ thể hoá được từ UI UX cấu hình, cho đến các cảnh báo input, selector, cho đến khi gợi ý suggestion, warning, notify, và các cảnh báo, cũng như nhật ký hệ thống."* Kèm ảnh menu "Cấu hình" của Erp-vn (20 mục).
> **Nối với:** [21](21-SO-CONG-VA-BANG-DIEU-HANH.md) cổng = bước `bizcity_action@1` §4 · [22](22-DANH-GIA-GON-PHAN-QUYEN.md) phân quyền gọn · [16](16-CHUAN-CHUNG-TU-DUNG-CHUNG.md) chính sách duyệt · [PHASE-026](../PHASE-026-MASTER-DATA-GOVERNANCE/README.md) dữ liệu gốc (Danh mục) · [`bizcity_settings@1`](../../contracts/BIZCITY-SETTINGS-MATRIX-v1.md) 1.1.0-draft (kho `setting_values`, PHASE-029 E2) · [ADR-0029](../../adr/ADR-0029-loi-bat-bien-nghiep-vu-linh-hoat.md) · [ADR-0030](../../adr/ADR-0030-ban-niem-phong-bang-chung.md).

## 0. Trả lời ngắn

- **Đã có căn cứ cho cấu hình hệ thống chưa?** Một phần. Registry có **24 khoá**: 9 loại A (ảnh hưởng sổ), 6 loại B (vận hành), 9 loại C (hiển thị) theo R-MATRIX-1. Nhưng chỉ **6 khoá** đi đường chung có phiên bản và ngày hiệu lực (`setting_values`, 0074), và **chưa khoá nào có trường căn cứ pháp lý** (`legalRef`). Chính sách định khoản đã có phiên bản theo ngày (0040), tham số pháp lý quốc gia chưa có (S030-35).
- **Đã có bản mẫu màn cấu hình chưa?** Chưa có trước tài liệu này. Danh mục có bản mẫu Master Data Center (PHASE-026), Hệ thống có HT06–HT10, nhưng không có màn tổng cho tham số. Bản mẫu HT13 đi kèm tài liệu này: [mockups/cau-hinh-he-thong.html](mockups/cau-hinh-he-thong.html).
- **Từ cấu hình tới cảnh báo trên ô nhập đi đường nào?** Một chuỗi, một luật dùng hai nơi (§2): tham số (HT13) → luật (registry, rulepack, HT09) → cổng của action (`bizcity_action@1` §4, S030-28) → `GateResult` → giao diện (gợi ý, danh sách chọn, nhắc, chặn, thông báo) → bằng chứng (`audit_logs`, niêm phong theo ngày). Giao diện **không giữ luật riêng**: form hỏi máy chủ cùng luật mà cổng dùng.
- **Vì sao phải chờ `bizcity_action@1` và phân quyền?** Vì cổng chỉ cụ thể hoá được khi biết *bước nào* chạy *theo thứ tự nào* với *quyền của ai*. `bizcity_action@1` đang 1.3.0-draft; bản 1.4.0 (các bước §4 là cổng, `GateResult`) là S030-28, chờ nhóm Lõi. Phân quyền PHASE-028 W1–W3 đã vào main, bản gọn doc 22 chờ chủ PHASE-028 nhận. Tài liệu này viết sẵn phần cấu hình để khi hai hợp đồng chốt, cổng `validation` có chỗ đọc tham số ngay.

## 1. Nguyên tắc cấu hình

| Mã | Nguyên tắc | Vì sao | Đã có |
|---|---|---|---|
| NC-1 | Mỗi tham số là **bản ghi có phiên bản**: giá trị, phạm vi, ngày hiệu lực, căn cứ, người ghi, lý do. Chỉ thêm, không ghi đè, không xoá; ngừng dùng là một dòng mới | Chứng từ ngày D phải tính lại được bằng đúng tham số của ngày D, kể cả sau khi tham số đổi (continuity) | 🟡 `setting_values` (0074) cho 6 khoá; chính sách định khoản (0040) |
| NC-2 | **Một đường đọc** `getSetting(trx, tenant, key, scope)`; module, cổng, báo cáo không đọc `tenants.settings` thẳng | Hai đường đọc là hai sự thật | 🟡 đợt 2 của E2 chuyển nốt |
| NC-3 | **Loại quyết quy trình** (R-MATRIX-1): **A** ảnh hưởng sổ → hai người (lập + duyệt), ngày hiệu lực không lùi vào kỳ đã khoá; **B** vận hành → một người có quyền + lý do; **C** hiển thị → người dùng tự đổi | Đổi khoá A là đổi kết quả kế toán | 🟡 có loại, chưa có luồng duyệt |
| NC-4 | Tham số **quốc gia** (lương cơ sở, trần BHXH, thuế suất, lịch nghỉ lễ) ở `vn-rulepacks`, có căn cứ tới điều / khoản / điểm; đơn vị **không sửa giá trị**, chỉ chọn gói hoặc ghi đè có lý do ở lớp đơn vị | Một nguồn cho mọi đơn vị; lệch luật thì sửa một chỗ | ☐ S030-35 |
| NC-5 | Chứng từ **ghi lại tham số đã dùng** (`basis_used` của bằng chứng, S030-29): khoá, giá trị, phiên bản, căn cứ | Trả lời được "vì sao con số này" nhiều năm sau | ☐ S030-29 |
| NC-6 | Đổi cấu hình là **một action có bằng chứng** (`core.settings.set`); nhật ký hệ thống = `audit_logs`, niêm phong theo ngày | Nhật ký cấu hình không là bảng thứ hai | ✅ đường ghi E2; ✅ niêm phong (S030-30b) |
| NC-7 | Cảnh báo trên form **sinh từ cùng luật** với cổng (mã luật, mức, câu chữ của thư viện), không câu chữ tự do | Người dùng thấy trên form đúng điều máy chủ sẽ chặn | ✅ cho danh mục (HT09, `catalog-hint`); ☐ chứng từ (S030-34) |
| NC-8 | **Bí mật không là tham số hiển thị**: chứng thư số, khoá kết nối, mật khẩu ở kho bí mật; HT13 chỉ hiện trạng thái (có / sắp hết hạn / hết hạn) | R-SEC; màn cấu hình không lộ khoá | ✅ khoá kết nối đã che; ☐ chứng thư số |

> Giá trị và căn cứ ví dụ trong tài liệu và bản mẫu lấy từ tệp `lfood-legal-params@1` chủ dự án xuất từ Erp-vn ngày 06/11 (120 tham số); **chưa được kế toán trưởng xác nhận** (S030-12), chỉ để minh hoạ.

## 2. Chuỗi: tham số → luật → cổng → giao diện → nhật ký

```
HT13 tham số (giá trị, hiệu lực, căn cứ)          HT09 luật nhập (danh mục ✅, chứng từ ☐ S030-34)
            │ getSetting(ngày chứng từ)                         │ mức: gợi ý · nhắc · chặn
            ▼                                                   ▼
   bizcity_action@1 §4 — các bước là cổng (S030-28): authz → khoá kỳ / dataLock → validation → handler → ghi sổ
            │ GateResult { gate, outcome: pass | hint | hold | block, code, basis[] }
            ├────────────► form: cùng action ở ?dryRun=1 / preview trả GateResult trước khi bấm lưu
            ├────────────► thông báo: người duyệt / chủ đơn vị (notifyFinding, không câu chữ tự do)
            └────────────► bằng chứng audit_logs (gates, basis_used — S030-29) → niêm phong ngày (ADR-0030)
```

| Bề mặt | Lấy từ đâu | Ví dụ | Hợp đồng | Đã có |
|---|---|---|---|---|
| **Gợi ý khi gõ** (suggestion) | luật mức `hint` + giá trị mặc định có nguồn | ô thuế suất tự điền mức giảm đang hiệu lực, kèm tên văn bản và ngày hết hiệu lực lấy từ tham số | `catalog-hint` (danh mục) | ✅ danh mục; ☐ chứng từ |
| **Danh sách chọn** (selector) | tham số / danh mục **còn hiệu lực tại ngày chứng từ** | chọn mã thuế chỉ thấy mã hiệu lực ngày 05/11; mã đã ngừng ẩn, có nút "xem cả mã đã ngừng" | `getSetting` + `valid_from` | 🟡 chính sách định khoản; ☐ danh sách chọn |
| **Nhắc** (warning) | cổng `validation` outcome `hint` | "Trả tiền mặt từ 5.000.000 đ trở lên: thuế GTGT đầu vào không được khấu trừ" — số và căn cứ lấy từ tham số `NGUONG_TT_KHONG_TIEN_MAT` (Luật Thuế GTGT 48/2024/QH15, NĐ 181/2025/NĐ-CP), không viết cứng trong mã; cho đi tiếp, ghi lý do | `GateResult` (S030-28) | ☐ |
| **Giữ** (hold) | outcome `hold` | chứng từ vượt hạn mức duyệt của pháp nhân → vào hàng việc "chờ duyệt" | hàng việc (S030-31) | ✅ hàng việc; ☐ outcome |
| **Chặn** (block) | outcome `block` + mã + phương án khắc phục | "Kỳ 10/2026 đã khoá (lock.period)" kèm nút mở HT07 | `bizcity_errors@1`, `bizcity_remedy@1` | ✅ khoá kỳ, quyền |
| **Thông báo** (notify) | sự kiện sau cổng | kế toán trưởng nhận "3 chứng từ chờ bạn duyệt quá 3 ngày" | `notifyFinding` | ✅ khung; ☐ theo cổng |
| **Nhật ký hệ thống** | `audit_logs` (+ `gates`, `basis_used`) | "05/11 09:14 — kt01 đổi `posting.tax_codes` V8 → V9, căn cứ NĐ …, duyệt bởi ktt" | `bizcity_evidence@1` | ✅ bằng chứng + niêm phong; ☐ cột cổng |

**Luật một chỗ:** form không tự kiểm. Khi rời ô hoặc trước khi lưu, form gọi chính action đó ở chế độ thử (`dryRun`) hoặc action đọc `preview`, nhận `GateResult[]`, rồi hiện đúng mức. Cùng luật chạy lại ở máy chủ lúc lưu thật. Hai nơi nói một câu vì cùng mã luật.

## 3. Đối chiếu menu "Cấu hình" của Erp-vn

Mức: ✅ có · 🟡 một phần · ☐ chưa. Loại: A / B / C theo R-MATRIX-1.

| Mục Erp-vn | open-ketoan hôm nay | Loại | Căn cứ / nguồn | Đích | Việc |
|---|---|---|---|---|---|
| Pháp nhân, hạn mức duyệt | chi nhánh (DM02), sơ đồ tổ chức (DM06); khoá `bizcity.payment.approval_thresholds` (phân hệ quỹ) | B | quy chế tài chính nội bộ | hạn mức theo pháp nhân + loại chứng từ, đọc ở cổng duyệt (doc 16 chính sách) | 🟡 S030-20 |
| Hệ thống tài khoản | ACC1, `posting.default_accounts`, chính sách có phiên bản (0040) | A | TT 200 / TT 133 (Hồ sơ kế toán HT07) | giữ; HT13 dẫn sang | ✅ |
| Tài khoản ngân hàng | DM09 | A | — | giữ ở Danh mục | ✅ |
| Khoản mục chi phí | ACC24 | A | — | giữ ở Danh mục | ✅ |
| Tham số pháp lý | chưa (kho `setting_values` có, chưa `legalRef`) | A | 120 tham số Erp-vn có `legal_ref` (tệp chủ dự án xuất 06/11) | `vn-rulepacks` + căn cứ tới điều | ☐ S030-35 |
| Lịch sử và gói tham số | `setting_values` có phiên bản (6 khoá) | A | — | mọi khoá A / B có phiên bản; "gói" = rulepack có phiên bản | 🟡 E2 đợt 2 |
| Tính thử tham số mới (bảng lương) | chưa | — | — | xem thử tác động (§4.3) cho mọi khoá A | ☐ S030-40 |
| Lịch nghỉ lễ, Tết | chưa | B | Bộ luật Lao động 2019 Điều 112 | dữ liệu rulepack + ngày bù của đơn vị; dùng cho `workingDays` | ☐ S030-35 |
| Thuế suất GTGT | `posting.tax_codes` + chính sách theo ngày (0040) | A | Luật thuế GTGT, nghị định giảm thuế theo từng thời kỳ | thuế suất có hiệu lực + căn cứ văn bản giảm thuế | 🟡 S030-35 |
| Ràng buộc nhập liệu | HT09 cho danh mục | B | quy chế nội bộ / luật | HT09 mở sang chứng từ (`ENTRY-*`) | 🟡 S030-34 |
| Loại tài sản | ACC37 | A | TT 45/2013 | giữ ở Danh mục | ✅ |
| Kho | DM12 | B | — | giữ ở Danh mục | ✅ |
| Khoản lương, ca làm việc | chưa | A | BLLĐ 2019, Luật BHXH | `modules/nhan-su` | ☐ P2 (S030-16) |
| Điều khoản thanh toán | chưa | B | hợp đồng | thuộc tính đối tượng / hợp đồng, có hạn | ☐ P1 |
| Chứng thư số | chưa | — | Luật Giao dịch điện tử 2023 | kho bí mật; HT13 chỉ hiện hạn dùng (NC-8) | ☐ ADR riêng |
| Điểm kiểm soát tới hạn | chưa (cổng có, danh sách chưa) | A | ADR-0029 | danh sách cổng bắt buộc theo loại chứng từ, đọc từ action + workflow (§4.2) | ☐ sau S030-28 |
| Ma trận phân quyền | vai trò đơn vị (0075, PHASE-028) | A | quy chế nội bộ | Role Editor dạng ma trận (doc 22) | 🟡 PHASE-028 |
| Nhập dữ liệu ban đầu | phiếu `opening` qua `eventStore` | A | — | giữ; HT13 nhắc nếu chưa nhập số dư đầu | ✅ |
| Thời hạn lưu trữ | `intake.retention_days`, bằng chứng ≥ 10 năm cố định | C / cố định | Luật Kế toán 2015 Điều 41 | bằng chứng và chứng từ **không** cấu hình xuống dưới mức luật | 🟡 |
| *(open-ketoan có, Erp-vn không)* Khoá sổ, khoá dữ liệu | `lock.period`, `lock.data` | A | — | giữ; HT13 hiện trạng thái | ✅ |
| *(open-ketoan có)* Chế độ định khoản | `posting.modes` | A | — | giữ | ✅ |

Tổng: ✅ 8 · 🟡 6 · ☐ 7 (21 dòng: 20 mục Erp-vn, gộp khoản lương với ca làm việc, thêm hai mục open-ketoan có sẵn). Phần thiếu tập trung ở **tham số pháp lý có căn cứ** và **luồng duyệt khoá A**, không ở danh mục.

## 4. Màn HT13 Cấu hình hệ thống

Bản mẫu: [mockups/cau-hinh-he-thong.html](mockups/cau-hinh-he-thong.html). Một trung tâm, không thêm 21 màn: các danh mục (tài khoản, kho, loại tài sản…) **giữ nguyên ở Danh mục**, HT13 dẫn link; HT13 lo tham số, hiệu lực, căn cứ, duyệt và tác động.

### 4.1 Bố cục

- **Đầu trang — sức khoẻ cấu hình:** số khoá thiếu căn cứ, số khoá A đang chờ duyệt, tham số sắp hết hiệu lực trong 30 ngày, ngày chưa niêm phong bằng chứng. Mỗi số bấm được.
- **Trái — năm nhóm:** Pháp nhân & duyệt · Kế toán & thuế · Pháp lý & lịch · Nhập liệu & kiểm soát · Lưu trữ & bảo mật.
- **Giữa — bảng tham số:** tên, giá trị đang hiệu lực, từ ngày, loại A / B / C, căn cứ (có / thiếu), trạng thái (đang áp / chờ duyệt / sắp hiệu lực), *dùng ở* (số chứng từ đã dùng phiên bản này).
- **Phải — thẻ tham số, bốn tab** (cùng khung "bốn khả năng" của Master Data Center PHASE-026):
  1. **Giá trị & hiệu lực** — các phiên bản trên dòng thời gian, phạm vi (đơn vị / chi nhánh / người dùng);
  2. **Căn cứ** — văn bản, điều, khoản, điểm, đường dẫn, ngày hiệu lực của văn bản;
  3. **Lịch sử** — ai đề xuất, ai duyệt, lý do, mã bằng chứng (mở được bản ghi bằng chứng);
  4. **Tác động** — cổng nào đọc khoá này, form nào hiện cảnh báo từ nó, bao nhiêu chứng từ đã dùng từng phiên bản.

### 4.2 Điểm kiểm soát tới hạn

Không là danh sách gõ tay. HT13 **đọc** từ khai báo action và workflow: với mỗi loại chứng từ, các cổng bắt buộc (quyền, khoá kỳ, kiểm nội dung, duyệt, ghi sổ) và tham số mỗi cổng dùng. Đơn vị không tắt được cổng của Lõi (ADR-0029: lõi bất biến); chỉ chỉnh được *ngưỡng* của cổng thuộc chính sách (hạn mức, mức nhắc / chặn của luật nhập).

### 4.3 Đổi một khoá loại A

1. Người có quyền nhập giá trị mới, **ngày hiệu lực**, **căn cứ**, lý do.
2. **Xem thử tác động** (chạy thử, không ghi): bao nhiêu chứng từ nháp / chờ duyệt có ngày ≥ ngày hiệu lực đổi kết quả cổng; ngày hiệu lực có rơi vào kỳ đã khoá không (có → chặn).
3. Người thứ hai duyệt (khác người đề xuất). Đơn vị một người: xem Q030-6.
4. Có hiệu lực từ ngày đã chọn; bằng chứng ghi cả đề xuất lẫn duyệt; chứng từ cũ giữ phiên bản cũ.

### 4.4 "Xem như trên form"

Mỗi luật / tham số có ô xem trước: ô nhập giả hiện đúng gợi ý, danh sách chọn, nhắc, chặn mà người nhập chứng từ sẽ thấy. Người cấu hình thấy hậu quả trước khi bật.

## 5. Ảnh hưởng tới hợp đồng (đề xuất, không mở hợp đồng mới)

| Hợp đồng | Thêm gì | Chủ | Ghi chú |
|---|---|---|---|
| `bizcity_settings@1` → 1.2.0 | mục registry thêm `basis` (`{ doc, article?, clause?, point?, url?, effectiveFrom? }`), `approval: 'two_person' \| 'single'` (mặc định theo loại), `usedBy` (cổng / form đọc khoá); `setting_values` thêm `basis jsonb`, `status` (`proposed` / `approved`), `approved_by` | PHASE-029 E2 | PR chốt riêng — chủ E2 nhận hoặc bác (S030-38) |
| `bizcity_action@1` → 1.4.0 | cổng `validation` đọc tham số qua `getSetting` theo **ngày chứng từ**, trả `basis[]` trong `GateResult` | nhóm Lõi | đã là S030-28 |
| `bizcity_evidence@1` | `basis_used` chứa `{ kind: 'param', key, version, value, legalRef }` | PHASE-030 | đã là S030-29 |
| `vn-rulepacks` | khoá tham số pháp lý + lịch nghỉ lễ + thuế suất có hiệu lực, mỗi khoá có căn cứ | PHASE-030 + kế toán trưởng | đã là S030-35 |

Không có hợp đồng `bizcity_config@1` riêng: cấu hình là `bizcity_settings@1`, cổng là `bizcity_action@1`, nhật ký là `bizcity_evidence@1`.

## 6. Quyết định chờ chủ dự án

| Mã | Đề xuất |
|---|---|
| D030-10 | HT13 *Cấu hình hệ thống* là **một trung tâm** cho tham số (hiệu lực, căn cứ, duyệt, tác động); danh mục giữ ở Danh mục, HT13 dẫn link |
| D030-11 | Bàn điều hành chứng từ & cổng đổi mã **HT11 → HT12** vì HT11 đã là *Khối ảnh* trong menu Hệ thống (đã sửa ở 21, 23, ADR-0030, checklist, bản mẫu) |
| D030-12 | Khoá loại A: hai người (đề xuất + duyệt), ngày hiệu lực không lùi vào kỳ đã khoá, có xem thử tác động |
| D030-13 | Bí mật (chứng thư số, khoá kết nối) không hiện giá trị ở HT13, chỉ trạng thái và hạn dùng |
| D030-14 | Tham số quốc gia ở `vn-rulepacks`, đơn vị chỉ chọn gói / ghi đè có lý do; thời hạn lưu trữ bằng chứng và chứng từ không cấu hình xuống dưới mức luật |

**Q030-6.** Đơn vị một người (chủ kiêm kế toán) đổi khoá A thì ai duyệt? Đề xuất: cho một người tự duyệt **kèm lý do**, bằng chứng đánh dấu `selfApproved`, Bàn đánh giá HT08 liệt kê để kiểm toán xem lại. Phương án khác: bắt buộc người thứ hai (dịch vụ kế toán ngoài).

## 7. Golden tests (it.todo tới khi có mã)

| Mã | Kiểm |
|---|---|
| T030-CFG-1 | Chứng từ ngày D dùng đúng phiên bản tham số có `valid_from ≤ D` lớn nhất, kể cả sau khi tham số đổi |
| T030-CFG-2 | Đổi khoá A có ngày hiệu lực trong kỳ đã khoá → chặn, mã `PERIOD_LOCKED` |
| T030-CFG-3 | Khoá A do một người đề xuất chưa có hiệu lực tới khi người thứ hai duyệt; người đề xuất không tự duyệt được (trừ Q030-6) |
| T030-CFG-4 | Danh sách chọn mã thuế tại ngày D không có mã đã ngừng trước D |
| T030-CFG-5 | Form chạy thử và lưu thật trả cùng `GateResult` (cùng mã, cùng mức) cho cùng dữ liệu |
| T030-CFG-6 | Bằng chứng của chứng từ có `basis_used` với khoá, phiên bản, căn cứ của tham số đã dùng |
| T030-CFG-7 | Bằng chứng của lần đổi cấu hình có người đề xuất, người duyệt, lý do, căn cứ; niêm phong ngày giữ được |
| T030-CFG-8 | HT13 không trả giá trị của khoá bí mật qua API đọc |

## 8. Việc

| Mã | Việc | Chủ | Phụ thuộc |
|---|---|---|---|
| S030-37 | Tài liệu này + bản mẫu HT13; đổi mã Bàn điều hành sang HT12 | PHASE-030 | — (PR này) |
| S030-38 | PR chốt `bizcity_settings@1` 1.2.0: `basis`, `approval`, `usedBy`; `setting_values.basis / status / approved_by` | chủ PHASE-029 E2 nhận | D030-12 |
| S030-39 | Màn HT13 bản chỉ đọc: registry + giá trị đang hiệu lực + phiên bản + bằng chứng + sức khoẻ cấu hình, trên dữ liệu đã có | web + Platform | D030-10 |
| S030-40 | Luồng đổi khoá A: đề xuất → xem thử tác động → duyệt; "xem như trên form" | Platform + web | S030-38, S030-28 |

Lịch nghỉ lễ, thuế suất có hiệu lực và tham số pháp lý đã nằm ở S030-35; luật nhập chứng từ ở S030-34.
