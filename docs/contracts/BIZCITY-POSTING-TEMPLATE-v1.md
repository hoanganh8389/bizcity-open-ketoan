# `bizcity_posting_template@1` — Gói định khoản (thư viện lý do, marketplace)

> **Phiên bản:** 1.0.0-draft · 2026-10-29 · **Trạng thái:** Đề xuất · **Thuộc:** Kernel (hợp đồng dữ liệu cấu hình, không phải code)
> **Schema:** [BIZCITY-POSTING-TEMPLATE-v1.schema.json](BIZCITY-POSTING-TEMPLATE-v1.schema.json) · **Ví dụ:** [../standard/examples/vn-tt99-thuong-mai.posting-pack.json](../standard/examples/vn-tt99-thuong-mai.posting-pack.json)
> **Liên quan:** [BIZCITY-POSTING-RULE-v1.md](BIZCITY-POSTING-RULE-v1.md) (luật là code), [BIZCITY-LEDGER-INTAKE-v1.md](BIZCITY-LEDGER-INTAKE-v1.md) (sự việc), [BIZCITY-MCP-v1.md](BIZCITY-MCP-v1.md) (AI dùng gói), [../standard/TEMPLATE-MARKETPLACE.md](../standard/TEMPLATE-MARKETPLACE.md) (phát hành, duyệt, cài)

## 1. Vì sao

Chủ doanh nghiệp nhỏ không biết khai 99 lý do, 22 nhóm hạch toán, 18 tài khoản ngầm định. Phần mềm khác bắt họ thuê kế toán cấu hình. Bizcity Core cho **tải một gói định khoản theo ngành**, rồi để **trợ lý AI (Cell)** chọn lý do cho từng nghiệp vụ. Gói là dữ liệu có phiên bản, kiểm được, chia sẻ được: đây là điểm khác biệt của nền tảng.

## 2. Chuỗi từ module đến bút toán

```text
Module (bán hàng, mua hàng, hợp đồng, nhân sự…)       — cộng đồng / AI viết, theo Standard v1
  │  ctx.ledger.submit({ docType, reasonCode?, … })    — bizcity_ledger_intake@1: SỰ VIỆC, không có tài khoản
  ▼
Lý do định khoản (posting_reasons)                     — ◄── GÓI ĐỊNH KHOẢN cài vào đây (hợp đồng này)
  │  + nhóm hạch toán mặt hàng, loại thuế, hình thức thanh toán, tài khoản ngầm định
  ▼
Luật định khoản (modules/posting/rules/*.rule.ts)      — Kernel, code, bizcity_posting_rule@1
  │  AccountResolver: lý do → nhóm hàng → thuế → hình thức TT → ngầm định
  ▼
Bút toán (ledger_entries / ledger_lines)               — chỉ thêm, đảo khi sửa
```

| Ai | Viết gì | Không được |
|---|---|---|
| Module | sự việc + `reasonCode` (hoặc để Core chọn lý do mặc định) | viết số tài khoản (R-POST-2, CANON câu 4) |
| **Gói định khoản** | lý do, nhóm hạch toán, tài khoản ngầm định, hình thức TT, loại thuế, khoản mục, tài khoản con; **tình huống mẫu** | chứa code; đổi luật định khoản; đổi bút toán đã ghi |
| Luật định khoản (Kernel) | cách biến sự việc + cấu hình thành cặp Nợ / Có | đọc cấu hình ngoài AccountResolver |
| Cell (AI) | **gợi ý** `reasonCode`, xem trước bút toán | ghi bút toán hiệu lực (CELL-5) |

## 3. Gói gồm gì

Một tệp JSON (hoặc thư mục có `posting-pack.json`), khuôn trong schema:

| Phần | Nội dung | Bảng đích khi cài |
|---|---|---|
| `id`, `version`, `title`, `publisher`, `license` | Định danh `<publisher>.<chế độ>.<ngành>`, SemVer | `config_packs` (Phase 3) |
| `regime` | Chế độ kế toán: `vn-tt99-2025` (doanh nghiệp), `vn-tt133-2016` (nhỏ và vừa) | — |
| `industries` | Thẻ ngành: `thuong-mai`, `dich-vu`, `san-xuat`, `xay-dung`, `xuat-nhap-khau`, `nha-may`, `nhan-su-luong`, `nong-nghiep`, `fnb`, `ban-le` | — |
| `extends` | Gói nền phải cài trước (vd `bizcity.vn-tt99.nen`) | — |
| `requires` | `docTypes` Kernel cần có; `capabilities` Core cần có | kiểm khi cài |
| `accounts` | Tài khoản **con** thêm vào hệ thống (cha phải có) | `accounts` |
| `postingDefaults` | Khoá ngầm định → tài khoản (`cash`, `receivable`, `promotion_expense`…) | `posting_defaults` |
| `reasons` | Lý do: mã, tên, `kind` (`in`/`out`/`receipt`/`payment`), tài khoản đối ứng / doanh thu / chi phí, khoản mục dòng tiền, cờ, **gợi ý AI** | `posting_reasons` |
| `postingGroups` | Nhóm hạch toán mặt hàng (kho, giá vốn, doanh thu, chiết khấu, trả lại) | `product_posting_groups` |
| `paymentMethods` | Hình thức thanh toán → tài khoản tiền | `payment_methods` |
| `taxCodes` | Loại thuế → tài khoản thuế, nhóm bảng kê | `tax_codes` |
| `costItems` | Khoản mục chi phí (cây) | `dimensions` loại khoản mục |
| `scenarios` | **Tình huống mẫu**: sự việc vào → bút toán mong đợi | không cài; dùng để kiểm và dạy AI |

