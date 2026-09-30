# Dealer Social: subscription business plan

## 1. The offer in one sentence

For a flat monthly fee per rooftop, a dealership gets an AI social media manager. It posts the store's real
inventory to every network, answers comments and reviews, and hands hot leads to the sales team. It costs a
fraction of hiring someone or paying an agency.

## 2. Who buys it

| Segment | Pain | Best plan |
| --- | --- | --- |
| Independent used-car stores (1 rooftop) | Nobody has time for social. Pages go quiet for weeks. | Starter → Pro |
| Franchise dealers (1–3 rooftops) | A BDC or marketing coordinator is stretched thin, and posting is inconsistent and slow to follow inventory. | Pro |
| Dealer groups (4+ rooftops) | Brand consistency across stores. Agency invoices add up per rooftop. | Pro/Elite on every rooftop, with a group discount |

**The buyer** is usually the dealer principal, GM or marketing manager. **The daily user** is a BDC rep, marketing
coordinator or sales manager.

**Your unfair advantage:** you work inside a dealership, speak the language, and can run the first pilot at a
store you know. Only do that with your GM's written OK; see the launch checklist.

## 3. Pricing

| Plan | Monthly | Yearly (2 months free) | Anchor |
| --- | --- | --- | --- |
| Starter | **$149** | $1,490 | "Less than one car detail a week" |
| Pro (most popular) | **$299** | $2,990 | "A fraction of a part-time coordinator" |
| Elite | **$499** | $4,990 | High volume and priority support |

- **Per rooftop.** Each store has its own inventory, pages and subscription. Pricing scales with the customer.
- **14-day free trial of Pro, no card required.** Dealers see autopilot working before they're asked to pay.
- **Yearly plans** cost 10× the monthly price. Push them: cash up front and far lower churn.
- **Group discount** (sales-led, handled by Stripe coupons): 10% off for 3–4 rooftops, 15% for 5+.
- **Founding-dealer offer** for your first 20 customers: 30% off for life in exchange for a testimonial and a monthly
  15-minute feedback call. Create it as a Stripe coupon and share the promo code; checkout accepts codes.
- **Optional onboarding fee** of $299 (waived on yearly plans), for when you do the setup call yourself.

**Why dealers will pay it.** A part-time coordinator at 20 h/week × about $22/h costs roughly $1,900/month before
benefits, and still needs tools. $299/month is under a sixth of that. One extra car sold from a social lead
covers a year of Pro.

## 4. Unit economics (per dealership per month)

The costs below are **estimates to check with real data** after your pilot. The Anthropic console shows actual
spend, and `/admin` shows AI usage per dealership.

| Cost | Starter | Pro | Elite | Notes |
| --- | --- | --- | --- | --- |
| Claude, typical use | ~$3 | ~$10–20 | ~$25–50 | About $0.02 per AI post, $0.01 per inbox triage, $0.05 per assistant message (Opus 5.5 at $4/$20 per million tokens) |
| Claude, **worst case at plan caps** | ~$9 | ~$95 | ~$300 | The caps in `src/plans.js` bound your maximum cost |
| Stripe fees (2.9% + $0.30) | $4.62 | $8.97 | $14.77 | Lower with yearly billing |
| Hosting, email, backups | ~$1–2 | ~$1–2 | ~$1–2 | One server handles hundreds of dealerships |
| **Gross margin, typical** | **~94%** | **~91%** | **~89%** | |
| **Gross margin, worst case** | ~89% | ~64% | ~36% | Only if a dealer maxes out every limit |

To protect Elite's worst case, you can lower `aiChatTurnsPerMonth` in `src/plans.js`, or set `AI_MODEL` to a
cheaper Claude model for all AI work. Test the output quality before switching.

**Fixed monthly costs at launch:** hosting ~$25–100, email $0–20, insurance ~$100–200, X API paid tier (check
current pricing), domain and tools ~$50. That's about **$300–500/month**. **Break-even is 2 Pro dealerships.**

## 5. Revenue scenarios

The table assumes a blended ARPA (average revenue per account) of about $280/month after yearly discounts and
the plan mix, and churn of 2%/month.

| | Month 6 | Month 12 | Month 24 |
| --- | --- | --- | --- |
| Conservative (2 new dealers/month) | 12 dealers · $3.4k MRR | 22 · $6.2k MRR ($74k ARR) | 40 · $11k MRR ($134k ARR) |
| Base (4 new/month, groups from month 9) | 22 · $6.2k MRR | 50 · $14k MRR ($168k ARR) | 130 · $36k MRR ($437k ARR) |
| Ambitious (partner channel from month 6) | 30 · $8.4k MRR | 100 · $28k MRR ($336k ARR) | 300 · $84k MRR ($1M ARR) |

These are planning scenarios, not forecasts. Update them monthly with your real trial-to-paid rate and churn,
which `/admin` tracks.

