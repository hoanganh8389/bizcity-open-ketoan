# PHASE-011 · Bản mẫu Phân hệ và app
<!-- [2026-11-01 10:40 PM Johnny Chu - Chu Hoàng Anh] ADR-0011 — bản mẫu tĩnh launcher "＋ Thêm phân hệ" + trang Phân hệ; checklist code CK-1…CK-20 rút từ bản mẫu cho 3.13, 3.14 -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

[phan-he.html](phan-he.html) là **bản mẫu tĩnh** cho vòng đời plugin theo [ADR-0011](../../../adr/ADR-0011-plugin-ba-muc-tin-cay.md). Chủ dự án yêu cầu vẽ trước (2026-11-01) để có định hướng viết checklist code. Mở thẳng bằng trình duyệt, không cần máy chủ.

- **Số liệu giả lập.** POS mini, Hợp đồng, KPI, CRM Acme, Chấm công là ví dụ dựng tay; tên miền `*.example`.
- Nút **Người dùng / Chủ đơn vị / Quản trị bản cài** ở góc trên đổi vai trò, để xem ai thấy gì. Nút ◐ đổi sáng / tối.
- Mở thẳng một màn: `#launcher`, `#phan-he`, `#chi-tiet`, `#tat`, `#app`, `#ket-noi`, `#ket-noi-xong`.
- Dưới mỗi khối có **nguồn** (API / action dự kiến) và mã **CK-…** (bảng dưới), để lúc code chuyển thẳng.

## Màn và điều cần duyệt

| Màn | Neo | Điều cần duyệt |
|---|---|---|
| Launcher | `#launcher` | Ô theo đơn vị (lõi · cài thêm · app ↗). Ô mờ "chưa bật" chỉ chủ đơn vị thấy. Ô **＋ Thêm phân hệ** chỉ chủ đơn vị / quản trị thấy |
| Phân hệ · Dùng ở đơn vị | `#phan-he` | Bật / tắt theo đơn vị. Cột "cần năng lực" chặn module đòi năng lực `planned` |
| Phân hệ · App ngoài | `#phan-he` tab 2 | Origin nhúng, phạm vi khoá, sự kiện nhận, tình trạng giao webhook |
| Phân hệ · Đã cài trên máy chủ | `#phan-he` tab 3 (quản trị) | **Chỉ đọc.** Cài / kích hoạt qua dòng lệnh. Hai ca chặn: hash lệch → không nạp; bảng thiếu RLS → không activate |
| Phân hệ · Có thể cài | `#phan-he` tab 4 | MVP không có "tải về bấm cài": hướng dẫn mức 1 / mức 2 |
| Chi tiết module | `#chi-tiet` | Module **xin gì** để ghi sổ (docType + lý do, không tài khoản), quyền, cấu hình, sự kiện, slot, hash, lịch sử |
| Tắt module | `#tat` | Nói rõ hậu quả: sổ không đổi, sự kiện `skipped`, việc dở của module |
| App trong iframe | `#app` | Thanh trên khung (origin, phạm vi, hạn vé); slot tab "CRM" trong hồ sơ khách hàng |
| Kết nối app | `#ket-noi`, `#ket-noi-xong` | Duyệt quyền app xin trước khi cấp khoá; khoá + bí mật webhook chỉ hiện một lần |

## Checklist code rút từ bản mẫu

Mỗi dòng là một việc kiểm được (test hoặc check). Cột "Việc" trỏ việc con ở [40-MASTER-CHECKLIST](../40-MASTER-CHECKLIST.md) và PR ở ADR-0011.

