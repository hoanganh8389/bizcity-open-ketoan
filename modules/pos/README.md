# Module `pos` — phía máy chủ của máy bán POS

Kế hoạch: `tgs_pos_react/docs/module-pos/` (repo của nhóm POS TGS — quyết định D-MP-*, đề xuất Core P-MP-*, các đợt W1–W4). Phiếu nghiệm thu: [NT-BH-004](../../docs/nghiem-thu/ban-hang/NT-BH-004-pos-don-ban-tai-quay.md). Hợp đồng phía máy: `tgs_pos_react/openapi/pos.yaml`. Máy bán đặt gốc API `/api/v1/m` là gọi đúng các đường dưới.

| Đường | Action | Quyền | Việc |
|---|---|---|---|
| `GET /api/v1/m/pos/bootstrap?branch=` | `pos.bootstrap.get` | `pos:sell` | Chi nhánh, hình thức thanh toán (danh mục của đơn vị), ca theo ngày |
| `POST /api/v1/m/pos/sequences/reserve` | `pos.sequence.reserve` | `pos:sell` | Cấp trước dải số phiếu `HD<yyMM><6 số>` |
| `POST /api/v1/m/pos/orders` | `pos.order.create` | `pos:sell` | Đơn bán → chứng từ `sale` (`ctx.ledger.submit`), cùng giao dịch với đơn |
| `GET /api/v1/m/pos/orders/:id` | `pos.order.get` | `pos:sell` | Bản chụp đơn (theo id đơn, hoặc mã phiếu kèm `branch`) |

**Quyền `pos:sell`** (khai ở `permissions` của manifest, rủi ro thấp): quyền riêng của máy bán — chỉ bốn action trên. Thu ngân đăng nhập bằng vé của hệ thống quản trị (`POST /api/v1/auth/wp-sso`, vé mang `perms: ["pos:sell"]`), không cần `documents:write`: phiên đó không lập / huỷ / ghi sổ được chứng từ khác qua Core. Chủ đơn vị (owner) có sẵn mọi quyền module.

Đợt W1 chỉ nhận đơn tiền mặt / chia tiền (không QR, ghi nợ, đối trừ), giảm giá tay; đơn có CTKM, quà, đổi điểm bị chặn với `details.reason = POS_NOT_SUPPORTED_YET` (D-MP-7).

**Mã số cha – con (D-MP-12).** Mã hàng chỉ còn là số; module xét ô của mặt hàng, không đọc chữ cuối mã (khung nhìn `bizcity_read.products`, cột `variant_code`, `send_to_tax` — migration Core 0102, đề xuất P-MP-6):
- dòng 0đ của mã không gửi thuế (bill Z ở POS đang chạy, vd hàng Nội bộ) → `POS_NOT_SUPPORTED_YET` kèm `info.billZ` (ghi sổ bill Z đi cùng quà);
- hàng Nội bộ máy gửi giá khác 0 → `POS_PRICE_CHANGED`;
- mã không gửi thuế mà thu tiền → bán như dòng thường, đơn trả máy ghi `sendTax = false` (không lên hoá đơn điện tử);
- mọi dòng chứng từ mang `itemId` của mặt hàng.

## Chạy

```bash
npm run module -w @ketoan/api -- migrate pos      # tạo schema mod_pos (orders, code_counters)
npm test -w @bizcity-module/pos                    # test thuần (tính tiền, chứng từ)
cd apps/api && npx vitest run test/nt-bh-004-pos-don-ban.test.ts   # phiếu NT-BH-004 trên CSDL test
npx bizcity module check pos                       # luật module + kế toán + kiểu + test hợp đồng
npx bizcity module accounting-check pos            # AC-1…AC-6; kèm BIZCITY_SERVER + BIZCITY_API_KEY để chạy examples/*.json tới L5
npx bizcity event check modules/pos/examples/sale-tien-mat.json --server <địa chỉ> --key <khoá API "Gửi chứng từ">
```

## Cấu trúc

- `api/domain/` — hàm thuần: khuôn đơn (`schema.ts`), tiền dòng / tách thuế / thanh toán / chứng từ (`order.ts`).
- `api/read.ts` — đọc danh mục qua `bizcity_read.*`; `api/codes.ts` — bộ đếm số phiếu.
- `api/actions/` — bốn action; `migrations/0001_mod_pos.sql`.
- `examples/` — chứng từ `sale` mẫu đúng khuôn module nộp (lấy từ đơn chạy thật, đổi `docKey` / `docNo` sang số mẫu, bỏ `itemId` của CSDL thử): tiền mặt một dòng; khách thành viên, giảm tay, hai thuế suất, chia tiền mặt + chuyển khoản. Qua `event check` L1–L5 trên kế toán Docker.

## Số phiếu: vì sao module tự đếm, chưa dùng `ctx.documents.nextNumber`

Core có năng lực `documents.numbering` (`ctx.documents.nextNumber`, bộ đếm `document_sequences` của Kernel). Module `pos` W1 vẫn đếm ở `mod_pos.code_counters` vì hai điều `nextNumber` chưa đáp ứng:

1. **Khuôn số.** Phiếu bán của chuỗi là `HD` + `yyMM` + 6 số (12 ký tự, theo chi nhánh × tháng, hợp đồng máy bán `maxLength: 12`, cùng khuôn POS đang chạy). `nextNumber` cấp dạng `<tiền tố>-<năm>-<số>`.
2. **Cấp dải trước cho máy mất mạng.** Máy bán xin trước một dải số (`pos.sequence.reserve`) để chốt đơn khi không gọi được máy chủ; số đã cấp mà không dùng thì bỏ (nhảy số chấp nhận). `nextNumber` cấp từng số một.

Bảng đếm chỉ nằm trong schema `mod_pos` (không ghi `document_sequences`, AC-1 đạt). Khi Core hỗ trợ khuôn số theo cấu hình và cấp dải, module chuyển sang `nextNumber` (đề xuất P-MP-8 ở kế hoạch module POS).
