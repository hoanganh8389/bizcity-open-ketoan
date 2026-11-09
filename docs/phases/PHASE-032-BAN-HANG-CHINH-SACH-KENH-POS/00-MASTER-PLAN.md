# PHASE-032 · 00 — Master plan
<!-- [2026-11-09 10:38 AM Johnny Chu - Chu Hoàng Anh] PHASE-032 — chỉ đạo: giao Võ Hoàng (nhóm POS TGS) mở phase phần UI / UX, luồng, xử lý chi tiết của chính sách bán hàng trên nền PHASE-031; quy trình pull → phân tích → phase → bản mẫu duyệt → checklist → code trên nhánh PR (chưa duyệt nội dung) -->
<!-- [2026-11-09 09:30 PM Võ Hoàng] PHASE-032 — vì sao, hiện trạng, nguyên tắc, D032-* đề xuất, Q032-*, đợt W0–W4, đề xuất Core P032-* (đóng góp) -->

<!-- [2026-11-09 11:15 PM Võ Hoàng] PHASE-032 — Q032-6 chốt (quà theo Core: XTA1.4); thêm đề xuất trả lời Q032-1..4; áp sổ tay HUONG-DAN-LAM-VIEC (phiếu nghiệm thu trước khi code, quy ước giao diện §7) (đóng góp) -->
<!-- [2026-11-10 09:00 AM Võ Hoàng] PHASE-032 — chốt W0: D032-1..7 và Q032-1..4 theo phương án ở 00 §5 (khoá module chinh-sach-ban); tài liệu viết thuần nghiệp vụ (đóng góp) -->

## 1. Vì sao

PHASE-031 đã có nền: sổ đăng ký (phong bì có phiên bản, băm), Rule Contract mẫu `sale.promo.buy_x_get_y@1`, API cho nguồn ngoài (`GET /api/v1/policies`, `POST /api/v1/policies/evaluate`, `POST /api/v1/policies`), cửa nạp nhận và kiểm `policyRefs` (IN-POL-001..003), hàng việc *Chờ kế toán xem*, màn *Chính sách* chỉ xem (HT15). Còn thiếu đúng phần người dùng chạm vào:

1. **Không có chỗ soạn CTKM.** Phát hành hôm nay chỉ bằng gọi API với JSON tay. Nhân viên kinh doanh / kế toán không làm được.
2. **Mới một loại khuyến mại** (mua X tặng Y). CTKM TGS đang chạy phần lớn là giảm giá (% / số tiền, theo dòng / theo đơn) và giá theo bảng — chưa có Rule Contract.
3. **POS chưa nối.** Plugin `tgs_selling_policy` (WordPress multisite TGS) vẫn tự giữ luật; POS React tính bằng engine riêng. S031-16 chưa ai nhận.
4. **CTKM đang chạy chưa có đường sang Registry**: cần chuyển một lần, giữ lịch sử, không làm đứt đơn đang bán.

## 2. Hiện trạng đọc mã (origin/main `0bef7c87`, 2026-11-09)

| Sự thật | Chỗ |
|---|---|
| Phát hành inline: kiểm mã, Rule Contract, zod, `publishChecks`, áp lùi cần lý do; miền `sale` → chủ `ban-hang` | `apps/api/src/modules/system/rule-contracts/policy-service.ts` (`publishPolicy`, `OWNER_OF_DOMAIN`) |
| `evaluate` chỉ tính chính sách **đã phát hành**, dòng vào chỉ có `sku / qty / itemId` (không giá) → chỉ tính được quà | `policy-service.ts` (`EvalLine`, `evaluatePolicies`) |
| Danh sách Rule Contract là mảng cố định trong `modules/system` — module khác chưa đăng ký thêm được (nợ N031-1) | `apps/api/src/modules/system/rule-contracts/index.ts` |
| Không có action ngừng (retire) chính sách inline; chỉ mua hàng xoá → `retired` | `policy.routes.ts` (9 action, không có retire) |
| Phân hệ bán hàng cũ ở `apps/*/src/phan-he/ban-hang` (khách, phiếu bán, báo cáo), manifest khoá `ban-hang` | `apps/api/src/phan-he/ban-hang/bizcity.module.json` |
| `modules/ban-hang` chưa có (S030-16 ☐); bộ nạp dừng khi khoá module trùng phân hệ (`apps/api/src/core/sdk-modules.ts` dòng 14) | `modules/` chỉ có `mua-hang`, `phan-quyen`, `thu-vien` |
| Màn *Chính sách* HT15: xem, theo dõi, truy vết, *Chờ kế toán xem*; không nút sửa (chủ ý) | PHASE-031 · 00 §13 |
| Plugin TGS đã có phần cầu: sổ phiên bản CTKM phía WP (`sha256`, không hở bản), `pos-policies` mang `policyKey / policyVersion / contentHash / ruleContract`; POS React gửi `policyRefs` | repo `tgs_selling_policy` nhánh `policy-registry`, `tgs_pos_react` nhánh `policy-refs` (ngoài repo này) |

