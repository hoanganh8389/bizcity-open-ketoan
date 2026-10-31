# Hướng dẫn cho AI agent (Claude Code, Copilot, Codex, Cursor…)
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-29 10:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — chuẩn MCP, gói định khoản theo ngành, kết nối Cell. -->
<!-- [2026-10-30 01:11 PM Johnny Chu - Chu Hoàng Anh] CONG-BO — tuyên bố tối thượng, 7 nguyên tắc AP, ba lớp kiểm soát, ma trận tuân thủ, kiểm nâng cấp migration. -->
<!-- [2026-10-31 03:55 PM Johnny Chu - Chu Hoàng Anh] R-SIG — thêm "Trước khi code: đồng bộ với main" và luật ký bù tệp của người đóng góp (tên tác giả commit, không ghi tên chủ dự án). -->
<!-- [2026-10-31 04:04 PM Johnny Chu - Chu Hoàng Anh] R-REV — thêm mục "Rà soát việc của người đóng góp (R-REV)". -->
<!-- [2026-10-30 07:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — một cửa ghi sổ: eventStore cho phiếu tay, kết chuyển, khấu hao, giá vốn. -->
<!-- [2026-10-30 09:36 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — cổng công khai apps/api/src/kernel/public.ts, SC-KERNEL-6: ngoài Kernel chỉ import qua cổng. -->

Dự án: **Bizcity Core Framework** (open-ketoan) — hạ tầng ứng dụng doanh nghiệp, hạt nhân là sổ cái kế toán. Trước khi sửa code, đọc [docs/00-CANON.md](docs/00-CANON.md). Viết module mới: theo [docs/standard/README.md](docs/standard/README.md).

> **Tuyên bố tối thượng (Johnny Chu – Chu Hoàng Anh):** SQL minh bạch, Accounting Core ổn định, cộng đồng tự do vibe-code phần mở rộng mà không làm mất tính toàn vẹn của dữ liệu kế toán. **Cộng đồng được tự do phát triển module, nhưng không được tự do thay đổi sự thật kế toán.**
>
> Bảy nguyên tắc AP-1..AP-7, ba lớp kiểm soát (Domain, Event, Compliance), ma trận tuân thủ: [docs/CONG-BO-KIEN-TRUC.md](docs/CONG-BO-KIEN-TRUC.md). Không dùng Prisma; SQL là nguồn sự thật của schema (R-DB-14).

## Bốn câu không thương lượng

1. Không sự việc (`accounting_events`), không bút toán.
2. Sổ cái chỉ thêm: sửa / huỷ = bút toán đảo. Không `UPDATE/DELETE` `ledger_*` (ngoại lệ đóng danh sách: [docs/rules/RULE-LEDGER.md](docs/rules/RULE-LEDGER.md)).
3. Mọi đầu vào tài chính đi `postDocumentIn()` → luật định khoản → `ledgerService.post()`; sự việc Kernel tự lập (phiếu tay, kết chuyển, khấu hao, giá vốn) đi `eventStore` (`modules/documents/event-store.ts`). Phân hệ / add-in không gọi thẳng `ledgerService`, không ghi bảng nhân.
4. Không viết số tài khoản trong code định khoản — tra qua `AccountResolver`.

## Trước khi code: đồng bộ với `main`

<!-- [2026-10-31 03:55 PM Johnny Chu - Chu Hoàng Anh] R-SIG — đồng bộ main trước mỗi lượt code (nhánh feat đứng sau main 18 commit, xung đột mua-hang/service.ts, dist contracts cũ). -->

Nhiều người cùng đẩy lên `main` (phân hệ, giao diện). Nhánh đứng lại sau `main` thì sửa chồng lên mã cũ, xung đột khi gộp, bộ kiểm báo lỗi không phải của mình. Mỗi lượt code:

```bash
git fetch --all --prune
git status -sb                                  # có việc dở chưa commit → git stash push -u -m "<việc>"
git rev-list --left-right --count HEAD...origin/main   # "<của nhánh> <của main>"; số bên phải > 0 = đang lệch
git merge --ff-only origin/main                 # nhánh chỉ đứng sau main: đưa lên thẳng, không sinh commit gộp
git stash pop                                   # nếu đã stash; xung đột thì gộp CẢ HAI ý (không bỏ phần của người khác)
npm install && npm run build -w @ketoan/contracts   # main đổi package.json / packages/contracts thì build lại, tránh typecheck báo lỗi giả
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

## Tạo module mới (Bizcity Framework Standard v1)

Khi được yêu cầu "tạo module …": **không sửa Kernel, không sửa `packages/*`, không sửa module khác.** Chỉ tạo / sửa tệp trong `modules/<key>/` (trước Phase 3: `apps/api/src/phan-he/<key>/` + `apps/web/src/phan-he/<key>/`).

1. Đọc [docs/standard/README.md](docs/standard/README.md) rồi ví dụ mẫu [docs/standard/GOLDEN-CASE-HOP-DONG.md](docs/standard/GOLDEN-CASE-HOP-DONG.md).
2. Đọc 7 hợp đồng `docs/contracts/BIZCITY-{MODULE,DATA,DOCUMENT,ACTION,EVENT,EVIDENCE,EXTENSION}-v1.md`.
3. Xem năng lực Core đang có: [docs/standard/bizcity-standard.json](docs/standard/bizcity-standard.json). Năng lực `planned` thì chưa dùng được.
4. Viết `bizcity.module.json` trước, kiểm theo [docs/contracts/BIZCITY-MODULE-v1.schema.json](docs/contracts/BIZCITY-MODULE-v1.schema.json).
5. Khách hàng, mặt hàng, chi nhánh: dùng danh mục chuẩn, **không** tạo bảng riêng. Tiền vào sổ: nộp `docType` có sẵn qua `ctx.ledger.submit` kèm `reasonCode` (lý do lấy từ gói định khoản, [BIZCITY-POSTING-TEMPLATE-v1.md](docs/contracts/BIZCITY-POSTING-TEMPLATE-v1.md) §7), **không** viết tài khoản. Action cho AI dùng: `expose.mcp` theo [BIZCITY-MCP-v1.md](docs/contracts/BIZCITY-MCP-v1.md).
6. Thiếu năng lực thì **dừng phần đó**, nói rõ với người dùng và soạn đề xuất theo [docs/standard/VERSIONING.md §5](docs/standard/VERSIONING.md). Không tự vá Core.
7. Chạy bộ kiểm [docs/standard/CONFORMANCE.md](docs/standard/CONFORMANCE.md): `node tests/conformance/selfcheck.mjs --module <thư mục module>` phải **ĐẠT** (Phase 4: `bizcity module check`).

## Trước khi xong việc

```bash
node tests/conformance/selfcheck.mjs   # bộ kiểm chuẩn + bảng điểm, phải ĐẠT (không cần npm install)
bash scripts/kiem-chuan.sh     # grep ranh giới, phải ĐẠT
npm run typecheck
npm test                       # cần PostgreSQL: docker compose up -d db
```

Dán khối bằng chứng theo [docs/ops/DIAGNOSTICS.md](docs/ops/DIAGNOSTICS.md) §4 khi đụng nhân (`tests/conformance/output/latest/evidence.txt` có sẵn phần bộ kiểm). Bộ kiểm báo nợ mới → sửa, **không** thêm vào `baseline.json`; nợ cũ đã hết → `--update-baseline`. Viết check mới: [tests/conformance/README.md](tests/conformance/README.md) §7.

## Đổi code X → sửa tài liệu Y

Tra bảng §5 trong [docs/00-CANON.md](docs/00-CANON.md). Thêm khoá cấu hình → [docs/contracts/bizcity-settings.registry.json](docs/contracts/bizcity-settings.registry.json). Đổi khuôn chứng từ → [docs/contracts/BIZCITY-LEDGER-INTAKE-v1.md](docs/contracts/BIZCITY-LEDGER-INTAKE-v1.md) + `docs/api/`.

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
- Lỗi: `Errors.*` (`apps/api/src/core/errors.ts`), không `reply.status()`.
- Migration: tệp mới số kế tiếp, không sửa tệp đã chạy, có `COMMENT ON`.
- Phân hệ không import phân hệ khác (`apps/*/src/phan-he/<key>/`).
- Ngoài Kernel chỉ import Kernel qua `apps/api/src/kernel/public.ts` (SC-KERNEL-6). Cần thêm gì vào cổng đó thì đề xuất, không import thẳng vào `modules/<kernel>/`.
- Đặt tên mới theo [docs/framework/04-DAT-TEN-BIZCITY.md](docs/framework/04-DAT-TEN-BIZCITY.md).
