import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingDown,
  ShoppingCart,
  CalendarClock,
  Wallet,
  MessageSquare,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type {
  Project,
  Task,
  FinancialScenario,
  CommunicationLog,
  Property,
} from "@hcc/shared";
import { SELL_MILESTONES, BUY_MILESTONES } from "@hcc/shared";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { QuickAddFab } from "@/components/features/quick-add";
import { apiGet } from "@/lib/api";
import { formatCurrency, formatDate, capitalize } from "@/lib/format";

type ListResponse<T> = { data: T[]; total: number };

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function milestoneProgress(
  milestone: string | undefined,
  order: readonly string[]
): number {
  if (!milestone) return 0;
  const idx = order.indexOf(milestone);
  if (idx < 0) return 0;
  return ((idx + 1) / order.length) * 100;
}

function sortTasksUpcoming(tasks: Task[]): Task[] {
  return [...tasks]
    .filter((t) => t.status !== "done")
    .sort((a, b) => {
      const da = a.due_date ? new Date(a.due_date).getTime() : null;
      const db = b.due_date ? new Date(b.due_date).getTime() : null;
      if (da != null && db != null) return da - db;
      if (da != null) return -1;
      if (db != null) return 1;
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    })
    .slice(0, 5);
}

function sortCommunicationsRecent(logs: CommunicationLog[]): CommunicationLog[] {
  return [...logs]
    .sort(
      (a, b) =>
        new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
    )
    .slice(0, 5);
}

function latestScenario(scenarios: FinancialScenario[]): FinancialScenario | null {
  if (scenarios.length === 0) return null;
  return [...scenarios].sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )[0];
}

