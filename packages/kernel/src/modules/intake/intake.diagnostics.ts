// @bizcity-layer K kernel/intake
// [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W4 (S021-19, 20-KIEN-TRUC §8): INTAKE_OPEN_AGE — mục bể chờ mở quá ngưỡng (bizcity.intake.open_alert_days, mặc định 3 ngày); cùng chữ với lane DG-INTAKE-1
/**
 * Tự chẩn đoán bể chờ đầu vào. Chứng từ nằm ở bể = chưa vào sổ — báo cáo thiếu số tới khi nguồn sửa hoặc kế toán xử lý ở Trạm kiểm tra.
 * Chỉ đọc mã + docKey, không đọc nguyên văn (R-INTAKE-12).
 */
import { sql } from 'kysely';
import { sqlCounts, type DiagCheck } from '@bizcity/platform/system/diagnostics';
import { SCREENS } from '@ketoan/contracts';

const SAMPLE = 20;
/** Ngưỡng ngày của đơn vị (tenants.settings.intake.openAlertDays), mặc định 3. */
const threshold = (tenantId: string) => sql`make_interval(days => coalesce((SELECT (settings #>> '{intake,openAlertDays}')::int FROM tenants WHERE id = ${tenantId}), 3))`;

export const INTAKE_DIAGNOSTICS: DiagCheck[] = [
  {
    code: 'INTAKE_OPEN_AGE', layer: 'L3', level: 'warn', scoped: false,
    remedy: {
      steps: [
        { text: 'Mở Định khoản tự động, thẻ Cần sửa — mục cũ nhất ở trên khi sắp theo lần gần nhất', screen: SCREENS.ACC14 },
        { text: 'Báo nơi phát sinh sửa và gửi lại (mục tự đóng); nguồn không sửa được thì sửa tại bể có lý do rồi Nộp lại', screen: SCREENS.ACC14, role: 'accountant' },
        { text: 'Nguồn đã huỷ phiếu: Bỏ mục có lý do', screen: SCREENS.ACC14, role: 'chief_accountant' },
      ],
      owner: 'accountant', verify: { code: 'INTAKE_OPEN_AGE' },
      forbid: ['Không bỏ hàng loạt mục chưa đọc lỗi để làm sạch cảnh báo'],
    },
    title: 'Không có chứng từ nằm ở bể chờ (cửa nạp từ chối) quá ngưỡng ngày',
    fix: 'Chứng từ bị cửa nạp từ chối chưa vào sổ, báo cáo thiếu số. Xử lý ở ACC14 thẻ Cần sửa: nguồn gửi lại đúng, hoặc sửa tại bể rồi nộp lại, hoặc bỏ mục có lý do.',
    run: (trx, s) => sqlCounts(trx,
      sql`SELECT count(*)::int AS n FROM intake_inbox WHERE tenant_id = ${s.tenantId} AND status = 'open'`,
      sql`SELECT coalesce(doc_key, '#' || id) AS key, count(*) OVER ()::int AS total FROM intake_inbox
           WHERE tenant_id = ${s.tenantId} AND status = 'open' AND received_at < now() - ${threshold(s.tenantId)}
           ORDER BY received_at LIMIT ${SAMPLE}`),
  },
];
