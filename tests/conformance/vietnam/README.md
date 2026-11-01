# Bộ kiểm chuẩn pháp lý Việt Nam — dữ liệu (`tests/conformance/vietnam/`)
<!-- [2026-11-01 11:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — lớp dữ liệu của bộ kiểm chuẩn VN: kho nguồn pháp lý, catalog, rulepack / ca có phiên bản, schema, báo cáo mẫu (VNCONF-002). -->

> Luật: [RULE-VN-CONFORMANCE](../../../docs/rules/RULE-VN-CONFORMANCE.md) · Quy trình: [docs/compliance/](../../../docs/compliance/README.md) · Kiểm: `checks/vietnam/vn-conformance.check.mjs` (SC-VNC-1, SC-VNC-2) · Phase: [PHASE-020](../../../docs/phases/PHASE-020-KIEM-CHUAN-PHAP-LY-VN/README.md)
> Đây là **dữ liệu** (JSON trong Git, phát hành bất biến). Runner chạy thật qua cổng công khai là lane `runtime` (VNCONF-003), chưa có. Không phải chứng nhận nhà nước, không phải ý kiến pháp lý.

## Cây thư mục

```text
tests/conformance/vietnam/
├── catalog.json                 C01…C08: rulepack nào, ưu tiên, trạng thái, ticket
├── registry/legal-sources.json  kho nguồn pháp lý (bizcity_vn_legal_registry@1) — 16 văn bản, tất cả pending
├── schemas/                     4 schema (bộ kiểm JSON Schema rút gọn, lib/jsonschema.mjs)
│   ├── legal-source.schema.json · rulepack.schema.json · case.schema.json · report.schema.json
│   └── examples/report.example.json   báo cáo mẫu đúng khuôn (result REVIEW_REQUIRED)
├── rulepacks/<id>/
│   ├── rulepack.json            bizcity_vn_rulepack@1
│   ├── cases/*.json             bizcity_vn_case@1
│   └── fixtures/                input / expected vàng (khi có); tiền = số nguyên hoặc chuỗi thập phân
├── fixtures/                    fixture dùng chung nhiều rulepack (chưa có)
└── reviewer-approvals/          biên bản duyệt <pack>-<version>.md (chưa có)
```

Báo cáo chạy thật ghi vào `tests/conformance/output/` (đã gitignore), **không** vào thư mục này.

## Rulepack đang có (2026-11-01, tất cả `draft`)

| Catalog | Rulepack | Ca | Bằng chứng đang có | Khoảng trống chính |
|---|---|---|---|---|
| C01 | `accounting-integrity` | 8 | DG-LEDGER-1..4, DG-POL-1, DG-EVT-1, SC-KERNEL-1, SC-EVT-1/2, `db-rules`, `ledger-flow`, `ledger-links`, `period-locks`, `events`, `policy`, `event-store`, `actions` | C01.4 chưa có test cùng docKey hai đơn vị; khoá idempotency là (tenant, docKey)+version, không có `source` riêng |
| C02 | `accounting-regimes-vn` | 5 | `posting-pack`, `policy`, DG-POL-1, SC-TPL-1 | đơn vị **chưa có** năm tài chính / chế độ kế toán; `fiscal_periods` theo tháng dương lịch (migration 0004) ⇒ C02.1, C02.2 chặn bởi đề xuất năng lực Core |
| C08 | `plugin-boundary-security` | 6 | SC-KERNEL-1/3, SC-MOD-2, SC-CON-2, SC-DATA-2, DG-SEC-1, DG-DB-2, DG-PLAN-5, `tenant-isolation`, `access`, `app-role`, `events` | vòng đời module (`modules.lifecycle`) và vai trò `mod_<key>_owner` còn planned (ADR-0011) ⇒ C08.4, C08.6 NOT_TESTED |
| C03, C04 | `vat-vn`, `einvoice-vn` | — | — | planned (VNCONF-007); mọi giao tiếp nhà cung cấp hoá đơn sẽ là mock |

Mỗi ca ghi `scenario.verified_by` (check / test **đang có** trong repo) và `scenario.gap` (điều chưa chứng minh được). Ca `verified_by` rỗng = `NOT_TESTED`.

## Thêm / sửa

1. Sửa JSON theo schema; chạy `node tests/conformance/selfcheck.mjs --only SC-VNC`.
2. Thêm nguồn pháp lý: [LEGAL-SOURCE-REGISTRY.md](../../../docs/compliance/LEGAL-SOURCE-REGISTRY.md). Thêm / duyệt rulepack: [RULEPACK-GOVERNANCE.md](../../../docs/compliance/RULEPACK-GOVERNANCE.md).
3. Đổi check: thêm vi phạm vào `fixtures/repo-bad/tests/conformance/vietnam/` và dòng trong `fixtures/expect.json`, chạy `--self-test`.
4. `status: approved` không đặt bằng tay khi chưa đủ điều kiện R-VNC-3 — SC-VNC-2 (block) sẽ đỏ, không có baseline.
