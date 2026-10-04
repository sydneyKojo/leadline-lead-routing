// Builds lead-to-crm.workflow.json from normalise-and-score.js so the Code node never drifts.
// Run: node n8n/build-workflow.mjs
import { readFileSync, writeFileSync } from "node:fs";

const here = new URL(".", import.meta.url);
const jsCode = readFileSync(new URL("normalise-and-score.js", here), "utf8");
const sheet = {
  documentId: { __rl: true, mode: "id", value: "YOUR_GOOGLE_SHEET_ID" },
  sheetName: { __rl: true, mode: "name", value: "Leads" },
};
const L = "$('Normalise & score').item.json.lead";
const existing = "$('Find existing lead').item.json.Email";
const columns = ["Name", "Email", "Company", "Phone", "Role", "Budget USD", "Message", "Source", "Score", "Tier", "Updated At"];

const nodes = [
  {
    id: "1", name: "Lead webhook", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [0, 300], webhookId: "lead-to-crm",
    parameters: { httpMethod: "POST", path: "lead", authentication: "headerAuth", responseMode: "responseNode", options: {} },
  },
  { id: "2", name: "Normalise & score", type: "n8n-nodes-base.code", typeVersion: 2, position: [220, 300], parameters: { jsCode } },
  {
    id: "3", name: "Valid?", type: "n8n-nodes-base.if", typeVersion: 1, position: [440, 300],
    parameters: { conditions: { boolean: [{ value1: "={{ $json.valid }}", value2: true }] } },
  },
  {
    id: "4", name: "Reject", type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.1, position: [660, 480],
    parameters: {
      respondWith: "json",
      responseBody: '={{ JSON.stringify({ status: $json.spam ? "spam" : "rejected", errors: $json.errors }) }}',
      options: { responseCode: 422 },
    },
  },
  {
    id: "5", name: "Find existing lead", type: "n8n-nodes-base.googleSheets", typeVersion: 4.5, position: [660, 200], alwaysOutputData: true,
    parameters: {
      operation: "read", ...sheet,
      filtersUI: { values: [{ lookupColumn: "Email", lookupValue: "={{ $json.lead.Email }}" }] },
      options: {},
    },
  },
  {
    id: "6", name: "Upsert in Sheets", type: "n8n-nodes-base.googleSheets", typeVersion: 4.5, position: [880, 200],
    parameters: {
      operation: "appendOrUpdate", ...sheet,
      columns: {
        mappingMode: "defineBelow",
        matchingColumns: ["Email"],
        value: Object.fromEntries(columns.map((k) => [k, `={{ ${L}[${JSON.stringify(k)}] }}`])),
      },
      options: {},
    },
  },
  {
    id: "7", name: "Slack alert", type: "n8n-nodes-base.slack", typeVersion: 2.2, position: [1100, 200],
    parameters: {
      select: "channel",
      channelId: { __rl: true, mode: "name", value: "#leads" },
      text:
        `={{ ${L}.Tier === "hot" ? ":fire:" : ${L}.Tier === "warm" ? ":sunny:" : ":snowflake:" }} ` +
        `{{ ${existing} ? "Returning" : "New" }} {{ ${L}.Tier }} lead (score {{ ${L}.Score }}): *{{ ${L}.Name }}*` +
        `{{ ${L}.Company ? " at " + ${L}.Company : "" }}\n{{ ${L}.Email }} · via {{ ${L}.Source }}\n> {{ ${L}.Message.slice(0, 280) }}`,
      otherOptions: {},
    },
  },
  {
    id: "8", name: "New lead?", type: "n8n-nodes-base.if", typeVersion: 1, position: [1320, 200],
    parameters: { conditions: { string: [{ value1: `={{ ${existing} ?? "" }}`, operation: "isEmpty" }] } },
  },
  {
    id: "9", name: "Follow-up email", type: "n8n-nodes-base.gmail", typeVersion: 2.1, position: [1540, 120],
    parameters: {
      sendTo: `={{ ${L}.Email }}`,
      subject: `=Thanks for reaching out{{ ${L}.Company ? ", " + ${L}.Company : "" }}`,
      emailType: "text",
      message:
        `=Hi {{ ${L}.Name.split(" ")[0] }},\n\nThanks for getting in touch. We've received your request.\n\n` +
        `{{ ${L}.Tier === "hot" ? "I'd like to set up a 20-minute call this week. Reply with a time that suits you." : ` +
        `"I'll review the details and come back to you within one business day with next steps." }}\n\nBest regards,\nThe team`,
      options: {},
    },
  },
  {
    id: "10", name: "Respond OK", type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.1, position: [1760, 200],
    parameters: { respondWith: "json", responseBody: `={{ JSON.stringify({ status: "ok", tier: ${L}.Tier, score: ${L}.Score }) }}`, options: {} },
  },
];

const to = (node) => [{ node, type: "main", index: 0 }];
const workflow = {
  name: "Lead to CRM (Sheets + Slack + Gmail)",
  nodes,
  connections: {
    "Lead webhook": { main: [to("Normalise & score")] },
    "Normalise & score": { main: [to("Valid?")] },
    "Valid?": { main: [to("Find existing lead"), to("Reject")] },
    "Find existing lead": { main: [to("Upsert in Sheets")] },
    "Upsert in Sheets": { main: [to("Slack alert")] },
    "Slack alert": { main: [to("New lead?")] },
    "New lead?": { main: [to("Follow-up email"), to("Respond OK")] },
    "Follow-up email": { main: [to("Respond OK")] },
  },
  settings: { executionOrder: "v1" },
  pinData: {},
};

writeFileSync(new URL("lead-to-crm.workflow.json", here), JSON.stringify(workflow, null, 2) + "\n");
console.log("wrote n8n/lead-to-crm.workflow.json");
