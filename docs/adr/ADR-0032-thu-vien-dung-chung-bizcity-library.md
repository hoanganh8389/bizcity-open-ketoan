# ADR-0032 · Thư viện dùng chung `bizcity_library@1`: một khuôn cho dữ liệu tham chiếu có phiên bản, phép kiểm biết gợi ý, mã lỗi chung, chọn được trên form
<!-- [2026-11-07 09:28 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — ADR-0032: khuôn chung bizcity_library@1 cho mọi thư viện tham chiếu (tham số pháp lý, ngày nghỉ, phân quyền mẫu, sườn nghiệp vụ, luật kiểm…); chốt đợt A theo sáu nguyên tắc của chủ dự án -->

- Trạng thái: **Chấp nhận** 2026-11-07 (chủ dự án: *"đồng ý theo thứ tự bro đề xuất, chốt đợt A. đưa về khuôn chung bizcity_library@1"*). Đợt B–D (sườn nghiệp vụ, luật kiểm, báo cáo, nhập, gói định khoản) mỗi đợt một PR chốt riêng.
<!-- [2026-11-07 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-44 sửa chốt khi viết mã: LIB-NOT-EFFECTIVE-001 → LIB-EFFECTIVE-001 và mã luật ba khúc (khuôn [A-Z]+-[A-Z]+-NNN mà SC-FIND-1 / trang tra mã đọc) -->
- Ngày: 2026-11-07 · Người quyết: Johnny Chu – Chu Hoàng Anh · Mức Kernel: K0. Đợt A chạm Platform (kiểu, bộ nạp, bộ kiểm, API đọc), `packages/contracts` (mã `LIB-*`), bộ kiểm (SC-LIB-1); **không** chạm Kernel, không migration.
- Luật / hợp đồng liên quan: [ADR-0019](ADR-0019-hai-cong-kiem-chuan-nhap-va-be-cho.md) + [`bizcity_findings@1`](../contracts/BIZCITY-FINDINGS-v1.md) (một ngôn ngữ mã), [ADR-0020](ADR-0020-ton-chi-core-nguoi-dung-quyet-dinh-mot-ngon-ngu-ma.md) (Core gợi ý, người dùng quyết), [ADR-0031](ADR-0031-policy-registry-rule-contracts.md) (chính sách của đơn vị), [ADR-0016](ADR-0016-duyet-rulepack-tai-ban-cai.md) (duyệt rulepack), [ADR-0028](ADR-0028-enterprise-continuity-nen-mong-doanh-nghiep.md) ECP-13, [PHASE-030 · 21 §3](../phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/21-SO-CONG-VA-BANG-DIEU-HANH.md) (tham số pháp lý), [PHASE-030 · 24](../phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/24-CAU-HINH-HE-THONG.md) (cấu hình).
- Hợp đồng: [`BIZCITY-LIBRARY-v1.md`](../contracts/BIZCITY-LIBRARY-v1.md) + [schema](../contracts/BIZCITY-LIBRARY-v1.schema.json).

## Bối cảnh

open-ketoan là **nền khởi tạo** cho anh em dev dựng ERP nội bộ. Ngoài sổ cái, mỗi đội đều cần cùng một lượng **dữ liệu tham chiếu**: tham số pháp lý (lương tối thiểu vùng, trần BHXH, thuế suất theo ngày), ngày nghỉ lễ, mã chức năng và vai trò mẫu (thư viện TGS, PHASE-028 W5 đợt 2), sườn nghiệp vụ (Erp-vn 173 mục, PHASE-030), luật kiểm nhập liệu, danh sách báo cáo, mẫu nhập…

Hôm nay mỗi thứ một khuôn:

| Thứ | Ở đâu | Khuôn |
|---|---|---|
| Phát hiện Gate A / B | `packages/contracts/src/findings.ts` | `bizcity_findings@1` (mã, mức, vì sao, cách sửa, căn cứ) |
| Rulepack Việt Nam | `packages/vn-rulepacks/` | `bizcity_vn_catalog@1`, `rulepack.schema.json` |
| Căn cứ pháp lý | `packages/contracts/src/legal-basis.ts`, `vn-rulepacks/registry/legal-sources.json` | riêng |
| Khoá cấu hình | `docs/contracts/bizcity-settings.registry.json` | `bizcity_settings@1` |
| Phân quyền mẫu TGS | `docs/standard/phan-quyen/*.json` | `bizcity_authz_tgs_codes@1`, `…_groups@1` |
| Tham số pháp lý Erp-vn | tệp chủ dự án xuất (`lfood-legal-params` v1, 110 tham số) | ngoài |

Hệ quả: không có cách chung để hỏi *"mã này còn dùng không, giá trị tại ngày nào, sai thì gợi ý gì, chọn trên form thế nào"*. Mỗi thư viện mới lại viết bộ nạp, phép kiểm, mã lỗi, ô chọn riêng.

Chủ dự án đặt sáu nguyên tắc cho mọi thư viện: (1) dữ liệu JSON, linh hoạt; (2) có phiên bản; (3) phép kiểm có căn cứ để gợi ý; (4) mã lỗi chuẩn chung; (5) có hướng dẫn, gợi ý; (6) bắt được ô nhập, ô chọn theo thư viện.

## Quyết định

| Mã | Quyết định |
|---|---|
| **D-LIB-1** | **Một khuôn `bizcity_library@1` cho mọi thư viện tham chiếu.** Mỗi thư viện là **một tệp JSON** `libraries/<id>/library.json` (phong bì cố định + `items[]`), kèm `README.md` (hướng dẫn) và, nếu sinh từ nguồn, `sources/` + script sinh. Thư viện là **dữ liệu**, không chứa mã chạy. `id` = `<miền>.<tên>` (vd `vn.tham-so-phap-ly`, `vn.ngay-nghi-le`, `authz.tgs-chuc-nang`). |
| **D-LIB-2** | **(Nguyên tắc 1) Phong bì cứng, nội dung mềm.** Phong bì giống nhau ở mọi thư viện (định danh, phiên bản, nguồn, ô chọn, luật, mã). Mỗi mục có `payload` tự do, ràng bởi `itemSchema` (JSON Schema) **do thư viện tự khai**. Thêm trường vào `payload` không đổi hợp đồng; SC-LIB-1 kiểm mọi `payload` khớp `itemSchema`. |
| **D-LIB-3** | **(Nguyên tắc 2) Ba tầng phiên bản.** ① Thư viện: `version` semver — major khi đổi nghĩa / bỏ mã, minor khi thêm mục / trường, patch khi sửa câu chữ, gợi ý — kèm `contentHash` (sha256 của `items` chuẩn hoá) và `changelog[]`; đổi nội dung mà không lên phiên bản → SC-LIB-1 chặn. ② Mục: `code` **không bao giờ dùng lại**, không xoá; `status` `active` → `deprecated` (có `replacedBy`) → `removed` (giữ bia mộ) — ECP-13. ③ Giá trị: `effective[]` theo ngày `{ from, to, value, basis }` cho thứ thay đổi theo thời gian (thuế suất, lương tối thiểu); đọc **tại ngày** (`at`), không có ngày thì là hôm nay. Bằng chứng ghi `{ kind: 'library', key: '<id>:<code>', version, hash }` vào `basis_used` (S030-29). |
| **D-LIB-4** | **(Nguyên tắc 3) Phép kiểm chung biết gợi ý, căn cứ là chính thư viện.** Một bộ kiểm `validateAgainstLibrary(id, input, { at })` dùng cho mọi thư viện. Năm kiểm chuẩn luôn chạy (mã có không, còn dùng không, có hiệu lực tại ngày không, đúng khuôn không, đã duyệt chưa), mỗi kiểm có **nguồn gợi ý cố định**: mã gần nhất theo trường tìm, `replacedBy`, giá trị đúng ngày, giá trị thư viện. Thư viện thêm **luật khai báo** `rules[]` (điều kiện JSON trên ô nhập + mục thư viện, không phải mã); luật cần tính toán thì là Rule Contract của Policy Registry (ADR-0031) hoặc phép kiểm của module, không phải thư viện. Mỗi phát hiện trả `suggestions[]` `{ value, label, why, confidence }` — Core **gợi ý**, người dùng quyết (ADR-0020). |
| **D-LIB-5** | **(Nguyên tắc 4) Mã lỗi chung `LIB-*` trong `bizcity_findings@1`.** Bảy mã chuẩn (`LIB-UNKNOWN-001`, `LIB-DEPRECATED-001`, `LIB-REMOVED-001`, `LIB-EFFECTIVE-001`, `LIB-SCHEMA-001`, `LIB-VALUE-001`, `LIB-UNVERIFIED-001`) là một danh mục nguồn thứ ba của thư viện phát hiện (cổng `L`, `source: 'bizcity_library'`). Luật riêng của một thư viện dùng mã `<codePrefix>-<NHÓM>-<NNN>` (ba khúc như mọi mã của thư viện phát hiện, vd `TSPL-LAW-001`) khai ở `rules[]`, gom vào cùng thư viện phát hiện với `source: 'bizcity_library:<id>'`. Cùng luật SC-FIND-1: không trùng mã, có tiêu đề, vì sao, cách sửa (block / warn), căn cứ. Tra mã bằng `npx bizcity explain`, `GET /api/v1/findings/:code`, MCP `core.findings.explain` như mọi mã khác. |
| **D-LIB-6** | **(Nguyên tắc 5) Hướng dẫn đi theo dữ liệu.** Ba chỗ: `README.md` của thư viện (bắt buộc: dùng làm gì, ai duyệt, cách cập nhật); `hints[]` ở mục `{ kind: how \| why \| example \| warning, text, link? }`; `why` / `fix` / `basis` ở luật. Căn cứ pháp lý dùng khuôn `basis` của findings (văn bản trong `LEGAL_BASES`, điều khoản kèm `verified`); thư viện máy sinh hoặc chưa đối chiếu ghi `verified: false` ở mục và giao diện hiện nhãn "chưa duyệt". |
| **D-LIB-7** | **(Nguyên tắc 6) Ô chọn và ô nhập khai trong thư viện.** Phong bì có `selector` `{ value, label, search[], group?, filters[], sort? }`: thư viện tự nói lấy trường nào làm giá trị, hiện gì, tìm theo gì. API `GET /api/v1/libraries/:id/items?q=&at=&group=&status=` trả mục **đã dựng sẵn theo khuôn ô chọn** (`value`, `label`, `group`, `hint`, `deprecated`), lọc theo ngày hiệu lực. Ô nhập gắn thư viện bằng `library: '<id>'`; gửi lên thì `POST /api/v1/libraries/:id/validate` (hoặc gọi thẳng bộ kiểm ở máy chủ) trả phát hiện + gợi ý. Thành phần `LibraryPicker` của `@bizcity/ui-kit` là đợt A2 (PR riêng, cùng hợp đồng). |
| **D-LIB-8** | **Thư viện ≠ chính sách ≠ cấu hình.** Thư viện: dữ liệu tham chiếu **chung cho mọi đơn vị**, phát hành theo repo, đơn vị chỉ đọc. Chính sách (ADR-0031): quyết định nghiệp vụ **của một đơn vị**, phát hành ở module. Cấu hình (`setting_values`): giá trị **của một đơn vị**, có ngày hiệu lực. Thứ tự đọc một tham số: đơn vị ghi đè (`setting_values`, bắt lý do) → thư viện tại ngày → mặc định registry (đúng như [21 §3.2](../phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/21-SO-CONG-VA-BANG-DIEU-HANH.md) bước 4). Thư viện **không bao giờ** tự sinh bút toán, không tự tạo danh mục, không cấp quyền (vai trò mẫu nạp vào là bản nháp vô hiệu — D-AUTH-08). |
| **D-LIB-9** | **Nguồn và giấy phép.** Thư viện chỉ chứa dữ liệu tự lập, văn bản pháp luật công khai, hoặc dữ liệu chủ dự án xác nhận được công bố (vd thư viện TGS, ngày 2026-11-07). **Không** đưa vào repo: mã dịch ngược, thiết kế nội bộ, phát hiện bảo mật, cấu trúc CSDL của phần mềm khác — chỉ rút **luật nghiệp vụ chung** viết lại bằng lời của mình, ghi nguồn ở mức "tham khảo nghiệp vụ". Mỗi thư viện khai `sources[]` (`{ title, kind: law \| internal \| reference \| generated, date, license? }`). |
| **D-LIB-10** | **Hiện có thì chuyển khuôn, không viết lại.** Thư viện TGS đổi sang phong bì (giữ script sinh và SC-AUTH-04). Tham số pháp lý của S030-35 đi thẳng vào khuôn này (`libraries/vn.tham-so-phap-ly`); `vn-rulepacks` đọc qua bộ nạp, không giữ bản thứ hai. `bizcity_findings@1`, `bizcity_settings@1` giữ nguyên chỗ (đã có SC riêng); về sau có thể xuất ra phong bì để chọn / tra chung — không bắt buộc. |

## Đợt

| Đợt | Nội dung | PR |
|---|---|---|
| **A** (chốt ở ADR này) | hợp đồng + kiểu (`packages/platform/src/core/libraries/types.ts`, dự kiến) + mã `LIB-*` (`packages/contracts/src/library-findings.ts`, dự kiến); bộ nạp và bộ kiểm `packages/platform/src/core/libraries/`; API đọc + kiểm (`core.library.list / items / validate`, `ai: 'read'`); SC-LIB-1; bốn thư viện mẫu: `vn.tham-so-phap-ly`, `vn.ngay-nghi-le`, `authz.tgs-chuc-nang`, `authz.tgs-nhom` | S030-45 |
| A2 | `LibraryPicker` trong `@bizcity/ui-kit`; HT13 / HT12 dùng thử | sau A |
| B | sườn nghiệp vụ (Erp-vn 173 + 349 mã TGS) gắn module / phân hệ; luật nhập chứng từ `ENTRY-*` (S030-34) từ 36 cờ TGS + luật kiểm tổng hợp; đọc tham số theo thứ tự D-LIB-8 trong `getSetting` | chốt riêng |
| C | báo cáo (154 mã TGS ↔ 39 báo cáo Core), mẫu nhập | chốt riêng |
| D | dữ liệu gốc mẫu (khoản lương, khoản mục chi phí, loại thuế), gói định khoản | chốt riêng |

## Hệ quả

**Được:**
- Viết thư viện mới = viết một tệp JSON + README; bộ nạp, API, ô chọn, phép kiểm, mã lỗi, trang tra có sẵn.
- Một câu trả lời chung cho dev, kế toán và AI: *mã này nghĩa gì, còn dùng không, giá trị tại ngày nào, sai thì gợi ý gì*.
- Chứng từ cũ tính lại đúng giá trị cũ (đọc tại ngày + phiên bản + băm ghi trong bằng chứng).

**Mất / chi phí:**
- Thêm một danh mục nguồn vào `bizcity_findings@1` (lên 1.2.0) và một cổng `L` — mọi chỗ đọc `gate` phải nhận giá trị mới.
- Luật khai báo cố ý **hẹp** (so sánh, thuộc tập, khớp mẫu, có / không): luật phức tạp phải sang Policy Registry hoặc module.
- Giá trị tham số pháp lý chưa được kế toán trưởng xác nhận (S030-12): đợt A nạp với `verified: false`, chưa dùng để tính.

**Việc phải làm:** [PHASE-030 · 40](../phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md) S030-44 (chốt), S030-45 (đợt A).

## Phương án đã cân nhắc

| Phương án | Vì sao không chọn |
|---|---|
| Mỗi thư viện một hợp đồng riêng (như `bizcity_authz_tgs_codes@1`) | lặp bộ nạp, mã lỗi, ô chọn; không có câu trả lời chung về phiên bản / gợi ý |
| Bảng CSDL `libraries` + `library_items` | thư viện chung mọi đơn vị, phát hành theo repo, cần duyệt qua PR và diff được; đặt vào CSDL thì mất diff, thêm migration, dễ bị sửa tay |
| Nhét hết vào `vn-rulepacks` | rulepack là gói **kiểm tuân thủ** theo ADR-0016; thư viện phân quyền / sườn nghiệp vụ không phải luật Việt Nam |
| DSL luật tổng quát trong thư viện | biến dữ liệu thành mã; trùng Rule Contract của ADR-0031; khó duyệt |
| Dùng thẳng khuôn `lfood-legal-params` | chỉ hợp tham số; không có ô chọn, gợi ý, mã lỗi |
