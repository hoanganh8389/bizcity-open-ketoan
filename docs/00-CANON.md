# CANON — Chỉ mục luật BizCity Ledger Framework

> **Tệp này:** một trang liệt kê **mọi** luật và hợp đồng đang chi phối lõi. Không lặp nội dung luật — chỉ mã, cấp, nơi kiểm.
> **Dùng khi:** sửa lõi → tra bảng §4 để biết phải sửa tài liệu / hợp đồng nào **trong cùng PR**.
> **Phiên bản:** 1.1 · 2026-10-29 · **Người giữ:** nhóm Lõi (CODEOWNERS `/docs/00-CANON.md`)
> **Hai lớp chuẩn:** luật `R-*` dưới đây giữ **Kernel** (sổ cái). Luật `STD-*` của [Bizcity Framework Standard v1](standard/README.md) giữ **module** (7 hợp đồng, bộ kiểm cài đặt). Module tuân `STD-*`; nhờ SDK nó tự tuân `R-*`.

## 1. Bốn câu không thương lượng

1. **Không chứng từ thì không có bút toán.** Mọi dòng sổ cái trỏ về một `accounting_events` (R-EVENT-1).
2. **Sổ cái chỉ thêm.** Sửa, huỷ = bút toán đảo (ghi số âm) + bút toán mới. Không `UPDATE`, `DELETE`, `TRUNCATE` (R-LEDGER-1).
3. **Mọi đầu vào đi một cửa:** event → version → luật định khoản → sổ cái. Phân hệ, plugin, nhập tay đều vậy (R-EVENT-2).
4. **Kế toán là chủ danh mục và cấu hình.** Nguồn gửi **mã**, không gửi tài khoản Nợ / Có (R-MD-1, R-POST-2).

## 2. Cấp độ luật

| Cấp | Nghĩa | Vi phạm thì |
|---|---|---|
| **Tier 0 — Bất biến** | Giữ tính đúng của sổ sách. Có kiểm tự động (trigger CSDL hoặc test) | Chặn merge, chặn phát hành. Không có ngoại lệ |
| **Tier 1 — Bắt buộc** | Giữ ranh giới, hợp đồng, khả năng mở rộng | Chặn merge. Ngoại lệ phải có ADR được nhóm Lõi duyệt |
| **Tier 2 — Quy ước** | Đặt tên, cách viết, tài liệu | Người duyệt nhắc sửa; không chặn |

## 3. Danh mục luật

