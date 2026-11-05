---
name: explain-accounting-error
description: Giải thích một mã lỗi hoặc mã phát hiện của open-ketoan (IN-SUM-001, IN-MD-004, ACC-*, PART-*, PERIOD_LOCKED, POSTING_FAILED, UNBALANCED_ENTRY, IDEMPOTENCY_CONFLICT, COGS_STALE, DG-*, F22-*) theo đúng danh mục của repo, cho từng vai: dev, kế toán trưởng, kiểm soát nội bộ, thanh tra thuế. Dùng khi API trả lỗi, khi tiền kiểm có phát hiện, khi tự chẩn đoán báo mã, hoặc khi người dùng hỏi "mã này là gì, sửa sao". Từ khoá: explain error code, lỗi kế toán, mã lỗi, sửa lỗi hạch toán.
---

<!-- [2026-11-03 02:50 PM Johnny Chu - Chu Hoàng Anh] G3-01 — skill explain-accounting-error: nghĩa mã chỉ lấy từ danh mục, không đoán -->

# Giải thích mã lỗi kế toán

Mỗi mã của open-ketoan đã có nghĩa, lý do, cách sửa, người sửa và cách kiểm lại, viết bởi người làm kế toán. Việc của bạn là **tra đúng danh mục** rồi nói lại cho đúng người. Không giải thích mã bằng hiểu biết chung về kế toán.

**Đọc trước:** skill [open-ketoan-standard](../open-ketoan-standard/SKILL.md) — sáu chuẩn C1…C6 mà mọi tích hợp phải đạt, và chỗ Kernel chưa có (FIFO, mã hàng có phiên bản, sản xuất).

## Lệnh

```bash
npx bizcity explain <MÃ>                          # đủ bốn góc nhìn
npx bizcity explain <MÃ> --role dev               # dev | chief_accountant | auditor | tax_inspector
npx bizcity explain <MÃ> --json                   # cho máy đọc
```

Chưa `npm install` thì dùng `node packages/cli/bin/bizcity.mjs explain <MÃ>`. Lệnh tra lần lượt: thư viện phát hiện (`FINDINGS_LIBRARY` + `INTAKE_REMEDIES`), danh mục mã lỗi API (`ERROR_CATALOG`, `ERROR_REASONS`), 93 ca giả định lỗi F22 (ca nào có mã này trong cột "Phát hiện"), bảng mã tự chẩn đoán `DG-*`. Không có bản dựng nhưng có máy chủ thì hỏi `GET /api/v1/findings/:code`. Qua MCP: công cụ `core.findings.explain`.

## Mã ở đâu ra

| Mã trông như | Đến từ | Lấy mã ở |
|---|---|---|
| `IN-SHAPE-*`, `IN-SUM-*`, `IN-MD-*`, `IN-BIZ-*`, `IN-ITEM-*`, `IN-GUARD-*` | trạm tiền kiểm (Gate B) | `findings[].code` của preflight / `event check` |
| `ACC-*`, `PART-*` | khai báo danh mục (Gate A) | phản hồi khi khai tài khoản, đối tượng |
| `VALIDATION_ERROR`, `PERIOD_LOCKED`, `POSTING_FAILED`, `UNBALANCED_ENTRY`, `CONFLICT`… | API | `error.code`; lý do chi tiết ở `error.details.reason` |
| `COGS_STALE`, `INVENTORY_NEGATIVE`, `TRANSIT_NONZERO`… / `DG-*` | tự chẩn đoán, bộ kiểm | màn Hệ thống (HT08), báo cáo kiểm chuẩn |
| `F22-<NHÓM>-NN` | danh mục giả định lỗi theo vai | bảng điểm rà soát |

Một lỗi API có thể mang nhiều mã: tra `error.code` trước, rồi từng mã trong `error.details`.

## Trả lời người dùng

1. Chạy lệnh. Chỉ dùng chữ trong kết quả lệnh cho phần nghĩa, vì sao, cách sửa.
2. Chọn vai theo người đang hỏi: dev đang viết app → `dev`; người làm kế toán → `chief_accountant`; người rà soát → `auditor`; chuẩn bị quyết toán, thanh tra → `tax_inspector`. Không rõ thì in đủ bốn.
3. Nói **ai sửa**. Mã do nguồn sai (người lập) thì dev sửa ở app. Mã cần danh mục / cấu hình thì nói rõ là việc của kế toán, chỉ màn (mã + đường dẫn) mà lệnh in ra.
4. Kết thúc bằng **kiểm lại**: lệnh in "chạy lại để không còn <mã>". Với chứng từ: `npx bizcity event check <tệp>`.

Mẫu trả lời ngắn:

```text
<MÃ> — <nghĩa>.
Vì sao: <vì sao>.
Ai sửa: <vai>. Làm: <các bước, kèm màn nếu có>.
Không được: <các dòng CẤM>.
Kiểm lại: <lệnh / mã>.
```

## Không làm

- `✘ … không có trong danh mục nào` → nói thẳng là mã lạ, đưa nguyên `error.message` / `error.details`. Không đoán nghĩa từ tên mã.
- Dòng `SKIP nguồn` → nói danh mục nào chưa tra được và lệnh để tra (dựng repo hoặc đặt `BIZCITY_SERVER`). Không lấp chỗ trống bằng suy luận.
- Không đề xuất sửa thẳng sổ, chạy SQL, tắt trigger, tắt kiểm, hay đổi ngày chứng từ để né khoá kỳ. Danh mục cấm rõ những việc này.
- Có dòng `⛔ DỪNG GHI SỔ` → việc đầu tiên là dừng gửi chứng từ và báo nhóm Lõi kèm `requestId`; không gợi ý gì khác trước đó.
- Không tự nêu số tài khoản, thuế suất, điều luật ngoài những gì lệnh in ở "Luật gốc".
