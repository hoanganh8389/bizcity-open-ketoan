# Pull Request

## Mô tả

<!-- 1–2 câu: làm gì, vì sao. Liên kết việc / mục audit (A-xx) / giai đoạn lộ trình nếu có. -->

## Tầng bị đụng

- [ ] T0 Nhân (`core/`, `modules/{documents,posting,ledger}`, `packages/contracts`, trigger sổ cái) → **2 người duyệt, 1 thuộc nhóm Lõi**
- [ ] T1 Dịch vụ lõi (`modules/*` khác, `features/`, `components/`)
- [ ] T2 Phân hệ: `<key>`
- [ ] T3 Add-in: `<id>`
- [ ] Chỉ tài liệu / vận hành

**Mức thay đổi Kernel** (bắt buộc nếu đụng T0 — [RULE-KERNEL](../docs/rules/RULE-KERNEL.md)): K0 / K1 / K2 / K3 → `…`

## Tuân thủ luật (tick cái đã kiểm; bỏ qua cái không liên quan)

- [ ] **R-LEDGER** — Không ghi `ledger_*` ngoài `modules/ledger`; sửa / huỷ bằng bút toán đảo; không thêm cờ bỏ qua kiểm tra vào `post()`.
- [ ] **R-EVENT** — Dữ liệu tài chính mới đi qua `postDocumentIn` / `eventStore.commit`; có `docKey` bất biến + `version`.
- [ ] **R-POST** — Không viết số tài khoản trong luật; thiếu cấu hình báo qua resolver; `docType` mới có khuôn + luật + lý do mặc định + test.
- [ ] **R-MD** — Danh mục tham chiếu bằng mã; không xoá cái đã dùng.
- [ ] **R-MATRIX** — Khoá cấu hình mới đã thêm vào `docs/contracts/bizcity-settings.registry.json`; đọc qua hàm kiểm khuôn.
- [ ] **R-BOUND** — Phân hệ không import phân hệ khác, không ghi bảng nhân.
- [ ] **R-API** — Phản hồi `{ ok, data | error }`; lỗi bằng `Errors.*`; route có `requirePermission`.
- [ ] **R-DB** — Migration mới, số kế tiếp không trùng, có `COMMENT ON` tiếng Việt, đã cập nhật `db/types.ts` + `schema-catalog.ts`.
- [ ] **R-TEN** — Lọc `tenant_id`; thao tác ghi có `writeAudit`.
- [ ] **R-WF** — Chỉ trạng thái đã duyệt mới nộp sự việc.
- [ ] **Hợp đồng** — Đổi `packages/contracts` / API công khai → đã cập nhật `docs/contracts/*` (tăng phiên bản, changelog) và `docs/api/` + JSON mẫu.
- [ ] **CANON §5** — Đã sửa các tài liệu tương ứng với phần code bị đổi.
- [ ] **R-SIG** — Mỗi phần đổi có chức năng trong tệp framework có dấu `[YYYY-MM-DD HH:MM AM/PM <người chỉ đạo>] <MÃ> — <mô tả>` (`node scripts/ky-dau.mjs`); không xoá dấu cũ, không ghi tên agent ([RULE-SIGNATURE](../docs/rules/RULE-SIGNATURE.md)).
- [ ] **R-SEC** — Không bí mật trong code; không ghép đầu vào vào SQL (`sql.raw`); tệp tải lên có trần; không PII trong log / PR.
- [ ] **R-REL** — Đã thêm dòng vào `CHANGELOG.md` mục `[Chưa phát hành]` (đổi định khoản K2+ ghi ở mục riêng).
- [ ] **Bộ kiểm** — `node tests/conformance/selfcheck.mjs` ĐẠT; không thêm nợ vào `baseline.json` (trừ khi nhóm Lõi duyệt, có `ref`).

## Bằng chứng (bắt buộc với T0 — xem docs/ops/DIAGNOSTICS.md §4)

```text
== BẰNG CHỨNG ==
commit:
lệnh:        node tests/conformance/selfcheck.mjs && bash scripts/kiem-chuan.sh && npm run typecheck && npm test
selfcheck:   <dán tests/conformance/output/latest/evidence.txt>
kiem-chuan:
typecheck:
vitest:
diagnostics:
ghi chú:
```
