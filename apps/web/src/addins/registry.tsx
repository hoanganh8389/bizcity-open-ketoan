/**
 * Phần giao diện của các add-in. Mỗi add-in khai báo trang (route) tương ứng với mục
 * menu trong manifest phía API. Thêm add-in: tạo thư mục src/addins/<ma>/ và thêm vào đây.
 */
import type { ReactNode } from 'react';
import { SpreadsheetAiPage } from './spreadsheet-ai/SpreadsheetAiPage';
import { TroLyPage } from './tro-ly/TroLyPage';

export interface AddInRoute {
  addinId: string;
  path: string;
  element: ReactNode;
}

export const ADDIN_ROUTES: AddInRoute[] = [
  { addinId: 'spreadsheet-ai', path: '/addins/spreadsheet-ai', element: <SpreadsheetAiPage /> },
  { addinId: 'tro-ly', path: '/addins/tro-ly', element: <TroLyPage /> },
];
