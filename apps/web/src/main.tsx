import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/theme.css';
import { setAdminUrl } from './lib/sourceDoc';
import { installColumnResize } from './lib/colResize';
import { installTableNav } from './lib/tableNav';
import { installPrintCatalog } from './printCatalog';

function render() {
  installColumnResize();
  installTableNav();
  installPrintCatalog();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

/**
 * Phần mềm kế toán chạy ĐỘC LẬP (23/10/2026 bỏ nhúng vào trang quản trị). Lúc mở chỉ hỏi máy chủ địa chỉ trang quản trị
 * bán hàng (để mở phiếu gốc ở tab mới — lib/sourceDoc.ts); không trả lời thì vẫn chạy bình thường.
 */
async function boot() {
  try {
    const res = await fetch('/api/v1/auth/wp-sso');
    const json = (await res.json()) as { ok: boolean; data?: { adminUrl?: string | null } };
    setAdminUrl(json.ok ? json.data?.adminUrl ?? null : null);
  } catch { /* máy chủ không trả lời: chạy như cũ */ }
  render();
}

void boot();
