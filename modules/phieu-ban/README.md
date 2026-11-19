# Module `phieu-ban` — phiếu bán / trả hàng nhập tay
<!-- [2026-11-13 11:55 PM Võ Hoàng] NGHIEM-THU — NT-BH-015: README module phiếu bán nhập tay (đóng góp) -->

Phiếu bán hàng (BH10) và hàng bán trả lại (BH11) do kế toán / bán buôn lập trong phần mềm: bán buôn, bán nợ, bán ngoài quầy. Thay dữ liệu giả cũ của hai màn này. Phiếu nghiệm thu [NT-BH-015](../../docs/nghiem-thu/ban-hang/NT-BH-015-phieu-ban-nhap-tay.md), chữ chốt [nghiep-vu/21](../../docs/nghiep-vu/21-phieu-ban-nhap-tay.md).

## Luồng

```text
Ghi (nháp) ──► Duyệt ──► ctx.ledger.submit(sale | sale_return, docKey phieu-ban:<id>, version n)
   ▲              │                                   → ghi ngay / chờ ACC14 theo chế độ ghi sổ
   └── Bỏ duyệt ◄─┘──► ctx.ledger.cancel(docKey)       → đảo bút toán; duyệt lại = version n + 1
```

- **Số phiếu:** `BH` / `TL` + `yyMM` + 6 số, theo cửa hàng × loại × tháng (bảng `code_counters`). Để trống thì cấp lúc Ghi lần đầu; gõ tay thì không được trùng trong cửa hàng + loại.
  - Không dùng `ctx.documents.nextNumber`: dãy đó chỉ đếm theo đơn vị × năm.
- **Tính tiền ở máy chủ:**
  - tiền dòng = SL × đơn giá − chiết khấu; quà = 0;
  - thuế theo mã thuế đầu ra của mặt hàng;
  - tên / ĐVT theo danh mục;
  - báo đủ lỗi một lần: mã lạ, chưa có thuế, hình thức thanh toán lạ, thu quá tổng, ghi nợ mà chưa chọn khách.
- **Trả hàng:**
  - Số phiếu gốc là phiếu bán của module (cùng cửa hàng) → nối `originalDocKey`, không trả quá số đã bán trừ các phiếu trả đã duyệt.
  - Số gốc khác (đơn máy bán, phiếu website) → chỉ tham khảo.
  - Phiếu bán còn phiếu trả đã duyệt → không bỏ duyệt được.
- **Kho:** `warehouseCode` của phiếu ghi xuống từng dòng. Tồn theo sổ open-ketoan (kho gốc — chữ chốt §1).

## API (`/api/v1/m/phieu-ban/…`)

| Lệnh | Đường | Quyền |
|---|---|---|
| GET | `/docs?docType=&from=&to=&branchCodes=&status=&search=&page=&pageSize=` | `phieu-ban:read` |
| GET | `/docs/:id`, `/docs/:id/returnable` | `phieu-ban:read` |
| GET | `/quote?branch=&warehouse=&skus=` (giá theo cửa hàng, tồn sổ — cho form) | `phieu-ban:read` |
| POST / PUT / DELETE | `/docs`, `/docs/:id` (nháp) | `phieu-ban:write` |
| POST | `/docs/:id/approve`, `/docs/:id/unapprove` | `phieu-ban:write` |

Khuôn dữ liệu: `TradeDoc` ([docs/api/13-phieu-nhap-tay.md](../../docs/api/13-phieu-nhap-tay.md)). Màn ở khung giao diện (`apps/web/src/components/phieu-hang`) gọi qua `apps/web/src/lib/tradeDocs.ts`.

## Đơn đặt hàng (NT-BH-023) <!-- [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: đơn đặt hàng (đóng góp) -->

```text
Nháp (báo giá, hạn hiệu lực) ──Gửi──► hạn mức / nợ quá hạn (accounting.debts.partner-balances) ──vướng──► Chờ duyệt ──Duyệt──┐
                                              └──không──► Đã gửi: ctx.ledger.submit(transfer kho bán → KCB) ◄───────────────┘
Đã gửi ──Giao (≤ còn lại, khoá theo đơn)──► phiếu bán nháp (docs, body.order) xuất từ KCB ──giao đủ──► Đã đóng
       ──Đóng / Huỷ (chưa giao)──► transfer KCB → kho bán
```

