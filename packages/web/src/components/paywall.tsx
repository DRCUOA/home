import { useState } from "react";
import { Lock, Sparkles, ArrowRight } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { apiPost } from "@/lib/api";
import { PLAN_LIMITS, type PlanId } from "@hcc/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function useCanAccess(feature: keyof (typeof PLAN_LIMITS)["free"]): boolean {
  const plan = useAuthStore((s) => s.user?.plan ?? "free") as PlanId;
  const limit = PLAN_LIMITS[plan]?.[feature];
  return typeof limit === "boolean" ? limit : true;
}

export function usePlanLimit<K extends keyof (typeof PLAN_LIMITS)["free"]>(
  feature: K
): (typeof PLAN_LIMITS)["free"][K] {
  const plan = useAuthStore((s) => s.user?.plan ?? "free") as PlanId;
  return PLAN_LIMITS[plan][feature];
}

export function UpgradeGate({
  feature,
  featureLabel,
  children,
}: {
  feature: keyof (typeof PLAN_LIMITS)["free"];
  featureLabel: string;
  children: React.ReactNode;
}) {
  const hasAccess = useCanAccess(feature);
  const [showModal, setShowModal] = useState(false);

  if (hasAccess) return <>{children}</>;

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="relative w-full"
      >
        <div className="pointer-events-none opacity-40 blur-[1px]">{children}</div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/60 dark:bg-slate-950/70 rounded-xl backdrop-blur-sm">
          <Lock className="h-6 w-6 text-amber-400" />
          <span className="text-sm font-semibold text-white">Upgrade to unlock</span>
          <span className="text-xs text-slate-300">{featureLabel}</span>
        </div>
      </button>
      <UpgradeModal open={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}

export function UpgradeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const plan = useAuthStore((s) => s.user?.plan ?? "free");

  const startCheckout = async (planId: string) => {
    setLoading(planId);
    try {
      const res = await apiPost<{ data: { url: string } }>("/billing/checkout", { planId });
      window.location.href = res.data.url;
    } catch {
      setLoading(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Upgrade your plan">
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Unlock powerful features to streamline your property journey.
        </p>

        {plan !== "pro" && (
          <div className="rounded-xl border border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-900/20 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                <span className="font-bold text-slate-900 dark:text-slate-100">Pro</span>
              </div>
              <span className="text-lg font-extrabold text-slate-900 dark:text-slate-100">$15<span className="text-sm font-normal text-slate-500"> /mo</span></span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
              AI enrichment, advanced search, comparisons, due diligence, offers & more.
            </p>
            <Button
              className="w-full"
              disabled={loading === "pro"}
              onClick={() => startCheckout("pro")}
            >
              {loading === "pro" ? "Redirecting…" : "Upgrade to Pro"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {plan !== "lifetime" && (
          <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <span className="font-bold text-slate-900 dark:text-slate-100">Lifetime</span>
              </div>
              <span className="text-lg font-extrabold text-slate-900 dark:text-slate-100">$100<span className="text-sm font-normal text-slate-500"> once</span></span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
              Everything in Pro forever, plus AI assistant, multi-project & all future features.
            </p>
            <Button
              className="w-full !bg-amber-600 hover:!bg-amber-500"
              disabled={loading === "lifetime"}
              onClick={() => startCheckout("lifetime")}
            >
              {loading === "lifetime" ? "Redirecting…" : "Get Lifetime access"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
