# PHASE-020 — Bộ kiểm chuẩn pháp lý Việt Nam (VN Accounting & Tax Conformance Kit)
<!-- [2026-11-01 11:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — mở phase bộ kiểm chuẩn kế toán / thuế / hoá đơn Việt Nam theo đặc tả OKT-SPEC-VNCONF-001: W0 audit nền + kho nguồn pháp lý + schema + check SC-VNC (VNCONF-001/002). -->

> **Trạng thái:** 🟡 W0 xong 2026-11-01 (audit nền, registry, 4 schema, 3 rulepack nháp, SC-VNC-1/2 có ca tự kiểm) · chờ chủ duyệt D020-1..6, trả Q020-1..5 · W1 (runner) chưa bắt đầu
> **Giai đoạn:** mở rộng lộ trình 4.3 (lane `runtime` của bộ kiểm, [PHASE-014](../PHASE-014-CLI-TEMPLATE-CA-CHUAN/README.md)) · **Code:** nền có (lớp dữ liệu + check tĩnh) · **Mức Kernel:** K0 — không đụng Kernel, không đụng đường ghi sổ; runner chỉ đi cổng công khai
> **Mục tiêu:** bộ kiểm thử **độc lập, có truy vết căn cứ pháp lý**, áp cho Accounting Kernel và plugin cộng đồng (POS, ERP, HRM, WMS, MRP); kết quả chỉ có giá trị trong phạm vi / ngày / phiên bản / rulepack / bộ test đã chạy; **không** tự nhận chứng nhận nhà nước.
> **Việc lộ trình:** —
> **Checklist công bố:** —
> **Tuân thủ / nguyên tắc:** AP-5, AP-7 · R-VNC-1..9 · R-LEDGER-*, R-TEN-*, R-KER-*, R-SIG · C-1..C-9 (`bizcity_compliance@1`)
> **Phụ thuộc phase:** 003 (action, bằng chứng), 005 (chính sách có phiên bản), 006 (outbox), 007 (RLS), 010 (cổng `@bizcity/kernel`), 012 (gói định khoản), 014 (lane runtime) · **Liên quan:** 017 (SDK cộng đồng), ADR-0011 (plugin ba mức tin cậy)
> **Nguồn yêu cầu:** đặc tả **OKT-SPEC-VNCONF-001 v1.0-draft** (2026-11-01, chủ dự án giao): "Đọc tài liệu này, audit repo tại commit SHA hiện tại. Không triển khai lại các thành phần đã có. Tạo báo cáo gap mapping và PR đầu tiên chỉ cho VNCONF-001/002".

> **Bản quyền kiến trúc:** © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity. Kiến trúc Bizcity Core Framework do Johnny Chu – Chu Hoàng Anh thiết kế; mã nguồn phát hành theo [GPL-2.0-or-later](../../../LICENSE), tên và logo BizCity theo [TRADEMARK.md](../../../TRADEMARK.md). Phase dựng **trên** bộ kiểm chuẩn `tests/conformance/` (ADR-0006) — không dựng framework conformance song song.

| Tài liệu | Một câu |
|---|---|
| [Audit nền VNCONF-001](../../audits/VN-CONFORMANCE-BASELINE-2026-11-01.md) | sự thật đọc mã @ `91b8c92`: có gì, thiếu gì, ánh xạ đặc tả → đường dẫn / hợp đồng / người giữ / khoảng trống / việc / ca nghiệm thu |
| [00-MASTER-PLAN](00-MASTER-PLAN.md) | vì sao, phạm vi, ràng buộc, quyết định D020-*, câu hỏi Q020-*, đợt W0–W5 = ticket VNCONF-001…010 |
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | việc con `S020-*`, ca bằng chứng `T020-*`, log |
| [RULE-VN-CONFORMANCE](../../rules/RULE-VN-CONFORMANCE.md) | luật R-VNC-1..9 |
| [docs/compliance/](../../compliance/README.md) | quản trị rulepack (8 bước), kho nguồn pháp lý |
| [tests/conformance/vietnam/](../../../tests/conformance/vietnam/README.md) | dữ liệu: registry, catalog, schema, rulepack / ca nháp |

## Trả lời ngắn

**Repo đã có ~70% hạ tầng mà đặc tả đòi** — một bộ kiểm chuẩn hai lane có bảng điểm và baseline (ADR-0006), kiểm toàn vẹn sổ trên CSDL thật (DG-LEDGER-*, DG-EVENT-*, DG-DB-2, DG-SEC-1, DG-PLAN-5), 112 tệp test vitest đi qua cửa thật, idempotency ở CSDL, chính sách kế toán có phiên bản + ngày hiệu lực (ADR-0009, C-9), RLS 88 bảng, outbox, cổng Kernel `@bizcity/kernel`, kho căn cứ cho người đọc (`docs/can-cu/`), ma trận pháp lý (`bizcity_compliance@1` §3). **Thiếu ba thứ** đặc tả gọi là Legal Registry · Versioned Rulepacks · Evidence Reporter theo nghĩa **có trạng thái duyệt và fail-closed**; W0 bổ đúng ba thứ đó dưới dạng dữ liệu + check tĩnh, không viết lại cái đã có.

**Khoảng trống thật ở Core** (không phải ở bộ kiểm), phải đi đường đề xuất năng lực (VERSIONING §5), không vá trong phase này:

| # | Khoảng trống | Ảnh hưởng | Ở đâu |
|---|---|---|---|
| G1 | Đơn vị **không có** năm tài chính / chế độ kế toán; `fiscal_periods` theo tháng dương lịch, CHECK năm bắt đầu = năm kết thúc | C02.1, C02.2 (năm tài chính lệch năm dương lịch) không test được | `db/migrations/0004_goc_ky_ke_toan.sql:22`, `tenants.settings` không có khoá |
| G2 | Hệ thống tài khoản không nằm trong bản chụp chính sách | chuyển TT133 → TT99 chưa có phiên bản cho hệ thống tài khoản | ADR-0009 §2 |
| G3 | Vòng đời module (`modules.lifecycle`), vai trò `mod_<key>_owner` còn `planned` | C08.4, C08.6 NOT_TESTED | ADR-0011, `bizcity-standard.json` |
| G4 | Khoá idempotency sự việc = (tenant_id, doc_key) + version, không có `source` | C01.3 cần người duyệt chốt docKey có tiền tố nguồn là đủ | `db/migrations/0005_goc_chung_tu.sql` |
| G5 | Chưa có TT133: chỉ mã enum, không hệ thống tài khoản, không gói | C02 cho SME chờ nguồn pháp lý + gói | `packages/kernel/src/modules/posting-config/pack.ts:40` |

## Hiện trạng đọc mã (tóm tắt — đầy đủ ở audit)

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | Bộ kiểm chuẩn một chỗ, hai lane, bảng điểm, baseline bánh cóc, `--self-test`, `--module`; không cần `npm install` | `tests/conformance/selfcheck.mjs`, ADR-0006 |
| F2 | Toàn vẹn sổ kiểm trên CSDL thật: cân Nợ/Có, số dư = Σ dòng, đảo một lần, không mồ côi, trigger còn bật, RLS 88 bảng, vai trò CSDL thường | `tests/conformance/diagnostics/*.diag.mjs` (DG-LEDGER-1..4, DG-DB-2, DG-PLAN-5, DG-SEC-1) |
| F3 | Chính sách định khoản có phiên bản theo ngày hạch toán; bút toán ghi `policy_version` | `packages/kernel/src/modules/posting-config/policy.ts:83`, migration 0040, DG-POL-1 |
| F4 | Idempotency: UNIQUE (tenant_id, doc_key) cho sự việc; UNIQUE (tenant_id, action_id, idem_key) cho action | migration 0005, 0035; `actions.test.ts`, `ledger-flow.test.ts` |
| F5 | Outbox ghi cùng giao dịch, giao một lần, retry / dead / replay có bằng chứng | `packages/platform/src/core/events.ts`, `events.test.ts`, DG-EVT-1 |
| F6 | Căn cứ pháp lý cho người đọc: 7 trang, rà 13/10/2026; ma trận pháp lý trong hợp đồng tuân thủ | `docs/can-cu/`, `docs/contracts/BIZCITY-COMPLIANCE-v1.md` §3 |
| F7 | Gói định khoản có `regime` ∈ {vn-tt99-2025, vn-tt133-2016}; gói nền TT99 cài khi khởi tạo đơn vị | `pack.ts:40`, `db/packs/vn-tt99-nen.posting-pack.json` |
| F8 | CI: `ci.yml` (guard, typecheck, test PostgreSQL 16, migrate-upgrade) + `conformance.yml` (selfcheck `--strict`, monitoring, diagnostics) | `.github/workflows/` |

## Xong khi

- **W0 (xong):** audit nền có SHA + số đo; registry + 4 schema + catalog; 3 rulepack nháp ánh xạ bằng chứng đang có và khoảng trống; SC-VNC-1/2 ĐẠT trên repo và có ca tự kiểm; luật R-VNC; bộ kiểm toàn repo `--strict` ĐẠT.
- **Phase:** runner lane `runtime` chạy C01 + C08 qua cổng công khai trên CSDL test với hai đơn vị giả lập, ra `conformance-report.json` + `junit.xml`; C02 có fixture vàng được kế toán trưởng duyệt; C03 / C04 phạm vi hẹp có nguồn truy vết; CI chặn FAIL / ERROR ở P0; `REVIEW_REQUIRED` không bao giờ thành PASS; không rulepack nào `approved` khi registry còn `pending`.
