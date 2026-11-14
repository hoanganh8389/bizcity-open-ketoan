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
| POST / PUT / DELETE | `/docs`, `/docs/:id` (nháp) | `phieu-ban:write` |
| POST | `/docs/:id/approve`, `/docs/:id/unapprove` | `phieu-ban:write` |

Khuôn dữ liệu: `TradeDoc` ([docs/api/13-phieu-nhap-tay.md](../../docs/api/13-phieu-nhap-tay.md)). Màn ở khung giao diện (`apps/web/src/components/phieu-hang`) gọi qua `apps/web/src/lib/tradeDocs.ts`.

## Chưa làm (đợt sau)

- Giá theo bảng giá cửa hàng và khuyến mại / chương trình bán (`core.policy.evaluate`) trên màn nhập — cần sửa form dùng chung `components/phieu-hang`.
- Phát hành hoá đơn điện tử từ phiếu (NT-BH-015 Q1).
- Chặn vượt hạn mức nợ khách (Q2, đợt 4).
