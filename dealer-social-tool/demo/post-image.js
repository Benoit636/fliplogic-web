// Branded post images, drawn in the browser on a <canvas> and saved as PNG.
// Same code on desktop and iPhone; photos must be same-origin (/media/…) or data: URLs so the PNG can be exported.

export const TEMPLATES = [
  { key: 'showcase', label: 'Showcase' },
  { key: 'bold', label: 'Bold' },
  { key: 'clean', label: 'Clean' },
];
export const SIZES = {
  square: { w: 1080, h: 1080, label: 'Square', hint: 'Facebook, Instagram, LinkedIn' },
  portrait: { w: 1080, h: 1350, label: 'Portrait', hint: 'Instagram feed' },
  story: { w: 1080, h: 1920, label: 'Story', hint: 'Stories & Reels' },
};

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", "Segoe UI", Roboto, Arial, sans-serif';
const clean = (v) => String(v ?? '').trim();
const num = (v) => {
  const n = Number(clean(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const money = (v, lang) => {
  const n = num(v);
  if (n == null) return clean(v);
  return lang === 'fr' ? `${n.toLocaleString('fr-CA', { maximumFractionDigits: 0 })} $` : `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
};
const website = (url) => clean(url).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');

/** Hex colour → rgba() with alpha; falls back to Volkswagen-style dark blue. */
function rgba(hex, a = 1) {
  const m = /^#?([0-9a-f]{6})$/i.exec(clean(hex));
  const n = parseInt(m ? m[1] : '001e50', 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export async function loadImage(src) {
  if (!src) return null;
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  try {
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw an image to fill a box (like CSS object-fit: cover). */
function cover(ctx, img, x, y, w, h, radius = 0) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  ctx.save();
  if (radius) {
    roundRect(ctx, x, y, w, h, radius);
    ctx.clip();
  }
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
}

/** Fit an image inside a box (object-fit: contain), aligned left or right. */
function contain(ctx, img, x, y, w, h, align = 'left') {
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = align === 'right' ? x + w - dw : align === 'center' ? x + (w - dw) / 2 : x;
  ctx.drawImage(img, dx, y + (h - dh) / 2, dw, dh);
  return dw;
}

/** Wrap text to a width; shrinks the font (down to minSize) to fit maxLines. Returns the height used. */
function text(ctx, str, x, y, { size, weight = 700, color = '#fff', maxWidth, maxLines = 2, minSize = size * 0.6, lineHeight = 1.12, align = 'left', spacing = 0 }) {
  str = clean(str);
  if (!str) return 0;
  let s = size;
  let lines;
  for (;;) {
    ctx.font = `${weight} ${s}px ${FONT}`;
    lines = [];
    let line = '';
    for (const word of str.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
    if (lines.length <= maxLines || s <= minSize) break;
    s = Math.max(minSize, s - 4);
  }
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    while (ctx.measureText(`${lines[maxLines - 1]}…`).width > maxWidth && lines[maxLines - 1].length > 1) lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1);
    lines[maxLines - 1] += '…';
  }
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * s * lineHeight));
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  return lines.length * s * lineHeight;
}

function pill(ctx, label, x, y, { size, bg, color, padX = size * 0.7, padY = size * 0.42, weight = 800, spacing = 2, alignRight = false }) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  const w = ctx.measureText(label).width + padX * 2;
  const h = size + padY * 2;
  const px = alignRight ? x - w : x;
  ctx.fillStyle = bg;
  roundRect(ctx, px, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, px + padX, y + h / 2 + size * 0.04);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  return { w, h };
}

/** What goes on the image, worked out from the post goal, the details and the language. */
export function imageContent({ objectiveKey, labels, details: d = {}, dealer = {}, language = 'en' }) {
  const langs = language === 'bilingual' ? ['en', 'fr'] : [language === 'fr' ? 'fr' : 'en'];
  const main = langs[0];
  const label = labels?.[objectiveKey] || { en: 'Now available', fr: 'Maintenant disponible' };
  const unit = dealer.distance_unit || 'km';
  const km = num(d.mileage) != null ? `${num(d.mileage).toLocaleString(main === 'fr' ? 'fr-CA' : 'en-US')} ${unit}` : '';
  let price = '';
  let was = '';
  let priceNote = '';
  if (objectiveKey === 'new_monthly_offer' && clean(d.payment)) price = clean(d.payment);
  else if (objectiveKey === 'new_monthly_offer' && clean(d.finance_offer)) price = clean(d.finance_offer);
  else if (objectiveKey === 'new_monthly_offer' && clean(d.lease_offer)) price = clean(d.lease_offer);
  else if (clean(d.price)) price = money(d.price, main);
  if (num(d.previous_price) && num(d.price) && num(d.previous_price) > num(d.price)) was = money(d.previous_price, main);
  if (objectiveKey === 'new_model_spotlight' && price) priceNote = main === 'fr' ? 'À partir de' : 'Starting at';
  if (objectiveKey === 'new_trade_up_event' && clean(d.dealer_incentive)) price = clean(d.dealer_incentive);
  const pricing = !!(price || was || clean(d.payment) || clean(d.finance_offer) || clean(d.lease_offer) || clean(d.dealer_incentive));
  const compliance = pricing
    ? langs
        .map((l) => clean(l === 'fr' ? dealer.compliance_notes_fr : dealer.compliance_notes))
        .filter(Boolean)
        .join(' / ')
    : '';
  const title = [d.year, d.make, d.model].map(clean).filter(Boolean).join(' ') || (main === 'fr' ? 'Venez nous voir' : 'Come see us');
  return {
    headline: label[main],
    subheadline: langs.length > 1 ? label.fr : '',
    title,
    trim: clean(d.trim),
    price,
    was,
    priceNote,
    facts: [km, clean(d.exterior_color), clean(d.stock_number) && `${main === 'fr' ? 'Stock' : 'Stock'} #${clean(d.stock_number)}`].filter(Boolean),
    compliance,
    dealerName: clean(dealer.name),
    contact: [clean(dealer.phone), website(dealer.website)].filter(Boolean).join('  •  '),
  };
}

/** Render a post image. Returns the canvas (use canvasToPng to export). */
export async function renderPostImage({ template = 'showcase', size = 'square', content, dealer = {}, photo = null, logo = null }) {
  const { w: W, h: H } = SIZES[size] || SIZES.square;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (document.fonts?.ready) await document.fonts.ready;
  const brand = clean(dealer.brand_color) || '#001E50';
  const accent = clean(dealer.accent_color) || '#0071E3';
  const c = content;
  const pad = Math.round(W * 0.065);
  const story = H / W > 1.6;

  if (template === 'bold') {
    // Brand-colour background, big headline, framed photo, price chip.
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, rgba(brand, 1));
    grad.addColorStop(1, rgba(brand, 0.86));
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    let y = pad + (story ? H * 0.06 : 0);
    y += text(ctx, c.headline.toUpperCase(), pad, y, { size: 92, weight: 900, maxWidth: W - pad * 2, maxLines: 2, spacing: 1 });
    if (c.subheadline) y += 6 + text(ctx, c.subheadline.toUpperCase(), pad, y + 6, { size: 40, weight: 700, color: 'rgba(255,255,255,0.75)', maxWidth: W - pad * 2, maxLines: 1, spacing: 2 });
    y += pad * 0.55;
    const footerH = 150;
    const textBlock = 250 + (c.compliance ? 40 : 0);
    const photoH = Math.max(H * 0.3, H - y - textBlock - footerH - pad);
    if (photo) cover(ctx, photo, pad, y, W - pad * 2, photoH, 36);
    else {
      // No photo yet: the dealership's logo on a white panel.
      ctx.fillStyle = logo ? '#ffffff' : 'rgba(255,255,255,0.1)';
      roundRect(ctx, pad, y, W - pad * 2, photoH, 36);
      ctx.fill();
      if (logo) contain(ctx, logo, W * 0.2, y + photoH * 0.25, W * 0.6, photoH * 0.5, 'center');
    }
    y += photoH + pad * 0.5;
    y += text(ctx, c.title, pad, y, { size: 64, weight: 800, maxWidth: W - pad * 2, maxLines: 1, minSize: 40 });
    if (c.trim) y += text(ctx, c.trim, pad, y + 4, { size: 38, weight: 500, color: 'rgba(255,255,255,0.78)', maxWidth: W - pad * 2, maxLines: 1 }) + 4;
    if (c.price) {
      const chip = pill(ctx, `${c.priceNote ? `${c.priceNote} ` : ''}${c.price}`, pad, y + 18, { size: 54, bg: '#fff', color: brand, padX: 30, padY: 16, spacing: 0 });
      if (c.was) {
        ctx.font = `600 38px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.textBaseline = 'middle';
        const wx = pad + chip.w + 26;
        const wy = y + 18 + chip.h / 2;
        ctx.fillText(c.was, wx, wy);
        const ww = ctx.measureText(c.was).width;
        ctx.fillRect(wx, wy - 2, ww, 4);
      }
    }
    drawFooter(ctx, { W, H, pad, logo, c, bg: 'rgba(0,0,0,0.22)', color: '#fff', height: footerH });
    if (c.compliance) text(ctx, c.compliance, pad, H - footerH - 44, { size: 24, weight: 500, color: 'rgba(255,255,255,0.7)', maxWidth: W - pad * 2, maxLines: 1, minSize: 18 });
  } else if (template === 'clean') {
    // White card: photo on top, details below, price above the footer, brand accents.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    const footerH = 150;
    const complianceH = c.compliance ? 46 : 0;
    const priceH = c.price ? (c.priceNote ? 140 : 104) : 0;
    ctx.font = `800 68px ${FONT}`;
    const titleLines = ctx.measureText(c.title).width > W - pad * 2 ? 2 : 1;
    const textH = (c.subheadline ? 40 : 0) + titleLines * 76 + (c.trim ? 50 : 0) + (c.facts.length ? 52 : 0);
    const photoH = Math.round(Math.min(H * 0.62, Math.max(H * 0.3, H - footerH - complianceH - priceH - textH - pad * 1.4)));
    if (photo) cover(ctx, photo, 0, 0, W, photoH);
    else {
      ctx.fillStyle = rgba(brand, 0.1);
      ctx.fillRect(0, 0, W, photoH);
      if (logo) contain(ctx, logo, W * 0.2, photoH * 0.3, W * 0.6, photoH * 0.4, 'center');
    }
    pill(ctx, c.headline.toUpperCase(), pad, pad, { size: 34, bg: accent, color: '#fff' });
    let y = photoH + pad * 0.6;
    if (c.subheadline) y += text(ctx, c.subheadline.toUpperCase(), pad, y, { size: 28, weight: 800, color: accent, maxWidth: W - pad * 2, maxLines: 1, spacing: 2 }) + 6;
    y += text(ctx, c.title, pad, y, { size: 68, weight: 800, color: '#111', maxWidth: W - pad * 2, maxLines: 2, minSize: 44 });
    if (c.trim) y += text(ctx, c.trim, pad, y + 4, { size: 38, weight: 500, color: '#6e6e73', maxWidth: W - pad * 2, maxLines: 1 }) + 6;
    if (c.facts.length) y += text(ctx, c.facts.join('  •  '), pad, y + 10, { size: 32, weight: 500, color: '#6e6e73', maxWidth: W - pad * 2, maxLines: 1, minSize: 24 }) + 10;
    if (c.price) {
      let py = Math.min(y + 24, H - footerH - complianceH - priceH);
      if (c.priceNote) py += text(ctx, c.priceNote, pad, py, { size: 30, weight: 600, color: '#6e6e73', maxWidth: W, maxLines: 1 });
      text(ctx, c.price, pad, py, { size: 84, weight: 900, color: brand, maxWidth: W - pad * 2 - 260, maxLines: 1, minSize: 48 });
      if (c.was) {
        ctx.font = `600 40px ${FONT}`;
        const ww = ctx.measureText(c.was).width;
        const wx = W - pad - ww;
        ctx.fillStyle = '#8e8e93';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillText(c.was, wx, py + 30);
        ctx.fillRect(wx, py + 52, ww, 4);
      }
    }
    ctx.fillStyle = '#e5e5ea';
    ctx.fillRect(pad, H - footerH, W - pad * 2, 2);
    drawFooter(ctx, { W, H, pad, logo, c, bg: null, color: '#1d1d1f', height: footerH - 2 });
    if (c.compliance) text(ctx, c.compliance, pad, H - footerH - 38, { size: 22, weight: 500, color: '#8e8e93', maxWidth: W - pad * 2, maxLines: 1, minSize: 16 });
  } else {
    // Showcase: full-bleed photo with the story on a gradient.
    if (photo) cover(ctx, photo, 0, 0, W, H);
    else {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, rgba(brand, 1));
      g.addColorStop(1, '#000');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    const shade = ctx.createLinearGradient(0, H * 0.38, 0, H);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(0.55, 'rgba(0,0,0,0.62)');
    shade.addColorStop(1, 'rgba(0,0,0,0.88)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, H * 0.38, W, H * 0.62);
    const top = ctx.createLinearGradient(0, 0, 0, 220);
    top.addColorStop(0, 'rgba(0,0,0,0.35)');
    top.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, 220);
    const topY = pad + (story ? 90 : 0);
    if (logo) {
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      roundRect(ctx, pad, topY, 300, 110, 26);
      ctx.fill();
      contain(ctx, logo, pad + 22, topY + 16, 256, 78, 'center');
    } else if (c.dealerName) pill(ctx, c.dealerName, pad, topY, { size: 34, bg: 'rgba(255,255,255,0.94)', color: '#111', spacing: 0, weight: 700 });
    const tag = pill(ctx, c.headline.toUpperCase(), W - pad, topY + (logo ? 22 : 0), { size: 34, bg: accent, color: '#fff', alignRight: true });
    if (c.subheadline) {
      ctx.font = `700 26px ${FONT}`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 12;
      ctx.fillText(c.subheadline.toUpperCase(), W - pad - 6, topY + (logo ? 22 : 0) + tag.h + 12);
      ctx.shadowBlur = 0;
    }
    const footerH = 112;
    // Measure the text block from the bottom up.
    let y = H - footerH - pad * 0.7 - (c.compliance ? 40 : 0);
    const blocks = [];
    if (c.price) blocks.push({ h: 104, draw: (by) => {
      let x = pad;
      ctx.textAlign = 'left';
      if (c.priceNote) {
        ctx.font = `600 34px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.fillText(c.priceNote, x, by + 88);
        x += ctx.measureText(c.priceNote).width + 16;
      }
      ctx.font = `900 92px ${FONT}`;
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(c.price, x, by + 90);
      x += ctx.measureText(c.price).width + 24;
      if (c.was) {
        ctx.font = `600 42px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.72)';
        ctx.fillText(c.was, x, by + 86);
        ctx.fillRect(x, by + 70, ctx.measureText(c.was).width, 4);
      }
    } });
    if (c.facts.length) blocks.push({ h: 56, draw: (by) => text(ctx, c.facts.join('  •  '), pad, by + 8, { size: 34, weight: 500, color: 'rgba(255,255,255,0.85)', maxWidth: W - pad * 2, maxLines: 1, minSize: 24 }) });
    if (c.trim) blocks.push({ h: 54, draw: (by) => text(ctx, c.trim, pad, by + 4, { size: 40, weight: 500, color: 'rgba(255,255,255,0.85)', maxWidth: W - pad * 2, maxLines: 1 }) });
    ctx.font = `800 76px ${FONT}`;
    const twoLines = ctx.measureText(c.title).width > W - pad * 2;
    blocks.push({ h: twoLines ? 172 : 90, draw: (by) => text(ctx, c.title, pad, by, { size: 76, weight: 800, maxWidth: W - pad * 2, maxLines: 2, minSize: 52 }) });
    for (const b of blocks) {
      y -= b.h;
      b.draw(y);
    }
    if (c.compliance) text(ctx, c.compliance, pad, H - footerH - 44, { size: 24, weight: 500, color: 'rgba(255,255,255,0.72)', maxWidth: W - pad * 2, maxLines: 1, minSize: 18 });
    drawFooter(ctx, { W, H, pad, logo: null, c, bg: rgba(brand, 0.96), color: '#fff', height: footerH, nameIfNoLogo: true });
  }
  return canvas;
}

function drawFooter(ctx, { W, H, pad, logo, c, bg, color, height, nameIfNoLogo = false }) {
  const y = H - height;
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, y, W, height);
  }
  let left = pad;
  if (logo) {
    const boxH = height * 0.56;
    if (bg) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      roundRect(ctx, pad, y + (height - boxH - 24) / 2, 260, boxH + 24, 18);
      ctx.fill();
      left += contain(ctx, logo, pad + 16, y + (height - boxH) / 2, 228, boxH, 'center') ? 260 + 28 : 0;
    } else left += contain(ctx, logo, pad, y + (height - boxH) / 2, 300, boxH) + 28;
  } else if (c.dealerName && (nameIfNoLogo || !logo)) {
    ctx.font = `800 34px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.dealerName, pad, y + height / 2);
    left += ctx.measureText(c.dealerName).width + 28;
  }
  if (c.contact) {
    ctx.font = `600 30px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    let label = c.contact;
    while (ctx.measureText(label).width > W - pad - left && label.includes('•')) label = label.split('  •  ')[0];
    ctx.fillText(label, W - pad, y + height / 2);
  }
}

export const canvasToPng = (canvas) => new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image'))), 'image/png'));

/** Save on desktop (download) or iPhone (share sheet → Save Image), with a download fallback. */
export async function savePng(blob, filename) {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}
