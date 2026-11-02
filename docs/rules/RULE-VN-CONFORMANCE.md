# RULE · Bộ kiểm chuẩn pháp lý Việt Nam (R-VNC)
<!-- [2026-11-01 11:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — luật R-VNC-1..9 cho bộ kiểm chuẩn kế toán / thuế / hoá đơn Việt Nam: kho nguồn pháp lý, rulepack có phiên bản, cổng phê duyệt fail-closed, báo cáo bằng chứng (VNCONF-002). -->
<!-- [2026-11-02 01:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — thêm R-VNC-10: Engine phục vụ quyết định, không thêm luật kế toán / đường ghi sổ vào Core; cảnh báo không chặn, xác nhận là bằng chứng (ADR-0012) -->
<!-- [2026-11-02 05:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — ADR-0014: thêm R-VNC-11 duyệt tại bản cài; R-VNC-3 áp cho kho thượng nguồn. -->

> **Cấp:** Tier 1 (R-VNC-3, R-VNC-7 là Tier 0) · **Phiên bản:** 1.0 · 2026-11-01 · **Chỉ mục:** [../00-CANON.md](../00-CANON.md)
> **Dữ liệu:** `packages/vn-rulepacks/` (registry, catalog, rulepacks, schemas) · **Kiểm:** `tests/conformance/checks/vietnam/vn-conformance.check.mjs` (SC-VNC-1, SC-VNC-2)
> **Quy trình:** [../compliance/RULEPACK-GOVERNANCE.md](../compliance/RULEPACK-GOVERNANCE.md) · [../compliance/LEGAL-SOURCE-REGISTRY.md](../compliance/LEGAL-SOURCE-REGISTRY.md) · **Phase:** [PHASE-020](../phases/PHASE-020-KIEM-CHUAN-PHAP-LY-VN/README.md)
> **Tuyên bố:** bộ kiểm là **kiểm thử độc lập có truy vết căn cứ**, không phải chứng nhận nhà nước, không phải ý kiến pháp lý. Kết quả chỉ có giá trị trong phạm vi, ngày, phiên bản phần mềm, phiên bản rulepack và bộ test đã chạy.

## 1. Luật

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **R-VNC-1** | Mọi căn cứ pháp lý dùng trong rulepack / ca phải có **hồ sơ trong kho nguồn** (`registry/legal-sources.json`): số hiệu, cơ quan ban hành, hiệu lực chung, hiệu lực **theo điều / khoản**, văn bản thay thế / sửa đổi, **link chính thức** (Công báo, vanban.chinhphu.vn, vbpl.vn, mof.gov.vn), ảnh chụp có băm, trạng thái rà soát (`pending` / `reviewed`), người rà. Kết quả tìm kiếm web, nguồn thứ cấp hay nội dung do AI sinh **không** là căn cứ duy nhất: nguồn `reviewed` mà không có link chính thức / ảnh chụp là đỏ | SC-VNC-1, SC-VNC-2 |
| **R-VNC-2** | Rulepack và ca là **dữ liệu có schema** (`bizcity_vn_rulepack@1`, `bizcity_vn_case@1`), ID ổn định (`vn.<rulepack>.<nhóm>.<slug>.<nnn>`), **SemVer** riêng cho rulepack / ca / schema; đổi nội dung = tăng version, không đổi ID. Phạm vi áp dụng khai đủ: loại pháp nhân, chế độ, **năm tài chính bắt đầu từ**, ngày giao dịch từ / đến, tiền tệ, chi nhánh khi liên quan | SC-VNC-1, SC-VNC-2 |
| **R-VNC-3** *(T0)* | **Fail closed.** `status: approved` chỉ hợp lệ khi: mọi căn cứ `reviewed` và không còn `REVIEW_REQUIRED`; nguồn trong registry đã `reviewed`; có `accounting_reviewer`, thêm `tax_reviewer` với miền thuế / hoá đơn / quản lý thuế / lương; có `approved_at`; ca có fixture vàng thì `golden.hash` khớp băm fixture; rulepack phát hành có `rules_hash` + `released_at`. Thiếu bất kỳ điều kiện nào thì kết quả là **REVIEW_REQUIRED**, không bao giờ là PASS. Không có cấu hình mặc định nào bỏ qua được cổng này | SC-VNC-2 (block) |
| **R-VNC-4** | **Chọn rulepack qua 4 bước độc lập:** (1) đơn vị + pháp nhân + kỳ tài chính + loại nghiệp vụ; (2) chế độ kế toán được cấu hình / duyệt và điều kiện chuyển tiếp; (3) pháp luật thuế / hoá đơn theo **ngày hiệu lực của giao dịch**, không suy từ chế độ kế toán; (4) đúng **một** rulepack `approved` phù hợp, tất định. Mơ hồ, xung đột, thiếu nguồn, duyệt hết hạn ⇒ REVIEW_REQUIRED | Runner (VNCONF-003, S020-6) — chưa có |
| **R-VNC-5** | **Kế toán, thuế, hoá đơn là ba miền quy định khác nhau.** Mỗi nguồn, rulepack, ca khai `domain`. Không suy tính hợp lệ về thuế / hoá đơn từ một bút toán hợp lệ; ca thuế không PASS nhờ ca kế toán | SC-VNC-1 (schema `domain`); duyệt PR |
| **R-VNC-6** | **Tiền trong fixture** là số nguyên (đơn vị nhỏ nhất) hoặc chuỗi thập phân; **không** số thực. Rulepack **không** hardcode một mức thuế GTGT mặc định hay một hệ thống tài khoản cho mọi đơn vị; `expected_fixture` do người duyệt chốt và băm, không chứa logic hạch toán do AI suy đoán | SC-VNC-2 (`float:*`, `golden-mismatch:*`) |
| **R-VNC-7** *(T0)* | **Runner chỉ đi cổng công khai:** `@bizcity/kernel` gốc gói, HTTP `/api/v1`, MCP chỉ đọc; không import đường con Kernel, không ghi `ledger_*` / `accounting_events`, không tắt trigger, không `session_replication_role`. Dữ liệu test ở đơn vị giả lập riêng (`setupTenant()`), đồng hồ cố định | SC-KERNEL-1, SC-KERNEL-6, `scripts/kiem-chuan.sh`; runner (S020-6) |
| **R-VNC-8** | **Báo cáo** theo `bizcity_vn_conformance_report@1`: `run_id`, `executed_at`, git SHA, runtime, phiên bản Kernel / plugin, rulepack `id` + `version` + `rules_hash`, hồ sơ đơn vị giả lập, `scope`, từng ca với 6 trạng thái `PASS · FAIL · NOT_APPLICABLE · NOT_TESTED · REVIEW_REQUIRED · ERROR`, lý do, bằng chứng, `known_exclusions`. `FAIL` / `ERROR` ở ca P0 áp dụng chặn merge / phát hành; `REVIEW_REQUIRED` và `NOT_TESTED` **không** tính PASS; `NOT_APPLICABLE` phải có lý do. Nhãn duy nhất được dùng: **"Passed Bizcity VN Conformance [scope/version/date]"**; không tự nhận chứng nhận Bộ Tài chính / cơ quan Thuế | SC-VNC-1, SC-VNC-2 (`report-*`); CI gate (S020-8) |
| **R-VNC-9** | **Cập nhật pháp luật** theo 8 bước: detect → triage → draft (AI chỉ soạn đề xuất, không chọn tài khoản, không ký duyệt) → expert review → golden approval (2 người với luật P0 nhạy cảm) → release bất biến (version, checksum, changelog, migration path) → regression (toàn bộ ca + ngày lịch sử, không hồi tố thay đổi test không giải thích) → advisory (báo module / đơn vị bị ảnh hưởng; **không tự sửa sổ đã post**) | [../compliance/RULEPACK-GOVERNANCE.md](../compliance/RULEPACK-GOVERNANCE.md); duyệt PR (CODEOWNERS `tests/conformance/`) |
| **R-VNC-10** | **Phân tích phục vụ quyết định, Core giữ lean.** Conformance Engine chỉ đọc; không thêm luật kế toán, đường ghi sổ hay phụ thuộc vào Core; dùng lại khung tự chẩn đoán, bằng chứng, chính sách có phiên bản. Cảnh báo (Posting Gate) **không chặn**: người dùng quyết định tiếp hay dừng, và lần tiếp tục được ghi bằng chứng (người, mã cảnh báo, chứng từ / kỳ). AI / khoá API không xác nhận thay người. Không công bố "điểm tuân thủ %" cho doanh nghiệp; ngưỡng nội bộ khai miền `internal` | [ADR-0012](../adr/ADR-0012-conformance-engine-tru-cot-kernel.md) T1–T8; duyệt PR |
| **R-VNC-11** | **Duyệt tại bản cài (self-host).** Đơn vị tự duyệt rulepack còn nháp trên bản cài của mình (quyền `conformance:approve`: chủ đơn vị, kế toán trưởng; không khoá API, không AI). Lượt duyệt ghi người duyệt kế toán (+ người duyệt thuế với miền thuế / hoá đơn / quản lý thuế / lương), phạm vi đã rà; gắn đúng phiên bản + băm nội dung — đổi nội dung thì hết hiệu lực. Chỉ thêm, có bằng chứng. Kết quả dựa trên duyệt này mang nhãn **"Đạt theo duyệt của đơn vị [...]"**, `approval_basis` ≠ `upstream`; không bao giờ mang nhãn "Passed Bizcity VN Conformance". R-VNC-3 vẫn là cổng của kho thượng nguồn | [ADR-0014](../adr/ADR-0014-duyet-rulepack-tai-ban-cai.md); `rulepack-approval.test.ts` |

## 2. Trạng thái ca và cách đọc

| Trạng thái | Nghĩa | Tính PASS? |
|---|---|---|
| `PASS` | ca áp dụng, bằng chứng đạt, rulepack `approved` | có |
| `FAIL` | ca áp dụng, bằng chứng không đạt | không — chặn ở P0 |
| `ERROR` | runner / môi trường lỗi, chưa kết luận được | không — chặn ở P0 |
| `NOT_APPLICABLE` | ngoài phạm vi áp dụng của rulepack (phải ghi luật áp dụng) | không tính, không chặn |
| `NOT_TESTED` | chưa có bằng chứng (`verified_by` rỗng, chưa có fixture) | không |
| `REVIEW_REQUIRED` | thiếu / mơ hồ căn cứ, rulepack chưa `approved`, duyệt hết hạn | không |

Khác với bảng điểm Tuân chuẩn (`pass · debt · warn · fail · error · planned · skip`, [tests/conformance/README.md §6](../../tests/conformance/README.md)): bảng điểm đo **mã nguồn tuân luật**, báo cáo VN đo **ca pháp lý có bằng chứng và người duyệt**. Hai lớp cùng chạy; lớp dữ liệu (R-VNC) kiểm ở lane selfcheck, lớp chạy thật ở lane `runtime` (VNCONF-003).

## 3. Quan hệ với luật và hợp đồng đã có

- `bizcity_compliance@1` §3 (ma trận pháp lý) là **định hướng thiết kế**; kho nguồn pháp lý R-VNC-1 là **dữ liệu máy đọc** cùng nội dung, có trạng thái rà soát. Sửa một bên phải sửa bên kia (CANON §5).
- `docs/can-cu/` là bản tóm tắt cho kế toán; registry là nguồn cho máy. `review.status` của registry chỉ `reviewed` khi người có trách nhiệm đã đọc văn bản gốc, không phải khi `docs/can-cu` đã ghi.
- C-9 / ADR-0009 (chính sách kế toán có phiên bản) và hồ sơ kế toán của đơn vị (ADR-0013, năng lực `accounting.profile`: năm tài chính, chế độ, loại pháp nhân) là cơ chế của Core cho R-VNC-4 bước 1–2. <!-- [2026-11-02 02:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — R-VNC-4 dùng hồ sơ kế toán ADR-0013 -->
