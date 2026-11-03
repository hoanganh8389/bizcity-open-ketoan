# Chuyển `phan-he/` sang `modules/` — hướng dẫn cho người đóng góp
<!-- [2026-11-03 11:45 PM Johnny Chu - Chu Hoàng Anh] ADR-0024 — hướng dẫn người đóng góp: phân hệ nghiệp vụ nằm ở modules/<key>/, phan-he/ đóng băng, chuyển theo đợt -->

> **Thông báo cho Nguyễn Văn Thủy (thuy2k), anh em dev và cộng đồng developer.**
> Đây là **yêu cầu kiến trúc của chủ dự án Johnny Chu – Chu Hoàng Anh** ([ADR-0024](../adr/ADR-0024-phan-he-nam-o-modules-phan-he-dong-bang.md)), không phải gợi ý: **phân hệ nghiệp vụ nằm ở `modules/<key>/`; thư mục `apps/*/src/phan-he/` đóng băng và sẽ được chuyển hết theo từng đợt.**
> Trợ lý AI (Claude Code, Copilot, Codex, Cursor…) đọc [AGENTS.md](../../AGENTS.md) sẽ thấy cùng yêu cầu này; PR mới thêm mã vào `phan-he/` sẽ bị yêu cầu làm lại.

## 1. Từ hôm nay: làm gì, không làm gì

| Làm | Không làm |
|---|---|
| Phân hệ / add-in **mới**: tạo bằng `npx bizcity module new <key> --label "Tên"`, mã ở `modules/<key>/` | Tạo thư mục phân hệ mới dưới `apps/api/src/phan-he/` hoặc `apps/web/src/phan-he/` |
| Chức năng **mới và độc lập** (kể cả của phân hệ cũ) → làm thành module mới | Nhét chức năng mới, độc lập vào phân hệ cũ vì "gần code sẵn" |
| Sửa lỗi, mở rộng vừa phải phân hệ cũ **tại chỗ** cho tới đợt chuyển của nó | Viết lại cả phân hệ cũ thành module trong một PR lớn (nhánh dài, xung đột) |
| Viết phần mới trong phân hệ cũ theo kiểu **"sạch SDK"** (§3) để chuyển rẻ | Thêm import trực tiếp `db/client`, `kysely`, nội bộ `core/*` rải khắp code nghiệp vụ mới |
| Logic thuần (tính toán, không đụng CSDL) đặt ở `modules/<key>/domain` | Để logic tính toán lẫn trong route / repository |
| Giữ chỗ vào [CLAIMS.md](../phases/CLAIMS.md) **trước khi code** một đợt chuyển ([R-FLOW](../rules/RULE-FLOW.md)) | Tự chuyển một phân hệ khi chưa giữ chỗ và chưa có chữ chốt của đợt |

## 2. Tôi cần thêm … thì đặt ở đâu?

| Việc | Đặt ở |
|---|---|
| Phân hệ nghiệp vụ mới (CRM, nhân sự, sản xuất…) | `modules/<key>/` (API + web + migration + `bizcity.module.json`) |
| Add-in tiện ích mới | `modules/<key>/` với `kind: addin` nếu cần màn / quyền; add-in nhỏ không luồng nghiệp vụ vẫn theo [add-in.md](../add-in.md) cho tới khi có chỉ dẫn khác |
| Tính năng mới, **độc lập**, đi kèm Mua hàng / Kế toán… | module mới ở `modules/<key>/`, nói chuyện với phân hệ cũ qua action / sự kiện / cổng (không import) |
| Tính năng mới, **phải dùng chung bảng** với phân hệ cũ | trong `phan-he/<key>/` theo §3, ghi vào checklist đợt chuyển của phân hệ đó |
| Sửa lỗi phân hệ cũ | tại chỗ, PR nhỏ |
| Logic thuần dùng chung API + web | `modules/<key>/domain` (gói mã thuần, ví dụ `@bizcity/mua-hang-domain`) |
| Màn hình mới của phân hệ cũ | `apps/web/src/phan-he/<key>/`, chỉ dùng `@bizcity/ui-kit` cho thành phần giao diện |
| Thứ Core chưa có (hook, slot, năng lực) | **đề xuất bậc 4** ([VERSIONING §5](VERSIONING.md)), không vá Kernel trong PR phân hệ |

## 3. "Sạch SDK": viết phần mới trong phân hệ cũ sao cho chuyển rẻ

Mục tiêu: lúc chuyển chỉ phải đổi **một chỗ** thay vì sửa hàng trăm dòng. Hôm nay `mua-hang` có **106** vi phạm chuẩn module ở API; đợt chuyển sẽ nhẹ đi theo từng PR "sạch".

