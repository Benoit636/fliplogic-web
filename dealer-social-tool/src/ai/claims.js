// Fact guard for captions: money amounts, percentages and financing/discount wording must come from the
// vehicle data or the offer the manager typed. AI copy that adds anything else is replaced by template copy.

const FINANCE_WORDS =
  /\b(financ\w*|leas(e|ing)|APR|taux|location|rebates?|rabais|cash ?back|remise|incentives?|discount\w*|escompte|bi-?weekly|aux deux semaines|per month|par mois|\/mo\b|down payment|mise de fonds|0 ?% |payments?\b|paiements?\b|mensualit\w*)/i;
const OFFER_FIELDS = ['payment', 'finance_offer', 'lease_offer', 'dealer_incentive'];

const toNumber = (s) => {
  let t = String(s).replace(/[\s  $]/g, '');
  t = /,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  const n = Number(t.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** Every "$1,234" / "1 234 $" / "1234,50 $" amount in a text. */
export function moneyAmounts(text) {
  const out = [];
  for (const m of String(text).matchAll(/\$\s?\d[\d,.   ]*\d|\$\s?\d|\d[\d,.   ]*\s?\$/g)) {
    const n = toNumber(m[0]);
    if (n != null && n > 0) out.push(n);
  }
  return out;
}
export const percentages = (text) => [...String(text).matchAll(/(\d+(?:[.,]\d+)?)\s?%/g)].map((m) => Number(m[1].replace(',', '.')));
const numbersIn = (text) => [...String(text ?? '').matchAll(/\d[\d,.   ]*/g)].map((m) => toNumber(m[0])).filter((n) => n != null);

/**
 * Claims in `content` that aren't backed by `facts` (the vehicle + offer details) or by the dealer's own fixed texts.
 * Returns a list of readable problems; empty means the caption only states known facts.
 */
export function unverifiedClaims(content, facts = {}, dealer = {}) {
  let text = String(content || '');
  // The dealer's own call to action, legal lines and phone are allowed as written.
  for (const own of [dealer.call_to_action, dealer.call_to_action_fr, dealer.compliance_notes, dealer.compliance_notes_fr, dealer.phone]) {
    if (own) text = text.split(own).join(' ');
  }
  const offerText = [...OFFER_FIELDS, 'notes', 'features'].map((k) => facts[k] || '').join(' ');
  const allowed = new Set([...numbersIn(offerText), ...['price', 'previous_price'].map((k) => toNumber(facts[k] ?? '')).filter(Boolean)]);
  const price = toNumber(facts.price ?? '');
  const was = toNumber(facts.previous_price ?? '');
  if (price && was && was > price) allowed.add(Math.round((was - price) * 100) / 100); // "you save $X"
  const problems = [];
  for (const n of moneyAmounts(text)) if (![...allowed].some((a) => Math.abs(a - n) < 0.01)) problems.push(`mentions $${n.toLocaleString('en-CA')}, which isn't in the vehicle data`);
  for (const p of percentages(text)) if (!numbersIn(offerText).includes(p)) problems.push(`mentions ${p}%, which isn't in the offer details`);
  const hasOffer = OFFER_FIELDS.some((k) => String(facts[k] || '').trim()) || FINANCE_WORDS.test(String(facts.notes || ''));
  if (!hasOffer) {
    const m = text.match(FINANCE_WORDS);
    if (m) problems.push(`mentions "${m[0].trim()}" but no financing, lease, payment or discount was given`);
  }
  return [...new Set(problems)];
}
