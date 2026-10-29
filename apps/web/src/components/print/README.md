# Khung in dùng chung

Mọi mẫu in phiếu, chứng từ đều dựng trên thư mục này. In bằng hộp thoại in của trình duyệt (in ra máy in hoặc lưu PDF).

| Tệp | Nội dung |
|---|---|
| `PrintHost.tsx` | Kiểu `PrintTemplate<T>`, `PrintCtx` (tên đơn vị, địa chỉ, MST, logo, tên chi nhánh, người in), `PrintJob` dựng các tờ rồi gọi in |
| `PrintButton.tsx` | Nút **In** + mũi tên chọn mẫu; nhớ mẫu mặc định theo mã màn trên máy |
| `blocks.tsx` | Khối nhỏ: `OrgHead`, `Title`, `Fields`, `Table`, `Signs`, `Foot`, `Dots`; hàm `m`, `mb`, `qty`, `words`, `dayText`, `invoiceText`, `opt` |
| `forms.tsx` | **Mẫu chuẩn dùng chung nhiều màn**: `CashForm` (phiếu thu / chi), `StockForm` (phiếu nhập / xuất kho), `UncForm` (ủy nhiệm chi), `BillForm` (giấy cuộn 80mm), `LedgerForm` (sổ / báo cáo dạng bảng nhiều trang) |
| `barcode.tsx`, `barcodeEncode.ts` | Vẽ mã vạch Code 128 / EAN-13 (tem hàng) |

Căn cứ in dưới mẫu số: `FORM_NOTE` trong `blocks.tsx` (chế độ kế toán hiện hành, TT99/2025); mẫu thuế truyền `formNote` riêng.

Kiểu chữ, khổ giấy: `styles/theme.css`, mục "Khung in dùng chung" (lớp `.pd-*`, trang có tên `pA4`, `pA5L`, `pRoll`…).

## Mẫu của từng màn ở đâu

| Màn | Tệp mẫu |
|---|---|
| ACC51–54, ACC16 (và CN02–04 dùng lại) | `features/vouchers/VoucherPrint.tsx` |
| BH10, BH11, KHO01 | `components/phieu-hang/printTemplates.tsx` |
| BH06 | `features/documents/ExportAdjustPrint.tsx` |
| Q2 | `features/documents/CashTransferPrint.tsx` |
| BT03 | `features/vouchers/OffsetPrint.tsx` |
| MH03 | `phan-he/mua-hang/chung-tu/mauIn.tsx` |
| CN05 | `phan-he/quy/debts/paymentRequestPrint.tsx` |
| ACC28, ACC30, ACC22, ACC23 | `phan-he/tai-san/assets/assetPrint.tsx` |
| DM10 | `features/catalog/productPrint.tsx` |
| DM14 | `features/catalog/priceListPrint.tsx` |
| Sổ, báo cáo kế toán (ACC8–13, 38–93…) | `phan-he/ke-toan/reports/mauIn/*.tsx` |
| Báo cáo thuế, tờ khai, B09, B01D | `phan-he/thue/mauIn/*.tsx` |
| Báo cáo kho (ACC82, ACC83, ACC49, HH01, BH04, KQ01) | `phan-he/kho/inventory/mauIn/`, `phan-he/kho/reports/mauIn/` |
| Báo cáo bán hàng (BH01–05) | `phan-he/ban-hang/sales/mauIn/baoCaoBanHang.tsx` |
| Báo cáo mua hàng (MH10, MH11) | `phan-he/mua-hang/mauIn/baoCaoMua.tsx` |
| Sổ tài sản (ACC29, ACC42, ACC85, ACC27) | `phan-he/tai-san/assets/mauIn/soTaiSan.tsx` |

## Sửa một mẫu

- Mẫu chuẩn (phiếu thu / chi, nhập / xuất kho, ủy nhiệm chi, bill 80mm): sửa trong `forms.tsx` — mọi màn dùng mẫu đó đổi theo.
- Mẫu riêng của một màn: sửa trong tệp mẫu của màn (bảng trên).
- Đổi khổ giấy, lề: `paper` của mẫu; lề từng khổ ở `@page` trong `theme.css`.

## Thêm mẫu cho một màn đã có nút In

Thêm một phần tử vào mảng mẫu của màn. Nếu là loại phiếu đã có mẫu chuẩn thì chỉ cần đổi dữ liệu sang dạng của mẫu chuẩn:

