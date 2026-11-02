# `bizcity_remedy@1` — Phương án khắc phục có cấu trúc
<!-- [2026-11-02 07:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — hợp đồng phương án khắc phục: mọi kiểm warn / error khai bước, màn, vai, kiểm lại; sổ màn SCREENS; check SC-FIX-1 (R-FIX-1..5). -->

> **Phiên bản:** 1.0.0-draft · 2026-11-02 · **Trạng thái:** Đề xuất · **Thuộc:** kernelContracts của [Standard v1](../standard/README.md)
> **Kiểu TypeScript:** `packages/contracts/src/remedy.ts` · **Kiểm:** SC-FIX-1 · **Luật:** R-FIX-1..5 ([PHASE-022 00-MASTER-PLAN §3](../phases/PHASE-022-GIA-DINH-LOI-DANH-GIA-THEO-VAI/00-MASTER-PLAN.md))

## 1. Mục đích

Một cảnh báo chỉ có ích khi người đọc biết **làm gì tiếp**. Hợp đồng này buộc mỗi kiểm mức `warn` / `error` nói: các bước, mở màn nào, ai có quyền làm, xong thì kiểm lại bằng gì. Giao diện (dải cảnh báo, màn Toàn vẹn, Trạm tiền kiểm, Bàn đánh giá) hiện cùng một khuôn.

## 2. Khuôn

| Trường | Kiểu | Bắt buộc | Ý nghĩa |
|---|---|---|---|
| `steps[]` | `{ text, screen?, role? }` | ≥ 1 | bước đánh số; `text` là một câu có động từ; `screen` lấy từ `SCREENS`; `role` là vai cần có nếu cao hơn `owner` |
| `owner` | `creator · accountant · chief_accountant · owner · operator · core_team` | có | vai tối thiểu làm được phương án |
| `verify` | `{ code?, screen? }` | có, ít nhất một | kiểm lại: một mã kiểm chạy lại, hoặc màn có số liệu đã đổi |
| `stopTheLine` | `true` | kiểm Tier 0 | bước đầu là `STOP_THE_LINE_STEP`: dừng ghi sổ, báo nhóm Lõi kèm mã tra cứu |
| `forbid[]` | chuỗi | không | việc KHÔNG được làm (vd "Không điều chỉnh kho cho khớp") |

`SCREENS` là sổ màn duy nhất (mã màn + đường dẫn + nhãn). Đường dẫn phải có trong menu giao diện.

## 3. Nơi khai

| Loại kiểm | Nơi |
|---|---|
| Tự chẩn đoán `DiagCheck` | thuộc tính `remedy` của check; `DiagResult.remedy` trả ra API |
| Bảng kiểm trước khoá kỳ | `PERIOD_CHECK_REMEDIES` (`packages/kernel/src/modules/periods/period-check.remedies.ts`), mỗi mục `GET /api/v1/periods/check` có `remedy` |
| Tiền kiểm `IN-*` (PHASE-021) | mục danh mục mã tiền kiểm (khi có mã) |

## 4. Luật

- Không trường nào chứa lệnh sửa dữ liệu: phương án đi qua màn / API công khai có quyền và bằng chứng (R-FIX-2).
- SC-FIX-1 (block): thiếu `remedy` ở kiểm `warn` / `error`; thiếu `steps` / `owner` / `verify`; Tier 0 thiếu `stopTheLine`; `SCREENS.X` không có trong sổ màn; đường dẫn sổ màn không có trong menu; `verify.code` không có; mục bảng kiểm khoá kỳ thiếu phương án.

## 5. Nhật ký thay đổi

| Phiên bản | Ngày | Thay đổi |
|---|---|---|
| 1.0.0-draft | 2026-11-02 | Khởi tạo (PHASE-022 W1): khuôn `Remedy`, `SCREENS`, `STOP_THE_LINE_STEP`; phương án cho mọi kiểm tự chẩn đoán hiện có và 10 mục bảng kiểm khoá kỳ |