**API**
1. Mọi thao tác ghi qua `defineAction` (đã bắt buộc: SC-ACT-1 chặn). Quyền `<key>:read` / `<key>:write`, `Idempotency-Key` khi thao tác không tự nhiên idempotent.
2. Truy cập CSDL **gom vào một tệp** (repository), qua `ctx.data.tx` trong handler. Không rải `import { db } from '../../db/client.js'` và `kysely` khắp route / service. Khi chuyển, tệp đó đổi sang `ctx.data.module(...)` một lần.
3. Đọc sổ qua `ctx.ledger.query`; nộp chứng từ qua `ctx.ledger.submit` kèm `reasonCode`. Không gọi `ledgerService`, không ghi bảng nhân ([bốn câu không thương lượng](../../AGENTS.md)).
4. Phụ thuộc vào Core qua **một tệp cổng** (`ports.ts`) thay vì import rải rác từ `@bizcity/platform/*`, `core/*`.
5. Không import phân hệ khác. Cần dữ liệu của phân hệ khác → action / sự kiện / cổng do phía dùng khai.
6. Bảng mới có tiền tố `<key>_`, có `tenant_id`, `COMMENT ON`, tiền `numeric(18,2)`; viết migration sao cho chuyển sang schema `mod_<key>` không phải đổi tên cột.

**Web**
1. Thành phần giao diện từ `@bizcity/ui-kit`; không import `@/features/*` của phân hệ khác.
2. Màn có menu, route và hướng dẫn (`docs/huong-dan/<helpKey>.md`) khai ở manifest của phân hệ.

**Cả hai**: tên mới theo [04-DAT-TEN-BIZCITY](../framework/04-DAT-TEN-BIZCITY.md); không câu chữ tự do với thông báo của Core (dùng mã trong thư viện mã, [R-GATE-10](../rules/RULE-GATE.md)); ai được làm gì do **quyền**, không do tên chức danh ([ADR-0020](../adr/ADR-0020-ton-chi-core-nguoi-dung-quyet-dinh-mot-ngon-ngu-ma.md) §5).

## 4. Tạo một module mới, từng bước

```bash
node scripts/nhan-viec.mjs                       # Bước 0 (R-FLOW): xem ai đang làm gì
npx bizcity module new nhan-su --label "Nhân sự" # khung từ templates/starter-module
# sửa modules/nhan-su/{bizcity.module.json, api/, web/, migrations/}; đọc modules/nhan-su/AGENTS.md
npx bizcity module check nhan-su                 # phải ĐẠT (selfcheck --module, typecheck, test hợp đồng)
```

Module tự nạp: API ở `/api/v1/m/<key>/…`, web ở `/app/<key>/…`, dữ liệu ở schema `mod_<key>` (vai trò CSDL `mod_<key>_rw` không đụng được bảng Kernel). Tiêu chuẩn đầy đủ: [README Standard v1](README.md), [BIZCITY-MODULE-v1](../contracts/BIZCITY-MODULE-v1.md), ví dụ [GOLDEN-CASE-HOP-DONG](GOLDEN-CASE-HOP-DONG.md).

## 5. Lộ trình các đợt chuyển (đề xuất trong ADR-0024; chủ dự án có thể đổi)

| Đợt | Phân hệ | Quy mô hôm nay (API / web, dòng) | Ghi chú |
|---|---|---|---|
| 1 | `quy` | 323 / 349 | thử đường đầu tiên; đã có 11 action |
| 2 | `tai-san`, `kho`, `ban-hang` | 9 · 95 · 86 / 1 613 · 1 141 · 720 | mã miền nằm ở `apps/api/src/modules/*`: phân định "lõi hay của phân hệ" là bước 0 |
| 3 | `thue` | 1 278 / 1 875 | đã có 10 action |
| 4 | `ke-toan` | 3 825 / 6 962 | báo cáo đọc sổ qua `ledger.query` |
| 5 | `mua-hang` | 5 383 / 10 852 | lớn nhất, đang phát triển tích cực: chuyển sau cùng |
| 6 | giao diện lõi (`he-thong`, `api`, `danh-muc`, `dev`) | — | ở lại ứng dụng; đổi tên theo câu hỏi mở Q1 của ADR |

**Cách nhận một đợt:** `node scripts/nhan-viec.mjs` → mở PR **chỉ tài liệu** thêm dòng vào `CLAIMS.md` và chữ chốt đợt (phạm vi, phân định lõi / phân hệ, tương thích đường dẫn và dữ liệu, cách kiểm trước / sau) → chờ merge vào `main` → nhánh code ngắn (≤ 1 ngày, ≤ ~10 commit) → PR cuối xoá thư mục cũ.

## 6. Gửi riêng Nguyễn Văn Thủy (thuy2k) — phân hệ Mua hàng

