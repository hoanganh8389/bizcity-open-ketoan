# Phân quyền (`phan-quyen`) — Role Editor, mã màn HT12

> Module Bizcity **chỉ có giao diện** (ADR-0024, ADR-0027 Phụ lục A "Chữ chốt W4"). Không bảng, không action riêng: mọi việc ghi đi qua API Core. Máy chủ quyết mọi luật (chống leo thang, quyền lạ, nhập lại mật khẩu); màn chỉ vẽ và gửi.

## Nghiệp vụ

Quản trị viên (quyền `users:write`) thấy **ai được làm gì** và sửa được:

- **Ma trận quyền:** hàng = quyền trong sổ quyền (Core + module), cột = 6 vai trò hệ thống (chỉ đọc) và vai trò của đơn vị, ô = **Có** · **Cấm** · **—**. Bấm ô của vai trò đơn vị để Cho / Cấm / gỡ luật.
- **Vai trò:** tạo vai trò của đơn vị (mã, loại, vai trò nền — không đổi được sau khi tạo), đổi tên, vô hiệu / bật lại.
- **Người dùng:** "Xem như" (quyền hiệu lực và nguồn: vai trò chính, bổ sung, nền, Cho, Cấm), lịch sử gán, gán / thu hồi vai trò.

Quyền hiệu lực = (vai trò chính ∪ vai trò bổ sung ∪ nền + Cho của vai trò đơn vị) − Cấm. **Cấm thắng**, trừ chủ đơn vị. Cho quyền rủi ro cao (và gán vai trò có quyền đó) đòi **nhập lại mật khẩu**: hộp thoại không lưu mật khẩu.

## API dùng (Core)

| Việc | HTTP |
|---|---|
| Ma trận | `GET /api/v1/roles/matrix` |
| Danh sách / chi tiết vai trò | `GET /api/v1/roles`, `GET /api/v1/roles/:id` |
| Tạo / sửa vai trò | `POST /api/v1/roles`, `PATCH /api/v1/roles/:id` |
| Thêm / gỡ luật | `POST /api/v1/roles/:id/rules`, `POST /api/v1/roles/:id/rules/:ruleId/remove` |
| Người dùng, lịch sử gán, Xem như | `GET /api/v1/users`, `GET /api/v1/users/:id/roles`, `GET /api/v1/users/:id/effective-permissions` |
| Gán / thu hồi | `POST /api/v1/users/:id/roles`, `POST /api/v1/users/:id/roles/:assignmentId/revoke` |

Tất cả cần `users:write` (D-AUTH-13: chưa có quyền Core riêng cho phân quyền).

## Sự kiện

Chưa phát, chưa nghe sự kiện nào.

## Màn

| Mã | Đường dẫn | Màn |
|---|---|---|
| HT12 | `/app/phan-quyen/vai-tro` | Ma trận quyền · Vai trò · Người dùng |

## Tệp

| Tệp | Việc |
|---|---|
| `web/lib/matrix.ts` | Logic thuần: gom nhóm, đọc ô, giải thích ô (test `test/matrix.test.ts`, chạy `npm test -w @bizcity-module/phan-quyen`) |
| `web/screens/*.tsx` | Màn (chỉ `@bizcity/ui-kit`, `react`) |

## Chưa có

Phạm vi kho trong màn gán (chi nhánh đã có từ W5 đợt 1 — chỉ có tác dụng ở cửa nạp chứng từ), điều kiện của luật, thẻ nhật ký phân quyền, nhập / xuất vai trò.
