import { Link } from "@tanstack/react-router";
import { ArrowRight, Home, DollarSign, ClipboardCheck, Users } from "lucide-react";

const features = [
  { icon: Home, text: "Search & shortlist properties" },
  { icon: ClipboardCheck, text: "Due diligence & evaluations" },
  { icon: DollarSign, text: "Offers, finance & budgeting" },
  { icon: Users, text: "Built for couples & families" },
];

export function LandingHero() {
  return (
    <div className="relative min-h-[100dvh] flex flex-col overflow-hidden bg-slate-950">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover opacity-35"
        poster=""
      >
        <source src="/hero-aerial.mp4" type="video/mp4" />
      </video>

      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/40 to-slate-950/90" />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 py-16 text-center">
        <img
          src="/logo.png"
          alt="Homelhar"
          className="h-28 w-auto mb-4 drop-shadow-2xl"
        />

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight max-w-lg">
          Your dream home,
          <br />
          <span className="text-primary-400">one simple journey</span>
        </h1>

        <p className="mt-4 text-base sm:text-lg text-slate-300 max-w-md leading-relaxed">
          The all-in-one companion for buying and selling your home.
          Track listings, manage due diligence, compare properties, and
          coordinate offers — together, in one place.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-3 max-w-sm w-full">
          {features.map(({ icon: Icon, text }) => (
            <div
              key={text}
              className="flex items-center gap-2.5 rounded-xl bg-white/[0.07] backdrop-blur-sm border border-white/10 px-3 py-2.5"
            >
              <Icon className="h-4.5 w-4.5 shrink-0 text-primary-400" />
              <span className="text-xs sm:text-sm text-slate-200 text-left leading-snug">{text}</span>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 w-full max-w-xs">
          <Link
            to="/register"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 hover:bg-primary-500 active:bg-primary-700 text-white font-semibold h-12 px-6 text-base transition-colors shadow-lg shadow-primary-600/25"
          >
            Get started free
            <ArrowRight className="h-4.5 w-4.5" />
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 backdrop-blur-sm border border-white/15 text-white font-medium h-12 px-6 text-base transition-colors"
          >
            Sign in
          </Link>
        </div>

        <p className="mt-6 text-xs text-slate-500">
          Free for personal use &middot; No credit card required
        </p>
      </div>
    </div>
  );
}
