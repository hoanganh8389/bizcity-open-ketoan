# Phiếu bán / trả kế toán lập về website của shop — không cần plugin POS (chữ chốt NT-BH-017)
<!-- [2026-11-14 10:30 AM Võ Hoàng] NGHIEM-THU — chữ chốt bước 3 đợt (b): module phieu-ban phát sự kiện, app tgs-wp chuyển tiếp, cửa nhận + bộ ghi bản sao chuyển sang cầu nối (phiếu NT-BH-017) (đóng góp) -->

Phiếu: [NT-BH-017](../nghiem-thu/ban-hang/NT-BH-017-phieu-ban-ve-website.md). Yêu cầu của ban giám đốc ngày 14/11/2026.

## 1. Vấn đề

| Hiện trạng | Hệ quả |
|---|---|
| Module `phieu-ban` (BH10 / BH11) nộp sổ nhưng **không phát sự kiện** | Phiếu kế toán lập không về website shop |
| App `tgs-wp` chỉ nghe `pos.order.recorded`, `pos.return.recorded`, `pos.order.cancelled` | — |
| Cửa nhận `/wp-json/tgs-pos/v1/ketoan-events` và bộ ghi bản sao `TGS_POS_Ledger_Mirror` nằm trong **plugin `tgs_pos`**, chỉ nhận cho shop **bật POS React** | Shop không cài / không bật POS không nhận được gì |
| Cầu nối hứng mọi lần ghi phiếu ở website để gửi sang kế toán | Bản sao ghi vào website sẽ bị gửi ngược → chứng từ trùng. Đã có bản sửa `fix/bo-qua-ban-sao-pos` (bỏ qua dòng nguồn `pg:…`), chờ merge |

## 2. Lựa chọn

1. **Module `phieu-ban` phát sự kiện** trong cùng giao dịch nộp sổ (outbox, như module `pos`):
   - **duyệt** (kể cả duyệt lại) → `phieu-ban.doc.recorded` v1;
   - **bỏ duyệt** → `phieu-ban.doc.cancelled` v1.
2. **App `tgs-wp` nghe thêm** hai sự kiện trên, giao webhook ký HMAC như sự kiện máy bán. Địa chỉ webhook theo môi trường (`APP_WEBHOOK_URL_TGS_WP`).
3. **Cửa nhận và bộ ghi bản sao chuyển sang cầu nối** — cầu nối có ở mọi shop, không phụ thuộc plugin POS:
   - cửa nhận mới `POST /wp-json/tgs-acc/v1/ketoan-events`: cùng chữ ký `TGS_KETOAN_WEBHOOK_SECRET`; nhận cả `pos.*` và `phieu-ban.*`;
   - lõi ghi bản sao `TGS_Acc_Ledger_Mirror` (chuyển từ `TGS_POS_Ledger_Mirror`): **bỏ điều kiện "shop bật POS React"**;
   - hai bộ chuyển: đơn máy bán (khuôn `Order`) và phiếu nhập tay (khuôn `TradeDoc`) → cùng một khuôn phiếu website;
   - `tgs_pos` giữ cửa nhận cũ để không gãy bản đang chạy, bên trong gọi lõi của cầu nối;
   - đổi địa chỉ webhook sang cửa nhận của cầu nối khi cả hai bản đã lên.
4. **Không gửi ngược:** merge `fix/bo-qua-ban-sao-pos`. Bản sao ghi `local_ledger_source_id = 'pg:<docKey>'`; cầu nối bỏ qua các dòng này cả khi gửi theo lô lẫn khi hứng tức thời.

Đã cân nhắc, không chọn:
- Cầu nối kéo định kỳ phiếu nhập tay từ kế toán: chậm, và phải tự quản lý con trỏ.
- Ghi thẳng vào CSDL WordPress từ kế toán: phá ranh giới hai hệ.

## 3. Hình dạng

**Sự kiện** (module `phieu-ban`, manifest `events.emits`; app `tgs-wp`, `subscribes`):

```json
{ "type": "phieu-ban.doc.recorded", "version": 1,
  "subject": "phieu-ban.doc:<docId>", "dedupeKey": "phieu-ban.doc.recorded:<docId>:<version>",
  "data": { "docId": "…", "docKey": "phieu-ban:<docId>", "version": 2, "kind": "sale", "branchCode": "CN01",
            "cashier": { "name": "<người duyệt>" },
            "doc": { /* TradeDoc đã tính ở máy chủ (docs/api/13-phieu-nhap-tay.md): docNo, docDate, warehouseCode, partner, invoice,
                       lines[{ lineKey, sku, name, unit, qty, unitPrice, discount, amountBeforeTax, taxCode, taxAmount, isGift }],
                       payments[{ methodCode, amount }], totals, originalDocNo, note */ },
            "originalDocKey": "phieu-ban:<docId gốc>" } }

{ "type": "phieu-ban.doc.cancelled", "version": 1, "subject": "phieu-ban.doc:<docId>", "dedupeKey": "phieu-ban.doc.cancelled:<docId>:<version>",
  "data": { "docId": "…", "docKey": "phieu-ban:<docId>", "version": 2, "kind": "sale", "branchCode": "CN01" } }
```

