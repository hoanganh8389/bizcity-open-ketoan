// @bizcity-layer K kernel/ledger
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 09:03 PM Johnny Chu - Chu Hoàng Anh] PHASE-005 — chính sách kế toán có phiên bản + ngày hiệu lực (ADR-0009).
/**
 * Kiểu dữ liệu của bút toán nháp — đầu ra của bộ định khoản, đầu vào của ledgerService.post().
 */
import type { DocType, LinePart } from '@ketoan/contracts';

export interface DraftLine {
  accountCode: string;
  debit: number;
  credit: number;
  /** Cặp đối ứng: dòng Nợ và dòng Có sinh ra cùng nhau mang cùng pairNo. */
  pairNo: number;
  part: LinePart;
  partnerId?: string | null;
  taxCode?: string | null;
  productSku?: string | null;
  description?: string;
  sourceLineKey?: string | null;
  dims?: Record<string, unknown>;
  /**
   * Dòng giá vốn chờ tính giá (ghi sẵn số 0 theo từng mặt hàng): bên được ghi số tiền. Tính giá vốn cuối tháng
   * GHI ĐÈ số tiền lên dòng này, không đảo bút toán (ngoại lệ có chủ đích — migration 0059, costing.service).
   */
  costFill?: 'debit' | 'credit' | null;
}

export interface DraftEntry {
  branchId: string;
  docType: DocType;
  docNo: string;
  invoiceNo?: string | null;
  docDate: string;
  postingDate: string;
  reasonCode?: string | null;
  partnerId?: string | null;
  description: string;
  sourceDocumentId?: string | null;
  sourceVersion?: number | null;
  /** Bút toán đảo (ghi số âm): dòng cùng bên với bút toán gốc, số tiền âm. */
  isReversal?: boolean;
  /** Bút toán gốc bị đảo (chỉ khi isReversal). */
  reversesEntryId?: string | null;
  /** Phiên bản chính sách kế toán đã dùng để dựng bút toán (ADR-0009); không có = không theo chính sách. */
  policyVersion?: number | null;
  lines: DraftLine[];
}