| Mã | Việc code | Kiểm bằng | Việc / PR |
|---|---|---|---|
| CK-1 | `GET /api/v1/system/modules` trả theo **đơn vị**: `{key, label, icon, color, order, description, functionCount, source: core\|module\|app, enabled}`. Người dùng thường chỉ nhận dòng `enabled` | test API hai vai trò | S011-3 · PR-1 (đọc manifest), S011-8 · PR-3 (theo đơn vị) |
| CK-2 | Launcher (`LauncherPage.tsx`, `ModuleBar.tsx`) dựng ô từ CK-1, không từ danh sách tĩnh; nhãn "Cài thêm" / "App ↗"; ô mờ + nút Bật cho chủ đơn vị | e2e / ảnh chụp so bản mẫu | PR-6 |
| CK-3 | Bảng `tenant_modules (tenant_id, module_id, enabled, changed_at, changed_by)`, RLS, `COMMENT ON` | migration + DG-DB-1 | S011-8 · PR-3 |
| CK-4 | Action `core.module.enable` / `core.module.disable`: quyền `tenant:owner`, bằng chứng + biên nhận, `dryRun` trả số việc dở + số bút toán theo `source_module`, phát `bizcity.module.toggled` | test action | S011-8 · PR-3 |
| CK-5 | Bật module kiểm `requires.capabilities` của manifest với `bizcity-standard.json`; năng lực `planned` → từ chối, nói rõ năng lực thiếu | test | S011-8 · PR-3 |
| CK-6 | Bảng `module_registry (id, version, source_path, build_hash, status installed\|active\|disabled, installed_at, history)`; lệnh `module install / activate / upgrade` trong `scripts/` | test lệnh trên CSDL sạch | S011-8 · PR-3 |
| CK-7 | Khởi động API: chỉ nạp module `active` có hash bản build khớp; lệch → bỏ riêng module, log lỗi, chẩn đoán **DG-MOD-1** đỏ. `BIZCITY_DEV_MODULES` bỏ kiểm hash, cấm khi production | test khởi động hai ca | S011-8 · PR-3 |
| CK-8 | Manifest `kind: "app"` + `ui.origin`; action `core.app.register` (dryRun = màn duyệt quyền) | SC-CON-2 với schema mới; test | S011-9 · PR-2b |
| CK-9 | Subscriber `core.webhook:<app>`: POST sự kiện tới URL của app, ký `X-Bizcity-Signature` (HMAC-SHA256 thân + `X-Bizcity-Timestamp`), thử lại / chết theo `event_deliveries`; dừng khi app tắt ở đơn vị | test phát lại không gửi trùng; test chữ ký | S011-9 · PR-2b |
| CK-10 | Migration module chạy bằng `SET ROLE mod_<key>_owner`; vai trò chỉ sở hữu schema `mod_<key>` | test: migration chạm `public.ledger_lines` bị PostgreSQL từ chối | S011-10 · PR-4 |
| CK-11 | Sau migration: mọi bảng `mod_<key>.*` có `tenant_id` + `relrowsecurity` + `relforcerowsecurity`, thiếu → không cho `activate` | test với module mẫu thiếu RLS | S011-10 · PR-4 |
| CK-12 | Người dùng thường không thấy ô "＋", không thấy module tắt; route của module tắt trả `MODULE_DISABLED` (`Errors.moduleDisabled` được gọi) | test API + e2e | PR-3, PR-6 |
| CK-13 | Không có API "tải gói / tải tệp mã lên"; chép tệp vào `modules/` khi API đang chạy không làm gì | check tĩnh: không route upload mã; test khởi động | PR-3 |
| CK-14 | Chi tiết module đọc `ledger.submits[]` và đối chiếu lý do với gói định khoản đang cài của đơn vị (lý do thiếu → cảnh báo trước khi bật) | test | PR-2, 3.12 |
| CK-15 | Quyền `permissions[]` của manifest gộp vào registry quyền khi bật; màn Phân quyền nhóm theo module | test | S011-4 · 3.3 |
| CK-16 | Sự kiện tới module đang tắt ở đơn vị: việc giao ghi `skipped` (không `dead`), bật lại không tự xử lý bù | test events | S011-8 · PR-3 |
| CK-17 | Khung iframe: chỉ origin đã khai (`frame-src` sinh từ app đang bật), `sandbox` không `allow-top-navigation`, không cookie phiên Core | test header CSP; e2e | S011-9 · PR-2b |
| CK-18 | Vé iframe ≤ 5 phút, ký, gắn đơn vị + người dùng + app; `POST /api/v1/apps/{id}/ticket/redeem`; giao thức `postMessage` đóng (`bizcity.context`, `bizcity.navigate`, `bizcity.toast`, `bizcity.resize`), kiểm `event.origin` | test vé hết hạn / sai app | S011-9 · PR-2b |
| CK-19 | Slot (`partner.detail.tab`, `document.detail.panel`, `dashboard.widget`…) nhận cả module mức 1 (React) và app mức 2 (iframe, URL có tham số slot) | e2e | 3.8 · PR-6 |
| CK-20 | Khoá API của app: phạm vi = `permissions[]` + `events.subscribes[]` của manifest, gắn một đơn vị; bí mật webhook; `core.app.rotate-secret`, `core.app.revoke`; khoá / bí mật chỉ hiện một lần | test: gọi action ngoài phạm vi → 403 | S011-9 · PR-2b |

