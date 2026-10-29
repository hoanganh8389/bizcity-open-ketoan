# Luồng nghiệp vụ doanh nghiệp (gộp vào `bizcity_document@1` §5)

> **Phiên bản:** 1.0.0-draft · 2026-10-28 · **Luật:** [R-WF](../rules/RULE-WORKFLOW.md)
> **Danh mục luồng:** [WF-CORE.md](WF-CORE.md)

Mỗi phân hệ là một hoặc nhiều **luồng**: chuỗi phiếu đi qua các trạng thái, do các tác nhân bấm. Lõi không quan tâm luồng dài bao nhiêu; lõi chỉ quan tâm **điểm nộp sự việc** — chỗ luồng chạm sổ.

## 1. Máy trạng thái chuẩn

```
 draft ──submit──► submitted ──approve──► approved ──complete──► done
   │                  │  ▲                   │
   │               reject│ (về draft,        │ unapprove / cancel
   ▼                  ▼  │  bắt buộc lý do)  ▼
cancelled          draft                  cancelled
```

| Trạng thái chuẩn | Ý nghĩa | Chạm sổ? |
|---|---|---|
| `draft` | Đang lập, sửa tự do | Không |
| `submitted` | Chờ duyệt | Không |
| `approved` | Đã duyệt (1 hoặc 2 cấp theo ngưỡng) | **Có** — nộp `bizcity_ledger_intake` (`version` = số lần duyệt) |
| `done` | Đã hoàn tất việc kèm theo (đã nhận đủ hàng, đã chi tiền…) | Có thể nộp sự việc kèm theo (phiếu thu / chi) |
| `cancelled` | Huỷ | Nếu từng `approved`: nộp huỷ (`POST /documents/cancel` hoặc `requestCancel`) |

Phân hệ được thêm trạng thái giữa (ví dụ `approved_l1`, `shipped`, `partially_received`) nhưng mỗi trạng thái phải khai `maps_to` về một trạng thái chuẩn.

## 2. Khuôn khai một luồng

Mỗi luồng trong [WF-CORE.md](WF-CORE.md) (hoặc tệp riêng của phân hệ) khai đủ:

```yaml
id: p2p                         # mã luồng
module: mua-hang                # phân hệ sở hữu
actors: [nhân viên mua, trưởng mua, kế toán, thủ kho]
documents:                      # phiếu của phân hệ
  - kind: purchase_order        # bảng: purchase_documents.kind
    states: [draft, submitted, approved, partially_received, done, cancelled]
emits:                          # điểm chạm sổ
  - when: goods_receipt.approved
    docType: purchase
    docKey: "mh:{tenant}:purchase:{id}"
links:                          # nối luồng bằng khoá, không gọi hàm chéo (R-WF-8)
  - purchase_return.originalDocKey -> purchase.docKey
  - supplier_payment.lines[].invoiceDocKey -> purchase.docKey
ledger:                         # bút toán tiêu biểu (để người duyệt kiểm)
  - "Nợ 1561 / Có 3312 — tiền hàng"
  - "Nợ 1331 / Có 3312 — thuế"
reconcile:                      # báo cáo đối chiếu luồng ↔ sổ
  - "Bảng kê mua vào = sổ hoá đơn đầu vào"
  - "Công nợ NCC (debt_items) = số dư 331 theo đối tượng"
```

## 3. Bảng điểm chạm sổ (tổng)

| Luồng | Phân hệ / nguồn | Sự việc nộp | Khi nào |
|---|---|---|---|
| O2C bán hàng | ban-hang / plugin POS, Woo | `sale`, `sale_return`, `customer_payment` | phiếu đã duyệt ở nguồn |
| P2P mua hàng | mua-hang | `purchase`, `purchase_return`, `supplier_payment` | phiếu nhập / trả đã duyệt |
| Kho | kho / plugin | `transfer` (`leg` out/in), `stock_adjustment` | duyệt xuất / duyệt nhận / duyệt điều chỉnh |
| Tiền | quy / plugin | `cash_transfer`, phiếu thu chi (lõi) | phiếu duyệt; đề nghị thanh toán duyệt → phiếu chi |
| Tài sản | tai-san | `depreciation` (lõi sinh), phiếu kế toán tăng / giảm | chạy khấu hao tháng; ghi tăng / giảm |
| Khoá sổ (R2R) | ke-toan | `cogs`, `closing` (lõi sinh) | tính giá vốn; kết chuyển |
| Nhân sự (H2R) *(dự kiến)* | nhan-su | `payroll` *(docType mới)*, `supplier_payment`/phiếu chi lương | bảng lương duyệt; chi lương |
