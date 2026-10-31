# Công nghệ sử dụng

Tài liệu trả lời bốn câu hỏi: phần mềm viết bằng gì, vì sao chọn như vậy, bảo trì và mở rộng ra sao, và người dùng quen phần mềm cài trên Windows chuyển sang bản chạy trên trình duyệt thì thế nào.

Cập nhật: 10/10/2026.

---

## 1. Tóm tắt

| Lớp | Công nghệ | Phiên bản |
|---|---|---|
| Ngôn ngữ (cả giao diện lẫn máy chủ) | **TypeScript** | 5.6 |
| Giao diện | **React** + Vite | React 18.3, Vite 5.4 |
| Điều hướng trang | React Router | 6.28 |
| Lấy và giữ dữ liệu trên giao diện | TanStack Query | 5.59 |
| Biểu tượng | lucide-react | 0.454 |
| Kiểu dáng | CSS thuần, một file biến màu và thành phần (`apps/web/src/styles/theme.css`) | — |
| Máy chủ API | **Node.js** + **Fastify** | Node 22, Fastify 5.1 |
| Kiểm tra dữ liệu vào / ra | zod | 3.25 |
| Truy vấn cơ sở dữ liệu | Kysely (viết SQL có kiểm tra kiểu) | 0.27 |
| Cơ sở dữ liệu | **PostgreSQL** | 16 |
| Đăng nhập | JWT (thư viện jose), mật khẩu băm scrypt | — |
| Tài liệu API | OpenAPI, xem tại `/api/docs` | — |
| Kiểm thử | vitest, chạy trên PostgreSQL thật | 2.1 |
| Đóng gói, chạy | **Docker Compose**: 3 container `db`, `api`, `web` (nginx) | — |

Giao diện là **ứng dụng web một trang**: người dùng mở bằng Chrome hoặc Edge, không cài gì lên máy.

---

## 2. Cấu trúc dự án

```
tgs-ketoan/
├── packages/contracts/      Khuôn dữ liệu dùng chung: chứng từ, phiếu, hằng số nghiệp vụ
├── apps/api/                Máy chủ
│   ├── migrations/          Các file SQL đánh số 0001 → 0009, chạy theo thứ tự
│   ├── seeds/               Dữ liệu ban đầu (hệ thống tài khoản…)
│   ├── src/modules/<ten>/   Mỗi nghiệp vụ một thư mục
│   └── test/                Phép thử tự động
├── apps/web/                Giao diện
│   └── src/features/<ten>/  Mỗi nhóm màn hình một thư mục
├── docs/                    Tài liệu kỹ thuật
│   └── huong-dan/           Hướng dẫn sử dụng từng màn (nút "Hướng dẫn" trên giao diện đọc ở đây)
└── docker-compose.yml
```

Quy mô hiện tại: 8 file migration, 7 bộ phép thử (71 phép), hơn 40 bài hướng dẫn sử dụng.

---

## 3. Vì sao chọn các công nghệ này

### Một ngôn ngữ cho cả hai đầu

Giao diện và máy chủ cùng viết bằng TypeScript, và cùng dùng gói `packages/contracts`. Khuôn của một chứng từ chỉ khai **một lần**; đổi một trường thì cả hai đầu báo lỗi ngay lúc biên dịch nếu chỗ nào chưa sửa theo. Người mới chỉ cần biết một ngôn ngữ.

### TypeScript thay vì JavaScript thuần

Phần mềm kế toán có nhiều loại dữ liệu dễ nhầm (tiền, mã tài khoản, bên Nợ / bên Có). Kiểu tĩnh bắt được phần lớn lỗi gõ nhầm tên trường, quên trường, sai kiểu trước khi chạy.

### React

Phổ biến, dễ tuyển người, nhiều tài liệu. Mỗi màn hình là một hàm nhận dữ liệu và trả giao diện; các phần dùng chung (ô lọc kỳ, ô chọn chi nhánh, bảng, hộp phiếu) viết một lần, mọi màn dùng lại.

### PostgreSQL

- Kiểu `numeric` giữ tiền chính xác tới đồng, không sai số như số thực.
- Ràng buộc và trigger bảo vệ sổ cái **ngay ở tầng cơ sở dữ liệu**: không sửa, không xoá dòng sổ cái; bút toán phải cân Nợ = Có. Dù code có lỗi, dữ liệu sai cũng không vào được.
- Transaction đảm bảo một chứng từ hoặc ghi trọn, hoặc không ghi gì.
- Mã nguồn mở, không tốn phí bản quyền.

### Fastify, zod, Kysely

