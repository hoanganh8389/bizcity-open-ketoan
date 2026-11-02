# PHASE-014 · 40 — Master checklist
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->

> Nguồn trạng thái **việc con** duy nhất của phase. "Xong" của việc lộ trình do bảng điểm tính, không do bảng này. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.

<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| ID | Việc | Lộ trình / G | Code | Trạng thái |
|---|---|---|---|---|
| S014-1 | `@bizcity/cli`: doctor, migrate, module new / check, events replay, evidence / ledger verify | 4.1 · G3-02 | có | 🟡 2026-11-02 — `packages/cli` (`npx bizcity`): module new / check / list, migrate, ledger verify, doctor; còn events replay, evidence verify <!-- [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W2/W3 --> |
| S014-2 | `templates/starter-module/` (+ AGENTS.md riêng) | 4.2 | có | ✅ 2026-11-02 — `templates/starter-module/`: manifest, migration (RLS + COMMENT), 2 action, màn danh sách + form chỉ dùng ui-kit, AGENTS.md, README; module sinh từ template qua `module check` ĐẠT <!-- [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W2/W3 --> |
| S014-3 | Lane runtime CONF-RUN / CONF-UPG | 4.3 | chưa | ☐ |
| S014-4 | AGENTS.md tạo module + AGENTS.md trong template | 4.4 | có | ✅ 2026-11-02 — AGENTS.md gốc mục "Tạo module mới" bước 7–8 trỏ `bizcity module new / check`; `templates/starter-module/AGENTS.md` <!-- [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W2/W3 --> |
| S014-5 | Ca chuẩn Hợp đồng 3/3 | 4.5 | chưa | ☐ |
| S014-6 | Standard 1.0.0 | 4.6 | chưa | ☐ |
| S014-7 | Thêm preset dịch vụ, sản xuất | 4.7 | một phần | 🟡 1/3 |
<!-- [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — chủ chỉ đạo "dồn lực cho phase 4 và trả nợ lõi": thêm đợt W1–W6 -->
| S014-8 | **W1** Chỗ nạp module SDK phía API: `modules/<key>/` (manifest + `defineModule`), registry / hash / bật tắt theo đơn vị như phân hệ, route sinh từ action dưới `/api/v1/m/<key>/`, quyền manifest, subscriber; SDK xuất `sql` | 4.2 · 4.5 (điều kiện) | có | ✅ 2026-11-02 — `apps/api/src/core/sdk-modules.ts`, `buildApp({ modulesDir })`; module thử `test/fixtures/sdk-modules/ghi-chu`; `sdk-module-host.test.ts` 6 test |
| S014-9 | **W2** Chỗ nạp module SDK phía web: `modules/<key>/web/index.tsx` (`defineWebModule`) → route, menu, quyền | 4.5 (điều kiện) | có | 🟡 2026-11-02 — `apps/web/src/phan-he/sdk-modules.ts` + `sdk-routes.tsx`: Tổng quan, menu `mod-<key>`, route có chặn quyền; `@bizcity/ui-kit` (provideUiKit ở main.tsx); `sdk-web.test.ts` 2 test. Chưa: slot <!-- [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W2/W3 --> |
| S014-10 | **W3** Khuôn gói npm của module (workspace `modules/*`), template `templates/starter-module/` + AGENTS.md riêng, image Docker chép + dựng `modules/*` và `module-sdk` | 4.2 · 4.4 | có | ✅ 2026-11-02 — workspace `modules/*`; image API dựng + chép `modules/*`, `module-sdk`; image web chép `modules`, `ui-kit`; job cài đặt chạy migration module trước `sync` registry <!-- [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W2/W3 --> |
| S014-11 | **W3** `@bizcity/cli` (`packages/cli`): `module new`, `module check`, `doctor`, `ledger verify`, `migrate` — dựng trên selfcheck / diagnostics / lệnh `module` sẵn có | 4.1 | có | ✅ 2026-11-02 — xem S014-1 <!-- [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W2/W3 --> |
| S014-12 | **W4** Diễn tập ca chuẩn Hợp đồng một lần theo GOLDEN-CASE-HOP-DONG, ghi khe hở SDK / tài liệu; sửa khe hở trước khi chạy 3/3 thật (S014-5) | 4.5 | chưa | ☐ |
| S014-13 | **W5–W6** Trả nợ lõi: route ghi → `defineAction` (SC-ACT-1, 60/202), phân hệ ghi bảng lõi (SC-MOD-2), import sai chiều (SC-LAYER-2) — theo đợt, mỗi đợt giữ test xanh | C-7 · 3.9 | chưa | ☐ |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-10-30 | Claude Code | Mở thư mục phase; trạng thái chụp từ bảng điểm (CSDL `ketoan_test`). |
| 2026-11-02 21:33 | Johnny Chu – Chu Hoàng Anh (chỉ đạo) | "dồn lực cho phase 4 và trả nợ lõi" → đợt W1–W6. Rà mã: `defineModule` có nhưng API không nạp module ở `modules/<key>/` (registry chỉ biết `phan-he/*`, `addins/*`) — ca chuẩn bị chặn từ gốc. W1: chỗ nạp module SDK phía API |
| 2026-11-02 22:30 | Johnny Chu – Chu Hoàng Anh (chỉ đạo) | W2: web nạp module SDK + `@bizcity/ui-kit`. W3: template `starter-module`, `@bizcity/cli`, test hợp đồng module, Docker + job cài đặt. Diễn tập: `bizcity module new so-tay` → `module check so-tay` ĐẠT (4/4 bước), dist nạp bằng Node, web dựng có route module |
