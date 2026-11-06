# PHASE-030 · 22 — Đánh giá: hợp đồng phân quyền `bizcity_authorization@1` gọn được tới đâu
<!-- [2026-11-06 06:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — chủ dự án hỏi "hợp đồng authz có gọn được như vậy không" (so với ma trận "Ai được làm gì" của Erp-vn và bản gọn của cổng ở 21); đề xuất cho PHASE-028, không sửa thư mục / hợp đồng của PHASE-028 (dòng giữ chỗ W2) -->

> Đọc: [`bizcity_authorization@1`](../../contracts/BIZCITY-AUTHORIZATION-v1.md) 1.0.0-draft · [ADR-0027](../../adr/ADR-0027-core-authorization-plugin-role-editor.md) (D-AUTH-01..14, Phụ lục A) · `packages/platform/src/core/authz/engine.ts` · `packages/platform/src/core/date-rules.ts` · [21](21-SO-CONG-VA-BANG-DIEU-HANH.md) · [ADR-0029](../../adr/ADR-0029-loi-bat-bien-nghiep-vu-linh-hoat.md).
> **Chủ dự án đồng ý 2026-11-06 tối** toàn bộ §3 #1–#9 <!-- [2026-11-06 06:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — chủ dự án đồng ý 22 §3 (SoD ở cổng chuyển trạng thái) -->. Thi hành thuộc PHASE-028 (hợp đồng `bizcity_authorization@1` 1.1.0-draft, `engine.ts`) trong dòng giữ chỗ của PHASE-028; §5 đã sửa ở ADR-0029 D-FIN-9, kiến trúc §2 / §7, R-WF-15, 19 §3 / §5.

## 0. Kết luận

**Phần lớn đã gọn.**
- Một hàm thuần không CSDL (`authorize`).
- Một bảng lần gán (W1, đã merge #102) và hai bảng vai trò của đơn vị (W2).
- Đã bỏ `module_grants` để chỉ một nguồn sự thật.
- Không mở hợp đồng tuân thủ riêng (D-AUTH-06).
- Kế thừa vai trò một cấp (D-AUTH-14).
- Quyết định đã định ghi vào bằng chứng (§6 hợp đồng), khớp đúng hướng gọn của cổng (21 §2).

**Gọn thêm được ở một chỗ chính: điều kiện của luật đang làm thay việc của chủ khác.**
- Hạn theo ngày chứng từ trùng khoá ngày `dataLock`.
- `status_in` trùng workflow.
- `amount_max` dễ lẫn với số cấp duyệt của chính sách.
- SoD dự định đặt ở phân quyền nhưng cần lịch sử người đã duyệt, mà lịch sử đó do chứng từ giữ.

Thêm `relax` (Nới) là khái niệm thừa khi Cho đã hợp trong cùng phạm vi.

Bớt các chỗ đó:
- điều kiện giảm **8 → 5**;
- hiệu lực giảm **3 → 2** (Cho, Cấm);
- mỗi câu hỏi "được không" có **đúng một nơi trả lời**.

## 1. So với ma trận "Ai được làm gì" của Erp-vn

| | Erp-vn (`lfood_base`, `lfood_admin`) | open-ketoan (ADR-0027) | Có cần phức tạp hơn không? |
|---|---|---|---|
| Vai trò mỗi người | **một** (`lfood_role`) | nhiều lần gán (W1) | **cần**: một người vừa thủ kho K1 vừa xem báo cáo cả công ty |
| Thứ bậc | nhân viên < kế toán viên < kế toán trưởng; giám đốc, R&D riêng; quản trị có tất | 6 vai trò hệ thống + vai trò đơn vị kế thừa một cấp | tương đương |
| Phạm vi | theo công ty (108 `ir.rule` viết tay) | `all` / `org_unit` / `branch` / `warehouse` | **cần**: chuỗi nhiều cửa hàng, nhiều kho |
| Mục đích | không | `operate` / `approve` / `report` / `export` | **cần một phần** (§3 #6) |
| Cấm | không | Cấm thắng | **cần**: "kế toán kho trừ kho hàng giá trị cao" |
| Nới | không | có (chưa bật, D-AUTH-12) | **không cần** (§3 #1) |
| Điều kiện | không (kiểm rải trong mã: 92 `has_group`, ngưỡng một số) | 8 điều kiện | **bớt được 3** (§3 #2–#4) |
| Tách nhiệm | không có | dự định đặt ở phân quyền | **đặt ở chuyển trạng thái** (§3 #5) |
| Màn hình | **một ma trận** nhóm × quyền × vai trò, Có / — | Role Editor (W4, chưa làm) | **học Erp-vn** (§3 #7) |
| Ghi nhật ký | mọi thao tác kể cả quản trị | thay đổi vai trò / luật / lần gán + `decisionId` vào bằng chứng | đã đúng |

Erp-vn gọn vì **thiếu**: không phạm vi, không cấm, không tách nhiệm, quyền viết cứng trong mã. open-ketoan cần nhiều hơn nó ở phạm vi, cấm, nhiều lần gán. Nhưng không cần Nới và không cần điều kiện làm thay chủ khác.

## 2. Ai trả lời câu nào (sau khi gọn)

| Câu hỏi | Chủ duy nhất | Hôm nay có mấy nơi trả lời |
|---|---|---|
| Người này có quyền làm việc này, **ở phạm vi này**, với **mục đích** này? | Phân quyền (`authorize`) | 3: `auth.ts` `requirePermission`, `workflow.ts` `actor.can`, `assertCanModify` |
| Từ trạng thái này có chuyển được không; người lập có được tự duyệt; người duyệt cấp 1 có được duyệt cấp 2? | Chuyển trạng thái (workflow YAML) | 1 (`wf.plan`, `sod`), nhưng hợp đồng phân quyền có `status_in` |
| Ngày chứng từ này có nằm trong vùng được lập / sửa không? | Khoá ngày (`dataLock`) + khoá kỳ (Kernel) | 2: `date-rules.ts` (`editWithinDays`, `todayOnly`, `lockUntil`) **và** điều kiện `doc_date_back_days`, `doc_date_forward_days`, `respect_lock_date` |
| Chứng từ số tiền này cần **mấy cấp** duyệt? | Chính sách (C3) | 2: `payment_request_settings`, `purchase_policies` (+ `amount_max` dễ bị dùng thay) |
| Người này được duyệt **tối đa bao nhiêu** (hạn mức cá nhân)? | Phân quyền (`amount_max`) | 0 |

## 3. Đề xuất cho PHASE-028

| # | Đề xuất | Bớt được | Bằng chứng | Ảnh hưởng mã đã merge |
|---|---|---|---|---|
| 1 | **Bỏ `relax` (Nới) hẳn**, không chỉ hoãn. Muốn nới thì thêm một luật **Cho** với điều kiện rộng hơn: Cho đã hợp trong cùng phạm vi (D-AUTH-04 quy tắc 2), nên một Cho thứ hai rộng hơn cho đúng kết quả. Riêng "Nới không tự cấp" mất đi; nhưng vai trò tuỳ biến kế thừa `base_role` và tự có Cho, nên không mất tính năng | 1 hiệu lực, hàm `widen` (`engine.ts:94-103`), một nhánh bộ tính, một câu giải thích cho người dùng | D-AUTH-12 đã chặn `relax` bằng CHECK ở W2 | xoá `widen` và nhánh relax trong `engine.ts`; test tương ứng |
| 2 | **Hạn theo ngày chứng từ về một chủ.** Phân quyền không tự xét ngày chứng từ: bỏ `doc_date_back_days`, `doc_date_forward_days`, `respect_lock_date`. Khoá ngày (`dataLock`, `date-rules.ts`) giữ luật chung của đơn vị; ai được vượt là **một quyền** (`documents:bypass-date-lock`, đã có). Cần hạn khác nhau theo người thì thêm phạm vi `role` vào cấu hình khoá ngày (R-MATRIX), không thêm điều kiện quyền | 3 điều kiện; một chỗ hai nơi tính lệch nhau | `date-rules.ts:7-11, 46-58` đang làm đúng việc này, có bypass | bỏ 3 khoá trong `types.ts` / `engine.ts` / `catalog.ts` mặc định quyền |
| 3 | **Bỏ `status_in`.** Trạng thái nào được sửa / chuyển là việc của workflow (`from`, `editable`) | 1 điều kiện | R-WF-1 / R-WF-3; `workflow.ts:130` `editable()` | bỏ khoá |
| 4 | **Giữ `amount_max`, đặt tên rõ: "hạn mức duyệt cá nhân".** Số cấp duyệt theo khoảng tiền là chính sách (C3, [16 §5](16-CHUAN-CHUNG-TU-DUNG-CHUNG.md)). Cổng chuyển trạng thái hỏi chính sách "cần mấy cấp", rồi hỏi phân quyền "người này được duyệt cấp này, tới số tiền này không" | không bớt, nhưng chặn hai nơi cùng quyết số cấp | Erp-vn trộn hai việc vào một ngưỡng công ty | đổi nhãn / chú thích |
| 5 | **Tách nhiệm (SoD) ở cổng chuyển trạng thái, không ở phân quyền.** Phân quyền chỉ thấy `createdBy` của tài nguyên; "người duyệt cấp 2 khác cấp 1" cần **lịch sử chuyển** do Document giữ. YAML có `sod: true` (người lập ≠ người làm) và thêm `distinct_approvers: true` (mỗi cấp một người). D-AUTH-04 "SoD thắng" giữ được bằng thứ tự: cổng chuyển trạng thái chặn thì kết quả là chặn | không thêm điều kiện `not_creator` / `not_previous_approver` vào bộ tính | `workflow.ts:167` đã có `sod`; engine không có dữ liệu lịch sử | không đụng engine |
| 6 | (tuỳ chọn) **Mục đích 4 → 3**: gộp `export` vào `report`; xuất là quyền riêng `…:export` (`risk: high`) và đọc nhạy cảm có bằng chứng (STD-EVD-7) | 1 mục đích | quyền xuất đã là quyền riêng ở nhiều module | đổi `types.ts:28` |
| 7 | **Role Editor mở bằng ma trận** như Erp-vn: hàng = nhóm × quyền (từ sổ quyền, nhãn tiếng Việt), cột = vai trò, ô = Có / — / Cấm. Tính bằng `batchAuthorize` trên **vai trò**, không trên lần gán. Bấm ô mới ra phạm vi, mục đích, điều kiện, căn cứ. Thêm nút "Xem như người X" (đã có trong Phụ lục A bước 3) | — (giao diện) | ảnh màn Erp-vn "Ai được làm gì" | W4 PHASE-028 |
| 8 | **Một đường thi hành, có hạn xoá đường cũ.** Sau shadow sạch (bước 4 Phụ lục A): `requirePermission`, `workflow.actor.can`, `assertCanModify` đều gọi `authorize`. `assertCanModify` = điều kiện `creator: self` (đã có, `engine.ts:120`). Xoá `ROLE_PERMISSIONS` trực tiếp sau N tuần không lệch | 3 nơi quyết quyền → 1 | [19 §3](19-RA-SOAT-DUYET-VA-GHI-SO.md) | bước 4 |
| 9 | **Quyết định không có bảng riêng.** `decisionId`, `reasonCode`, `authzVersion` vào `gates[role]` của bằng chứng ([21 §2](21-SO-CONG-VA-BANG-DIEU-HANH.md)); lần bị từ chối ở bước quyền cũng có bằng chứng (đổi `actions.ts:388-401`) | không thêm bảng log quyền | hợp đồng §6 "ghi vào bằng chứng của action" | S030-29 |

Sau khi gọn, điều kiện còn **5**:
- `creator` (self / branch / all; thi hành thật cả `branch`, `engine.ts:120` hôm nay nhận mà không xét);
- `edit_window_days` (tính từ **lúc lập**, khác hạn theo ngày chứng từ);
- `amount_max` (hạn mức cá nhân);
- `view_window_days` (báo cáo);
- `step_up_minutes` (xác thực lại cho quyền rủi ro cao).

**Ghi chú sau #107** <!-- [2026-11-06 06:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — đọc chữ chốt bước 3 của W2 (ADR-0027 Phụ lục A) -->:
- ADR-0027 Phụ lục A bước 3 thi hành Cho + Cấm **trong `auth.ts`**, có chống leo thang và `confirmPassword`. Đến bước 4 có hai cách tính quyền song song: `auth.ts` và bộ tính `core/authz`. Đề xuất #8 vì vậy gấp hơn: bước 4 nên đặt hạn (vd hai tuần shadow sạch) để `auth.ts` chỉ còn gọi `authorize`.
- Màn `modules/phan-quyen` là đợt 3. Đề xuất #7 (mở bằng ma trận) nên vào ngay chữ chốt của đợt đó.

## 4. Không nên bớt

| Giữ | Vì sao |
|---|---|
| Phạm vi `branch` / `warehouse` / `org_unit` | thiếu nó thì người duyệt kho K1 duyệt được K2 ([19 §3](19-RA-SOAT-DUYET-VA-GHI-SO.md)); Erp-vn phải viết tay 108 luật để bù |
| Cấm thắng | cách duy nhất để "trừ ra" mà không phải tạo vai trò mới cho mỗi ngoại lệ |
| Nhiều lần gán, mỗi lần một phạm vi + mục đích | đúng thực tế: một người nhiều vai ở nhiều nơi |
| Tài nguyên nạp từ máy chủ (AUTHZ-11) | thiếu là lỗ hổng |
| `authzVersion` + thu hồi có hiệu lực ở yêu cầu kế tiếp | T030-AUTH-2 |

## 5. Kéo theo sửa ở tài liệu PHASE-030 nếu §3 #5 được nhận

ADR-0029 D-FIN-9 và [kiến trúc §7](../../architecture/LOI-BAT-BIEN-NGHIEP-VU-LINH-HOAT.md) đang ghi *"PHASE-028 cung cấp … điều kiện SoD"*. Nếu #5 được nhận, sửa thành:
- *"SoD ở cổng chuyển trạng thái (`sod`, `distinct_approvers`); PHASE-028 cung cấp `authorize` trên tài nguyên chứng từ và thi hành `creator: 'branch'`"*;
- golden T030-AUTH-3 chuyển thành T030-DOC-*.

Đã sửa 2026-11-06 sau khi chủ dự án đồng ý.

## 6. Việc

| Mã | Việc | Chủ |
|---|---|---|
| S030-36 | Chủ PHASE-028 xem §3 #1–#9; nhận / bác từng dòng; dòng nhận được thì PHASE-028 sửa hợp đồng `bizcity_authorization@1` (1.1.0-draft) và `engine.ts` trong dòng giữ chỗ của mình | chủ PHASE-028 / chủ dự án |
