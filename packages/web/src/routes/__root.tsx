import { createRootRoute, Outlet, useLocation, Navigate } from "@tanstack/react-router";
import { BottomNav } from "@/components/layout/bottom-nav";
import { LandingHero, PlanPicker } from "@/components/landing-hero";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";
import { useEffect, useState } from "react";

const PLANS_KEY = "homelhar-show-plans";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const { isAuthenticated, isLoading, checkAuth, refreshUser } = useAuthStore();
  const location = useLocation();
  const isAuthPage = location.pathname === "/login" || location.pathname === "/register";
  const [showPlans, setShowPlans] = useState(false);

  useThemeStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (isAuthenticated && sessionStorage.getItem(PLANS_KEY) === "1") {
      setShowPlans(true);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success" && isAuthenticated) {
      refreshUser();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [isAuthenticated, refreshUser]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LandingHero />;
  }

  if (showPlans) {
    return (
      <PlanPicker
        onDone={() => {
          sessionStorage.removeItem(PLANS_KEY);
          setShowPlans(false);
        }}
      />
    );
  }

  if (isAuthPage) {
    return <Navigate to="/" />;
  }

  return (
    <>
      <Outlet />
      <BottomNav />
    </>
  );
}
