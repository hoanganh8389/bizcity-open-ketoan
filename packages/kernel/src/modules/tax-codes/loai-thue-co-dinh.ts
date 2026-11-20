// @bizcity-layer K kernel/tax
// [2026-11-19 kiennt] NT-DM-012 — danh mục loại thuế GTGT cố định theo quy định nhà nước + quy đổi mã cũ (đóng góp)
/**
 * LOẠI THUẾ GTGT CỐ ĐỊNH (NT-DM-012). Thuế suất / loại chịu thuế do nhà nước quy định → phần mềm cấu hình sẵn, người dùng chỉ xem.
 *   - Chiều 'both': một loại dùng cho cả mua và bán (hoá đơn mua hay bán do loại chứng từ quyết định).
 *   - Không khai TK: tiền thuế ghi vào TK của Quy tắc hạch toán (tax_input 1331 · tax_input_fixed_asset 1332 · tax_output 33311).
 *   - Hiệu lực: chứng từ ngoài khoảng hiệu lực không ghi sổ được (vd 8% đến hết 31/12/2026).
 * Mã cũ (V…, R…) giữ nguyên để chứng từ đã ghi, máy bán POS, cầu nối website vẫn ghi sổ như trước; đánh dấu is_legacy, replaced_by.
 * Migration 0169 áp cho đơn vị đã có; apDungLoaiThueCoDinh() áp cho đơn vị mới (seed) sau khi cài gói định khoản nền.
 * Nhà nước đổi thuế suất → sửa LOAI_THUE_CO_DINH + migration mới (một bản cập nhật phần mềm).
 */
import { sql } from 'kysely';
import type { Db } from '@bizcity/platform/db/client';

const LUAT = 'Luật Thuế GTGT số 48/2024/QH15';

export interface LoaiThueCoDinh { code: string; name: string; rate: number; reportGroup: string; validFrom: string | null; validTo: string | null; legalBasis: string }

export const LOAI_THUE_CO_DINH: readonly LoaiThueCoDinh[] = [
  { code: 'KCT', name: 'Không chịu thuế GTGT', rate: 0, reportGroup: 'KCT', validFrom: null, validTo: null, legalBasis: LUAT },
  { code: '0', name: 'Thuế suất 0%', rate: 0, reportGroup: '0', validFrom: null, validTo: null, legalBasis: LUAT },
  { code: '5', name: 'Thuế suất 5%', rate: 5, reportGroup: '5', validFrom: null, validTo: null, legalBasis: LUAT },
  { code: '8', name: 'Thuế suất 8% (giảm từ 10%)', rate: 8, reportGroup: '8', validFrom: null, validTo: '2026-12-31', legalBasis: 'Nghị quyết 204/2025/QH15; Nghị định 174/2025/NĐ-CP' },
  { code: '10', name: 'Thuế suất 10%', rate: 10, reportGroup: '10', validFrom: null, validTo: null, legalBasis: LUAT },
  { code: 'KKKN', name: 'Không phải kê khai, tính nộp thuế GTGT', rate: 0, reportGroup: 'KKK', validFrom: null, validTo: null, legalBasis: `${LUAT} và văn bản hướng dẫn` },
];

/**
 * Mã cũ → loại cố định (theo nhóm bảng kê + thuế suất của dữ liệu gốc). Mã chưa xác định (R05B, R08B, R10B, V05B, V05S, V071, V20)
 * không có ở đây — chờ kế toán (NT-DM-012 mục 8).
 */
export const MA_CU_QUY_DOI: Readonly<Record<string, string>> = Object.fromEntries([
  ...['R00K', 'V13K'].map((c) => [c, 'KCT']),
  ...['R00', 'R00C', 'R00D', 'R00L', 'V00', 'V00C', 'V00D', 'V00K', 'V105', 'V10B', 'V11B', 'V13B'].map((c) => [c, '0']),
  ...['R05', 'R05A', 'R05C', 'V05', 'V051', 'V053', 'V054', 'V05C', 'V51A', 'V53A', 'V54A'].map((c) => [c, '5']),
  ...['R08', 'R08A', 'R08C', 'V08', 'V081', 'V083'].map((c) => [c, '8']),
  ...['R10', 'R10A', 'R10C', 'V10', 'V101', 'V103', 'V104', 'V10C', 'V11A', 'V13A', 'V14A'].map((c) => [c, '10']),
]);

/** Loại cố định của một mã (mã cố định giữ nguyên; mã cũ theo bảng quy đổi; không xác định → null). */
export const loaiThueCua = (code: string): string | null =>
  LOAI_THUE_CO_DINH.some((l) => l.code === code) ? code : MA_CU_QUY_DOI[code] ?? null;

/** Đơn vị mới (seed, sau gói định khoản nền): ghi đủ 6 loại cố định (hiệu lực, căn cứ) và đánh dấu mã cũ. Chạy lại không đổi gì. */
export async function apDungLoaiThueCoDinh(trx: Db, tenantId: string): Promise<void> {
  for (const l of LOAI_THUE_CO_DINH) {
    await trx.insertInto('tax_codes')
      .values({ tenant_id: tenantId, code: l.code, name: l.name, rate: String(l.rate), direction: 'both', account_code: null, report_group: l.reportGroup,
        is_active: true, is_legacy: false, replaced_by: null, valid_from: l.validFrom, valid_to: l.validTo, legal_basis: l.legalBasis })
      .onConflict((oc) => oc.columns(['tenant_id', 'code']).doUpdateSet({
        name: l.name, rate: String(l.rate), direction: 'both', account_code: null, report_group: l.reportGroup,
        is_active: true, is_legacy: false, replaced_by: null, valid_from: l.validFrom, valid_to: l.validTo, legal_basis: l.legalBasis,
      }))
      .execute();
  }
  const fixed = LOAI_THUE_CO_DINH.map((l) => l.code);
  const legacy = await trx.selectFrom('tax_codes').select('code').where('tenant_id', '=', tenantId).where('code', 'not in', fixed).execute();
  for (const { code } of legacy) {
    const moi = MA_CU_QUY_DOI[code] ?? null;
    await trx.updateTable('tax_codes')
      .set({ is_legacy: true, replaced_by: moi }) // mã cũ không đặt hiệu lực: POS / website gửi R08 sau 2026 vẫn ghi sổ, VAT_REDUCED_RATE cảnh báo
      .where('tenant_id', '=', tenantId).where('code', '=', code).execute();
  }
  await sql`INSERT INTO posting_defaults (tenant_id, key, account_code)
            SELECT ${tenantId}, 'tax_input_fixed_asset', a.code FROM accounts a WHERE a.tenant_id = ${tenantId} AND a.code = '1332'
            ON CONFLICT (tenant_id, key) DO NOTHING`.execute(trx);
}
