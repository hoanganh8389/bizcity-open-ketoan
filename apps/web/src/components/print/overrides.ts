/**
 * Phần chỉnh nội dung của mẫu đang in (cấu hình HT05): PrintJob đặt vào ngữ cảnh, các khối Title / OrgHead / Signs / LedgerForm /
 * BillForm đọc để thay tiêu đề, dòng căn cứ, logo, hàng chữ ký. Ngoài lúc in (hoặc mẫu chưa chỉnh) là {} — vẽ như mẫu gốc.
 */
import { createContext, useContext } from 'react';
import type { PrintOverrides } from '@ketoan/contracts';

export const PrintOverridesCtx = createContext<PrintOverrides>({});
export const usePrintOverrides = () => useContext(PrintOverridesCtx);
