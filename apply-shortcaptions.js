#!/usr/bin/env node
/**
 * apply-shortcaptions.js
 * ----------------------
 * One-shot patch. Adds a `shortCaption` to the 63 KAELUM company rows whose
 * `alt` was clipped mid-sentence (mostly the social-feed theme). Each line is
 * drawn from that row's own `caption` field, tightened to under 280 characters,
 * ending cleanly, and swept for the house rules (Ai not AI, no em dashes, no
 * standalone "regulated", KSC not KST, no "returns", British English).
 *
 * Matches rows by destination=kaelum + day + slot, so it is safe against minor
 * drift and only ever touches the intended 63 rows. The other 207 rows and all
 * existing fields are left exactly as they are.
 *
 * Usage:  node apply-shortcaptions.js
 * Then:   node verify-images.js   (still expects 0 missing)
 *         git add content-calendar.json && git commit ... && git pull --rebase && git push
 */

const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "content-calendar.json");

// key = "day-slot"  (KAELUM company rows only)
const SHORT = {
  "1-3": "The product is the explanation. No new world to learn, just spend, save and earn, governed entirely by K.A.T.E. in the background.",
  "6-3": "Trust engineered, not promised. Every transaction scored, scanned and signed off before settlement, governed by K.A.T.E. and our Compliance and Regulatory agent.",
  "9-1": "Plain English, not buried context, is what K.A.T.E.'s invoice intelligence surfaces from every transaction, removing the archaeology most finance teams have learned to tolerate.",
  "12-2": "Explainability as a design goal, not an afterthought. Every flow and payout mapping cleanly to the EMR and E-Money framework, governed by K.A.T.E. throughout.",
  "13-1": "A fixed cost, an upside tied genuinely to network growth. 2.5% commission paid monthly plus quarterly Circulation Growth Bonuses, governed by K.A.T.E. throughout.",
  "14-3": "Agentic Ai is not a speculative trend, it is where commerce infrastructure is genuinely heading, governed in KAELUM's case by K.A.T.E., 21 specialised agents powered exclusively by Claude. The only question is which side of that shift you are on.",
  "16-3": "Numbers showing up before the meeting rather than scrambled together for it describes a genuinely different operational reality, governed by K.A.T.E. across every transaction and counterparty.",
  "17-2": "Aligned incentives are easy to claim and rare to build into the actual mechanics of how a team gets paid. Agentic Payroll, governed by K.A.T.E., turns the slogan into a payslip.",
  "18-3": "No staking, no speculation, no hidden mechanic. Just commerce that pays back genuine participation, governed by K.A.T.E. That simplicity is what makes KAELUM trustworthy at the customer level.",
  "19-1": "Loyalty by design, not by promotion. 1.2% of every transaction automatically funding KPR, distributed quarterly to genuine active participants, governed by K.A.T.E.",
  "20-1": "Card network dominance is not a permanent feature of commerce, it is a historical accident never seriously challenged at scale. KAELUM, governed by K.A.T.E., is the challenge. The only question is whether your business is ahead of that shift or behind it.",
  "21-3": "2.5% commission, one owner per slot, no splits, no dilution. That is the structural clarity that makes early infrastructure ownership meaningful, governed by K.A.T.E. throughout.",
  "22-3": "Designed by Ai, governed by Ai, moving value at the speed of trust rather than speculation. Welcome to what comes next, a genuinely new category, not another entrant into an old one.",
  "23-2": "Not held back by branches, opening hours or paperwork. The Agentic Banking Suite, governed by K.A.T.E. with Claude Opus for high-stakes decisions, covers everything from account to M&A, genuinely Ai-first.",
  "23-3": "Asking first, every time, for every decision, is how good ideas die slowly inside organisations that mistake caution for diligence. KAELUM, governed by K.A.T.E., was built by deciding, shipping, then proving, in that order.",
  "26-3": "Settlement infrastructure, not a remittance product wearing different branding. Merchants paying merchants, creators paying collaborators, governed by K.A.T.E., borders stop functioning as a tax.",
  "27-1": "Owning commerce infrastructure or continuing to rent permission from card networks headquartered elsewhere is the actual decision facing Europe right now. KAELUM, governed by K.A.T.E., already made that decision and built the alternative.",
  "28-2": "A regulatory moat built from architecture, paired with an Ai governance engine handling compliance continuously. That combination, K.A.T.E. at the centre, is what makes KAELUM genuinely defensible.",
  "29-1": "Accepting infrastructure as fixed, card network fees, opaque settlement, intermediary control, is how businesses stop questioning a system never designed around them. KAELUM, governed by K.A.T.E., exists because we kept asking why.",
  "32-2": "A discount floor merchants can exceed but never undercut changes the entire dynamic of customer choice. For the first time, choosing well genuinely pays, governed by K.A.T.E. across every participating merchant.",
  "33-1": "One link, one discount, one closed-loop, the entire funnel collapsed into a single commerce primitive, governed by K.A.T.E. across both merchants and creators.",
  "36-2": "K.A.T.E. is not a layer sitting on top of the product, K.A.T.E. is the product. Compliance, fraud, pricing, payouts, every decision flows through Ai, genuinely Ai-native, not Ai-branded.",
  "36-3": "Fairer fees, real savings, an Ai that governs every transaction without favour. That is what KAELUM stands for, and now you can wear it. Style with an actual position behind it.",
  "39-1": "Borders stop being a tax when settlement infrastructure, not a remittance product, handles the friction. Merchants paying merchants, creators paying collaborators, governed by K.A.T.E. throughout.",
  "41-3": "Transparency is the feature, not an afterthought. KVI, updated in real time by K.A.T.E. using genuinely auditable signals, gives the public a live view of network health.",
  "43-2": "For the first time, choosing well genuinely pays. A 6% minimum, never lower, governed by K.A.T.E. across every participating merchant, structural, not promotional.",
  "44-2": "A collectible and an asset with utility are not the same thing, and that distinction is what KAELUM's Tessera marketplace was built around, every listing priced in KLM, governed by K.A.T.E.",
  "45-2": "Skepticism toward seven revenue streams is fair until you examine the structure: transaction fees, subscriptions, Tessera commissions, KSC fees, CLD registrations, redemption float and platform licensing, all governed by K.A.T.E.",
  "46-3": "The closed-loop expanding into monthly expenses through Bill Pay, every utility payment keeping value inside the ecosystem and the user active for the next KPR distribution, governed by K.A.T.E.",
  "47-2": "Lagarde echoed it. The FT printed it. Wero is years from merchant payments and the digital euro is further still. KAELUM, governed by K.A.T.E., is live now. The gap speaks for itself.",
  "48-3": "Built in by design, not promised for later. KAELUM's closed-loop architecture and MiCA pre-alignment, governed by K.A.T.E., are the foundation everything else is built on.",
  "50-3": "The contract becomes the workflow. Revenue splits, milestones and bonuses, encoded and enforced by K.A.T.E. through Programmable Commerce Contracts, escalating only what is genuinely unusual.",
  "52-3": "Cashflow as strategy, not a status update read once a month. K.A.T.E.'s Invoice to Insights turns billing flow into genuine intelligence, spotting patterns and flagging anomalies as they happen.",
  "53-2": "Priced in KLM, ready to spend immediately upon sale, governed by K.A.T.E. throughout the marketplace. A collectible with genuine utility, not just speculative trading.",
  "58-2": "A final gate built into the rail itself, not an audit performed after the fact. SENTINEL, governed by K.A.T.E., makes compliance a structural feature of every transaction, not a retrospective check.",
  "59-1": "A loyalty scheme rewards individual transactions. An economy rewards collective activity. KPR, governed by K.A.T.E. and distributed quarterly in KLM, is built around the second model entirely.",
  "61-2": "Loyalty that compounds with genuine participation rather than resets with a calendar date, governed by K.A.T.E. across every transaction. The more you spend, the more the network gives back.",
  "61-3": "Some brands chase trends. We are building infrastructure, and the merch reflects that: clean, confident, built to last longer than a single hype cycle.",
  "62-3": "Improving with every block of activity, not just executing the same rules repeatedly. K.A.T.E. is governance, not automation, purpose-built to operate a genuine digital commerce economy.",
  "63-1": "Open networks invite extraction, closed-loops protect value. KLM moving freely inside the ecosystem, never leaking outside it, governed by K.A.T.E., is what makes KAELUM both compliant and durable.",
  "65-3": "You just shop. K.A.T.E. handles the compliance, routing, fraud detection and maths in the background. Buy, spend, save 6% or more, earn quarterly. Genuinely that simple.",
  "66-3": "Smaller in the right way, no correspondent banks, one ledger, one regulatory framework, governed by K.A.T.E. throughout cross-border settlement.",
  "67-3": "Working for you, not for the bank, is the structural difference behind every product in the Agentic Banking Suite, governed by K.A.T.E. across credit, advances, payroll, receivables, treasury and M&A.",
  "68-3": "Deductions, reporting, audit trail, all handled automatically by K.A.T.E. Agentic Payroll turns a compliance headache into the cleanest payroll system in commerce, by design rather than accident.",
  "69-1": "Converting influence into ongoing commerce, not a single sponsored post. Every paylink a shop, every drop a campaign, governed by K.A.T.E. Creators on KAELUM build, they don't just earn once.",
  "69-3": "Skepticism toward new currency models is healthy, and we welcome it. What earns trust over time, governed by K.A.T.E., is the architecture holding up under scrutiny: the closed-loop design, the fixed rate, the transparent fees.",
  "73-1": "Engagement that finally gets accounted for properly, tracked and recognised by K.A.T.E. across the whole ecosystem, convertible into genuine upgrades and access.",
  "76-3": "One closed-loop, Ai-governed commerce currency, every Agentic Banking product working for the merchant, not extracting from them, governed by K.A.T.E.",
  "77-1": "Spend, save, earn, K.A.T.E. handles the rest. KAELUM was built to need no manual, the product explains itself.",
  "78-1": "Compliance, routing, fraud and maths, all governed by K.A.T.E. behind the scenes. You just shop, save and earn quarterly. The rest is handled.",
  "78-2": "There is a real difference between collecting points and being genuinely rewarded, and most loyalty schemes never let customers feel it. KAELUM's guaranteed discount, governed by K.A.T.E., is built so customers feel paid to shop, not patronised.",
  "79-1": "Creator Studio, Social Paylinks, Commerce Drops, PCC, Bill Pay, a genuine commerce stack, not an advertising platform wearing a creator-friendly label.",
  "81-3": "Cross-border commerce was always supposed to feel this straightforward. KKCS, governed by K.A.T.E., delivers it, no SWIFT delays, no correspondent friction, no fees hidden in the margin.",
  "82-3": "A team paid in KLM, spending in KLM, earning quarterly alongside the network they helped build. That is what aligned incentives look like when they are structural, not aspirational.",
  "83-2": "The more the network does, the more participants receive, governed by K.A.T.E. through quarterly KPR distributions. That is an economy, not a points scheme.",
  "84-1": "Every transaction, every counterparty, every margin shift, visible inside one Ai-governed view. K.A.T.E. makes the numbers ready before you need them, not after.",
  "85-1": "Fees baked into prices you never see itemised, that is the old model. KAELUM, governed by K.A.T.E., brings the saving home instead, commerce that finally feels fair.",
  "85-3": "Founders running traditional infrastructure worry about what happens while they are not watching. K.A.T.E., governing every transaction continuously and powered exclusively by Claude, removes a category of that worry entirely.",
  "86-3": "Monthly commission, quarterly growth bonuses, the upside genuinely belongs to the network, governed by K.A.T.E. across every KSC slot.",
  "87-2": "KLM is fiat-backed value moving on Ai-native rails, credited to accounts the way a bank credits one. Issued, the way finance has always worked.",
  "88-3": "From compliance to payouts, every decision flows through K.A.T.E., powered exclusively by Claude. This is what an Ai-native financial layer actually means.",
  "89-1": "Compliant and durable, the two properties a closed-loop architecture genuinely delivers, governed by K.A.T.E., that an open network structurally cannot.",
  "89-2": "The discipline behind KAELUM's architecture, 21 agents, closed-loop compliance, seven revenue streams, was built by doing, not by waiting for permission to start.",
};

