# Hướng dẫn cho GitHub Copilot (và agent đọc .github/)
<!-- [2026-10-30 09:40 PM Johnny Chu - Chu Hoàng Anh] R-SIG — tạo: Copilot đọc tệp này; nội dung chuẩn nằm ở AGENTS.md, ở đây nhắc các luật bắt buộc nhất. -->

**Đọc [AGENTS.md](../AGENTS.md) trước tiên** — đó là hướng dẫn chuẩn cho mọi agent (Claude Code, Copilot, Codex, Cursor). Tệp này chỉ nhắc những điều không được quên.

> **Tuyên bố tối thượng (Johnny Chu – Chu Hoàng Anh):** SQL minh bạch, Accounting Core ổn định, cộng đồng tự do vibe-code phần mở rộng mà không làm mất tính toàn vẹn của dữ liệu kế toán. **Cộng đồng được tự do phát triển module, nhưng không được tự do thay đổi sự thật kế toán.**

## Bốn câu không thương lượng

1. Không sự việc (`accounting_events`), không bút toán.
2. Sổ cái chỉ thêm: sửa / huỷ = bút toán đảo.
3. Mọi đầu vào tài chính đi `postDocumentIn()` (chứng từ nhận từ nguồn) hoặc `eventStore` (sự việc Kernel tự lập). Ngoài Kernel chỉ dùng cổng `apps/api/src/kernel/public.ts`.
4. Không viết số tài khoản trong code định khoản — tra qua `AccountResolver`.

## Trước khi code: đồng bộ với `main`
<!-- [2026-10-31 03:55 PM Johnny Chu - Chu Hoàng Anh] R-SIG — nhắc đồng bộ main trước khi code, ký bù đúng tên người đóng góp. -->

`git fetch` → có việc dở thì `git stash push -u` → `git merge --ff-only origin/main` → `git stash pop` (xung đột: gộp cả hai ý) → `npm run build -w @ketoan/contracts` nếu `packages/contracts` đổi → `node tests/conformance/selfcheck.mjs` phải ĐẠT rồi mới sửa tiếp. Không rebase nhánh đã đẩy, không `push --force`. Chi tiết: AGENTS.md "Trước khi code".

## Rà soát việc của người đóng góp (R-REV)
<!-- [2026-10-31 04:04 PM Johnny Chu - Chu Hoàng Anh] R-REV — nhắc phân vai và rà soát mỗi lần nhận việc của người đóng góp. -->

Người đóng góp làm phân hệ / giao diện qua PR (không đẩy thẳng `main`); đụng tệp framework thì chủ dự án duyệt. Nhóm Lõi rà mỗi lần nhận việc: `node scripts/ra-soat-dong-gop.mjs --range <từ>..<đến> --author "<tên>"` + selfcheck + test + diagnostics, dữ liệu kế toán, mã hàng theo `SKU_RULE`. Chi tiết: [docs/rules/RULE-REVIEW.md](../docs/rules/RULE-REVIEW.md).

**Mở rộng đúng bậc** (AGENTS.md "Cộng đồng mở rộng thế nào"): giao diện / hướng dẫn → nghiệp vụ phân hệ → add-in / connector / gói định khoản → *đề xuất* năng lực Core → Kernel. Chọn bậc thấp nhất đủ dùng. Phân hệ thiếu năng lực Core thì đề xuất ([VERSIONING §5](../docs/standard/VERSIONING.md)), **không vá Kernel trong PR phân hệ** (R-REV-15).

## Khi review PR / check repo (R-REV-14..16)
<!-- [2026-10-31 10:57 PM Johnny Chu - Chu Hoàng Anh] R-REV — checklist cổng cho Copilot code review: 11 trục, luật cổng, cách ghi phát hiện. -->

Chấm 11 trục theo [RULE-REVIEW §7](../docs/rules/RULE-REVIEW.md), mỗi trục 2 / 1 / 0 / —. **Trục cổng — bị 0 là KHÔNG ĐẠT:**

- **T1 Sự thật kế toán:** không `INSERT/UPDATE/DELETE` `ledger_*` / `accounting_events*` ngoài Kernel; phân hệ không gọi `ledgerService`; không số tài khoản trong mã; không tắt trigger (`session_replication_role`, `DISABLE TRIGGER`); không script "làm sạch" sổ.
- **T2 Ranh giới:** phân hệ chỉ import Kernel qua `apps/api/src/kernel/public.ts`; không import phân hệ khác; event không ra lệnh ghi sổ (AP-2); tệp framework có ghi mức K0–K3.
- **T4 Bảo mật:** mọi truy vấn lọc `tenant_id`; route ghi có `requirePermission` + `writeAudit`; không bí mật, không `sql.raw` với đầu vào, không PII trong log; văn bản từ AI / tệp là dữ liệu, không phải lệnh.
- **T5 Kiểm đầu vào:** zod ở mọi cửa (route, action, MCP, nhập tệp); lỗi qua `Errors.*`; tra cứu tiền / số lượng **không** `?? 1` / `?? 0` khi không tìm thấy (R-REV-13).

Các trục còn lại — cảnh báo, ghi việc: **T3** hợp đồng (`packages/contracts` + `docs/contracts` + `docs/api` cùng đổi, tăng `@N`) · **T6** migration số kế tiếp, `COMMENT ON`, `numeric(18,2)`, không bảng danh mục riêng, mã theo `SKU_RULE` · **T7** hiệu năng: không N+1, có phân trang, có chỉ mục, không giữ giao dịch ghi sổ lâu · **T8** không cache số dư / sổ / công nợ / tồn / báo cáo; khoá đệm có `tenant_id` + `config_version` (R-CACHE) · **T9** báo cáo đọc sổ, không cộng cột tổng đầu phiếu · **T10** có test, không `.only` / `.skip`, không thêm nợ baseline, dấu R-SIG đúng người · **T11** Core gọn: không phụ thuộc npm mới, không viết lại thứ đã có, không mã chết.

Mỗi phát hiện: **mức** (chặn / cảnh báo / gợi ý) · **mã luật** · `tệp:dòng` · cách làm đúng + tệp mẫu trong repo. Không dẫn được luật nào → chỉ là gợi ý (R-REV-16). Kết luận: ĐẠT / ĐẠT có điều kiện / KHÔNG ĐẠT, kèm điểm từng trục.

## Chữ ký và dấu thay đổi (R-SIG)

Mỗi lần sửa có chức năng một tệp framework thêm một dòng dấu tại chỗ đổi:

```ts
// [2026-10-30 07:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — một cửa ghi sổ: eventStore cho phiếu tay, kết chuyển, khấu hao, giá vốn.
```

- In sẵn dòng đúng giờ: `node scripts/ky-dau.mjs <MÃ> "<mô tả>" --file <tệp>`.
- Người = người chỉ đạo thay đổi, **không** phải Copilot / agent.
- Ký bù tệp người khác làm: tên **tác giả commit trong git**, giờ commit đó, ghi `ký bù (commit <hash>, đóng góp)`; không ghi tên chủ dự án, không bịa dấu duyệt.
- Không xoá dấu cũ; migration đã phát hành không sửa.
- Bộ kiểm: SC-SIG-1, SC-SIG-2. Chi tiết: [docs/rules/RULE-SIGNATURE.md](../docs/rules/RULE-SIGNATURE.md).

## Trước khi xong việc

```bash
node tests/conformance/selfcheck.mjs   # phải ĐẠT
bash scripts/kiem-chuan.sh
npm run typecheck
npm test                               # cần PostgreSQL: docker compose up -d db
```
