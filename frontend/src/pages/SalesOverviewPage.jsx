import { useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader.jsx'
import LineChart from '../components/LineChart.jsx'
import SalesYearChart from '../components/SalesYearChart.jsx'
import StatCard from '../components/StatCard.jsx'
import { useDashboardData } from '../context/DashboardDataContext.jsx'
import {
  formatCurrency,
  formatMultiCurrency,
  formatWeekLabel,
  lastNWeekKeys,
  parseFishbowlDate,
  splitPrimaryCurrency,
  sumAmountsByCurrency,
  weekKey,
} from '../lib/format.js'

const DEFAULT_WEEKS_OF_TREND = 12
const WEEK_OPTIONS = [4, 8, 12, 26, 52]

// Shared by Sales Trajectory, Pipeline Movement, and Lead Generation — they're
// deliberately kept on the same timeframe (see weekKeys below) so switching it
// in any one of them moves all three together rather than drifting out of sync.
function WeeksToggle({ value, onChange }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-surface-border bg-surface p-0.5">
      {WEEK_OPTIONS.map((weeks) => (
        <button
          key={weeks}
          type="button"
          onClick={() => onChange(weeks)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            weeks === value
              ? 'bg-sky-500/15 text-sky-300'
              : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
          }`}
        >
          {weeks}W
        </button>
      ))}
    </div>
  )
}

// Revenue reporting (Total Won Revenue, Sales per Year, Avg Deal Size, Top
// Customers) is scoped to deals that have reached one of these stages — every
// kind of sale (including trials/demos) counts once it's confirmed here, per
// how this business actually recognizes an order. Win Rate is a separate,
// broader pipeline-conversion metric and is unaffected by this list.
const REVENUE_STAGES = new Set(
  [
    'Ready to ship',
    'Shipped',
    'Customer Received',
    'Installation/Technical Follow up',
    '2 week follow up',
    'Monthly Followup',
    'Completed',
  ].map((stage) => stage.toLowerCase()),
)

function isRevenueStage(deal) {
  return REVENUE_STAGES.has((deal.stage || '').toLowerCase())
}

function dealYear(deal) {
  const date = parseFishbowlDate(deal.close_date) || parseFishbowlDate(deal.create_date)
  return date ? date.getFullYear() : null
}

function compactUsd(value) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${Math.round(value / 1000)}K`
  return `$${Math.round(value)}`
}

function formatShortDate(value) {
  const date = parseFishbowlDate(value)
  if (!date) return '—'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatDelta(current, previous) {
  if (previous == null) return null
  const diff = current - previous
  if (diff === 0) return 'No change vs last week'
  return `${diff > 0 ? '+' : ''}${diff} vs last week`
}

export default function SalesOverviewPage() {
  const { summary, error, loading, refresh } = useDashboardData()
  const deals = summary?.deals ?? []
  const conferenceContacts = summary?.conference_contacts ?? []

  // Win Rate is a pipeline-conversion metric (did the opportunity close won vs
  // lost) — it stays on HubSpot's own is_won/is_closed regardless of fulfillment.
  const won = useMemo(() => deals.filter((deal) => deal.is_won), [deals])
  const lost = useMemo(() => deals.filter((deal) => deal.is_closed && !deal.is_won), [deals])
  const open = useMemo(() => deals.filter((deal) => !deal.is_closed), [deals])

  const closedCount = won.length + lost.length
  const winRate = closedCount > 0 ? Math.round((won.length / closedCount) * 100) : null

  // Revenue reporting below uses REVENUE_STAGES instead of is_won.
  const revenueDeals = useMemo(() => deals.filter(isRevenueStage), [deals])

  const totalWon = splitPrimaryCurrency(
    sumAmountsByCurrency(revenueDeals, (deal) => deal.amount, (deal) => deal.currency, 'USD'),
  )

  const wonUsd = revenueDeals.filter((deal) => deal.currency === 'USD' && deal.amount != null)
  const avgDealSize = wonUsd.length > 0 ? wonUsd.reduce((sum, deal) => sum + deal.amount, 0) / wonUsd.length : null

  // Sales per year, USD only — the dominant/home currency (~90% of deals).
  // Non-USD won revenue is real but shown separately, never blended into the
  // same bars as USD (same currency-honesty rule as the rest of this app).
  const salesPerYear = useMemo(() => {
    const byYear = new Map()
    for (const deal of wonUsd) {
      const year = dealYear(deal)
      if (year == null) continue
      const entry = byYear.get(year) || { year, total: 0, count: 0 }
      entry.total += deal.amount
      entry.count += 1
      byYear.set(year, entry)
    }
    return [...byYear.values()].sort((a, b) => a.year - b.year)
  }, [wonUsd])

  const nonUsdWon = revenueDeals.filter((deal) => deal.currency !== 'USD')
  const nonUsdByCurrency = sumAmountsByCurrency(nonUsdWon, (deal) => deal.amount, (deal) => deal.currency, 'USD')

  const topCompanies = useMemo(() => {
    const byCompany = new Map()
    for (const deal of wonUsd) {
      if (!deal.company) continue
      byCompany.set(deal.company, (byCompany.get(deal.company) || 0) + deal.amount)
    }
    return [...byCompany.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([company, amount]) => ({ company, amount }))
  }, [wonUsd])

  // Shared week buckets for every trend chart below, so they all line up on
  // the same weeks even though they're built from different useMemo calls.
  const [weeksOfTrend, setWeeksOfTrend] = useState(DEFAULT_WEEKS_OF_TREND)
  const weekKeys = useMemo(() => lastNWeekKeys(weeksOfTrend), [weeksOfTrend])
  const currentWeekKey = weekKeys[weekKeys.length - 1]

  // Sales trajectory — won revenue (USD) by the week it closed.
  const revenueTrend = useMemo(() => {
    const byWeek = new Map(weekKeys.map((key) => [key, 0]))
    for (const deal of wonUsd) {
      const date = parseFishbowlDate(deal.close_date)
      if (!date) continue
      const key = weekKey(date)
      if (byWeek.has(key)) byWeek.set(key, byWeek.get(key) + deal.amount)
    }
    return weekKeys.map((key) => ({ label: formatWeekLabel(key), value: byWeek.get(key) }))
  }, [wonUsd, weekKeys])

  // Idea: pipeline movement — each deal's stage_history gives a chronological
  // list of stage changes; every consecutive pair is one "moved from A to B"
  // event, bucketed by the week it happened.
  const { movementTrend, thisWeekTransitions } = useMemo(() => {
    const byWeek = new Map(weekKeys.map((key) => [key, 0]))
    const thisWeekPairs = new Map()
    for (const deal of deals) {
      const history = deal.stage_history ?? []
      for (let i = 1; i < history.length; i++) {
        const date = parseFishbowlDate(history[i].changed_at)
        if (!date) continue
        const key = weekKey(date)
        if (byWeek.has(key)) byWeek.set(key, byWeek.get(key) + 1)
        if (key === currentWeekKey) {
          const label = `${history[i - 1].stage} → ${history[i].stage}`
          thisWeekPairs.set(label, (thisWeekPairs.get(label) || 0) + 1)
        }
      }
    }
    return {
      movementTrend: weekKeys.map((key) => ({ label: formatWeekLabel(key), value: byWeek.get(key) })),
      thisWeekTransitions: [...thisWeekPairs.entries()]
        .sort(([, a], [, b]) => b - a)
        .map(([transition, count]) => ({ transition, count })),
    }
  }, [deals, weekKeys, currentWeekKey])

  // Idea: lead generation — new deals created, by week, across every pipeline
  // and currency (this is about deal volume, not revenue, so currency doesn't apply).
  const leadGenTrend = useMemo(() => {
    const byWeek = new Map(weekKeys.map((key) => [key, 0]))
    for (const deal of deals) {
      const date = parseFishbowlDate(deal.create_date)
      if (!date) continue
      const key = weekKey(date)
      if (byWeek.has(key)) byWeek.set(key, byWeek.get(key) + 1)
    }
    return weekKeys.map((key) => ({ label: formatWeekLabel(key), value: byWeek.get(key) }))
  }, [deals, weekKeys])

  const newLeadsThisWeek = leadGenTrend[leadGenTrend.length - 1]?.value ?? 0
  const priorWeekLeads = leadGenTrend.length > 1 ? leadGenTrend[leadGenTrend.length - 2].value : null
  const leadDeltaLabel = formatDelta(newLeadsThisWeek, priorWeekLeads)

  // Idea: key opportunities, scoped to what deal data actually supports — no
  // meeting/conversation feed is connected, so this stays to amount and close
  // date rather than overclaiming "customer conversations."
  const keyOpportunities = useMemo(
    () =>
      open
        .filter((deal) => deal.currency === 'USD' && deal.amount != null)
        .slice()
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5),
    [open],
  )
  const nonUsdOpen = open.filter((deal) => deal.currency !== 'USD' && deal.amount != null)
  const nonUsdOpenByCurrency = sumAmountsByCurrency(nonUsdOpen, (deal) => deal.amount, (deal) => deal.currency, 'USD')

  const closingSoon = useMemo(() => {
    const now = new Date()
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    return open
      .map((deal) => ({ deal, date: parseFishbowlDate(deal.close_date) }))
      .filter(({ date }) => date && date >= now && date <= in30Days)
      .sort((a, b) => a.date - b.date)
      .slice(0, 6)
      .map(({ deal }) => deal)
  }, [open])

  // Idea: conference / trade-show leads — surfaces contacts already tagged
  // with a conference source in HubSpot, grouped so a rep can see which events
  // are actually generating pipeline.
  const conferenceGroups = useMemo(() => {
    const byConference = new Map()
    for (const contact of conferenceContacts) {
      const key = contact.conference || 'Unspecified'
      if (!byConference.has(key)) byConference.set(key, [])
      byConference.get(key).push(contact)
    }
    return [...byConference.entries()].sort(([, a], [, b]) => b.length - a.length)
  }, [conferenceContacts])

  return (
    <div className="min-h-screen px-6 pb-10">
      <AppHeader title="Sales Overview" onRefresh={refresh} loading={loading} />

      <div className="mx-auto max-w-6xl">
        {error && (
          <div className="mb-5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <StatCard label="Total Won Revenue" value={totalWon.primary ?? '—'} detail={totalWon.detail} />
          <StatCard label="Win Rate" value={winRate != null ? `${winRate}%` : '—'} />
          <StatCard label="Avg Deal Size (USD)" value={avgDealSize != null ? formatCurrency(avgDealSize, 'USD') : '—'} />
          <StatCard label="Won Deals" value={revenueDeals.length} />
        </div>

        <SalesYearChart
          yearlyStats={salesPerYear}
          deals={wonUsd}
          footer={
            Object.keys(nonUsdByCurrency).length > 0 ? (
              <p className="mt-4 text-xs text-slate-500">
                Also won in other currencies (not included above):{' '}
                {formatMultiCurrency(nonUsdByCurrency)}
              </p>
            ) : null
          }
        />

        <div className="mb-6 rounded-xl border border-surface-border bg-surface-raised p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Sales Trajectory — Past {weeksOfTrend} Weeks</h2>
              <p className="text-xs text-slate-500">Won revenue (USD), by the week each deal closed</p>
            </div>
            <WeeksToggle value={weeksOfTrend} onChange={setWeeksOfTrend} />
          </div>
          <LineChart data={revenueTrend} formatValue={compactUsd} lineColor="#38bdf8" />
        </div>

        <div className="mb-6 rounded-xl border border-surface-border bg-surface-raised p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-100">Top Customers (Won Revenue, USD)</h2>
          {topCompanies.length === 0 ? (
            <p className="text-sm text-slate-500">No won deals with a linked company yet.</p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {topCompanies.map((row) => (
                <li key={row.company} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-slate-200">{row.company}</span>
                  <span className="font-medium tabular-nums text-slate-100">{formatCurrency(row.amount, 'USD')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mb-6 rounded-xl border border-surface-border bg-surface-raised p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-100">Key Opportunities</h2>
            <p className="text-xs text-slate-500">
              Largest and soonest-closing open deals, from deal data — no meeting or activity feed is connected yet
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-300">Largest Open Deals (USD)</h3>
              {keyOpportunities.length === 0 ? (
                <p className="text-sm text-slate-500">No open USD deals yet.</p>
              ) : (
                <ul className="divide-y divide-surface-border">
                  {keyOpportunities.map((deal) => (
                    <li key={deal.deal_id} className="py-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-slate-200">{deal.name || 'Untitled deal'}</span>
                        <span className="shrink-0 font-medium tabular-nums text-slate-100">
                          {formatCurrency(deal.amount, deal.currency)}
                        </span>
                      </div>
                      <p className="truncate text-xs text-slate-500">
                        {deal.company || 'No company linked'} · {deal.stage}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {Object.keys(nonUsdOpenByCurrency).length > 0 && (
                <p className="mt-3 text-xs text-slate-500">
                  Also open in other currencies: {formatMultiCurrency(nonUsdOpenByCurrency)}
                </p>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-300">Closing in the Next 30 Days</h3>
              {closingSoon.length === 0 ? (
                <p className="text-sm text-slate-500">No deals with an expected close date in the next 30 days.</p>
              ) : (
                <ul className="divide-y divide-surface-border">
                  {closingSoon.map((deal) => (
                    <li key={deal.deal_id} className="py-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-slate-200">{deal.name || 'Untitled deal'}</span>
                        <span className="shrink-0 text-xs text-slate-400">{formatShortDate(deal.close_date)}</span>
                      </div>
                      <p className="truncate text-xs text-slate-500">
                        {deal.company || 'No company linked'} · {formatCurrency(deal.amount, deal.currency)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-surface-border bg-surface-raised p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Pipeline Movement — Past {weeksOfTrend} Weeks</h2>
              <p className="text-xs text-slate-500">Deals that changed stage, by week (all pipelines)</p>
            </div>
            <WeeksToggle value={weeksOfTrend} onChange={setWeeksOfTrend} />
          </div>
          <LineChart data={movementTrend} lineColor="#a78bfa" />
          <div className="mt-5 border-t border-surface-border pt-4">
            <h3 className="mb-2 text-sm font-medium text-slate-300">This Week's Stage Changes</h3>
            {thisWeekTransitions.length === 0 ? (
              <p className="text-sm text-slate-500">No stage changes recorded this week.</p>
            ) : (
              <ul className="divide-y divide-surface-border">
                {thisWeekTransitions.map((row) => (
                  <li key={row.transition} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-slate-300">{row.transition}</span>
                    <span className="font-medium tabular-nums text-slate-100">{row.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-surface-border bg-surface-raised p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Lead Generation — Past {weeksOfTrend} Weeks</h2>
              <p className="text-xs text-slate-500">New deals created, by week (all pipelines, all currencies)</p>
            </div>
            <WeeksToggle value={weeksOfTrend} onChange={setWeeksOfTrend} />
          </div>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard label="New Leads This Week" value={newLeadsThisWeek} />
            <StatCard label="vs. Last Week" value={leadDeltaLabel ?? '—'} />
          </div>
          <LineChart data={leadGenTrend} lineColor="#34d399" />
        </div>

        <div className="rounded-xl border border-surface-border bg-surface-raised p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Conference &amp; Trade Show Leads</h2>
              <p className="text-xs text-slate-500">Contacts tagged with a conference source</p>
            </div>
            <span className="text-sm font-medium text-slate-300">{conferenceContacts.length} contacts</span>
          </div>
          {conferenceContacts.length === 0 ? (
            <p className="text-sm text-slate-500">No conference-sourced contacts yet.</p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                {conferenceGroups.map(([conference, contacts]) => (
                  <span key={conference} className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
                    {conference} · {contacts.length}
                  </span>
                ))}
              </div>
              <ul className="divide-y divide-surface-border">
                {conferenceContacts.slice(0, 8).map((contact) => (
                  <li key={contact.contact_id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate text-slate-200">{contact.name || 'Unnamed contact'}</p>
                      <p className="truncate text-xs text-slate-500">
                        {contact.company || 'No company'} · {contact.conference || 'Unspecified conference'}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-500">{formatShortDate(contact.create_date)}</span>
                  </li>
                ))}
              </ul>
              {conferenceContacts.length > 8 && (
                <p className="mt-3 text-xs text-slate-500">+{conferenceContacts.length - 8} more</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
