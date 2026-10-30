# PHASE-005 · 40 — Master checklist
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->
<!-- [2026-10-30 08:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-009 — MCP ghi: lập nháp, đề xuất huỷ, luôn chờ duyệt; ADR-0009 đề xuất. -->
<!-- [2026-10-30 09:03 PM Johnny Chu - Chu Hoàng Anh] PHASE-005 — chính sách kế toán có phiên bản + ngày hiệu lực (ADR-0009). -->

> Nguồn trạng thái **việc con** duy nhất của phase. "Xong" của việc lộ trình do bảng điểm tính, không do bảng này. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.

<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| ID | Việc | Lộ trình / G | Code | Trạng thái |
|---|---|---|---|---|
| S005-1 | ADR-0009: mô hình phiên bản, mức K3 | 2.14 | có | ✅ Chấp nhận (chủ dự án 2026-10-30); ⛔ kế toán trưởng ký |
| S005-2 | Migration `0040`: `posting_policy_versions` (chỉ thêm), `posting_log.policy_version`, `ledger_entries.policy_version`, `COMMENT ON` | 2.14 | có | ✅ |
| S005-3 | Chọn bản theo ngày hạch toán (`loadPostingConfig({ asOf })`, `policy.ts`); tự chụp bản initial / amend; cửa nạp + giá vốn ghi phiên bản | 2.14 | có | ✅ |
| S005-4 | Định khoản lại chứng từ cũ dùng bản đúng ngày | 2.14 | có | ✅ `test/policy.test.ts` (POL-B gửi lại phiên bản 2 vẫn 51112 sau khi chế độ 01/11 dùng 51113) |
| S005-5 | Màn Cấu hình định khoản: lịch sử bản, phát hành | 2.14 | API có | 🟡 `GET /api/v1/posting/policy/versions`, `POST …/publish`; màn hình chưa (giao diện) |
| S005-6 | Bật năng lực `posting.policy-version`; C-9 đạt; tự chẩn đoán `POLICY_VERSION` + DG-POL-1 | 2.14 · G2-09 | có | ✅ |
| S005-7 | Q-2: kế toán chọn "bản mới nhất" khi định khoản lại (quyền `settings:write`, lý do, bằng chứng) | — | chưa | ☐ (mặc định luôn theo ngày) |
| S005-8 | Q-5: cài gói định khoản = phát hành một bản | — | chưa | ☐ cùng PHASE-012 |

## Ca bằng chứng

| ID | Ca | Mong đợi | Trạng thái |
|---|---|---|---|
| T005-1 | Đổi tài khoản giá vốn / doanh thu từ một ngày, định khoản lại chứng từ trước ngày đó | chứng từ cũ vẫn dùng tài khoản cũ | ✅ `test/policy.test.ts` |
| T005-2 | Cùng kịch bản định khoản trên code cũ / mới | sổ trùng | ✅ [evidence/T005-1](evidence/T005-1-2026-10-30.md): 128 ô sổ cái, 17 ô sự việc trùng |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-10-30 | Claude Code | Mở thư mục phase; trạng thái chụp từ bảng điểm (CSDL `ketoan_test`). |
| 2026-10-30 | Claude Code | Soạn ADR-0009 (Đề xuất): 3 phương án, đề xuất A (bản chụp chính sách có ngày hiệu lực, theo tiền lệ closing_rule_versions); 5 câu hỏi cho chủ dự án / kế toán trưởng. Chưa code. |
| 2026-10-30 | Claude Code | Chủ "đồng ý ADR-0009" ⇒ code S005-1…6. Tinh chỉnh so với ADR (ghi ở ADR "Quyết định khi làm"): sửa cấu hình tự chụp bản amend, phát hành chỉ khi đổi chế độ. `policy.test.ts` 5/5; so sổ cũ / mới trùng. C-9 đạt. |
| 2026-10-30 | Claude Code | vitest đầy đủ: 717 xanh, 1 sai thật (`db-rules`: bảng mới thiếu mục danh mục cấu trúc → đã thêm, 14/14); worker tinypool sập ở `assets-statements` (chạy riêng 21/21). Lane diagnostics ĐẠT: DG-POL-1 100 (478 bút toán), ma trận tuân thủ 81% → 94% (0 thiếu), lộ trình 41%. |
