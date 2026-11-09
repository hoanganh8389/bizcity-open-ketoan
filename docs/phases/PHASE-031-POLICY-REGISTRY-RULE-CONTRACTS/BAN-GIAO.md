# PHASE-031 · Bàn giao cho H Joy Võ Việt Hoàng
<!-- [2026-11-09 11:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — bàn giao: chủ dự án giao H Joy Võ Việt Hoàng làm tiếp. Viết cho kỹ sư nhận việc, không phải cho kế toán. -->

> **Cập nhật:** 2026-11-09 · **Người giao:** phiên Claude PHASE-031 (hoanganh8389) theo yêu cầu của chủ dự án · **Người nhận:** H Joy Võ Việt Hoàng
> Đọc trước: [README](README.md) → [00-MASTER-PLAN](00-MASTER-PLAN.md) (§7–§15 là các chữ chốt từng đợt) → [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) (nhật ký cuối tệp). ADR: [ADR-0031](../../adr/ADR-0031-policy-registry-rule-contracts.md).

## 1. Phase này là gì, trong một đoạn

Chính sách nghiệp vụ (khuyến mại, chiết khấu, hạn mức…) do **module chủ** giữ nội dung; **Registry** (`policy_registry`) chỉ giữ *phong bì* bất biến của từng bản (khoá, bản, hiệu lực theo **ngày chứng từ**, băm). Nguồn ngoài (POS, Woo, sàn) lấy chính sách đã phát hành, tính theo **Rule Contract**, gửi `policyRefs` kèm chứng từ. Cửa nạp **kiểm lại mềm** (mặc định chỉ cảnh báo, `strict` mới chờ duyệt). Mọi thiết kế phải thoả ba điều: **nhất quán giữa module · xuyên suốt theo thời gian (mỗi ngày đúng một bản) · truy vết được**, và **gọn** (không bảng thứ hai, không hợp đồng mới nếu nâng minor là đủ).

## 2. Đã xong (đã vào `main`)

| Đợt | Việc | PR | Mã chính |
|---|---|---|---|
| W1 | Phong bì Registry + phiên bản chính sách mua hàng | #152 | `db/migrations/0079`, `packages/platform/src/core/policies.ts` |
| W2a | `policyRefs`, `IN-POL-001..003`, `policy_check`, khung nhìn `policy_application` | #153, #159 | `packages/kernel/.../intake/policy-check.ts`, `0080` |
| W2c | Hàng việc "Chờ kế toán xem" + *Đánh dấu đã xem* | #191 | `0084`, `apps/api/.../system/queue.routes.ts` |
| W3a | API cho nguồn ngoài + Rule Contract `sale.promo.buy_x_get_y@1` | #172 | `apps/api/.../system/policy.routes.ts`, `rule-contracts/` |
| W3b | Sự kiện `bizcity.policy.published` / `.retired` | #196 | `policies.ts` (phát trong giao dịch) |
| W4a | 4 action đọc (registry, applications, tracking, lineage) | #207 | `apps/api/.../system/policy-insight.ts` |
| W4b | Màn *Chính sách* (HT15, 4 tab) | #217 | `apps/web/src/features/policy/` |
| W2b | `IN-POL-004` — cửa nạp tính lại quà theo bản nguồn nêu | #226 | `registerPolicyRecompute` ở `policies.ts`, `rule-contracts/recompute.ts` |

**Đang mở:** **#231 — W4c** (ô *Thực hiện chương trình*, `program[]` ở `core.policy.tracking`). Gate local đã xanh; chờ merge. Sau khi vào `main`: mở PR docs nhả dòng giữ chỗ W4c và đánh dấu S031-30 ✅ (R-FLOW-6).

## 3. Còn lại — thứ tự tôi khuyên

| Việc | Ghi chú | Chặn bởi |
|---|---|---|
| **Q031-7** ngân sách chương trình: tính theo **số lượng** hay **giá trị** quà? | Quyết định rồi mới thêm tham số vào Rule Contract (thêm trường tuỳ chọn = minor) + thanh tiến độ ở khối *Thực hiện chương trình* | chủ dự án / kế toán trưởng |
| **S031-11** Rule Contract `purchase.*@1` bọc `engine.ts` mua hàng | Không đổi kết quả; hồi quy mua hàng. Hôm nay chính sách mua hàng **không tính lại được** ở cửa nạp (nội dung ở module chủ) | — |
| **S031-15** Rule Contract bán hàng còn lại (`price_list`, `promo.discount`, `credit_limit`) | Mở khoá ô *chiết khấu đã cho*; làm cùng `modules/ban-hang` (S030-16) | S031-14 |
| **S031-14** kế toán trưởng xác nhận bảng `reasonCode` (Q031-5) | `treatment.confirmed` đang `false` cho tới khi có | kế toán trưởng |
| **S031-17** Rulepack `policy` cho Conformance Engine | Chỉ đọc; dùng chung `policy_application` — dashboard và Engine **không có hai cách đếm** (D-POL-8) | — |
| **S031-23** làn `policy` của `bizcity_lineage@1` | P2 | — |
| `IN-POL-000` (thiếu tham chiếu), `IN-POL-005` (thiếu dữ liệu gốc) | 000 đã có số ở ô *Độ phủ*; 005 cần module kho | — |
| **S031-16** POS WP | Ở **repo plugin**, dòng CLAIMS riêng: tải chính sách, tính theo Rule Contract (`describe().spec` + `vectors` để tự kiểm), gửi `policyRefs`, nghe sự kiện | — |
| Giá trị hàng tặng ở *Thực hiện chương trình* | Cần giá vốn / giá bán thống nhất (Costing nối sau sổ cái) — hiện "—" | PHASE-025 |
| Nút *Chính sách căn cứ* trên màn truy vết chứng từ hiện có; ô tab Theo dõi bấm sang danh sách sự việc | Đường dẫn sâu `/he-thong/chinh-sach?xem=truy-vet&chung-tu=<docKey>` đã chạy | tệp ngoài phạm vi trước đây |
| S031-7 khoá ngưỡng duyệt; S031-3 (Q031-4, Q031-6) | | nhóm Lõi / DOC-030-4 |

Hàng việc: *Ghi sổ*, *Trả về nguồn*, *Điều chỉnh* của [20 §3](20-TRUY-VET-VA-THEO-DOI.md) **chưa làm** có chủ đích (chế độ mặc định đã ghi sổ ngay; *Trả về nguồn* cần thiết kế `policy.review.rejected`).

## 4. Quy trình bắt buộc (đã vấp nhiều lần — đọc kỹ)

1. **R-FLOW:** dòng giữ chỗ ở `docs/phases/CLAIMS.md` phải nằm trên `origin/main` **trước** khi có commit mã; đụng thứ dùng chung thì thêm PR chốt thiết kế (chỉ tài liệu) trước. Mỗi nhánh một dòng; phạm vi tệp của dòng phải **phủ mọi tệp** bạn đổi và **không chồng** dòng nào đang làm (R-FLOW-3). Đụng tệp của dòng khác (đã gặp: `schema-catalog.ts`, `bizcity-standard.json`) → xin phép chủ dự án + khoản nợ SC-FLOW-1 ở `tests/conformance/baseline.json`, hoặc nhờ phiên kia nhả.
2. **Dòng giữ chỗ của tôi** ("hoanganh8389 (phiên Claude, PHASE-031 policy)") đang ghi tên tôi — **đổi người nhận sang bạn** khi nhận W4c, nhả nó khi xong (R-FLOW-6).
3. **Gate local (CI GitHub đang bị khoá thanh toán, mọi kiểm tra chạy tay):** `node scripts/nhan-viec.mjs kiem` · `node scripts/so-tiep-theo.mjs kiem` · `node tests/conformance/selfcheck.mjs --strict` (**đọc exit code / các dòng ✘, đừng chỉ đọc dòng cuối**) · `bash scripts/kiem-chuan.sh` · `npm run typecheck`. Nối lệnh bằng `&&`, không `;` — tôi đã hai lần đẩy nhánh đỏ vì `;`.
4. **Tệp sinh tự động:** `docs/phases/BANG-VIEC.md` + `bang-viec.json` (`node scripts/bang-viec.mjs --write`; xung đột thì lấy `--theirs` rồi sinh lại), `docs/huong-dan/ma-loi/README.md` (`node scripts/sinh-ma-loi.mjs --write`), `10-DANH-GIA-ADAPT.md` (`node scripts/tru-cot-md.mjs`). Sau mỗi lần gộp `main`, **kiểm lại dòng giữ chỗ của mình** — gộp xung đột của người khác từng làm mất phạm vi.
5. **Test:** CSDL riêng có chữ `test` trong tên: `DATABASE_URL=postgres://ketoan:ketoan@localhost:5434/ketoan_test_<chủ đề> npm test -w @ketoan/api -- <bộ lọc>`; trước đó `npm run build -w @ketoan/contracts` (lỗi kiểu lạ ở `entity-resolver.ts`… thường do `dist` cũ). Dữ liệu dựng bằng **cửa nạp thật** (`POST /api/v1/documents` với `policyRefs`), không chèn tay: sổ đơn vị test phải qua bất biến. **Luôn phá thử** (sửa một chỗ, test phải đỏ): hai lần dữ liệu của tôi quá thuận nên phép phá không bị bắt cho tới khi thêm ca đối xứng.
6. **Nhiều phiên song song / CSDL dùng chung:** xem `docs/phases/CLAIMS.md` trên `origin/main`, không đọc bản trong nhánh. Số migration kế tiếp: `node scripts/so-tiep-theo.mjs migration`; **ai merge sau thì đổi số** (đã có va chạm `0080` / `0083`).
7. **Không bóc chú thích, không xoá bản quyền BizCity Central Brain** khi triển khai.

## 5. Bản đồ mã và hợp đồng

| Cần | Chỗ |
|---|---|
| Phong bì, đăng ký bản, đọc một bản, điểm mở rộng tính lại, phát sự kiện | `packages/platform/src/core/policies.ts` |
| L4b tiền kiểm + cửa nạp (một nguồn luật cho cả hai, R-INTAKE-4), `giftDiff` | `packages/kernel/src/modules/intake/policy-check.ts` |
| Danh mục mã `IN-*` (có `remedy`, căn cứ) | `packages/contracts/src/intake-findings.ts`, `legal-basis.ts`; bài học `docs/huong-dan/loi-dau-vao/IN-POL-00x.md` |
| Rule Contract + dịch vụ API | `apps/api/src/modules/system/rule-contracts/` (`sale-promo-buy-x-get-y.ts`, `policy-service.ts`, `recompute.ts`) |
| Action HTTP | `apps/api/src/modules/system/policy.routes.ts` (9 action) |
| Truy vấn đọc cho màn / dashboard | `apps/api/src/modules/system/policy-insight.ts` |
| Hàng việc "Chờ kế toán xem" | `apps/api/src/modules/system/queue.routes.ts` |
| Màn hình | `apps/web/src/features/policy/`; hướng dẫn người dùng `docs/huong-dan/chinh-sach.md` |
| Hợp đồng | `docs/contracts/BIZCITY-POLICY-v1.md` (1.3.0-draft), `BIZCITY-EVENT-v1.md` §7, `BIZCITY-INTAKE-FINDINGS-v1.md` §3.1, `BIZCITY-LEDGER-INTAKE-v1.md` |
| Test | `apps/api/test/`: `policy-registry`, `policy-api`, `rule-contracts`, `intake-policy-check`, `intake-policy-recompute`, `policy-events`, `policy-review`, `policy-insight`, `mua-hang-chinh-sach-phien-ban` |

## 6. Quyết định kiến trúc cần nhớ (đừng đảo)

- **Một nơi chứa:** module chủ giữ dữ liệu, Registry là bề mặt chung; không bảng thứ hai (D031-11: Registry là năng lực Core/Platform, **không** là module nghiệp vụ).
- **Mặc định cho phép, nhắc khi sai** (R-GATE-9): L4b `advice`; đơn vị tự bật `bizcity.intake.policy_check = strict`. Không có luồng "kế toán trưởng duyệt" (ADR-0020).
- **Kernel không import `apps/api`** và code ngoài Kernel chỉ qua `@bizcity/kernel` (SC-KERNEL-6) → tính lại đi qua `registerPolicyRecompute` ở **platform** (nợ N031-1 đã đóng bằng cách này).
- **Tính theo bản nguồn nêu**, không theo bản hiện hành; quà đếm theo cặp *(khoá, số bản)*.
- **Bất biến:** bản đã phát hành không sửa (trigger); đổi = bản mới, bản trước tự đóng ở ngày áp − 1; `policy_review_acks` chỉ thêm.
- `data` của sự kiện **không** mang nội dung chính sách — nguồn tải lại qua `GET /api/v1/policies` (có `etag`).

## 7. Cạm bẫy đã gặp

- Test `db-rules` đòi mọi bảng mới có mục trong `schema-catalog.ts` (tệp từng thuộc dòng PHASE-026 → xin phép như mục 4.1).
- `SC-DOC-6`: mỗi mục menu web cần `docs/huong-dan/<key>.md`.
- `SC-FIND-1`: mã `IN-*` mới phải có trong trang tra mã (sinh bằng script) và `legal-basis.ts`.
- Phiên bản hợp đồng ở đầu tệp phải khớp `docs/standard/bizcity-standard.json` (SC-CON-4) — tệp đó hay thuộc dòng khác.
- `selfcheck --strict` đỏ **không phải lúc nào cũng do bạn**: so với `origin/main` sạch trước khi sửa (đã gặp `thu-vien`, `db-rules` S004-12 đỏ sẵn).
- Giao diện web **chưa có khung test**; kiểm bằng `typecheck` + `vite build` + chạy thật (API + Vite + Chrome headless với dữ liệu dựng qua cửa nạp). Nếu làm nhiều màn nữa, nên có skill chạy ứng dụng chung (`/run-skill-generator`).
- Đừng dùng lệnh dừng tiến trình hàng loạt theo tên (`taskkill /IM chrome.exe`): có thể đóng luôn trình duyệt của người dùng; dừng theo cổng / PID của chính mình.
