import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, ArrowLeft, Check, Crown, Loader2, Rocket, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth";

const VIDEOS = [
  "/hero-family-park.mp4",
  "/hero-couple-smile.mp4",
  "/hero-keys-handover.mp4",
  "/hero-moving-in.mp4",
  "/hero-family-home.mp4",
  "/hero-aerial.mp4",
];

const CROSSFADE_MS = 1200;
const CLIP_DURATION_MS = 5000;

type Panel = null | "login" | "register";

const PLANS_KEY = "homelhar-show-plans";

export function LandingHero() {
  const [panel, setPanel] = useState<Panel>(null);

  const handleRegistered = () => {
    sessionStorage.setItem(PLANS_KEY, "1");
  };

  return (
    <div className="relative min-h-[100dvh] flex flex-col overflow-hidden bg-slate-950">
      <VideoMontage />

      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/50 via-slate-950/30 to-slate-950/80" />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 py-16 text-center">
        <img
          src="/logo.png"
          alt="Homelhar"
          className="h-24 w-auto mb-5 drop-shadow-2xl"
        />

        {panel === "login" || panel === "register" ? (
          <AuthForm mode={panel} onBack={() => setPanel(null)} onSwitch={setPanel} onRegistered={handleRegistered} />
        ) : (
          <HeroCTA onAction={setPanel} />
        )}
      </div>

      <p className="relative z-10 pb-4 text-center text-[11px] text-slate-600">
        &copy; 2026 NZWebApps. All rights reserved.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Video montage                                                     */
/* ------------------------------------------------------------------ */

function VideoMontage() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [nextIdx, setNextIdx] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const advance = useCallback(() => {
    setNextIdx((prev) => {
      const next = ((prev ?? activeIdx) + 1) % VIDEOS.length;
      return next;
    });
  }, [activeIdx]);

  useEffect(() => {
    timerRef.current = setTimeout(advance, CLIP_DURATION_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [activeIdx, advance]);

  useEffect(() => {
    if (nextIdx == null) return;
    const t = setTimeout(() => {
      setActiveIdx(nextIdx);
      setNextIdx(null);
    }, CROSSFADE_MS);
    return () => clearTimeout(t);
  }, [nextIdx]);

  return (
    <div className="absolute inset-0">
      {VIDEOS.map((src, i) => {
        const isActive = i === activeIdx;
        const isNext = i === nextIdx;
        if (!isActive && !isNext) return null;
        return (
          <video
            key={src}
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover transition-opacity"
            style={{
              opacity: isNext ? 1 : nextIdx != null && isActive ? 0 : 1,
              transitionDuration: `${CROSSFADE_MS}ms`,
              zIndex: isNext ? 2 : 1,
            }}
          >
            <source src={src} type="video/mp4" />
          </video>
        );
      })}
      <div className="absolute inset-0 bg-black/50 z-[3]" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero CTA                                                          */
/* ------------------------------------------------------------------ */

function HeroCTA({ onAction }: { onAction: (m: Panel) => void }) {
  return (
    <>
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight max-w-md">
        Sell, find &amp; move —
        <br />
        <span className="text-primary-400">all in one place</span>
      </h1>

      <p className="mt-4 text-base sm:text-lg text-slate-200/90 max-w-sm leading-relaxed">
        Selling up, finding the perfect home and moving your family is stressful.
        Homelhar keeps everything organised so you can focus on what matters.
      </p>

      <div className="mt-7 flex flex-col gap-2 text-left w-full max-w-xs">
        {[
          "Track listings & shortlist together",
          "Due diligence, offers & finance in one view",
          "Coordinate the move without the spreadsheets",
        ].map((line) => (
          <div key={line} className="flex items-start gap-2.5">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary-400" />
            <span className="text-sm text-slate-300 leading-snug">{line}</span>
          </div>
        ))}
      </div>

      <div className="mt-9 flex flex-col gap-3 w-full max-w-xs">
        <button
          type="button"
          onClick={() => onAction("register")}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 hover:bg-primary-500 active:bg-primary-700 text-white font-semibold h-12 px-6 text-base transition-colors shadow-lg shadow-primary-600/25"
        >
          Get started free
          <ArrowRight className="h-4.5 w-4.5" />
        </button>
        <button
          type="button"
          onClick={() => onAction("login")}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 backdrop-blur-sm border border-white/15 text-white font-medium h-12 px-6 text-base transition-colors"
        >
          Sign in
        </button>
      </div>

      <p className="mt-5 text-xs text-slate-500">
        Free for personal use &middot; No credit card required
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Auth form                                                         */
/* ------------------------------------------------------------------ */

function AuthForm({
  mode,
  onBack,
  onSwitch,
  onRegistered,
}: {
  mode: "login" | "register";
  onBack: () => void;
  onSwitch: (m: Panel) => void;
  onRegistered: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
        navigate({ to: "/" });
      } else {
        onRegistered();
        await register(email, password, name);
      }
    } catch (err: any) {
      setError(err.message || (mode === "login" ? "Sign in failed" : "Registration failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors mb-5"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <div className="rounded-2xl bg-slate-900/80 backdrop-blur-xl border border-white/10 p-6 shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-1">
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h2>
        <p className="text-sm text-slate-400 mb-5">
          {mode === "login"
            ? "Sign in to continue your journey"
            : "Start managing your home sale and purchase"}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === "register" && (
            <Input
              id="hero-name"
              label="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              className="!bg-slate-800/80 !border-slate-700 !text-white"
            />
          )}
          <Input
            id="hero-email"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="!bg-slate-800/80 !border-slate-700 !text-white"
          />
          <Input
            id="hero-password"
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === "register" ? 8 : undefined}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="!bg-slate-800/80 !border-slate-700 !text-white"
          />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <Button type="submit" className="w-full !h-11 !text-base" disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "login" ? (
              "Sign in"
            ) : (
              "Create account"
            )}
          </Button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-5">
          {mode === "login" ? (
            <>
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => onSwitch("register")}
                className="text-primary-400 font-medium hover:underline"
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => onSwitch("login")}
                className="text-primary-400 font-medium hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Plan picker                                                       */
/* ------------------------------------------------------------------ */

interface PlanDef {
  id: string;
  name: string;
  price: string;
  period: string;
  badge: string;
  icon: typeof Star;
  accent: string;
  ring: string;
  bg: string;
  cta: string;
  features: string[];
}

const PLANS: PlanDef[] = [
  {
    id: "free",
    name: "Starter",
    price: "Free",
    period: "forever",
    badge: "Get started",
    icon: Star,
    accent: "text-slate-300",
    ring: "border-slate-700",
    bg: "bg-slate-900/70",
    cta: "Continue with Free",
    features: [
      "Up to 3 tracked properties",
      "Manual property entry",
      "Basic buy & sell dashboards",
      "Single financial scenario",
      "Task checklists",
      "Photo gallery (25 images)",
      "Notes & contacts",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$15",
    period: "/ month",
    badge: "Most popular",
    icon: Rocket,
    accent: "text-primary-400",
    ring: "border-primary-500/60",
    bg: "bg-primary-950/40",
    cta: "Start Pro plan",
    features: [
      "Unlimited properties",
      "AI Listing Enrichment — auto-extract details & photos from URLs",
      "Advanced Search — find anything across notes, contacts & properties",
      "Property Comparison — side-by-side evaluation",
      "Due Diligence Tracker — LIM, title, builder's reports & more",
      "Unlimited financial scenarios & comparisons",
      "Offer Management — track & coordinate submitted offers",
      "Shared access for couples",
      "Unlimited photo gallery & file storage",
      "Communication log — calls, emails, meetings",
    ],
  },
  {
    id: "lifetime",
    name: "Lifetime",
    price: "$100",
    period: "one-time",
    badge: "Best value",
    icon: Crown,
    accent: "text-amber-400",
    ring: "border-amber-500/50",
    bg: "bg-amber-950/30",
    cta: "Get Lifetime access",
    features: [
      "Everything in Pro, forever",
      "AI Assistant — chat-powered research, summaries & analysis",
      "AI Business Card Scanner — snap a card, auto-create contacts",
      "Advanced Checklists — pre-sale, staging, due diligence templates",
      "Research Library — save & categorise articles, links & resources",
      "Multi-project support — buy & sell simultaneously",
      "Priority feature requests",
      "All future features included at no extra cost",
    ],
  },
];

export function PlanPicker({ onDone }: { onDone: () => void }) {
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const handleSelect = async (planId: string) => {
    if (planId === "free") {
      onDone();
      return;
    }
    setCheckoutLoading(planId);
    try {
      const { apiPost } = await import("@/lib/api");
      const res = await apiPost<{ data: { url: string } }>("/billing/checkout", { planId });
      if (res.data.url) {
        window.location.href = res.data.url;
      } else {
        onDone();
      }
    } catch {
      onDone();
    }
  };

  return (
    <div className="relative min-h-[100dvh] flex flex-col overflow-hidden bg-slate-950">
      <VideoMontage />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/50 via-slate-950/30 to-slate-950/80" />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 py-12 text-center">
        <img
          src="/logo.png"
          alt="Homelhar"
          className="h-20 w-auto mb-4 drop-shadow-2xl"
        />

        <div className="w-full max-w-lg animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 mb-2">
              <Sparkles className="h-5 w-5 text-primary-400" />
              <h2 className="text-xl font-bold text-white">Choose your plan</h2>
            </div>
            <p className="text-sm text-slate-400">
              You can change your plan any time from settings.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {PLANS.map((plan) => {
              const Icon = plan.icon;
              const isLoading = checkoutLoading === plan.id;
              return (
                <div
                  key={plan.id}
                  className={`rounded-2xl border ${plan.ring} ${plan.bg} backdrop-blur-xl p-5 text-left shadow-xl transition-transform active:scale-[0.99]`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <Icon className={`h-5 w-5 ${plan.accent}`} />
                      <span className="font-bold text-white text-lg">{plan.name}</span>
                    </div>
                    <span className={`text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${plan.ring} ${plan.accent}`}>
                      {plan.badge}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-1.5 mb-4">
                    <span className="text-2xl font-extrabold text-white">{plan.price}</span>
                    <span className="text-sm text-slate-400">{plan.period}</span>
                  </div>

                  <ul className="space-y-2 mb-5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm">
                        <Check className={`h-4 w-4 shrink-0 mt-0.5 ${plan.accent}`} />
                        <span className="text-slate-300 leading-snug">{f}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => handleSelect(plan.id)}
                    disabled={checkoutLoading !== null}
                    className={`w-full rounded-xl font-semibold h-11 text-sm transition-colors disabled:opacity-60 ${
                      plan.id === "pro"
                        ? "bg-primary-600 hover:bg-primary-500 active:bg-primary-700 text-white shadow-lg shadow-primary-600/20"
                        : plan.id === "lifetime"
                          ? "bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white shadow-lg shadow-amber-600/20"
                          : "bg-white/10 hover:bg-white/15 active:bg-white/20 text-white border border-white/15"
                    }`}
                  >
                    {isLoading ? "Redirecting to checkout…" : plan.cta}
                  </button>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onDone}
            disabled={checkoutLoading !== null}
            className="mt-4 text-sm text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40"
          >
            Skip for now
          </button>
        </div>
      </div>

      <p className="relative z-10 pb-4 text-center text-[11px] text-slate-600">
        &copy; 2026 NZWebApps. All rights reserved.
      </p>
    </div>
  );
}