## 6. Go-to-market: the first 50 dealerships

**Phase 1 (weeks 1–6): proof.**
1. Pilot at one store in Assist mode for 30 days. Track posts published, reach, leads flagged and the hours the manager saved.
2. Write a one-page case study with real screenshots and a quote from the GM.
3. Record a 2-minute demo video: Connect Facebook → import inventory → autopilot drafts a week of posts.

**Phase 2 (months 2–6): local and direct.**
1. **Your network first.** Other stores in your group, your OEM's regional dealer meetings, and managers you know at
   other franchises in the Maritimes. Warm intros convert 5–10× better than cold outreach.
2. **Walk-ins with a live demo.** Pull up their own Facebook page. If they haven't posted in 3 weeks, the problem sells itself.
   Offer to set up the trial on the spot with their inventory CSV.
3. **Dealer associations.** Sponsor or speak at provincial dealer association events; ask for a member discount page.
4. **Bilingual angle.** New Brunswick and Quebec dealers need French posts. Most tools handle it badly, and this one does it natively.
5. **Referral program.** One free month for both dealers on every paid referral. Dealers talk to each other constantly.

**Phase 3 (months 6–12): scale.**
1. **Dealer groups.** Sell to the group's marketing director with the multi-rooftop login and group discount.
2. **Channel partners.** Dealer website providers and inventory-feed vendors. Offer them 20% recurring revenue share on referrals.
3. **Agencies (white label).** Automotive agencies resell it to their clients. A future plan tier.
4. **Content marketing.** A weekly LinkedIn post from you: "What we learned posting 10,000 vehicles." Include the free trial link.

**The sales conversation (15 minutes):**
1. "When was your last post? Who does it?" (the pain)
2. Live demo on *their* inventory: studio → 3 posts in 20 seconds → approve → calendar. (the wow)
3. "Nothing goes out without your OK until you're ready." (removes the fear)
4. "One car a year pays for it. Try it free for 14 days — I'll set it up with you now." (the close)

## 7. Metrics that matter (see `/admin`)

| Metric | Target |
| --- | --- |
| Trial → paid conversion | 30%+ (sales-assisted), 10%+ (self-serve) |
| Activation: live account + inventory + first post within 3 days | 80% of trials |
| Monthly logo churn | under 2% |
| Share of yearly plans | 40%+ |
| Net revenue retention | 105%+ (upgrades and extra rooftops) |
| Posts published per dealer per week | 7+ (the habit that predicts retention) |

**Churn warning signs** (check weekly in `/admin`): 0 posts in 14 days, no live accounts, the last user login
more than 10 days ago, or a failed payment. Call those dealers personally.

## 8. Retention levers already in the product

- **Inventory feed sync plus autopilot.** Once it runs, turning it off means the page goes quiet again.
- **Leads flagged from comments and reviews.** It proves ROI in the dealer's own language (buyers).
- **Team seats.** More users make the product sticky.
- **Yearly plans.** Two months free makes them attractive.

## 9. Roadmap to raise price and reduce churn (build after launch)

1. **Lead forwarding to the dealer's CRM** (ADF/XML email, the auto industry standard). Hot leads land in their
   existing CRM automatically. *The first piece is already built: set a CRM lead email in Settings.*
2. **Monthly ROI email** to the GM: posts, reach, leads and top post. *Built: it goes out automatically on the 1st of each month.* Next step: add "cars sold that had social posts".
3. **Branded image overlays** (price banners, "SOLD" stamps) generated on vehicle photos.
4. **Short video from photos** for TikTok and Reels.
5. **Paid boosting** (Meta ads for aged inventory). It's a natural upsell with a revenue share.
6. **Agency and white-label tier.**

## 10. Risks and how to handle them

| Risk | Mitigation |
| --- | --- |
| Social platform approvals are slow (Meta, TikTok, LinkedIn) | Launch with Facebook, Instagram and Google first. Simulated mode lets trials continue meanwhile. |
| The AI writes something non-compliant (prices, APR, OEM rules) | Assist mode by default. The AI only uses inventory facts. The compliance line is added automatically. The terms make dealers responsible for approving. |
| API or platform changes | Adapters are isolated in `src/platforms/`, so a fix touches one file. |
| AI cost spikes | Plan caps limit usage, plus a spend limit in the Anthropic console. |
| Competition from bigger vendors | Win on price, speed of setup, the bilingual angle and local, personal service. Move upmarket with groups. |
| Key-person risk (you) | Documented launch checklist, a test suite and standard hosting make hiring help easy. |

## 11. Company setup (Canada)

Incorporate, open a business bank account, register for GST/HST, add Stripe Tax, have a lawyer review the privacy
policy and terms (PIPEDA / Quebec Law 25 / CASL), and buy tech E&O and cyber insurance before the first paying
customer. See `LAUNCH_CHECKLIST.md`.
