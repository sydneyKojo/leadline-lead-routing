import { Document, Icon, type IconName, Logo, ThemeToggle } from "./ui.js";

const STEPS: { icon: IconName; t: string; d: string }[] = [
  { icon: "checkCircle", t: "Validate", d: "Required fields, real email format, and a hidden honeypot that silently drops bots." },
  { icon: "sliders", t: "Clean up", d: "Names in proper case, emails lower-cased, phone numbers normalised, company taken from the email domain, “$5k” read as 5,000." },
  { icon: "users", t: "De-duplicate", d: "A second enquiry from the same person updates their record instead of creating a duplicate, and keeps both messages." },
  { icon: "target", t: "Score", d: "Clear rules turn budget, role, urgency and intent into a hot, warm or cold rating, with every point explained." },
  { icon: "send", t: "Route", d: "Saved to your CRM, posted to Slack, and the lead gets a tailored follow-up email within seconds." },
];

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: "zap", title: "Seconds, not hours", body: "Every enquiry is in your CRM and your team's Slack before the visitor has closed the tab. Fast replies win more deals." },
  { icon: "target", title: "Know who to call first", body: "Hot, warm and cold ratings come with the reasons behind them, so reps trust the score and can see why a lead ranks where it does." },
  { icon: "users", title: "No duplicate records", body: "Repeat enquiries merge into one record with a submission count and the full message history." },
  { icon: "shield", title: "Nothing gets lost", body: "Saving the lead always comes first. If Slack or email is down, the lead is still saved, the failure is logged, and you can retry with one click." },
  { icon: "layers", title: "A simple pipeline view", body: "Move leads from New to Contacted, Qualified, Won or Lost, add notes, and filter by rating, stage or source." },
  { icon: "plug", title: "Fits your stack", body: "Airtable today; HubSpot, Pipedrive or a database behind the same interface. Prefer no-code? The same flow ships as an n8n workflow." },
];

const FAQ = [
  { q: "Which forms does it work with?", a: "Any form that can send a webhook: your own site, Webflow, Typeform, Tally, Jotform, Gravity Forms or an n8n/Zapier step. Point it at the webhook URL with your secret header." },
  { q: "Can we change how leads are scored?", a: "Yes. The rules are a short, readable table: points for budget, role, urgency, buying intent and email type, with thresholds for hot and warm. The Scoring page in the dashboard shows exactly what runs." },
  { q: "Why rules instead of AI scoring?", a: "Rules are instant, free to run, predictable and explainable to a sales team. When there's enough won/lost history, the same pipeline can add a model-based score alongside them." },
  { q: "What happens if Slack or the email service fails?", a: "The lead is saved first, so it is never lost. Failed steps are recorded on the run with the error, and you can retry them from the pipeline log." },
  { q: "Where is lead data kept?", a: "In your own CRM (Airtable in this build) or a local file for demos. Leadline only stores a log of each run so you can audit what happened." },
];

