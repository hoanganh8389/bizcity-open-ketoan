# 15. Phiếu kế toán do module lập (`manual_journal`)
<!-- [2026-11-03 08:22 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — trang hướng dẫn manual_journal (năng lực ledger.manual-journal available nhưng chưa có trang, chưa có mẫu); viết theo packages/contracts/src/documents.ts, posting/rules/journal.rule.ts, apps/api/test/manual-journal.test.ts -->

Dùng khi **module** cần ghi một khoản không phải mua, bán, kho hay tiền: phân bổ chi phí trả trước, trích trước chi phí, chi phí lương, kết chuyển doanh thu chưa thực hiện. Ví dụ: module nhân sự ghi chi phí lương phải trả, module phân bổ ghi chi phí thuê kho trả trước.

**Module không chọn tài khoản.** Mỗi dòng chỉ mang **lý do** và **số tiền**. Cặp Nợ / Có do kế toán khai ở lý do loại `journal`. Chỉ phân hệ lõi `ke-toan` tự chọn tài khoản, bằng phiếu kế toán của mình (`POST /api/v1/vouchers`), không qua loại này ([ADR-0015](../adr/ADR-0015-chot-sdk-v1-moi-thu-qua-be-su-kien.md)).

## 1. Kế toán khai lý do loại `journal` (một lần)

Màn Lý do – Tài khoản (ACC18), hoặc API:

```http
PUT /api/v1/posting/reasons/PB-TT
{ "name": "Phân bổ chi phí trả trước", "kind": "journal", "debitAccount": "<tài khoản chi phí>", "creditAccount": "<tài khoản trả trước>" }
```

Tài khoản trong ví dụ là chỗ trống: kế toán điền theo hệ thống tài khoản của đơn vị. Kernel từ chối lý do khi: thiếu một trong hai tài khoản, Nợ trùng Có, tài khoản là tài khoản tổng hợp (phải dùng tài khoản chi tiết), hoặc lý do loại khác `journal` mà khai cặp tài khoản.

## 2. Module gửi phiếu

Module gửi qua `ctx.ledger.submit` trong một action ghi (`idempotency: 'required'`, quyền `documents:write` hoặc quyền của module). Phiếu đi bể sự kiện như mọi chứng từ: `accounting_events` → luật định khoản `manual_journal` → sổ.

Mẫu: [vi-du-module/phieu-ke-toan-phan-bo.json](vi-du-module/phieu-ke-toan-phan-bo.json)

```json
{
  "docType": "manual_journal",
  "docKey": "phan-bo:CN01:2026-11:PB-01",
  "version": 1,
  "branchCode": "CN01",
  "docNo": "PB-2026-11-01",
  "docDate": "2026-11-30",
  "description": "Phân bổ chi phí tháng 11/2026",
  "lines": [
    { "lineKey": "l1", "reasonCode": "PB-TT", "amount": 1200000, "description": "Phân bổ tiền thuê kho trả trước" },
    { "lineKey": "l2", "reasonCode": "TRICH-TRUOC", "amount": 850000, "partnerCode": "NCC-DIEN", "description": "Trích trước tiền điện tháng 11" }
  ],
  "totals": { "total": 2050000 }
}
```

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| `docKey` | có | Bắt đầu bằng **mã module** (`phan-bo:…`), ổn định. Cửa nạp chặn `docKey` không thuộc nguồn gửi (`IN-BIZ-003`) |
| `version` | có (mặc định 1) | Sửa phiếu = cùng `docKey`, `version + 1` |
| `branchCode`, `docNo`, `docDate`, `description` | như mọi chứng từ | [01-quy-uoc](01-quy-uoc.md) |
| `lines[].lineKey` | có | Khoá dòng, không trùng trong phiếu |
| `lines[].reasonCode` | có | Lý do loại `journal` đã khai ở bước 1 |
| `lines[].amount` | có | Số dương, đồng |
| `lines[].partnerCode` | khi tài khoản của lý do theo dõi đối tượng | Mã đối tượng **đã có** trong danh mục (công nợ, tạm ứng, chi phí phải trả…) |
| `lines[].description` | không | Diễn giải dòng |
| `totals.total` | có | Bằng tổng `amount` các dòng |

**Khuôn đóng:** dòng có trường lạ, như số tài khoản (`account`, `debitAccount`…) hay thuế (`taxCode`…), bị từ chối. Phiếu **không** có `invoice`, không có thuế GTGT: thuế đi chứng từ mua, bán.

## 3. Kết quả

| Tình huống | Kết quả |
|---|---|
| Một dòng | Một cặp Nợ / Có theo lý do |
| Nhiều dòng, nhiều lý do | Nhiều cặp Nợ / Có trong **một** bút toán |
| Chế độ ghi sổ của loại `manual_journal` là **chờ duyệt** (mặc định) | Trạng thái `pending`: phiếu chờ ở màn Định khoản tự động (ACC14), **chưa vào sổ** tới khi duyệt |
| Chế độ tự động | Trạng thái `posted` |
| `version + 1` đổi số tiền | Đảo bản cũ, ghi bản mới |
| Huỷ (`ctx.ledger.cancel`) | Đảo toàn bộ, số dư về như trước |

## 4. Bị từ chối khi

- Dòng mang số tài khoản hoặc thuế; phiếu có hoá đơn; tổng lệch tổng các dòng. **Không lưu gì.**
- Lý do không phải loại `journal`.
- Tài khoản của lý do theo dõi đối tượng mà thiếu `partnerCode`, hoặc mã đối tượng lạ.
- Kỳ đã khoá cho loại `manual_journal` (loại khác cùng kỳ không bị khoá theo).

Gặp mã lạ: `GET /api/v1/findings/<MÃ>` (nghĩa, cách sửa, luật gốc).

## 5. Kiểm trước khi viết code

Hôm nay: gửi chứng từ vào tiền kiểm `POST /api/v1/intake/preflight` (L1–L5, định khoản thử rồi hoàn tác, không ghi sổ). Lệnh kiểm cho dev (`bizcity event check`, `module accounting-check`) đang làm ở [PHASE-027](../phases/PHASE-027-CORE-KE-TOAN-CHO-DEV/README.md) CK-1, chưa có trên `main`. <!-- [2026-11-03 10:34 PM Johnny Chu - Chu Hoàng Anh] FLOW — chỉ nói công cụ đang có trên main -->

Khai `manual_journal` trong `ledger.submits` của `bizcity.module.json`.

## Căn cứ và giới hạn

- Khuôn: `packages/contracts/src/documents.ts` (`manualJournalDocumentSchema`), luật định khoản: `packages/kernel/src/modules/posting/rules/journal.rule.ts`.
- Các hành vi ở §3 và §4 có test: `apps/api/test/manual-journal.test.ts` (7 ca và ca chế độ chờ duyệt).
- **Vì sao mẫu nằm ở `vi-du-module/`, không ở `vi-du/`:** mẫu trong `vi-du/` được test `api-examples` gửi thật bằng khoá API và phải ra `posted` ngay. Phiếu này cần lý do `journal` khai trước và mặc định chờ duyệt, nên chỉ được kiểm theo khuôn (bộ kiểm chuẩn `SC-CON-3`).
- **Gửi từ hệ thống ngoài bằng khoá API** chưa có test riêng. Đường đã có test là `ctx.ledger.submit` từ action của module trong repo. Muốn dùng từ ngoài, hỏi nhóm Lõi trước.