| Mã | Tệp | Cấp | Một câu | Kiểm bằng |
|---|---|---|---|---|
| R-LEDGER | [rules/RULE-LEDGER.md](rules/RULE-LEDGER.md) | 0 | Sổ cái chỉ thêm, cân Nợ = Có, đảo một lần, một cửa ghi | Trigger CSDL, `db-rules.test.ts`, `ledger-flow.test.ts` |
| R-EVENT | [rules/RULE-EVENT.md](rules/RULE-EVENT.md) | 0 | Mọi đầu vào thành event có `docKey` + `version`; idempotent | `ledger-flow.test.ts`, `auto-push.test.ts`, grep CI |
| R-POST | [rules/RULE-POSTING.md](rules/RULE-POSTING.md) | 0 | Luật định khoản thuần, không viết cứng tài khoản, xem trước = ghi thật | `posting-modes.test.ts`, test từng luật |
| R-MD | [rules/RULE-MASTER-DATA.md](rules/RULE-MASTER-DATA.md) | 1 | Danh mục chuẩn do kế toán giữ, tra bằng mã, không xoá cái đã dùng | `catalog-delete.test.ts`, `default-data.test.ts` |
| R-MATRIX | [rules/RULE-SETTINGS-MATRIX.md](rules/RULE-SETTINGS-MATRIX.md) | 1 | Mọi cấu hình khai trong registry, có phạm vi, thứ tự ưu tiên, nhật ký | Registry + test (đợt 2) |
| R-BOUND | [rules/RULE-MODULE-BOUNDARY.md](rules/RULE-MODULE-BOUNDARY.md) | 1 | Phân hệ không import nhau, không ghi bảng lõi | `phan-he-ranh-gioi.test.ts` |
| R-API | [rules/RULE-API.md](rules/RULE-API.md) | 1 | Một khuôn phản hồi, mã lỗi ổn định, zod ở cửa vào, `/api/v1` | `api-examples.test.ts`, OpenAPI |
| R-DB | [rules/RULE-DATABASE.md](rules/RULE-DATABASE.md) | 1 | Migration chỉ thêm, số không trùng, COMMENT tiếng Việt, tiền `numeric(18,2)` | `db-rules.test.ts`, kiểm số migration (CI) |
| R-TEN | [rules/RULE-TENANT-SECURITY.md](rules/RULE-TENANT-SECURITY.md) | 0 | Mọi truy vấn lọc `tenant_id`; mọi route khai quyền; mọi thao tác ghi có nhật ký | `access.test.ts`, `edit-permission.test.ts` |
| R-WF | [rules/RULE-WORKFLOW.md](rules/RULE-WORKFLOW.md) | 1 | Luồng nghiệp vụ là máy trạng thái khai báo; chỉ trạng thái "đã duyệt" mới sinh event | Test luồng của phân hệ |
| R-QG | [rules/RULE-QUALITY-GATE.md](rules/RULE-QUALITY-GATE.md) | 1 | Typecheck + test PostgreSQL thật + bằng chứng chạy trước khi merge | `.github/workflows/ci.yml` |
| R-KER | [rules/RULE-KERNEL.md](rules/RULE-KERNEL.md) | 0 | Sửa Kernel theo bốn mức K0–K3; lớp bảo vệ CSDL chỉ thêm chặt; không đổi bút toán đã ghi; tất định | DG-DB-2, test luật định khoản, mẫu PR |
| R-SEC | [rules/RULE-SECURITY.md](rules/RULE-SECURITY.md) | 0 | Không bí mật trong git; SQL có tham số; API không chạy superuser; AI chỉ ra nháp; chuỗi cung ứng; báo lỗ hổng | SC-SEC-1..4, DG-SEC-1 |
| R-REL | [rules/RULE-RELEASE.md](rules/RULE-RELEASE.md) | 1 | Cổng phát hành, CHANGELOG, migration chỉ tiến, kênh stable / LTS, vá bảo mật | SC-REL-1..2, [ops/RELEASE.md](ops/RELEASE.md) |
| R-DIAG | [rules/RULE-SELF-DIAGNOSTICS.md](rules/RULE-SELF-DIAGNOSTICS.md) | 1 | Năm tầng L0–L4, chỉ đọc, lịch chạy, chặn khoá kỳ khi sổ lỗi, cảnh báo không lộ số liệu | lane diagnostics `tests/conformance` |

## 4. Hợp đồng (contracts)

