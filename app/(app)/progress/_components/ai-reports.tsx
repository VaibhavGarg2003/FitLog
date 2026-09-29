"use client";

/**
 * AI Coach Reports — weekly, monthly, quarterly and yearly reviews
 * ═════════════════════════════════════════════════════════════════
 *
 * Reads GET /api/insights (never calls the AI); "Write my review" is the
 * only thing that does (POST /api/insights/generate). Each card shows:
 *   - the period ("21–27 Sep 2026", "September 2026", "Q3 2026", "2026")
 *   - number tiles from the period's facts (code, not AI)
 *   - the AI's prose, highlights and one suggestion
 *   - "Outdated" when data in that period changed after it was written
 *
 * States: READY · GENERATING (polls) · AVAILABLE · FAILED · NOT_ENOUGH_DATA
 * · NOT_YET — plus the free, no-AI "first week" card for brand-new users.
 */

import { useState } from "react";
import { useGenerateReport, useInsights } from "@/lib/hooks/use-insights";
import type { ReportCard, ReportView } from "@/lib/services/insight.service";
import type { PeriodFacts } from "@/lib/insights/facts";
import { FactTiles } from "./progress-overview";

const TITLE: Record<ReportCard["type"], string> = {
  WEEK: "Weekly report",
  MONTH: "Monthly review",
  QUARTER: "Quarterly review",
  YEAR: "Year in review",
};
const ICON: Record<ReportCard["type"], string> = { WEEK: "🗓️", MONTH: "📅", QUARTER: "📈", YEAR: "🏆" };

