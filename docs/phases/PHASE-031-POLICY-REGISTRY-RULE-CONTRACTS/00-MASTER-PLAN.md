# PHASE-031 · 00 — Master plan
<!-- [2026-11-06 09:47 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — vì sao, D031-1..10 (ánh xạ D-POL-1..10 của ADR-0031), Q031-1..6, đợt W0–W4, ai làm gì -->

## 1. Vì sao

ADR-0029 nói *linh hoạt trước khi ghi sổ* và đặt tầng ① là chính sách nghiệp vụ, nhưng tầng đó chưa có chủ và chưa có hình (rà mã: [README · Hiện trạng](README.md#hiện-trạng-đọc-mã-originmain-c8afd39-2026-11-06)):

1. **Mua hàng có engine tốt nhưng không có lịch sử luật.** Chính sách sửa đè; chứng từ cũ chỉ trỏ theo mã, nên không trả lời được *"phiếu tháng 9 áp bản nào của chiết khấu NCC X"*. `data.frozen` giữ được **số**, không giữ được **luật**.
2. **Bán hàng không có luật nào ở Core.** POS / Woo tự tính khuyến mại, Kernel nhận dòng `isGift` giá 0 mà không biết căn cứ. Mỗi kênh một bộ luật.
3. **Không tầng nào kiểm "đúng chính sách chưa".** Conformance Engine tư vấn cấp đơn vị theo luật pháp; tiền kiểm L1–L5 kiểm khuôn, số học, dữ liệu gốc, nghiệp vụ chung, chạy thử định khoản. Chính sách nghiệp vụ nằm ngoài cả hai.
4. **Trụ cột 05 mới có nửa *Configuration*.**

## 2. Nguyên tắc (chủ dự án, 06/11)

- Chính sách **quản trị tập trung** ở module nghiệp vụ (Mua hàng, Bán hàng, Nhân sự…), xoay quanh lõi kế toán.
- **Không bắt buộc tính toán tập trung**: plugin tính theo bản đã phát hành.
- Plugin gửi sự kiện về theo luồng **event driven**; cửa nạp **kiểm lại** rồi ghi sổ.
- Xử lý **mềm**: giúp kế toán đánh giá sự kiện đã ổn chưa; gợi ý hay tự động đều được.
- Conformance Engine hiện có **không** biến thành nơi chặn giao dịch hay tự ghi sổ.
- **Không hai kho chính sách**: module sở hữu dữ liệu, Registry là bề mặt chung.

## 3. Quyết định (D031-*, chờ chủ dự án duyệt)

Chi tiết và lý do ở [ADR-0031](../../adr/ADR-0031-policy-registry-rule-contracts.md); thiết kế ở [10](10-THIET-KE.md).

| Mã | ADR | Tóm tắt |
|---|---|---|
| D031-1 | D-POL-1 | Quản trị tập trung, tính phân tán, kiểm chứng tại cửa nạp |
| D031-2 | D-POL-2 | Module giữ nội dung, Registry giữ phong bì (`store: module · settings · inline`) |
| D031-3 | D-POL-3 | Rule Contract = lược đồ tham số + hàm tính tất định + phép kiểm `POL-*` + `reasonCode`; tách từ engine mua hàng |
| D031-4 | D-POL-4 | `draft → published → retired`; bản đã phát hành không sửa; trần pháp lý chặn lúc **phát hành**, không lúc bán |
| D031-5 | D-POL-5 | `bizcity_ledger_intake@1` 1.6.0: `policyRefs[]` đầu phiếu, `policyRef` dòng, tuỳ chọn |
| D031-6 | D-POL-6 | Tầng L4b trong tiền kiểm; mặc định `warn`; `hold` khi thiếu cách ghi nhận hoặc đơn vị chọn nghiêm; không `block` |
| D031-7 | D-POL-7 | Bút toán dự kiến = L5 chạy thử sẵn có; Commit Guard thêm băm `policyRefs` |
| D031-8 | D-POL-8 | Conformance Engine thêm rulepack `policy` cấp đơn vị, chỉ đọc |
| D031-9 | D-POL-9 | `GET /api/v1/policies` + sự kiện `policy.published` / `policy.retired` |
| D031-10 | D-POL-10 | Không trụ cột 18; nửa Policy của trụ cột 05; ngưỡng duyệt ở `setting_values` được đánh chỉ mục, không chép |

## 4. Câu hỏi (Q031-*)

| Mã | Hỏi ai | Câu hỏi | Đề nghị |
|---|---|---|---|
| Q031-1 | chủ dự án | Trụ cột: nửa Policy của 05 (giữ 17) hay tách thành trụ cột riêng ngang MDG? | **giữ 17**, đổi mô tả 05 thành hai nửa *Configuration* · *Policy* với tín hiệu riêng trong `nen-mong.json`; trụ cột V của `tru-cot.json` mở rộng tên thành "Chính sách nghiệp vụ và chế độ kế toán có phiên bản" |
| Q031-2 | chủ dự án | L4b mặc định `warn` cho mọi đơn vị; POS mặc định chế độ *tự động*? | đồng ý — đúng R-GATE-9 (mặc định cho phép, nhắc khi sai) |
| Q031-3 | chủ dự án | Plugin PHP tính lại bằng cách nào: viết lại theo bản mô tả JSON + golden chung, hay gọi `POST /api/v1/policies/evaluate` khi online? | **cả hai**: endpoint cho lúc online (không lệch), bản viết lại cho lúc offline; golden `T031-RC-*` là chuẩn chung |
| Q031-4 | nhóm Lõi | Phiên bản chính sách mua hàng: bảng `purchase_policy_versions` cạnh `purchase_policies`, hay dồn nội dung vào `inline` của Registry? | **bảng phiên bản tại module** — giữ D031-2, không đổi engine |
| Q031-5 | kế toán trưởng | Bảng `reasonCode` cho từng loại kết quả: tặng kèm bán (XTA1.4), tặng không kèm mua / mẫu (XQUA), chiết khấu thương mại trên hoá đơn vs sau hoá đơn, chiết khấu thanh toán, thưởng doanh số NPP (CKNPP) | xác nhận bảng ở S031-14 trước khi phát hành Rule Contract bán hàng |
| Q031-6 | nhóm Lõi | `policy.resolve(ref, at)` cho Kernel đọc nội dung chính sách qua Platform: chấp nhận hướng phụ thuộc Kernel → Platform registry (chỉ đọc)? | đồng ý nếu đi qua cổng đọc `bizcity_read` (ADR-0026), Kernel không đọc bảng module |

## 5. Các đợt

| Đợt | Mức | Nội dung | Phụ thuộc |
|---|---|---|---|
| **W0** | K0 | ADR-0031 đề xuất, README, 10 thiết kế, checklist (tài liệu này) | — |
| **W1** small win | K1 | Phong bì Registry (migration + `policies.register / publish / resolve`); phiên bản + băm cho chính sách mua hàng; `policyTrace` ghi `code@version#hash`; golden không sửa bản đã phát hành | Q031-4; dòng CLAIMS |
| **W2** | K2 | `bizcity_ledger_intake@1` 1.6.0 `policyRefs`; tầng L4b trong `preflight.ts`; Commit Guard; mã `POL-*` vào `bizcity_findings@1`; `GateResult.ruleVersion`; Rule Contract `purchase.*@1` bọc engine mua hàng | W1; PR chốt thiết kế (đụng cửa nạp, dùng chung) |
| **W3** | K1 | `GET /api/v1/policies`, `policy.published` / `.retired`; Rule Contract bán hàng (`sale.price_list@1`, `sale.promo.*@1`, `sale.credit_limit@1`) đi cùng `modules/ban-hang` (S030-16); POS WP đổi sang dùng chính sách phát hành | W2; Q031-3, Q031-5 |
| **W4** | K1 | Rulepack `policy` cho Conformance Engine; màn *Chính sách* (danh sách, phiên bản, chứng từ đã áp); nút *Chính sách căn cứ* trên màn truy vết; `nen-mong.json` trụ cột 05 nửa Policy | W3 |

## 6. Ai làm gì

| Vai | Làm | Không làm |
|---|---|---|
| Module (Bán hàng, Mua hàng, Nhân sự) | lập, giữ nội dung, phát hành chính sách; chọn Rule Contract; tính cho chứng từ nội bộ | tự viết luật định khoản; tự chặn ghi sổ |
| Policy Registry (Platform) | phong bì, phiên bản, hiệu lực, băm, phát hành, phân phối, `resolve` | giữ bản sao nội dung của module |
| Rule Contracts (`packages/contracts`) | khuôn, hàm tính tất định, phép kiểm, `reasonCode` | số tài khoản |
| Plugin ngoài (POS WP, Woo, sàn) | tải bản `published`, tính tại chỗ, gửi `policyRefs` | tự định nghĩa luật cho nghiệp vụ đã có chính sách |
| Intake Gate (L4b, L5) | kiểm sự việc theo bản hiệu lực, ra `GateResult`, bút toán dự kiến | sửa sự việc; chặn bán |
| Accounting Kernel | Posting Rules, ghi sổ, lưu `policyRefs` trong phiên bản sự việc | đọc bảng module |
| Conformance Engine | tư vấn cấp đơn vị trên Registry + sổ | chặn giao dịch, ghi sổ |
| Kế toán | xem hàng việc lệch, chọn ghi / trả về; chọn mức nghiêm | — |