<!-- [2026-11-02 10:43 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — PR-2b: trạng thái CK-8, CK-9, CK-17, CK-18, CK-20 và chỗ lệch bản mẫu -->
**PR-2b (2026-11-02), trạng thái và chỗ mã khác bản mẫu:**

| CK | Trạng thái | Khác bản mẫu |
|---|---|---|
| CK-8 | ✅ | Không có action `core.app.register`: app "đăng ký" bằng manifest trong mã nguồn bản cài (`apps/api/src/ung-dung/`, ADR-0011 D3). Màn duyệt quyền = hộp xác nhận ở `POST /api/v1/apps/:key/install`. Kết nối không đi runtime action vì bản lưu idempotency sẽ giữ bí mật trong CSDL |
| CK-9 | ✅ | Subscriber tên `<app>.webhook` (khuôn id subscriber không nhận `:`). Một header `Bizcity-Signature: t=…,v1=…` thay cho hai header chữ ký + thời điểm. Tắt app: không tạo việc giao (lọc lúc phát), việc đã tạo thì xong mà không gửi |
| CK-17 | 🟡 | `sandbox` không `allow-top-navigation` / `allow-popups`, không gửi phiên: có. **Chưa:** CSP `frame-src` sinh từ app đang bật — giao diện do nginx phục vụ tĩnh, chưa có chỗ sinh header theo manifest; thêm `frame-src` cứng lúc này làm hỏng iframe Bảng tính AI và xem PDF. Khung chỉ nhúng đúng `ui.origin` từ API |
| CK-18 | ✅ | Đổi vé ở `POST /api/v1/apps/ticket/exchange` (app gọi bằng khoá của nó; vé không tự chứng minh app). Vé không dùng một lần: bị lộ cũng không đổi được nếu không có khoá app |
| CK-20 | ✅ | Phạm vi = `app.scopes` (quyền Core app xin) + `events.subscribes`; `permissions[]` giữ nghĩa "quyền mới module khai". Xoay khoá = `POST /api/v1/apps/:key/rotate`; thu hồi = tắt kết nối hoặc thu hồi ở màn Khoá API |

<!-- [2026-11-02 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — PR-3: trạng thái CK-1, 3, 4, 5, 6, 7, 12, 13, 16 -->
**PR-3 (2026-11-02), trạng thái và chỗ mã khác bản mẫu:**

| CK | Trạng thái | Khác bản mẫu |
|---|---|---|
| CK-1 | 🟡 | `GET /system/modules?view=tenant` trả `key, kind, label, description, version, icon, color, order, source, enabled, required`; người không quản trị chỉ thấy module bật. Chưa có `functionCount`; app ngoài tiến trình ở `GET /api/v1/apps` (chưa gộp một danh sách — PR-6) |
| CK-3 | ✅ | `tenant_modules (tenant_id, module_key, enabled, changed_at, changed_by, reason)` — khoá theo `module_key` thay `module_id` |
| CK-4 | ✅ | Quyền `users:write` (= chủ đơn vị) vì chưa có registry quyền (3.3); dry-run báo chứng từ chờ / lỗi + bút toán theo nguồn = module |
| CK-5 | ✅ | |
| CK-6 | ✅ | Lệnh là `npm run module -w @ketoan/api -- …` (`bizcity module` ở PR-5); `install / upgrade` của module đi kèm gộp vào `sync`; không có `source_path` (thư mục suy từ khoá) |
| CK-7 | ✅ | Hash chỉ chặn ở bản thật (`NODE_ENV=production`); máy dev cảnh báo. `BIZCITY_DEV_MODULES` cấm ở bản thật. Job cài đặt (`setup.ts`) đồng bộ hash mỗi lần triển khai |
| CK-12 | 🟡 | API: `MODULE_DISABLED`, danh sách bỏ module tắt (web cũ tự ẩn). Ô "＋" và màn bật / tắt: PR-6 |
| CK-13 | ✅ | Không có route tải mã; module là import tĩnh trong bản dựng |
| CK-16 | ✅ | |

Khi PR-6 xong: chụp màn thật với dữ liệu demo, đặt cạnh bản mẫu trong `../evidence/PR6-<ngày>.md`.