```tsx
{ id: 'pxk', name: 'Phiếu xuất kho 02-VT', paper: 'A4', source: 'rptXxx.rpt',
  render: (d, ctx) => <StockForm s={{ dir: 'out', price: 'value', branchCode: d.branchCode, docNo: d.docNo, date: d.docDate,
    person: d.partnerName, reason: d.note, warehouse: ctx.branchName(d.branchCode),
    lines: d.lines.map((l) => ({ sku: l.sku, name: l.name, unit: l.unit, qty: l.qty, amount: l.amount })) }} ctx={ctx} /> }
```

`id` không trùng trong màn (dùng để nhớ mẫu mặc định); `source` ghi tên mẫu HTsoft tương ứng để sau đối chiếu.

## Thêm nút In cho một màn mới

1. Tạo tệp mẫu cạnh màn (`xxxPrint.tsx`): kiểu dữ liệu một tờ, hàm nạp chứng từ để in (nếu danh sách chưa đủ dữ liệu), mảng `PrintTemplate<T>[]`.
2. Đặt nút vào màn:

```tsx
<PrintButton screen="BH06" templates={XXX_TEMPLATES} disabled={!sel} getDocs={async () => (sel ? [await loadXxx(sel.id)] : [])} />
```

- Trong hộp phiếu (đang ở chế độ xem vẫn bấm được): bọc `<span data-view-ok>…</span>`.
- Thanh công cụ của hộp phiếu tự định dạng nút: thêm `bare`.
- Một màn có nhiều loại chứng từ, mỗi loại một bộ mẫu: thêm `memoryKey={\`MH03:${kind}\`}` để mẫu mặc định nhớ riêng theo loại.

Phân hệ (`phan-he/<x>`) chỉ import lõi: `@/components/print` là lõi, dùng được ở mọi phân hệ.

## Mẫu in cho màn sổ / báo cáo

Dùng `LedgerForm`: khai cột (tiêu đề hai tầng bằng `group`, cột có `sum` thì tự có dòng cộng), dòng thêm trước / sau bảng (số dư đầu kỳ, cuối kỳ), nhóm (`groupBy` có cộng nhóm), mẫu số TT200 (`form`), kỳ (`from` / `to`), chữ ký (mặc định Người ghi sổ, Kế toán trưởng, Giám đốc). Tiêu đề cột lặp lại mỗi trang, chân trang có "Trang x / y".

- In số liệu màn đang xem (điều kiện lọc đã áp dụng + kết quả truy vấn) — không gọi lại máy chủ.
- Mẫu cuối danh sách luôn là `screenTemplate()` — "In bảng đang xem" như nút In cũ.
- Màn có bảng lọc bên trái: truyền nút vào `SideActions` / `FilterLayout` qua prop `print`.
- Tệp mẫu đặt trong thư mục `mauIn/` cạnh màn (vd `phan-he/ke-toan/reports/mauIn/soNhatKyChung.tsx`).

```tsx
<SideActions onSearch={…} onExport={…} busy={q.isFetching}
  print={<PrintButton screen="ACC89" templates={NKC_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ ...f, rows: d.rows }] : [])} />} />
```

## Cấu hình mẫu in không cần sửa code (Hệ thống → Mẫu in, HT05)

- **Danh mục trung tâm**: `catalog.ts` (lõi) + `src/printCatalog.ts` (gốc ứng dụng, nạp mẫu của mọi phân hệ lúc khởi động). Mỗi mẫu có mã cố định `<mã màn>:<id mẫu>` (vd `BH10:a5`) — **không đổi `id` của mẫu đã có** (cấu hình đã lưu trỏ theo mã này). Màn mới có nút In: thêm một dòng vào `SCREENS` trong `src/printCatalog.ts`.
- **Lưu ở máy chủ**: bảng `print_template_settings` (migration 0028), API `/api/v1/print-templates/*` (`apps/api/src/modules/print-templates`). Chỉ lưu phần khác mẫu gốc.
- **Áp khi in** (`settings.ts`, `PrintButton`): ưu tiên người dùng → chi nhánh / shop → chi nhánh cha → cả đơn vị → mẫu gốc. Mẫu tắt bị ẩn; mẫu mặc định theo cấu hình thắng lựa chọn nhớ trên máy; nút ☆ trong danh sách đặt mặc định của riêng người dùng.
- **Phần chỉnh nội dung** (`overrides.ts`): tiêu đề, số liên, khổ giấy, hàng chữ ký, dòng căn cứ, ghi chú cuối tờ, logo. Khối `Title`, `OrgHead`, `Signs`, `LedgerForm`, `BillForm` tự đọc. Hàng chữ ký cố định của mẫu (không cho thay) thì truyền `<Signs keep …>`.