| Mã hợp đồng | Tệp | Trạng thái | Mã nguồn thực thi |
|---|---|---|---|
| `bizcity_standard@1` | [standard/README.md](standard/README.md) · [bizcity-standard.json](standard/bizcity-standard.json) | **Đề xuất** (1.0.0-draft) | gói 7 hợp đồng dưới đây + bảng năng lực |
| `bizcity_module@1` | [contracts/BIZCITY-MODULE-v1.md](contracts/BIZCITY-MODULE-v1.md) | **Đề xuất** (Standard 1/7) | `apps/api/src/phan-he/types.ts`, `packages/contracts/src/module.ts`, `core/addins.ts` |
| `bizcity_data@1` | [contracts/BIZCITY-DATA-v1.md](contracts/BIZCITY-DATA-v1.md) | **Đề xuất** (Standard 2/7) | `db/client.ts`, `db/migrate.ts` |
| `bizcity_document@1` | [contracts/BIZCITY-DOCUMENT-v1.md](contracts/BIZCITY-DOCUMENT-v1.md) | **Đề xuất** (Standard 3/7; gồm luồng duyệt, thay `bizcity_workflow@1`) | `modules/{signatures,reference-documents}`, `payment_requests` |
| `bizcity_action@1` | [contracts/BIZCITY-ACTION-v1.md](contracts/BIZCITY-ACTION-v1.md) | **Đề xuất** (Standard 4/7) | `core/{http,errors,auth}.ts` |
| `bizcity_event@1` | [contracts/BIZCITY-EVENT-v1.md](contracts/BIZCITY-EVENT-v1.md) | **Đề xuất** (Standard 5/7) — sự kiện miền | chưa có (`catalog-notify.ts`) |
| `bizcity_evidence@1` | [contracts/BIZCITY-EVIDENCE-v1.md](contracts/BIZCITY-EVIDENCE-v1.md) | **Đề xuất** (Standard 6/7) | `core/audit.ts`, `audit_logs` |
| `bizcity_extension@1` | [contracts/BIZCITY-EXTENSION-v1.md](contracts/BIZCITY-EXTENSION-v1.md) | **Đề xuất** (Standard 7/7) | `apps/web/src/phan-he/*`, `core/addins.ts` |
| `bizcity_ledger_intake@1` | [contracts/BIZCITY-LEDGER-INTAKE-v1.md](contracts/BIZCITY-LEDGER-INTAKE-v1.md) | Ổn định (Kernel; trước 2026-10-29 tên `bizcity_event@1`) | `packages/contracts/src/documents.ts` |
| `bizcity_api@1` | [contracts/BIZCITY-API-v1.md](contracts/BIZCITY-API-v1.md) | Ổn định | `packages/contracts/src/api.ts`, `apps/api/src/core/http.ts`, `core/errors.ts` |
| `bizcity_posting_rule@1` | [contracts/BIZCITY-POSTING-RULE-v1.md](contracts/BIZCITY-POSTING-RULE-v1.md) | Ổn định (nội bộ lõi) | `modules/posting/*`, `modules/ledger/ledger.types.ts` |
| `bizcity_master_data@1` | [contracts/BIZCITY-MASTER-DATA-v1.md](contracts/BIZCITY-MASTER-DATA-v1.md) | Ổn định | `modules/{accounts,branches,partners,products,tax-codes,posting-config}` |
| `bizcity_connector@1` | [contracts/BIZCITY-CONNECTOR-v1.md](contracts/BIZCITY-CONNECTOR-v1.md) | Ổn định | `modules/connections`, `packages/contracts/src/connections.ts` |
| `bizcity_settings@1` | [contracts/BIZCITY-SETTINGS-MATRIX-v1.md](contracts/BIZCITY-SETTINGS-MATRIX-v1.md) | **Đề xuất** | `core/posting-modes.ts`, `core/date-rules.ts` (rải rác) |
| `bizcity_posting_template@1` | [contracts/BIZCITY-POSTING-TEMPLATE-v1.md](contracts/BIZCITY-POSTING-TEMPLATE-v1.md) | **Đề xuất** — gói định khoản theo ngành, marketplace ([standard/TEMPLATE-MARKETPLACE.md](standard/TEMPLATE-MARKETPLACE.md)) | `posting_reasons`, `account-resolver.ts`; kiểm SC-TPL-1 |
| `bizcity_mcp@1` | [contracts/BIZCITY-MCP-v1.md](contracts/BIZCITY-MCP-v1.md) | **Đề xuất** — công cụ MCP cho Cell / chatbot; hồ sơ của chuẩn MCP hệ sinh thái ([standard/CELL-CONNECT.md](standard/CELL-CONNECT.md)) | chưa có (Phase 2b) |
| ~~`bizcity_workflow@1`~~ | [workflows/README.md](workflows/README.md) | Gộp vào `bizcity_document@1` §5 (năng lực `documents.workflow`) | — |

Trạng thái: **Ổn định** = đã có code, đổi phá vỡ phải ra `@2`. **Đề xuất** = chuẩn đích, code đang chuyển dần (xem [framework/05-LO-TRINH.md](framework/05-LO-TRINH.md)).

## 5. Đổi code X → phải sửa tài liệu Y trong cùng PR

