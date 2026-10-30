import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { CORE_MENU, MODULES } from './src/layout/menu';

/**
 * Xuất menu ra /erp-menu.json (tĩnh): trang quản trị đọc để dựng menu kế toán của mình (giao diện nhúng không có menu).
 * Mục add-in không có ở đây — trang quản trị lấy thêm qua /api/v1/system/addins.
 */
function erpMenuJson() {
  const json = () => JSON.stringify({ version: 1, modules: MODULES, menu: CORE_MENU });
  return {
    name: 'erp-menu-json',
    generateBundle(this: { emitFile: (f: { type: 'asset'; fileName: string; source: string }) => void }) {
      this.emitFile({ type: 'asset', fileName: 'erp-menu.json', source: json() });
    },
    configureServer(server: { middlewares: { use: (p: string, h: (req: unknown, res: { setHeader: (k: string, v: string) => void; end: (s: string) => void }) => void) => void } }) {
      server.middlewares.use('/erp-menu.json', (_req, res) => { res.setHeader('content-type', 'application/json'); res.end(json()); });
    },
  };
}

export default defineConfig({
  plugins: [react(), erpMenuJson()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Tài liệu hướng dẫn dùng chung giữa thư mục docs/ và giao diện (nút "Hướng dẫn").
      '@docs': path.resolve(__dirname, '../../docs'),
    },
  },
  server: {
    port: 4180,
    // API_TARGET: chạy chỉ giao diện, gọi API dev dùng chung (scripts/dev.mjs --api=…). Mặc định API trên máy.
    proxy: {
      '/api': { target: process.env.API_TARGET || 'http://localhost:4100', changeOrigin: true },
      '/mcp': { target: process.env.API_TARGET || 'http://localhost:4100', changeOrigin: true },
    },
    fs: { allow: [path.resolve(__dirname, '../..')] },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 },
});