## 3. Nguyên tắc

1. **Module giữ nội dung, Registry giữ phong bì** (D031). Màn của phase này chỉ gọi API Core; không bảng chính sách song song.
2. **Không sửa sự thật kế toán:** Rule Contract chỉ chỉ `reasonCode`; định khoản ở Kernel. Không số tài khoản trong module.
3. **Một hàm tính**: màn *Thử tính*, POS trực tuyến, cửa nạp (W2b) cùng chạy Rule Contract; POS ngoại tuyến chạy bản viết lại kiểm bằng `describe().vectors`.
4. **Hiệu lực ngay, có vết**: phát hành là một bước (giữ ý người giữ `tgs_selling_policy`); mọi bản bất biến, ngừng = bản `retired`, không xoá.
5. **Tránh chồng việc** (R-FLOW): không đụng tệp đang có dòng giữ chỗ; thứ dùng chung thì PR chốt thiết kế trước.

## 4. Quyết định (D032-*, chốt 2026-11-09)

| Mã | Đề xuất |
|---|---|
| D032-1 | Màn sở hữu chính sách bán ở `modules/chinh-sach-ban/web` (route `/app/chinh-sach-ban/…`); HT15 giữ vai xem chung. Nút *Mở ở module chủ* từ HT15 sang màn này |
| D032-2 | Module `chinh-sach-ban` **chỉ** gồm chính sách bán hàng, gộp vào `ban-hang` ở đợt chuyển phân hệ bán hàng (ADR-0024); không chuyển phiếu bán / khách / báo cáo của `phan-he/ban-hang` (việc đó là đợt chuyển riêng theo ADR-0024 §3) |
| D032-3 | Form soạn **sinh từ `describe().params`** của Rule Contract (một form chung + phần riêng từng loại khi cần), để Rule Contract mới không cần màn mới |
| D032-4 | Bản nháp lưu ở bảng của module (`mod_chinh_sach_ban_drafts`, migration của module) — chỉ để soạn dở / chia sẻ; **không** là bước duyệt. Phát hành = gọi `core.policy.publish` |
| D032-5 | CTKM TGS ánh xạ: loại 1, 5, 10 → `sale.promo.discount@1`; 2 → `sale.promo.buy_x_get_y@1`; loại còn lại giữ ở plugin, chưa vào Registry (không dùng `custom@1` để phát hành) cho tới khi có Rule Contract |
| D032-6 | POS lấy chính sách theo `GET /api/v1/policies?at&branch&channel=pos` + `etag`; nghe `policy.published` / `.retired` khi có kênh đẩy; tính bằng bản viết lại (TS dùng chung cho POS React, PHP cho plugin) đạt 100 % vectors |
| D032-7 | Chuyển CTKM đang chạy: script một lần đọc sổ phiên bản phía WP, phát hành bản hiện hành vào Registry (`effectiveFrom` = ngày chuyển, `reason` ghi nguồn), lưu bảng ánh xạ `policyKey` WP ↔ Registry; sau ngày chuyển plugin chỉ đọc |

## 5. Câu hỏi (Q032-*)

| Mã | Hỏi | Ai trả |
|---|---|---|
| Q032-1 | `modules/ban-hang` trùng khoá `ban-hang` với manifest phân hệ cũ — bộ nạp **dừng khi khoá trùng phân hệ** (`apps/api/src/core/sdk-modules.ts` dòng 14) nên không đặt được hai manifest cùng khoá, hay đợt 1 dùng khoá khác (vd `ban-hang-chinh-sach`) rồi gộp ở đợt chuyển? | ✅ chốt, xem dưới |
| Q032-2 | Rule Contract bán hàng mới đặt ở đâu: chờ N031-1 dời xuống Platform rồi thêm vào đó, hay mở điểm đăng ký `registerRuleContract` để module tự khai (P032-1)? | ✅ chốt, xem dưới |
| Q032-3 | `sale.promo.discount@1` cần giá dòng: mở rộng `EvalLine` thêm `unitPrice` (đã gồm thuế hay chưa?) và kết quả `discounts[]` (P032-2) — chốt khuôn | ✅ chốt, xem dưới |
| Q032-4 | Nhiều CTKM cùng áp một dòng: giữ "cộng dồn độc lập" như W3a hay thêm `exclusive` / `priority` ngay đợt này? POS TGS hiện chọn CTKM tốt nhất mỗi dòng | ✅ chốt, xem dưới |
| Q032-5 | Trần NĐ81 (quà ≤ 50 % giá) chặn hay cảnh báo trên màn phát hành, khi S030-35 chưa có | Kế toán trưởng |
| Q032-6 | ~~`reasonCode` cho quà: XQUA hay XTA1.4~~ — **chốt 2026-11-09: làm giống Core**, quà dùng `XTA1.4` như `sale.promo.buy_x_get_y@1` đang trả; không thêm mã riêng. `treatment.confirmed` vẫn chờ kế toán trưởng xác nhận cả bảng (S031-14) | ✅ |

