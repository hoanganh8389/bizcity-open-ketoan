# PHASE-004 · 20 — Chữ chốt: gỡ cờ thoát `allow_ledger_purge` và đóng E2 có dấu vết (S004-12, S004-13)
<!-- [2026-11-08 02:17 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — chữ chốt thiết kế S004-12 / S004-13 (R-FLOW-2, K3 thêm chặt) từ review R1: RV-R1-01 cờ thoát, RV-R1-14 / D-R1-1 E2 có điều kiện -->

> **Trạng thái:** Chữ chốt đề xuất, **chờ chủ dự án duyệt trước khi viết mã** (R-FLOW-2). Chưa có dòng mã nào của tài liệu này.
> **Nguồn:** [review R1 §3 RV-R1-01, RV-R1-14](../../reviews/REVIEW-R1-FOUNDATION-2026-11-08.md), quyết định D-R1-1 (§7 của biên bản): *giữ E2 có điều kiện*.
> **Mức Kernel:** K3 **thêm chặt** ⇒ minor ([RULE-KERNEL](../../rules/RULE-KERNEL.md) K3). Không đổi bút toán đã ghi (R-KER-4), không đổi dữ liệu.
> **Việc:** S004-12 (gỡ cờ + thu quyền), S004-13 (E2 có dấu vết). Hai PR mã riêng; PR S004-12 là K3, PR S004-13 là K1.

## 1. Vấn đề, đo được trong mã

**RV-R1-01 — "sổ chỉ thêm" có cửa sau mà phiên nào cũng mở được.** Chín trigger bảo vệ sổ chỉ chạy khi `current_setting('ketoan.allow_ledger_purge', true) IS DISTINCT FROM 'on'`:

| Bảng | Trigger | Hàm trigger (đọc từ `pg_trigger` trên CSDL đã migrate) | Nguồn |
|---|---|---|---|
| `ledger_entries` | `ledger_entries_no_truncate` | `forbid_ledger_truncate` | 0006 |
| `ledger_entries` | `ledger_entries_no_update` | `guard_ledger_entry_mutation` | 0049 |
| `ledger_lines` | `ledger_lines_no_truncate` | `forbid_ledger_truncate` | 0006 |
| `ledger_lines` | `ledger_lines_no_update` | `guard_ledger_line_mutation` | 0006, thân hàm viết lại ở 0066 |
| `ledger_links` | `ledger_links_no_update` | `forbid_ledger_mutation` | 0006 |
| `accounting_events` | `accounting_events_no_delete` | `guard_accounting_event_mutation` | 0049 |
| `accounting_events` | `accounting_events_no_truncate` | `forbid_ledger_truncate` | 0049 |
| `accounting_event_versions` | `accounting_event_versions_no_update` | `forbid_ledger_mutation` | 0049 |
| `accounting_event_versions` | `accounting_event_versions_no_truncate` | `forbid_ledger_truncate` | 0049 |

Cờ là **biến cấu hình của phiên**, ai kết nối được cũng `set_config` được, không cần quyền gì. Vai trò ứng dụng `ketoan_app` lại có `DELETE` (và `UPDATE`, `INSERT`) trên các bảng này (0032 cấp `ALL TABLES`). Hai thứ cộng lại: một lỗi injection hoặc một module chạy được SQL đủ để xoá bút toán. Hôm nay chỉ phép kiểm tĩnh SC-KERNEL-4 (grep) giữ cờ khỏi mã; `app-role.test.ts` kiểm `TRUNCATE`, `session_replication_role`, tắt trigger, **không** kiểm "đặt cờ rồi `DELETE`".

**Dữ kiện làm nên lựa chọn thiết kế:**
- Cờ **chỉ do test dùng** (nhóm E4 của RULE-LEDGER): `apps/api/test/db-rules.test.ts:154` và `apps/api/test/lich-su-chung-tu.test.ts:131,150,164` (bốn chỗ). Không có mã ứng dụng, không có script vận hành nào đặt nó. Migration 0081 còn ghi rõ "không dùng cờ `allow_ledger_purge` (E4, chỉ cho test)".
- Không mã ứng dụng nào `DELETE` / `TRUNCATE` các bảng trên (đã grep `packages/`, `apps/api/src/`, `modules/`).
- Ngoại lệ có thật cần xoá sổ là **E3** (`scripts/xoa-chung-tu.sh`), chạy bằng quyền **superuser** với `session_replication_role = replica`, không dùng cờ.
- Vai trò `ketoan` ở bản dev và CI (image Postgres, `POSTGRES_USER=ketoan`) là superuser; `ketoan_app` không.

**RV-R1-14 / D-R1-1 — E2.** Biên bản R1 ghi E2 đổi được ba trường. **Đính chính sau khi đọc trigger `guard_ledger_entry_mutation` (0049:19-56): E2 đổi được bảy cột**, vì mọi cột khác của `ledger_entries` đã bị ép bằng nhau:

| Cột E2 đổi được | Ý nghĩa nếu đổi | Rủi ro |
|---|---|---|
| `doc_no` | số chứng từ hiển thị | thấp |
| `invoice_no` | số hoá đơn (vừa phát hành xong) | thấp — dùng đúng mục đích E2 |
| `description` | diễn giải | thấp |
| `partner_id` | đối tượng ở đầu bút toán (dòng vẫn giữ `partner_id` riêng) | **vừa**: đầu và dòng có thể lệch nhau |
| `reason_code` | lý do hạch toán ở đầu | **vừa**: đổi nghĩa bút toán mà tài khoản không đổi |
| `content_hash` | dấu vân tay toàn bút toán | máy tính, theo nội dung |
| `event_version` | nối bút toán sang phiên bản khác của sự việc | **vừa**: đổi chứng từ gốc trỏ tới |

Tiền (`total`), trạng thái, ngày, chi nhánh, kỳ, loại chứng từ, người lập, sự việc gốc, `body_hash`, `policy_version` bị ép **không đổi** (trigger, có test ở `db-rules.test.ts` "không đổi tiền / ngày / trạng thái ngoài ba lối").

**Dấu vết hôm nay của E2 (`posting.service.ts` nhánh `header`):** chỉ có một dòng `posting_log` action `repost` với câu "Giữ N bút toán (cập nhật thông tin đầu M)"; **không có giá trị trước / sau**. Truy ngược được gián tiếp qua các bản `accounting_event_versions`, nhưng không nói rõ cột nào của bút toán nào đã đổi.

## 2. Chữ chốt

| # | Chữ chốt | Lý do |
|---|---|---|
| **D004-6** | **Gỡ hẳn cờ `ketoan.allow_ledger_purge` khỏi cả chín trigger.** Migration mới (số lấy bằng `scripts/so-tiep-theo.mjs`, hiện là 0083) `DROP` rồi `CREATE` lại từng trigger **không có mệnh đề `WHEN`**. Không thay bằng cơ chế khác trong ứng dụng. | Cờ không có chủ dùng hợp lệ ngoài test. Cờ hạn chế (chỉ vai trò bảo trì) vẫn là một cổng cần quản lý và một chỗ để lọt; gỡ hẳn là chặt nhất và ít mã nhất, không thêm cơ chế phải quản lý. Tắt trigger khi thật sự cần có sẵn đường E3 (superuser, sao lưu, câu xác nhận). |
| **D004-7** | **Thu quyền phá huỷ của `ketoan_app` trên bảng sổ** trong cùng migration: `REVOKE DELETE, TRUNCATE ON ledger_entries, ledger_lines, ledger_links, accounting_events, accounting_event_versions, posting_log FROM ketoan_app`, đặt trong khối `DO` kiểm vai trò có tồn tại (vai trò do người cài đặt tạo theo 0032). **Giữ** `INSERT`, `SELECT`, `UPDATE` (cần cho đảo, E1, E2, đổi trạng thái sự việc). | Hai lớp độc lập: trigger (không cờ) + quyền. Ứng dụng không có lý do `DELETE` sổ. Không `REVOKE UPDATE` vì E1/E2/đảo cần. Bản cài chưa chuyển sang `ketoan_app` (PHASE-001 mục 0.7) thì lớp quyền chưa có tác dụng, lớp trigger vẫn có. |
| **D004-8** | **Test dùng cách của E3, không dùng cờ.** Bốn chỗ E4 đổi sang `SET LOCAL session_replication_role = replica` trong giao dịch test (vai trò `ketoan` là superuser ở dev và CI). **Gỡ nhóm E4** khỏi bảng ngoại lệ của RULE-LEDGER; SC-KERNEL-4 chỉ cho `allow_ledger_purge` xuất hiện trong `db/migrations/` (lịch sử), không còn trong `apps/api/test/` hay `scripts/kiem-chuan.sh`. | Khi cờ không còn, test không thể dùng nó. E3 đã là cơ chế đóng danh sách cho việc cần vượt trigger. |
| **D004-9** | **Hai ca phá thử** vào `app-role.test.ts` và một chẩn đoán chống tái phạm. (1) Dưới `SET LOCAL ROLE ketoan_app`: `set_config('ketoan.allow_ledger_purge','on')` rồi `DELETE FROM ledger_lines` ⇒ bị từ chối vì **quyền**. (2) Dưới vai trò chủ bảng (`ketoan`, không `replica`): đặt cờ rồi `DELETE` ⇒ bị từ chối vì **trigger** `chỉ được thêm` (chứng minh cờ hết tác dụng, độc lập lớp quyền). (3) Chẩn đoán L1 `LEDGER_TRIGGER_BYPASS_FLAG` (warn) báo nếu định nghĩa bất kỳ trigger nào trên bảng sổ còn nhắc `allow_ledger_purge`, thêm vào `ledger.diagnostics.ts` cạnh kiểm "trigger còn đủ" và `DG-*` tương ứng (SC-DIAG-1). | R-REV-10: lỗi đã gặp thì thành luật. Một migration sau này vô tình đưa cờ trở lại phải đỏ ngay. |
| **D004-10** | **Giữ E2, danh sách đóng bảy cột ở §1, mỗi lần đổi có dấu vết trước / sau.** Ở nhánh `header` của `posting.service.ts`, trước `UPDATE`, đọc giá trị cũ của bảy cột; sau `UPDATE` ghi **một dòng `audit_logs` cho mỗi bút toán** (action `ledger.entry.header_update`, `object_type = ledger_entry`, `before` / `after` chỉ gồm cột **thực sự đổi**, cùng giao dịch, `actor` = người gửi chứng từ, `request_id` / `correlation_id` như thường lệ). Không đổi `posting_log`. Thêm cột vào danh sách E2 là đổi thứ dùng chung: cần chữ chốt trước (R-FLOW-2) và sửa trigger. | Chủ dự án chọn giữ E2 (D-R1-1). Dấu vết hiện có chỉ là một con số; ba cột rủi ro vừa (`partner_id`, `reason_code`, `event_version`) phải nhìn thấy được trước / sau. Dùng bảng `audit_logs` có sẵn (chuỗi băm, chỉ thêm), không thêm bảng mới. |

## 3. Hình dạng cụ thể

**Migration (S004-12, K3 thêm chặt)** — khung, số 0083 lấy lúc code:

```sql
-- mỗi trigger trong chín trigger ở §1:
DROP TRIGGER ledger_lines_no_update ON public.ledger_lines;
CREATE TRIGGER ledger_lines_no_update BEFORE DELETE OR UPDATE ON public.ledger_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_ledger_line_mutation();   -- giữ nguyên hàm, bỏ WHEN
-- ... (tương tự cho TRUNCATE: FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_ledger_truncate())
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    REVOKE DELETE, TRUNCATE ON public.ledger_entries, public.ledger_lines, public.ledger_links,
      public.accounting_events, public.accounting_event_versions, public.posting_log FROM ketoan_app;
  END IF;
END $$;
```

Hàm trigger giữ nguyên. Mỗi trigger giữ **đúng tên và hàm** ở bảng §1 (đối chiếu bằng `pg_trigger` trên CSDL đã migrate; riêng `guard_ledger_line_mutation` có thân hàm mới nhất ở 0066, nên **không** chép lại thân hàm từ 0006: chỉ tạo lại trigger, không đụng hàm). `COMMENT ON TRIGGER` cập nhật bỏ chữ "cờ". Khoá ngắn (`SHARE ROW EXCLUSIVE` trên năm bảng) vài mili giây, không quét dữ liệu.

**Thứ tự an toàn:** (1) test đổi sang `replica` **trước hoặc cùng** migration; (2) migration; (3) SC-KERNEL-4 siết; (4) RULE-LEDGER bỏ E4. Làm ngược thì test đỏ.

**E2 (S004-13, K1)** — trong nhánh `header` của `posting.service.ts`:

```ts
const before = await trx.selectFrom('ledger_entries').select(E2_COLUMNS).where('id','=',header).executeTakeFirstOrThrow();
await trx.updateTable('ledger_entries').set({ /* bảy cột như cũ */ }).where('id','=',header).execute();
await writeEntryHeaderAudit(trx, ctx, header, before, after);   // chỉ cột khác nhau; không ghi nếu không có gì đổi
```

`E2_COLUMNS` là hằng duy nhất (bảy tên) dùng chung cho `select`, so sánh và ghi nhật ký; một test khẳng định hằng này **khớp trigger** (liệt kê cột `ledger_entries` ngoài danh sách bị ép bằng nhau ở `guard_ledger_entry_mutation`).

## 4. Cổng K3 (R-KER-2, R-KER-6) — "thêm chặt"

| Mục | Nội dung |
|---|---|
| Đụng gì | Chín trigger bảo vệ sổ (bỏ `WHEN`), quyền `ketoan_app` trên sáu bảng, bốn chỗ test, SC-KERNEL-4, RULE-LEDGER E4, một chẩn đoán |
| Kế hoạch dữ liệu | Không chạm dữ liệu; không migration kiểm dữ liệu vì không có dòng nào có thể "vi phạm" việc **thêm chặt** |
| Diễn tập | Trên bản sao ẩn danh: `diagnostics` 0 error **trước và sau**; chạy `npm test` đầy đủ; `bash scripts/kiem-chuan.sh`; thử ca phá thử §2/D004-9 |
| Số đo cần dán vào PR | Số trigger còn nhắc cờ = 0 (`pg_get_triggerdef`); `REVOKE` có hiệu lực (`has_table_privilege('ketoan_app','ledger_lines','DELETE')` = false); thời gian migration |
| Đường lui | Migration chỉ tiến (R-REL-5): lùi = khôi phục sao lưu ngay trước cập nhật. Vì không đổi dữ liệu, trường hợp khẩn cấp có thể tái tạo trigger cũ bằng migration mới (**không khuyến nghị**: đó là mở lại cửa sau) |
| CHANGELOG | Mục **Bảo mật** (cờ thoát gỡ, quyền thu) và **Nâng cấp cần làm**: bản cài tự viết SQL dùng cờ để dọn sổ phải chuyển sang E3 |

## 5. Ảnh hưởng và rủi ro còn lại

- **Script / người vận hành đang dùng cờ để dọn sổ** sẽ bị chặn. Theo [RULE-REVIEW](../../rules/RULE-REVIEW.md) R-REV-11 và H-TRIGGER-OFF việc đó vốn bị cấm; đường hợp lệ là E3. Đã grep: không có script nào trong repo dùng cờ.
- **Chủ bảng / superuser vẫn tắt được trigger** (`ALTER TABLE … DISABLE TRIGGER`, `session_replication_role`). Ranh giới thật là **ứng dụng không chạy bằng chủ bảng** (PHASE-001 mục 0.7, `DB_APP_USER=ketoan_app`). Bản cài chưa chuyển thì chỉ lớp trigger bảo vệ; chữ chốt này không giải quyết 0.7.
- **E1 (`ketoan.cost_overwrite`) cũng là cờ phiên ứng dụng tự đặt.** Giữ lại vì phạm vi của nó hẹp (trigger chỉ cho đổi `debit` / `credit` ≥ 0 của dòng `cost_fill`, bút toán `posted`, không đảo) và đây là việc hợp lệ của Kernel. Xem **Q004-4**.
- **Thông điệp trigger không đổi**, nên ánh xạ lỗi của S029-33 vẫn đúng.

## 6. Câu hỏi cho chủ dự án

| # | Câu hỏi | Gợi ý |
|---|---|---|
| **Q004-4** | Có chuyển cờ E1 `cost_overwrite` sang hàm `SECURITY DEFINER` chỉ `ledger.service` gọi được, để ứng dụng không tự đặt cờ? | Để sau S004-12; không chặn v0.1.0. Giữ E1 như hôm nay, ghi vào sổ nợ |
| **Q004-5** | `reason_code`, `partner_id`, `event_version` ở E2 có cần **chặn** (đổi bút toán đã ghi phải đảo) thay vì chỉ có dấu vết? | Dấu vết trước (D004-10). Nếu sau một kỳ thấy các cột này đổi thật, thu hẹp E2 còn `doc_no`, `invoice_no`, `description` bằng chữ chốt mới |
| **Q004-6** | Sau S004-12 + S004-13, `tru-cot.json` trụ cột I · L-2 chuyển `mot-phan` → `dat`? | Có, kèm bằng chứng test phá thử và golden E2; **không** thêm trạng thái "đạt có điều kiện" (từ vựng trạng thái cố định `dat / mot-phan / tai-lieu / chua`). Ghi giới hạn vào ô `gap`: "chủ bảng / superuser vẫn tắt được trigger; chờ 0.7" |

## 7. Việc và thứ tự (bốn bước: Chữ chốt → Mã → Tự kiểm → Ghi)

| Bước | Việc | PR |
|---|---|---|
| 1 | Chữ chốt này vào `main` (chủ duyệt D004-6…10, Q004-4…6) | tài liệu |
| 2 | **S004-12**: test đổi sang `replica` + migration + SC-KERNEL-4 + chẩn đoán + ca phá thử + RULE-LEDGER / CANON §5 / CHANGELOG | mã, K3 thêm chặt |
| 3 | **S004-13**: `E2_COLUMNS`, `audit_logs` trước / sau, golden E2 | mã, K1 |
| 4 | Ghi: checklist ✅, `tru-cot.json` L-2, review R2 chấm lại A2 | tài liệu |

**Kiểm bằng:** `apps/api/test/app-role.test.ts` (2 ca phá thử), `apps/api/test/db-rules.test.ts`, `apps/api/test/lich-su-chung-tu.test.ts` (đổi cách bỏ trigger), golden mới `T004-E2-1…3`, SC-KERNEL-4, `DG-*` cho chẩn đoán mới, `bash scripts/kiem-chuan.sh`, `selfcheck --strict`.
