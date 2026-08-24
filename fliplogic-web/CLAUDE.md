# FlipLogic — Product Direction

FlipLogic is the acquisition decision layer that sits after a dealership's
existing appraisal tool (vAuto, AutoTrader, Dealertrack, CDK, PBS, Reynolds,
etc.) and before the buy decision is made. It does not try to replace those
tools on valuation — it turns appraisal data into a buying decision.

The question every screen answers is "Should I buy this vehicle, and what's
the max I can pay?" — not "what is this car worth?"

## Before building or approving anything

Ask: **Would this help a dealership buy inventory more profitably, or is it
simply another source of information?**

If a proposed feature is just more information — another data point, chart,
report, or integration — without changing the buy/negotiate/walk-away
verdict or the max price a dealer should pay, it doesn't belong here. Push
back or scope it down before building it.

## Also keep in mind

- Don't overbuild. Don't add unnecessary features. Don't turn this back
  into a full appraisal platform.
- Manual entry of appraisal data is the primary intake path (Phase 1).
  Importing from appraisal tools, CRM integration, PDF export, a dealer
  dashboard, auction batch analysis, and other API integrations are
  explicitly Phase 2 — don't build them unless asked.
- The primary UI is the Buy Decision Report: a top summary strip (Final
  Verdict, Max Safe Buy Price, Expected Gross Profit, Confidence Score,
  Risk Level) followed by Final Recommendation, Maximum Buy Number, Profit
  Calculation, Recon Estimate, Market Snapshot, Risk Factors, Confidence
  Explanation, Buyer Notes — in that order.

## Ideas parked for later

Directional notes, not commitments — evaluate against the standing filter
above before building either of these.

- **"Capital at Risk" framing.** Lead the report with an investment-decision
  summary instead of a pricing summary: Capital at Risk (= Max Safe Buy
  Price, reframed), Expected Gross Profit, Expected ROI%, Estimated Days to
  Sell, Confidence, and a plain-language "Why?" bullet list (demand, recon
  vs. target, price within safe range, gross vs. minimum, market support).
  Mostly a re-presentation of numbers the report already computes — ROI% is
  a cheap derivation (profit ÷ capital at risk), but Days to Sell needs a
  real basis (e.g. comp inventory age) before it ships, or it's a
  fabricated number that undermines trust in everything else on the report.

- **Dealership-specific learning.** Over time, learn a given dealership's
  own acquisition track record — which vehicle segments consistently
  produce above-average gross, sell fastest, sit too long, or lose money —
  and surface it as a recommendation ("this dealership performs 18% better
  on compact SUVs than midsize sedans"). Turns the product from
  market-data-driven to dealership-performance-driven, and gets more
  valuable (and harder to replace) the longer a dealership uses it. Needs
  enough closed-loop outcome data (actual sale price/time, not just the
  buy decision) per dealership before this is more than a guess — worth
  revisiting once there's a real base of completed deals to learn from.

- **"Gross Protected by Flip Logic" metric.** Track, per acquisition, the
  gap between what a manager originally intended to pay and Flip Logic's
  recommended maximum buy vs. the actual acquisition price — then roll it
  up into a monthly dashboard: acquisitions analyzed, overpayments avoided,
  total acquisition capital protected, projected incremental gross. Turns
  the product's value story from "a $750/month tool" into a concrete ROI
  number ("Flip Logic protected $28,450 this month"), which is a much
  harder thing to cancel than a subscription. Needs a captured "intended
  price" data point per acquisition (not just the final price) to compute
  the gap — likely a small addition to the manual-entry/capture flow, not
  just a reporting change.

  A cleaner variant of the same idea, needing no external "intended price"
  input at all: track whether the manager followed or overrode each BUY
  recommendation (a simple choice already implicit in what they actually
  paid vs. what Flip Logic said), and compare average front gross on
  followed vs. overridden deals. E.g. "126 recommendations this month, 48
  followed (avg. front gross $3,714), 19 overridden (avg. front gross
  $1,482) → $17,840 in gross protected." The comparison is entirely
  computable from data Flip Logic already has once outcome tracking
  exists (recommendation + actual acquisition price + eventual sale
  gross) — the open question is only how a manager's actual acquisition
  price gets back into the system per deal (manual follow-up entry,
  most likely, unless/until there's a closed-loop integration).
