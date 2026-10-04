import type { Child } from "hono/jsx";
import type { Run } from "../runs.js";
import { RULES, TIERS } from "../score.js";
import { STATUSES, type StoredLead } from "../store.js";
import { Badge, ConfirmSubmit, dateLabel, Document, Empty, Flash, Help, Icon, type IconName, Kpi, LABEL, Logo, PageHead, pct, relative, Segmented, ThemeToggle, Tier } from "./ui.js";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/app", label: "Overview", icon: "home" },
  { href: "/app/leads", label: "Leads", icon: "users" },
  { href: "/app/runs", label: "Pipeline log", icon: "activity" },
];
const NAV2: { href: string; label: string; icon: IconName }[] = [
  { href: "/app/scoring", label: "Scoring rules", icon: "sliders" },
  { href: "/app/integrations", label: "Integrations", icon: "plug" },
];

export function Shell({ path, title, newLeads, failedRuns, children }: { path: string; title: string; newLeads: number; failedRuns: number; children: Child }) {
  const item = (i: { href: string; label: string; icon: IconName }) => {
    const active = i.href === "/app" ? path === "/app" : path.startsWith(i.href);
    const count = i.href === "/app/leads" ? newLeads : i.href === "/app/runs" ? failedRuns : 0;
    return (
      <a href={i.href} class="ri" aria-current={active ? "page" : undefined} aria-label={count ? `${i.label} (${count})` : i.label}>
        <Icon name={i.icon} />
        <span class="tip">{i.label}</span>
        {count > 0 && <span class="badge-n">{count > 99 ? "99+" : count}</span>}
      </a>
    );
  };
  return (
    <Document title={`${title} · Leadline`}>
      <div class="lshell">
        <nav class="rail" aria-label="Main navigation">
          <a href="/app" class="brand" aria-label="Leadline overview"><Logo markOnly /></a>
          {NAV.map(item)}
          <span class="sep" />
          {NAV2.map(item)}
          <div class="bottom">
            <a href="/demo" class="ri" target="_blank" rel="noopener" aria-label="Send a test lead"><Icon name="send" /><span class="tip">Send a test lead</span></a>
          </div>
        </nav>
        <div class="main">
          <header class="topbar">
            <span class="mono tiny muted" style="letter-spacing:.1em;text-transform:uppercase;white-space:nowrap"><span class="live" style="margin-right:8px" />{title}</span>
            <form action="/app/leads" class="search" role="search" style="margin-left:12px">
              <Icon name="search" size="sm" />
              <input name="q" type="search" placeholder="Search leads" aria-label="Search leads" />
            </form>
            <span class="spacer" />
            <ThemeToggle />
            <details class="user-menu">
              <summary aria-label="Account menu"><span class="avatar" aria-hidden="true">SO</span><span class="user-name small strong">Sales ops</span></summary>
              <div class="menu">
                <div class="who"><div class="strong">Sales ops</div><div class="muted tiny">Signed in with the admin token</div></div>
                <a href="/app/integrations"><Icon name="plug" size="sm" /> Integrations</a>
                <form method="post" action="/app/logout"><button><Icon name="logout" size="sm" /> Sign out</button></form>
              </div>
            </details>
          </header>
          <main class="content" id="main">{children}</main>
        </div>
      </div>
    </Document>
  );
}

