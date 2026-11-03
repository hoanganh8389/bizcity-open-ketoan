---
name: validate-accounting-event
description: Kiểm một chứng từ kế toán (bizcity_ledger_intake@1 — sale, sale_return, purchase, customer_payment, transfer…) trước khi nộp vào sổ open-ketoan, bằng đúng hàm và API của cửa nạp, ra PASS / FAIL / SKIP kèm bút toán Kernel dựng thử. Dùng trước mỗi lần nộp, sau khi sửa hàm ánh xạ đơn → chứng từ, khi chứng từ bị từ chối, và trong CI của app tích hợp. Từ khoá: validate accounting document, kiểm chứng từ, tiền kiểm, preflight, dry run, định khoản thử.
---

<!-- [2026-11-03 02:45 PM Johnny Chu - Chu Hoàng Anh] G3-01 — skill validate-accounting-event: một lệnh, năm lớp, không đổi SKIP thành PASS -->

# Kiểm chứng từ trước khi vào sổ

Một lệnh trả lời câu "chứng từ này vào sổ được không, và nếu không thì vì sao". Lệnh dùng chính hàm và API mà cửa nạp dùng. Bạn **không** tự kiểm bằng mắt, không tự cộng tiền thay lệnh, không tự đoán bút toán.

**Đọc trước:** skill [open-ketoan-standard](../open-ketoan-standard/SKILL.md) — sáu chuẩn C1…C6 mà mọi tích hợp phải đạt, và chỗ Kernel chưa có (FIFO, mã hàng có phiên bản, sản xuất).

Lệnh này kiểm chuẩn C3, C4, C6 cho **một** chứng từ. Chuỗi chứng từ (C1, C5) kiểm bằng skill [check-accounting-flow](../check-accounting-flow/SKILL.md).

## Lệnh

```bash
npx bizcity event check <tệp.json>             # tệp là một chứng từ, hoặc { "document": … }
npx bizcity event check - < tep.json           # đọc từ stdin
npx bizcity event check <tệp.json> --json      # cho máy đọc (CI, agent)
npx bizcity event check <tệp.json> --submit    # nộp thật, chỉ khi mọi lớp trước không FAIL và L5 PASS
```

Chưa `npm install` thì thay `npx bizcity` bằng `node packages/cli/bin/bizcity.mjs`. Ở dự án khác: `node <cli trong .bizcity/ketoan.json>`.

Máy chủ lấy từ `BIZCITY_SERVER` + `BIZCITY_API_KEY` (khoá màn HT02). Không in khoá ra màn hình, không ghi khoá vào tệp của repo.

Mã thoát: `0` PASS · `1` FAIL · `2` SKIP hoặc lỗi dùng lệnh.

## Năm lớp

| Lớp | Kiểm gì | Nguồn | Cần |
|---|---|---|---|
| L1 | Khuôn: trường bắt buộc, kiểu, ngày, độ dài | `ingestDocumentSchema` | bản dựng contracts |
| L2 | Tổng tiền = cộng các dòng tới đồng (`IN-SUM-*`) | `totalsProblems` của cửa nạp | bản dựng kernel |
| L1–L4 | Như trên + danh mục thật của đơn vị (chi nhánh, mã hàng, MST), phiên bản, hoá đơn trùng, ngày hoá đơn | `POST /api/v1/intake/preflight` | máy chủ + khoá |
| L5 | Định khoản thử: luật định khoản thật dựng bút toán rồi huỷ | `POST /api/v1/documents/submit?dryRun=1` | máy chủ + khoá |
| nộp | Ghi sổ, trả biên nhận | `POST /api/v1/documents/submit` | `--submit` |

L1 và L2 chạy không cần máy chủ, cho vòng sửa nhanh. **Chỉ L5 chứng minh chứng từ vào sổ được.**

## Đọc kết quả và làm tiếp

- **PASS** — L5 đã chạy, không lớp nào FAIL. Báo cho người dùng bảng bút toán Kernel dựng. Có `⚠` thì nói rõ: cảnh báo cần kế toán xem, không phải lỗi của app.
- **FAIL** — mỗi phát hiện có dòng "sửa:" và "luật:" (chuẩn C6). Với **mỗi** mã:
  1. Chạy `npx bizcity explain <MÃ> --role dev` (skill `explain-accounting-error`).
  2. Sửa ở **nguồn**: hàm ánh xạ đơn → chứng từ, hoặc dữ liệu đơn. Mã có "Ai sửa: kế toán" (thiếu danh mục, chưa khai mã thuế…) thì dừng và nói người dùng nhờ kế toán, đừng vá ở app.
  3. Chạy lại lệnh kiểm. Lặp tới khi hết FAIL. Tối đa 3 vòng cho cùng một mã; vẫn còn thì dừng, báo mã và nội dung `explain`.
- **SKIP** — chưa đủ bằng chứng. Đọc lý do trên dòng SKIP và làm đúng lệnh nó ghi (dựng repo, đặt biến máy chủ). Không bao giờ báo SKIP thành PASS, không nói "chắc là ổn".

## Không làm

- Không sửa `totals` cho bằng tổng dòng mà không kiểm lại từng dòng (`IN-SUM-001`): hoá đơn và sổ phải cùng số.
- Không đổi `docDate` sang tháng khác để né `PERIOD_LOCKED`.
- Không gửi cùng `docKey` + `version` với nội dung khác (`IN-BIZ-005`, `IDEMPOTENCY_CONFLICT`): sửa đơn thì tăng `version`.
- Không thêm `reasonCode`, mã thuế hay hình thức thanh toán không có trong danh mục để "cho qua".
- Không dùng `--submit` khi người dùng chỉ nhờ kiểm.

## Trong CI của app tích hợp

Giữ một thư mục chứng từ mẫu đã PASS (mỗi loại nghiệp vụ một tệp, sinh từ hàm ánh xạ). Bước CI:

```bash
for f in test/chung-tu/*.json; do npx bizcity event check "$f" --json > "build/check-$(basename "$f")" || exit 1; done
```

Không có máy chủ trong CI thì lệnh chỉ chạy L1–L2 và ra SKIP (mã 2). Coi mã 2 là "chưa kiểm định khoản", không phải đạt. Muốn có L5 trong CI thì dựng open-ketoan bằng `docker compose up -d` trong job.

## Báo cáo

Dán nguyên bảng lớp của lệnh (PASS / FAIL / SKIP từng dòng), danh sách mã còn lại và dòng `KẾT LUẬN`. Không tóm tắt thành "đã kiểm, ổn".