export function HomePage() {
  return (
    <Document title="Leadline · Every inbound lead, cleaned, scored and routed in seconds" description="Leadline turns website enquiries into clean, de-duplicated, scored CRM records, alerts your team in Slack and sends the lead a follow-up email.">
      <header class="mk-nav">
        <div class="inner">
          <a href="/" aria-label="Leadline home"><Logo /></a>
          <nav class="links" aria-label="Product">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#faq">FAQ</a>
          </nav>
          <span style="flex:1" />
          <ThemeToggle />
          <a href="/app" class="btn ghost">Dashboard</a>
          <a href="/demo" class="btn">Send a test lead</a>
        </div>
      </header>
      <main>
        <div class="mk-wrap grid-glow">
          <section class="mk-hero">
            <div>
              <h1>Every inbound lead, scored and routed in <em>seconds.</em></h1>
              <p class="sub">
                Leadline turns each website enquiry into a clean CRM record, rates it hot, warm or cold with the reasons shown,
                alerts your team in Slack and sends the lead a follow-up email, before they've closed the tab.
              </p>
              <div class="cta">
                <a href="/demo" class="btn lg">Send a test lead <Icon name="arrowRight" size="sm" /></a>
                <a href="#how" class="btn secondary lg">See the pipeline</a>
              </div>
              <p class="fine">The demo form feeds the real pipeline. Then open the dashboard to see the record, the score and the alert.</p>
            </div>
            <div class="engine" role="img" aria-label="Illustration of the routing log for one lead, with example data">
              <div class="engine-head"><span>Leadline engine</span><span class="on"><span class="live" /> Live</span></div>
              {[
                ["Received", "maria@northwind.co · website", "0 ms"],
                ["Cleaned", "Maria Lopez · Northwind · +1 415 555 0142", "4 ms"],
                ["De-duplicated", "New contact, no match", "9 ms"],
                ["Scored", "75 · HOT · budget $8k, founder, urgent", "11 ms"],
                ["Saved", "Airtable › Leads", "180 ms"],
                ["Routed", "Slack #leads · follow-up email sent", "412 ms"],
              ].map(([k, v, t], i) => (
                <div class="engine-row">
                  <span class="ix done">{i + 1}</span>
                  <span><span class="k">{k}</span><span class="v" style="display:block">{v}</span></span>
                  <span class="t">{t}</span>
                </div>
              ))}
            </div>
          </section>
        </div>


        <section class="shots" aria-label="Screenshots of the Leadline dashboard">
          <div class="mk-wrap">
            <figure class="tilt">
              <div class="browser"><div class="browser-bar"><i /><i /><i /><span>leadline.app/app</span></div><img src="/assets/img/overview.jpg" alt="Leadline overview: new leads, hot leads, leads per day by rating, and who to call first" loading="lazy" /></div>
            </figure>
          </div>
        </section>

        <section class="mk-section">
          <div class="mk-wrap">
            <div class="intro">
              <span class="kicker">The problem</span><h2>The first hour decides most deals.</h2>
              <p>Enquiries that sit in a shared inbox go cold. Copying them into a CRM by hand creates duplicates and typos, and nobody knows which one to call first.</p>
            </div>
            <div class="compare">
              <div class="card card-pad">
                <h3 style="margin-bottom:12px">By hand</h3>
                <ul>
                  {["Form emails pile up in a shared inbox", "Leads copied into the CRM hours later, with typos", "The same person entered three times", "Every lead looks equally urgent"].map((t) => (
                    <li><span style="color:var(--danger)"><Icon name="x" size="sm" /></span>{t}</li>
                  ))}
                </ul>
              </div>
              <div class="card card-pad" style="border-color:color-mix(in srgb, var(--signal) 45%, transparent)">
                <h3 style="margin-bottom:12px">With Leadline</h3>
                <ul>
                  {["In the CRM and in Slack within seconds", "Names, emails and phone numbers cleaned automatically", "Repeat enquiries merged into one record", "Hot leads flagged, with the reasons shown"].map((t) => (
                    <li><span style="color:var(--ok)"><Icon name="check" size="sm" /></span>{t}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section class="mk-section" id="how">
          <div class="mk-wrap">
            <div class="intro">
              <span class="kicker">How it works</span><h2>What happens to every enquiry.</h2>
              <p>Five steps, typically in under a second. Each one is logged, so you can see exactly what happened to any lead.</p>
            </div>
            <ol class="flow" style="padding:0;margin:0">
              {STEPS.map((s, i) => (
                <li><span class="n">0{i + 1} · {s.t.toUpperCase()}</span><h3>{s.t}</h3><p>{s.d}</p></li>
              ))}
            </ol>
          </div>
        </section>

        <section class="mk-section alt" id="features">
          <div class="mk-wrap">
            <div class="intro"><span class="kicker">Product</span><h2>Built for the team that has to call them back.</h2></div>
            <div class="gallery">
              <figure>
                <div class="browser"><div class="browser-bar"><i /><i /><i /><span>Lead detail</span></div><img src="/assets/img/lead.jpg" alt="A lead's page: the enquiry, why it scored 95, stage and notes, and each pipeline run" loading="lazy" /></div>
                <figcaption>Every score comes with its reasons, so reps trust it.</figcaption>
              </figure>
              <figure class="phone-fig">
                <div class="phone"><img src="/assets/img/phone.jpg" alt="Leadline overview on a phone" loading="lazy" /></div>
                <figcaption>Check new leads from your phone.</figcaption>
              </figure>
            </div>
            <div class="features">
              {FEATURES.map((f) => <div class="feature"><span class="fi"><Icon name={f.icon} /></span><h3>{f.title}</h3><p>{f.body}</p></div>)}
            </div>
          </div>
        </section>

        <section class="mk-section">
          <div class="mk-wrap grid grid-2" style="align-items:center">
            <div class="intro" style="margin-bottom:0">
              <span class="kicker">Integrations</span><h2>Connect any form in one step.</h2>
              <p>Send the form's fields as JSON to your webhook, with your secret in a header. Field names are forgiving: only name and email are required.</p>
            </div>
            <pre class="code"><code>{`POST /webhook/lead
X-Webhook-Secret: ••••••••

{ "name": "maria lopez",
  "email": "Maria@Northwind.co",
  "role": "Founder", "budget": "$8k",
  "message": "Need a quote asap" }`}</code></pre>
          </div>
        </section>

        <section class="mk-section" id="faq">
          <div class="mk-wrap">
            <div class="grid grid-2" style="gap:48px;align-items:start">
              <div><span class="kicker">FAQ</span><h2>Questions sales and ops teams ask.</h2></div>
              <div class="faq">{FAQ.map((f) => <details><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
            </div>
          </div>
        </section>

        <div class="mk-wrap">
          <section class="mk-cta" style="margin-top:88px">
            <span class="kicker" style="margin:0">Try it</span>
            <h2>Send yourself a test lead.</h2>
            <p style="max-width:520px">Fill in the demo form, then watch it arrive scored and routed in the dashboard.</p>
            <a href="/demo" class="btn lg">Open the demo form</a>
          </section>
        </div>
      </main>
      <footer class="mk-foot">
        <div class="mk-wrap inner">
          <Logo />
          <span>Leadline: inbound lead capture, scoring and routing. Demo data is fictional.</span>
          <a href="/app">Dashboard</a>
        </div>
      </footer>
    </Document>
  );
}

// A contact page for a fictional agency, wired to the real pipeline.
export function DemoFormPage() {
  return (
    <Document title="Contact Fieldstone Studio · Leadline demo">
      <div style="background:#c6f432;color:#15181c;font-size:13px;font-weight:500;padding:8px 16px;text-align:center">
        Demo of <a href="/" style="color:#15181c;text-decoration:underline">Leadline</a> on a fictional agency's contact page. Submissions go through the real pipeline.
      </div>
      <header class="mk-nav">
        <div class="inner">
          <span class="logo" style="gap:8px"><span style="width:26px;height:26px;border-radius:50%;background:var(--text);color:var(--bg);display:grid;place-items:center;font-size:12px">F</span>Fieldstone Studio</span>
          <span style="flex:1" />
          <ThemeToggle />
          <a href="/app" class="btn ghost sm">Open the Leadline dashboard</a>
        </div>
      </header>
      <main class="mk-wrap grid grid-main" style="padding-top:40px;padding-bottom:80px;align-items:start">
        <section class="card">
          <div class="card-head"><div><h1 style="font-size:24px">Tell us about your project</h1><p>We reply to every enquiry within one working day.</p></div></div>
          <form id="lead-form" class="card-body form" novalidate>
            <div class="form-row">
              <label>Your name<input name="name" required autocomplete="name" /></label>
              <label>Work email<input name="email" type="email" required autocomplete="email" /></label>
            </div>
            <div class="form-row">
              <label>Company <span class="hint">Optional</span><input name="company" autocomplete="organization" /></label>
              <label>Your role <span class="hint">Optional</span><input name="role" placeholder="e.g. Founder, Marketing lead" /></label>
            </div>
            <div class="form-row">
              <label>Phone <span class="hint">Optional</span><input name="phone" type="tel" autocomplete="tel" /></label>
              <label>Budget <span class="hint">Optional</span><input name="budget" placeholder="e.g. $5k or 2,000–4,000" /></label>
            </div>
            <label>What do you need?<textarea name="message" rows={5} placeholder="Goals, timeline, anything we should know." /></label>
            <label class="sr-only" aria-hidden="true">Website<input name="website" tabindex={-1} autocomplete="off" /></label>
            <div class="form-actions" style="justify-content:space-between;align-items:center">
              <span class="muted tiny">By sending this you agree to be contacted about your enquiry.</span>
              <button class="btn lg" id="send">Send enquiry</button>
            </div>
            <div id="result" role="status" aria-live="polite" />
          </form>
        </section>
        <aside class="card">
          <div class="card-head"><div><h2>What happens when you send</h2><p>This is the Leadline pipeline, live.</p></div></div>
          <ol class="list" style="padding:0">
            {STEPS.map((s) => <li><span class="file-icon"><Icon name={s.icon} size="sm" /></span><span class="grow"><span class="title">{s.t}</span><span class="muted tiny">{s.d}</span></span></li>)}
          </ol>
          <div class="card-foot"><a href="/app/leads" class="btn secondary" style="width:100%">See it in the dashboard</a></div>
        </aside>
      </main>
      <script dangerouslySetInnerHTML={{ __html: `
        const f = document.getElementById("lead-form"), out = document.getElementById("result"), btn = document.getElementById("send");
        f.addEventListener("submit", async (e) => {
          e.preventDefault();
          const body = Object.fromEntries([...new FormData(f)].filter(([, v]) => v !== ""));
          body.source = "website";
          btn.disabled = true; btn.textContent = "Sending…"; out.innerHTML = "";
          try {
            const res = await fetch("/form", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const data = await res.json();
            if (res.ok) {
              out.className = "flash ok";
              out.textContent = "Thanks! Your enquiry is in. (Demo: it was scored " + data.tier + " and routed. Open the dashboard to see the record.)";
              f.reset();
            } else {
              out.className = "flash err";
              out.textContent = (data.errors || [data.error || "Something went wrong."]).map((x) => x.replace(/^\\w+: /, "")).join(" · ");
            }
          } catch { out.className = "flash err"; out.textContent = "Couldn't send. Check your connection and try again."; }
          btn.disabled = false; btn.textContent = "Send enquiry";
        });` }} />
    </Document>
  );
}