function main() {
  if (!fs.existsSync(FILE)) { console.error("content-calendar.json not found. Run this from the repo root."); process.exit(1); }
  const rows = JSON.parse(fs.readFileSync(FILE, "utf8"));

  let applied = 0;
  const unmatched = [];
  for (const [key, caption] of Object.entries(SHORT)) {
    const [day, slot] = key.split("-").map(Number);
    const row = rows.find((r) =>
      String(r.destination).toLowerCase() === "kaelum" &&
      Number(r.day) === day && Number(r.slot) === slot);
    if (!row) { unmatched.push(key); continue; }
    row.shortCaption = caption;
    applied++;
  }

  // Compliance guardrails: refuse to write if any line breaks a house rule.
  const problems = [];
  for (const [key, c] of Object.entries(SHORT)) {
    if (c.length > 280) problems.push(`${key}: over 280 (${c.length})`);
    if (c.includes("\u2014")) problems.push(`${key}: em dash`);
    if (/\bAI\b/.test(c)) problems.push(`${key}: standalone "AI"`);
    if (/\bKST\b/.test(c)) problems.push(`${key}: "KST" should be "KSC"`);
    if (/\breturns\b/i.test(c)) problems.push(`${key}: "returns"`);
    if (/\bwallet\b/i.test(c)) problems.push(`${key}: "wallet"`);
    if (/\bminted\b/i.test(c)) problems.push(`${key}: "minted"`);
    if (!/[.!?"'\u2019)]$/.test(c.trim())) problems.push(`${key}: no terminal punctuation`);
  }
  if (problems.length) { console.error("Refusing to write, compliance issues:\n  " + problems.join("\n  ")); process.exit(1); }
  if (unmatched.length) { console.error("Refusing to write, no matching row for:\n  " + unmatched.join("\n  ")); process.exit(1); }

  fs.writeFileSync(FILE, JSON.stringify(rows, null, 2));
  console.log(`Applied ${applied} shortCaptions. content-calendar.json updated.`);
  console.log("Next: node verify-images.js  (expect 0 missing), then commit.");
}

main();
