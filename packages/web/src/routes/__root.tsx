import { createRootRoute, Outlet, useLocation, Navigate } from "@tanstack/react-router";
import { BottomNav } from "@/components/layout/bottom-nav";
import { useAuthStore } from "@/stores/auth";
import { useEffect } from "react";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const location = useLocation();
  const isAuthPage = location.pathname === "/login" || location.pathname === "/register";

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated && !isAuthPage) {
    return <Navigate to="/login" />;
  }

  if (isAuthenticated && isAuthPage) {
    return <Navigate to="/" />;
  }

  return (
    <>
      <Outlet />
      {isAuthenticated && !isAuthPage && <BottomNav />}
    </>
  );
}
