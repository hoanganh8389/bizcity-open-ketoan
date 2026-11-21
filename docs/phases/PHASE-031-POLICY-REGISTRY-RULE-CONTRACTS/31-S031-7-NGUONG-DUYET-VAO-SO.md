<!-- [2026-11-21 04:00 PM Võ Hoàng] PHASE-031 — chữ chốt thiết kế S031-7 (ngưỡng duyệt vào sổ chính sách, approval.levels@1, store settings) và S031-32 phần đo, trước PR code, R-FLOW-2 (anh Hoàng chốt 21/11) -->
# 31. S031-7 — Ngưỡng duyệt vào sổ chính sách (`approval.levels@1`, `store: settings`); S031-32 phần đo

> Căn cứ: checklist S031-7; `10-THIET-KE.md` (cột `store` = `settings` — khoá `setting_values`; Rule Contract đầu tiên có `approval.levels@1`); PHASE-030 `16-CHUAN-CHUNG-TU-DUNG-CHUNG.md` §5 (chính sách duyệt dùng chung: dải tiền → cấp duyệt); migration 0161 (ngưỡng duyệt cấp 2 của yêu cầu thanh toán đã ở khoá `bizcity.payment.approval_thresholds` trong `setting_values`, có phiên bản, ngày hiệu lực).

## 1. S031-7
1. **Rule Contract `approval.levels@1`** (domain mới `approval`, thuần, tất định): tham số = dải tiền → các cấp duyệt (dạng 16 §5.1, rút gọn cho ngưỡng hiện có: `bands[{ from, to?, levels[] }]`); `evaluate({ amount })` → số cấp / các cấp phải duyệt; `describe()` có vector mẫu. Dùng lại cách tính đang có của yêu cầu thanh toán (không đổi kết quả: cùng ngưỡng → cùng số cấp, có test so).
2. **Đánh chỉ mục, không chép nội dung:** mỗi khoá ngưỡng duyệt trong `setting_values` (đợt này: `bizcity.payment.approval_thresholds`) có phong bì ở `policy_registry` với `store = settings`, `store_ref` = tên khoá, `rule_contract = approval.levels@1`, phiên bản + băm theo **giá trị hiệu lực** của khoá, `effective_from` theo ngày hiệu lực của bản cấu hình. Nội dung vẫn nằm ở `setting_values` (một nguồn); Registry chỉ mô tả, truy vết, cho bộ kiểm đọc.
3. **Đồng bộ:** đổi giá trị khoá (qua đường cấu hình hiện có) → phát hành phong bì bản mới, đóng bản trước — gọi từ phía sổ chính sách (hàm đồng bộ + action chỉ quản trị gọi được, chạy lại không sinh bản trùng); không sửa chỗ ghi cấu hình của lõi nếu không bắt buộc.
4. Không đổi luồng duyệt yêu cầu thanh toán; không làm chính sách duyệt chung cho mọi chứng từ (đó là DOC-030-4, đợt sau).

## 2. S031-32 — phần đo
- Thêm vào rulepack `policy` (`tests/conformance/diagnostics/policy.diag.mjs`) một check **DG-POLICY-6** chỉ đọc: đếm bản `retired` có `effective_to IS NULL` theo đơn vị, kèm số sự việc còn tham chiếu sau `effective_from`. Chạy trên bản sao dữ liệu thật là ra số để quyết định (§16 mục 6 của `00-MASTER-PLAN.md`). **Không tự đóng** khoảng nào.

## 3. Kiểm
- `approval.levels@1`: vector; cùng ngưỡng cho cùng số cấp như luồng yêu cầu thanh toán; đổi khoá → phong bì bản mới, bản cũ đóng; gọi đồng bộ lại không sinh bản trùng.
- DG-POLICY-6: đúng số trên dữ liệu thử (có / không có bản thiếu ngày).
