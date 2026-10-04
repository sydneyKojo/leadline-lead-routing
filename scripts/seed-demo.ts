// Fills the dashboard with a realistic month of enquiries by sending them through the real pipeline (with
// back-dated timestamps and a silent notifier). Fictional people and companies. Run: npm run seed
import { rm } from "node:fs/promises";
import type { Notifier } from "../src/notify.js";
import { processLead } from "../src/pipeline.js";
import "dotenv/config";
import { connect, PostgresRunLog, PostgresStore, setup } from "../src/pg.js";
import { FileRunLog, type RunLog } from "../src/runs.js";
import { FileStore, type LeadStatus, type LeadStore } from "../src/store.js";

// Seeds whichever store the app uses: Postgres when STORE=postgres, otherwise the local files.
let store: LeadStore;
let runs: RunLog;
const sql = process.env.STORE === "postgres" ? connect() : null;
if (sql) {
  await setup(sql);
  await sql`truncate leads, runs`;
  store = new PostgresStore(sql);
  runs = new PostgresRunLog(sql);
} else {
  await rm("data/leads.json", { force: true });
  await rm("data/runs.json", { force: true });
  store = new FileStore("data/leads.json");
  runs = new FileRunLog("data/runs.json");
}

let slackDown = false;
const notifier: Notifier = {
  alert: async () => {
    if (slackDown) throw new Error("Slack 503: service unavailable");
  },
  email: async () => {},
};

