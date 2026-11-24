import { useEffect, useState } from "react";
import { Activity, CircleAlert, CircleSlash, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { listUsageRecords, summarizeUsage, type UsageBreakdown, type UsageSummary } from "./usageStore";

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const statusStyles: Record<string, string> = {
  completed: "text-primary",
  interrupted: "text-muted-foreground",
  failed: "text-destructive",
};

/**
 * Informational AI usage dashboard. Shows only what the providers reported and
 * labels anything else as unavailable, so estimates are never presented as
 * actual token counts.
 */
export function UsageDashboard() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      setSummary(summarizeUsage(await listUsageRecords()));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  if (loading && !summary) {
    return <p className="text-xs text-muted-foreground">Loading usage…</p>;
  }

  const data = summary ?? summarizeUsage([]);

  return (
    <section className="space-y-5" aria-label="AI usage">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">AI usage</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Requests made from this browser. Token counts come from the provider; when a provider reports none, the request is listed as unavailable instead of estimated.
          </p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : undefined} /> Refresh
        </Button>
      </div>

      {data.totalRequests === 0 ? (
        <div className="flex items-start gap-3 border-y border-border py-4">
          <Activity className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">No AI requests yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Send a message from the Assistant to start tracking usage.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Requests" value={formatNumber(data.totalRequests)} />
            <Metric label="Input tokens" value={formatNumber(data.reportedInputTokens)} />
            <Metric label="Output tokens" value={formatNumber(data.reportedOutputTokens)} />
            <Metric label="Total tokens" value={formatNumber(data.reportedTotalTokens)} />
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-primary" />{formatNumber(data.completedRequests)} completed</span>
            <span className="flex items-center gap-1"><CircleSlash className="h-3 w-3" />{formatNumber(data.interruptedRequests)} stopped</span>
            <span className="flex items-center gap-1"><CircleAlert className="h-3 w-3" />{formatNumber(data.failedRequests)} failed</span>
            {data.unavailableRequests > 0 && <span>{formatNumber(data.unavailableRequests)} without provider token data</span>}
          </div>

          <BreakdownTable title="Usage by provider" entries={data.byProvider} />
          <BreakdownTable title="Usage by model" entries={data.byModel} />

          <div>
            <h4 className="mb-2 text-xs font-medium">Recent requests</h4>
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">When</th>
                    <th className="px-2 py-1.5 font-medium">Model</th>
                    <th className="px-2 py-1.5 font-medium">Status</th>
                    <th className="px-2 py-1.5 text-right font-medium">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((record) => (
                    <tr key={record.id} className="border-t border-border">
                      <td className="px-2 py-1.5 text-muted-foreground">{formatTime(record.createdAt)}</td>
                      <td className="max-w-[140px] truncate px-2 py-1.5" title={record.modelId}>{record.modelId || "unknown"}</td>
                      <td className={`px-2 py-1.5 ${statusStyles[record.status] ?? ""}`}>
                        {record.status}
                        <span className="ml-1 text-muted-foreground">· {formatDuration(record.durationMs)}</span>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {record.usageSource === "provider_reported"
                          ? formatNumber(record.totalTokens ?? 0)
                          : <span className="text-muted-foreground">unavailable</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.failedRequests > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {formatNumber(data.failedRequests)} failed {data.failedRequests === 1 ? "request is" : "requests are"} excluded from completed totals.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function BreakdownTable({ title, entries }: { title: string; entries: UsageBreakdown[] }) {
  if (entries.length === 0) return null;
  return (
    <div>
      <h4 className="mb-2 text-xs font-medium">{title}</h4>
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 font-medium">Name</th>
              <th className="px-2 py-1.5 text-right font-medium">Requests</th>
              <th className="px-2 py-1.5 text-right font-medium">In</th>
              <th className="px-2 py-1.5 text-right font-medium">Out</th>
              <th className="px-2 py-1.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.key} className="border-t border-border">
                <td className="max-w-[150px] truncate px-2 py-1.5" title={entry.label}>{entry.label}</td>
                <td className="px-2 py-1.5 text-right">
                  {formatNumber(entry.requests)}
                  {entry.unavailableRequests > 0 && <span className="ml-1 text-muted-foreground">({entry.unavailableRequests} n/a)</span>}
                </td>
                <td className="px-2 py-1.5 text-right">{formatNumber(entry.inputTokens)}</td>
                <td className="px-2 py-1.5 text-right">{formatNumber(entry.outputTokens)}</td>
                <td className="px-2 py-1.5 text-right">{formatNumber(entry.totalTokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
