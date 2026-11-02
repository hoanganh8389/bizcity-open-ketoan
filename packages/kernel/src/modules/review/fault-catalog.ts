// @bizcity-layer K kernel/review
// [2026-11-02 10:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — danh mục giả định lỗi F22 (bizcity_fault_catalog@1) — SINH TỪ 10-DANH-MUC-GIA-DINH.md bằng script, không sửa tay; module TS để có trong dist khi triển khai.
export type FaultLevel = 'block' | 'error' | 'warn' | 'hint' | 'none';
export type FaultStatus = 'done' | 'blocked' | 'planned-021' | 'todo' | 'deferred';
export interface FaultCase { id: string; group: string; title: string; detectors: string[]; detectText: string; level: FaultLevel; personas: string[]; primary: string[]; consequence: string; remedyText: string; verifyText: string; status: FaultStatus; statusNote?: string }
export interface FaultCatalog { contract: string; source: string; groups: Record<string, string>; cases: FaultCase[] }
export const FAULT_CATALOG: FaultCatalog = {
  "contract": "bizcity_fault_catalog@1",
  "source": "docs/phases/PHASE-022-GIA-DINH-LOI-DANH-GIA-THEO-VAI/10-DANH-MUC-GIA-DINH.md",
  "groups": {
    "ENV": "Môi trường, bản cài",
    "DOC": "Chứng từ, cửa nạp",
    "TAX": "Thuế, hoá đơn",
    "STK": "Kho, giá vốn",
    "CLOSE": "Cuối kỳ, kết chuyển, khoá kỳ",
    "LEDGER": "Sổ, lệch sổ",
    "DEBT": "Công nợ",
    "CASH": "Tiền",
    "FA": "Tài sản, chi phí trả trước",
    "SEC": "Phân quyền, bằng chứng"
  },
  "cases": [
    {
      "id": "F22-ENV-01",
      "group": "ENV",
      "title": "Cập nhật mã mới nhưng chưa áp migration",
      "detectors": [
        "MIGRATIONS_PENDING",
        "NOT_READY"
      ],
      "detectText": "`MIGRATIONS_PENDING` (DG-DB-1); API trả `NOT_READY`",
      "level": "error",
      "personas": [
        "auditor",
        "chief_accountant"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "màn hình lỗi, chức năng mới không lưu được",
      "remedyText": "① Vận hành chạy `docker compose up db-migrate` (hoặc `npm run db:migrate`). ② Khởi động lại API. ③ Không nhập chứng từ tới khi xong",
      "verifyText": "`MIGRATIONS_PENDING`",
      "status": "done"
    },
    {
      "id": "F22-ENV-02",
      "group": "ENV",
      "title": "Trigger bảo vệ sổ (chỉ thêm, cân Nợ = Có, chặn TRUNCATE) bị tắt hoặc thiếu",
      "detectors": [
        "LEDGER_TRIGGERS"
      ],
      "detectText": "`LEDGER_TRIGGERS` (DG-DB-2)",
      "level": "error",
      "personas": [
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "sổ có thể bị sửa / xoá ngoài luồng",
      "remedyText": "① Dừng ghi sổ toàn đơn vị. ② Vận hành chạy lại migration để dựng lại trigger. ③ Tra nhật ký CSDL xem ai / lúc nào tắt (R-KER-3), lập biên bản. ④ Báo nhóm Lõi kèm mã tra cứu; chạy lại toàn bộ L3",
      "verifyText": "`LEDGER_TRIGGERS` rồi cả L3",
      "status": "done"
    },
    {
      "id": "F22-ENV-03",
      "group": "ENV",
      "title": "API trỏ vào CSDL chỉ đọc (bản sao, sau khôi phục)",
      "detectors": [
        "DB_WRITABLE"
      ],
      "detectText": "`DB_WRITABLE` (DG-DB-4)",
      "level": "error",
      "personas": [
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "mọi lần ghi lỗi",
      "remedyText": "① Vận hành trỏ `DATABASE_URL` về bản chính. ② Khởi động lại API",
      "verifyText": "`DB_WRITABLE`",
      "status": "done"
    },
    {
      "id": "F22-ENV-04",
      "group": "ENV",
      "title": "API kết nối bằng vai trò CSDL quá quyền (superuser, chủ bảng)",
      "detectors": [
        "DB_APP_ROLE"
      ],
      "detectText": "`DB_APP_ROLE` (DG-SEC-1, -2)",
      "level": "error",
      "personas": [
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "RLS có thể bị vượt, đơn vị đọc chéo",
      "remedyText": "① Vận hành đặt `DB_APP_PASSWORD`, dùng vai trò `ketoan_app` (scripts/cap-nhat.sh tự làm). ② Khởi động lại",
      "verifyText": "`DB_APP_ROLE`",
      "status": "done"
    },
    {
      "id": "F22-ENV-05",
      "group": "ENV",
      "title": "Bảng mới có `tenant_id` mà chưa bật RLS + FORCE + chính sách",
      "detectors": [
        "TENANT_ISOLATION"
      ],
      "detectText": "`TENANT_ISOLATION` (DG-PLAN-5)",
      "level": "error",
      "personas": [
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "dữ liệu đơn vị này lộ sang đơn vị khác",
      "remedyText": "① Nhóm phát triển thêm migration bật RLS cho bảng đó (mẫu ở 0041). ② Phát hành bản vá",
      "verifyText": "`TENANT_ISOLATION`",
      "status": "done"
    },
    {
      "id": "F22-ENV-06",
      "group": "ENV",
      "title": "Chuỗi băm bằng chứng (`audit_logs`) đứt / bị sửa",
      "detectors": [
        "EVIDENCE_CHAIN"
      ],
      "detectText": "`EVIDENCE_CHAIN` (DG-EVD-1)",
      "level": "error",
      "personas": [
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "mất khả năng chứng minh ai làm gì",
      "remedyText": "① Không xoá / sửa thêm. ② Xuất đoạn chuỗi đứt (số thứ tự, băm). ③ Báo nhóm Lõi + ban kiểm soát, lập biên bản sự cố",
      "verifyText": "`EVIDENCE_CHAIN`",
      "status": "done"
    },
    {
      "id": "F22-ENV-07",
      "group": "ENV",
      "title": "Sự kiện gửi hệ thống ngoài hết lượt thử (dead)",
      "detectors": [
        "EVENT_DEAD"
      ],
      "detectText": "`EVENT_DEAD` (DG-EVT-1)",
      "level": "warn",
      "personas": [
        "chief_accountant"
      ],
      "primary": [
        "chief_accountant"
      ],
      "consequence": "hệ thống bán hàng / webhook không nhận cập nhật",
      "remedyText": "① Xem lỗi ở Hệ thống → sự kiện (`GET /api/v1/system/events`). ② Sửa nguyên nhân (địa chỉ nhận, khoá). ③ Phát lại (`core.events.replay`)",
      "verifyText": "`EVENT_DEAD`",
      "status": "done"
    },
    {
      "id": "F22-ENV-08",
      "group": "ENV",
      "title": "Khoá lạ trong cấu hình đơn vị (`tenants.settings`)",
      "detectors": [
        "SETTINGS_UNKNOWN"
      ],
      "detectText": "`SETTINGS_UNKNOWN` (DG-SET-1)",
      "level": "warn",
      "personas": [
        "auditor"
      ],
      "primary": [],
      "consequence": "cấu hình không có tác dụng, dễ hiểu nhầm",
      "remedyText": "① Đối chiếu với registry cấu hình. ② Xoá khoá lạ qua màn cấu hình hoặc đăng ký khoá mới (nhóm phát triển)",
      "verifyText": "`SETTINGS_UNKNOWN`",
      "status": "done"
    },
    {
      "id": "F22-ENV-09",
      "group": "ENV",
      "title": "Đơn vị chưa khai hồ sơ kế toán cho ngày đang xét",
      "detectors": [
        "PROFILE_DECLARED"
      ],
      "detectText": "`PROFILE_DECLARED` (DG-PROFILE-1)",
      "level": "warn",
      "personas": [
        "chief_accountant",
        "auditor"
      ],
      "primary": [
        "chief_accountant"
      ],
      "consequence": "Kiểm chuẩn không chọn được bộ quy định, ca \"Chờ duyệt\"",
      "remedyText": "① Kế toán trưởng / chủ mở Hệ thống → Hồ sơ kế toán (HT07, `/he-thong/ho-so-ke-toan`). ② Chọn năm tài chính, chế độ, loại pháp nhân, ghi căn cứ. ③ Phát hành",
      "verifyText": "`PROFILE_DECLARED`",
      "status": "done"
    },
    {
      "id": "F22-ENV-10",
      "group": "ENV",
      "title": "Gói định khoản đang cài khác chế độ của hồ sơ",
      "detectors": [
        "PROFILE_PACK_REGIME"
      ],
      "detectText": "`PROFILE_PACK_REGIME` (DG-PROFILE-2)",
      "level": "warn",
      "personas": [
        "chief_accountant"
      ],
      "primary": [
        "chief_accountant"
      ],
      "consequence": "hệ thống tài khoản / luật định khoản không đúng chế độ",
      "remedyText": "① Kiểm lại hồ sơ ở HT07 (chế độ có đúng không). ② Nếu đúng: cài gói định khoản của chế độ đó cho năm tài chính kế tiếp (không đổi giữa năm). ③ Nếu hồ sơ sai: phát hành hồ sơ mới",
      "verifyText": "`PROFILE_PACK_REGIME`",
      "status": "done"
    },
    {
      "id": "F22-ENV-11",
      "group": "ENV",
      "title": "Rulepack đã duyệt tại đơn vị, sau đó cập nhật gói rulepack (lệch nội dung)",
      "detectors": [],
      "detectText": "`core.conformance.rulepacks` (`local.stale`)",
      "level": "warn",
      "personas": [
        "chief_accountant",
        "auditor"
      ],
      "primary": [
        "chief_accountant"
      ],
      "consequence": "ca của rulepack quay về \"Chờ duyệt\"",
      "remedyText": "① Mở Hệ thống → Kiểm chuẩn (HT06), khối \"Rulepack và duyệt tại đơn vị\". ② Đọc nhật ký thay đổi rulepack. ③ Người duyệt kế toán (+ thuế) duyệt lại",
      "verifyText": "trạng thái rulepack ở HT06",
      "status": "done"
    },
    {
      "id": "F22-ENV-12",
      "group": "ENV",
      "title": "Lịch đêm không chạy (lượt kiểm chuẩn gần nhất quá 2 ngày)",
      "detectors": [
        "CONFORMANCE_STALE"
      ],
      "detectText": "`CONFORMANCE_STALE`",
      "level": "warn",
      "personas": [
        "auditor"
      ],
      "primary": [],
      "consequence": "bảng điểm cũ, lỗi theo thời gian không được bắt",
      "remedyText": "① Vận hành kiểm tiến trình API (đồng hồ sự kiện chạy trong API). ② Xem `EVENT_DEAD` của `core.conformance-nightly`. ③ Bấm \"Chạy kiểm chuẩn\" ở HT06",
      "verifyText": "`CONFORMANCE_STALE`",
      "status": "done"
    },
    {
      "id": "F22-DOC-01",
      "group": "DOC",
      "title": "Chứng từ thiếu trường bắt buộc / sai kiểu / ngày sai dạng",
      "detectors": [
        "VALIDATION_ERROR"
      ],
      "detectText": "`IN-SHAPE-001..006`; hôm nay `VALIDATION_ERROR`",
      "level": "block",
      "personas": [
        "chief_accountant"
      ],
      "primary": [
        "chief_accountant"
      ],
      "consequence": "chứng từ không vào hệ thống",
      "remedyText": "① Mở chứng từ ở Trạm kiểm tra (PHASE-021). ② Sửa đúng trường được chỉ (đường dẫn `lines[2].qty`…) ở nguồn hoặc tại bể. ③ Bấm Kiểm thử rồi Nộp lại",
      "verifyText": "Kiểm thử ở Trạm",
      "status": "planned-021"
    },
    {
      "id": "F22-DOC-02",
      "group": "DOC",
      "title": "Tổng các dòng ≠ tổng chứng từ (tới xu)",
      "detectors": [],
      "detectText": "`IN-SUM-001`; `assertTotals`",
      "level": "block",
      "personas": [
        "chief_accountant"
      ],
      "primary": [
        "chief_accountant"
      ],
      "consequence": "sổ sai tổng",
      "remedyText": "① Sửa dòng hoặc tổng ở nguồn cho khớp. ② Nếu nguồn làm tròn theo dòng: bật làm tròn tổng ở nguồn",
      "verifyText": "Kiểm thử ở Trạm",
      "status": "blocked"
    },
    {
      "id": "F22-DOC-03",
      "group": "DOC",
      "title": "Tiền thuế ≠ cơ sở × thuế suất ngoài sai số làm tròn",
      "detectors": [],
      "detectText": "`IN-SUM-003`",
      "level": "warn",
      "personas": [
        "chief_accountant",
        "tax_inspector"
      ],
      "primary": [
        "tax_inspector"
      ],
      "consequence": "thuế kê khai lệch hoá đơn",
      "remedyText": "① So với hoá đơn gốc. ② Sửa tiền thuế hoặc loại thuế của dòng. ③ Hoá đơn sai thì lập hoá đơn điều chỉnh",
      "verifyText": "Kiểm thử ở Trạm",
      "status": "planned-021"
    },
    {
      "id": "F22-DOC-04",
      "group": "DOC",
      "title": "Mã hàng sai quy tắc / chưa có trong danh mục",
      "detectors": [],
      "detectText": "`IN-MD-002`, `IN-MD-004`",
      "level": "warn",
      "personas": [
        "chief_accountant"
      ],
      "primary": [
        "chief_accountant"
      ],
      "consequence": "tồn kho, giá vốn tách sai mã",
      "remedyText": "① Thêm mã ở Danh mục mặt hàng, hoặc ② sửa mã ở nguồn cho đúng quy tắc mã hàng",
      "verifyText": "Kiểm thử ở Trạm",
      "status": "planned-021"
    },
    {
      "id": "F22-DOC-05",
      "group": "DOC",
      "title": "Đơn vị tính không khai cho mặt hàng",
      "detectors": [],
      "detectText": "`IN-MD-003`",
      "level": "block",
      "personas": [
        "chief_accountant"
      ],
      "primary": [
        "chief_accountant"
      ],
      "consequence": "không quy đổi số lượng, tồn kho / giá vốn sai",
      "remedyText": "① Khai ĐVT và tỉ lệ quy đổi ở mặt hàng. ② Hoặc sửa ĐVT ở nguồn",
      "verifyText": "Kiểm thử ở Trạm",
      "status": "planned-021"
    },
    {
      "id": "F22-DOC-06",
      "group": "DOC",
      "title": "Bán / mua nợ mà không có đối tượng",
      "detectors": [],
      "detectText": "`IN-MD-007`",
      "level": "block",
      "personas": [
        "chief_accountant",
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "công nợ không theo dõi được",
      "remedyText": "① Gắn khách hàng / nhà cung cấp ở nguồn. ② Bán lẻ thu tiền ngay thì ghi đủ dòng thanh toán",
      "verifyText": "Kiểm thử ở Trạm",
      "status": "planned-021"
    },
    {
      "id": "F22-DOC-07",
      "group": "DOC",
      "title": "`docKey` không mang tiền tố của module / app gửi",
      "detectors": [],
      "detectText": "`IN-BIZ-003`; `ownDocument`",
      "level": "block",
      "personas": [
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "một nguồn ghi đè chứng từ của nguồn khác",
      "remedyText": "① Sửa cấu hình nguồn dùng đúng tiền tố được cấp. ② Không đổi tiền tố của chứng từ đã gửi",
      "verifyText": "— (bị chặn)",
      "status": "blocked"
    },
    {
      "id": "F22-DOC-08",
      "group": "DOC",
      "title": "Gửi phiên bản nhỏ hơn bản đã nhận",
      "detectors": [
        "CONFLICT"
      ],
      "detectText": "`IN-BIZ-004`; `CONFLICT`",
      "level": "block",
      "personas": [
        "auditor"
      ],
      "primary": [],
      "consequence": "ghi đè bản mới bằng bản cũ",
      "remedyText": "① Nguồn gửi lại với `version` lớn hơn bản đang có. ② Kiểm đồng hồ / hàng đợi của nguồn",
      "verifyText": "— (bị chặn)",
      "status": "blocked"
    },
    {
      "id": "F22-DOC-09",
      "group": "DOC",
      "title": "Cùng `docKey` + phiên bản nhưng nội dung khác",
      "detectors": [],
      "detectText": "`IN-BIZ-005`",
      "level": "warn",
      "personas": [
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "bản sửa bị bỏ qua như \"không đổi\"",
      "remedyText": "① Nguồn tăng `version` khi sửa. ② Gửi lại",
      "verifyText": "Kiểm thử ở Trạm",
      "status": "planned-021"
    },
    {
      "id": "F22-DOC-10",
      "group": "DOC",
      "title": "Chứng từ có ngày thuộc kỳ đã khoá",
      "detectors": [
        "PERIOD_LOCKED"
      ],
      "detectText": "`PERIOD_LOCKED`; `IN-BIZ-001`",
      "level": "block",
      "personas": [
        "chief_accountant"
      ],
      "primary": [
        "chief_accountant"
      ],
      "consequence": "không ghi được",
      "remedyText": "① Ghi vào kỳ đang mở (điều chỉnh kỳ sau), hoặc ② kế toán trưởng mở khoá kỳ có lý do (ACC2, `/cau-hinh/ky-ke-toan`), ghi xong khoá lại",
      "verifyText": "—",
      "status": "blocked"
    },
    {
      "id": "F22-DOC-11",
      "group": "DOC",
      "title": "Chứng từ chờ định khoản / lỗi quá 3 ngày",
      "detectors": [
        "EVENT_PENDING_AGE"
      ],
      "detectText": "`EVENT_PENDING_AGE` (DG-EVENT-3)",
      "level": "warn",
      "personas": [
        "chief_accountant"
      ],
      "primary": [
        "chief_accountant"
      ],
      "consequence": "báo cáo thiếu số",
      "remedyText": "① Mở Định khoản tự động (ACC14, `/chung-tu`), thẻ Chờ / Lỗi. ② Xem trước bút toán; thiếu cấu hình thì bổ sung (F22-DOC-12). ③ Định khoản, hoặc huỷ có lý do",
      "verifyText": "`EVENT_PENDING_AGE`",
      "status": "done"
    },
    {
      "id": "F22-DOC-12",
      "group": "DOC",
      "title": "Định khoản lỗi vì thiếu cấu hình (lý do, tài khoản, nhóm hạch toán)",
      "detectors": [
        "POSTING_FAILED"
      ],
      "detectText": "`POSTING_FAILED`; `IN-POST-001..003`; bảng kiểm khoá kỳ `errors`",
      "level": "warn",
      "personas": [
        "chief_accountant"
      ],
      "primary": [
        "chief_accountant"
      ],
      "consequence": "chứng từ nằm ở thẻ Lỗi",
      "remedyText": "① Đọc lỗi ở ACC14. ② Bổ sung: Lý do – Tài khoản (ACC18, `/cau-hinh/ly-do`), Mặt hàng – Tài khoản (ACC17, `/cau-hinh/nhom-hach-toan`), Tài khoản ngầm định (ACC41). ③ Định khoản lại ở ACC14 (nguồn không cần gửi lại)",
      "verifyText": "ACC14 thẻ Lỗi",
      "status": "done"
    },
    {
      "id": "F22-DOC-13",
      "group": "DOC",
      "title": "Chứng từ \"đã ghi sổ\" mà không còn bút toán hiệu lực",
      "detectors": [
        "EVENT_HAS_ENTRY"
      ],
      "detectText": "`EVENT_HAS_ENTRY` (DG-EVENT-2); bảng kiểm `entryMismatch`",
      "level": "warn",
      "personas": [
        "chief_accountant",
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "chứng từ có mà sổ không có",
      "remedyText": "① Mở chứng từ ở ACC14, xem nhật ký định khoản. ② Định khoản lại. ③ Lặp lại thì báo nhóm Lõi kèm mã tra cứu",
      "verifyText": "`EVENT_HAS_ENTRY`",
      "status": "done"
    },
    {
      "id": "F22-DOC-14",
      "group": "DOC",
      "title": "`posted_version` ≠ `version` (sổ theo phiên bản cũ)",
      "detectors": [
        "EVENT_POSTED_VERSION"
      ],
      "detectText": "`EVENT_POSTED_VERSION` (DG-EVENT-1)",
      "level": "error",
      "personas": [
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "sổ không khớp chứng từ mới nhất",
      "remedyText": "① Định khoản lại chứng từ ở ACC14 (đảo bút toán cũ, ghi mới). ② Còn lỗi: báo nhóm Lõi — không sửa trực tiếp",
      "verifyText": "`EVENT_POSTED_VERSION`",
      "status": "done"
    },
    {
      "id": "F22-DOC-15",
      "group": "DOC",
      "title": "Phiếu trả lại không nối được phiếu gốc",
      "detectors": [],
      "detectText": "bảng kiểm khoá kỳ `orphanReturns`",
      "level": "warn",
      "personas": [
        "chief_accountant",
        "tax_inspector"
      ],
      "primary": [
        "tax_inspector"
      ],
      "consequence": "giảm doanh thu / giá vốn không có cơ sở",
      "remedyText": "① Mở BC kiểm tra chứng từ (ACC93, `/bao-cao/kiem-tra-chung-tu`). ② Gắn phiếu gốc ở nguồn (số phiếu bán gốc). ③ Gửi lại",
      "verifyText": "`GET /periods/check`",
      "status": "done"
    },
    {
      "id": "F22-DOC-16",
      "group": "DOC",
      "title": "Nguồn báo xoá chứng từ, chưa ai huỷ",
      "detectors": [
        "EVENT_PENDING_AGE"
      ],
      "detectText": "`EVENT_PENDING_AGE` (sự việc chờ có `cancelRequestedAt`)",
      "level": "warn",
      "personas": [
        "chief_accountant"
      ],
      "primary": [
        "chief_accountant"
      ],
      "consequence": "chứng từ đã xoá ở nguồn vẫn nằm trong sổ",
      "remedyText": "① ACC14, dòng ghi \"Nguồn báo xoá (chờ huỷ)\". ② Xem lý do; đúng thì Huỷ (bút toán ghi số âm), sai thì liên hệ nguồn",
      "verifyText": "`EVENT_PENDING_AGE`",
      "status": "done"
    },
    {
      "id": "F22-TAX-01",
      "group": "TAX",
      "title": "Thuế GTGT đầu vào đã ghi sổ mà chưa có hoá đơn quá 30 ngày",
      "detectors": [
        "TAX_INPUT_NO_INVOICE"
      ],
      "detectText": "`TAX_INPUT_NO_INVOICE` (DG-TAX-1)",
      "level": "warn",
      "personas": [
        "chief_accountant",
        "tax_inspector"
      ],
      "primary": [
        "tax_inspector"
      ],
      "consequence": "bảng kê mua vào thiếu so với 133",
      "remedyText": "① Mở Bổ sung thông tin thuế (ACC78, `/thue/bo-sung-thong-tin`), lọc \"Chưa có hoá đơn\". ② Có hoá đơn: nhập số / ký hiệu / ngày → định khoản lại. ③ Không có: báo kế toán trưởng, bỏ đánh dấu được khấu trừ",
      "verifyText": "`TAX_INPUT_NO_INVOICE`",
      "status": "done"
    },
    {
      "id": "F22-TAX-02",
      "group": "TAX",
      "title": "Hàng bán ra dùng thuế suất giảm 8% ngoài thời gian giảm",
      "detectors": [
        "VAT_REDUCED_RATE"
      ],
      "detectText": "`VAT_REDUCED_RATE` (DG-VAT-1)",
      "level": "warn",
      "personas": [
        "chief_accountant",
        "tax_inspector"
      ],
      "primary": [
        "tax_inspector"
      ],
      "consequence": "thuế đầu ra kê thiếu",
      "remedyText": "① Mở chứng từ theo mẫu khoá. ② Sửa loại thuế mặt hàng / phiếu về thuế suất đúng (Mặt hàng, loại thuế bán). ③ Hoá đơn đã phát hành: lập hoá đơn điều chỉnh theo quy định, định khoản lại",
      "verifyText": "`VAT_REDUCED_RATE`",
      "status": "done"
    },
    {
      "id": "F22-TAX-03",
      "group": "TAX",
      "title": "Hàng thuộc danh mục không được giảm thuế mà dùng 8% trong thời gian giảm",
      "detectors": [],
      "detectText": "chưa có — cần nhóm hàng / mã HS theo danh mục loại trừ",
      "level": "warn",
      "personas": [
        "tax_inspector"
      ],
      "primary": [
        "tax_inspector"
      ],
      "consequence": "thuế đầu ra kê thiếu",
      "remedyText": "① Gắn nhóm \"không được giảm\" cho mặt hàng (khi có trường). ② Sửa loại thuế, lập hoá đơn điều chỉnh",
      "verifyText": "—",
      "status": "todo"
    },
    {
      "id": "F22-TAX-04",
      "group": "TAX",
      "title": "Hoá đơn mua vào ≥ 5 triệu (gồm thuế) được khấu trừ mà chưa có chứng từ thanh toán không dùng tiền mặt",
      "detectors": [
        "VAT_INPUT_NONCASH"
      ],
      "detectText": "`VAT_INPUT_NONCASH` (DG-VAT-2)",
      "level": "warn",
      "personas": [
        "chief_accountant",
        "tax_inspector"
      ],
      "primary": [
        "tax_inspector"
      ],
      "consequence": "thuế đầu vào chưa đủ điều kiện khấu trừ",
      "remedyText": "① ACC78, cột Chứng từ thanh toán. ② Nhập số chứng từ ngân hàng. ③ Chưa trả (trả chậm): theo dõi tới hạn; quá hạn không trả bằng chuyển khoản thì bỏ đánh dấu được khấu trừ",
      "verifyText": "`VAT_INPUT_NONCASH`",
      "status": "done"
    },
    {
      "id": "F22-TAX-05",
      "group": "TAX",
      "title": "Hoá đơn thiếu ký hiệu, thiếu tên / MST người bán, MST sai dạng",
      "detectors": [
        "INVOICE_FIELDS"
      ],
      "detectText": "`INVOICE_FIELDS` (DG-EINV-1)",
      "level": "warn",
      "personas": [
        "chief_accountant",
        "tax_inspector"
      ],
      "primary": [
        "tax_inspector"
      ],
      "consequence": "bảng kê không khớp dữ liệu cơ quan thuế",
      "remedyText": "① ACC78, mẫu \"số chứng từ: điểm thiếu\". ② Bổ sung từ hoá đơn gốc. ③ Đối tượng thiếu MST: sửa ở Danh mục đối tượng",
      "verifyText": "`INVOICE_FIELDS`",
      "status": "done"
    },
    {
      "id": "F22-TAX-06",
      "group": "TAX",
      "title": "Hoá đơn bán hàng hoá lập sau ngày giao hàng",
      "detectors": [
        "INVOICE_ISSUE_DATE"
      ],
      "detectText": "`INVOICE_ISSUE_DATE` (DG-EINV-2)",
      "level": "warn",
      "personas": [
        "tax_inspector"
      ],
      "primary": [
        "tax_inspector"
      ],
      "consequence": "lập hoá đơn chậm thời điểm, có thể bị xử phạt",
      "remedyText": "① Kiểm quy trình xuất hoá đơn ở bán hàng (xuất ngay khi giao). ② Dịch vụ / bán theo đợt: ghi chú căn cứ thời điểm riêng khi xác nhận cảnh báo",
      "verifyText": "`INVOICE_ISSUE_DATE`",
      "status": "done"
    },
    {
      "id": "F22-TAX-07",
      "group": "TAX",
      "title": "Số hoá đơn đã có ở chứng từ khác",
      "detectors": [],
      "detectText": "`IN-BIZ-006`",
      "level": "warn",
      "personas": [
        "tax_inspector",
        "auditor"
      ],
      "primary": [
        "tax_inspector"
      ],
      "consequence": "kê trùng, khấu trừ hai lần",
      "remedyText": "① So hai chứng từ. ② Trùng thật: huỷ một bản; khác nhà cung cấp: kiểm ký hiệu",
      "verifyText": "Kiểm thử ở Trạm",
      "status": "planned-021"
    },
    {
      "id": "F22-TAX-08",
      "group": "TAX",
      "title": "Kỳ kê khai trước tháng của ngày hoá đơn",
      "detectors": [],
      "detectText": "`taxIssues`; ACC78 từ chối",
      "level": "block",
      "personas": [
        "tax_inspector"
      ],
      "primary": [],
      "consequence": "kê sai kỳ",
      "remedyText": "① Chọn kỳ kê khai từ tháng của ngày hoá đơn trở đi",
      "verifyText": "— (bị chặn)",
      "status": "blocked"
    },
    {
      "id": "F22-TAX-09",
      "group": "TAX",
      "title": "Sổ hoá đơn ≠ phát sinh tài khoản thuế GTGT trong kỳ",
      "detectors": [
        "TAX_BOOK_MATCH"
      ],
      "detectText": "`TAX_BOOK_MATCH` (DG-PLAN-2)",
      "level": "error",
      "personas": [
        "tax_inspector",
        "auditor"
      ],
      "primary": [
        "tax_inspector"
      ],
      "consequence": "tờ khai lệch sổ",
      "remedyText": "① Mở Báo cáo thuế vào / ra (ACC64, ACC65). ② So từng chứng từ với sổ chi tiết tài khoản thuế (ACC12). ③ Chứng từ thiếu hoá đơn: F22-TAX-01; bút toán tay vào tài khoản thuế: F22-LEDGER-10",
      "verifyText": "`TAX_BOOK_MATCH`",
      "status": "todo"
    },
    {
      "id": "F22-TAX-10",
      "group": "TAX",
      "title": "Hoá đơn của cơ quan thuế có (người bán đã xuất) mà sổ chưa có",
      "detectors": [],
      "detectText": "màn Hoá đơn từ cơ quan thuế (THUE01) — chưa có mã kiểm",
      "level": "warn",
      "personas": [
        "tax_inspector"
      ],
      "primary": [
        "tax_inspector"
      ],
      "consequence": "thiếu chi phí / thuế đầu vào, hoặc mua hàng không ghi sổ",
      "remedyText": "① Mở THUE01, lọc \"chưa khớp\". ② Nhập phiếu mua tương ứng, hoặc ③ ghi chú lý do (hoá đơn không thuộc đơn vị)",
      "verifyText": "THUE01",
      "status": "todo"
    },
    {
      "id": "F22-TAX-11",
      "group": "TAX",
      "title": "Hoá đơn từ người bán thuộc danh sách rủi ro",
      "detectors": [],
      "detectText": "màn Cảnh báo hoá đơn rủi ro (THUE02) — chưa có mã kiểm",
      "level": "warn",
      "personas": [
        "tax_inspector"
      ],
      "primary": [
        "tax_inspector"
      ],
      "consequence": "thuế đầu vào bị loại",
      "remedyText": "① Mở THUE02. ② Xác minh người bán (tra cứu MST). ③ Rủi ro thật: bỏ đánh dấu được khấu trừ ở ACC78",
      "verifyText": "THUE02",
      "status": "todo"
    },
    {
      "id": "F22-TAX-12",
      "group": "TAX",
      "title": "Ngày hoá đơn cách ngày chứng từ hơn 5 ngày",
      "detectors": [],
      "detectText": "`IN-BIZ-007`",
      "level": "hint",
      "personas": [
        "tax_inspector"
      ],
      "primary": [],
      "consequence": "dấu hiệu nhập muộn / sai ngày",
      "remedyText": "① Kiểm ngày chứng từ hoặc ngày hoá đơn, sửa ở nguồn nếu nhập nhầm",
      "verifyText": "Kiểm thử ở Trạm",
      "status": "planned-021"
    },
    {
      "id": "F22-STK-01",
      "group": "STK",
      "title": "Tồn kho âm theo mặt hàng × kho × ngày",
      "detectors": [
        "INVENTORY_NEGATIVE"
      ],
      "detectText": "`INVENTORY_NEGATIVE` (DG-INV-1); cảnh báo trước khoá kỳ",
      "level": "warn",
      "personas": [
        "chief_accountant",
        "tax_inspector"
      ],
      "primary": [
        "tax_inspector"
      ],
      "consequence": "giá vốn bình quân sai, chi phí không có cơ sở",
      "remedyText": "① Mẫu `<chi nhánh>:<kho>:<mã>@<ngày âm đầu>`: mở BC nhập xuất tồn (ACC83, `/bao-cao/nhap-xuat-ton`) tại ngày đó. ② Tìm phiếu nhập thiếu / trễ / sai kho / sai mã; bổ sung hoặc sửa ở nguồn. ③ Tính lại giá vốn tháng đó (ACC49). Không điều chỉnh kho cho \"khớp\"",
      "verifyText": "`INVENTORY_NEGATIVE`",
      "status": "done"
    },
    {
      "id": "F22-STK-02",
      "group": "STK",
      "title": "Tháng có hàng xuất mà chưa có phiếu giá vốn",
      "detectors": [
        "PERIOD_CLOSE_OPEN"
      ],
      "detectText": "`PERIOD_CLOSE_OPEN` (`gia-von`); bảng kiểm `cogs`",
      "level": "warn",
      "personas": [
        "chief_accountant"
      ],
      "primary": [
        "chief_accountant"
      ],
      "consequence": "lợi nhuận tháng sai",
      "remedyText": "① Tính giá vốn (ACC49, `/nghiep-vu/tinh-gia-von`) cho tháng và chi nhánh trong mẫu. ② Kết chuyển lại nếu đã kết chuyển (F22-STK-03)",
      "verifyText": "`PERIOD_CLOSE_OPEN`",
      "status": "done"
    },
    {
      "id": "F22-STK-03",
      "group": "STK",
      "title": "Tính lại giá vốn sau khi đã kết chuyển",
      "detectors": [
        "PERIOD_CLOSE_OPEN"
      ],
      "detectText": "`PERIOD_CLOSE_OPEN` (`thu-tu`); bảng kiểm `closingStale`",
      "level": "warn",
      "personas": [
        "chief_accountant",
        "auditor"
      ],
      "primary": [
        "chief_accountant"
      ],
      "consequence": "kết chuyển dùng số giá vốn cũ",
      "remedyText": "① Chạy lại Kết chuyển (ACC6, `/nghiep-vu/ket-chuyen`) cho tháng đó",
      "verifyText": "`PERIOD_CLOSE_OPEN`",
      "status": "done"
    },
    {
      "id": "F22-STK-04",
      "group": "STK",
      "title": "Phiếu nhập về / sửa sau khi đã tính giá vốn tháng",
      "detectors": [
        "COGS_STALE"
      ],
      "detectText": "`COGS_STALE` (dòng kho tạo sau phiếu giá vốn tháng)",
      "level": "warn",
      "personas": [
        "chief_accountant"
      ],
      "primary": [
        "chief_accountant"
      ],
      "consequence": "đơn giá vốn của tháng lỗi thời",
      "remedyText": "① Tính lại giá vốn tháng đó (ACC49). ② Kết chuyển lại (ACC6)",
      "verifyText": "`COGS_STALE`",
      "status": "done"
    },
    {
      "id": "F22-STK-05",
      "group": "STK",
      "title": "Hàng đang chuyển giữa chi nhánh không về 0",
      "detectors": [
        "TRANSIT_NONZERO"
      ],
      "detectText": "`TRANSIT_NONZERO` (DG-PLAN-4)",
      "level": "warn",
      "personas": [
        "chief_accountant",
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "hàng \"mất\" giữa hai kho",
      "remedyText": "① Sổ chi tiết tài khoản hàng đang chuyển (ACC12) theo chi nhánh. ② Chi nhánh nhận chưa nhập: nhập phiếu chuyển đến. ③ Lệch đơn giá giữa nhóm tính giá: tính lại giá vốn nhóm gửi trước",
      "verifyText": "`TRANSIT_NONZERO`",
      "status": "done"
    },
    {
      "id": "F22-STK-06",
      "group": "STK",
      "title": "Kho không thuộc chi nhánh của chứng từ",
      "detectors": [],
      "detectText": "`IN-MD-006`",
      "level": "block",
      "personas": [
        "chief_accountant"
      ],
      "primary": [],
      "consequence": "tồn sai kho",
      "remedyText": "① Sửa kho ở nguồn, hoặc khai kho cho chi nhánh (Danh mục kho)",
      "verifyText": "Kiểm thử ở Trạm",
      "status": "planned-021"
    },
    {
      "id": "F22-STK-07",
      "group": "STK",
      "title": "Đơn giá vốn bất thường (bằng 0 khi có hàng, hoặc gấp nhiều lần tháng trước)",
      "detectors": [
        "COST_UNIT_SPIKE"
      ],
      "detectText": "`COST_UNIT_SPIKE` (ngưỡng nội bộ)",
      "level": "warn",
      "personas": [
        "tax_inspector",
        "chief_accountant"
      ],
      "primary": [
        "tax_inspector"
      ],
      "consequence": "giá vốn bị đội / thiếu",
      "remedyText": "① Mở bảng đơn giá vốn tháng (ACC49). ② Kiểm phiếu nhập giá bất thường (đơn giá, ĐVT quy đổi). ③ Sửa ở nguồn, tính lại",
      "verifyText": "`COST_UNIT_SPIKE`",
      "status": "todo"
    },
    {
      "id": "F22-STK-08",
      "group": "STK",
      "title": "Nhập bảng giá vốn từ Excel thiếu mã đang xuất",
      "detectors": [],
      "detectText": "kết quả tính giá vốn `imported.missing`",
      "level": "warn",
      "personas": [
        "chief_accountant"
      ],
      "primary": [],
      "consequence": "mã thiếu tính theo bình quân, lẫn hai cách",
      "remedyText": "① Bổ sung mã vào tệp, nhập lại. ② Hoặc bỏ giá nhập, quay về bình quân",
      "verifyText": "màn ACC49",
      "status": "done"
    },
    {
      "id": "F22-STK-09",
      "group": "STK",
      "title": "Phiếu điều chỉnh kho (kiểm kê) không ghi lý do",
      "detectors": [
        "STOCK_ADJUST_NO_REASON"
      ],
      "detectText": "`STOCK_ADJUST_NO_REASON`",
      "level": "warn",
      "personas": [
        "auditor",
        "tax_inspector"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "chênh lệch kiểm kê không có cơ sở",
      "remedyText": "① Ghi lý do + biên bản kiểm kê ở nguồn. ② Chọn lý do có tài khoản đối ứng (ACC18)",
      "verifyText": "`STOCK_ADJUST_NO_REASON`",
      "status": "done"
    },
    {
      "id": "F22-STK-10",
      "group": "STK",
      "title": "Dòng chờ giá vốn kiểu cũ còn số tiền",
      "detectors": [],
      "detectText": "phiếu giá vốn tháng đưa về 0 (`overwriteCostPairs`)",
      "level": "none",
      "personas": [
        "auditor"
      ],
      "primary": [],
      "consequence": "(đã xử lý theo thiết kế)",
      "remedyText": "Không cần làm gì: tính giá vốn tháng tự đưa dòng chờ cũ về 0",
      "verifyText": "—",
      "status": "done"
    },
    {
      "id": "F22-CLOSE-01",
      "group": "CLOSE",
      "title": "Tháng đã qua còn số doanh thu / chi phí chưa kết chuyển",
      "detectors": [
        "PERIOD_CLOSE_OPEN"
      ],
      "detectText": "`PERIOD_CLOSE_OPEN` (`ket-chuyen`); bảng kiểm `closing`",
      "level": "warn",
      "personas": [
        "chief_accountant"
      ],
      "primary": [
        "chief_accountant"
      ],
      "consequence": "báo cáo kết quả kinh doanh sai",
      "remedyText": "① Kết chuyển (ACC6) theo tháng / chi nhánh trong mẫu. ② Tháng trước còn thiếu thì làm lần lượt từ tháng cũ nhất",
      "verifyText": "`PERIOD_CLOSE_OPEN`",
      "status": "done"
    },
    {
      "id": "F22-CLOSE-02",
      "group": "CLOSE",
      "title": "Kết chuyển lỗi thời (số liệu / bộ quy tắc đổi sau kết chuyển)",
      "detectors": [],
      "detectText": "bảng kiểm `closingStale`",
      "level": "warn",
      "personas": [
        "chief_accountant"
      ],
      "primary": [
        "chief_accountant"
      ],
      "consequence": "kết quả tháng không phản ánh số mới",
      "remedyText": "① Chạy lại Kết chuyển (ACC6); bút toán cũ tự đảo",
      "verifyText": "`GET /periods/check`",
      "status": "done"
    },
    {
      "id": "F22-CLOSE-03",
      "group": "CLOSE",
      "title": "Đã kết chuyển mà doanh thu / chi phí / 911 còn số dư",
      "detectors": [],
      "detectText": "bảng kiểm `closingResidual`",
      "level": "warn",
      "personas": [
        "chief_accountant",
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "bộ quy tắc kết chuyển thiếu bước",
      "remedyText": "① Xem tài khoản còn dư ở chi tiết kết chuyển. ② Bổ sung bước ở bộ quy tắc kết chuyển. ③ Kết chuyển lại",
      "verifyText": "`GET /periods/check`",
      "status": "done"
    },
    {
      "id": "F22-CLOSE-04",
      "group": "CLOSE",
      "title": "Tháng đã qua quá 30 ngày chưa khoá sổ",
      "detectors": [
        "PERIOD_CLOSE_OPEN"
      ],
      "detectText": "`PERIOD_CLOSE_OPEN` (`khoa-so`)",
      "level": "warn",
      "personas": [
        "chief_accountant",
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "số liệu kỳ cũ còn bị sửa",
      "remedyText": "① Làm xong giá vốn, kết chuyển. ② Kế toán trưởng khoá kỳ (ACC2); còn cảnh báo thì ghi lý do",
      "verifyText": "`PERIOD_CLOSE_OPEN`",
      "status": "done"
    },
    {
      "id": "F22-CLOSE-05",
      "group": "CLOSE",
      "title": "Khoá kỳ khi sổ có lỗi toàn vẹn",
      "detectors": [
        "LEDGER_DIAGNOSTICS_FAILED"
      ],
      "detectText": "`LEDGER_DIAGNOSTICS_FAILED` (R-DIAG-4)",
      "level": "block",
      "personas": [
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "khoá một kỳ có sổ sai",
      "remedyText": "① Sửa lỗi toàn vẹn trước (nhóm LEDGER). ② Nếu chấp nhận có lý do: ghi lý do ≥ 10 ký tự, lưu kèm lượt chẩn đoán",
      "verifyText": "— (cần lý do)",
      "status": "blocked"
    },
    {
      "id": "F22-CLOSE-06",
      "group": "CLOSE",
      "title": "Khoá kỳ khi còn cảnh báo (tồn âm, chưa giá vốn…)",
      "detectors": [],
      "detectText": "`core.conformance.advisories` + xác nhận",
      "level": "warn",
      "personas": [
        "chief_accountant",
        "auditor"
      ],
      "primary": [
        "chief_accountant"
      ],
      "consequence": "khoá với việc chưa xong",
      "remedyText": "① Đọc khối cảnh báo ở ACC2. ② Xử lý, hoặc ghi lý do ≥ 10 ký tự rồi khoá (bằng chứng `core.conformance.acknowledge`)",
      "verifyText": "bằng chứng ở nhật ký",
      "status": "done"
    },
    {
      "id": "F22-CLOSE-07",
      "group": "CLOSE",
      "title": "Mở khoá kỳ không ghi lý do",
      "detectors": [],
      "detectText": "bắt buộc lý do khi mở khoá",
      "level": "block",
      "personas": [
        "auditor"
      ],
      "primary": [],
      "consequence": "mất dấu vết sửa kỳ cũ",
      "remedyText": "① Ghi lý do; nhật ký khoá / mở lưu ai, lúc nào",
      "verifyText": "nhật ký khoá kỳ",
      "status": "blocked"
    },
    {
      "id": "F22-CLOSE-08",
      "group": "CLOSE",
      "title": "Khấu hao / phân bổ chi phí tháng chưa chạy",
      "detectors": [
        "DEPRECIATION_OPEN"
      ],
      "detectText": "`DEPRECIATION_OPEN`",
      "level": "warn",
      "personas": [
        "chief_accountant",
        "tax_inspector"
      ],
      "primary": [
        "chief_accountant"
      ],
      "consequence": "chi phí tháng thiếu",
      "remedyText": "① Tính khấu hao, phân bổ (ACC31, `/tai-san/khau-hao`) cho tháng. ② Kết chuyển lại nếu đã kết chuyển",
      "verifyText": "`DEPRECIATION_OPEN`",
      "status": "done"
    },
    {
      "id": "F22-CLOSE-09",
      "group": "CLOSE",
      "title": "Năm tài chính đã qua chưa kết chuyển lãi / lỗ năm",
      "detectors": [
        "YEAR_END_OPEN"
      ],
      "detectText": "`YEAR_END_OPEN`",
      "level": "warn",
      "personas": [
        "chief_accountant",
        "auditor"
      ],
      "primary": [
        "chief_accountant"
      ],
      "consequence": "lợi nhuận chưa phân phối sai",
      "remedyText": "① Kết chuyển cuối năm (ACC6, chọn năm). ② Khoá các kỳ của năm",
      "verifyText": "`YEAR_END_OPEN`",
      "status": "todo"
    },
    {
      "id": "F22-CLOSE-10",
      "group": "CLOSE",
      "title": "Yêu cầu thanh toán chờ duyệt / chưa chi cuối kỳ",
      "detectors": [],
      "detectText": "bảng kiểm `paymentRequests`",
      "level": "warn",
      "personas": [
        "chief_accountant"
      ],
      "primary": [
        "chief_accountant"
      ],
      "consequence": "công nợ, tiền cuối kỳ chưa đúng",
      "remedyText": "① Yêu cầu thanh toán (CN05, `/cong-no/yeu-cau-thanh-toan`): duyệt hoặc từ chối. ② Lập phiếu chi cho yêu cầu đã duyệt",
      "verifyText": "`GET /periods/check`",
      "status": "done"
    },
    {
      "id": "F22-LEDGER-01",
      "group": "LEDGER",
      "title": "Bút toán Nợ ≠ Có",
      "detectors": [
        "LEDGER_BALANCED",
        "UNBALANCED_ENTRY"
      ],
      "detectText": "trigger cân + `LEDGER_BALANCED` (DG-LEDGER-1); `UNBALANCED_ENTRY`",
      "level": "block",
      "personas": [
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "bảng cân đối sai",
      "remedyText": "① Không ghi được (trigger chặn). ② Nếu kiểm vẫn báo: trigger đã bị vượt (F22-ENV-02) — dừng ghi sổ, báo nhóm Lõi kèm mã tra cứu, không tự sửa sổ",
      "verifyText": "`LEDGER_BALANCED`",
      "status": "blocked"
    },
    {
      "id": "F22-LEDGER-02",
      "group": "LEDGER",
      "title": "Số dư lưu sẵn theo ngày ≠ tổng dòng sổ",
      "detectors": [
        "LEDGER_BALANCES_DAILY"
      ],
      "detectText": "`LEDGER_BALANCES_DAILY` (DG-LEDGER-2); bảng kiểm `balanceMismatch`",
      "level": "error",
      "personas": [
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "báo cáo số dư sai",
      "remedyText": "① Dừng khoá kỳ. ② Báo nhóm Lõi (công cụ dựng lại số dư từ sổ) — không sửa tay bảng số dư",
      "verifyText": "`LEDGER_BALANCES_DAILY`",
      "status": "done"
    },
    {
      "id": "F22-LEDGER-03",
      "group": "LEDGER",
      "title": "Bút toán đã đảo không có đúng một bút toán đảo",
      "detectors": [
        "LEDGER_REVERSED_ONCE"
      ],
      "detectText": "`LEDGER_REVERSED_ONCE` (DG-LEDGER-3)",
      "level": "error",
      "personas": [
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "đảo trùng / thiếu",
      "remedyText": "① Mở chứng từ, xem nhật ký định khoản. ② Báo nhóm Lõi kèm số bút toán",
      "verifyText": "`LEDGER_REVERSED_ONCE`",
      "status": "done"
    },
    {
      "id": "F22-LEDGER-04",
      "group": "LEDGER",
      "title": "Bút toán trỏ tới sự việc không tồn tại",
      "detectors": [
        "LEDGER_ORPHAN"
      ],
      "detectText": "`LEDGER_ORPHAN` (DG-LEDGER-4)",
      "level": "error",
      "personas": [
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "bút toán không có chứng từ gốc",
      "remedyText": "① Báo nhóm Lõi + ban kiểm soát. ② Lập biên bản; không xoá bút toán",
      "verifyText": "`LEDGER_ORPHAN`",
      "status": "done"
    },
    {
      "id": "F22-LEDGER-05",
      "group": "LEDGER",
      "title": "Ai đó `UPDATE` / `DELETE` thẳng vào sổ cái hoặc bằng chứng",
      "detectors": [
        "LEDGER_APPEND_ONLY"
      ],
      "detectText": "`LEDGER_APPEND_ONLY` (trigger)",
      "level": "block",
      "personas": [
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "(bị chặn)",
      "remedyText": "① Không có đường hợp lệ: sửa bằng chứng từ đảo / điều chỉnh. ② Tìm script vận hành tự viết và gỡ",
      "verifyText": "— (bị chặn)",
      "status": "blocked"
    },
    {
      "id": "F22-LEDGER-06",
      "group": "LEDGER",
      "title": "Kết chuyển / giá vốn / khấu hao ghi vòng qua cửa ghi sổ",
      "detectors": [
        "INTERNAL_EVENT_VERSION"
      ],
      "detectText": "`INTERNAL_EVENT_VERSION` (DG-EVENT-4)",
      "level": "warn",
      "personas": [
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "sự việc nội bộ lệch phiên bản",
      "remedyText": "① Chạy lại kết chuyển / tính giá vốn / khấu hao của kỳ đó. ② Còn lỗi: báo nhóm Lõi",
      "verifyText": "`INTERNAL_EVENT_VERSION`",
      "status": "done"
    },
    {
      "id": "F22-LEDGER-07",
      "group": "LEDGER",
      "title": "Bút toán theo phiên bản chính sách kế toán không áp cho ngày hạch toán",
      "detectors": [
        "POLICY_VERSION"
      ],
      "detectText": "`POLICY_VERSION` (DG-POL-1)",
      "level": "warn",
      "personas": [
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "định khoản theo luật cũ / chưa hiệu lực",
      "remedyText": "① Định khoản lại chứng từ ở ACC14. ② Báo nhóm Lõi (có đường định khoản không đọc chính sách theo ngày)",
      "verifyText": "`POLICY_VERSION`",
      "status": "done"
    },
    {
      "id": "F22-LEDGER-08",
      "group": "LEDGER",
      "title": "Tài khoản dư sai bên (tiền, hàng tồn dư Có; tài khoản chỉ dư Nợ lại dư Có)",
      "detectors": [
        "ACCOUNT_WRONG_SIDE"
      ],
      "detectText": "`ACCOUNT_WRONG_SIDE` (theo `normal_side` của tài khoản)",
      "level": "warn",
      "personas": [
        "chief_accountant",
        "auditor",
        "tax_inspector"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "dấu hiệu ghi thiếu chứng từ / ghi nhầm tài khoản",
      "remedyText": "① Sổ chi tiết tài khoản (ACC12) tại ngày đầu tiên sai bên. ② Tìm chứng từ thiếu (phiếu thu, phiếu nhập) hoặc ghi nhầm. ③ Sửa ở nguồn / lập chứng từ điều chỉnh",
      "verifyText": "`ACCOUNT_WRONG_SIDE`",
      "status": "done"
    },
    {
      "id": "F22-LEDGER-09",
      "group": "LEDGER",
      "title": "Bảng cân đối phát sinh không cân / không khớp số dư đầu kỳ",
      "detectors": [
        "LEDGER_BALANCES_DAILY"
      ],
      "detectText": "Nợ = Có theo bút toán (trigger) + `LEDGER_BALANCES_DAILY`",
      "level": "error",
      "personas": [
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "báo cáo tài chính sai",
      "remedyText": "① Như F22-LEDGER-02",
      "verifyText": "`LEDGER_BALANCES_DAILY`",
      "status": "done"
    },
    {
      "id": "F22-LEDGER-10",
      "group": "LEDGER",
      "title": "Phiếu kế toán tay ghi vào tài khoản thuế / doanh thu không qua chứng từ gốc",
      "detectors": [
        "MANUAL_SENSITIVE"
      ],
      "detectText": "`MANUAL_SENSITIVE` (tài khoản lấy từ cấu hình loại thuế / ngầm định, không viết cứng)",
      "level": "warn",
      "personas": [
        "auditor",
        "tax_inspector"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "sổ thuế / doanh thu lệch hoá đơn",
      "remedyText": "① Mở phiếu (ACC16). ② Có chứng từ gốc: đính kèm, ghi căn cứ. ③ Không có: huỷ phiếu, lập đúng chứng từ (hoá đơn điều chỉnh, phiếu bán)",
      "verifyText": "`MANUAL_SENSITIVE`",
      "status": "todo"
    },
    {
      "id": "F22-DEBT-01",
      "group": "DEBT",
      "title": "Tổng khoản công nợ mở ≠ số dư tài khoản công nợ theo đối tượng",
      "detectors": [
        "DEBT_MATCH_LEDGER"
      ],
      "detectText": "`DEBT_MATCH_LEDGER` (DG-PLAN-1)",
      "level": "error",
      "personas": [
        "auditor",
        "chief_accountant"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "sổ công nợ và sổ cái nói hai số",
      "remedyText": "① Sổ chi tiết công nợ (ACC40) theo đối tượng lệch. ② Tìm thanh toán chưa phân bổ / phân bổ sai (CN01). ③ Phiếu kế toán tay vào tài khoản công nợ thiếu đối tượng: sửa phiếu",
      "verifyText": "`DEBT_MATCH_LEDGER`",
      "status": "done"
    },
    {
      "id": "F22-DEBT-02",
      "group": "DEBT",
      "title": "Công nợ phải thu quá hạn quá N ngày (quy chế nội bộ)",
      "detectors": [
        "DEBT_OVERDUE"
      ],
      "detectText": "`DEBT_OVERDUE`; màn tuổi nợ ACC67",
      "level": "warn",
      "personas": [
        "chief_accountant"
      ],
      "primary": [
        "chief_accountant"
      ],
      "consequence": "rủi ro mất vốn, cần trích lập dự phòng",
      "remedyText": "① Báo cáo tuổi nợ quá hạn (ACC67B). ② Gửi biên bản đối chiếu (CN07). ③ Kế toán trưởng xét trích lập dự phòng",
      "verifyText": "`DEBT_OVERDUE`",
      "status": "todo"
    },
    {
      "id": "F22-DEBT-03",
      "group": "DEBT",
      "title": "Khách hàng dư Có (trả thừa) / nhà cung cấp dư Nợ lâu không xử lý",
      "detectors": [
        "DEBT_WRONG_SIDE"
      ],
      "detectText": "`DEBT_WRONG_SIDE`",
      "level": "warn",
      "personas": [
        "chief_accountant",
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "tiền khách chưa hoàn / chưa cấn trừ",
      "remedyText": "① Cấn trừ công nợ (BT03) với khoản nợ khác. ② Hoặc lập phiếu chi hoàn tiền",
      "verifyText": "`DEBT_WRONG_SIDE`",
      "status": "todo"
    },
    {
      "id": "F22-DEBT-04",
      "group": "DEBT",
      "title": "Thanh toán chưa phân bổ vào khoản nợ cụ thể",
      "detectors": [
        "DEBT_UNALLOCATED"
      ],
      "detectText": "`DEBT_UNALLOCATED`",
      "level": "warn",
      "personas": [
        "chief_accountant"
      ],
      "primary": [
        "chief_accountant"
      ],
      "consequence": "tuổi nợ sai, quá hạn ảo",
      "remedyText": "① Khoản công nợ và đối trừ (CN01): phân bổ thanh toán vào hoá đơn",
      "verifyText": "`DEBT_UNALLOCATED`",
      "status": "todo"
    },
    {
      "id": "F22-DEBT-05",
      "group": "DEBT",
      "title": "Đặt cọc / trả trước lâu không cấn trừ",
      "detectors": [
        "DEPOSIT_AGED"
      ],
      "detectText": "`DEPOSIT_AGED`",
      "level": "warn",
      "personas": [
        "chief_accountant"
      ],
      "primary": [],
      "consequence": "tài sản ảo trên báo cáo",
      "remedyText": "① Đặt cọc, trả trước (CN04): cấn trừ vào hoá đơn đã nhận, hoặc thu hồi",
      "verifyText": "`DEPOSIT_AGED`",
      "status": "todo"
    },
    {
      "id": "F22-DEBT-06",
      "group": "DEBT",
      "title": "Cuối năm chưa có biên bản đối chiếu công nợ với đối tượng lớn",
      "detectors": [
        "DEBT_NOT_CONFIRMED"
      ],
      "detectText": "`DEBT_NOT_CONFIRMED`",
      "level": "hint",
      "personas": [
        "auditor",
        "tax_inspector"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "không có xác nhận bên thứ ba",
      "remedyText": "① Lập biên bản đối chiếu công nợ (CN07, `/cong-no/doi-chieu`), gửi ký",
      "verifyText": "`DEBT_NOT_CONFIRMED`",
      "status": "todo"
    },
    {
      "id": "F22-CASH-01",
      "group": "CASH",
      "title": "Quỹ tiền mặt âm cuối ngày",
      "detectors": [
        "CASH_NEGATIVE"
      ],
      "detectText": "`CASH_NEGATIVE` (tài khoản tiền mặt lấy từ cấu hình, không viết cứng)",
      "level": "warn",
      "personas": [
        "chief_accountant",
        "tax_inspector"
      ],
      "primary": [
        "tax_inspector"
      ],
      "consequence": "chi khi không có tiền: dấu hiệu thiếu phiếu thu / chi khống",
      "remedyText": "① Sổ quỹ tiền mặt (ACC55) tại ngày âm đầu tiên. ② Tìm phiếu thu thiếu / nhập trễ, hoặc phiếu chi ghi nhầm ngày. ③ Sửa ở nguồn / lập phiếu thu đúng ngày",
      "verifyText": "`CASH_NEGATIVE`",
      "status": "done"
    },
    {
      "id": "F22-CASH-02",
      "group": "CASH",
      "title": "Tiền đang chuyển / chuyển tiền nội bộ không về 0",
      "detectors": [
        "TRANSIT_NONZERO"
      ],
      "detectText": "`TRANSIT_NONZERO` (dùng chung với F22-STK-05)",
      "level": "warn",
      "personas": [
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "tiền \"mất\" giữa hai quỹ",
      "remedyText": "① Chuyển tiền nội bộ: nơi nhận bấm \"Xác nhận đã nhận tiền\". ② Sổ chi tiết tài khoản tiền đang chuyển (ACC12)",
      "verifyText": "`TRANSIT_NONZERO`",
      "status": "done"
    },
    {
      "id": "F22-CASH-03",
      "group": "CASH",
      "title": "Chuyển tiền nội bộ chưa được nơi nhận xác nhận quá N ngày",
      "detectors": [
        "TRANSFER_UNCONFIRMED"
      ],
      "detectText": "`TRANSFER_UNCONFIRMED`",
      "level": "warn",
      "personas": [
        "chief_accountant"
      ],
      "primary": [
        "chief_accountant"
      ],
      "consequence": "tiền không ghi nơi nhận",
      "remedyText": "① Nhắc nơi nhận xác nhận sau khi đối chiếu quỹ / sao kê",
      "verifyText": "`TRANSFER_UNCONFIRMED`",
      "status": "todo"
    },
    {
      "id": "F22-CASH-04",
      "group": "CASH",
      "title": "Chi tiền mặt cho một khoản vượt ngưỡng phải thanh toán không dùng tiền mặt (ngưỡng luật, căn cứ chờ rà)",
      "detectors": [
        "CASH_LARGE_PAYMENT"
      ],
      "detectText": "`CASH_LARGE_PAYMENT` (ngưỡng là tham số rulepack)",
      "level": "warn",
      "personas": [
        "tax_inspector"
      ],
      "primary": [
        "tax_inspector"
      ],
      "consequence": "chi phí có thể bị loại khi tính thuế",
      "remedyText": "① Đổi sang chuyển khoản cho lần sau. ② Ghi chú căn cứ khi xác nhận cảnh báo",
      "verifyText": "`CASH_LARGE_PAYMENT`",
      "status": "todo"
    },
    {
      "id": "F22-CASH-05",
      "group": "CASH",
      "title": "Phiếu thu / chi thiếu người nộp / nhận hoặc lý do",
      "detectors": [
        "CASH_VOUCHER_FIELDS"
      ],
      "detectText": "`CASH_VOUCHER_FIELDS`",
      "level": "hint",
      "personas": [
        "auditor"
      ],
      "primary": [],
      "consequence": "chứng từ tiền không đủ yếu tố",
      "remedyText": "① Bổ sung ở phiếu (ACC15 / phiếu thu chi)",
      "verifyText": "`CASH_VOUCHER_FIELDS`",
      "status": "todo"
    },
    {
      "id": "F22-CASH-06",
      "group": "CASH",
      "title": "Sổ tiền gửi chưa đối chiếu với sao kê ngân hàng",
      "detectors": [],
      "detectText": "—",
      "level": "warn",
      "personas": [
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "lệch tiền gửi không phát hiện",
      "remedyText": "—",
      "verifyText": "—",
      "status": "deferred",
      "statusNote": "hoãn: chưa có dữ liệu sao kê (như Q020-6)"
    },
    {
      "id": "F22-FA-01",
      "group": "FA",
      "title": "Tài sản đã khấu hao hết vẫn trích khấu hao",
      "detectors": [
        "FA_OVER_DEPRECIATED"
      ],
      "detectText": "`FA_OVER_DEPRECIATED`",
      "level": "warn",
      "personas": [
        "tax_inspector",
        "auditor"
      ],
      "primary": [
        "tax_inspector"
      ],
      "consequence": "chi phí khấu hao không được trừ",
      "remedyText": "① Kế hoạch khấu hao (TS01): dừng trích. ② Đảo phần trích thừa bằng chứng từ điều chỉnh",
      "verifyText": "`FA_OVER_DEPRECIATED`",
      "status": "todo"
    },
    {
      "id": "F22-FA-02",
      "group": "FA",
      "title": "Tài sản đã ghi giảm vẫn trích khấu hao",
      "detectors": [
        "FA_DISPOSED_DEPRECIATED"
      ],
      "detectText": "`FA_DISPOSED_DEPRECIATED`",
      "level": "warn",
      "personas": [
        "tax_inspector"
      ],
      "primary": [
        "tax_inspector"
      ],
      "consequence": "chi phí không có cơ sở",
      "remedyText": "① Kiểm phiếu ghi giảm (ACC30). ② Tính lại khấu hao tháng đó (ACC31)",
      "verifyText": "`FA_DISPOSED_DEPRECIATED`",
      "status": "todo"
    },
    {
      "id": "F22-FA-03",
      "group": "FA",
      "title": "Chi phí trả trước hết kỳ phân bổ vẫn còn số dư",
      "detectors": [
        "PREPAID_RESIDUAL"
      ],
      "detectText": "`PREPAID_RESIDUAL`",
      "level": "warn",
      "personas": [
        "chief_accountant",
        "tax_inspector"
      ],
      "primary": [
        "tax_inspector"
      ],
      "consequence": "chi phí phân bổ thiếu",
      "remedyText": "① Phân bổ chi phí trả trước (ACC23): phân bổ phần còn lại vào kỳ cuối",
      "verifyText": "`PREPAID_RESIDUAL`",
      "status": "todo"
    },
    {
      "id": "F22-FA-04",
      "group": "FA",
      "title": "Tài sản không có bộ phận sử dụng / tài khoản chi phí",
      "detectors": [
        "FA_MISSING_ALLOCATION"
      ],
      "detectText": "`FA_MISSING_ALLOCATION`",
      "level": "hint",
      "personas": [
        "chief_accountant"
      ],
      "primary": [],
      "consequence": "khấu hao vào sai chi phí",
      "remedyText": "① Sửa tài sản (ACC28): khai bộ phận, tài khoản chi phí",
      "verifyText": "`FA_MISSING_ALLOCATION`",
      "status": "todo"
    },
    {
      "id": "F22-SEC-01",
      "group": "SEC",
      "title": "Khoá API / AI xác nhận cảnh báo hoặc duyệt rulepack thay người",
      "detectors": [
        "FORBIDDEN"
      ],
      "detectText": "`FORBIDDEN` (core.conformance.acknowledge / approve)",
      "level": "block",
      "personas": [
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "quyết định không có người chịu trách nhiệm",
      "remedyText": "① Người có quyền đăng nhập để xác nhận",
      "verifyText": "—",
      "status": "blocked"
    },
    {
      "id": "F22-SEC-02",
      "group": "SEC",
      "title": "AI gọi action ghi (chạy kiểm chuẩn, khai hồ sơ, ghi chứng từ)",
      "detectors": [],
      "detectText": "`ai: deny`",
      "level": "block",
      "personas": [
        "auditor"
      ],
      "primary": [],
      "consequence": "AI tự ghi sổ / đổi cấu hình",
      "remedyText": "① AI chỉ đọc; người làm thao tác ghi",
      "verifyText": "—",
      "status": "blocked"
    },
    {
      "id": "F22-SEC-03",
      "group": "SEC",
      "title": "Người xem / nhà phát triển gửi chứng từ",
      "detectors": [
        "FORBIDDEN"
      ],
      "detectText": "`FORBIDDEN`",
      "level": "block",
      "personas": [
        "auditor"
      ],
      "primary": [],
      "consequence": "ghi sổ ngoài phân quyền",
      "remedyText": "① Chủ đơn vị cấp vai trò phù hợp ở Người dùng (HT01)",
      "verifyText": "—",
      "status": "blocked"
    },
    {
      "id": "F22-SEC-04",
      "group": "SEC",
      "title": "Đơn vị A đọc / ghi dữ liệu đơn vị B",
      "detectors": [
        "TENANT_ISOLATION"
      ],
      "detectText": "RLS + `TENANT_ISOLATION`",
      "level": "block",
      "personas": [
        "auditor"
      ],
      "primary": [
        "auditor"
      ],
      "consequence": "lộ dữ liệu",
      "remedyText": "① (bị chặn) Nếu kiểm báo bảng thiếu RLS: F22-ENV-05",
      "verifyText": "`TENANT_ISOLATION`",
      "status": "blocked"
    },
    {
      "id": "F22-SEC-05",
      "group": "SEC",
      "title": "Kế toán viên tự duyệt rulepack / khoá kỳ",
      "detectors": [
        "FORBIDDEN"
      ],
      "detectText": "`FORBIDDEN` (`conformance:approve`, `periods:lock`)",
      "level": "block",
      "personas": [
        "auditor"
      ],
      "primary": [],
      "consequence": "vượt cấp duyệt",
      "remedyText": "① Kế toán trưởng / chủ đơn vị làm",
      "verifyText": "—",
      "status": "blocked"
    },
    {
      "id": "F22-SEC-06",
      "group": "SEC",
      "title": "Gửi lại cùng Idempotency-Key với nội dung khác",
      "detectors": [
        "IDEMPOTENCY_CONFLICT"
      ],
      "detectText": "`IDEMPOTENCY_CONFLICT`",
      "level": "block",
      "personas": [
        "auditor"
      ],
      "primary": [],
      "consequence": "ghi trùng / ghi nhầm khi mạng chập chờn",
      "remedyText": "① Nguồn sinh khoá mới cho thao tác mới; gửi lại thì giữ nguyên cả khoá lẫn nội dung",
      "verifyText": "—",
      "status": "blocked"
    }
  ]
};
