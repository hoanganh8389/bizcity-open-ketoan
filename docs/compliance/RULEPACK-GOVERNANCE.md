# Quản trị rulepack — soạn, duyệt, phát hành, cập nhật
<!-- [2026-11-01 11:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — quy trình 8 bước cập nhật pháp luật, vai trò, trạng thái và cổng phê duyệt fail-closed cho rulepack / ca (R-VNC-3, R-VNC-9). -->

> Luật: [R-VNC-2, R-VNC-3, R-VNC-9](../rules/RULE-VN-CONFORMANCE.md) · Schema: `packages/vn-rulepacks/schemas/{rulepack,case}.schema.json` · Kiểm: SC-VNC-2 (block)

## 1. Vai trò

| Vai | Làm gì | Không làm gì |
|---|---|---|
| **Người soạn** (dev Nhóm Lõi, hoặc AI soạn giúp) | Lập nháp rulepack / ca, ánh xạ sang check / test đang có, ghi `gap`, đề xuất căn cứ | Không chọn tài khoản hạch toán thay kế toán; không đặt `status: approved`; không ghi tên mình vào `review.*` nếu là agent / model |
| **Người duyệt kế toán** (kế toán trưởng / chuyên gia kế toán) | Đọc văn bản gốc, xác nhận điều / khoản, chốt `expected_fixture`, ký `accounting_reviewer` + `approved_at` | Không duyệt ca thuế một mình |
| **Người duyệt thuế** (chuyên gia thuế) | Bắt buộc với rulepack `domain` ∈ {tax, invoice, tax_admin, payroll}; ký `tax_reviewer` | — |
| **Nhóm Lõi / chủ dự án** (CODEOWNERS `tests/conformance/`) | Duyệt PR, phát hành bản bất biến (`rules_hash`, `released_at`), cập nhật catalog | Không bỏ qua SC-VNC-2 bằng baseline (check `block`, không có nợ) |

## 2. Trạng thái và cổng

```text
draft ──► review_required ──► approved ──► deprecated
  ▲             │                 │
  └── sửa nội dung = tăng version; ID giữ nguyên ──┘
```

| Trạng thái | Điều kiện vào | Hiệu lực với báo cáo |
|---|---|---|
| `draft` | có schema hợp lệ (SC-VNC-1) | mọi ca ⇒ `REVIEW_REQUIRED` |
| `review_required` | người soạn xong, đã ghi đủ căn cứ **đề xuất**, chờ người duyệt | như `draft` |
| `approved` | **tất cả** điều kiện R-VNC-3: căn cứ `reviewed` + không `REVIEW_REQUIRED`; nguồn registry `reviewed`; `accounting_reviewer` (+ `tax_reviewer` với miền thuế); `approved_at`; `golden.hash` khớp fixture; rulepack có `rules_hash` + `released_at` | ca chạy được, có thể `PASS` |
| `deprecated` | bị bản mới thay, hoặc văn bản hết hiệu lực | `NOT_APPLICABLE` kèm lý do |

SC-VNC-2 là check `block`: một rulepack `approved` thiếu điều kiện là **KHÔNG ĐẠT** toàn bộ kiểm, không vào baseline được.

## 3. Tám bước cập nhật pháp luật (R-VNC-9)

| # | Bước | Ai | Kết quả ghi ở đâu |
|---|---|---|---|
| 1 | **Detect** — rà nguồn chính thức: văn bản mới, sửa đổi, đính chính, quy định chuyển tiếp | Nhóm Lõi (MVP: tay, ít nhất mỗi quý và trước mỗi bản phát hành) | issue "Cập nhật pháp luật", `registry` mục mới `pending` |
| 2 | **Triage** — đối tượng, ngày áp dụng (năm tài chính hay ngày giao dịch?), module / rulepack / ca bị ảnh hưởng | Nhóm Lõi + người duyệt kế toán | issue, cột `applies_to` |
| 3 | **Draft** — soạn đề xuất đổi rulepack / ca / fixture; AI được soạn **đề xuất**, không chọn tài khoản, không ký | người soạn | PR nháp, `status: review_required` |
| 4 | **Expert review** — đọc văn bản gốc, xác nhận điều khoản, sửa expected | người duyệt kế toán (+ thuế) | `legal_basis[].review_status = reviewed`, `review.*` |
| 5 | **Golden approval** — 2 người với luật P0 nhạy cảm; kiểm trường hợp biên; băm fixture | 2 người duyệt | `golden.hash`, `golden.approved_at`, `reviewer-approvals/<pack>-<version>.md` |
| 6 | **Release** — bản bất biến: tăng `version`, `release.rules_hash`, `released_at`, `changelog`, migration path cho ca đổi ID / bị thay | Nhóm Lõi | `rulepack.json`; không sửa bản đã phát hành |
| 7 | **Regression** — chạy toàn bộ ca hiện hành và **ngày lịch sử** (giao dịch trước / sau mốc; năm tài chính lệch năm dương lịch); không hồi tố thay đổi test không giải thích | CI (S020-8) | báo cáo `bizcity_vn_conformance_report@1` |
| 8 | **Advisory** — thông báo module / đơn vị bị ảnh hưởng; **không tự sửa sổ đã post**; sổ cũ chỉ đổi bằng bút toán điều chỉnh có người quyết | Nhóm Lõi | CHANGELOG mục "Thay đổi định khoản", thông báo |

## 4. Quy ước ID và phiên bản

- Rulepack: `<id>` = tên thư mục `rulepacks/<id>/`, chữ thường, gạch nối (`accounting-integrity`).
- Ca: `vn.<rulepack>.<nhóm>.<slug>.<nnn>` (`vn.accounting-integrity.double_entry.balanced.001`). Số `nnn` tăng dần trong rulepack, **không dùng lại** khi ca bị deprecated.
- SemVer riêng: rulepack, từng ca, từng schema. Đổi expected / assertion = tăng **minor**; đổi áp dụng (`applies_to`) = tăng **major**; sửa chữ = **patch**.
- `golden.hash` = `sha256:` của `expected_fixture` sau khi chuẩn hoá xuống dòng LF (cùng cách `tests/conformance/lib/repo.mjs` băm migration).

## 5. Những điều bị cấm

- Hardcode một mức thuế GTGT mặc định hay một hệ thống tài khoản cho mọi đơn vị trong rulepack (R-VNC-6).
- `expected_fixture` chứa số tiền do AI tính "cho hợp lý"; expected là kết luận của người duyệt.
- Dùng kết quả tìm kiếm web / tóm tắt AI làm căn cứ duy nhất (R-VNC-1).
- Nhãn "đạt chứng nhận Bộ Tài chính / cơ quan Thuế". Chỉ dùng **"Passed Bizcity VN Conformance [scope/version/date]"** (R-VNC-8).
- Runner ghi thẳng `ledger_*`, tắt trigger, import đường con Kernel (R-VNC-7).
