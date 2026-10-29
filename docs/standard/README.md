# Bizcity Framework Standard v1

> **Mã:** `bizcity_standard@1` · **Phiên bản:** 1.0.0-draft · 2026-10-29 · **Người giữ:** nhóm Lõi
> **Bản máy đọc:** [bizcity-standard.json](bizcity-standard.json) (danh sách hợp đồng + năng lực theo phiên bản) · **Cách tăng phiên bản:** [VERSIONING.md](VERSIONING.md)

Bizcity Core (repo open-ketoan) là **hạ tầng ứng dụng doanh nghiệp**, lấy sổ cái kế toán làm hạt nhân. Bộ chuẩn này là những gì một module (do người hay AI viết) phải đáp ứng để được cài vào Core. Người viết module **không cần hiểu sổ cái**: họ dùng SDK, khai manifest, chạy bộ kiểm. Core lo định khoản, bút toán, kết chuyển, số dư, sổ sách và nhật ký.

## 1. Vị trí trong hệ sinh thái

```
┌──────────────────────────────────────────────────────────────┐
│ BIZCITY CELL (server-owned): tenant, LLM, OCR, RAG,          │
│ orchestration, API gateway, API key theo domain              │
└───────────────▲──────────────────────────────▲───────────────┘
                │ API / MCP / Capability        │
┌───────────────┴──────────┐   ┌───────────────┴──────────────┐
│ Zalo Brain (plugin WP)   │   │ BIZCITY CORE FRAMEWORK       │  ← repo này
│ skill, tích hợp kênh     │   │ Kernel sổ cái + Platform +   │
└──────────────────────────┘   │ Module SDK + MCP adapter     │
                               └───────────────▲──────────────┘
                                               │ Standard v1 (7 hợp đồng)
                               ┌───────────────┴──────────────┐
                               │ Community Extensions: module,│
                               │ plugin, app, connector, gói  │
                               │ ngành                        │
                               └──────────────────────────────┘
```

## 2. Ba nguyên tắc khoá