### 3.1 Lý do có gợi ý cho AI

```json
{
  "code": "CDV01", "name": "Chi tiền điện, nước, internet", "kind": "payment",
  "counterAccount": "6427", "cashflowCode": "LCTT-05",
  "flags": { "postToLedger": true },
  "ai": {
    "keywords": ["tiền điện", "EVN", "tiền nước", "internet", "cước viễn thông"],
    "examples": ["Trả tiền điện tháng 10 cửa hàng Cầu Giấy", "Thanh toán cước FPT"],
    "askIf": ["Chi phí thuộc bộ phận bán hàng hay quản lý?"],
    "notFor": ["Tiền điện của xưởng sản xuất → dùng CSX03 (627)"]
  }
}
```

`ai` không ảnh hưởng định khoản; chỉ là tri thức để Cell chọn lý do (§6). Không chứa dữ liệu khách hàng.

### 3.2 Tình huống mẫu là test của gói

```json
{
  "id": "TM-07", "title": "Bán lẻ có thuế 8%, khách trả tiền mặt",
  "document": { "docType": "sale", "reasonCode": "XBL", "lines": [ … ], "payments": [ { "methodCode": "TM", "amount": 1080000 } ] },
  "expect": [
    { "debit": "1111", "credit": "51111", "amount": 1000000 },
    { "debit": "1111", "credit": "33311", "amount": 80000 },
    { "debit": "6321", "credit": "1561", "amount": "cost" }
  ]
}
```

`amount: "cost"` = giá vốn do Kernel tính (không so số, chỉ so cặp tài khoản). Tình huống dùng cho ba việc: **kiểm gói** trước khi phát hành (§7), **tài liệu** cho chủ doanh nghiệp, **ví dụ few-shot** cho trợ lý AI.

## 4. Phân tầng và thứ tự ưu tiên

```text
cấu hình riêng của đơn vị   (sửa tay ở màn Cấu hình hạch toán)      ← thắng
gói ngành                   (vd bizcity.vn-tt99.thuong-mai)
gói nền                     (bizcity.vn-tt99.nen: hệ thống TK, ngầm định, thuế, hình thức TT chung)
```

- Gói ngành `extends` gói nền; một đơn vị có thể cài **nhiều** gói ngành (thương mại + dịch vụ). Hai gói cùng khai một mã → cài gói sau bị chặn trừ khi nó khai `overrides: ["<mã>"]` và người cài đồng ý.
- Mã lý do trong gói **ổn định** qua các phiên bản (mã là hợp đồng với module và với lịch sử chứng từ). Đổi nghĩa một mã = major.

## 5. Cài, nâng cấp, gỡ (luật)

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **STD-TPL-1** | Gói không chứa code, không chứa số tài khoản ngoài các trường tài khoản đã định; hợp lệ theo schema | SC-TPL-1 |
| **STD-TPL-2** | Mọi tài khoản gói dùng tồn tại trong hệ thống tài khoản của `regime` hoặc trong `accounts` của gói (tài khoản con có cha) | SC-TPL-1 |
| **STD-TPL-3** | Mỗi `docType` / khoá mặc định có **đúng một** lý do `flags.default` trong toàn bộ chuỗi gói đã cài | SC-TPL-1; kiểm lúc cài |
| **STD-TPL-4** | Mọi tình huống mẫu cân Nợ = Có và chỉ dùng lý do có trong gói (hoặc gói nền) | SC-TPL-1 (tĩnh); chạy thật ở lane `runtime` (Phase 4) |
| **STD-TPL-5** | Cài = **xem trước** (dry-run, liệt kê thêm / đổi / giữ) → người có quyền `settings:write` xác nhận → ghi trong một giao dịch, có bằng chứng `core.template.install` | CONF-RUN (Phase 4) |
| **STD-TPL-6** | Cài / nâng cấp **không** đổi bút toán đã ghi (R-POST-8, R-MATRIX-6). Áp cho lần định khoản sau | Kernel |
| **STD-TPL-7** | Không ghi đè cấu hình đơn vị đã sửa tay, trừ khi người cài chọn từng mục | màn cài |
| **STD-TPL-8** | Gỡ gói = **ngừng dùng** (`is_active = false`) các mã chưa phát sinh; mã đã dùng giữ nguyên (R-MD) | Kernel |
| **STD-TPL-9** | Gói yêu cầu `docType` / năng lực Core chưa có → **không cài được**, báo `CAPABILITY_MISSING` kèm danh sách | kiểm lúc cài |

