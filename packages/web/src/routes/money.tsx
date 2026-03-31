import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Loader2,
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
  DollarSign,
  BarChart3,
  GitCompare,
  AlertTriangle,
  TrendingUp,
  Wallet,
  PiggyBank,
  Home,
  Calculator,
} from "lucide-react";
import type { FinancialScenario, Project } from "@hcc/shared";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useList,
  useCreate,
  useUpdate,
  useRemove,
} from "@/hooks/use-query-helpers";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import { formatCurrency, formatDate, formatPercent, capitalize } from "@/lib/format";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type ListResponse<T> = { data: T[]; total: number };

export const Route = createFileRoute("/money")({
  component: MoneyPage,
});

const n = (v: string) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};

function calcMonthlyRepayment(principal: number, annualRate: number, years: number): number | null {
  if (principal <= 0 || years <= 0) return null;
  if (annualRate <= 0) return principal / (years * 12);
  const r = annualRate / 100 / 12;
  const months = years * 12;
  return principal * (r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

function calcLoanTermYears(principal: number, annualRate: number, monthly: number): number | null {
  if (principal <= 0 || monthly <= 0) return null;
  if (annualRate <= 0) {
    const years = principal / monthly / 12;
    return years > 0 ? years : null;
  }
  const r = annualRate / 100 / 12;
  if (monthly <= principal * r) return null;
  const months = -Math.log(1 - (principal * r) / monthly) / Math.log(1 + r);
  const years = months / 12;
  return Number.isFinite(years) && years > 0 ? years : null;
}

function MoneyPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("dashboard");
  const [scenarioModalOpen, setScenarioModalOpen] = useState(false);
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<(string | null)[]>([null, null, null]);

  const projectsQuery = useList<Project>("projects", "/projects");
  const projects = projectsQuery.data?.data ?? [];
  const firstProject = projects[0];

  const scenariosQuery = useQuery({
    queryKey: ["financial-scenarios", "all"],
    queryFn: () => apiGet<ListResponse<FinancialScenario>>("/financial-scenarios"),
  });

  const scenarios = scenariosQuery.data?.data ?? [];

  const createScenario = useCreate<FinancialScenario>("financial-scenarios", "/financial-scenarios");
  const updateScenario = useUpdate<FinancialScenario>("financial-scenarios", "/financial-scenarios");
  const removeScenario = useRemove("financial-scenarios", "/financial-scenarios");

  const loading = projectsQuery.isLoading || scenariosQuery.isLoading;
  const hasError = projectsQuery.isError || scenariosQuery.isError;

  const latestScenario = useMemo(() => {
    if (scenarios.length === 0) return null;
    return [...scenarios].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )[0];
  }, [scenarios]);

  const hasShortfall = scenarios.some((s) => s.is_shortfall);

  const tabDefs = [
    { id: "dashboard", label: "Dashboard" },
    { id: "scenarios", label: "Scenarios", count: scenarios.length },
    { id: "compare", label: "Compare" },
  ];

  if (loading) {
    return (
      <PageShell title="Money">
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500 dark:text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm">Loading financial data…</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Money">
      <div className="space-y-5 pb-4">
        {hasError && (
          <ErrorBanner text="Some financial data failed to load. Try refreshing." />
        )}

        <Tabs tabs={tabDefs} active={tab} onChange={setTab} />

        {tab === "dashboard" && (
          <DashboardTab
            latestScenario={latestScenario}
            scenarios={scenarios}
            hasShortfall={hasShortfall}
          />
        )}

        {tab === "scenarios" && (
          <ScenariosTab
            scenarios={scenarios}
            projects={projects}
            onAdd={() => {
              setEditingScenarioId(null);
              setScenarioModalOpen(true);
            }}
            onEdit={(id) => {
              setEditingScenarioId(id);
              setScenarioModalOpen(true);
            }}
            onDelete={(id) => removeScenario.mutate(id)}
            deletePending={removeScenario.isPending}
          />
        )}

        {tab === "compare" && (
          <CompareTab
            scenarios={scenarios}
            compareIds={compareIds}
            setCompareIds={setCompareIds}
          />
        )}
      </div>

      <ScenarioModal
        key={editingScenarioId ?? "new-scenario"}
        open={scenarioModalOpen}
        onClose={() => {
          setScenarioModalOpen(false);
          setEditingScenarioId(null);
        }}
        projects={projects}
        existing={editingScenarioId ? scenarios.find((s) => s.id === editingScenarioId) : undefined}
        onSubmit={(payload) => {
          if (editingScenarioId) {
            updateScenario.mutate(
              { id: editingScenarioId, data: payload },
              {
                onSuccess: () => {
                  setScenarioModalOpen(false);
                  setEditingScenarioId(null);
                },
              }
            );
          } else {
            createScenario.mutate(payload, {
              onSuccess: () => setScenarioModalOpen(false),
            });
          }
        }}
        submitting={createScenario.isPending || updateScenario.isPending}
      />
    </PageShell>
  );
}

function ErrorBanner({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200">
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right font-medium text-slate-900 dark:text-slate-100 tabular-nums">{value}</span>
    </div>
  );
}

function DashboardTab({
  latestScenario,
  scenarios,
  hasShortfall,
}: {
  latestScenario: FinancialScenario | null;
  scenarios: FinancialScenario[];
  hasShortfall: boolean;
}) {
  const s = latestScenario;

  const salePrice = s?.sale_price ?? 0;
  const mortgageBalance = s?.mortgage_balance ?? 0;
  const estimatedEquity = s?.estimated_equity ?? (salePrice > 0 ? salePrice - mortgageBalance : 0);
  const savings = s?.savings ?? 0;
  const kiwisaver = s?.kiwisaver ?? 0;
  const otherFunds = s?.other_funds ?? 0;
  const borrowingCapacity = s?.borrowing_capacity ?? 0;
  const totalBudget =
    s?.total_available_budget ?? estimatedEquity + savings + kiwisaver + otherFunds + borrowingCapacity;

  const budgetParts = [
    { label: "Equity", value: estimatedEquity, color: "bg-emerald-500" },
    { label: "Savings", value: savings, color: "bg-blue-500" },
    { label: "KiwiSaver", value: kiwisaver, color: "bg-violet-500" },
    { label: "Other funds", value: otherFunds, color: "bg-amber-500" },
    { label: "Borrowing", value: borrowingCapacity, color: "bg-slate-400" },
  ].filter((p) => p.value > 0);

  const shortfallScenarios = scenarios.filter((sc) => sc.is_shortfall);

  if (!s) {
    return (
      <Card>
        <CardContent className="py-10">
          <EmptyState
            icon={<DollarSign className="h-10 w-10" />}
            title="No financial scenarios yet"
            description="Create a scenario in the Scenarios tab to see your financial dashboard."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {hasShortfall && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/30 px-3 py-2.5 text-sm text-red-900 dark:text-red-200">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {shortfallScenarios.length} scenario{shortfallScenarios.length > 1 ? "s" : ""} show
            a cash shortfall. Review the Scenarios tab for details.
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Home className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            Current position
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Home estimated value" value={formatCurrency(s.sale_price)} />
          <Row label="Mortgage balance" value={formatCurrency(s.mortgage_balance)} />
          <Row
            label="Estimated equity"
            value={
              <span className={estimatedEquity < 0 ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}>
                {formatCurrency(estimatedEquity)}
              </span>
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PiggyBank className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            Available funds
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Savings" value={formatCurrency(s.savings)} />
          <Row label="KiwiSaver" value={formatCurrency(s.kiwisaver)} />
          <Row label="Other funds" value={formatCurrency(s.other_funds)} />
          <Row label="Borrowing capacity" value={formatCurrency(s.borrowing_capacity)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            Total available budget
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {formatCurrency(totalBudget)}
          </p>

          {budgetParts.length > 0 && (
            <>
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                {budgetParts.map((p) => (
                  <div
                    key={p.label}
                    className={`${p.color} h-full transition-all`}
                    style={{ width: `${totalBudget > 0 ? (p.value / totalBudget) * 100 : 0}%` }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                {budgetParts.map((p) => (
                  <span key={p.label} className="flex items-center gap-1.5">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${p.color}`} />
                    {p.label}: {formatCurrency(p.value)}
                  </span>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {s.net_cash_remaining != null && s.net_cash_remaining < 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/30 px-3 py-2.5 text-sm text-red-900 dark:text-red-200">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Cash shortfall of{" "}
            <strong className="tabular-nums">{formatCurrency(Math.abs(s.net_cash_remaining))}</strong>.
            You may need to reduce your target purchase price, increase savings, or adjust your plan.
          </span>
        </div>
      )}
    </div>
  );
}

function ScenariosTab({
  scenarios,
  projects,
  onAdd,
  onEdit,
  onDelete,
  deletePending,
}: {
  scenarios: FinancialScenario[];
  projects: Project[];
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  deletePending: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Financial scenarios</h2>
        <Button size="md" className="min-h-11 shrink-0" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          New scenario
        </Button>
      </div>

      {scenarios.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={<Calculator className="h-9 w-9" />}
              title="No scenarios"
              description="Create a financial scenario to model sale proceeds, purchase costs, and cash position."
              action={
                <Button className="min-h-11" onClick={onAdd}>
                  Create scenario
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {scenarios.map((s) => {
            const netCash = s.net_cash_remaining;
            return (
              <Card key={s.id}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{s.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Updated {formatDate(s.updated_at)}</p>
                    </div>
                    {s.is_shortfall ? (
                      <Badge variant="danger">Shortfall</Badge>
                    ) : (
                      <Badge variant="success">OK</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Sale price</p>
                      <p className="font-medium tabular-nums">{formatCurrency(s.sale_price)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Purchase price</p>
                      <p className="font-medium tabular-nums">{formatCurrency(s.purchase_price)}</p>
                    </div>
                  </div>
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-2 flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Net cash remaining</span>
                    <span
                      className={`font-semibold tabular-nums ${
                        netCash != null && netCash < 0 ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"
                      }`}
                    >
                      {formatCurrency(netCash)}
                    </span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button variant="secondary" className="flex-1 min-h-11" onClick={() => onEdit(s.id)}>
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      className="min-h-11 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700"
                      disabled={deletePending}
                      onClick={() => onDelete(s.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CompareTab({
  scenarios,
  compareIds,
  setCompareIds,
}: {
  scenarios: FinancialScenario[];
  compareIds: (string | null)[];
  setCompareIds: (v: (string | null)[]) => void;
}) {
  const qc = useQueryClient();

  const selected = compareIds
    .map((id) => (id ? scenarios.find((s) => s.id === id) : null))
    .filter(Boolean) as FinancialScenario[];

  const compareQuery = useQuery({
    queryKey: ["financial-scenarios", "compare", compareIds.filter(Boolean).join(",")],
    queryFn: () =>
      apiGet<ListResponse<FinancialScenario>>(
        `/financial-scenarios/compare?ids=${compareIds.filter(Boolean).join(",")}`
      ),
    enabled: selected.length >= 2,
  });

  const comparisonData = compareQuery.data?.data ?? selected;

  if (scenarios.length < 2) {
    return (
      <Card>
        <CardContent className="py-8">
          <EmptyState
            icon={<GitCompare className="h-9 w-9" />}
            title="Need at least 2 scenarios"
            description="Create more scenarios to compare them side by side."
          />
        </CardContent>
      </Card>
    );
  }

  const options = scenarios.map((s) => ({
    value: s.id,
    label: s.name,
  }));

  type CompareRow = { label: string; warn?: boolean } & (
    | { key: keyof FinancialScenario; compute?: never }
    | { compute: (s: FinancialScenario) => number | null; key?: never }
  );

  const compareRows: CompareRow[] = [
    { label: "Sale price", key: "sale_price" },
    { label: "Commission", key: "commission_amount" },
    { label: "Marketing", key: "marketing_cost" },
    { label: "Legal (sell)", key: "legal_fees_sell" },
    { label: "Repairs", key: "repairs_cost" },
    { label: "Purchase price", key: "purchase_price" },
    { label: "Deposit", key: "deposit" },
    { label: "Loan amount", key: "loan_amount" },
    { label: "Interest expense", compute: (s) => {
      const principal = s.loan_amount ?? 0;
      const rate = s.interest_rate ?? 0;
      const yrs = s.loan_term_years ?? 0;
      if (principal <= 0 || yrs <= 0) return null;
      const months = Math.round(yrs * 12);
      const mo = calcMonthlyRepayment(principal, rate, months / 12);
      if (mo == null) return null;
      return mo * months - principal;
    }},
    { label: "Repayments/mo", key: "repayment_monthly" },
    { label: "Repayments/wk", compute: (s) => {
      const mo = s.repayment_monthly ?? 0;
      return mo > 0 ? Math.round(mo * 12 / 52) : null;
    }},
    { label: "Contingency", key: "contingency" },
    { label: "Net cash", key: "net_cash_remaining", warn: true },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            Select scenarios
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Select
              key={i}
              label={`Scenario ${i + 1}`}
              value={compareIds[i] ?? ""}
              onChange={(e) => {
                const next = [...compareIds];
                next[i] = e.target.value || null;
                setCompareIds(next);
              }}
              options={options}
              placeholder="Select…"
            />
          ))}
        </CardContent>
      </Card>

      {comparisonData.length >= 2 && (
        <Card>
          <CardContent className="overflow-x-auto pt-4">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-left text-xs text-slate-500 dark:text-slate-400">
                  <th className="pb-2 pr-3 font-medium" />
                  {comparisonData.map((s) => (
                    <th key={s.id} className="pb-2 pr-3 font-medium">
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row) => (
                  <tr key={row.label} className="border-b border-slate-50 dark:border-slate-800">
                    <td className="py-2.5 pr-3 text-slate-500 dark:text-slate-400">{row.label}</td>
                    {comparisonData.map((s) => {
                      const val = row.compute ? row.compute(s) : (s[row.key] as number | undefined);
                      const isNegative = row.warn && val != null && val < 0;
                      return (
                        <td
                          key={s.id}
                          className={`py-2.5 pr-3 tabular-nums font-medium ${
                            isNegative ? "text-red-700 dark:text-red-300" : ""
                          }`}
                        >
                          {formatCurrency(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td className="py-2.5 pr-3 text-slate-500 dark:text-slate-400">Status</td>
                  {comparisonData.map((s) => (
                    <td key={s.id} className="py-2.5 pr-3">
                      {s.is_shortfall ? (
                        <Badge variant="danger">Shortfall</Badge>
                      ) : (
                        <Badge variant="success">Affordable</Badge>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ScenarioModal({
  open,
  onClose,
  projects,
  existing,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  existing: FinancialScenario | undefined;
  onSubmit: (data: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState("New scenario");
  const [projectId, setProjectId] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [commissionRate, setCommissionRate] = useState("2.5");
  const [marketingCost, setMarketingCost] = useState("");
  const [legalSell, setLegalSell] = useState("");
  const [repairsCost, setRepairsCost] = useState("");
  const [mortgageBalance, setMortgageBalance] = useState("");
  const [mortgageBreakFee, setMortgageBreakFee] = useState("");
  const [movingCost, setMovingCost] = useState("");
  const [savings, setSavings] = useState("");
  const [kiwisaver, setKiwisaver] = useState("");
  const [otherFunds, setOtherFunds] = useState("");
  const [borrowingCapacity, setBorrowingCapacity] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [deposit, setDeposit] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [loanTerm, setLoanTerm] = useState("");
  const [repayment, setRepayment] = useState("");
  const [legalBuy, setLegalBuy] = useState("");
  const [transactionCosts, setTransactionCosts] = useState("");
  const [contingency, setContingency] = useState("");
  const [loanDriver, setLoanDriver] = useState<"term" | "repayment" | null>(null);
  const [repaymentFreq, setRepaymentFreq] = useState<"week" | "fortnight" | "month">("month");

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setName(existing.name);
      setProjectId(existing.project_id);
      setSalePrice(existing.sale_price?.toString() ?? "");
      setCommissionRate(existing.commission_rate?.toString() ?? "2.5");
      setMarketingCost(existing.marketing_cost?.toString() ?? "");
      setLegalSell(existing.legal_fees_sell?.toString() ?? "");
      setRepairsCost(existing.repairs_cost?.toString() ?? "");
      setMortgageBalance(existing.mortgage_balance?.toString() ?? "");
      setMortgageBreakFee(existing.mortgage_break_fee?.toString() ?? "");
      setMovingCost(existing.moving_cost?.toString() ?? "");
      setSavings(existing.savings?.toString() ?? "");
      setKiwisaver(existing.kiwisaver?.toString() ?? "");
      setOtherFunds(existing.other_funds?.toString() ?? "");
      setBorrowingCapacity(existing.borrowing_capacity?.toString() ?? "");
      setPurchasePrice(existing.purchase_price?.toString() ?? "");
      setDeposit(existing.deposit?.toString() ?? "");
      setLoanAmount(existing.loan_amount?.toString() ?? "");
      setInterestRate(existing.interest_rate?.toString() ?? "");
      setLoanTerm(existing.loan_term_years?.toString() ?? "");
      setRepayment(existing.repayment_monthly?.toString() ?? "");
      setLegalBuy(existing.legal_fees_buy?.toString() ?? "");
      setTransactionCosts(existing.transaction_costs?.toString() ?? "");
      setContingency(existing.contingency?.toString() ?? "");
    } else {
      setName("New scenario");
      setProjectId(projects[0]?.id ?? "");
      setSalePrice("");
      setCommissionRate("2.5");
      setMarketingCost("");
      setLegalSell("");
      setRepairsCost("");
      setMortgageBalance("");
      setMortgageBreakFee("");
      setMovingCost("");
      setSavings("");
      setKiwisaver("");
      setOtherFunds("");
      setBorrowingCapacity("");
      setPurchasePrice("");
      setDeposit("");
      setLoanAmount("");
      setInterestRate("");
      setLoanTerm("");
      setRepayment("");
      setLegalBuy("");
      setTransactionCosts("");
      setContingency("");
    }
    setLoanDriver(null);
  }, [open, existing?.id, projects]);

  useEffect(() => {
    if (loanDriver !== "term") return;
    const result = calcMonthlyRepayment(n(loanAmount), n(interestRate), n(loanTerm));
    setRepayment(result != null ? Math.round(result).toString() : "");
  }, [loanDriver, loanAmount, interestRate, loanTerm]);

  useEffect(() => {
    if (loanDriver !== "repayment") return;
    const result = calcLoanTermYears(n(loanAmount), n(interestRate), n(repayment));
    if (result != null) {
      const months = Math.round(result * 12);
      setLoanTerm(parseFloat((months / 12).toFixed(2)).toString());
    } else {
      setLoanTerm("");
    }
  }, [loanDriver, loanAmount, interestRate, repayment]);

  const freqMultiplier = repaymentFreq === "week" ? 12 / 52 : repaymentFreq === "fortnight" ? 12 / 26 : 1;
  const monthlyToDisplay = (mo: string) => {
    const v = parseFloat(mo);
    if (!Number.isFinite(v) || v === 0) return mo;
    return Math.round(v * freqMultiplier).toString();
  };
  const displayToMonthly = (disp: string) => {
    const v = parseFloat(disp);
    if (!Number.isFinite(v)) return disp;
    return Math.round(v / freqMultiplier).toString();
  };

  const sale = n(salePrice);
  const rate = n(commissionRate);
  const commissionAmt = sale > 0 && rate >= 0 ? (sale * rate) / 100 : 0;
  const mort = n(mortgageBalance);
  const mkt = n(marketingCost);
  const lSell = n(legalSell);
  const rep = n(repairsCost);
  const mov = n(movingCost);
  const netProceeds = sale - commissionAmt - mkt - lSell - rep - mort - n(mortgageBreakFee) - mov;

  const equity = netProceeds;
  const sav = n(savings);
  const kiwi = n(kiwisaver);
  const other = n(otherFunds);
  const borrowing = n(borrowingCapacity);
  const availFunds = equity + sav + kiwi + other + borrowing;
  const purchase = n(purchasePrice);
  const lBuy = n(legalBuy);
  const txn = n(transactionCosts);
  const cont = n(contingency);

  const sellCosts = commissionAmt + mkt + lSell + rep + n(mortgageBreakFee) + mov;
  const buyCosts = lBuy + txn;
  const allCosts = sellCosts + mort + purchase + buyCosts + cont;
  const cashReserves = sav + kiwi + other;
  const totalFunding = sale + cashReserves + borrowing;
  const netCash = totalFunding - allCosts;

  const loanAmt = n(loanAmount);
  const termYears = n(loanTerm);
  const termMonths = Math.round(termYears * 12);
  const loanMonthly = calcMonthlyRepayment(loanAmt, n(interestRate), termMonths / 12);
  const totalRepayments = loanMonthly != null && termMonths > 0 ? loanMonthly * termMonths : 0;
  const totalInterest = totalRepayments > 0 ? totalRepayments - loanAmt : 0;

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit scenario" : "New scenario"}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const opt = (v: string) => (v ? parseFloat(v) : undefined);
          onSubmit({
            name: name.trim() || "New scenario",
            project_id: projectId || projects[0]?.id,
            sale_price: opt(salePrice),
            commission_rate: opt(commissionRate),
            commission_amount: commissionAmt || undefined,
            marketing_cost: opt(marketingCost),
            legal_fees_sell: opt(legalSell),
            repairs_cost: opt(repairsCost),
            mortgage_balance: opt(mortgageBalance),
            mortgage_break_fee: opt(mortgageBreakFee),
            moving_cost: opt(movingCost),
            savings: opt(savings),
            kiwisaver: opt(kiwisaver),
            other_funds: opt(otherFunds),
            borrowing_capacity: opt(borrowingCapacity),
            purchase_price: opt(purchasePrice),
            deposit: opt(deposit),
            loan_amount: opt(loanAmount),
            interest_rate: opt(interestRate),
            loan_term_years: opt(loanTerm),
            repayment_monthly: opt(repayment),
            legal_fees_buy: opt(legalBuy),
            transaction_costs: opt(transactionCosts),
            contingency: opt(contingency),
            net_cash_remaining: netCash,
            is_shortfall: netCash < 0,
            estimated_equity: equity,
            total_available_budget: availFunds,
          });
        }}
      >
        <Input label="Scenario name" value={name} onChange={(e) => setName(e.target.value)} required />
        {projects.length > 1 && (
          <Select
            label="Project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
          />
        )}

        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide pt-2">Sale side</p>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Sale price" inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
          <Input label="Commission %" inputMode="decimal" value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Marketing" inputMode="decimal" value={marketingCost} onChange={(e) => setMarketingCost(e.target.value)} />
          <Input label="Legal (sell)" inputMode="decimal" value={legalSell} onChange={(e) => setLegalSell(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Repairs" inputMode="decimal" value={repairsCost} onChange={(e) => setRepairsCost(e.target.value)} />
          <Input label="Mortgage balance" inputMode="decimal" value={mortgageBalance} onChange={(e) => setMortgageBalance(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Break fee" inputMode="decimal" value={mortgageBreakFee} onChange={(e) => setMortgageBreakFee(e.target.value)} />
          <Input label="Moving cost" inputMode="decimal" value={movingCost} onChange={(e) => setMovingCost(e.target.value)} />
        </div>

        <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm">
          <span className="text-slate-500 dark:text-slate-400">Net sale proceeds · </span>
          <span className={`font-semibold tabular-nums ${netProceeds < 0 ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}`}>
            {formatCurrency(netProceeds)}
          </span>
        </div>

        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide pt-2">Available funds</p>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Savings" inputMode="decimal" value={savings} onChange={(e) => setSavings(e.target.value)} />
          <Input label="KiwiSaver" inputMode="decimal" value={kiwisaver} onChange={(e) => setKiwisaver(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Other funds" inputMode="decimal" value={otherFunds} onChange={(e) => setOtherFunds(e.target.value)} />
          <Input label="Borrowing capacity" inputMode="decimal" value={borrowingCapacity} onChange={(e) => setBorrowingCapacity(e.target.value)} />
        </div>

        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide pt-2">Buy side</p>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Purchase price" inputMode="decimal" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
          <Input label="Deposit" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Loan amount" inputMode="decimal" value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} />
          <Input label="Interest %" inputMode="decimal" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={`Loan term (yrs)${loanDriver === "repayment" && loanTerm ? " · auto" : ""}`}
            inputMode="decimal"
            value={loanTerm}
            onChange={(e) => { setLoanTerm(e.target.value); setLoanDriver("term"); }}
            className={loanDriver === "repayment" && loanTerm ? "bg-blue-50 dark:bg-blue-900/20" : ""}
          />
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Repayment
              </label>
              <div className="flex items-center gap-1.5">
                {([["week", "w"], ["fortnight", "f"], ["month", "m"]] as const).map(([freq, label]) => (
                  <button
                    key={freq}
                    type="button"
                    className="flex items-center gap-1 text-xs"
                    onClick={() => setRepaymentFreq(freq)}
                  >
                    <span className={`h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      repaymentFreq === freq
                        ? "border-primary-500"
                        : "border-slate-300 dark:border-slate-600"
                    }`}>
                      {repaymentFreq === freq && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
                      )}
                    </span>
                    <span className={repaymentFreq === freq ? "text-slate-900 dark:text-slate-100 font-medium" : "text-slate-400 dark:text-slate-500"}>
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <input
              inputMode="decimal"
              value={monthlyToDisplay(repayment)}
              onChange={(e) => { setRepayment(displayToMonthly(e.target.value)); setLoanDriver("repayment"); }}
              className={`w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 ${
                loanDriver === "term" && repayment ? "bg-blue-50 dark:bg-blue-900/20" : ""
              }`}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Legal (buy)" inputMode="decimal" value={legalBuy} onChange={(e) => setLegalBuy(e.target.value)} />
          <Input label="Transaction costs" inputMode="decimal" value={transactionCosts} onChange={(e) => setTransactionCosts(e.target.value)} />
        </div>
        <Input label="Contingency" inputMode="decimal" value={contingency} onChange={(e) => setContingency(e.target.value)} />

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-3 space-y-3 text-sm">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Costs</p>
            {sellCosts > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Sell costs</span>
                <span className="tabular-nums">{formatCurrency(sellCosts)}</span>
              </div>
            )}
            {mort > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Mortgage payout</span>
                <span className="tabular-nums">{formatCurrency(mort)}</span>
              </div>
            )}
            {purchase > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Purchase price</span>
                <span className="tabular-nums">{formatCurrency(purchase)}</span>
              </div>
            )}
            {buyCosts > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Buy costs</span>
                <span className="tabular-nums">{formatCurrency(buyCosts)}</span>
              </div>
            )}
            {cont > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Contingency</span>
                <span className="tabular-nums">{formatCurrency(cont)}</span>
              </div>
            )}
            {totalRepayments > 0 && (
              <>
                <div className="flex justify-between pt-1">
                  <span className="text-slate-500 dark:text-slate-400">Loan principal</span>
                  <span className="tabular-nums">{formatCurrency(loanAmt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">
                    Interest ({n(interestRate)}% over {termYears}yr)
                  </span>
                  <span className="tabular-nums">{formatCurrency(totalInterest)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Total loan repayment</span>
                  <span className="tabular-nums">{formatCurrency(totalRepayments)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-1">
              <span className="font-medium text-slate-700 dark:text-slate-200">Total costs</span>
              <span className="font-medium tabular-nums">{formatCurrency(allCosts)}</span>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Funded by</p>
            {sale > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Sale proceeds</span>
                <span className="tabular-nums">{formatCurrency(sale)}</span>
              </div>
            )}
            {cashReserves > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Cash reserves</span>
                <span className="tabular-nums">{formatCurrency(cashReserves)}</span>
              </div>
            )}
            {borrowing > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Borrowing</span>
                <span className="tabular-nums">{formatCurrency(borrowing)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-1">
              <span className="font-medium text-slate-700 dark:text-slate-200">Total funding</span>
              <span className="font-medium tabular-nums">{formatCurrency(totalFunding)}</span>
            </div>
          </div>

          <div className="flex justify-between border-t-2 border-slate-200 dark:border-slate-600 pt-2">
            <span className="font-semibold text-slate-900 dark:text-slate-100">Net cash impact</span>
            <span className={`font-bold tabular-nums ${netCash < 0 ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}`}>
              {formatCurrency(netCash)}
            </span>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1 min-h-12" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1 min-h-12" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
