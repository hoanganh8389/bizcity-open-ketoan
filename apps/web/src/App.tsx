/**
 * Gốc ứng dụng: các provider (dữ liệu, đăng nhập) và bảng định tuyến.
 * Thêm màn hình mới: tạo trang trong src/features/<nhom>/, thêm Route ở pages.tsx và mục menu ở layout/menu.ts.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { AppLayout } from './layout/AppLayout';
import { Loading } from './components/ui';
import { LoginPage } from './features/auth/LoginPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/dang-nhap" replace />;
  return <AppLayout />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/dang-nhap" element={<LoginPage />} />
            <Route path="/*" element={<Protected />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