## 6. Trợ lý AI chọn lý do (định khoản tự động)

```text
Chủ: "Chuyển khoản 3,2 triệu trả tiền điện tháng 10 cửa hàng Cầu Giấy"
  └► Cell: hiểu ý → tool posting__reason__suggest { text, kind: "payment" }
        Core: xếp hạng lý do theo ai.keywords / examples của gói + lịch sử chọn của đơn vị
        ◄── [ { code: "CDV01", score: 0.92, why: "khớp 'tiền điện'" }, { code: "CNV03", score: 0.21 } ]
  └► Cell: tool vouchers__payment__draft { reasonCode: "CDV01", amount: 3200000, methodCode: "CK", dryRun: true }
        ◄── xem trước: Nợ 6427 / Có 1121 — 3.200.000
  └► Chủ xác nhận → phiếu chi ở trạng thái chờ duyệt (CELL-5) → kế toán / chủ duyệt → ghi sổ
```

- **Xếp hạng ở Core, lời văn ở Cell.** Core có công cụ `posting.reason.suggest` tất định (từ khoá, ví dụ, lịch sử đơn vị), chạy được khi không có Cell. Cell thêm LLM để hiểu câu nói tự do, nhưng **chỉ chọn trong danh sách Core trả**: AI không tạo lý do mới, không viết tài khoản.
- Lựa chọn cuối của người dùng ghi vào bằng chứng (`core.posting.reason.chosen`), làm lịch sử cho lần gợi ý sau của chính đơn vị đó. Không chia sẻ chéo đơn vị.
- Điểm thấp (< ngưỡng cấu hình) → Cell hỏi lại bằng `ai.askIf` thay vì đoán.

## 7. Module khai lý do nó cần

Module nộp sự việc khai trong manifest (`bizcity_module@1`, mở rộng tương thích ở Standard 1.1):

```json
"ledger": {
  "submits": [
    { "docType": "customer_payment", "contract": "bizcity_ledger_intake@1",
      "reasons": { "kind": "receipt", "default": "customer_payment", "suggestedPacks": ["bizcity.vn-tt99.nen"] } }
  ]
}
```

Lúc cài module, Core kiểm đơn vị đã có lý do mặc định cho `docType` đó; chưa có → gợi ý gói định khoản thay vì để phiếu đầu tiên lỗi `POSTING_FAILED`.

## 8. Phạm vi theo ngành (thật thà về Kernel hiện tại)

Gói chỉ cấu hình được những gì Kernel đã có luật. Hiện Kernel có 9 `docType` nạp sổ (`sale`, `sale_return`, `purchase`, `purchase_return`, `transfer`, `stock_adjustment`, `cash_transfer`, `customer_payment`, `supplier_payment`) và phiếu thu / chi / kế toán tay theo lý do.

| Gói ngành | Làm được ngay | Cần Kernel thêm (đề xuất năng lực, VERSIONING §5) |
|---|---|---|
| Thương mại, bán lẻ, FnB | đủ | — |
| Dịch vụ | đủ (doanh thu dịch vụ = `sale` dòng không quản kho; chi phí qua phiếu chi) | `ledger.doctype.service_invoice` nếu cần hoá đơn dịch vụ riêng |
| Xuất nhập khẩu | mua / bán, thanh toán | `ledger.fx` (ngoại tệ, chênh lệch tỷ giá), `ledger.doctype.import_duty` (thuế NK, TTĐB, GTGT hàng NK) |
| Sản xuất, nhà máy | mua NVL, bán thành phẩm | `ledger.doctype.production` (xuất NVL 621/622/627 → 154 → nhập thành phẩm 155), tính giá thành |
| Xây dựng | mua, thu tiền | `ledger.doctype.production` theo công trình (154 chi tiết công trình), nghiệm thu |
| Nhân sự, lương, lao động | chi lương qua phiếu chi (lý do CNV01) | `ledger.doctype.payroll` (bảng lương → 334, 338x, 642/641/622) |

Các năng lực trên ghi trong [bizcity-standard.json](../standard/bizcity-standard.json) với trạng thái `planned`. Gói khai `requires.docTypes`; bộ kiểm báo "chưa cài được" thay vì để gói hỏng ngầm.

## 9. Nhật ký thay đổi

| Phiên bản | Ngày | Thay đổi |
|---|---|---|
| 1.0.0-draft | 2026-10-29 | Khởi tạo: khuôn gói, phân tầng, luật cài, gợi ý AI, phạm vi ngành |
