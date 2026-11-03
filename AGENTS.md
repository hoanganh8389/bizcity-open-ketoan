# Hướng dẫn cho AI agent (Claude Code, Copilot, Codex, Cursor…)
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-29 10:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — chuẩn MCP, gói định khoản theo ngành, kết nối Cell. -->
<!-- [2026-10-30 01:11 PM Johnny Chu - Chu Hoàng Anh] CONG-BO — tuyên bố tối thượng, 7 nguyên tắc AP, ba lớp kiểm soát, ma trận tuân thủ, kiểm nâng cấp migration. -->
<!-- [2026-10-31 03:55 PM Johnny Chu - Chu Hoàng Anh] R-SIG — thêm "Trước khi code: đồng bộ với main" và luật ký bù tệp của người đóng góp (tên tác giả commit, không ghi tên chủ dự án). -->
<!-- [2026-10-31 04:04 PM Johnny Chu - Chu Hoàng Anh] R-REV — thêm mục "Rà soát việc của người đóng góp (R-REV)". -->
<!-- [2026-10-30 07:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — một cửa ghi sổ: eventStore cho phiếu tay, kết chuyển, khấu hao, giá vốn. -->
<!-- [2026-10-30 09:36 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — cổng công khai apps/api/src/kernel/public.ts, SC-KERNEL-6: ngoài Kernel chỉ import qua cổng. -->
<!-- [2026-10-31 10:57 PM Johnny Chu - Chu Hoàng Anh] R-REV — thêm "Cộng đồng mở rộng thế nào" (bậc thang mở rộng) và "Khi được yêu cầu check repo / review" (thang 11 trục, R-REV-14..16). -->

Dự án: **Bizcity Core Framework** (open-ketoan) — hạ tầng ứng dụng doanh nghiệp, hạt nhân là sổ cái kế toán. Trước khi sửa code, đọc [docs/00-CANON.md](docs/00-CANON.md). Viết module mới: theo [docs/standard/README.md](docs/standard/README.md).

> **Tuyên bố tối thượng (Johnny Chu – Chu Hoàng Anh):** SQL minh bạch, Accounting Core ổn định, cộng đồng tự do vibe-code phần mở rộng mà không làm mất tính toàn vẹn của dữ liệu kế toán. **Cộng đồng được tự do phát triển module, nhưng không được tự do thay đổi sự thật kế toán.**
>
> Bảy nguyên tắc AP-1..AP-7, ba lớp kiểm soát (Domain, Event, Compliance), ma trận tuân thủ: [docs/CONG-BO-KIEN-TRUC.md](docs/CONG-BO-KIEN-TRUC.md). Không dùng Prisma; SQL là nguồn sự thật của schema (R-DB-14).

## Bốn câu không thương lượng

1. Không sự việc (`accounting_events`), không bút toán.
2. Sổ cái chỉ thêm: sửa / huỷ = bút toán đảo. Không `UPDATE/DELETE` `ledger_*` (ngoại lệ đóng danh sách: [docs/rules/RULE-LEDGER.md](docs/rules/RULE-LEDGER.md)).
3. Mọi đầu vào tài chính đi `postDocumentIn()` → luật định khoản → `ledgerService.post()`; sự việc Kernel tự lập (phiếu tay, kết chuyển, khấu hao, giá vốn) đi `eventStore` (`modules/documents/event-store.ts`). Phân hệ / add-in không gọi thẳng `ledgerService`, không ghi bảng nhân.
4. Không viết số tài khoản trong code định khoản — tra qua `AccountResolver`.

### Danh mục có phiên bản (ADR-0017 / ADR-0018 — chấp nhận 2026-11-02) <!-- [2026-11-02 09:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — luật danh mục cho agent -->

- **Định danh ≠ mã ≠ phân loại.** Mọi liên kết trong sổ trỏ **định danh** (`item_id`, `partner_id`, `branch_id`), không trỏ mã. Mã có phiên bản + ngày hiệu lực; đổi mã không đổi sổ. Không thêm cột `sku` / `code` làm khoá ngoại ở bảng sổ; không khoá dữ liệu module bằng mã hàng.
- **Tài khoản kế toán là ngoại lệ:** số hiệu là định danh (theo chế độ kế toán); không có `account_id` thay thế. Đổi số hiệu = phiên bản hệ thống tài khoản + ánh xạ + chứng từ chuyển số dư.
- **Tài khoản đi từ chính sách hạch toán**, không suy từ tiền tố / đuôi mã hàng: luật định khoản không import `@bizcity/mua-hang-domain`.
- **Đổi bản chất (156 → 152, khách → NCC, đổi nhóm hạch toán) là sự việc kế toán** (hạng 3): phân loại mới từ ngày, kế toán trưởng duyệt, chứng từ phân loại lại qua cửa nạp. Danh mục **không bao giờ** tự sinh bút toán.
- **Dữ liệu ngoài (POS / ERP / plugin) qua validation trước khi chạm sổ:** không tự tạo mặt hàng từ chứng từ; mã lạ → trạm tiền kiểm với `IN-ITEM-*`. Tạo / sửa danh mục chỉ qua `core.item.*`, `core.partner.*`.
- Chi tiết: [RULE-ITEM](docs/rules/RULE-ITEM.md), [PHASE-024 · 10](docs/phases/PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/10-DANH-MUC-CO-PHIEN-BAN.md) (bốn hạng thay đổi), [· 50](docs/phases/PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/50-TUAN-THU.md).

## Yêu cầu kiến trúc: phân hệ nghiệp vụ nằm ở `modules/<key>/` (ADR-0024)

<!-- [2026-11-03 11:45 PM Johnny Chu - Chu Hoàng Anh] ADR-0024 — yêu cầu kiến trúc của chủ dự án: phan-he/ đóng băng, mã phân hệ mới ở modules/<key>/ -->
**Đây là yêu cầu kiến trúc của chủ dự án Johnny Chu – Chu Hoàng Anh, không phải gợi ý.** Áp cho mọi người đóng góp (Nguyễn Văn Thủy, anh em dev, cộng đồng) và mọi trợ lý AI. Đọc trước khi tạo hoặc sửa mã phân hệ.

1. **Phân hệ / add-in mới ở `modules/<key>/`** (API, web, migration, `bizcity.module.json`), tạo bằng `npx bizcity module new <key> --label "Tên"`. **Không tạo thư mục mới dưới `apps/api/src/phan-he/` hay `apps/web/src/phan-he/`.**
2. **`phan-he/` đóng băng.** Phân hệ cũ (ke-toan, quy, mua-hang, ban-hang, kho, tai-san, thue) vẫn được sửa lỗi, mở rộng vừa phải tại chỗ cho tới đợt chuyển của nó. Chức năng **mới và độc lập** → module mới ở `modules/`. Phần mới trong phân hệ cũ viết kiểu **"sạch SDK"** (gom truy cập CSDL vào một tệp, phụ thuộc Core qua `ports.ts`, logic thuần ở `modules/<key>/domain`).
3. **Chuyển phân hệ cũ = chuyển chuẩn module, theo đợt**, mỗi đợt có giữ chỗ ở CLAIMS.md và chữ chốt (R-FLOW). **Không tự chuyển cả một phân hệ trong PR bất kỳ**; không đổi tên thư mục cho có.
4. Người dùng nhờ "thêm phân hệ / chức năng mới" → đặt ở `modules/<key>/`. Nếu yêu cầu thêm mã mới vào `phan-he/`: **nhắc yêu cầu này và hỏi lại trước khi làm.**
5. Hướng dẫn đầy đủ, lộ trình các đợt, mục gửi riêng người đóng góp: [docs/standard/CHUYEN-PHAN-HE-SANG-MODULES.md](docs/standard/CHUYEN-PHAN-HE-SANG-MODULES.md). Quyết định và câu hỏi mở: [ADR-0024](docs/adr/ADR-0024-phan-he-nam-o-modules-phan-he-dong-bang.md).

## Bước 0: giữ chỗ trước khi nhận việc (R-FLOW)

<!-- [2026-11-03 09:55 PM Johnny Chu - Chu Hoàng Anh] FLOW — Bước 0: giữ chỗ vào main trước khi code; hai phiên đã làm trùng W6 đợt 3 và đợt 4 (chủ dự án chọn: giữ chỗ phải vào main trước) -->

Nhiều phiên (người và AI) làm cùng một kho. Luật đầy đủ: [RULE-FLOW](docs/rules/RULE-FLOW.md). Trước khi gõ dòng code đầu tiên của một **đợt việc**:

1. `node scripts/nhan-viec.mjs` — in bảng giữ chỗ [docs/phases/CLAIMS.md](docs/phases/CLAIMS.md) **trên `origin/main`** (không phải bản trong nhánh của mình) và các nhánh còn mở chưa vào `main`.
2. Phạm vi của bạn chồng lên một dòng "đang làm" của người khác → **dừng**, báo người dùng, chọn việc khác hoặc thoả thuận. Không làm song song.
3. Chưa có dòng của bạn → mở PR **chỉ tài liệu** thêm dòng vào CLAIMS.md, chờ người dùng merge vào `main`. **Chỉ sau đó** mới tạo nhánh code.
4. Đụng thứ dùng chung (API runtime action / SDK, `packages/contracts`, chính sách bằng chứng, luật lớp, migration, phép kiểm chặn mới — bảng ở [RULE-FLOW §3](docs/rules/RULE-FLOW.md)) → PR tài liệu **chốt thiết kế** vào `main` trước PR code.
5. Trước khi đẩy: `node scripts/nhan-viec.mjs kiem` ĐẠT (có dòng giữ chỗ, tệp đổi nằm trong phạm vi, đổi thứ dùng chung đã có chữ chốt trên `main`, nhánh ngắn, đã gộp `origin/main` và gộp thử không xung đột), rồi `selfcheck --strict` ĐẠT. Nhánh sống không quá một ngày làm việc.
6. Làm trùng với bản đã có → giữ bản có tài liệu và test, ghi rõ trong PR; khác nhau về **chính sách** thì hỏi người dùng, không tự chọn.

Không cần bước 1–4: sửa lỗi nhỏ (một tệp, không đổi hành vi dùng chung), tài liệu thuần, sửa nóng trên sản xuất.

<!-- [2026-11-03 10:35 PM Johnny Chu - Chu Hoàng Anh] FLOW — R-FLOW-7: nguồn sự thật của tài liệu là main (chủ dự án: "source of truth tài liệu phải ở nhánh main để nhiều session window, nhiều dev ko bị phân mảnh tài liệu kiến trúc chuẩn do Johnny Chu ban hành") -->
**Nguồn sự thật của tài liệu là `main` (R-FLOW-7).** Kiến trúc chuẩn do Johnny Chu – Chu Hoàng Anh ban hành chỉ có hiệu lực khi đã nằm trong tài liệu sở hữu trên `main`. Artifact, ghi chú phiên, chat, nhánh chưa merge là bản làm việc: khác `main` thì `main` thắng. Đọc tài liệu bằng `git show origin/main:<tệp>`; quyết định mới vào tài liệu sở hữu bằng PR tài liệu trước khi code.

## Trước khi code: đồng bộ với `main`

<!-- [2026-10-31 03:55 PM Johnny Chu - Chu Hoàng Anh] R-SIG — đồng bộ main trước mỗi lượt code (nhánh feat đứng sau main 18 commit, xung đột mua-hang/service.ts, dist contracts cũ). -->
<!-- [2026-11-01 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — Errors / Platform nay ở packages/platform (@bizcity/platform), đường cũ là tệp chuyển tiếp -->
<!-- [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — cổng Kernel nay là gói @bizcity/kernel (packages/kernel), đường con chỉ cho test -->
<!-- [2026-11-03 03:40 PM Johnny Chu - Chu Hoàng Anh] G3-01 — mục "Xây app ghi sổ": ba skill kế toán, lệnh event check / explain, không tự đoán tài khoản hay thuế -->
<!-- [2026-11-03 04:45 PM Johnny Chu - Chu Hoàng Anh] G3-01 — "Xây app ghi sổ": sáu chuẩn C1…C6, skill cho mọi loại app, flow check -->
<!-- [2026-11-04 12:25 AM Johnny Chu - Chu Hoàng Anh] PHASE-027 — "Xây app ghi sổ" trỏ khung trụ cột 0–VIII (D027-1) -->

Nhiều người cùng đẩy lên `main` (phân hệ, giao diện). Nhánh đứng lại sau `main` thì sửa chồng lên mã cũ, xung đột khi gộp, bộ kiểm báo lỗi không phải của mình. Mỗi lượt code:

```bash
git fetch --all --prune
git status -sb                                  # có việc dở chưa commit → git stash push -u -m "<việc>"
git rev-list --left-right --count HEAD...origin/main   # "<của nhánh> <của main>"; số bên phải > 0 = đang lệch
git merge --ff-only origin/main                 # nhánh chỉ đứng sau main: đưa lên thẳng, không sinh commit gộp
git stash pop                                   # nếu đã stash; xung đột thì gộp CẢ HAI ý (không bỏ phần của người khác)
npm install && npm run build -w @ketoan/contracts && npm run build -w @bizcity/mua-hang-domain   # main đổi package.json / packages/contracts / modules/*/domain thì build lại, tránh typecheck báo lỗi giả
node tests/conformance/selfcheck.mjs            # phải ĐẠT trước khi sửa tiếp — báo đỏ từ phần vừa kéo về thì xử lý / báo chủ trước
```

- `--ff-only` không chạy được (nhánh có commit riêng chưa vào `main`) → `git merge origin/main`, **không** rebase nhánh đã đẩy, **không** `push --force`.
- PR vừa merge xong → kéo `main` về ngay rồi mới làm việc kế tiếp.
- Sau khi kéo: báo người dùng số commit vừa kéo, tệp xung đột và cách gộp, bộ kiểm có đỏ thêm không.

## Rà soát việc của người đóng góp (R-REV)

<!-- [2026-10-31 04:04 PM Johnny Chu - Chu Hoàng Anh] R-REV — phân vai: người đóng góp làm phân hệ / giao diện; Nhóm Lõi giữ framework và rà soát mỗi lần nhận việc. -->

Người đóng góp (vd Nguyễn Văn Thủy) làm tính năng phân hệ, sửa lỗi, giao diện. Nhóm Lõi (chủ dự án + agent) giữ framework và **rà soát** việc của họ: đúng kiến trúc (bốn câu không thương lượng, cổng Kernel, ranh giới phân hệ, event / outbox, workflow), không để lại lỗi / rủi ro, **dữ liệu kế toán đúng** (sổ cân, công nợ, thuế, kho), **mã hàng đúng `SKU_RULE`**. Luật đầy đủ: [docs/rules/RULE-REVIEW.md](docs/rules/RULE-REVIEW.md).

Mỗi lần kéo việc của người đóng góp về (sau bước "Trước khi code"):

```bash
node scripts/ra-soat-dong-gop.mjs --range <từ>..<đến> --author "<tên>" --out docs/audits/REVIEW-<ngày>-<người>.md
node tests/conformance/selfcheck.mjs --strict && npm run typecheck && npm test
```

- Kết luận từng phát hiện (đúng / dương tính giả / đã sửa), phân mức rủi ro R0–R3. R2+: nạp bộ tình huống của phân hệ vào một đơn vị sạch trên CSDL test, chạy diagnostics và `psql -v tenant=<mã> < scripts/doi-chieu-ke-toan.sql` (sổ cân, công nợ ↔ 131 / 331, sổ hoá đơn ↔ 133, kho ↔ 156, làm tròn, mã hàng, ĐVT). Kết luận ĐẠT / ĐẠT có điều kiện / KHÔNG ĐẠT.
- Phát hiện **chặn** → báo người dùng, ghi việc cho người đóng góp; **không âm thầm sửa** việc của họ (lỗi khẩn thì sửa và ghi rõ).
- **Đọc [RULE-REVIEW §6](docs/rules/RULE-REVIEW.md) (cảnh báo W-1…W-11, các lỗi đã gặp thật) trước mỗi lần rà.** Đặc biệt: script "làm sạch" / tắt trigger / xoá sổ là **chặn** (R-REV-11); tra cứu cho tiền không được trả mặc định khi không tìm thấy (R-REV-13); công cụ phân hệ ở `scripts/<phân hệ>/` (R-REV-12).
- Lỗi lặp lại → thêm luật dò H-* vào `scripts/ra-soat-dong-gop.mjs` hoặc check SC-* / DG-* (R-REV-10).

## Cộng đồng mở rộng thế nào (bậc thang mở rộng)

Framework mở để hàng chục người cùng phát triển, nhưng **mỗi loại thay đổi có một chỗ đặt và một người duyệt**. Chọn bậc **thấp nhất** làm được việc; chỉ lên bậc trên khi bậc dưới thật sự không đủ (R-REV-15).

| Bậc | Đặt ở đâu | Ai làm / ai duyệt | Rủi ro |
|---|---|---|---|
| 1. Giao diện, hướng dẫn, dữ liệu mẫu | `modules/<key>/web/` (phân hệ cũ chưa chuyển: `apps/web/src/phan-he/<key>/`), `docs/huong-dan/`, `scripts/<phân hệ>/` | người đóng góp / 1 người duyệt | R0 |
| 2. Nghiệp vụ phân hệ | `modules/<key>/` (ADR-0024; phân hệ cũ chưa chuyển: `apps/api/src/phan-he/<key>/`, đóng băng), dùng `ctx.ledger.submit` + `reasonCode`, danh mục chuẩn, `defineAction` | người đóng góp / Nhóm Lõi rà §7 | R1–R2 |
| 3. Add-in, connector, gói định khoản, preset | `apps/api/src/addins/<id>/`, hợp đồng EXTENSION / CONNECTOR / POSTING-TEMPLATE / PRESET | người đóng góp / Nhóm Lõi rà §7 + R-REV-6 | R2 |
| 4. Đề xuất năng lực Core | issue / ADR theo [VERSIONING §5](docs/standard/VERSIONING.md) — **chưa viết mã** | ai cũng đề xuất được / chủ dự án quyết | — |
| 5. Kernel, Platform, `packages/*`, hợp đồng, migration, bộ kiểm | tệp framework (RULE-SIGNATURE §3) | Nhóm Lõi / mức K0–K3 theo R-KER-2, dấu R-SIG | R3 |

Phân hệ cần thứ Core chưa có → **dừng phần đó, làm đề xuất bậc 4**, không vá Kernel trong PR phân hệ. Core nhận thêm khi ≥ 2 phân hệ cần, không trùng [REUSE-MAP](docs/standard/REUSE-MAP.md), không thêm phụ thuộc (R-KER-8).

## Khi được yêu cầu "check repo", "review", "đánh giá đóng góp"

Luật: [RULE-REVIEW §7–§8](docs/rules/RULE-REVIEW.md) (R-REV-14..16). Mục tiêu: Core ngày càng **chắc, gọn, an toàn, kiểm đầu vào chặt, nhanh, cache đúng, báo cáo khớp sổ**.

1. **Xác định phạm vi:** một PR (`gh pr diff <số>` / `git diff origin/main...<nhánh>`), một người (`--author`), hay cả repo. Đồng bộ trước ("Trước khi code"). Không review trên nhánh cũ.
2. **Lượt đầu tự động:** `node scripts/ra-soat-dong-gop.mjs --range <từ>..<đến> --author "<tên>"` + `node tests/conformance/selfcheck.mjs --strict` + `bash scripts/kiem-chuan.sh` + `npm run typecheck` + `npm test`. Đọc RULE-REVIEW §6 (W-1…W-11) trước.
3. **Đọc diff thật**, chấm **11 trục** (T1 sự thật kế toán, T2 ranh giới Kernel, T3 hợp đồng, T4 bảo mật & đa đơn vị, T5 kiểm đầu vào, T6 CSDL & danh mục, T7 hiệu năng, T8 bộ nhớ đệm, T9 báo cáo, T10 kiểm thử & bằng chứng, T11 Core gọn). Mỗi điểm < 2 dẫn **mã luật + `tệp:dòng`**; không dẫn được luật nào thì chỉ là "gợi ý" (R-REV-16).
4. **R2+** (chạm sổ, công nợ, kho, thuế, giá): chạy bộ tình huống trên đơn vị sạch, diagnostics, `scripts/doi-chieu-ke-toan.sql` (R-REV-6).
5. **Kết luận theo luật cổng §7.2:** T1 / T2 / T4 / T5 = 0 → KHÔNG ĐẠT dù điểm tổng cao. So điểm với lần rà trước.
6. **Báo cáo** theo mẫu §8 (cả repo: thêm §7.3 — ma trận tuân thủ, AP-1..AP-7, nợ baseline, xu hướng từng người). Ghi `docs/audits/` khi được yêu cầu lưu biên bản.
7. **Không âm thầm sửa** việc của người đóng góp (R-REV-5): liệt kê việc, người nhận, cách làm đúng kèm tệp mẫu. Lỗi lặp lại / lọt công cụ → đề xuất luật dò mới (R-REV-10).

Trả lời ngắn trước (kết luận + điểm + phát hiện chặn), chi tiết sau. Không khen chung chung; chỉ nói điều kiểm được.

## Xây app ghi sổ (POS, CRM, MRP, kho vật tư, tài sản, ERP): dùng skill kế toán

App ngoài Core chỉ **kể sự việc** qua cửa nạp; Kernel định khoản. Bản đồ kiến trúc: trụ cột 0–VIII của Core ([docs/standard/tru-cot.json](docs/standard/tru-cot.json)) và việc của từng người ở [PHASE-027 §4](docs/phases/PHASE-027-CORE-KE-TOAN-CHO-DEV/00-MASTER-PLAN.md). Hướng dẫn đầy đủ (công cụ kiểm, mã hàng, vòng đời, quy tắc đặt tên, AI): [docs/core/](docs/core/README.md), riêng AI: [docs/core/04-huong-dan-cho-ai.md](docs/core/04-huong-dan-cho-ai.md). Đọc trước [open-ketoan-standard](skills/open-ketoan-standard/SKILL.md): sáu chuẩn mọi app phải đạt và chỗ Kernel chưa có (FIFO, mã hàng có phiên bản, sản xuất). Các skill ở [skills/](skills/README.md):

| Việc | Skill | Lệnh |
|---|---|---|
| Thiết kế tích hợp cho CRM, MRP, kho, tài sản, bán online | [build-business-app-with-open-ketoan](skills/build-business-app-with-open-ketoan/SKILL.md) | theo bảng loại app |
| Nối POS vào sổ, tới lúc thấy bút toán thật | [build-pos-with-open-ketoan](skills/build-pos-with-open-ketoan/SKILL.md) | `node examples/pos-mini/pos-mini.mjs`, `npx bizcity event check` |
| Kiểm luồng mua → kho → bán → giá vốn → lãi lỗ → đóng kỳ | [check-accounting-flow](skills/check-accounting-flow/SKILL.md) | `npx bizcity flow check --sku <mã> --period YYYY-MM` |
| Kiểm chứng từ trước khi nộp | [validate-accounting-event](skills/validate-accounting-event/SKILL.md) | `npx bizcity event check <tệp> [--submit]` |
| Giải thích một mã lỗi / mã phát hiện | [explain-accounting-error](skills/explain-accounting-error/SKILL.md) | `npx bizcity explain <MÃ> [--role …]` |

- Không gửi, sinh hay đoán số tài khoản; không tự đặt thuế suất; không tự tính giá vốn; một mặt hàng một mã suốt đời. Mã lấy từ danh mục của đơn vị (`docs/api/09-danh-muc.md`).
- Chỉ báo "xong" khi `event check` ra `KẾT LUẬN: PASS` (đã có lớp L5 định khoản thử). SKIP không phải PASS.
- Nghĩa của một mã chỉ lấy từ `npx bizcity explain`; mã không có trong danh mục thì nói thẳng, không đoán.
- Cài skill vào dự án khác: `npx bizcity skills install --to <thư mục>`.

## Tạo module mới (Bizcity Framework Standard v1)

Khi được yêu cầu "tạo module …": **không sửa Kernel, không sửa `packages/*`, không sửa module khác.** Chỉ tạo / sửa tệp trong `modules/<key>/` (ADR-0024: không còn tạo mới ở `apps/*/src/phan-he/`).

1. Đọc [docs/standard/README.md](docs/standard/README.md) rồi ví dụ mẫu [docs/standard/GOLDEN-CASE-HOP-DONG.md](docs/standard/GOLDEN-CASE-HOP-DONG.md).
2. Đọc 7 hợp đồng `docs/contracts/BIZCITY-{MODULE,DATA,DOCUMENT,ACTION,EVENT,EVIDENCE,EXTENSION}-v1.md`.
3. Xem năng lực Core đang có: [docs/standard/bizcity-standard.json](docs/standard/bizcity-standard.json). Năng lực `planned` thì chưa dùng được.
4. Viết `bizcity.module.json` trước, kiểm theo [docs/contracts/BIZCITY-MODULE-v1.schema.json](docs/contracts/BIZCITY-MODULE-v1.schema.json).
5. Khách hàng, mặt hàng, chi nhánh: dùng danh mục chuẩn, **không** tạo bảng riêng. Tiền vào sổ: nộp `docType` có sẵn qua `ctx.ledger.submit` kèm `reasonCode` (lý do lấy từ gói định khoản, [BIZCITY-POSTING-TEMPLATE-v1.md](docs/contracts/BIZCITY-POSTING-TEMPLATE-v1.md) §7), **không** viết tài khoản. Action cho AI dùng: `expose.mcp` theo [BIZCITY-MCP-v1.md](docs/contracts/BIZCITY-MCP-v1.md).
6. Thiếu năng lực thì **dừng phần đó**, nói rõ với người dùng và soạn đề xuất theo [docs/standard/VERSIONING.md §5](docs/standard/VERSIONING.md). Không tự vá Core.
7. Chạy bộ kiểm [docs/standard/CONFORMANCE.md](docs/standard/CONFORMANCE.md): `npx bizcity module check <key>` phải **ĐẠT** (gồm `selfcheck --module`, kiểm kế toán `accounting-check --static`, typecheck, test hợp đồng module trên CSDL test). Module có gửi chứng từ vào sổ: đặt chứng từ mẫu ở `modules/<key>/examples/*.json`, chạy `npx bizcity module accounting-check <key>` (kèm `BIZCITY_SERVER` + `BIZCITY_API_KEY`) để thấy bút toán Kernel dựng. `selfcheck --module` một mình **không** thấy module tự ghi bảng sổ, tự điền số tài khoản hay tự tính giá vốn.
<!-- [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W3: module SDK có chỗ nạp (API + web), template, CLI -->
<!-- [2026-11-03 07:17 PM Johnny Chu - Chu Hoàng Anh] ADR-0020 — module check gồm accounting-check; chứng từ mẫu examples/ -->
8. Bắt đầu module mới bằng `npx bizcity module new <key> --label "Tên"` (khung từ [templates/starter-module/](templates/starter-module/)), rồi đọc `modules/<key>/AGENTS.md`. Module nằm ở `modules/<key>/`: API tự nạp (route `/api/v1/m/<key>/…`), web tự gom (`/app/<key>/…`); màn chỉ dùng `@bizcity/ui-kit`.

## Trước khi xong việc

```bash
node tests/conformance/selfcheck.mjs   # bộ kiểm chuẩn + bảng điểm, phải ĐẠT (không cần npm install)
bash scripts/kiem-chuan.sh     # grep ranh giới, phải ĐẠT
npm run typecheck
npm test                       # cần PostgreSQL: docker compose up -d db — chạy trên CSDL riêng ketoan_test (tự tạo)
```

<!-- [2026-11-02 04:00 PM Johnny Chu - Chu Hoàng Anh] FIX — test không bao giờ chạy vào CSDL của bản cài (RULE-REVIEW W-12). -->
**Test không bao giờ chạy vào CSDL của bản cài** (`ketoan`): bộ test tạo đơn vị rác và cố ý để lại sổ lỗi. `vitest.config.ts` tự dùng `ketoan_test` khi `DATABASE_URL` trống và dừng khi tên CSDL không có "test" — đừng đổi chốt này để "cho chạy được" ([RULE-REVIEW §6 W-12](docs/rules/RULE-REVIEW.md)).

<!-- [2026-11-02 06:49 PM Johnny Chu - Chu Hoàng Anh] SO-DANG-KY — giữ chỗ số migration / ADR, đổi số trước khi merge (RULE-REVIEW W-13); cột Tiến độ của phase sinh từ lộ trình. -->
**Số migration / ADR** (nhiều nhánh song song — RULE-REVIEW W-13):

```bash
node scripts/so-tiep-theo.mjs migration    # trước khi tạo migration (adr: trước khi tạo ADR) — số kế tiếp chưa nhánh nào giữ
node scripts/so-tiep-theo.mjs kiem         # trước khi mở / merge PR (đã gộp origin/main): số của nhánh nối tiếp main, không trùng
node scripts/so-tiep-theo.mjs kiem --doi-so    # lệch thì tự đổi tên tệp + dẫn chiếu trên dòng của nhánh; dòng nhập nhằng in ra để sửa tay
```

Tạo tệp với số vừa lấy rồi đẩy nhánh lên sớm — nhánh khác chạy script là thấy số đã có người giữ. Đổi số xong: thêm dấu R-SIG ghi lần đổi số (không sửa dấu cũ), chạy selfcheck (SC-DATA-1 hở / trùng migration, SC-DOC-3 trùng ADR). Đổi trạng thái việc lộ trình: `node scripts/tien-do-phase.mjs --write` cập nhật cột Tiến độ của [docs/phases/README.md](docs/phases/README.md).

Dán khối bằng chứng theo [docs/ops/DIAGNOSTICS.md](docs/ops/DIAGNOSTICS.md) §4 khi đụng nhân (`tests/conformance/output/latest/evidence.txt` có sẵn phần bộ kiểm). Bộ kiểm báo nợ mới → sửa, **không** thêm vào `baseline.json`; nợ cũ đã hết → `--update-baseline`. Viết check mới: [tests/conformance/README.md](tests/conformance/README.md) §7.

## Sửa lỗi bằng AI từ Bàn điều tra

<!-- [2026-11-02 02:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W5: luật khi dùng AI sửa lỗi từ Bàn điều tra; nút "Chép cho AI" ở Tra mã. -->

Dev (chủ đơn vị / vai trò Nhà phát triển) tra lỗi ở **Nhà phát triển → Tra mã** (DEV02), bấm **Chép cho AI** rồi dán vào agent. Khối chép gồm tóm tắt, cây span rút gọn, chỗ tìm mã, việc phải làm — **chỉ mã và tên bước**, không dữ liệu kế toán, không mã đơn vị. Agent nhận khối đó thì:

1. **Tìm mã theo tên span**, không đoán:

   | Trong trace | Ở đâu trong repo |
   |---|---|
   | `action <module>.<việc>` | `defineAction({ id: '<module>.<việc>' … })` trong `modules/<module>/api/` (phân hệ cũ chưa chuyển: `apps/api/src/phan-he/<module>/`; lõi: `apps/api/src/modules/`) |
   | `step <module>.<bước>` | `ctx.trace.step('<bước>', …)` trong module đó |
   | `kernel <op>` (`bizcity.layer = K`) | Kernel — **không sửa** trong PR phân hệ; Kernel từ chối = dữ liệu sai đã tới được đây, sửa ở chỗ gửi |
   | `db <lệnh> <bảng>` | câu SQL chạm bảng đó trong module / repository của span cha |
   | `TH-xx` | mục đó trong [docs/ops/SO-TAY-DIEU-TRA-LOI.md](docs/ops/SO-TAY-DIEU-TRA-LOI.md) |

2. **Test tái hiện trước khi sửa** (Sổ tay §4): test trong `apps/api/test/` bằng `setupTenant` / `call` (`apps/api/test/helpers.ts`), phải **đỏ đúng mã lỗi, đúng bước** trong khối chép; dữ liệu trong test là dữ liệu giả. Cho người duyệt xem test đỏ rồi mới sửa.
3. `outcome = rejected` (**từ chối đúng luật**) là hệ thống làm đúng: sửa chỗ để dữ liệu sai đi tới đây (kiểm sớm ở giao diện / module, báo người dùng), **không** nới luật. `outcome = error` (**lỗi kỹ thuật**): sửa ở đúng tầng chỗ hỏng.
4. Giữ bốn câu không thương lượng: không vá Kernel, không `UPDATE` / `DELETE` `ledger_*`, không viết số tài khoản trong code, không tắt trigger / "làm sạch" sổ.
5. **Không** xin người dùng thêm dữ liệu thật (thân yêu cầu, ảnh màn có số tiền / tên khách, MST) và không chép những thứ đó vào test / commit / PR — repo công khai (R-SEC-10). Mã (`traceId`, `requestId`, `docKey`, mã lỗi, tên bước) là đủ.
6. Agent **không** tự gọi `/api/v1/system/devtools/*`: các action đó `ai: 'deny'`, `mcp: false` (D019-3). Cần thêm trace thì nhờ dev chép tiếp. Công cụ MCP chỉ đọc cho máy dev là việc để sau (D019-8, chờ quyết).
7. Xong: chạy lại test, `npm run typecheck`, `node tests/conformance/selfcheck.mjs`; dev kiểm lại trên **Lỗi theo module** (DEV04) — chỗ hỏng không còn tăng.

## Đổi code X → sửa tài liệu Y

Tra bảng §5 trong [docs/00-CANON.md](docs/00-CANON.md). Thêm khoá cấu hình → [docs/contracts/bizcity-settings.registry.json](docs/contracts/bizcity-settings.registry.json). Đổi khuôn chứng từ → [docs/contracts/BIZCITY-LEDGER-INTAKE-v1.md](docs/contracts/BIZCITY-LEDGER-INTAKE-v1.md) + `docs/api/`.

<!-- [2026-11-03 08:23 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — bộ kiểm chặn tài liệu trôi khỏi mã -->
Dời / đổi tên tệp hoặc route → sửa mọi tài liệu nhắc tới nó: `SC-DOC-4` chặn đường dẫn `trong dấu huyền` không còn, `SC-DOC-5` chặn "GET /api/v1/…" không có trong mã (đích chưa làm thì ghi rõ "chưa tách" / "đề xuất" trên dòng đó). Thêm mục menu → thêm `docs/huong-dan/<key>.md` (`SC-DOC-6`, nợ cũ chỉ được bớt).

## Chữ ký và dấu thay đổi (R-SIG — bắt buộc)

<!-- [2026-10-30 09:40 PM Johnny Chu - Chu Hoàng Anh] R-SIG — luật chữ ký kiến trúc + dấu thay đổi theo phase cho mọi tệp framework (cùng R-STAMP của bizcity-twin-ai). -->

Kiến trúc open-ketoan do **Johnny Chu – Chu Hoàng Anh** thiết kế. Mỗi lần sửa **có chức năng** một tệp framework (Kernel, Platform, hợp đồng, migration chưa phát hành, hạ tầng, công cụ framework, tài liệu kiến trúc / luật / hợp đồng / phase) để lại **một dấu** ngay tại chỗ đổi:

```text
[YYYY-MM-DD HH:MM AM/PM Johnny Chu - Chu Hoàng Anh] <MÃ phase / luật> — <đổi gì, cụ thể>
```

- `node scripts/ky-dau.mjs PHASE-011 "<mô tả>" --file <tệp>` in sẵn dòng đúng giờ, đúng cú pháp chú thích. TS / JS: đặt **sau** dòng nhãn `// @bizcity-layer`.
- Người trong dấu là **người chỉ đạo / duyệt**. **Không bao giờ** ghi tên agent / model (Claude, Copilot, Codex, Cursor…).
- Không xoá, không sửa dấu cũ; đổi lại quyết định thì thêm dấu mới. Migration đã phát hành **không** thêm dấu (không sửa một byte).
- **Ký bù tệp người khác làm** (kéo từ `main` về thiếu dấu): người trong dấu = **tác giả commit trong git** (`git log --diff-filter=A -- <tệp>`), giờ = giờ commit đó, mô tả ghi `ký bù (commit <hash>, đóng góp)`. **Không** ghi tên Johnny Chu lên việc của người khác, **không** bịa dấu "đã duyệt" khi không có PR được duyệt. Cần dấu chủ dự án để SC-SIG-1 đạt thì hỏi chủ (duyệt từ hôm nay theo R-SIG-7, hay hướng khác) — không tự quyết.
- Trước khi bàn giao: liệt kê tệp framework đã sửa và xác nhận mỗi phần đổi có dấu. Thiếu dấu = **KHÔNG ĐẠT** (SC-SIG-1, SC-SIG-2).
- Luật đầy đủ, danh sách tệp framework: [docs/rules/RULE-SIGNATURE.md](docs/rules/RULE-SIGNATURE.md).

## Quy ước

- Tên bảng, cột, biến: tiếng Anh. Chú thích, thông báo người dùng, tài liệu: tiếng Việt có dấu.
- Tiền: `numeric(18,2)` ở CSDL, cộng trừ qua `toCents/fromCents`.
- Lỗi: `Errors.*` (`@bizcity/platform/core/errors` — `packages/platform/src/core/errors.ts`; đường cũ `apps/api/src/core/errors.ts` là tệp chuyển tiếp), không `reply.status()`. Mã mới import Platform qua `@bizcity/platform/<đường>` (`core/*`, `db/*`, `config/env`).
- Migration: tệp mới số kế tiếp (lấy bằng `node scripts/so-tiep-theo.mjs migration`), không sửa tệp đã chạy, có `COMMENT ON`.
- Phân hệ không import phân hệ khác (`modules/<key>/`, và phân hệ cũ ở `apps/*/src/phan-he/<key>/`).
- Ngoài Kernel chỉ import Kernel qua gốc gói `@bizcity/kernel` (`packages/kernel/src/index.ts`; đường cũ `apps/api/src/kernel/public.ts` là tệp chuyển tiếp) — SC-KERNEL-6. Không import đường con `@bizcity/kernel/<đường>` (chỉ test của Core). Cần thêm gì vào cổng thì đề xuất.
- Đặt tên mới theo [docs/framework/04-DAT-TEN-BIZCITY.md](docs/framework/04-DAT-TEN-BIZCITY.md).
