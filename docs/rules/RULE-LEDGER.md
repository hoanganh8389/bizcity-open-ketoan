# RULE · Sổ cái (R-LEDGER)

> **Cấp:** Tier 0 · **Phiên bản:** 1.0 · 2026-10-28 · **Chỉ mục:** [../00-CANON.md](../00-CANON.md)
> **Mã:** `apps/api/src/modules/ledger/*`, `db/migrations/0006_goc_so_cai.sql`

## Luật

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **R-LEDGER-1** | Sổ cái **chỉ thêm**. Không `UPDATE`, `DELETE`, `TRUNCATE` trên `ledger_lines`, `ledger_links`; không `TRUNCATE` `ledger_entries`; không `UPDATE/DELETE` `posting_log`. Ngoại lệ đóng danh sách E1–E4 bên dưới | Trigger `ledger_lines_no_update`, `ledger_links_no_update`, `*_no_truncate`, `posting_log_no_update` · `db-rules.test.ts` |
| **R-LEDGER-2** | Sửa hoặc huỷ = **bút toán đảo** (cùng dòng, số âm, `is_reversal = true`, `reverses_entry_id` = bút toán gốc) + bút toán mới nếu còn nội dung. Bút toán gốc chỉ đổi `status` sang `reversed` | `ledger-flow.test.ts`, `ledger-links.test.ts` |
| **R-LEDGER-3** | Mỗi bút toán bị đảo **tối đa một lần** | Chỉ mục duy nhất `ledger_entries_reversed_once`, `ledger_links_one_reversal` |
| **R-LEDGER-4** | **Một cửa ghi**: chỉ `ledgerService.post()` / `reverse()` ghi `ledger_entries`, `ledger_lines`, `ledger_balances_daily`, `ledger_links`. Chỉ `modules/{ledger,posting,documents}` được gọi `ledgerService`: chứng từ nhận từ nguồn đi `postDocumentIn()` → `postingService`; sự việc Kernel tự lập (phiếu tay, số dư đầu, kết chuyển, khấu hao, giá vốn) đi `eventStore` (`modules/documents/event-store.ts`: khoá → đảo → phiên bản → ghi → `posted_version` + `posting_log`). Ngoại lệ ghi đè giá vốn (E1) cũng qua `eventStore.overwriteCostPairs`. Nợ A-01 hết 2026-10-30 (PHASE-004) | `scripts/kiem-chuan.sh`, SC-KERNEL-3 (block), DG-EVENT-4 |
| **R-LEDGER-5** | Mỗi bút toán **cân**: tổng Nợ = tổng Có, so bằng **xu** (`toCents`), không so số thực | `validateLines()` + trigger hoãn `assert_entry_balanced` |
| **R-LEDGER-6** | Mỗi dòng đúng **một bên** (Nợ hoặc Có). Dòng 0/0 chỉ cho dòng mang mã hàng hoặc chờ giá vốn (`cost_fill`). Số âm chỉ ở bút toán đảo | CHECK `ledger_lines_one_side`, trigger `ledger_lines_negative_guard` |
| **R-LEDGER-7** | Báo cáo, sổ sách **chỉ đọc** sổ cái và bảng dẫn xuất; không tính lại số liệu từ `payload` chứng từ | Duyệt PR; test "doanh thu báo cáo bán hàng = sổ cái" |
| **R-LEDGER-8** | Tài khoản trên dòng phải tồn tại, đang dùng, là **tài khoản chi tiết** (`is_posting`); tài khoản theo dõi đối tượng / công nợ bắt buộc có `partner_id` | `validateLines()` |
| **R-LEDGER-9** | Không ghi vào kỳ đã **khoá** cho (kỳ × chi nhánh × loại chứng từ), và không vi phạm khoá dữ liệu theo ngày trừ khi có quyền `documents:bypass-date-lock` | `period-locks.test.ts`, `closing-controls.test.ts` |
| **R-LEDGER-10** | **Số bút toán liên tục**, không trùng (`BTyy-nnnnnnn`, `ledger_entry_sequences`) | UNIQUE `(tenant_id, entry_no)` |
| **R-LEDGER-11** | Bảng dẫn xuất (`ledger_balances_daily`, `debt_items`, `tax_invoices`, `inventory_movements`) cập nhật **trong cùng giao dịch** với dòng sổ, và **dựng lại được** từ sổ + sự việc | `integrity-checks.test.ts` |
| **R-LEDGER-12** | Mọi bút toán có `event_id` trỏ về một `accounting_events` (không có bút toán mồ côi) | Khoá ngoại; `assertLedgerInvariants` (Giai đoạn 1) |

## Ngoại lệ có kiểm soát (đóng danh sách — thêm ngoại lệ = ADR)

| # | Ngoại lệ | Cơ chế | Ai được dùng | Giới hạn |
|---|---|---|---|---|
| E1 | **Điền giá vốn** lên dòng chờ (`cost_fill`) | `SET LOCAL ketoan.cost_overwrite = 'on'`; trigger `guard_ledger_line_mutation` chỉ cho đổi `debit`/`credit` (≥ 0) của dòng có `cost_fill`, thuộc bút toán `posted`, không đảo; mọi cột khác phải giữ nguyên | `ledger.service.ts` (gọi từ `inventory/costing.service.ts`) | Không đổi tài khoản, đối tượng, ngày, mặt hàng. Lý do có chủ đích: tránh nhân đôi số bút toán mỗi lần tính giá vốn tháng |
| E2 | **Cập nhật thông tin đầu** bút toán (số hoá đơn, diễn giải…) khi định khoản lại mà dòng không đổi | `UPDATE ledger_entries` (bảng đầu không có trigger chặn UPDATE) | `postingService` khi dấu vân tay thân giống nhau (`IngestResult.updated`) | Không đổi dòng, tiền, ngày, chi nhánh. ⚠ Chưa có trigger giới hạn cột — audit A-07 |
| E3 | **Xoá sạch** chứng từ + sổ của **một đơn vị** để kéo lại từ đầu | `scripts/xoa-chung-tu.sh`: `SET LOCAL session_replication_role = replica` (tắt mọi trigger trong giao dịch, cần quyền superuser CSDL) | Người vận hành, sau sao lưu tự động trong script + gõ câu xác nhận | ⚠ Chạy được cả sổ nội bộ — audit A-15. Không code ứng dụng nào được dùng `session_replication_role` |
| E4 | **Test** kiểm trigger | `set_config('ketoan.allow_ledger_purge', 'on', true)` | Chỉ `apps/api/test/db-rules.test.ts` | Không code ứng dụng nào được đặt biến này |

Grep CI (`scripts/kiem-chuan.sh`): `cost_overwrite` chỉ trong `db/migrations/`, `modules/ledger/`, test; `allow_ledger_purge` chỉ trong `db/migrations/`, test; `session_replication_role` chỉ trong `scripts/xoa-chung-tu.sh`.

## Định khoản lại không đổi nội dung

`entryContentHash()` tính dấu vân tay (mọi thứ in lên sổ, **không** gồm `version`). Định khoản lại mà dấu vân tay giống bút toán đang hiệu lực → giữ nguyên, không đảo, không ghi mới. Nhờ vậy gửi lại phiên bản mới chỉ đổi phần thông tin phụ không sinh cặp bút toán đảo thừa.

## Khi sửa module ledger

- Hai người duyệt, một thuộc nhóm Lõi.
- Dán bằng chứng `npm test` đầy đủ (không chỉ file liên quan).
- Không thêm tham số cho phép bỏ qua kiểm tra (`skipBalance`, `force`…) vào `post()`.
