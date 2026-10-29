# Hướng dẫn cho AI agent (Claude Code, Copilot, Codex, Cursor…)

Dự án: **Bizcity Core Framework** (open-ketoan) — hạ tầng ứng dụng doanh nghiệp, hạt nhân là sổ cái kế toán. Trước khi sửa code, đọc [docs/00-CANON.md](docs/00-CANON.md). Viết module mới: theo [docs/standard/README.md](docs/standard/README.md).

## Bốn câu không thương lượng

1. Không sự việc (`accounting_events`), không bút toán.
2. Sổ cái chỉ thêm: sửa / huỷ = bút toán đảo. Không `UPDATE/DELETE` `ledger_*` (ngoại lệ đóng danh sách: [docs/rules/RULE-LEDGER.md](docs/rules/RULE-LEDGER.md)).
3. Mọi đầu vào tài chính đi `postDocumentIn()` → luật định khoản → `ledgerService.post()`. Phân hệ / add-in không gọi thẳng `ledgerService`, không ghi bảng nhân.
4. Không viết số tài khoản trong code định khoản — tra qua `AccountResolver`.

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

## Quy ước

- Tên bảng, cột, biến: tiếng Anh. Chú thích, thông báo người dùng, tài liệu: tiếng Việt có dấu.
- Tiền: `numeric(18,2)` ở CSDL, cộng trừ qua `toCents/fromCents`.
- Lỗi: `Errors.*` (`apps/api/src/core/errors.ts`), không `reply.status()`.
- Migration: tệp mới số kế tiếp, không sửa tệp đã chạy, có `COMMENT ON`.
- Phân hệ không import phân hệ khác (`apps/*/src/phan-he/<key>/`).
- Đặt tên mới theo [docs/framework/04-DAT-TEN-BIZCITY.md](docs/framework/04-DAT-TEN-BIZCITY.md).