- **zod** kiểm tra mọi dữ liệu gửi vào API theo khuôn, trả lỗi rõ từng trường, và tự sinh tài liệu API.
- **Kysely** cho viết SQL rõ ràng mà vẫn được kiểm tra tên bảng, tên cột lúc biên dịch. Các báo cáo kế toán cần SQL viết tay để kiểm soát, không dùng ORM che mất câu truy vấn.
- **Fastify** nhẹ, nhanh, tổ chức theo plugin nên mỗi nghiệp vụ tự đăng ký đường dẫn của mình.

### Docker

Một lệnh `docker compose up -d --build` dựng đủ cơ sở dữ liệu, máy chủ, giao diện, giống nhau trên máy phát triển và máy chủ thật. Không phải cài Node, PostgreSQL bằng tay.

---

## 4. Dễ bảo trì, mở rộng ở chỗ nào

### Chia tầng cố định

Mỗi nghiệp vụ ở máy chủ là một thư mục, bên trong luôn cùng một cách chia:

| File | Trách nhiệm |
|---|---|
| `<ten>.schemas.ts` | Khuôn dữ liệu vào / ra |
| `<ten>.routes.ts` | Đường dẫn API, quyền cần có |
| `<ten>.service.ts` | Luật nghiệp vụ |
| `<ten>.repository.ts` | Câu truy vấn cơ sở dữ liệu |

Biết một module là đọc được mọi module khác.

### Thêm một chức năng mới là thêm, không phải sửa

| Muốn thêm | Làm gì |
|---|---|
| Một báo cáo | Thêm hàm truy vấn (đọc `bizcity_read.*`) + một đường dẫn ở `phan-he/ke-toan/reports`, một trang ở `features/reports`, một dòng trong `layout/menu.ts` và `App.tsx`, một bài hướng dẫn |
| Một loại chứng từ tự động | Thêm khuôn ở `packages/contracts`, một luật định khoản ở `modules/posting/rules/` |
| Một cột, một bảng | Thêm file migration mới (không sửa file cũ), cập nhật `db/types.ts` |
| Một tiện ích ngoài lõi (bảng tính AI, xuất file…) | Viết thành **add-in**: thư mục riêng, đường dẫn riêng, tự gắn mục vào menu, bật tắt bằng cấu hình. Xem `docs/add-in.md` |

### Những thứ giữ cho code không hỏng dần

- **Phép thử tự động** chạy trên PostgreSQL thật, kiểm các bất biến kế toán: sổ luôn cân, gửi lại không ghi trùng, doanh thu trên báo cáo bán hàng bằng sổ cái, báo cáo tình hình tài chính cân trước và sau kết chuyển.
- **Sổ cái chỉ thêm**: sửa hay huỷ đều ghi thêm bút toán số âm. Luôn truy lại được ai ghi gì, lúc nào, phiên bản nào.
- **Cấu hình thay cho code cứng**: tài khoản định khoản, bút toán kết chuyển, loại thuế, hình thức thanh toán đều do kế toán khai trên giao diện.
- **Nhiều đơn vị trên một hệ thống**: mọi bảng có `tenant_id`, sẵn sàng cho đơn vị khác dùng chung.
- **Chú thích tiếng Việt** ở đầu mỗi file nói file đó làm gì và luật nghiệp vụ nó giữ.

Tài liệu liên quan: `docs/kien-truc.md`, `docs/co-so-du-lieu.md`, `docs/api-tich-hop.md`, `docs/phat-trien.md`.

---

## 5. Từ phần mềm cài trên Windows sang bản chạy trên trình duyệt

### Những gì giữ quen tay

| Trước đây | Bây giờ |
|---|---|
| Bảng điều khiển bên trái, 10 nhóm chức năng | Thanh menu bên trái, cùng tên và thứ tự 10 nhóm, cùng tên chức năng; chức năng chưa làm hiện mờ "chưa có" |
| Gọi chức năng bằng số mã (10, 12, 65, 88…) | Giữ nguyên mã quen: ACC10, ACC12, ACC65, ACC88. Nhấn Ctrl + K, gõ `65`, Enter |
| Màn báo cáo: ô lọc phía trên, bảng phía dưới, dòng tổng ở chân | Giữ nguyên bố cục |
| Lọc từ ngày, đến ngày, chọn nhiều chi nhánh | Có, thêm ô chọn nhanh kỳ (tháng này, tháng trước, quý, năm) |
| Bấm vào số chứng từ để mở chứng từ gốc | Bấm vào dòng: mở bút toán, từ đó mở chứng từ gốc |
| Nút Xuất, In | Nút Xuất Excel và In ở góc phải mỗi màn |
| Phiếu thu, chi, báo nợ, báo có, phiếu kế toán; chọn khoản mục, bộ phận, thuế trên từng dòng | Có đủ, cùng tên gọi |
| Thông báo lỗi quen thuộc ("tài khoản … bắt buộc phải chọn bộ phận", kỳ kế toán đã khoá…) | Giữ cách diễn đạt gần giống, kiểm tra ở máy chủ nên không lách được |