function DashboardPage() {
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiGet<ListResponse<Project>>("/projects"),
  });

  const sellProject = projectsQuery.data?.data.find((p) => p.type === "sell");
  const buyProject = projectsQuery.data?.data.find((p) => p.type === "buy");

  const tasksQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: () => apiGet<ListResponse<Task>>("/tasks"),
  });

  const scenariosQuery = useQuery({
    queryKey: ["financial-scenarios"],
    queryFn: () => apiGet<ListResponse<FinancialScenario>>("/financial-scenarios"),
  });

  const communicationsQuery = useQuery({
    queryKey: ["communications"],
    queryFn: () => apiGet<ListResponse<CommunicationLog>>("/communications"),
  });

  const propertiesQuery = useQuery({
    queryKey: ["properties", buyProject?.id],
    queryFn: () =>
      apiGet<ListResponse<Property>>(
        `/properties?project_id=${encodeURIComponent(buyProject!.id)}`
      ),
    enabled: Boolean(buyProject?.id),
  });

  const loading =
    projectsQuery.isLoading ||
    tasksQuery.isLoading ||
    scenariosQuery.isLoading ||
    communicationsQuery.isLoading ||
    (Boolean(buyProject?.id) && propertiesQuery.isLoading);

  const hasError =
    projectsQuery.isError ||
    tasksQuery.isError ||
    scenariosQuery.isError ||
    communicationsQuery.isError ||
    propertiesQuery.isError;

  const upcomingTasks = tasksQuery.data
    ? sortTasksUpcoming(tasksQuery.data.data)
    : [];

  const recentComms = communicationsQuery.data
    ? sortCommunicationsRecent(communicationsQuery.data.data)
    : [];

  const recentScenario = scenariosQuery.data
    ? latestScenario(scenariosQuery.data.data)
    : null;

  const propertyList = propertiesQuery.data?.data ?? [];
  const savedCount = propertyList.filter((p) => p.watchlist_status !== "rejected").length;
  const shortlistedCount = propertyList.filter(
    (p) => p.watchlist_status === "shortlisted"
  ).length;

  const sellProgress = milestoneProgress(sellProject?.sell_milestone, SELL_MILESTONES);
  const buyProgress = milestoneProgress(buyProject?.buy_milestone, BUY_MILESTONES);

  if (loading) {
    return (
      <PageShell title="Home">
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500 dark:text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm">Loading your dashboard…</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Home">
      <div className="space-y-5">
        {hasError && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Some data could not be loaded. Pull to refresh or try again shortly.
            </span>
          </div>
        )}

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Sale
          </h2>
          {!sellProject ? (
            <Card>
              <CardContent className="py-8">
                <EmptyState
                  icon={<TrendingDown className="h-10 w-10" />}
                  title="No sell project"
                  description="Create a sell project to track your sale milestone, pricing, and strategy."
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-left">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                    <TrendingDown className="h-5 w-5" />
                  </span>
                  Sale status
                </CardTitle>
                {sellProject.sell_milestone && (
                  <StatusBadge status={sellProject.sell_milestone} />
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Progress</p>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-primary-600 transition-all"
                      style={{ width: `${sellProgress}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    Step{" "}
                    {sellProject.sell_milestone
                      ? SELL_MILESTONES.indexOf(
                          sellProject.sell_milestone as (typeof SELL_MILESTONES)[number]
                        ) + 1
                      : 0}{" "}
                    of {SELL_MILESTONES.length}
                  </p>
                </div>
                <div className="grid gap-1 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500 dark:text-slate-400">Target range</span>
                    <span className="text-right font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                      {sellProject.target_sale_price_low != null ||
                      sellProject.target_sale_price_high != null ? (
                        <>
                          {formatCurrency(sellProject.target_sale_price_low)} –{" "}
                          {formatCurrency(sellProject.target_sale_price_high)}
                        </>
                      ) : (
                        "Not set"
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500 dark:text-slate-400">Strategy</span>
                    <span className="text-right font-medium text-slate-900 dark:text-slate-100">
                      {sellProject.sale_strategy
                        ? capitalize(sellProject.sale_strategy)
                        : "Not set"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Buy
          </h2>
          {!buyProject ? (
            <Card>
              <CardContent className="py-8">
                <EmptyState
                  icon={<ShoppingCart className="h-10 w-10" />}
                  title="No buy project"
                  description="Create a buy project to track milestones and saved listings."
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-left">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    <ShoppingCart className="h-5 w-5" />
                  </span>
                  Buy status
                </CardTitle>
                {buyProject.buy_milestone && (
                  <StatusBadge status={buyProject.buy_milestone} />
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Progress</p>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-emerald-600 transition-all"
                      style={{ width: `${buyProgress}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    Step{" "}
                    {buyProject.buy_milestone
                      ? BUY_MILESTONES.indexOf(
                          buyProject.buy_milestone as (typeof BUY_MILESTONES)[number]
                        ) + 1
                      : 0}{" "}
                    of {BUY_MILESTONES.length}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Saved</p>
                    <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {savedCount}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Shortlisted</p>
                    <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {shortlistedCount}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Next tasks
          </h2>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                Upcoming
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 divide-y divide-slate-100 dark:divide-slate-800">
              {upcomingTasks.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  No open tasks. You are all caught up.
                </p>
              ) : (
                upcomingTasks.map((task) => (
                  <div key={task.id} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-snug">
                        {task.title}
                      </p>
                      <StatusBadge status={task.status} />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Due {task.due_date ? formatDate(task.due_date) : "No date"}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Money
          </h2>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                Financial snapshot
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!recentScenario ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No scenarios yet. Create a financial scenario to see net cash and affordability here.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-500 dark:text-slate-400">Net cash remaining</span>
                    <span className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatCurrency(recentScenario.net_cash_remaining)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-500 dark:text-slate-400">Affordability</span>
                    <span
                      className={
                        recentScenario.is_shortfall
                          ? "text-sm font-medium text-red-700 dark:text-red-300"
                          : "text-sm font-medium text-emerald-700 dark:text-emerald-300"
                      }
                    >
                      {recentScenario.is_shortfall ? "Shortfall risk" : "Within budget"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-2">
                    From “{recentScenario.name}” · updated {formatDate(recentScenario.updated_at)}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Activity
          </h2>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                Recent communications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 divide-y divide-slate-100 dark:divide-slate-800">
              {recentComms.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  No communication logs yet.
                </p>
              ) : (
                recentComms.map((c) => (
                  <div key={c.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <StatusBadge status={c.type} />
                      <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
                        {formatDate(c.occurred_at)}
                      </span>
                    </div>
                    {c.subject && (
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{c.subject}</p>
                    )}
                    <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mt-0.5">{c.body}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <QuickAddFab />
    </PageShell>
  );
}