- Bảng `orders` (dòng có `delivered`, `held`; các lần giao), `order_events` (lịch sử cũ → mới). Số `DH` + yyMM + 6 số theo cửa hàng (bộ đếm `code_counters`, kind `order`).
- Kho KCB theo cửa hàng: khoá `bizcity.phieu_ban.hold_warehouses` (`["CN01=KHO-KCB"]`), sửa ở thẻ Cài đặt của màn BH20.
- Chứng từ giữ hàng: `transfer` cùng chi nhánh, một chứng từ cả cặp, `amount` 0, docKey `phieu-ban:dh:<đơn>:<lần>` — mỗi lần giữ / trả một chứng từ mới.
- Xoá phiếu bán nháp sinh từ đơn → trả lại số đã giao; sửa số lượng → đơn ghi lại (không vượt số còn lại).
- Quyền `phieu-ban:order-approve` (chủ đơn vị, kế toán trưởng) duyệt / từ chối; người lập không tự duyệt.
- API: `GET /orders`, `GET /orders/:id`, `GET /orders/:id/history`, `GET /order-settings`, `POST /orders`, `PUT /orders/:id`, `POST /orders/import`, `POST /orders/:id/{send,approve,reject,deliver,close,cancel}`.

## Giao hàng + copy đơn (NT-BH-032) <!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-032: chuyến giao qua kho KHG, phí ship, COD, copy đơn (đóng góp) -->

```text
Đã gửi ──Lập chuyến (≤ còn lại)──► Chờ lấy (shipping += SL, hàng còn ở KCB)
   Chờ lấy ──Đi giao──► Đang giao: ctx.ledger.submit(transfer KCB → KHG, docNo DH…-S<n>)            (chưa doanh thu)
   Đang giao ──Đã giao──► phiếu bán nháp xuất từ KHG: dòng hàng + dòng SHIP (ship_fee_sku) + payment COD (cod_methods[hãng])
   Đang giao ──Hoàn────► transfer KHG → KCB (DH…-H<n>), hàng giữ lại cho đơn;  Chờ lấy ──Hoàn──► chỉ trả chỗ
```

- Bảng `order_shipments` (chuyến: trạng thái, hãng, mã vận đơn, phí ship, COD, kho KHG, dòng, phiếu bán, nhật ký); cột thông tin giao + `copied_from` ở `orders`. Dòng đơn thêm `shipping` (đang trên chuyến chưa xong): còn lại = SL − đã giao − đang giao.
- Khoá: `bizcity.phieu_ban.ship_warehouses` (`["CN01=KHO-KHG"]`), `bizcity.phieu_ban.ship_fee_sku`, `bizcity.phieu_ban.cod_methods` (`["GHN=COD-GHN"]`) — khai ở BH17 (module pos, khối ⑤). Thiếu → `PHIEU_BAN_NO_SHIP_WAREHOUSE` / `PHIEU_BAN_NO_SHIP_FEE_ITEM` / `PHIEU_BAN_NO_COD_METHOD`.
- Đóng / huỷ đơn còn chuyến chưa xong → chặn (`PHIEU_BAN_ORDER_STATE`, `cause: shipping`). Phiếu bán của chuyến không đổi số lượng hàng (`PHIEU_BAN_SHIPMENT_STATE`); xoá phiếu nháp → chuyến về Đang giao.
- Copy: `POST /orders/copy` (`from` = `order` / `sale` / `pos`). Đơn máy bán đọc qua action `pos.order.lines` của module pos (`ctx.actions.call`). Giá cửa hàng hôm nay; khuyến mại `core.policy.evaluate` (không gọi được → không áp, `meta.promoSkipped`).
- Quyền `phieu-ban:giao-hang-lap` (lập chuyến), `phieu-ban:giao-hang-sua` (đổi trạng thái chuyến); copy dùng `phieu-ban:write`.
- API: `POST /orders/:id/shipments`, `POST /orders/:id/shipments/:shipmentId/status`, `POST /orders/copy`; `GET /order-settings` kèm `ship`.

## Chưa làm (đợt sau)

- Khuyến mại / chương trình bán (`core.policy.evaluate`) trên màn nhập. (Giá theo cửa hàng + cảnh báo tồn: đã có từ 14/11 — `GET /api/v1/m/phieu-ban/quote`.)
- Phát hành hoá đơn điện tử từ phiếu (NT-BH-015 Q1).
- Chặn vượt hạn mức nợ khách (Q2, đợt 4).
