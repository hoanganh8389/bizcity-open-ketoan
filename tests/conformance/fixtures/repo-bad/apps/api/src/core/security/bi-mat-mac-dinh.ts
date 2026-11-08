// @bizcity-layer P permissions
// Ca mẫu SC-SEC-5: một bí mật có giá trị mặc định viết trong mã (bắt); biến thường và mặc định rỗng không bắt.
export const toolPassword = process.env.TOOL_PASSWORD || 'mat-khau-ai-cung-biet';
export const host = process.env.HOST || 'localhost';
export const dbPassword = process.env.DB_APP_PASSWORD ?? '';