- `version` = phiên bản chứng từ trong sổ (`ledger_version`).
- Website ghi đè tại chỗ theo `docKey`. Bản đến sau mà cũ hơn bản đang có thì bỏ qua (bộ ghi bản sao đã có luật này).

**Phía website** (repo `tgs_accounting_bridge`, `tgs_pos` — ngoài open-ketoan, làm theo đây):

| Thành phần | Việc |
|---|---|
| `TGS_Acc_Ketoan_Events` | `POST /wp-json/tgs-acc/v1/ketoan-events` |
| `TGS_Acc_Ledger_Mirror::apply($doc)` | Lõi ghi bản sao (từ `tgs_pos`, bỏ điều kiện React). Phiếu bán (loại 10) + phiếu thu (7) theo hình thức + phiếu xuất. Phiếu hoàn (11) nối phiếu bán theo `originalDocKey`. Huỷ = xoá mềm |
| `TGS_Acc_Ledger_Mirror::from_trade_doc()` | Bộ chuyển TradeDoc → khuôn chung |
| `tgs_pos` | `TGS_POS_Ledger_Mirror` thành lớp mỏng gọi lõi của cầu nối; cửa nhận cũ gọi `TGS_Acc_Ketoan_Events` |

Các bước của cửa nhận `TGS_Acc_Ketoan_Events`:
1. kiểm chữ ký (`timestamp.body`, HMAC-SHA256);
2. tìm site theo mã chi nhánh (`TGS_Acc_Source::shop_code`, không phân biệt hoa thường);
3. chuyển sang khuôn phiếu website;
4. gọi lõi ghi bản sao;
5. ghi bảng hàng nhận để chống ghi trùng.

## 4. Ảnh hưởng

- **open-ketoan:**
  - module `phieu-ban`: manifest `events.emits` + `requires.capabilities` thêm `events.outbox`; phát sự kiện ở `service.ts`;
  - app `tgs-wp`: manifest `subscribes` thêm hai sự kiện.
- **Không đổi Core / Kernel / hợp đồng.**
- **Website:** shop không cài POS cũng có phiếu kế toán lập. Báo cáo, tồn, doanh thu ở website gồm cả các phiếu này.
- **Phát hành hoá đơn từ website:** làm tay như phiếu shop tự lập (NT-BH-015 Q1 giải một phần).

## 5. Kiểm bằng gì

- **open-ketoan** — test tích hợp `apps/api/test/nt-bh-017-phieu-ban-ve-website.test.ts` (đề xuất):
  - duyệt → outbox có `phieu-ban.doc.recorded` đúng `docKey` / `version` / dòng / tiền;
  - bỏ duyệt → `cancelled`;
  - duyệt lại → `recorded` phiên bản 2;
  - app `tgs-wp` nhận đủ ba loại sự kiện (manifest).
- **Website** (LocalWP shop2 tắt POS React + Docker): theo NT-BH-017 §5 dòng 1–9.
  - Cầu nối báo 0 phiếu bản sao bị gửi ngược.
  - Gửi lại cùng sự kiện không ghi thêm; chữ ký sai trả 401.

## 6. Làm thật (14/11)
<!-- [2026-11-14 03:30 PM Võ Hoàng] NGHIEM-THU — ghi điểm làm thật NT-BH-017 (đóng góp) -->

| # | Chữ chốt | Làm thật |
|---|---|---|
| 1 | `tgs_pos` dùng lại lõi của cầu nối | Chưa đổi `TGS_POS_Ledger_Mirror` (giữ nguyên cho máy bán); lõi của cầu nối là bản chép, dùng chung bảng `tgs_pos_mirror`. Sự kiện `pos.*` tới cửa nhận của cầu nối được chuyển cho `TGS_POS_Ketoan_Events::process` |
| 2 | — | Hàng rào ghi của tgs_pos (shop bật POS React) chặn bản sao của cầu nối → tgs_pos cho qua khi `TGS_Acc_Ledger_Mirror::is_mirroring()` (tgs_pos react 8e7ebc7) |
| 3 | — | **Triển khai:** đơn vị đã kết nối app `tgs-wp` phải đồng ý phạm vi sự kiện mới (Tiện ích → Ứng dụng, hoặc `POST /api/v1/apps/:key/scope` (key `tgs-wp`)); sự kiện phát trước lúc đồng ý không được giao |
| 4 | Phiếu trả | Vào hàng chờ (chưa có mẫu phiếu nhập trả của POS cũ) |