| # | Nguyên tắc | Nghĩa cụ thể | Kiểm bằng |
|---|---|---|---|
| **P1** | **Core không phụ thuộc Cell** | Core chạy local, offline, trên VPS riêng. Không gói nào trong `packages/*` import Cell. Mọi tính năng AI / LLM / OCR / RAG nằm ở `adapters/cell` và chỉ bật khi có `BIZCITY_CELL_URL`. Tắt Cell thì kế toán vẫn đủ chức năng | CONF-STATIC-4, test khởi động không có biến Cell ([CELL-MCP.md](CELL-MCP.md)) |
| **P2** | **Module không sửa Kernel** | Mở rộng chỉ qua SDK, Action công khai, hook đã khai, sự kiện. Thiếu năng lực thì **đề xuất thay đổi Core** theo quy trình phiên bản ([VERSIONING.md §5](VERSIONING.md#5-thiếu-năng-lực-thì-đề-xuất-thay-đổi-core)), không vá Core trong module | CONF-STATIC-1..3, CODEOWNERS |
| **P3** | **AI viết code, Core quyết định hợp lệ** | Không module nào được bật nếu chưa qua: kiểm manifest, kiểm quyền, kiểm migration, bộ tương thích. Kết quả kiểm gắn với băm mã nguồn module | [CONFORMANCE.md](CONFORMANCE.md) |

## 3. Hai tầng, ba vòng

Quyết định thiết kế quan trọng nhất: **lấy kế toán làm hạt nhân, nhưng không biến mọi thứ thành kế toán.** Một module CRM không đụng tới tiền thì không cần biết bút toán là gì.

| Vòng | Gồm | Ai sửa | Phụ thuộc |
|---|---|---|---|
| **Kernel** (`packages/kernel`) | Cửa nạp sự việc, luật định khoản, sổ cái chỉ thêm, kỳ & khoá sổ, tài khoản, sổ phụ (công nợ, kho, hoá đơn), kết chuyển | Chỉ nhóm Lõi, có người duyệt thứ hai | Platform |
| **Platform** (`packages/{data,permissions,audit,events,actions,documents,module-sdk,cli,ui-kit}`) | Hạ tầng **không biết kế toán**: dữ liệu theo đơn vị, quyền, bằng chứng, sự kiện, hành động, chứng từ chung, SDK | Nhóm Lõi, qua quy trình phiên bản | Không phụ thuộc Kernel |
| **Modules** (`modules/*`) | Kế toán (giao diện, báo cáo), kho, mua hàng, CRM, hợp đồng… | Người phụ trách module, cộng đồng | **Chỉ** `@bizcity/module-sdk` (+ `@bizcity/ui-kit`) |

Chi tiết cây thư mục, quy tắc phụ thuộc: [TARGET-LAYOUT.md](TARGET-LAYOUT.md). Code hiện tại nằm ở đâu trong cây này: [REUSE-MAP.md](REUSE-MAP.md).

## 4. Bảy hợp đồng của Standard v1

| # | Hợp đồng | Mã | Một câu | Mã luật | Hiện trạng code |
|---|---|---|---|---|---|
| 1 | Module | [`bizcity_module@1`](../contracts/BIZCITY-MODULE-v1.md) | Mỗi module có ID, phiên bản, phụ thuộc, quyền và manifest máy đọc được | STD-MOD | Một phần: `ApiModule`, `WebModule`, `AddInManifest` rải 3 nơi |
| 2 | Data | [`bizcity_data@1`](../contracts/BIZCITY-DATA-v1.md) | Thực thể, schema, quan hệ, migration và cô lập đơn vị | STD-DATA | Một phần: `tenant_id` + lọc ở tầng ứng dụng; chưa RLS; migration chung một thư mục |
| 3 | Document | [`bizcity_document@1`](../contracts/BIZCITY-DOCUMENT-v1.md) | Chứng từ, dòng, trạng thái, phiên bản, tham chiếu, đính kèm, ký | STD-DOC | Có cho kế toán (`accounting_events` + versions); chưa có bản chung |
| 4 | Action | [`bizcity_action@1`](../contracts/BIZCITY-ACTION-v1.md) | Mỗi hành động có input/output, quyền, kiểm dữ liệu, idempotency, lỗi chuẩn | STD-ACT | Một phần: route Fastify + zod + `requirePermission` + `Errors.*`; idempotency chỉ ở cửa nạp sổ |
| 5 | Event | [`bizcity_event@1`](../contracts/BIZCITY-EVENT-v1.md) | Phát sự kiện miền, xử lý lại, retry, không thực thi trùng | STD-EVT | Chưa có: chỉ `catalog-notify` dùng `setTimeout` trong bộ nhớ |
| 6 | Evidence | [`bizcity_evidence@1`](../contracts/BIZCITY-EVIDENCE-v1.md) | Ai làm, làm gì, khi nào, kết quả, biên nhận | STD-EVD | Rải rác: `audit_logs`, `posting_log`, versions, tệp JSONL của Mua hàng và Trợ lý |
| 7 | Extension | [`bizcity_extension@1`](../contracts/BIZCITY-EXTENSION-v1.md) | Điểm mở rộng UI, API, hook, quyền và kiểm tương thích | STD-EXT | Một phần: menu/route phân hệ, add-in; chưa có slot, hook, bộ tương thích |

**Hợp đồng của Kernel** (module dùng gián tiếp qua SDK, không gọi thẳng): [`bizcity_ledger_intake@1`](../contracts/BIZCITY-LEDGER-INTAKE-v1.md), [`bizcity_posting_rule@1`](../contracts/BIZCITY-POSTING-RULE-v1.md), [`bizcity_master_data@1`](../contracts/BIZCITY-MASTER-DATA-v1.md), [`bizcity_connector@1`](../contracts/BIZCITY-CONNECTOR-v1.md), [`bizcity_settings@1`](../contracts/BIZCITY-SETTINGS-MATRIX-v1.md). Khuôn HTTP [`bizcity_api@1`](../contracts/BIZCITY-API-v1.md) là **lớp vận chuyển** của Action.

Mã luật `STD-*` có cấp như CANON: Tier 0 (bất biến, chặn cài), Tier 1 (bắt buộc, chặn cài trừ khi có miễn trừ ghi trong manifest + ADR), Tier 2 (khuyên).

## 5. Module nhìn thấy gì

Người viết module (hoặc Claude Code) chỉ làm việc với `ctx` của SDK. Toàn bộ nhân kế toán nằm sau năm lời gọi:

| Lời gọi SDK | Core làm gì phía sau | Hợp đồng |
|---|---|---|
| `ctx.data.*` | giao dịch theo đơn vị (RLS), đọc danh mục chuẩn qua view chỉ đọc | Data |
| `ctx.documents.*` | số chứng từ, phiên bản, tham chiếu, đính kèm, luồng duyệt, ký | Document |
| `ctx.ledger.submit(doc)` / `.cancel(docKey)` | kiểm khuôn → lưu sự việc + phiên bản → luật định khoản → bút toán (đảo nếu sửa) → số dư, công nợ, kho, hoá đơn | Ledger intake (Kernel) |
| `ctx.events.emit()` / `subscribe()` | outbox trong cùng giao dịch, gửi lại, chống xử lý trùng | Event |
| `defineAction()` | quyền, zod, idempotency, giao dịch, bằng chứng + biên nhận, lỗi chuẩn; tự sinh HTTP, OpenAPI, công cụ MCP | Action, Evidence |

Module **không** viết số tài khoản, **không** tạo bút toán, **không** ghi bảng của Kernel hay module khác. Cần hạch toán thì nộp một loại sự việc đã có (`sale`, `customer_payment`, …). Cần loại mới thì đề xuất Core.

## 6. Đọc theo thứ tự

| Bạn là | Đọc |
|---|---|
| Người / AI viết module mới | [../../AGENTS.md](../../AGENTS.md) → tệp này → [GOLDEN-CASE-HOP-DONG.md](GOLDEN-CASE-HOP-DONG.md) → 7 hợp đồng → [CONFORMANCE.md](CONFORMANCE.md) |
| Nhóm Lõi tách code | [REUSE-MAP.md](REUSE-MAP.md) → [TARGET-LAYOUT.md](TARGET-LAYOUT.md) → [PHASES.md](PHASES.md) |
| Người làm Cell / Zalo Brain | [CELL-MCP.md](CELL-MCP.md) → [Action](../contracts/BIZCITY-ACTION-v1.md) → [Evidence](../contracts/BIZCITY-EVIDENCE-v1.md) |
| Người duyệt phát hành | [VERSIONING.md](VERSIONING.md) → [bizcity-standard.json](bizcity-standard.json) |

## 7. Trạng thái

Standard v1 đang ở **1.0.0-draft**. Hợp đồng nào ghi "Đề xuất" thì code chưa có; lộ trình đưa vào code: [PHASES.md](PHASES.md). Standard lên **1.0.0** khi ca chuẩn (module Hợp đồng) qua toàn bộ [CONFORMANCE.md](CONFORMANCE.md) mà không sửa dòng nào của Kernel (cuối Phase 4).
