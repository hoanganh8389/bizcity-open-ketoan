# pos-mini — POS nhỏ nhất ghi sổ qua open-ketoan
<!-- [2026-11-03 03:35 PM Johnny Chu - Chu Hoàng Anh] G3-01 — mẫu tích hợp: một đơn bán → một chứng từ sale, không cài gói -->

Một tệp Node, không phụ thuộc gói nào. Biến **một đơn bán ở quầy** thành **một chứng từ `sale`** theo [bizcity_ledger_intake@1](../../docs/contracts/BIZCITY-LEDGER-INTAKE-v1.md). Dùng làm điểm xuất phát cho POS, app bán hàng, ERP, CRM.

| Tệp | Việc |
|---|---|
| `pos-mini.mjs` | `toDocument(order, cfg)` + lệnh chạy; `--catalog` in danh mục thật của đơn vị |
| `don-mau.json` | một đơn mẫu: 2 dòng (một dòng quà tặng), thu tiền mặt + QR |
| `cau-hinh.json` | bảng ánh xạ mã của POS → mã danh mục kế toán (chi nhánh, hình thức thanh toán) |

## Chạy

```bash
export BIZCITY_SERVER=http://localhost:8088 BIZCITY_API_KEY=...       # khoá màn HT02
node examples/pos-mini/pos-mini.mjs --catalog                         # chi nhánh, mã thuế, hình thức thanh toán có thật
node examples/pos-mini/pos-mini.mjs examples/pos-mini/don-mau.json --out build/don-1.json
npx bizcity event check build/don-1.json                              # PASS ở L5 rồi mới --submit
```

## Ranh giới của app

- App kể **sự việc** đúng như hoá đơn đã chốt: tiền trước thuế và tiền thuế từng dòng là số in trên hoá đơn. `pos-mini` không tính thuế, không có thuế suất, không có số tài khoản.
- `totals` chỉ là cộng các dòng; cửa nạp kiểm lại tới đồng.
- Mã chi nhánh, mã thuế, hình thức thanh toán phải có trong danh mục của đơn vị. Thiếu thì lệnh báo `⚠` và thoát mã 1, không tự bịa mã.
- `docKey` = `<nguồn>:<cửa hàng>:sale:<id đơn>`, không đổi suốt đời đơn. Sửa đơn thì tăng `version`.

Đơn trả hàng, thu nợ, chuyển kho: xem `docs/api/03…11` và JSON mẫu ở `docs/api/vi-du/`. Skill hướng dẫn AI làm: [`skills/build-pos-with-open-ketoan`](../../skills/build-pos-with-open-ketoan/SKILL.md).