type In = { d: number; name: string; email: string; company?: string; role?: string; phone?: string; budget?: string; message?: string; source: string; status?: LeadStatus; notes?: string; slackDown?: boolean };
const LEADS: In[] = [
  { d: 29, name: "hannah weiss", email: "hannah@larkspur-dental.example", role: "Practice manager", budget: "$3k", message: "Looking for a new website with online booking.", source: "website", status: "won", notes: "Signed $3.2k proposal. Kickoff booked." },
  { d: 28, name: "tom becker", email: "tom.becker@gmail.com", message: "hi", source: "website", status: "lost", notes: "No reply after two follow-ups." },
  { d: 27, name: "Aisha Khan", email: "aisha@brightwater-labs.example", company: "Brightwater Labs", role: "Head of Marketing", budget: "$12,000", message: "We need a product launch site and a pricing page by the end of the quarter. Can you send a proposal?", source: "linkedin", status: "qualified", notes: "Call done. Sending proposal Friday." },
  { d: 26, name: "carlos mendes", email: "carlos@mendesbuild.example", role: "Owner", phone: "+1 415 555 0142", budget: "5k", message: "Need quote for a construction company website asap", source: "google-ads", status: "won", notes: "Won: $5k website + $400/mo care plan." },
  { d: 25, name: "Priya Shah", email: "priya.shah@outlook.com", budget: "under 500", message: "Can you fix my WordPress theme?", source: "website", status: "lost", notes: "Too small for us; referred to a freelancer." },
  { d: 24, name: "Lena Fischer", email: "lena@northpeak-outdoors.example", company: "Northpeak Outdoors", role: "E-commerce lead", budget: "$8k-$10k", message: "Shopify store migration and new product pages. Timeline: 6 weeks.", source: "referral", status: "qualified" },
  { d: 23, name: "James O'Connor", email: "james@oconnor-legal.example", role: "Partner", budget: "$15k", message: "Redesign of our firm's website, with a client intake form. Please send pricing.", source: "website", status: "contacted", notes: "Left voicemail. Try again Tuesday." },
  { d: 22, name: "mei lin", email: "mei@lumenpilates.example", company: "Lumen Pilates", role: "Founder", budget: "2,500", message: "Class booking + membership site", source: "instagram", status: "won", notes: "Deposit paid." },
  { d: 21, name: "Rob Taylor", email: "rob.taylor@yahoo.com", message: "How much for a logo?", source: "website", status: "lost" },
  { d: 20, name: "Sofia Rossi", email: "sofia@casarossi-wines.example", company: "Casa Rossi Wines", role: "Director", phone: "+39 02 1234 5678", budget: "$6k", message: "Online shop for our wines, EU shipping. We'd like to start this month.", source: "referral", status: "contacted" },
  { d: 19, name: "Daniel Kim", email: "daniel@kimanalytics.example", role: "CTO", budget: "$20k", message: "Customer dashboard for our analytics product. Need a proposal and timeline.", source: "linkedin", status: "qualified", notes: "Technical call with their team on Thursday." },
  { d: 18, name: "emma clarke", email: "emma.clarke@hotmail.com", message: "Do you do social media management?", source: "website", status: "lost", notes: "Not a service we offer." },
  { d: 17, name: "Oliver Grant", email: "oliver@grant-physio.example", role: "Clinic owner", budget: "$1,500", message: "Simple site for a physio clinic", source: "google-ads", status: "contacted", slackDown: true },
  { d: 16, name: "Nadia Haddad", email: "nadia@cedarhealth.example", company: "Cedar Health", role: "VP Operations", budget: "$25k", message: "Patient portal integration with our booking system. Urgent: deadline in 8 weeks.", source: "referral", status: "qualified", notes: "Strong fit. Needs security questionnaire." },
  { d: 15, name: "Ben Carter", email: "ben@cartercoffee.example", company: "Carter Coffee", budget: "$3,000", message: "Website refresh and online ordering for 2 cafés.", source: "website", status: "contacted" },
  { d: 14, name: "Hannah Weiss", email: "HANNAH@larkspur-dental.example", phone: "+44 20 7946 0011", message: "Also interested in a care plan after launch.", source: "website" },
  { d: 13, name: "Grace Liu", email: "grace@liu-architects.example", role: "Principal", budget: "$9k", message: "Portfolio site for an architecture studio, with project case studies.", source: "referral", status: "contacted" },
  { d: 12, name: "marco silva", email: "marco.silva@gmail.com", budget: "$800", message: "Landing page for my podcast", source: "instagram", status: "lost" },
  { d: 11, name: "Isabelle Martin", email: "isabelle@maison-martin.example", company: "Maison Martin", role: "Co-founder", budget: "$7,500", message: "Brand + website for a new bakery opening in spring. Can you send a quote?", source: "website", status: "qualified" },
  { d: 10, name: "Kwame Mensah", email: "kwame@mensah-logistics.example", role: "Managing Director", phone: "+233 30 123 4567", budget: "$18k", message: "Quote for a customer tracking portal. We want to start quickly.", source: "linkedin", status: "contacted", notes: "Intro call booked for Monday." },
  { d: 9, name: "Zoe Adams", email: "zoe@adams-yoga.example", budget: "$1,200", message: "Booking page for yoga retreats", source: "google-ads", status: "contacted" },
  { d: 8, name: "Liam Murphy", email: "liam@murphyhvac.example", role: "Owner", budget: "$4k", message: "Need a new site that gets more calls. Current one is slow.", source: "google-ads", status: "new", slackDown: true },
  { d: 7, name: "Chloe Dubois", email: "chloe.dubois@gmail.com", message: "Do you have availability next month?", source: "website", status: "new" },
  { d: 6, name: "Ryan Patel", email: "ryan@patel-ventures.example", company: "Patel Ventures", role: "Partner", budget: "$30k", message: "Portfolio company needs a full rebuild. Proposal needed this week.", source: "referral", status: "new" },
  { d: 5, name: "Anna Kowalski", email: "anna@kowalski-design.example", budget: "$2k", message: "White-label development partner for our design agency", source: "linkedin", status: "new" },
  { d: 4, name: "Sam Rivera", email: "sam@riveraroofing.example", role: "Owner", phone: "(512) 555-0199", budget: "$3,500", message: "Website with quote request form asap", source: "google-ads", status: "new" },
  { d: 3, name: "Fatima Noor", email: "fatima@noor-skincare.example", company: "Noor Skincare", role: "Founder", budget: "$11k", message: "Shopify store with subscriptions. Launching in 10 weeks, need a proposal.", source: "instagram", status: "new" },
  { d: 3, name: "Jack Wilson", email: "jack.wilson@icloud.com", message: "price?", source: "website", status: "new" },
  { d: 2, name: "Elena Petrova", email: "elena@petrova-translations.example", role: "Director", budget: "$5,000", message: "Multilingual website (EN/DE/RU) with a quote calculator.", source: "website", status: "new" },
  { d: 2, name: "Aisha Khan", email: "aisha@brightwater-labs.example", message: "Following up: can we also include a blog? Budget is flexible.", source: "email" },
  { d: 1, name: "George Brown", email: "george@brown-accounting.example", role: "Senior Partner", budget: "$6k", message: "Client portal for document uploads. Urgent before tax season.", source: "referral", status: "new" },
  { d: 1, name: "Lucy Evans", email: "lucy.evans@outlook.com", budget: "$300", message: "Help with Squarespace", source: "website", status: "new" },
  { d: 0, name: "maria lopez", email: "Maria@Northwind.example", company: "Northwind", role: "Founder", budget: "$8k", message: "Need a quote asap for a CRM sync", source: "website", status: "new" },
];

// One spam submission and one invalid one, so the log shows how they're handled.
const EXTRA = [
  { d: 9, body: { name: "Best SEO", email: "seo@spam.example", website: "http://buy-links.example", message: "cheap backlinks" } },
  { d: 4, body: { name: "", email: "not-an-email", message: "test" } },
];

for (const l of [...LEADS.map((x) => ({ d: x.d, body: x as unknown as Record<string, unknown>, lead: x })), ...EXTRA.map((x) => ({ ...x, lead: undefined }))].sort((a, b) => b.d - a.d)) {
  const at = new Date(Date.now() - l.d * 86_400_000 - ((l.d * 37) % 9) * 3_600_000);
  slackDown = !!l.lead?.slackDown;
  const { d: _d, status: _s, notes: _n, slackDown: _sd, ...input } = l.body as In;
  const out = await processLead(input, { store, notifier, runs, now: () => at });
  if ((out.status === "created" || out.status === "updated") && l.lead?.status) {
    const fresh = (await store.findById(out.lead.id))!;
    await store.update({ ...fresh, status: l.lead.status, notes: l.lead.notes ?? fresh.notes });
  }
}

const all = await store.list();
console.log(`Demo data ready: ${all.length} leads, ${(await runs.list(5000)).length} pipeline runs.`);
await sql?.end();
