# Khuyến mại bán hàng (màn khai báo) và hạn mức nợ khách (đề xuất Core) — chữ chốt đợt 4 Bán hàng
<!-- [2026-11-14 12:40 AM Võ Hoàng] NGHIEM-THU — chữ chốt đợt 4 Bán hàng: 4a màn Khuyến mại BH18 trong module pos trên API chính sách có sẵn; 4b đề xuất Core khuôn luật hạn mức nợ (phiếu NT-BH-016) (đóng góp) -->

Phiếu nghiệm thu: [NT-BH-016](../nghiem-thu/ban-hang/NT-BH-016-khuyen-mai.md). Thứ tự đợt anh Hoàng duyệt 13/11 (đợt 4: chính sách bán).

## 1. Vấn đề

- Core đã tính khuyến mại cho máy bán (6 khuôn luật `sale.promo.*`, NT-BH-012).
- Khai báo chỉ làm được qua `POST /api/v1/policies`. Màn *Chính sách* (HT, `features/policy`) là sổ đăng ký chung cho mọi phân hệ, không có form theo loại khuyến mại.
- Menu Bán hàng còn hai mục mờ: *Khuyến mại*, *Hạn mức nợ khách*.

## 2. Đợt 4a — màn Khuyến mại (BH18), không đổi Core

**Chỗ đặt:** màn quản trị bán lẻ của module `pos` (`modules/pos/web/screens/`, đường `/app/pos/khuyen-mai`), cạnh BH13–BH17.
- Màn chỉ gọi API công khai của Core; module không thêm bảng, không thêm action phía máy chủ.
- Không làm module mới vì module mới phải thêm mục vào `package-lock.json` (đang chờ người giữ đồng ý).
- Mã màn open-ketoan **BH18**; ánh xạ quyền TGS: *BH17 Quản lý khuyến mãi* (thư viện `docs/standard/phan-quyen`).

**API dùng** (có sẵn):

| Việc | API Core | Quyền |
|---|---|---|
| Danh sách, bản, số chứng từ đã áp | `GET /api/v1/policy-registry` (lọc khuôn `sale.promo.*`) | `catalog:read` |
| Nội dung bản đang hiệu lực (để sửa) | `GET /api/v1/policies` | `catalog:read` |
| Ô của từng loại | `GET /api/v1/rule-contracts/:id` (`describe().params`) | `catalog:read` |
| Thử tính | `POST /api/v1/policies/evaluate` với `policies: [{ key, version }]` hoặc bản nháp chưa phát hành (xem dưới) | `catalog:read` |
| Phát hành / sửa / ngừng | `POST /api/v1/policies` (`key`, `ruleContract`, `params`, `scope.branchCodes`, `effectiveFrom`, `reason`) | `settings:write` |

**Form theo loại** (viết tay theo `describe().params`, không sinh tự động — người kinh doanh đọc được):

| Loại (khuôn) | Ô riêng |
|---|---|
| Giảm theo bậc (`sale.promo.tiered@1`) | nhóm mã hàng; tính bậc theo số lượng / tiền; các bậc: từ … giảm % / giá chương trình |
| Giảm theo tổng đơn / mã giảm giá (`order_discount@1`) | phạm vi mã hàng (trống = cả đơn); bậc: đơn từ … giảm % hoặc tiền, tối đa … |
| Quà theo tổng đơn (`order_gift@1`) | bậc: đơn từ … tặng [mã, SL] |
| Combo (`combo@1`) | các món [mã, SL]; giá bộ / giảm % / giảm tiền |
| Mua bất kỳ tặng món rẻ nhất (`cheapest_free@1`) | nhóm mã; mua N tặng M; lặp lại |
| Mua X tặng Y (`buy_x_get_y@1`) | mua [mã, SL] tặng [mã, SL]; lặp; trần quà / phiếu |

Ô chung:
- từ ngày – đến ngày;
- cửa hàng áp (trống = mọi cửa hàng);
- thứ tự ưu tiên;
- áp riêng;
- điều kiện: thứ, khung giờ, đơn tối thiểu, mã giảm giá, tháng sinh nhật, hạng thành viên;
- trần NĐ81 (mặc định 50 %, bỏ trần phải tích và ghi lý do).

