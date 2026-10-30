# `bizcity_compliance@1` — Compliance Contract: tuân thủ chế độ kế toán

> **Phiên bản:** 1.0.0 · 2026-10-30 · **Trạng thái:** Chấp nhận · **Lớp kiểm soát 3/3** của [Bản công bố kiến trúc](../CONG-BO-KIEN-TRUC.md) (Domain · Event · Compliance)
> **Bản máy đọc:** [`docs/standard/compliance-matrix.json`](../standard/compliance-matrix.json). Bảng điểm của bộ kiểm chuẩn tính trạng thái từng dòng tự động (mục "Ma trận tuân thủ" trong `SCOREBOARD.md`).
> **Nguyên tắc AP-7:** tuân thủ được **thực thi** trong runtime và CI, không chỉ viết trong tài liệu. Mỗi yêu cầu dưới đây có tín hiệu đo được; yêu cầu chưa có tín hiệu đúng là **thiếu**, không phải "đã có trên giấy".

## 1. Phạm vi

Ba lớp kiểm soát chia việc như sau:
- **Domain Contract** ([`bizcity_domain@1`](BIZCITY-DOMAIN-v1.md)): nghiệp vụ được làm gì, điều kiện, bất biến.
- **Event Contract** ([`bizcity_event@1`](BIZCITY-EVENT-v1.md)): sự kiện nào được phát, phiên bản, payload, nguồn phát, ý nghĩa.
- **Compliance Contract** (tệp này): yêu cầu của **chế độ kế toán và pháp luật** về chứng từ, sổ sách, chỉnh sửa, lưu trữ, kiểm toán, và cách Core bảo đảm chúng.

## 2. Ma trận tuân thủ bắt buộc

Rủi ro ở đây là những gì xảy ra khi thiết kế hướng sự kiện (EDA) sai. Quy tắc là điều Bizcity **bắt buộc**.

| Mã | Yêu cầu | Rủi ro nếu thiết kế sai | Quy tắc Bizcity bắt buộc | Thực thi bằng (tín hiệu trong ma trận) |
|---|---|---|---|---|
| **STD-CMP-1** *(T0)* | Chứng từ hợp lệ | Sự kiện tạo giao dịch không có chứng từ | Bút toán phải có nguồn chứng từ (sự việc có phiên bản) và căn cứ hạch toán (lý do định khoản) | DG-LEDGER-4; UNIQUE `(tenant_id, doc_key)`; SC-KERNEL-3 |
| **STD-CMP-2** *(T0)* | Ghi sổ chính xác | Hai consumer / hai lần gửi ghi trùng nghiệp vụ | Idempotency và uniqueness **tại CSDL**: `docKey` + `version` cho sổ; `Idempotency-Key` cho action | UNIQUE `action_requests`; `test/actions.test.ts`; DG-EVENT-1 |
| **STD-CMP-3** *(T0)* | Sửa chữa sổ | Consumer cập nhật trực tiếp bút toán cũ | Sửa bằng chứng từ điều chỉnh / bút toán đảo, giữ dấu vết; sổ chỉ thêm | DG-DB-2; DG-LEDGER-3; SC-KERNEL-1 |
| **STD-CMP-4** *(T0)* | Khoá kỳ kế toán | Sự kiện đến chậm ghi vào kỳ đã khoá | **Period Lock Gate**: kiểm khoá trong chính giao dịch ghi sổ; khoá kỳ bị chặn khi sổ trong kỳ có lỗi toàn vẹn | `ledgerService` (`PERIOD_LOCKED`); `guardLock` (R-DIAG-4); `test/period-locks.test.ts` |
| **STD-CMP-5** *(T0)* | Nhất quán dữ liệu | Sự kiện phát ra khi giao dịch chưa commit | **Transactional Outbox** (R-OUTBOX) | năng lực `events.outbox`; SC-EVT-1 |
| **STD-CMP-6** | Lưu trữ | Message hết hạn, mất lịch sử nghiệp vụ | Sổ, chứng từ (mọi phiên bản), bằng chứng lưu **riêng trong CSDL** theo thời hạn luật định (§3), không phụ thuộc broker; sao lưu có kiểm khôi phục, có PITR | SC-EVD-2; DG-EVD-1; `scripts/kiem-khoi-phuc.sh`; `infrastructure/backup/` |
| **STD-CMP-7** *(T0)* | Phân quyền ghi sổ | Module tự ghi vào bảng ledger | **Chỉ Accounting Core** có quyền ghi sổ: module nộp sự việc; API chạy bằng vai trò CSDL không superuser | SC-MOD-2; DG-SEC-1; SC-KERNEL-3 |
| **STD-CMP-8** | Kiểm toán | Không rõ sự kiện do ai tạo | Mỗi thao tác ghi có **actor** (người / khoá / AI + kênh + người được làm thay), **nguồn**, **correlation**, **bằng chứng**, **phiên bản** | SC-EVD-2; runtime ghi `request_id`; `correlation_id` |
| **STD-CMP-9** | Thay đổi chế độ kế toán | Áp dụng quy tắc mới vào chứng từ cũ | Chính sách kế toán có **phiên bản và ngày hiệu lực**; mỗi lần định khoản ghi phiên bản đã dùng; định khoản lại chứng từ cũ dùng chính sách hiệu lực tại ngày chứng từ (trừ khi ghi rõ lý do) | năng lực `posting.policy-version`; `posting_log.policy_version` |

