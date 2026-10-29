/**
 * Nhập thẻ tài sản từ Excel / CSV: mẫu cột, đọc tệp, đổi từng dòng thành dữ liệu gửi API.
 * Tệp đọc bằng thư viện xlsx ngay trên trình duyệt; tên cột so khớp không phân biệt hoa thường, có dấu / không dấu.
 */
export const TEMPLATE_HEADERS = [
  'Mã tài sản', 'Tên tài sản', 'Nhóm', 'Loại tài sản', 'Chi nhánh', 'Ngày ghi tăng', 'Ngày bắt đầu khấu hao', 'Nguyên giá', 'Giá trị tính khấu hao',
  'Số tháng sử dụng', 'Luỹ kế đã khấu hao', 'Luỹ kế tính tới ngày', 'Số tháng còn lại', 'Mức khấu hao tháng', 'Mức khấu hao tháng theo thuế',
  'TK nguyên giá', 'TK hao mòn', 'TK chi phí', 'Bộ phận', 'Khoản mục', 'Phân bổ', 'Trạng thái', 'Ngày ghi giảm', 'Đơn vị tính', 'Số lượng', 'Ghi chú',
  'Kích thước', 'Điện năng tiêu thụ', 'Thông số khác',
] as const;

export const TEMPLATE_NOTES: [string, string][] = [
  ['Nhóm', 'TSCĐ, CCDC hoặc Trả trước (trống = TSCĐ)'],
  ['Loại tài sản', 'Mã loại ở màn Loại tài sản (ACC37), ví dụ TS-MAY; có thể để trống'],
  ['Chi nhánh', 'Mã chi nhánh đang dùng tài sản'],
  ['Ngày …', 'dd/mm/yyyy hoặc yyyy-mm-dd, hoặc ô ngày của Excel'],
  ['Giá trị tính khấu hao', 'Trống = bằng nguyên giá'],
  ['Luỹ kế đã khấu hao / tính tới ngày / số tháng còn lại', 'Tài sản chuyển sổ: số đã khấu hao tới hết ngày đó; phần mềm trích từ tháng sau, hết số tháng còn lại thì trích nốt'],
  ['Mức khấu hao tháng', 'Trống = giá trị tính khấu hao ÷ số tháng; được ghi số lẻ, mỗi tháng làm tròn đồng'],
  ['Phân bổ', 'Chia chi phí: "chi nhánh:TK chi phí:tỷ lệ", nhiều dòng cách nhau dấu chấm phẩy. Ví dụ "26001:6414:60; 26002:6414:40". Trống = TK chi phí của thẻ'],
  ['Trạng thái', 'Đang dùng, Tạm ngừng, Đã ghi giảm (đã ghi giảm phải có Ngày ghi giảm)'],
  ['Kích thước, Điện năng tiêu thụ', 'Ghi như trên thẻ, ví dụ "60 x 70 x 180 cm", "350 W"'],
  ['Thông số khác', 'Nhiều thông số cách nhau dấu chấm phẩy, mỗi thông số dạng "Tên: giá trị". Ví dụ "Model: VH-4099; Số khung: 123". Ba cột thông số để trống thì giữ thông số đã có trên thẻ'],
];

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]/g, '');
const HEADER_KEY = new Map(TEMPLATE_HEADERS.map((h) => [plain(h), h]));

export interface ParsedRow { row: number; data: Record<string, unknown>; problems: string[] }

function toDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'number') {
    // Số ngày kiểu Excel (từ 1899-12-30).
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return 'invalid';
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim().replace(/\s/g, '');
  // "1.234.567,5" (kiểu Việt) hoặc "1,234,567.5" hoặc "1234567.5"
  const vn = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^-?\d+,\d+$/.test(s);
  const n = Number(vn ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

/** Thông số kỹ thuật từ ba cột Excel; cả ba trống = undefined (giữ thông số đã có trên thẻ). */
function specsOf(size: string, power: string, other: string): { name: string; value: string }[] | undefined {
  const out: { name: string; value: string }[] = [];
  if (size) out.push({ name: 'Kích thước', value: size });
  if (power) out.push({ name: 'Điện năng tiêu thụ', value: power });
  for (const part of other.split(';').map((s) => s.trim()).filter(Boolean)) {
    const i = part.indexOf(':');
    out.push(i > 0 ? { name: part.slice(0, i).trim(), value: part.slice(i + 1).trim() } : { name: 'Ghi chú', value: part });
  }
  return out.length ? out : undefined;
}

const KIND: Record<string, string> = { tscd: 'fixed_asset', taisancodinh: 'fixed_asset', fixedasset: 'fixed_asset', ccdc: 'tool', congcudungcu: 'tool', tool: 'tool', tratruoc: 'prepaid', chiphitratruoc: 'prepaid', prepaid: 'prepaid' };
const STATUS: Record<string, string> = { dangdung: 'in_use', inuse: 'in_use', tamngung: 'stopped', tamngungtrich: 'stopped', stopped: 'stopped', daghigiam: 'disposed', disposed: 'disposed', thanhly: 'disposed' };

/** Đọc tệp Excel / CSV thành các dòng dữ liệu thẻ tài sản kèm lỗi phát hiện ngay ở trình duyệt. */
export async function readAssetFile(file: File): Promise<{ rows: ParsedRow[]; unknownHeaders: string[] }> {
  const XLSX = await import('xlsx');
  // CSV: đọc nguyên chữ (giữ số 0 đầu của mã chi nhánh như 06000); ngày, số tự đổi ở dưới.
  const isCsv = /\.csv$/i.test(file.name);
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, raw: isCsv });
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: true });
  const headers = raw.length ? Object.keys(raw[0]!) : [];
  const unknownHeaders = headers.filter((h) => !HEADER_KEY.has(plain(h)));
  const rows: ParsedRow[] = [];
  raw.forEach((r, i) => {
    const get = (name: (typeof TEMPLATE_HEADERS)[number]) => {
      const key = headers.find((h) => plain(h) === plain(name));
      return key ? r[key] : '';
    };
    const text = (name: (typeof TEMPLATE_HEADERS)[number]) => String(get(name) ?? '').trim();
    if (!text('Mã tài sản') && !text('Tên tài sản')) return;
    const problems: string[] = [];
    const num = (name: (typeof TEMPLATE_HEADERS)[number]) => {
      const v = toNum(get(name));
      if (Number.isNaN(v)) problems.push(`${name} không phải số`);
      return v === null || Number.isNaN(v) ? null : v;
    };
    const dt = (name: (typeof TEMPLATE_HEADERS)[number]) => {
      const v = toDate(get(name));
      if (v === 'invalid') problems.push(`${name} không đúng dạng ngày`);
      return v === 'invalid' ? null : v;
    };
    const kindText = plain(text('Nhóm'));
    const kind = kindText ? KIND[kindText] : 'fixed_asset';
    if (!kind) problems.push(`Nhóm "${text('Nhóm')}" không rõ (TSCĐ, CCDC, Trả trước)`);
    const statusText = plain(text('Trạng thái'));
    const status = statusText ? STATUS[statusText] : 'in_use';
    if (!status) problems.push(`Trạng thái "${text('Trạng thái')}" không rõ`);
    const allocations = text('Phân bổ')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [branchCode, expenseAccount, percent] = s.split(':').map((x) => x.trim());
        const pc = toNum(percent);
        if (!expenseAccount || !pc || Number.isNaN(pc)) problems.push(`Phân bổ "${s}" phải dạng chi nhánh:TK chi phí:tỷ lệ`);
        return { branchCode: branchCode || null, expenseAccount: expenseAccount ?? '', percent: pc ?? 0 };
      });
    const data = {
      code: text('Mã tài sản'), name: text('Tên tài sản'), kind, categoryCode: text('Loại tài sản') || null, branchCode: text('Chi nhánh'),
      acquiredDate: dt('Ngày ghi tăng'), startDate: dt('Ngày bắt đầu khấu hao'), originalCost: num('Nguyên giá'), depreciableAmount: num('Giá trị tính khấu hao'),
      usefulLifeMonths: num('Số tháng sử dụng'), openingAccumulated: num('Luỹ kế đã khấu hao') ?? 0, openingAsOf: dt('Luỹ kế tính tới ngày'),
      openingRemainingMonths: num('Số tháng còn lại'), monthlyAmount: num('Mức khấu hao tháng'), taxMonthlyAmount: num('Mức khấu hao tháng theo thuế'),
      assetAccount: text('TK nguyên giá') || null, depreciationAccount: text('TK hao mòn'), expenseAccount: text('TK chi phí') || allocations[0]?.expenseAccount || '',
      departmentCode: text('Bộ phận') || null, costItemCode: text('Khoản mục') || null, allocations: allocations.length ? allocations : undefined,
      status, disposedDate: dt('Ngày ghi giảm'), unit: text('Đơn vị tính'), quantity: num('Số lượng') ?? 1, note: text('Ghi chú'),
      specs: specsOf(text('Kích thước'), text('Điện năng tiêu thụ'), text('Thông số khác')),
    };
    if (!data.code) problems.push('Thiếu mã tài sản');
    if (!data.name) problems.push('Thiếu tên tài sản');
    if (!data.branchCode) problems.push('Thiếu chi nhánh');
    if (!data.startDate) problems.push('Thiếu ngày bắt đầu khấu hao');
    if (!data.originalCost) problems.push('Thiếu nguyên giá');
    if (!data.usefulLifeMonths) problems.push('Thiếu số tháng sử dụng');
    if (!data.depreciationAccount) problems.push('Thiếu TK hao mòn');
    if (!data.expenseAccount) problems.push('Thiếu TK chi phí');
    if (data.openingRemainingMonths !== null) data.openingRemainingMonths = Math.round(data.openingRemainingMonths);
    if (data.usefulLifeMonths) data.usefulLifeMonths = Math.round(data.usefulLifeMonths);
    rows.push({ row: i + 2, data, problems });
  });
  return { rows, unknownHeaders };
}

/** Tải tệp mẫu Excel (một sheet dữ liệu có dòng ví dụ, một sheet hướng dẫn). */
export async function downloadTemplate() {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const sample = [
    ['TS0001', 'Máy tính tiền quầy 1', 'TSCĐ', 'TS-MAY', 'CN01', '15/03/2024', '15/03/2024', 36000000, '', 36, 18500000, '31/12/2025', 17, 1000000, '', '2112', '2141', '6424', '', '', '', 'Đang dùng', '', 'Cái', 1, ''],
    ['CC0001', 'Tủ mát trưng bày', 'CCDC', 'CCDC-DH', 'CN01', '01/10/2025', '01/10/2025', 2400000, '', 24, 300000, '31/12/2025', 21, '', '', '', '24228', '64231', '', '', 'CN01:64231:60; CN02:64231:40', 'Đang dùng', '', 'Cái', 1, ''],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...TEMPLATE_HEADERS], ...sample]), 'Tai san');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Cột', 'Cách ghi'], ...TEMPLATE_NOTES]), 'Huong dan');
  XLSX.writeFile(wb, 'mau-nhap-tai-san.xlsx');
}