**Thử tính bản nháp:**
- `core.policy.evaluate` chỉ tính chính sách **đã phát hành**.
- Thử trước khi phát hành dùng `GET /api/v1/rule-contracts/:id` → `vectors` để hiện ví dụ mẫu của loại.
- Sau khi phát hành, "Thử tính" gọi `evaluate` với `policies: [{ key, version }]` trên giỏ người dùng nhập.
- Thử tính bản nháp thật cần Core nhận `params` chưa phát hành (đề xuất §4, mục 2).

**Sửa, ngừng:**
- Sửa = phát hành bản mới cùng mã từ ngày chọn (Core tự đóng bản trước ở ngày áp − 1).
- Ngừng = phát hành bản mới với `validTo` = hôm nay (cùng nội dung).
- Không xoá bản đã phát hành (ECP-13).

**Menu / Luồng chi tiết:**
- Mục *Khuyến mại* ở nhóm Bán hàng → Chính sách bán trỏ `/app/pos/khuyen-mai`, hết mờ.
- Ô *Khuyến mại* ở bước Giá & chính sách của Luồng chi tiết mở BH18.

## 3. Hình dạng

```json
POST /api/v1/policies
{ "key": "KM-TET-2026", "ruleContract": "sale.promo.tiered@1",
  "params": { "skus": ["A"], "basis": "qty", "tiers": [{ "min": 3, "pct": 10 }, { "min": 5, "pct": 20 }],
              "validFrom": "2026-01-20", "validTo": "2026-02-10", "priority": 0, "exclusive": false, "legalCapPct": 50 },
  "scope": { "branchCodes": ["CN01", "CN02"] }, "effectiveFrom": "2026-01-20", "reason": "Khuyến mại Tết — mua nhiều giảm nhiều" }
```

Trạng thái ở danh sách (tính ở màn từ bản hiệu lực + `validFrom` / `validTo` trong nội dung):

| Trạng thái | Khi nào |
|---|---|
| sắp chạy | `validFrom` > hôm nay |
| đang chạy | còn trong khoảng |
| đã hết | `validTo` < hôm nay, bản cuối là bản phát hành bình thường |
| đã ngừng | bản cuối có lý do "Ngừng …" |

## 4. Đề xuất Core (bậc 4 — chủ dự án quyết, chưa viết mã)

1. **Tên chính sách.** `core.policy.publish` thêm `title` (chuỗi ≤ 200) lưu theo chính sách; sổ đăng ký trả `title`.
   - Hiện tham số khuyến mại bỏ trường lạ, màn chỉ hiện mã + lý do phát hành.
   - Tạm thời: mã gợi nhớ + tên ở lý do bản 1.
2. **Thử tính bản nháp.** `core.policy.evaluate` nhận `drafts: [{ ruleContract, params }]`. Core tính như bản đã phát hành nhưng không ghi gì, không trả `policyRefs`. Như vậy người khai thử được trước khi phát hành.

## 5. Đợt 4b — hạn mức nợ khách: đề xuất khuôn luật `sale.credit_limit@1` (bậc 4)

**Nghiệp vụ** (dự kiến, chờ phòng kế toán chốt): bán nợ vượt hạn mức của khách thì chặn hoặc cảnh báo theo cài đặt; hạn mức theo khách hoặc theo nhóm khách.

**Đề xuất:**
- Khuôn luật mới trong `apps/api/src/modules/system/rule-contracts/`: `params { limit, basis: 'balance' | 'overdue', action: 'warn' | 'block', partnerCodes? | groupCodes? }`.
- Cửa nạp kiểm khi nhận chứng từ `sale` còn ghi nợ: dư nợ 131 của khách + phần ghi nợ của chứng từ > hạn mức → cảnh báo hoặc chặn (`IN-POL-*` mới).
- Máy bán và phiếu nhập tay gọi `core.policy.evaluate` để báo trước ở màn.

Đụng Kernel (cửa nạp) và hợp đồng chính sách (PHASE-031 của chủ dự án) → chờ chủ dự án duyệt hướng, chưa giữ chỗ code.

## 6. Kiểm bằng gì

- Test thuần màn (`modules/pos/test/`): dựng `params` từ form từng loại khớp `vectors` của khuôn, tính trạng thái danh sách.
- Test tích hợp (`apps/api/test/nt-bh-016-khuyen-mai.test.ts`, đề xuất): phát hành 6 loại qua API như màn gửi, `evaluate` ra đúng §5 NT-BH-016; sửa → bản 2 từ ngày chọn; ngừng → hôm sau không áp.
- Chạy thật trên Docker demo: khai → phát hành → bán ở máy bán thấy giảm; ngừng → không áp.