Cảm ơn anh đã dựng cả phân hệ Mua hàng (22 tệp API, 68 tệp web) và bộ 25 trường hợp kiểm — đó là bài kiểm đúng-sai kế toán tốt nhất repo đang có. Về yêu cầu mới:

1. **Anh không phải dừng làm tính năng và không phải chuyển ngay.** Mua hàng là đợt 5 (cuối) vì lớn nhất và đang chạy; chuyển sớm sẽ gây xung đột với việc anh đang làm.
2. **Từ nay**: không tạo thư mục phân hệ mới trong `phan-he/`; chức năng mới, độc lập → module mới ở `modules/`; phần mới trong `phan-he/mua-hang/` viết "sạch SDK" (§3). Logic thuần đặt ở `modules/mua-hang/domain` (đã có `@bizcity/mua-hang-domain`).
3. **Việc chuẩn bị anh làm được ngay, không cần chờ ai** (PR nhỏ, trong `phan-he/mua-hang/`): gom truy cập CSDL vào repository; gom phụ thuộc Core vào `ports.ts`; chuyển logic tính toán thuần sang `domain`; mỗi PR giảm số vi phạm `selfcheck --module apps/api/src/phan-he/mua-hang` (hôm nay 106).
4. **Bộ nạp 25 trường hợp** (`scripts/mua-hang/nap-25-truong-hop.mjs`) sẽ là bài kiểm trước / sau đợt chuyển. Hôm nay nó cần: gửi `Idempotency-Key` cho các lệnh ghi và tự khai nhãn / nhóm trong danh mục (đang phải chuẩn bị tay). Sửa phần này sớm giúp mọi người; mốc cần giữ: **116/119 sau từng case, 113/119 khi xong, Nợ = Có = 4.774.840.842**.
5. **Khi đến đợt 5** anh là người giữ chỗ và cùng Nhóm Lõi chốt đợt; Nhóm Lõi rà theo [R-REV](../rules/RULE-REVIEW.md).
6. Có thắc mắc về yêu cầu này: hỏi trong PR / issue; thay đổi **thứ tự đợt** do chủ dự án quyết ([ADR-0024](../adr/ADR-0024-phan-he-nam-o-modules-phan-he-dong-bang.md), Q2).

## 7. Hỏi đáp

**Vì sao không chỉ đổi tên thư mục?** Vì thư mục chỉ là vỏ: chuẩn module đòi manifest, chỉ dùng SDK, dữ liệu ở schema riêng, quyền riêng. Đổi tên mà không đạt các điều này không thêm giá trị và làm gãy `selfcheck`.

**Chuyển có làm hỏng API và dữ liệu đang chạy không?** Không được phép. Mỗi đợt phải nêu trong chữ chốt cách giữ tương thích đường dẫn và cách chuyển dữ liệu không mất; sổ kế toán không bị đụng ([AP-1..AP-7](../CONG-BO-KIEN-TRUC.md)).

**Tôi vibe-code bằng AI, AI vẫn thêm vào `phan-he/`?** `AGENTS.md` ở gốc repo đã ghi yêu cầu này; hãy để trợ lý đọc nó trước (hoặc dán mục "Yêu cầu kiến trúc" vào lời nhắc). Khi rà soát ([R-REV](../rules/RULE-REVIEW.md)), PR thêm mã phân hệ mới vào `phan-he/` sẽ bị yêu cầu làm lại; phép kiểm tự động SC-MOD-4 đang được đề xuất ở ADR-0024 §7.

**PR đang mở của tôi thêm vào `phan-he/` thì sao?** Giữ nguyên nếu là sửa lỗi hoặc mở rộng phân hệ cũ; nếu là phân hệ / chức năng mới độc lập, chuyển sang `modules/<key>/` trước khi merge. Không rebase nhánh đã đẩy ([R-FLOW-5](../rules/RULE-FLOW.md)): tạo nhánh mới từ `main` và cherry-pick.

**Phân hệ của tôi nằm ngoài repo này (plugin WordPress, POS)?** Không thuộc yêu cầu này: plugin ngoài vẫn gửi chứng từ qua cửa nạp ([03-MO-RONG §4](../framework/03-MO-RONG.md)); muốn có khoá và webhook riêng thì dùng app ngoài tiến trình (`kind: "app"`, [BIZCITY-MODULE-v1 §3a](../contracts/BIZCITY-MODULE-v1.md)).

## 8. Trước khi gửi PR

```bash
node scripts/nhan-viec.mjs kiem                       # R-FLOW: giữ chỗ, phạm vi, nhánh ngắn, đã gộp main
node tests/conformance/selfcheck.mjs --strict        # ĐẠT
npx bizcity module check <key>                       # với module ở modules/<key>/
npm run typecheck && npm test                        # test cần PostgreSQL (CSDL riêng, tên có "test")
```
