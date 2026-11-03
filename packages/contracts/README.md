# @ketoan/contracts — Hợp đồng dữ liệu dùng chung
<!-- [2026-11-03 08:22 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — README gói: tệp chính, cách đổi khuôn an toàn, lệnh -->

Khuôn và kiểu dùng chung giữa API, giao diện và hệ thống bên ngoài: khuôn chứng từ, kiểu trả về, mã lỗi, mã phát hiện. Thuộc trụ cột IV (một cửa nạp, các cổng kiểm chuẩn, một ngôn ngữ mã) trong [bảng trụ cột](../../docs/standard/tru-cot.json).

## Tệp chính trong `src/`

| Tệp | Có gì |
|---|---|
| `documents.ts` | Khuôn `bizcity_ledger_intake@1`: `ingestDocumentSchema`, mười loại chứng từ (`APPROVABLE_DOC_TYPES`) |
| `enums.ts` | `DOC_TYPE_LIST`, nhãn loại chứng từ, nhóm loại ở màn khoá kỳ |
| `errors.ts` | Danh mục mã lỗi API |
| `intake-findings.ts`, `findings.ts` | Mã phát hiện `IN-*`, `ACC-*`, `PART-*`, `ITEM-*` (`bizcity_findings@1`) và cách khắc phục |
| `remedy.ts` | `bizcity_remedy@1` (bước sửa, ai sửa, việc cấm, kiểm lại) và danh mục màn `SCREENS` |
| `money.ts`, `api.ts`, `module.ts`… | Tiền, khuôn phản hồi, manifest module |

## Đổi khuôn an toàn

Khuôn có ba bản phải đi cùng nhau:

1. `src/documents.ts` (zod, nguồn sự thật).
2. `docs/contracts/BIZCITY-LEDGER-INTAKE-v1.schema.json` (JSON Schema; `SC-CON-3` kiểm mọi mẫu `docs/api/vi-du*/` theo bản này).
3. Trang `docs/api/NN-*.md` và mẫu `docs/api/vi-du/` (test `apps/api/test/api-examples.test.ts` gửi thật từng mẫu).

Đổi một bản mà quên bản khác thì bộ kiểm hoặc test báo.

## Lệnh

```bash
npm run build -w @ketoan/contracts       # CLI (event check, explain) đọc bản dựng dist/
npm run typecheck -w @ketoan/contracts
```
