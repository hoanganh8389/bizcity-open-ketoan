# Sổ tay làm việc của nhóm — đọc trước khi làm bất kỳ chức năng nào
<!-- [2026-11-02 11:23 AM Nguyễn Văn Thủy] HUONG-DAN — sổ tay làm việc chung: kiến trúc tóm tắt, chỗ đặt code, quy trình một chức năng, quy ước giao diện, kiểm trước khi bàn giao, câu lệnh giao việc cho AI. -->

> **Dành cho:** mọi người trong nhóm và AI agent (Claude Code, Copilot…) của từng người.
> **Cách dùng:** trước mỗi việc, ném cho agent câu ở [§10](#10-câu-giao-việc-cho-ai-agent). Agent phải đọc hết tệp này và [AGENTS.md](../AGENTS.md) trước khi sửa code.
> Tệp này **tóm tắt và chỉ đường**; luật gốc nằm ở [AGENTS.md](../AGENTS.md), [00-CANON.md](00-CANON.md), `docs/rules/`, `docs/contracts/`. Hai chỗ nói khác nhau thì **luật gốc thắng** — báo người giữ tệp này để sửa.

---

## 1. Hiểu trong 2 phút

Phần mềm có **một lõi kế toán** (Kernel) chỉ làm thật chắc 3 việc: **nhận sự việc → định khoản → ghi sổ**.
Mọi phân hệ khác (mua hàng, bán hàng, kho, quỹ, tài sản, thuế…) là **người gửi sự việc** vào lõi. Không phân hệ nào tự ghi vào sổ cái.

```
Nguồn (POS, kho, hoá đơn, ngân hàng, Excel, phiếu lập tay)
  │
  ▼  01 Thu thập, chuẩn hoá      khuôn chung bizcity_ledger_intake@1 → accounting_events (chống trùng theo doc_key, có phiên bản)
  ▼  02 Kiểm tra nghiệp vụ        kiểm khuôn (zod, packages/contracts), tổng tiền, mã danh mục
  ▼  03 Định khoản               luật posting/rules/* + AccountResolver (tra tài khoản theo cấu hình, KHÔNG viết cứng)
  ▼  04 Ghi sổ (một giao dịch)   ledger.post(): Nợ = Có, kỳ chưa khoá, cấp số bút toán; lỗi ở đâu thì không bước nào được ghi
  ▼  05 Sổ sách, báo cáo          chỉ đọc từ sổ (ledger_*), không tính lại từ phiếu
```

Năm tầng, **tầng trên chỉ gọi tầng dưới**:

| Tầng | Là gì | Ở đâu | Ai sửa |
|---|---|---|---|
| T0 Kernel | cửa nạp sự việc, định khoản, sổ cái, kỳ khoá | `packages/kernel`, `apps/api/src/modules/{documents,posting,ledger,periods}` | **chỉ Nhóm Lõi** |
| T1 Dịch vụ lõi | danh mục, công nợ, kho, thuế, báo cáo, kết nối | `packages/platform`, `apps/api/src/modules/*` | Nhóm Lõi |
| T2 Phân hệ | màn hình, luồng duyệt, bảng nghiệp vụ riêng | `apps/api/src/phan-he/<key>/`, `apps/web/src/phan-he/<key>/` | **nhóm mình làm ở đây** |
| T3 Add-in | tiện ích cắm thêm | `apps/api/src/addins/<id>/` | nhóm mình, Nhóm Lõi rà |
| T4 Plugin ngoài | WordPress POS, app di động… | repo khác, chỉ gọi API | — |

Đọc thêm: [framework/00-TONG-QUAN.md](framework/00-TONG-QUAN.md).

## 2. Bốn câu không thương lượng

1. **Không có sự việc (`accounting_events`) thì không có bút toán.**
2. **Sổ cái chỉ thêm.** Sửa hoặc huỷ = bút toán đảo (ghi số âm). Cơ sở dữ liệu chặn `UPDATE/DELETE` trên `ledger_*`.
3. **Mọi đầu vào tài chính đi một cửa:** `postDocumentIn()` → luật định khoản → `ledgerService.post()`. Phân hệ chỉ gọi Kernel qua **cổng** `@bizcity/kernel` (tệp chuyển tiếp `apps/api/src/kernel/public.ts`).
4. **Không viết số tài khoản trong code.** Nộp `docType` + `reasonCode` + mã danh mục; `AccountResolver` tự tra.

Ví dụ làm đúng: [apps/api/src/phan-he/mua-hang/posting.ts](../apps/api/src/phan-he/mua-hang/posting.ts) — duyệt phiếu mua = dựng chứng từ rồi gọi `postDocumentIn`; bỏ duyệt = huỷ đúng các chứng từ đó (đảo bút toán), không xoá.

## 3. Mười điều cấm (bộ kiểm sẽ báo đỏ)

| # | Không được | Làm thế này |
|---|---|---|
| 1 | Ghi / sửa / xoá thẳng bảng `ledger_*`, `accounting_events*`, `posting_log` | qua `postDocumentIn` / huỷ chứng từ |
| 2 | Viết số tài khoản (`'1561'`, `'3311'`…) trong code định khoản | `reasonCode` + cấu hình định khoản |
| 3 | Import đường con của Kernel (`@bizcity/kernel/modules/...`, `kernel/modules/...`) | chỉ import từ gốc `@bizcity/kernel` |
| 4 | Phân hệ này import phân hệ khác (`phan-he/ban-hang` → `phan-he/kho`) | dùng dịch vụ lõi, action, hoặc sự kiện |
| 5 | Tạo bảng khách hàng, mặt hàng, chi nhánh riêng | dùng danh mục chuẩn (`partners`, `products`, `branches`…) |
| 6 | Sửa migration đã chạy | thêm tệp migration mới số kế tiếp, có `COMMENT ON` |
| 7 | Script "làm sạch" xoá sổ, tắt trigger | huỷ / đảo bằng nghiệp vụ; cần dọn dữ liệu thì hỏi Nhóm Lõi |
| 8 | Bỏ lọc `tenant_id` ở truy vấn | mọi truy vấn lọc theo `auth.tenantId` |
| 9 | `reply.status(...)` tự chế, ném chuỗi lỗi | `Errors.*` (`@bizcity/platform/core/errors`) |
| 10 | Sửa Kernel / `packages/*` / migration trong việc của phân hệ | dừng phần đó, viết đề xuất (§5 bậc 4) |

## 4. Bản đồ thư mục — code đặt ở đâu

```
apps/api/src/phan-he/<key>/      API của phân hệ: routes.ts, service.ts, store.ts, posting.ts, bizcity.module.json
apps/web/src/phan-he/<key>/      màn hình: menu.ts (mã màn MH.., BH.., KHO..), routes.tsx, các thư mục màn
packages/contracts/src/<key>/    khuôn dữ liệu + hàm tính thuần dùng chung API và web (vd mua-hang/engine.ts)
db/migrations/                   thay đổi CSDL (chỉ thêm tệp mới)
docs/huong-dan/<man>.md          hướng dẫn người dùng — hiện ở nút "Hướng dẫn" của màn
docs/nghiep-vu/                  tài liệu nghiệp vụ (tình huống, cách ghi sổ)
docs/nghiem-thu/<phân hệ>/       phiếu nghiệm thu NT-<MÃ>-<số>: mỗi tính năng một phiếu
apps/api/test/                   test tự động (chạy trên CSDL test riêng)
```

Mỗi phân hệ có `bizcity.module.json` khai: dùng năng lực gì của lõi, **sở hữu những bảng nào**. Thêm bảng mới cho phân hệ → khai vào đó.

## 5. Chọn bậc trước khi làm

Chọn bậc **thấp nhất** làm được việc:

| Bậc | Loại việc | Đặt ở | Rủi ro |
|---|---|---|---|
| 1 | giao diện, hướng dẫn, dữ liệu mẫu | `apps/web/src/phan-he/<key>/`, `docs/huong-dan/` | thấp |
| 2 | nghiệp vụ phân hệ (chứng từ, chính sách, báo cáo phân hệ) | `apps/api/src/phan-he/<key>/` | vừa — chạm sổ thì phải có bộ tình huống |
| 3 | add-in, gói định khoản, preset | `apps/api/src/addins/<id>/` | vừa – cao |
| 4 | cần năng lực lõi chưa có | **viết đề xuất**, chưa viết mã ([standard/VERSIONING.md §5](standard/VERSIONING.md)) | — |
| 5 | Kernel, Platform, hợp đồng, migration, bộ kiểm | chỉ Nhóm Lõi | cao |

## 6. Quy trình làm một chức năng (từ A đến Z)

**Bước 1 — Chốt nghiệp vụ trước khi code.**
- Hỏi rõ với kế toán / bộ phận: làm để quản trị cái gì, ai dùng, khi nào dùng.
- Viết **phiếu nghiệm thu** trong [docs/nghiem-thu/](nghiem-thu/README.md) (chép từ `_MAU.md`): tình huống bằng số liệu thật, kết quả mong đợi từng con số, bút toán Nợ / Có, trường hợp lệch chuẩn.
- Phiếu phải ở trạng thái **Đã chốt** (bộ phận sử dụng đồng ý) thì mới code. Phiếu là thước đo duy nhất để nói tính năng "xong".

**Bước 2 — Đồng bộ với `main`** (đúng như [AGENTS.md](../AGENTS.md)):
```bash
git fetch --all --prune
git merge --ff-only origin/main
npm install && npm run build -w @ketoan/contracts && npm run build -w @bizcity/mua-hang-domain
node tests/conformance/selfcheck.mjs      # phải ĐẠT rồi mới sửa tiếp
```

**Bước 3 — Thiết kế dữ liệu.**
- Dùng danh mục chuẩn; cột cho thứ cần lọc / tổng hợp, JSON cho thứ hay đổi.
- Bảng mới: migration mới + khai trong `bizcity.module.json` + `COMMENT ON` từng cột.
- Tiền: `numeric(18,2)` ở CSDL, cộng trừ qua `toCents / fromCents`; thành tiền tròn đồng, đơn giá được có số lẻ.

**Bước 4 — Viết nghiệp vụ.**
- Hàm tính thuần (không I/O) đặt ở `packages/contracts/src/<key>/` để API và màn hình tính **cùng một cách**.
- Ghi sổ: dựng chứng từ theo khuôn → `postDocumentIn` qua cổng Kernel. Huỷ / bỏ duyệt → huỷ chứng từ (đảo), không xoá.
- Mọi khuyến mại / chiết khấu / hạn tính theo **ngày chứng từ** của phiếu, không theo ngày hôm nay.
- Lỗi nghiệp vụ: `Errors.validation / conflict / notFound…` với thông báo tiếng Việt nói rõ phải làm gì.

**Bước 5 — Báo cho phân hệ khác (nếu cần) bằng sự kiện**, không gọi thẳng:
- Phát: `emitEvent(trx, …)` **trong cùng giao dịch** với dữ liệu → vào `event_outbox`.
- Nhận: `defineSubscriber(…)`. Runtime tự giao lại khi lỗi (`event_deliveries`) và tự chống xử lý trùng (`event_consumptions`).
- Khuôn sự kiện: [contracts/BIZCITY-EVENT-v1.md](contracts/BIZCITY-EVENT-v1.md).

**Bước 6 — Làm màn hình** theo quy ước [§7](#7-quy-ước-giao-diện).

**Bước 7 — Test.**
- Test tự động trong `apps/api/test/` khoá **từng con số** của phiếu nghiệm thu (cả bút toán); tên `describe` mở đầu bằng mã phiếu (`NT-MH-001 — …`).
- Ghi **Kết quả chạy** vào phiếu (commit, tệp test, bảng mong đợi ↔ phần mềm, chênh lệch và lý do), chuyển phiếu sang *Chờ nghiệm thu*.
- Thử thêm các trường hợp **lệch chuẩn**: số âm, để trống, sửa sau khi duyệt, ngày chứng từ ở ranh giới chương trình, ĐVT khác, trùng số hoá đơn.
- Không nói "đã test kỹ" khi mới chỉ chạy đúng một bộ số chuẩn.

**Bước 8 — Kiểm trước khi bàn giao** ([§8](#8-kiểm-trước-khi-bàn-giao)), rồi tạo nhánh + PR để Nhóm Lõi rà.

## 7. Quy ước giao diện

Người dùng là kế toán, thu ngân, thủ kho — không phải lập trình viên. Mọi màn phải:

| Quy ước | Cụ thể |
|---|---|
| Tiếng Việt, gọn | chỉ hiện thông tin cần cho việc đang làm; thuật ngữ kế toán quen thuộc |
| Có nút **Hướng dẫn** | mỗi màn một tệp `docs/huong-dan/<man>.md`, mở bằng nút Hướng dẫn (`PageHeader` / `HelpDrawer`) |
| Chú thích rê chuột | mọi cột, ô số, tiêu đề bảng có `title` nói **nghĩa + cách tính** |
| Form không trắng tinh | điền sẵn (ngày hôm nay, chi nhánh đang làm, giá gợi ý…), có mẫu nhanh, hiện rõ thuế suất |
| Chặn số âm | ở cả màn hình và máy chủ (trừ chỗ nghiệp vụ cho phép) |
| Xem trước rồi mới sửa | mở chứng từ ở chế độ xem, bấm **Sửa** mới sửa được (`Modal viewFirst`) |
| Chọn chứng từ bằng hộp tìm | gõ tìm, lọc theo ngày — không dùng ô chọn xổ xuống dài |
| Cột kéo giãn được | bảng dùng `lib/colResize.ts` |
| Xoá vs Huỷ | **danh mục**: xoá được (ghi nhật ký đủ nội dung); **chứng từ**: chỉ **Huỷ** / **Bỏ duyệt**, không xoá cứng |
| Tự động phải có lối tay | mọi thứ phần mềm tự tính đều có chỗ cho người dùng sửa tay / áp lại |
| Không nhắc tên người | không ghi tên người góp ý, tên kế toán trong code, tài liệu, dữ liệu mẫu |

## 8. Kiểm trước khi bàn giao

```bash
node tests/conformance/selfcheck.mjs   # bộ kiểm chuẩn, phải ĐẠT
bash scripts/kiem-chuan.sh             # ranh giới, phải ĐẠT
npm run typecheck                      # 0 lỗi
npm test                               # cần PostgreSQL test riêng, không chạy trên dữ liệu thật
```

Bàn giao kèm:
- danh sách tệp đã sửa;
- tình huống đã chạy và kết quả (con số);
- tệp hướng dẫn đã thêm / sửa;
- nếu lỡ sửa tệp framework (§3 [RULE-SIGNATURE](rules/RULE-SIGNATURE.md)) → phải có dấu thay đổi đúng khuôn, thiếu là **KHÔNG ĐẠT**.

Đổi code X thì phải sửa tài liệu Y: tra bảng §5 trong [00-CANON.md](00-CANON.md).

## 9. Khi có lỗi — tra thế nào

- Mọi lỗi API có **mã tra cứu** (`requestId`, `traceId`) ở khay lỗi trên màn hình → người dùng chỉ cần gửi mã đó.
- Có bật giám sát (`bash scripts/cai-nhanh.sh --giam-sat`) thì xem Grafana:
  - **Đã ghi sổ / Đang chờ / Lỗi / Chờ lâu nhất / Bút toán chưa cân**: sức khoẻ ghi sổ;
  - Tempo theo `traceId`: chứng từ đi qua **phân hệ nào, bước nào**, lỗi ở đâu;
  - Loki: log của đúng yêu cầu đó.
- Phân biệt: `bizcity.outcome = rejected` là **luật chặn đúng** (kỳ khoá, sổ chỉ thêm, không cân) — sửa dữ liệu / cách làm; `error` là **lỗi kỹ thuật** — sửa code.
- Giám sát chỉ để nhìn; sự thật của sổ chỉ nằm ở PostgreSQL (`ledger_*`, `posting_log`, `audit_logs`). Chi tiết: [adr/ADR-0010-opentelemetry-tu-loi.md](adr/ADR-0010-opentelemetry-tu-loi.md).

## 10. Câu giao việc cho AI agent

Dán nguyên khối này đầu mỗi việc, thay phần trong `< >`:

```text
Đọc hết docs/HUONG-DAN-LAM-VIEC.md và AGENTS.md trước khi làm. Tuân thủ tuyệt đối bốn câu không thương lượng và mười điều cấm.
Việc: <mô tả chức năng>
Phân hệ: <mua-hang | ban-hang | kho | quy | ke-toan | tai-san | thue | ...>
Phiếu nghiệm thu (đã chốt): docs/nghiem-thu/<phân hệ>/NT-<MÃ>-<số>-<tên>.md
Yêu cầu:
1. Đồng bộ main, chạy selfcheck trước khi sửa.
2. Chỉ sửa trong phạm vi phân hệ; cần năng lực lõi chưa có thì DỪNG và báo, không sửa Kernel / packages / migration cũ.
3. Ghi sổ chỉ qua postDocumentIn của cổng @bizcity/kernel; không viết số tài khoản; chứng từ chỉ Huỷ / Bỏ duyệt.
4. Màn hình theo §7 (Hướng dẫn, chú thích rê chuột, điền sẵn, xem trước rồi sửa).
5. Viết test khoá đúng từng con số của phiếu nghiệm thu + các trường hợp lệch chuẩn trong phiếu.
6. Chạy đủ 4 lệnh ở §8; ghi "Kết quả chạy" vào phiếu, chuyển phiếu sang "Chờ nghiệm thu"; báo kết quả thật, liệt kê tệp đã sửa.
```

## 11. Đọc thêm khi cần

| Cần | Đọc |
|---|---|
| Viết / tra phiếu nghiệm thu | [nghiem-thu/README.md](nghiem-thu/README.md), mẫu [nghiem-thu/_MAU.md](nghiem-thu/_MAU.md) |
| Kế toán cho lập trình viên (Nợ / Có, bút toán, ghi số âm) | [nghiep-vu/01-ke-toan-cho-lap-trinh-vien.md](nghiep-vu/01-ke-toan-cho-lap-trinh-vien.md) |
| Từng tình huống ghi sổ (bán, hoàn, sửa, huỷ) | [nghiep-vu/06-tinh-huong-ghi-so.md](nghiep-vu/06-tinh-huong-ghi-so.md) |
| Chạy máy dev | [phat-trien.md](phat-trien.md) §1 |
| Viết module mới đúng chuẩn | [standard/README.md](standard/README.md), ví dụ [standard/GOLDEN-CASE-HOP-DONG.md](standard/GOLDEN-CASE-HOP-DONG.md) |
| Luật sổ cái / định khoản / CSDL / bảo mật | `docs/rules/RULE-LEDGER.md`, `RULE-POSTING.md`, `RULE-DATABASE.md`, `RULE-TENANT-SECURITY.md` |
| Sự kiện, outbox | [contracts/BIZCITY-EVENT-v1.md](contracts/BIZCITY-EVENT-v1.md) |
| Plugin, app ngoài | [adr/ADR-0011-plugin-ba-muc-tin-cay.md](adr/ADR-0011-plugin-ba-muc-tin-cay.md) |
| Rà soát PR | [rules/RULE-REVIEW.md](rules/RULE-REVIEW.md) |