Trạng thái hiện tại của từng dòng xem bảng điểm. Ngày 2026-10-30:
- **đạt:** C-2, C-3, C-4;
- **một phần:** C-6, C-7, C-8. Nợ A-17 (module ghi bảng lõi), PITR, `correlation_id` chưa xong. C-1 đạt từ 2026-10-30 khi nợ A-01 một cửa ghi hết (PHASE-004);
- **thiếu:** C-5 (outbox, G2-05), C-9 (phiên bản chính sách).

## 3. Ma trận pháp lý (Việt Nam)

> **Lưu ý:** bảng này là định hướng kỹ thuật để thiết kế đúng. Điều khoản cụ thể phải được **kế toán trưởng / luật sư** của đơn vị xác nhận trước khi dùng làm căn cứ; văn bản có thể đã được sửa đổi, thay thế. Thêm / sửa dòng là sửa thường, có người duyệt hiểu nghiệp vụ.

| Văn bản | Yêu cầu chính | Cơ chế của Core | Yêu cầu Bizcity |
|---|---|---|---|
| Luật Kế toán 2015 (88/2015/QH13): chứng từ kế toán | Mọi nghiệp vụ kinh tế phát sinh phải có chứng từ; chứng từ có nội dung bắt buộc | sự việc (`accounting_events`) có phiên bản, lưu nguyên payload; bút toán trỏ về sự việc | STD-CMP-1 |
| Luật Kế toán 2015: sổ kế toán, sửa chữa sổ | Không tẩy xoá; sửa sổ theo phương pháp quy định (ghi số âm, ghi bổ sung, cải chính) | sổ chỉ thêm; sửa = bút toán đảo (ghi số âm) + bút toán mới, giữ dấu vết | STD-CMP-3 |
| Luật Kế toán 2015 + Nghị định 174/2016/NĐ-CP: lưu trữ tài liệu kế toán | Thời hạn lưu trữ theo loại tài liệu (tối thiểu 5 năm, 10 năm, hoặc vĩnh viễn); chứng từ ghi sổ, sổ kế toán, báo cáo tài chính tối thiểu 10 năm | không có lệnh xoá dữ liệu sổ / chứng từ / bằng chứng; bằng chứng chỉ thêm ≥ 10 năm (STD-EVD-8); sao lưu + kiểm khôi phục | STD-CMP-6 |
| Thông tư 99/2025/TT-BTC (chế độ kế toán doanh nghiệp, thay Thông tư 200/2014/TT-BTC) | Hệ thống tài khoản, chứng từ, sổ, báo cáo tài chính theo chế độ | hệ thống tài khoản TT99; gói định khoản `vn-tt99-*` có phiên bản; đổi chế độ không áp ngược vào chứng từ cũ | STD-CMP-9 |
| Nghị định 123/2020/NĐ-CP (đã sửa đổi): hoá đơn, chứng từ điện tử | Hoá đơn điện tử; xử lý hoá đơn sai bằng hoá đơn điều chỉnh / thay thế | sổ hoá đơn (`tax_invoices`) sinh khi ghi sổ; trạng thái hoá đơn `valid` / `replaced` / `adjusted` / `cancelled` | STD-CMP-1, -3 |
| Luật Giao dịch điện tử 2023 | Chứng từ điện tử có giá trị khi bảo đảm toàn vẹn, xác thực | chuỗi băm bằng chứng; biên nhận kiểm lại được (`GET /evidence/:id`) | STD-CMP-8 |
| Khoá sổ cuối kỳ (quy chế nội bộ, kiểm toán) | Sau khi khoá không ghi vào kỳ đã khoá; mở khoá có lý do | khoá kỳ (kỳ × chi nhánh × loại); mở khoá bắt buộc lý do; nhật ký khoá / mở; chặn khoá khi sổ lệch | STD-CMP-4 |

## 4. Chính sách kế toán có phiên bản (STD-CMP-9) — thiết kế

Chưa có code. Việc nhận: G2 / PHASES 3, năng lực `posting.policy-version`.

1. **Gói chính sách:** gói định khoản, lý do, nhóm hạch toán, tài khoản ngầm định của một đơn vị có `policy_version` (tăng mỗi lần đổi) và `effective_from` (ngày hiệu lực).
2. **Mỗi lần định khoản** ghi `policy_version` đã dùng vào `posting_log`. Từ một bút toán trả lời được "định khoản theo chính sách nào".
3. **Đổi chính sách** chỉ áp cho chứng từ có `doc_date ≥ effective_from` được định khoản **sau** khi đổi (STD-DOM-18). Chứng từ cũ không tự định khoản lại.
4. **Định khoản lại** chứng từ cũ (sửa sai) mặc định dùng chính sách hiệu lực tại `doc_date`. Dùng chính sách khác thì bắt buộc lý do, có bằng chứng.

## 5. Thay đổi hợp đồng này

| Thay đổi | Cần |
|---|---|
| Thêm dòng ma trận / thêm tín hiệu chặt hơn | sửa thường + cập nhật `compliance-matrix.json` cùng PR (SC-CMP-1) |
| Nới / bỏ một yêu cầu STD-CMP | ADR + chủ dự án duyệt |
| Sửa ma trận pháp lý §3 | người duyệt hiểu nghiệp vụ kế toán |