export function LoginPage({ error, next }: { error?: boolean; next?: string }) {
  return (
    <Document title="Sign in · Leadline">
      <div class="auth">
        <aside class="auth-side">
          <a href="/" aria-label="Leadline home"><Logo /></a>
          <div style="display:grid;gap:24px">
            <h2>See every lead the moment it arrives, and who to call first.</h2>
            <ul>
              <li><Icon name="target" /> <span>Hot, warm and cold ratings with the reasons behind them.</span></li>
              <li><Icon name="layers" /> <span>Move leads from New to Won, with notes for the team.</span></li>
              <li><Icon name="activity" /> <span>A log of every submission, with one-click retry if a step failed.</span></li>
            </ul>
          </div>
          <p style="font-size:13px;opacity:.8">Leadline · inbound lead routing</p>
        </aside>
        <main class="auth-main" style="position:relative">
          <div style="position:absolute;top:20px;right:20px"><ThemeToggle /></div>
          <div class="auth-card">
            <div><h1>Sign in to the dashboard</h1><p class="muted">Enter the admin token set as <code>ADMIN_TOKEN</code> on the server.</p></div>
            {error && <div class="flash err" role="alert"><Icon name="alert" size="sm" /><span>That token isn't right. Check for extra spaces, or ask whoever set up Leadline.</span></div>}
            <form method="post" action="/app/login" class="form card card-pad">
              <input type="hidden" name="next" value={next ?? "/app"} />
              <label>Admin token<input name="token" type="password" autocomplete="current-password" required autofocus /></label>
              <button class="btn lg" data-pending="Signing in…">Sign in</button>
              <p class="muted tiny">You stay signed in for 7 days on this device.</p>
            </form>
            <p class="muted tiny" style="text-align:center"><a href="/">← About Leadline</a> · <a href="/demo">Send a test lead</a></p>
          </div>
        </main>
      </div>
    </Document>
  );
}

export function Score({ lead }: { lead: StoredLead }) {
  return (
    <span style="display:inline-flex;gap:8px;align-items:center">
      <Tier tier={lead.tier} />
      <span class="strong num" title={lead.reasons.join("\n")}>{lead.score}</span>
    </span>
  );
}

export function OverviewPage({ leads, runs }: { leads: StoredLead[]; runs: Run[] }) {
  const day = 86_400_000;
  const since = Date.now() - 30 * day;
  const recent = leads.filter((l) => Date.parse(l.createdAt) >= since);
  const hot = recent.filter((l) => l.tier === "hot");
  const awaiting = leads.filter((l) => l.status === "new");
  const closed = leads.filter((l) => l.status === "won" || l.status === "lost");
  const won = closed.filter((l) => l.status === "won").length;
  const runs30 = runs.filter((r) => Date.parse(r.at) >= since && (r.outcome === "created" || r.outcome === "updated"));
  const avgMs = runs30.length ? Math.round(runs30.reduce((s, r) => s + r.durationMs, 0) / runs30.length) : 0;
  const days = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - (29 - i) * day).toISOString().slice(0, 10));
  const perDay = days.map((d) => {
    const ls = recent.filter((l) => l.createdAt.slice(0, 10) === d);
    return { d, hot: ls.filter((l) => l.tier === "hot").length, warm: ls.filter((l) => l.tier === "warm").length, cold: ls.filter((l) => l.tier === "cold").length };
  });
  const max = Math.max(1, ...perDay.map((p) => p.hot + p.warm + p.cold));
  const sources = Object.entries(recent.reduce<Record<string, number>>((m, l) => ({ ...m, [l.source]: (m[l.source] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const stageCounts = STATUSES.map((s) => ({ s, n: leads.filter((l) => l.status === s).length }));
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const callFirst = awaiting.slice().sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt)).slice(0, 6);

  return (
    <>
      <PageHead
        title="Overview"
        lead="Inbound leads over the last 30 days, who to call first, and how the pipeline is running."
        actions={<a href="/app/leads?status=new" class="btn"><Icon name="users" size="sm" /> Leads to contact</a>}
      />
      <section class="kpis">
        <Kpi label="New leads" value={String(recent.length)} hint="Last 30 days" help="Distinct people who sent an enquiry in the last 30 days. Repeat enquiries count once." />
        <Kpi label="Hot leads" value={String(hot.length)} hint={recent.length ? `${pct(hot.length / recent.length)} of new leads` : "None yet"} help={`Leads scoring ${TIERS.hot} or more. See Scoring rules for how points are given.`} />
        <Kpi label="Awaiting first contact" value={String(awaiting.length)} hint={awaiting.length ? "Status still “New”" : "Everyone has been contacted"} alert={awaiting.some((l) => l.tier === "hot")} help="Leads nobody has moved past New yet. Highlighted when any of them are hot." />
        <Kpi label="Win rate" value={closed.length ? pct(won / closed.length) : "–"} hint={closed.length ? `${won} won of ${closed.length} closed` : "No closed leads yet"} help="Won ÷ (won + lost). Leads still open aren't counted." />
      </section>

      <div class="grid grid-main">
        <section class="card">
          <div class="card-head">
            <div><h2>Leads per day</h2><p>Stacked by rating.</p></div>
            <div class="legend" style="margin:0"><span><i style="background:var(--hot)" />Hot</span><span><i style="background:var(--warm)" />Warm</span><span><i style="background:var(--cold)" />Cold</span></div>
          </div>
          <div class="card-body">
            <div class="chart" role="img" aria-label={`Leads per day from ${fmt(days[0]!)} to ${fmt(days[29]!)}.`}>
              {perDay.map((p) => (
                <div class="col" title={`${fmt(p.d)}: ${p.hot} hot, ${p.warm} warm, ${p.cold} cold`}>
                  <span style={`height:${(p.cold / max) * 100}%;background:var(--cold)`} />
                  <span style={`height:${(p.warm / max) * 100}%;background:var(--warm)`} />
                  <span style={`height:${(p.hot / max) * 100}%;background:var(--hot);border-radius:3px 3px 0 0`} />
                </div>
              ))}
            </div>
            <div class="axis"><span>{fmt(days[0]!)}</span><span>{fmt(days[29]!)}</span></div>
          </div>
        </section>
        <section class="card">
          <div class="card-head"><div><h2>Pipeline</h2><p>All leads by stage.</p></div></div>
          <div class="card-body bars">
            {stageCounts.map(({ s, n }) => (
              <a href={`/app/leads?status=${s}`} class="bar-row" style="grid-template-columns:90px 1fr 32px;color:inherit;text-decoration:none">
                <span class="small">{LABEL[s]}</span>
                <span class="bar-track"><span class="bar-fill" style={`width:${(n / Math.max(1, leads.length)) * 100}%;display:block`} /></span>
                <span class="strong num" style="text-align:right">{n}</span>
              </a>
            ))}
          </div>
        </section>
      </div>

      <div class="grid grid-main">
        <section class="card">
          <div class="card-head"><div><h2>Call these first</h2><p>Uncontacted leads, highest score first.</p></div><a href="/app/leads?status=new" class="btn ghost sm">All new leads</a></div>
          {callFirst.length === 0 ? (
            <Empty icon="checkCircle" title="Nobody waiting">Every lead has been contacted. New enquiries appear here the moment they arrive.</Empty>
          ) : (
            <ul class="list">
              {callFirst.map((l) => (
                <li>
                  <span class="grow">
                    <a href={`/app/leads/${l.id}`} class="title">{l.name}{l.company ? ` · ${l.company}` : ""}</a>
                    <span class="muted tiny">{l.role ?? "Role not given"}{l.budgetUsd ? ` · budget $${l.budgetUsd.toLocaleString("en-US")}` : ""} · {relative(new Date(l.createdAt))}</span>
                  </span>
                  <Score lead={l} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section class="card">
          <div class="card-head"><div><h2>Sources</h2><p>Where new leads came from.</p></div></div>
          {sources.length === 0 ? <Empty icon="plug" title="No leads yet">Connect a form on the Integrations page.</Empty> : (
            <ul class="list">{sources.map(([s, n]) => <li><span class="grow"><span class="title">{s}</span></span><span class="strong num">{n}</span></li>)}</ul>
          )}
          <div class="card-foot small muted">Average processing time: <strong>{avgMs} ms</strong> per submission <Help id="speed-help">From receiving the form to the lead being saved, alerted and emailed, averaged over the last 30 days.</Help></div>
        </section>
      </div>
    </>
  );
}

export function LeadsPage({ leads, all, tier, status, q, sort }: { leads: StoredLead[]; all: StoredLead[]; tier: string; status: string; q: string; sort: string }) {
  const qs = (o: Record<string, string>) => {
    const p = new URLSearchParams({ tier, status, q, sort, ...o });
    for (const [k, v] of [...p]) if (!v || v === "all" || (k === "sort" && v === "score")) p.delete(k);
    const s = p.toString();
    return `/app/leads${s ? `?${s}` : ""}`;
  };
  return (
    <>
      <PageHead
        title="Leads"
        lead="Everyone who has enquired, merged by email. Open a lead to see its score breakdown, update its stage and add notes."
        actions={<a href={`/app/leads/export.csv${qs({}).replace("/app/leads", "")}`} class="btn secondary"><Icon name="download" size="sm" /> Export CSV</a>}
      />
      <section class="card">
        <div class="toolbar">
          <Segmented current={tier} items={["all", "hot", "warm", "cold"].map((t) => ({ key: t, href: qs({ tier: t }), label: t === "all" ? "All ratings" : t[0]!.toUpperCase() + t.slice(1), n: t === "all" ? all.length : all.filter((l) => l.tier === t).length }))} />
          <form action="/app/leads" role="search" class="form-row" style="max-width:none;flex:1;grid-template-columns:2fr 1fr 1fr auto;min-width:280px">
            <input type="hidden" name="tier" value={tier} />
            <input name="q" value={q} placeholder="Name, company or email" aria-label="Search leads" />
            <select name="status" aria-label="Stage">
              <option value="all">All stages</option>
              {STATUSES.map((s) => <option value={s} selected={s === status}>{LABEL[s]}</option>)}
            </select>
            <select name="sort" aria-label="Sort">
              <option value="score" selected={sort === "score"}>Highest score</option>
              <option value="newest" selected={sort === "newest"}>Newest first</option>
            </select>
            <button class="btn secondary">Apply</button>
          </form>
        </div>
        {leads.length === 0 ? (
          all.length === 0 ? <Empty icon="users" title="No leads yet" action={<a href="/demo" class="btn sm">Send a test lead</a>}>When someone fills in a connected form, they appear here within seconds, already scored.</Empty>
            : <Empty icon="search" title="No leads match" action={<a href="/app/leads" class="btn secondary sm">Clear filters</a>}>Try a different rating, stage or search term.</Empty>
        ) : (
          <div class="table-wrap">
            <table>
              <thead><tr><th>Lead</th><th>Company</th><th>Rating</th><th>Stage</th><th class="r">Budget</th><th>Source</th><th>Last enquiry</th></tr></thead>
              <tbody>
                {leads.map((l) => (
                  <tr>
                    <td><a href={`/app/leads/${l.id}`} class="row-link">{l.name}</a><span class="sub">{l.email}{l.submissions > 1 ? ` · ${l.submissions} enquiries` : ""}</span></td>
                    <td>{l.company ?? <span class="muted">—</span>}{l.role && <span class="sub">{l.role}</span>}</td>
                    <td><Score lead={l} /></td>
                    <td><Badge status={l.status} /></td>
                    <td class="r">{l.budgetUsd ? `$${l.budgetUsd.toLocaleString("en-US")}` : <span class="muted">—</span>}</td>
                    <td class="small">{l.source}</td>
                    <td class="nowrap muted small" title={dateLabel(new Date(l.updatedAt), true)}>{relative(new Date(l.updatedAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

const STEP_LABEL: Record<string, string> = { store: "Saved to CRM", slack: "Slack alert", email: "Follow-up email" };
function Steps({ run }: { run: Run }) {
  if (run.steps.length === 0) return <span class="muted small">{run.outcome === "spam" ? "Dropped silently" : "Not processed"}</span>;
  return (
    <span class="steps-inline">
      {run.steps.map((s) => (
        <span class={`step ${s.skipped ? "skip" : s.ok ? "ok" : "fail"}`} title={s.error ?? (s.skipped ? "Not needed for a repeat enquiry" : "")}>
          <Icon name={s.skipped ? "clock" : s.ok ? "check" : "x"} size="sm" />{STEP_LABEL[s.step]}
        </span>
      ))}
    </span>
  );
}

export function LeadPage({ lead, runs, ok, err }: { lead: StoredLead; runs: Run[]; ok?: string; err?: string }) {
  const messages = (lead.message ?? "").split("\n---\n").filter(Boolean);
  return (
    <>
      <PageHead
        crumbs={[{ href: "/app/leads", label: "Leads" }]}
        title={lead.name}
        lead={<>{lead.role ? `${lead.role}, ` : ""}{lead.company ?? "No company given"} · first enquiry {dateLabel(new Date(lead.createdAt), true)}</>}
        actions={<><a href={`mailto:${lead.email}`} class="btn"><Icon name="mail" size="sm" /> Email {lead.name.split(" ")[0]}</a>{lead.phone && <a href={`tel:${lead.phone}`} class="btn secondary">Call</a>}</>}
      />
      <Flash ok={ok} err={err} />
      <div class="grid grid-main">
        <div class="grid">
          <section class="card">
            <div class="card-head"><div><h2>Enquir{messages.length === 1 ? "y" : "ies"}</h2><p>{lead.submissions} submission{lead.submissions === 1 ? "" : "s"} · latest via {lead.source}</p></div></div>
            {messages.length === 0 ? <Empty icon="message" title="No message">They filled in the form without a message.</Empty> : (
              <div class="transcript">{messages.map((m) => <div class="bubble bot" style="max-width:100%">{m}</div>)}</div>
            )}
          </section>
          <section class="card">
            <div class="card-head"><div><h2>Why it scored {lead.score}</h2><p>Hot at {TIERS.hot}+ points, warm at {TIERS.warm}+. <a href="/app/scoring">See all rules</a></p></div><Tier tier={lead.tier} /></div>
            {lead.reasons.length === 0 ? <Empty icon="sliders" title="No rules matched">No budget, role or intent signals were found in this enquiry.</Empty> : (
              <ul class="list">
                {lead.reasons.map((r) => {
                  const [pts, ...rest] = r.split(" ");
                  return <li><span class={`pts ${pts!.startsWith("-") ? "minus" : "plus"}`} style="width:40px">{pts}</span><span class="grow">{rest.join(" ")}</span></li>;
                })}
                <li><span class="pts" style="width:40px">{lead.score}</span><span class="grow strong">Total</span></li>
              </ul>
            )}
          </section>
          <section class="card">
            <div class="card-head"><div><h2>Pipeline runs</h2><p>Every time this lead came in, and what happened.</p></div></div>
            {runs.length === 0 ? <Empty icon="activity" title="No runs recorded">Runs are logged for submissions received after the pipeline log was enabled.</Empty> : (
              <ul class="list">{runs.map((r) => <li style="flex-wrap:wrap"><span class="grow"><span class="title">{r.outcome === "created" ? "First enquiry" : "Repeat enquiry"} · {dateLabel(new Date(r.at), true)}</span><span class="muted tiny">{r.durationMs} ms · via {r.source}</span></span><Steps run={r} /></li>)}</ul>
            )}
          </section>
        </div>
        <div class="grid">
          <section class="card">
            <div class="card-head"><div><h2>Stage &amp; notes</h2><p>Shared with everyone on the team.</p></div><Badge status={lead.status} /></div>
            <form method="post" action={`/app/leads/${lead.id}`} class="card-body form">
              <label>Stage
                <select name="status">{STATUSES.map((s) => <option value={s} selected={s === lead.status}>{LABEL[s]}</option>)}</select>
              </label>
              <label>Notes<textarea name="notes" rows={5} maxlength={4000} placeholder="Call outcome, next step, who owns it…">{lead.notes}</textarea></label>
              <button class="btn" data-pending="Saving…">Save</button>
            </form>
          </section>
          <section class="card">
            <div class="card-head"><div><h2>Contact</h2></div></div>
            <div class="card-body">
              <dl class="dl">
                <dt>Email</dt><dd><a href={`mailto:${lead.email}`}>{lead.email}</a>{lead.freeEmail && <span class="muted tiny"> (personal)</span>}</dd>
                <dt>Phone</dt><dd>{lead.phone ?? <span class="muted">Not given</span>}</dd>
                <dt>Company</dt><dd>{lead.company ?? <span class="muted">Not given</span>}</dd>
                <dt>Role</dt><dd>{lead.role ?? <span class="muted">Not given</span>}</dd>
                <dt>Budget</dt><dd>{lead.budgetUsd ? `$${lead.budgetUsd.toLocaleString("en-US")}` : <span class="muted">Not given</span>}</dd>
                <dt>Source</dt><dd>{lead.source}</dd>
                <dt>Updated</dt><dd>{dateLabel(new Date(lead.updatedAt), true)}</dd>
              </dl>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

export function RunsPage({ runs, filter, ok, err }: { runs: Run[]; filter: string; ok?: string; err?: string }) {
  const failed = (r: Run) => r.steps.some((s) => !s.ok);
  const shown = runs.filter((r) => (filter === "failed" ? failed(r) : filter === "rejected" ? r.outcome === "rejected" || r.outcome === "spam" : true));
  return (
    <>
      <PageHead title="Pipeline log" lead="Every submission and what happened to it: saved, alerted, emailed, merged, rejected or blocked as spam. Retry any step that failed." />
      <Flash ok={ok} err={err} />
      <section class="card">
        <div class="toolbar">
          <Segmented current={filter} items={[
            { key: "all", href: "/app/runs", label: "All", n: runs.length },
            { key: "failed", href: "/app/runs?filter=failed", label: "Needs attention", n: runs.filter(failed).length },
            { key: "rejected", href: "/app/runs?filter=rejected", label: "Rejected & spam", n: runs.filter((r) => r.outcome === "rejected" || r.outcome === "spam").length },
          ]} />
        </div>
        {shown.length === 0 ? (
          <Empty icon={filter === "failed" ? "checkCircle" : "activity"} title={filter === "failed" ? "Nothing needs attention" : "No runs yet"}>
            {filter === "failed" ? "Every Slack alert and follow-up email went out." : "Each form submission is logged here with the result of every step."}
          </Empty>
        ) : (
          <div class="table-wrap">
            <table>
              <thead><tr><th>When</th><th>Lead</th><th>Result</th><th>Steps</th><th class="r">Time</th><th /></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr>
                    <td class="nowrap small" title={dateLabel(new Date(r.at), true)}>{relative(new Date(r.at))}</td>
                    <td>{r.leadId ? <a href={`/app/leads/${r.leadId}`} class="row-link">{r.email}</a> : <span class="muted">{r.email || "No email"}</span>}<span class="sub">via {r.source}</span></td>
                    <td><Badge status={r.outcome} />{r.tier && <> <Tier tier={r.tier} /></>}{r.errors.length > 0 && <span class="sub">{r.errors.join(" · ")}</span>}</td>
                    <td><Steps run={r} />{r.retriedAt && <span class="sub">Retried {relative(new Date(r.retriedAt))}</span>}</td>
                    <td class="r muted small">{r.durationMs} ms</td>
                    <td class="r">
                      {failed(r) && (
                        <form method="post" action={`/app/runs/${r.id}/retry`}>
                          <ConfirmSubmit label="Retry failed steps" cls="btn secondary sm" title="Retry failed steps?" body="Only the steps that failed are sent again. The lead record isn't changed." confirm="Retry" />
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export function ScoringPage() {
  const groups = [...new Set(RULES.map((r) => r.group))];
  return (
    <>
      <PageHead title="Scoring rules" lead="How every lead is rated. These are the exact rules the pipeline runs: plain, predictable and free to compute. Points add up; the total sets the rating." />
      <section class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        <div class="card kpi"><div class="label"><Tier tier="hot" /></div><div class="value">{TIERS.hot}+</div><div class="hint">Call today</div></div>
        <div class="card kpi"><div class="label"><Tier tier="warm" /></div><div class="value">{TIERS.warm}–{TIERS.hot - 1}</div><div class="hint">Follow up this week</div></div>
        <div class="card kpi"><div class="label"><Tier tier="cold" /></div><div class="value">&lt; {TIERS.warm}</div><div class="hint">Nurture by email</div></div>
      </section>
      <section class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Signal</th><th>Rule</th><th class="r">Points</th></tr></thead>
            <tbody>
              {groups.flatMap((g) => RULES.filter((r) => r.group === g).map((r, i) => (
                <tr><td class="strong">{i === 0 ? g : ""}</td><td>{r.when}</td><td class={`r pts ${r.points < 0 ? "minus" : "plus"}`}>{r.points > 0 ? `+${r.points}` : r.points}</td></tr>
              )))}
            </tbody>
          </table>
        </div>
        <div class="card-foot"><div class="callout"><Icon name="info" size="sm" /><span>To change a rule or threshold, edit <code>src/score.ts</code>. This page and the pipeline read the same table, so they can't drift apart. Existing leads are re-scored on their next enquiry.</span></div></div>
      </section>
    </>
  );
}

export function IntegrationsPage({ origin, store, slack, email, secretSet }: { origin: string; store: string; slack: boolean; email: boolean; secretSet: boolean }) {
  const row = (icon: IconName, name: string, on: boolean, onText: string, offText: string, how: string) => (
    <li style="align-items:flex-start">
      <span class="file-icon"><Icon name={icon} size="sm" /></span>
      <span class="grow"><span class="title">{name}</span><span class="muted tiny">{on ? onText : offText}</span><span class="tiny muted" style="display:block;margin-top:4px">{how}</span></span>
      <span class={`badge ${on ? "paid" : "void"}`}>{on ? "Connected" : "Demo mode"}</span>
    </li>
  );
  const curl = `curl -X POST ${origin}/webhook/lead \\
  -H "X-Webhook-Secret: $WEBHOOK_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Maria Lopez","email":"maria@northwind.co","budget":"$8k","message":"Need a quote"}'`;
  return (
    <>
      <PageHead title="Integrations" lead="Where leads come from and where they go. Connections are configured with environment variables on the server." />
      <div class="grid grid-2" style="align-items:start">
        <section class="card">
          <div class="card-head"><div><h2>Destinations</h2><p>Each new lead is saved, then alerted and emailed.</p></div></div>
          <ul class="list">
            {row("layers", "CRM", store === "airtable", "Saving to Airtable.", "Saving to a local file (data/leads.json).", "Set STORE=airtable with AIRTABLE_TOKEN and AIRTABLE_BASE_ID.")}
            {row("message", "Slack alerts", slack, "Posting to your Slack channel.", "Alerts are written to the server log instead of Slack.", "Set SLACK_WEBHOOK_URL to an incoming-webhook URL.")}
            {row("mail", "Follow-up email", email, "Sending through Resend.", "Emails are written to the server log instead of being sent.", "Set RESEND_API_KEY and FOLLOW_UP_FROM.")}
          </ul>
        </section>
        <section class="card">
          <div class="card-head"><div><h2>Webhook</h2><p>Send any form's fields here as JSON.</p></div><button type="button" class="btn secondary sm" data-copy="curl">Copy example</button></div>
          <div class="card-body form">
            <dl class="dl">
              <dt>URL</dt><dd><code>{origin}/webhook/lead</code></dd>
              <dt>Header</dt><dd><code>X-Webhook-Secret</code> {secretSet ? <span class="badge paid">Secret set</span> : <span class="badge overdue">Not set</span>}</dd>
              <dt>Required</dt><dd><code>name</code>, <code>email</code></dd>
              <dt>Optional</dt><dd><code>company role phone budget message source</code></dd>
            </dl>
            <pre class="code" id="curl"><code>{curl}</code></pre>
          </div>
        </section>
      </div>
      <section class="card">
        <div class="card-head"><div><h2>No-code version (n8n)</h2><p>The same pipeline as an importable n8n workflow: webhook → clean &amp; score → Google Sheets (upsert by email) → Slack → Gmail.</p></div>
          <a href="/n8n/lead-to-crm.workflow.json" class="btn secondary" download><Icon name="download" size="sm" /> Download workflow</a>
        </div>
        <div class="card-body small muted">Import it in n8n, connect Header Auth, Google Sheets, Slack and Gmail credentials, and set your Sheet ID. Uses the same scoring rules as this dashboard.</div>
      </section>
    </>
  );
}

export function NotFoundPage() {
  return (
    <Document title="Not found · Leadline">
      <main class="auth-main" style="min-height:100vh">
        <div class="auth-card" style="text-align:center;justify-items:center">
          <Logo />
          <h1>We couldn't find that page</h1>
          <p class="muted">The lead or run may have been removed, or the link is out of date.</p>
          <div class="actions" style="justify-content:center"><a href="/app" class="btn">Go to the dashboard</a><a href="/" class="btn secondary">Leadline home</a></div>
        </div>
      </main>
    </Document>
  );
}