### Những gì khác đi và cần làm quen

| Khác biệt | Ảnh hưởng | Cách làm quen |
|---|---|---|
| Không cài đặt, mở bằng trình duyệt | Dùng được ở mọi máy trong mạng, không cần cài, cập nhật không phải làm lại từng máy | Lưu địa chỉ thành dấu trang |
| Mở nhiều màn cùng lúc thành các thẻ | Giống: mỗi màn một thẻ, chuyển thẻ giữ nguyên số liệu, × để đóng, chuột phải để đóng thẻ khác / đóng tất cả | Muốn đặt hai báo cáo cạnh nhau trên màn hình thì mở thêm cửa sổ trình duyệt |
| Bảng số liệu không kéo cột để nhóm, không lưu bố cục cột riêng từng người | Phân tích nâng cao làm trong Excel | Dùng Xuất Excel; các cách nhóm hay dùng đã có sẵn dạng thẻ (theo ngày, chi nhánh, mặt hàng…) |
| Nhập phiếu bằng bàn phím | Tab qua từng ô được; chưa có phím tắt thêm dòng, ghi nhanh | Sẽ bổ sung theo nhu cầu khi triển khai |
| In qua hộp thoại in của trình duyệt | Chọn máy in, khổ giấy ở hộp thoại đó; sổ in khổ A4 ngang, phiếu khổ A5 ngang | In thử một lần để chỉnh lề |
| Không còn bước "tính số dư", "chuyển số dư sang kỳ sau" | Số dư luôn tính sẵn theo chứng từ | Bỏ hẳn hai thao tác này |
| Sửa phiếu không ghi đè | Phiếu sửa sinh bút toán đảo (số âm) và bút toán mới; lịch sử còn nguyên | Xem lịch sử bằng ô "Hiện bút toán đã sửa" |
| Bán hàng tự về, không nhập lại | Việc của kế toán với phiếu bán là kiểm tra và đối chiếu | Xem màn Định khoản tự động (ACC14) và Kiểm tra chứng từ, hoá đơn (ACC93) |

### Những điểm web làm tốt hơn

- Mỗi màn có nút **Hướng dẫn** mở ngay bài chỉ dẫn của chính màn đó.
- Tìm chức năng bằng tên không dấu ("thue ra", "ket chuyen").
- Kỳ đang xem được nhớ khi chuyển báo cáo.
- Từ một con số trên báo cáo bấm dần xuống tới chứng từ gốc.
- Nhiều người dùng cùng lúc, mỗi người một tài khoản và vai trò; các thao tác lập, sửa, huỷ phiếu, kết chuyển, đổi cấu hình đều có nhật ký.

### Đánh giá thẳng

Các chị sẽ **nhận ra ngay** bố cục và tên gọi, nên phần xem báo cáo, đối chiếu gần như không phải học lại. Phần cần thời gian làm quen nhất là **nhập phiếu số lượng lớn bằng bàn phím** và **thao tác trên lưới** (nhóm cột, lọc tại cột), vì phần mềm cài trên Windows vốn mạnh ở hai điểm này. Đây là hai chỗ nên ưu tiên lấy góp ý trong đợt dùng thử.

### Yêu cầu máy người dùng

- Trình duyệt Chrome hoặc Edge bản mới.
- Màn hình từ 1366 × 768 trở lên.
- Máy nối được tới máy chủ đặt phần mềm (mạng nội bộ hoặc Internet tuỳ cách triển khai).

---

## 6. Chạy và triển khai

```bash
cp .env.example .env            # đặt JWT_SECRET, mật khẩu quản trị, khoá API ban đầu
docker compose up -d --build    # dựng và chạy db, api, web
```

- Giao diện: cổng 8088. Tài liệu API: `/api/docs`.
- Cơ sở dữ liệu tự nâng cấp khi máy chủ khởi động (chạy các migration chưa áp).
- Phát triển trên máy: xem `docs/phat-trien.md` (cần Node 22.12 trở lên).

Trước khi dùng thật cần làm thêm: đặt máy chủ, đổi mật khẩu và `JWT_SECRET`, bật HTTPS, lịch sao lưu cơ sở dữ liệu.
