# PHASE-012 — Kế hoạch: gói định khoản cài / xem trước / gỡ
<!-- [2026-10-30 10:11 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — thiết kế cài / gỡ gói định khoản (D012-1…5), câu hỏi Q012-1. -->

> **Ký hiệu:** ☐ chưa làm · 🟡 có mã + test · ✅ có bằng chứng · ⛔ chờ chủ · ❌ huỷ.
> Hợp đồng: [`bizcity_posting_template@1`](../../contracts/BIZCITY-POSTING-TEMPLATE-v1.md) §5 STD-TPL-1…9; [ADR-0009](../../adr/ADR-0009-chinh-sach-ke-toan-co-phien-ban.md) Q-5.

## 1. Thiết kế đã chọn (D012-*)

| # | Quyết định | Lý do |
|---|---|---|
| D012-1 | Bảng `config_packs` (migration `0042`, RLS): một dòng mỗi gói của đơn vị — nội dung gói (`manifest`, kể cả gợi ý AI và tình huống mẫu), các mục đã đụng (`items`: add / update / keep / conflict), bản chính sách lần cài phát hành | gỡ đúng phần gói đã thêm; `posting.reason.suggest` (S012-4) đọc `ai.*` từ manifest, không thêm cột vào `posting_reasons` |
| D012-2 | Cài = action `core.template.install` (`settings:write`, `ai: deny`, dry-run): xem trước = chạy thật trong giao dịch rồi huỷ; xác nhận = cùng đường, ghi một giao dịch, bằng chứng mang id action | STD-TPL-5 — đúng tên bằng chứng `core.template.install` của hợp đồng |
| D012-3 | Mục gói khác cấu hình đơn vị → **conflict, giữ nguyên**; người cài liệt kê `overwrite: ["reason:XBA", …]` để ghi đè từng mục. Mục thuộc gói khác đã cài chỉ ghi đè được khi gói khai `overrides` | STD-TPL-7, §4 phân tầng |
| D012-4 | Trước khi ghi: `ensureHead` chốt cấu hình đang áp; sau khi ghi, cấu hình đổi → `publishPolicy({ pinned })` phát hành **một** bản `publish`, `note = "Cài gói <id>@<phiên bản>"`, hiệu lực từ `effectiveFrom` (mặc định hôm nay, không rơi vào kỳ khoá). Gỡ cũng phát hành bản "Gỡ gói …" | ADR-0009 Q-5; STD-TPL-6: chứng từ trước ngày hiệu lực định khoản lại vẫn theo bản cũ |
<!-- [2026-10-30 11:12 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — D012-6…9: gói nền db/packs, chế độ baseline, gợi ý lý do, manifest reasons. -->
<!-- [2026-10-31 03:36 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — D012-10…12: workflow khai báo YAML, runtime chỉ quyết định, duyệt nhiều cấp levels. -->
| D012-5 | Gỡ = ngừng dùng (`is_active = false`) mục gói THÊM mà chưa phát sinh: lý do (`ledger_entries.reason_code`), mã thuế (`ledger_lines.tax_code`), tài khoản (`ledger_lines`), hình thức TT (`payload.payments[].methodCode`). Nhóm hạch toán, tài khoản ngầm định giữ nguyên. Gói đang là gói nền của gói khác không gỡ được | STD-TPL-8, R-MD |

| D012-6 | Gói nền `bizcity.vn-tt99.nen` = `db/packs/vn-tt99-nen.posting-pack.json` (Q012-1), sinh từ đúng hằng của `seed.ts` cũ; `seed.ts` bỏ năm hằng, gọi `installPack({ baseline: true })`. Dockerfile chép `db/packs`; đổi chỗ bằng `PACKS_DIR` | một nguồn sự thật cho cấu hình định khoản mặc định; gói ngành `extends` được gói nền |
| D012-7 | **baseline** = ngữ nghĩa seed cũ: chỉ thêm mục thiếu, không ghi đè, không bật lại mục đã ngừng, không chốt / phát hành bản chính sách, không chặn STD-TPL-3; vẫn ghi dòng `config_packs`. Đơn vị đang chạy tự "nhận" gói nền ở lần job `db-migrate` (seed) kế tiếp — **không cần lệnh `pack:adopt` riêng** như gợi ý ban đầu | job `db-migrate` đã chạy seed mỗi lần triển khai; nhận gói không đổi cấu hình (mọi mục `keep`) |
| D012-8 | Gợi ý lý do tất định ở `reason-suggest.ts`: từ khoá / ví dụ `ai.*` của gói (bỏ mục `conflict`), tên lý do, lịch sử 2.000 bút toán gần nhất của chính đơn vị, `notFor`; action `accounting.posting.reason-suggest` → công cụ MCP `accounting.posting.reason_suggest` (đúng tên ở `bizcity_mcp@1` §5.1). Chưa ghi bằng chứng `core.posting.reason.chosen` (lịch sử lấy từ bút toán) | chạy được không cần LLM; Cell chỉ chọn trong danh sách |
| D012-9 | Manifest `ledger.submits[].reasons { kind, default?, suggestedPacks? }` (`bizcity_module` 1.1.0-draft). Tĩnh: SC-CON-2 (loại lý do khớp docType, khoá mặc định thuộc docType, gói gợi ý có trong `db/packs` / ví dụ và có lý do mặc định đó). Lúc cài: `accounting.posting.reason-readiness` | phiếu đầu tiên của module không lỗi `POSTING_FAILED` vì thiếu lý do |
| D012-10 | Workflow = tệp `<loại>.workflow.yaml` cạnh mã phân hệ, runtime Platform `core/workflow.ts` (thư viện `yaml`, zod kiểm khuôn + kiểm nghĩa); tệp chép sang `dist` khi dựng (`apps/api/scripts/chep-tep-khai-bao.mjs`) | YAML như ví dụ hợp đồng §5; đọc được, sửa luồng không sửa mã |
| D012-11 | Runtime chỉ **quyết định** (`plan` → trạng thái đích hoặc CONFLICT / FORBIDDEN / VALIDATION_ERROR); action phân hệ ghi trạng thái, cột riêng (người duyệt, lúc duyệt), nộp sổ; bằng chứng ghi thêm `transition: từ → sang` | không tạo bảng lịch sử chuyển mới — R-WF-7 đã có ở cột riêng + `audit_logs` của action |
| D012-12 | Duyệt nhiều cấp = `levels`; số cấp (`levelsRequired`) do phân hệ tính từ ngưỡng cấu hình (`payment_request_settings`, R-WF-6), runtime chỉ đọc. Hành vi, thông báo, đường dẫn của hai luồng giữ nguyên (thông báo cũ khai ở `blocked` / `denied`); phiếu mua `pending_approval` vẫn sửa được như cũ | không đổi hành vi người dùng đang quen; lệch §5 ghi ở hợp đồng §5.1 |

## 2. Câu hỏi cần chủ chốt

| # | Câu hỏi | Gợi ý |
|---|---|---|
| Q012-1 ✅ `db/packs/` (2026-10-30), D012-6, -7 | S012-3b: gói nền `bizcity.vn-tt99.nen` (thay phần cấu hình định khoản của `db/seed.ts`) đặt ở đâu, và đơn vị đang chạy được ghi nhận "đã cài gói nền" thế nào? | tệp `db/packs/vn-tt99-nen.posting-pack.json` (dữ liệu, cùng chỗ seed); đơn vị mới cài qua `installPack` lúc tạo; đơn vị cũ: lệnh `npm run pack:adopt` ghi dòng `config_packs` với mọi mục `keep` (không đổi cấu hình, không phát hành bản) |