function ReportBody({ report }: { report: ReportView }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">{report.content}</p>
      {report.highlights.length > 0 && (
        <ul className="space-y-1.5">
          {report.highlights.map((h, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
              <span className="text-primary mt-0.5">{["💪", "📊", "🎯"][i] ?? "•"}</span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      )}
      {report.suggestion && (
        <div className="bg-primary/5 border border-primary/10 rounded-lg p-3">
          <p className="text-xs text-text-muted mb-0.5">💡 Next step</p>
          <p className="text-sm text-text-primary">{report.suggestion}</p>
        </div>
      )}
      <p className="text-[10px] text-text-muted text-right">
        {report.legacy ? "Written by the old weekly coach" : `Written by AI (${report.provider ?? "unknown"})`} ·
        numbers above are calculated from your logs
      </p>
    </div>
  );
}

function Card({ card }: { card: ReportCard }) {
  const generate = useGenerateReport();
  const busy = generate.isPending || card.state === "GENERATING";
  const run = (regenerate?: boolean) => generate.mutate({ type: card.type, regenerate });

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 lg:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-primary/20 to-accent/20 rounded-lg flex items-center justify-center">
            <span className="text-sm">{ICON[card.type]}</span>
          </div>
          <div>
            <h3 className="font-semibold text-sm text-text-primary">{TITLE[card.type]}</h3>
            {card.label && (
              <p className="text-[11px] text-text-muted">
                {card.label}
                {card.period?.partial ? " · your first, partial period" : ""}
              </p>
            )}
          </div>
        </div>
        {card.stale && (
          <span className="text-[10px] bg-warning/10 text-warning border border-warning/20 px-2 py-0.5 rounded-full shrink-0">
            Outdated
          </span>
        )}
      </div>

      {card.facts && card.state !== "NOT_YET" && <FactTiles facts={card.facts} />}

      {card.report && <ReportBody report={card.report} />}

      {card.stale && card.report && (
        <p className="text-xs text-warning">
          You changed data in this period after this was written — the numbers above are current.
        </p>
      )}
      {card.message && <p className="text-xs text-text-muted">{card.message}</p>}
      {card.state === "FAILED" && <p className="text-xs text-red-400">The last attempt failed. You can try again.</p>}
      {generate.isError && <p className="text-xs text-red-400">{generate.error.message}</p>}

      <div className="flex flex-wrap gap-2">
        {card.state === "GENERATING" && (
          <p className="text-sm text-text-muted flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            Writing your {TITLE[card.type].toLowerCase()}…
          </p>
        )}
        {card.canGenerate && card.state !== "GENERATING" && (
          <button
            type="button"
            onClick={() => run(card.state === "READY")}
            disabled={busy}
            className="text-sm font-medium bg-primary/10 border border-primary/20 text-primary rounded-lg px-4 py-2 disabled:opacity-60"
          >
            {generate.isPending
              ? "Writing…"
              : card.state === "READY"
                ? card.stale ? "✨ Rewrite with current data" : "✨ Write a new version"
                : `✨ Write my ${TITLE[card.type].toLowerCase()}`}
          </button>
        )}
        {card.state === "READY" && !card.canGenerate && !card.stale && card.attemptsLeft > 0 && (
          <button
            type="button"
            onClick={() => run(true)}
            disabled={busy}
            className="text-xs text-text-muted underline underline-offset-2 disabled:opacity-60"
          >
            Not happy with it? Rewrite ({card.attemptsLeft} left)
          </button>
        )}
      </div>
    </div>
  );
}

function FirstWeekCard({ facts }: { facts: PeriodFacts }) {
  return (
    <div className="bg-surface border border-primary/20 rounded-2xl p-4 lg:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-primary/15 rounded-lg flex items-center justify-center">🌱</div>
        <div>
          <h3 className="font-semibold text-sm text-text-primary">Your first days</h3>
          <p className="text-[11px] text-text-muted">
            {facts.period.start} → {facts.period.end} · your first weekly report arrives after your first full week
          </p>
        </div>
      </div>
      <FactTiles facts={facts} />
    </div>
  );
}

/** Past reports, as written at the time (the charts above are always live). */
function Archive({ reports }: { reports: ReportView[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (reports.length === 0) return null;
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <p className="px-4 lg:px-5 pt-4 pb-2 text-sm font-semibold text-text-secondary uppercase tracking-wider">
        Past reports
      </p>
      <ul className="divide-y divide-border">
        {reports.map((r) => {
          const key = `${r.type}:${r.periodStart}`;
          const isOpen = open === key;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : key)}
                aria-expanded={isOpen}
                className="w-full px-4 lg:px-5 py-3 flex items-center gap-3 text-left hover:bg-surface-hover"
              >
                <span>{ICON[r.type]}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-text-primary">{TITLE[r.type]}</span>
                  <span className="block text-xs text-text-muted">
                    {r.label}
                    {r.generatedAt && (
                      <> · written {new Date(r.generatedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</>
                    )}
                  </span>
                </span>
                <span className="text-text-muted text-xs">{isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <div className="px-4 lg:px-5 pb-4">
                  <ReportBody report={r} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AIReports() {
  const { data, isLoading, isError, error } = useInsights();

  if (isLoading) return <div className="bg-surface rounded-2xl border border-border animate-pulse h-40" />;
  if (isError || !data) {
    return (
      <div className="bg-surface rounded-2xl border border-border p-5 text-sm text-text-muted">
        {error?.message || "Could not load your reports."}
      </div>
    );
  }

  // The cards show the latest period; the archive lists the rest.
  const shown = new Set(data.cards.filter((c) => c.report).map((c) => `${c.type}:${c.period?.periodStart}`));
  const past = data.archive.filter((r) => !shown.has(`${r.type}:${r.periodStart}`));

  return (
    <div className="space-y-4 lg:space-y-5">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">AI coach</h2>
        <p className="text-[11px] text-text-muted">
          {data.plan === "MONTHLY_ONLY" ? "Monthly reviews" : "Weekly reports + monthly reviews"} · change in Settings
        </p>
      </div>
      {data.firstWeek && <FirstWeekCard facts={data.firstWeek.facts} />}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        {data.cards.map((c) => (
          <Card key={c.type} card={c} />
        ))}
      </div>
      <Archive reports={past} />
    </div>
  );
}
