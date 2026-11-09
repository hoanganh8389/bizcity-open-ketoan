# Skill kế toán cho AI coding agent
<!-- [2026-11-03 03:35 PM Johnny Chu - Chu Hoàng Anh] G3-01 — ba skill kế toán: AI xây app đúng hợp đồng, kiểm bằng lệnh thật, giải thích mã theo danh mục -->
<!-- [2026-11-03 04:45 PM Johnny Chu - Chu Hoàng Anh] G3-01 — sáu chuẩn kế toán làm nền (open-ketoan-standard), skill chung mọi loại app, skill kiểm luồng flow check -->
<!-- [2026-11-03 06:10 PM Johnny Chu - Chu Hoàng Anh] G3-01 — quyết định chủ dự án: giá vốn mặc định bình quân tháng, FIFO lộ trình; item_id trụ cột vòng đời; cổng sản xuất cho cộng đồng; flow check --to -->

> Tài liệu nền cho cả người và AI: [docs/core/](../docs/core/README.md) (trụ cột 0–VIII, công cụ kiểm, mã hàng và vòng đời, [hướng dẫn cho AI](../docs/core/04-huong-dan-cho-ai.md)). <!-- [2026-11-03 07:23 PM Johnny Chu - Chu Hoàng Anh] ADR-0020 — trỏ tới bộ hướng dẫn docs/core/ -->

Tám skill giúp AI (Claude Code, Codex, Cursor, Copilot…) xây POS, bán hàng online, CRM, MRP, kho vật tư, quản lý tài sản, ERP ghi sổ qua open-ketoan **mà không cần biết kế toán**, và luôn đạt sáu chuẩn kế toán. AI đọc hợp đồng, sinh code tích hợp, chạy lệnh kiểm. AI **không** tự nghĩ tài khoản, bút toán hay luật thuế: Kernel và danh mục của đơn vị quyết định những thứ đó.

