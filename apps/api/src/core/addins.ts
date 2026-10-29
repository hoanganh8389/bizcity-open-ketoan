/**
 * Cơ chế add-in (phần mở rộng).
 *
 * Một add-in là một gói chức năng cắm thêm, không sửa lõi:
 *   - khai báo thông tin (manifest): mã, tên, phiên bản, mô tả, mục menu;
 *   - đăng ký route riêng dưới /api/v1/addins/<mã>/...;
 *   - dùng lại dịch vụ lõi qua AddInContext (đọc sổ cái, báo cáo, danh mục).
 *
 * Bật/tắt: biến môi trường ADDINS ("*" = tất cả, hoặc danh sách mã cách nhau dấu phẩy).
 * Giao diện tương ứng của add-in nằm ở apps/web/src/addins/<mã>.
 * Hướng dẫn viết add-in: docs/add-in.md
 */
import type { FastifyInstance } from 'fastify';
import type { MenuItem } from '@ketoan/contracts';
import type { Db } from '../db/client.js';

export interface AddInManifest {
  /** Mã duy nhất, chữ thường, gạch ngang. Ví dụ "excel-export". */
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  /** Mục menu add-in muốn gắn vào thanh menu (đặt dưới nhóm "Tiện ích" nếu không chỉ định). */
  menu?: MenuItem[];
  /** Nhóm menu cha muốn gắn vào (key của nhóm menu lõi). */
  menuParent?: string;
}

/** Những gì lõi cho add-in dùng. Mở rộng dần, giữ ổn định giao diện. */
export interface AddInContext {
  db: Db;
  log: FastifyInstance['log'];
}

export interface ApiAddIn {
  manifest: AddInManifest;
  /** Đăng ký route. `app` đã được gắn tiền tố /api/v1/addins/<id>. */
  register(app: FastifyInstance, ctx: AddInContext): Promise<void> | void;
}

/** Khai báo add-in (giúp gợi ý kiểu khi viết add-in). */
export function defineAddIn(addin: ApiAddIn): ApiAddIn {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(addin.manifest.id)) {
    throw new Error(`Mã add-in không hợp lệ: ${addin.manifest.id}`);
  }
  return addin;
}

/** Lọc danh sách add-in theo cấu hình bật. */
export function selectEnabled(all: ApiAddIn[], setting: string): ApiAddIn[] {
  const s = setting.trim();
  if (s === '' || s === '-') return [];
  if (s === '*') return all;
  const wanted = new Set(s.split(',').map((x) => x.trim()));
  return all.filter((a) => wanted.has(a.manifest.id));
}
