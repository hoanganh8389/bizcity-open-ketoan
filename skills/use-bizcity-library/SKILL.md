---
name: use-bizcity-library
description: Dùng thư viện dùng chung bizcity_library@1 của open-ketoan (tham số pháp lý, ngày nghỉ lễ, căn cứ pháp lý, mã chức năng phân quyền…) khi viết module / app — tìm mã đúng thay vì đoán, kiểm ô nhập bằng bộ kiểm của Core, thêm thư viện mới, cập nhật mục / giá trị theo ngày / căn cứ pháp lý đúng phiên bản. Dùng khi code cần lương tối thiểu, thuế suất, ngày nghỉ, mã căn cứ, danh mục mã chuẩn; khi thêm hoặc sửa libraries/*; khi API trả mã LIB-*. Từ khoá: thư viện, library, tham số pháp lý, ngày nghỉ lễ, căn cứ pháp lý, LIB-UNKNOWN, selector, validate.
---

<!-- [2026-11-08 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-50 (26 §10.1): skill use-bizcity-library — tìm · kiểm · thêm · cập nhật thư viện, chỉ báo xong khi library check PASS và SC-LIB ĐẠT -->

# Dùng thư viện dùng chung (bizcity_library@1)

Thư viện là dữ liệu tham chiếu chung mọi đơn vị (`libraries/<id>/library.json`): mã, tên, bí danh, giá trị theo ngày hiệu lực, căn cứ pháp lý, luật kiểm và gợi ý. Đơn vị chỉ đọc; đơn vị có thể bật / tắt thư viện tuỳ chọn, ghi đè giá trị có ngày hiệu lực và hạ mức luật ở màn **HT14 Kho thư viện → Cấu hình**. Thư viện **không** sinh bút toán, **không** tạo danh mục, **không** cấp quyền.

**Đọc trước:** [open-ketoan-standard](../open-ketoan-standard/SKILL.md), hợp đồng [BIZCITY-LIBRARY-v1](../../docs/contracts/BIZCITY-LIBRARY-v1.md), README của thư viện định dùng (`libraries/<id>/README.md` — bắt buộc, nói mục là gì, trạng thái đối chiếu, cách cập nhật).

## Bốn điều không làm

1. **Không viết cứng giá trị** có trong thư viện (lương tối thiểu, mức đóng, ngày nghỉ, thuế suất…) vào code. Đọc qua API tại **ngày chứng từ** — giá trị đổi theo ngày, và đơn vị có thể đang ghi đè.
2. **Không đoán mã.** Không tìm thấy thì nói thẳng với người dùng; đề xuất bổ sung ở HT14 → Chi tiết → Đề xuất, hoặc mở PR sửa nguồn thư viện.
3. **Không sửa tay `library.json`** của thư viện có `generatedBy`: sửa nguồn (`sources/`, `build.mjs`) rồi chạy script sinh.
4. **Không xoá mục đã phát hành**, không đổi giá trị một khoảng hiệu lực đã phát hành để "sửa nhanh": đặt `deprecated` / `removed` + `replacedBy`, hoặc đóng khoảng cũ và thêm khoảng mới (ECP-13). Đổi nghĩa = lên bản major.

## Lệnh

```bash
npx bizcity library list                                   # thư viện nào có, phiên bản, số mục, bao nhiêu đã đối chiếu
npx bizcity library search "lương tối thiểu" --at 2026-11-08   # tìm mã (không dấu được), xem giá trị tại ngày
npx bizcity library check vn.ngay-nghi-le 2026-02-16       # kiểm một ô; {json} hoặc @tệp.json cho ô nhiều trường / nhiều ô
npx bizcity library new nghiep-vu.loai-hop-dong --kind code-list --title "Loại hợp đồng" --source "Quy chế nội bộ"
npx bizcity library diff vn.tham-so-phap-ly                # so với origin/main: thay đổi, bản cần lên, lỗi khuôn
node tests/conformance/selfcheck.mjs --only SC-LIB         # bộ kiểm khuôn thư viện của repo (SC-LIB-1)
```

Chưa `npm install` thì thay `npx bizcity` bằng `node packages/cli/bin/bizcity.mjs`. Ở dự án khác: `node <cli trong .bizcity/ketoan.json>`.

`library check` dùng **đúng bộ kiểm của Core**, theo thứ tự: máy chủ (`BIZCITY_SERVER` + `BIZCITY_API_KEY`, có cấu hình riêng của đơn vị) → bản dựng của gói `@bizcity/platform` (`npm run build -w @bizcity/platform`, không có cấu hình đơn vị) → **SKIP**. SKIP không phải PASS.

Mã thoát `library check`: `0` PASS · `1` FAIL (có chặn, hoặc thư viện không có / đơn vị đã tắt) · `2` SKIP · `3` WARN (có cảnh báo — đọc gợi ý, quyết cùng người dùng).

## Việc 1 — dùng thư viện trong module / app

1. `npx bizcity library search <từ khoá>` để lấy **mã chuẩn** và thư viện chứa nó.
2. Màn nhập dùng ô chọn của ui-kit (`LibraryPicker` trong `@bizcity/ui-kit`, đọc `GET /api/v1/libraries/:id/items`) thay cho ô gõ tự do.
3. Máy chủ / action: kiểm ô nhập bằng `POST /api/v1/libraries/:id/validate` `{ input | inputs[], at: <ngày chứng từ>, source: "modules/<key>" }`. Gửi `source` để bảng đánh giá HT14 biết module nào dùng, qua / cảnh báo / chặn bao nhiêu.
4. Phát hiện `LIB-*` (hoặc mã luật của thư viện) mức **block** → không cho lưu, hiện `message` + `suggestions[]`; **warn** → cho lưu, hiện cảnh báo. Không tự thay giá trị người dùng bằng gợi ý.
5. Nghĩa của mã: `npx bizcity explain <MÃ>`; mã không có trong danh mục thì nói thẳng, không đoán.

## Việc 2 — thêm thư viện mới

1. Kiểm `library list` / `library search` — đã có thư viện gần giống thì bổ sung vào đó, không tạo trùng.
2. `npx bizcity library new <miền>.<tên> --kind <loại> --title "…" --source "…" [--source-kind law|internal|reference]`. Miền: `core` · `vn` · `authz` · `nghiep-vu` · `bao-cao` · `nhap` · `mau`. Không có nguồn thật thì chưa lập thư viện.
3. Viết `build.mjs` + `sources/` (dữ liệu nguồn, không mang mã của phần mềm khác — D-LIB-9), khai `generatedBy`, đặt `itemSchema` chặt (kiểu, `required`, `enum`).
4. Viết README: dùng làm gì, trạng thái đối chiếu, cách cập nhật, căn cứ. Mục chưa đối chiếu với nguồn gốc giữ `verified: false`.

## Việc 3 — cập nhật mục, giá trị theo ngày, căn cứ pháp lý

1. Sửa nguồn → chạy script sinh (`node libraries/<id>/build.mjs`) — script đóng dấu băm và lên bản.
2. Giá trị mới từ một ngày: **đóng** khoảng đang mở (`to`) và **thêm** khoảng mới (`from`) — minor. Sửa giá trị khoảng đã phát hành là major và phải có lý do / căn cứ.
3. Căn cứ: `basis[].key` trỏ **mã hoặc bí danh** trong `vn.can-cu-phap-ly` (vd `TT99`). Văn bản chưa có → thêm vào `packages/vn-rulepacks/registry/legal-sources.json` rồi `node libraries/vn.can-cu-phap-ly/build.mjs`. Người duyệt xác nhận căn cứ ở HT14 → Căn cứ, không phải agent.
4. `npx bizcity library diff <id>` phải ra `KẾT LUẬN: PASS`: bản đã khai ≥ bản cần lên (major bỏ / đổi nghĩa · minor thêm · patch đổi chữ), không lỗi khuôn.

## Chỉ báo "xong" khi

- `npx bizcity library check …` ra **PASS** cho các ô mẫu của việc (WARN thì nêu rõ cảnh báo nào và người dùng đã đồng ý);
- việc có sửa `libraries/*`: `npx bizcity library diff <id>` PASS **và** `node tests/conformance/selfcheck.mjs --only SC-LIB` ĐẠT.

Không có máy chủ và chưa dựng platform thì `library check` ra SKIP — báo người dùng là **chưa kiểm**, kèm lệnh dựng; không ghi "đạt".