| Skill | Khi nào AI dùng | Lệnh nó chạy |
|---|---|---|
| [open-ketoan-standard](open-ketoan-standard/SKILL.md) | **luôn đọc trước**: sáu chuẩn C1…C6, việc của app, trạng thái thật của Kernel | — |
| [build-business-app-with-open-ketoan](build-business-app-with-open-ketoan/SKILL.md) | CRM, MRP, kho vật tư, tài sản, bán online, ERP | theo bảng loại app |
| [build-pos-with-open-ketoan](build-pos-with-open-ketoan/SKILL.md) | POS tại quầy, small win 4 bước | `pos-mini`, `bizcity event check` |
| [validate-accounting-event](validate-accounting-event/SKILL.md) | một chứng từ: trước khi nộp, khi bị từ chối, trong CI | `bizcity event check <tệp>` |
| [check-accounting-flow](check-accounting-flow/SKILL.md) | chuỗi chứng từ: mua → kho → bán → giá vốn → lãi lỗ → đóng kỳ | `bizcity flow check --sku --period [--to]` |
| [explain-accounting-error](explain-accounting-error/SKILL.md) | API trả mã lỗi, tiền kiểm có phát hiện | `bizcity explain <MÃ>` |
| [use-bizcity-library](use-bizcity-library/SKILL.md) <!-- [2026-11-08 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-50: skill thư viện dùng chung --> | cần tham số pháp lý, ngày nghỉ, căn cứ, mã chuẩn; thêm / sửa `libraries/*`; API trả `LIB-*` | `bizcity library search / check / new / diff` |
| [contribute-production-module](contribute-production-module/SKILL.md) | mở cổng sản xuất / MRP cho lõi (cộng đồng đóng góp) | ADR → hợp đồng → Kernel → F22 + conformance |

## Sáu chuẩn, và hôm nay Kernel đã thi hành tới đâu

| Chuẩn | Nội dung | Hôm nay | Lệnh kiểm |
|---|---|---|---|
| C1 | Liền mạch mua → kho → bán → giá vốn → lãi lỗ | ✅ theo mã hàng, giá vốn bình quân tháng (mặc định), đối chiếu kho ↔ sổ cái · ☐ FIFO (lộ trình, sau `item_id`) | `flow check --to` (vòng đời) |
| C2 | Mã hàng có phiên bản, định danh giữ nguyên | ☐ trụ cột vòng đời; ADR-0017/0018 đã duyệt, chưa thi hành | `flow check` (SKIP có lý do) |
| C3 | Ghi sổ, định khoản đúng quy định | ✅ | `event check` L5 |
| C4 | Sổ có nguồn chứng từ, có phiên bản | ✅ | `event check` |
| C5 | Làm việc với sổ có nguyên tắc | ✅ | `flow check` C5, `ledger verify` |
| C6 | Báo rõ lý do chưa đạt | ✅ mã, cách sửa, luật · 🟡 sổ tay theo action | `explain` |

Ô ☐ là chỗ skill bắt AI dừng và nói thật với người dùng, không tự chế ở app. Sản xuất / MRP là **cổng chờ**: `event check` trả SKIP "cổng chưa mở" và chỉ sang skill contribute-production-module.

## Cài vào dự án của bạn

```bash
# trong repo open-ketoan
npx bizcity skills install --to ../pos-cua-toi     # hoặc bỏ --to để cài ngay trong repo này
```

Lệnh chép skill vào `.claude/skills/` (Claude Code tự nhận) và `.agents/skills/` (agent khác), và ghi `.bizcity/ketoan.json` chỉ đường tới lệnh `bizcity` của bản repo này. Chưa `npm install` thì dùng `node packages/cli/bin/bizcity.mjs` thay `npx bizcity`.

## Small win đầu tiên: POS của bạn ghi sổ thật

```bash
bash scripts/cai-nhanh.sh                                         # ① chạy open-ketoan: http://localhost:8088
export BIZCITY_SERVER=http://localhost:8088 BIZCITY_API_KEY=...   # ② khoá ở màn Khoá API (HT02), phạm vi "Gửi chứng từ"
node examples/pos-mini/pos-mini.mjs --catalog                     # ③ mã thật của đơn vị → sửa examples/pos-mini/cau-hinh.json
node examples/pos-mini/pos-mini.mjs examples/pos-mini/don-mau.json --out build/don-1.json
npx bizcity event check build/don-1.json                          #    khuôn → tiền kiểm → định khoản thử (dryRun)
npx bizcity event check build/don-1.json --submit                 # ④ nộp: xem Sổ cái, Nhật ký bán hàng
```

Ở bước ③ bạn thấy bảng **Bút toán Kernel dựng**: Nợ / Có đúng chuẩn kế toán từ một đơn bán, không viết dòng kế toán nào. Gặp mã lỗi thì `npx bizcity explain <MÃ>`.

Hay hơn: mở dự án bằng Claude Code sau khi cài skill và gõ *"nối POS / CRM / app kho của tôi vào open-ketoan"*. Skill dẫn AI đi đúng bốn bước trên và chỉ báo xong khi `event check` ra PASS.

## Bảo đảm

- Luồng hàng đọc bằng báo cáo thật: sổ chi tiết hàng, đơn giá vốn tháng, lãi gộp, bảng kiểm khoá kỳ (`/api/v1/periods/check`).
- Lệnh không giữ luật riêng: khuôn và tổng tiền dùng `ingestDocumentSchema` + `totalsProblems` của cửa nạp; tiền kiểm và định khoản thử gọi API thật (`/api/v1/intake/preflight`, `/api/v1/documents/submit?dryRun=1`); nghĩa mã lấy từ `FINDINGS_LIBRARY`, `ERROR_CATALOG`, danh mục F22, `diag-codes.json`.
- Thiếu bản dựng hoặc máy chủ thì lớp đó là SKIP kèm lệnh để chạy được, không bao giờ là PASS.
- Test: `node --test packages/cli/test/accounting-cli.test.mjs` (CI: job Bộ kiểm chuẩn, và job Kiểm kiểu trên bản dựng thật).
- Sửa skill ở `skills/` rồi chạy lại `skills install`; không sửa bản đã chép trong `.claude/skills`.
