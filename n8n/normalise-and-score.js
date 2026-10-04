// n8n Code node ("Run Once for All Items"). Same rules as src/lead.ts and src/score.ts.
const FREE = new Set(["gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "yandex.com"]);
const titleCase = (s) => s.toLowerCase().split(/(\s+|-|')/).map((p) => (/^[a-z]/.test(p) ? p[0].toUpperCase() + p.slice(1) : p)).join("");
const budgetOf = (raw) => {
  if (!raw) return null;
  const nums = [...String(raw).toLowerCase().replace(/,/g, "").matchAll(/(\d+(?:\.\d+)?)\s*(k|m)?/g)]
    .map((m) => Number(m[1]) * (m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : 1));
  return nums.length ? Math.max(...nums) : null;
};
const phoneOf = (raw) => {
  if (!raw) return "";
  const t = String(raw).trim();
  const d = t.replace(/\D/g, "").replace(/^00/, "");
  if (d.length < 7 || d.length > 15) return "";
  return t.startsWith("+") || t.startsWith("00") ? `+${d}` : d;
};

return $input.all().map((item) => {
  const b = item.json.body ?? item.json;
  if (b.website) return { json: { valid: false, spam: true, errors: [] } };

  const errors = [];
  const name = String(b.name ?? "").replace(/\s+/g, " ").trim();
  const email = String(b.email ?? "").trim().toLowerCase();
  if (!name) errors.push("name: name is required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("email: email is not valid");
  if (errors.length) return { json: { valid: false, spam: false, errors } };

  const domain = email.split("@")[1];
  const free = FREE.has(domain);
  const company = String(b.company ?? "").trim() || (free ? "" : titleCase(domain.split(".").slice(0, -1).join(" ").replace(/[-_]/g, " ")));
  const budget = budgetOf(b.budget);
  const role = String(b.role ?? "").trim();
  const message = String(b.message ?? "").trim();
  const phone = phoneOf(b.phone);

  let score = 0;
  const reasons = [];
  const add = (n, why) => {
    score += n;
    reasons.push(`${n > 0 ? "+" : ""}${n} ${why}`);
  };
  if (free) add(-10, "free email address");
  else add(20, "company email domain");
  if (budget !== null) {
    if (budget >= 10000) add(35, "budget $10k+");
    else if (budget >= 2000) add(20, "budget $2k+");
    else if (budget >= 500) add(10, "budget $500+");
    else add(-5, "budget under $500");
  }
  if (/\b(ceo|cto|coo|cfo|founder|co-founder|owner|director|head|vp|president|partner)\b/i.test(role)) add(15, "decision-maker role");
  if (phone) add(5, "left a phone number");
  if (/\b(asap|urgent|this week|immediately|deadline|quickly)\b/i.test(message)) add(10, "urgent timeline");
  if (/\b(quote|pricing|price|proposal|budget|hire|contract|start)\b/i.test(message)) add(10, "buying intent in message");
  if (message.length > 0 && message.length < 15) add(-5, "very short message");
  const tier = score >= 50 ? "hot" : score >= 20 ? "warm" : "cold";

  return {
    json: {
      valid: true,
      spam: false,
      reasons,
      lead: {
        Name: titleCase(name), Email: email, Company: company, Phone: phone, Role: role,
        "Budget USD": budget ?? "", Message: message, Source: String(b.source ?? "web-form"),
        Score: score, Tier: tier, "Updated At": new Date().toISOString(),
      },
    },
  };
});