### Trả lời (chốt 2026-11-09)

| Câu | Đề xuất | Vì sao |
|---|---|---|
| Q032-1 | Đợt 1 dùng khoá **`chinh-sach-ban`** (nhãn "Chính sách bán hàng"), gộp vào `ban-hang` ở đợt chuyển phân hệ bán hàng. Chủ sở hữu trong sổ đăng ký vẫn là `ban-hang` (`OWNER_OF_DOMAIN`), nên `policyId` không đổi khi gộp | Không đụng phân hệ cũ, không phải chờ đợt chuyển cả `ban-hang`; bộ nạp không cho trùng khoá |
| Q032-2 | Dời khuôn Rule Contract xuống Platform kèm `registerRuleContract` (P032-1, trùng nợ N031-1 của PHASE-031) **trong hoặc ngay sau W2b**. `sale.promo.discount@1` (hàm thuần + vectors) viết ở `modules/chinh-sach-ban/domain`, module tự đăng ký. Trước khi có P032-1, W1 chỉ dùng `sale.promo.buy_x_get_y@1` sẵn có | W2b cũng cần Kernel gọi được Rule Contract — một lần dời dùng cho cả hai; module không sửa `modules/system` |
| Q032-3 | `evaluate` nhận `lines[].unitPrice` **trước thuế**, kết quả `discounts[].amount` **trước thuế** — đúng nghĩa `lines[].discount` / `amountBeforeTax` của khuôn nạp `sale` (docs/api/02) | Cửa nạp (W2b) so được thẳng với dòng nguồn gửi, không quy đổi thuế. POS giá gồm thuế tự quy về trước thuế (POS TGS đã làm vậy khi ghi bản sao) |
| Q032-4 | Thêm vào phong bì / params: `stacking: 'stack' \| 'exclusive'` (mặc định `stack` = như W3a) và `priority`. Các chính sách `exclusive` cùng chạm một dòng → lấy **mức có lợi nhất cho khách**, hoà thì theo `priority`. Làm ngay ở W2 | POS TGS đang chọn CTKM tốt nhất mỗi dòng; Core cộng dồn thì mọi đơn có 2 CTKM sẽ lệch (IN-POL-004 khi W2b chạy) |

## 6. Các đợt

| Đợt | Mức | Nội dung | Phụ thuộc |
|---|---|---|---|
| **W0** | — | Tài liệu này + bản mẫu 4 màn; chốt D032-\*, Q032-1..4, Q032-6 | ✅ 2026-11-09 |
| **W1** | K0 | Khung `modules/chinh-sach-ban` (manifest, menu), màn *Chương trình KM* (danh sách, lọc, xem bản) + *Soạn & phát hành* cho `buy_x_get_y@1` (đã có), bản nháp; thử tính bằng `evaluate` sau phát hành | W0; NT-BH-001 *Đã chốt* |
| **W2** | K1 qua đề xuất | P032-1..4 (Core làm / giao); `sale.promo.discount@1` + vectors; *Thử tính* bản nháp; *Ngừng*; *So sánh bản* | P032-1..3; S031-14 cho `treatment.confirmed` |
| **W3** | K0 | Kênh POS: bản viết lại TS + PHP đạt vectors; POS React / `tgs_selling_policy` đọc từ Core; gửi `sale` / `sale_return` kèm `policyRefs`; màn *Kênh POS* (đơn vào, lệch IN-POL, độ trễ bản) | W2; W2b của 031 cho IN-POL-004 |
| **W4** | K0 | Chuyển CTKM đang chạy (D032-7), chạy song song một tuần so kết quả, tắt luật riêng của plugin (đóng S031-16) | W3 |

## 7. Đề xuất Core (P032-*, bậc 4 — chưa viết mã)

| Mã | Đề xuất | Vì sao module không tự làm |
|---|---|---|
| P032-1 | Điểm đăng ký Rule Contract (`registerRuleContract(contract)` ở Platform) để module khai Rule Contract của mình; danh sách `GET /api/v1/rule-contracts` gộp | Danh sách đang là mảng cố định trong `modules/system`, đang thuộc dòng W2b |
| P032-2 | `evaluate` nhận `lines[].unitPrice` (và `lineAmount`), kết quả có `discounts[] { lineKey, amount, policyRef }` bên cạnh `gifts[]` | Khuôn hợp đồng `bizcity_policy@1` |
| P032-3 | `POST /api/v1/policies/evaluate` nhận `draft: { ruleContract, params }` để thử tính khi chưa phát hành (không ghi gì) | Cùng tệp `policy-service.ts` |
| P032-4 | `core.policy.retire` cho chính sách inline: đóng bản hiện hành tại ngày (bản `retired`, có lý do), phát `policy.retired` | Sổ đăng ký thuộc Platform |
