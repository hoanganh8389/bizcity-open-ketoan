/**
 * Các luồng chứng từ trợ lý mô phỏng được. Thêm luồng mới: thêm một mục ở đây và một nhánh tương ứng trong
 * sampleDocument() của add-in phía máy chủ (apps/api/src/addins/tro-ly/index.ts).
 */
export interface Flow {
  key: string;
  label: string;
  group: string;
  /** Loại lý do được chọn (danh mục ACC18): out xuất, in nhập, receipt thu, payment chi. */
  reasonKind: 'out' | 'in' | 'receipt' | 'payment';
  /** Loại thuế: output đầu ra (R…), input đầu vào (V…), không có thì không chọn thuế. */
  tax?: 'output' | 'input';
  /** Chọn hình thức thanh toán (tiền mặt, chuyển khoản…). */
  method?: boolean;
  /** Chọn chi nhánh đầu kia (chuyển kho, chuyển tiền). */
  other?: string;
  /** Giải thích ngắn: chứng từ từ đâu, khi nào ghi sổ, lưu ý. */
  note: string;
}

export const FLOWS: Flow[] = [
  { key: 'sale', label: 'Hoá đơn bán hàng', group: 'Bán hàng', reasonKind: 'out', tax: 'output',
    note: 'Phiếu bán từ cửa hàng (POS) về trạm Định khoản tự động (ACC14). Ghi doanh thu và thuế đầu ra vào công nợ khách; tiền thu là phiếu thu riêng. Giá vốn ghi khi chạy Tính giá vốn cuối tháng (ACC49) — ở đây dùng số minh hoạ 70% tiền hàng.' },
  { key: 'sale_return', label: 'Hàng bán trả lại', group: 'Bán hàng', reasonKind: 'in', tax: 'output',
    note: 'Giảm doanh thu (hàng bán trả lại) và giảm thuế đầu ra, nhập lại kho theo giá vốn. Trả tiền khách là phiếu chi riêng; đổi trả tại quầy thì đối trừ với phiếu bán mới (không có tiền thật).' },
  { key: 'receipt', label: 'Thu tiền khách hàng', group: 'Bán hàng', reasonKind: 'receipt', method: true,
    note: 'Mỗi phiếu thu của đơn bán là một chứng từ riêng, đối trừ đúng hoá đơn nó thanh toán. Hình thức thanh toán quyết định tài khoản tiền (tiền mặt, ngân hàng, tiền đang chuyển…).' },
  { key: 'refund', label: 'Chi trả tiền khách', group: 'Bán hàng', reasonKind: 'payment', method: true,
    note: 'Trả tiền lại cho khách (hàng bán trả lại, trả thừa): ghi giảm công nợ khách, giảm tiền.' },
  { key: 'purchase', label: 'Nhập mua hàng', group: 'Mua hàng', reasonKind: 'in', tax: 'input',
    note: 'Phiếu nhập kho mua của nhà cung cấp. Thuế đầu vào dùng mã V… (tài khoản 1331); mã R… (đầu ra) bị chặn.' },
  { key: 'purchase_return', label: 'Trả hàng nhà cung cấp', group: 'Mua hàng', reasonKind: 'out', tax: 'input',
    note: 'Giảm hàng tồn kho, giảm thuế đầu vào, giảm công nợ phải trả nhà cung cấp.' },
  { key: 'supplier_payment', label: 'Trả tiền nhà cung cấp', group: 'Mua hàng', reasonKind: 'payment', method: true,
    note: 'Chi tiền trả nhà cung cấp: giảm phải trả, giảm tiền.' },
  { key: 'supplier_refund', label: 'Nhà cung cấp hoàn tiền', group: 'Mua hàng', reasonKind: 'receipt', method: true,
    note: 'Nhà cung cấp trả lại tiền: tăng tiền, ghi vào công nợ nhà cung cấp.' },
  { key: 'transfer_out', label: 'Xuất chuyển kho nội bộ', group: 'Kho', reasonKind: 'out', other: 'Chi nhánh nhận',
    note: 'Phiếu xuất nội bộ của cửa hàng gửi: hàng ra khỏi kho, sang tài khoản hàng đang chuyển (cùng đơn vị hạch toán) hoặc phải thu nội bộ (khác đơn vị). Thực tế chỉ có số lượng; giá trị tính khi chạy giá vốn — ở đây dùng số minh hoạ.' },
  { key: 'transfer_in', label: 'Nhận chuyển kho nội bộ', group: 'Kho', reasonKind: 'in', other: 'Chi nhánh gửi',
    note: 'Phiếu nhận nội bộ của cửa hàng nhận: hàng vào kho từ tài khoản hàng đang chuyển. Hai đầu cùng giá vốn nên tài khoản trung gian về 0.' },
  { key: 'adjust_increase', label: 'Điều chỉnh tăng kho (thừa)', group: 'Kho', reasonKind: 'in',
    note: 'Kiểm kê thừa: tăng kho, đối ứng tài khoản hàng thừa chờ xử lý (theo lý do). Giá trị theo giá vốn bình quân khi tính giá vốn.' },
  { key: 'adjust_decrease', label: 'Điều chỉnh giảm kho (thiếu)', group: 'Kho', reasonKind: 'out',
    note: 'Kiểm kê thiếu, hàng hỏng: giảm kho, đối ứng tài khoản hàng thiếu chờ xử lý hoặc chi phí (theo lý do).' },
  { key: 'cash_transfer', label: 'Chuyển tiền', group: 'Quỹ', reasonKind: 'payment', method: true, other: 'Chi nhánh nhận',
    note: 'Chuyển tiền giữa hai chi nhánh, hoặc trong một chi nhánh giữa quỹ và ngân hàng (nộp tiền mặt vào ngân hàng). Nơi nhận ghi khi đã nhận tiền.' },
];

/** Tên phần bút toán. */
export const PART_TEXT: Record<string, string> = {
  goods: 'Tiền hàng', tax: 'Thuế', cogs: 'Giá vốn', payment: 'Thanh toán', transfer: 'Chuyển', adjust: 'Điều chỉnh',
};
