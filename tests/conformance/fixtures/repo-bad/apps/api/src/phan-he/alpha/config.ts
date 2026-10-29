// SC-SEC-1: khoá 1API giả gán cứng (giá trị bịa, không phải khoá thật)
export const apiKey = 'biz-0123456789abcdef0123456789abcdef';
// SC-SEC-2: ghép chuỗi vào SQL
export const q = (sql: any, col: string) => sql.raw(`ORDER BY ${col}`);