| Khi sửa | Phải cập nhật |
|---|---|
| `packages/contracts/src/documents.ts` (khuôn chứng từ) | `contracts/BIZCITY-LEDGER-INTAKE-v1.md`, `docs/api/<loại>.md`, JSON mẫu `docs/api/vi-du/`, CHANGELOG hợp đồng |
| `packages/contracts/src/api.ts`, `core/errors.ts`, `core/http.ts` | `contracts/BIZCITY-API-v1.md` |
| `modules/posting/**`, `account-resolver.ts` | `contracts/BIZCITY-POSTING-RULE-v1.md`, `nghiep-vu/06-tinh-huong-ghi-so.md` |
| `modules/ledger/**`, trigger sổ cái | `rules/RULE-LEDGER.md`; người duyệt thứ hai bắt buộc |
| `modules/documents/document.service.ts` (cửa nhận) | `rules/RULE-EVENT.md` |
| `core/auth.ts` (quyền, vai trò, phạm vi khoá) | `rules/RULE-TENANT-SECURITY.md` §3 |
| Thêm khoá vào `tenants.settings` hoặc bảng cấu hình | `contracts/bizcity-settings.registry.json` + `rules/RULE-SETTINGS-MATRIX.md` |
| `apps/api/src/phan-he/**` (thêm / bớt phân hệ) | `framework/01-CORE-MODULES.md` §3, `.github/CODEOWNERS` |
| `db/migrations/*` | `db/README.md` nếu đổi quy trình; `schema-catalog.ts` (test bắt buộc) |
| `docker/`, `docker-compose.yml`, `scripts/` | `ops/DEPLOY.md`, `ops/CLI.md` |
| `.github/workflows/*` | `ops/CI-CD.md` |
| Thêm / đổi năng lực Platform hoặc Kernel mà module dùng | `standard/bizcity-standard.json`, hợp đồng Standard tương ứng, `standard/VERSIONING.md` §7 |
| Thêm điểm mở rộng (slot, hook, action công khai của Core) | `contracts/BIZCITY-EXTENSION-v1.md` §3–§5 |
| Thêm kiểm vào bộ cài đặt | `standard/CONFORMANCE.md` + một check ở `tests/conformance/` kèm ca tự kiểm trong `fixtures/expect.json` (ADR-0006) |
| Thêm luật `R-*` / `STD-*` mới | cột "Kiểm bằng" trỏ tới test hoặc check `SC-*` / `DG-*`; bảng điểm đo độ phủ |
| Lý do, nhóm hạch toán, tài khoản ngầm định mặc định (`db/seeds/ly-do.jsonl`…) | gói định khoản tương ứng theo `contracts/BIZCITY-POSTING-TEMPLATE-v1.md` |
| Route / action được AI dùng (`expose.mcp`), công cụ `ketoan.*` | `contracts/BIZCITY-MCP-v1.md` §5 (danh mục công cụ); đổi phá vỡ = công cụ mới |
| `adapters/cell`, kết nối Hub / Cell | `standard/CELL-CONNECT.md`, `standard/CHANNEL-GATEWAY-PORT.md` |
| Bất kỳ tệp Kernel (RULE-KERNEL §1) | ghi mức K0–K3 trong PR; K2+ thêm mục "Thay đổi định khoản" trong `CHANGELOG.md` |
| Thay đổi người dùng thấy được | `CHANGELOG.md` mục `[Chưa phát hành]` (R-REL-2) |
| Thêm kiểm toàn vẹn / bản cài | `ops/DIAGNOSTICS.md` §2 + check `DG-*` trong `tests/conformance/diagnostics/` (R-DIAG-9) |
| Sửa xong một nợ đã biết | `node tests/conformance/selfcheck.mjs --update-baseline` trong cùng PR (CI chạy `--strict`) |
| Tách / chuyển thư mục giữa Kernel, Platform, module | `standard/REUSE-MAP.md`, `standard/TARGET-LAYOUT.md` |

## 6. Nhật ký thay đổi CANON

- **v1.1 (2026-10-29):** Thêm Bizcity Framework Standard v1 (`docs/standard/`, 7 hợp đồng `STD-*`, bộ kiểm cài đặt, ca chuẩn Hợp đồng, Phase 1–6). Đổi tên khuôn nạp sổ `bizcity_event@1` → `bizcity_ledger_intake@1`; tên `bizcity_event@1` nay là sự kiện miền. `bizcity_workflow@1` gộp vào `bizcity_document@1`.
- **v1.0 (2026-10-28):** Khởi tạo bộ chuẩn: 11 luật, 8 hợp đồng, 4 tài liệu vận hành, audit nền. Tài liệu cũ ở gốc `docs/` chuyển thành tham chiếu (xem [README.md](README.md)).
