# Hướng dẫn cho GitHub Copilot (và agent đọc .github/)
<!-- [2026-10-30 09:40 PM Johnny Chu - Chu Hoàng Anh] R-SIG — tạo: Copilot đọc tệp này; nội dung chuẩn nằm ở AGENTS.md, ở đây nhắc các luật bắt buộc nhất. -->

**Đọc [AGENTS.md](../AGENTS.md) trước tiên** — đó là hướng dẫn chuẩn cho mọi agent (Claude Code, Copilot, Codex, Cursor). Tệp này chỉ nhắc những điều không được quên.

> **Tuyên bố tối thượng (Johnny Chu – Chu Hoàng Anh):** SQL minh bạch, Accounting Core ổn định, cộng đồng tự do vibe-code phần mở rộng mà không làm mất tính toàn vẹn của dữ liệu kế toán. **Cộng đồng được tự do phát triển module, nhưng không được tự do thay đổi sự thật kế toán.**

## Bốn câu không thương lượng

1. Không sự việc (`accounting_events`), không bút toán.
2. Sổ cái chỉ thêm: sửa / huỷ = bút toán đảo.
3. Mọi đầu vào tài chính đi `postDocumentIn()` (chứng từ nhận từ nguồn) hoặc `eventStore` (sự việc Kernel tự lập). Ngoài Kernel chỉ dùng cổng `apps/api/src/kernel/public.ts`.
4. Không viết số tài khoản trong code định khoản — tra qua `AccountResolver`.

## Chữ ký và dấu thay đổi (R-SIG)

Mỗi lần sửa có chức năng một tệp framework thêm một dòng dấu tại chỗ đổi:

```ts
// [2026-10-30 07:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — một cửa ghi sổ: eventStore cho phiếu tay, kết chuyển, khấu hao, giá vốn.
```

- In sẵn dòng đúng giờ: `node scripts/ky-dau.mjs <MÃ> "<mô tả>" --file <tệp>`.
- Người = người chỉ đạo thay đổi, **không** phải Copilot / agent.
- Không xoá dấu cũ; migration đã phát hành không sửa.
- Bộ kiểm: SC-SIG-1, SC-SIG-2. Chi tiết: [docs/rules/RULE-SIGNATURE.md](../docs/rules/RULE-SIGNATURE.md).

## Trước khi xong việc

```bash
node tests/conformance/selfcheck.mjs   # phải ĐẠT
bash scripts/kiem-chuan.sh
npm run typecheck
npm test                               # cần PostgreSQL: docker compose up -d db
```
