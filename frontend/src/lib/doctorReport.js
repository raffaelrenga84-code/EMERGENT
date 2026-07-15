// doctorReport — genera un report sanitario A4-style come immagine PNG
// (canvas) pronta da condividere col medico via WhatsApp/email/share sheet.
//
// Include: anagrafica, grafici andamento 30 giorni (pressione + peso),
// profilo medico, terapia in corso, diario recente e — nell'angolo in
// basso a destra — il branding FAMMY con QR code verso il sito (viral loop).

import QRCode from 'qrcode';
import { activeTimesForToday } from './medSchedule.js';
import { toLocalYMD } from './dateUtils.js';
import { bpDailyAvg, getBpReadings, isBpHigh, BP_SYS_LIMIT, BP_DIA_LIMIT } from './bp.js';

const W = 1240;        // larghezza canvas (A4-ish @150dpi)
const M = 70;          // margine
const INK = '#2C302A';
const MUTED = '#6E7269';
const ACCENT = '#C1624B';
const LINE = '#E5E1D8';
const SOFT = '#F7F5F0';
const ALERT = '#C0392B';   // rosso per valori pressione fuori soglia

const FONT = (size, weight = 400) =>
  `${weight} ${size}px -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif`;

export async function generateDoctorReport({ member, profile, meds, diary, t }) {
  // diary: array ASC per data (ultimi 30 giorni)
  const work = document.createElement('canvas');
  work.width = W;
  work.height = 3600;
  const ctx = work.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, work.height);

  let y = 90;

  const hr = (pad = 0) => {
    ctx.strokeStyle = LINE; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(M, y + pad); ctx.lineTo(W - M, y + pad); ctx.stroke();
    y += pad + 2;
  };
  const section = (title) => {
    y += 26;
    ctx.fillStyle = ACCENT; ctx.font = FONT(24, 800);
    ctx.fillText(title.toUpperCase(), M, y);
    y += 14; hr(); y += 34;
  };
  const wrapText = (text, x, maxW, lineH, fontSpec, color) => {
    ctx.font = fontSpec; ctx.fillStyle = color;
    const words = String(text).split(/\s+/);
    let lineStr = '';
    for (const w of words) {
      const probe = lineStr ? `${lineStr} ${w}` : w;
      if (ctx.measureText(probe).width > maxW && lineStr) {
        ctx.fillText(lineStr, x, y); y += lineH; lineStr = w;
      } else lineStr = probe;
    }
    if (lineStr) { ctx.fillText(lineStr, x, y); y += lineH; }
  };
  const field = (label, value) => {
    if (!value) return;
    wrapText(`${label}: ${value}`, M, W - 2 * M, 34, FONT(24), INK);
    y += 4;
  };
  // Come wrapText, ma con segmenti colorati (per evidenziare valori anomali)
  const wrapSegments = (segs, x, maxW, lineH) => {
    let cx = x;
    for (const seg of segs) {
      ctx.font = seg.font || FONT(23);
      ctx.fillStyle = seg.color || INK;
      for (const w of String(seg.text).split(/\s+/).filter(Boolean)) {
        const pw = ctx.measureText(w).width;
        const sp = ctx.measureText(' ').width;
        if (cx > x && cx + pw > x + maxW) { y += lineH; cx = x; }
        ctx.fillText(w, cx, y);
        cx += pw + sp;
      }
    }
    y += lineH;
  };

  // ---------- HEADER ----------
  ctx.fillStyle = ACCENT; ctx.font = FONT(36, 800);
  ctx.fillText('🏡 FAMMY', M, y);
  ctx.fillStyle = MUTED; ctx.font = FONT(22);
  const todayStr = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  ctx.fillText(todayStr, W - M - ctx.measureText(todayStr).width, y);
  y += 58;
  ctx.fillStyle = INK; ctx.font = FONT(46, 800);
  ctx.fillText(t('crs_title') || 'Report sanitario', M, y);
  y += 46;
  ctx.font = FONT(30, 700);
  const sub = `👤 ${member.name}` +
    ((member.birth_date || member.birthday) ? `   ·   🎂 ${new Date(String(member.birth_date || member.birthday) + 'T12:00:00').toLocaleDateString()}` : '');
  ctx.fillText(sub, M, y);
  y += 22; hr(8);

  // ---------- GRAFICI 30 GIORNI ----------
  // Più misurazioni/giorno → il grafico usa la media giornaliera
  const bpData = diary
    .map((d) => ({ x: d.diary_date, avg: bpDailyAvg(d) }))
    .filter((p) => p.avg);
  const wData = diary.filter((d) => d.weight_kg != null);
  if (bpData.length >= 2 || wData.length >= 2) {
    section(`📈 ${t('ht_title') || 'Andamento ultimi 30 giorni'}`);
    const chartW = (W - 2 * M - 40) / 2;
    const chartH = 240;
    const cy = y;
    if (bpData.length >= 2) {
      drawChart(ctx, M, cy, chartW, chartH, t('ht_bp') || 'Pressione (mmHg)', [
        { color: '#C1624B', limit: BP_SYS_LIMIT, pts: bpData.map((p) => ({ x: p.x, v: p.avg.sys })) },
        { color: '#4A7B9D', limit: BP_DIA_LIMIT, pts: bpData.map((p) => ({ x: p.x, v: p.avg.dia })) },
      ]);
    }
    if (wData.length >= 2) {
      drawChart(ctx, M + chartW + 40, cy, chartW, chartH, t('ht_weight') || 'Peso (kg)', [
        { color: '#5B8C5A', pts: wData.map((d) => ({ x: d.diary_date, v: d.weight_kg })) },
      ]);
    }
    y = cy + chartH + 30;
  }

  // ---------- PROFILO MEDICO ----------
  if (profile) {
    section(`🩺 ${t('crs_section_profile') || 'Profilo medico'}`);
    field(`🩸 ${t('mp_blood_type') || 'Gruppo sanguigno'}`, profile.blood_type);
    field(`💊 ${t('mp_allergies_label') || 'Allergie farmaci'}`, profile.allergies?.length ? profile.allergies.join(', ') : null);
    field(`🥗 ${t('mp_food_label') || 'Allergie alimentari'}`, profile.food_intolerances?.length ? profile.food_intolerances.join(', ') : null);
    field(`📋 ${t('mp_conditions_label') || 'Patologie'}`, profile.conditions);
    field(`🚨 ${t('mp_emergency_contact') || 'Emergenza'}`,
      (profile.emergency_contact_name || profile.emergency_contact_phone)
        ? `${profile.emergency_contact_name || ''}${profile.emergency_contact_relation ? ` (${profile.emergency_contact_relation})` : ''} ${profile.emergency_contact_phone || ''}`.trim()
        : null);
    field(`🩺 ${t('mp_doctor_h') || 'Medico'}`,
      (profile.doctor_name || profile.doctor_phone) ? `${profile.doctor_name || ''} ${profile.doctor_phone || ''}`.trim() : null);
    field(`🆔 ${t('mp_health_card_label') || 'Tessera sanitaria'}`, profile.health_card_number);
    if (profile.notes) field(`📝 ${t('dd_notes_label') || 'Note'}`, profile.notes);
  }

  // ---------- TERAPIA ----------
  if (meds.length > 0) {
    section(`💊 ${t('crs_section_meds') || 'Terapia in corso'}`);
    const today = toLocalYMD(new Date());
    const fmtD = (ymd) => new Date(ymd + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    for (const m of meds) {
      const times = activeTimesForToday(m, today);
      const timesStr = times.length > 0 ? times.map((x) => `🕒 ${x}`).join(' ') : (t('crs_med_as_needed') || 'al bisogno');
      let period = '';
      if (m.start_date || m.end_date) {
        period = `   ·   📅 ${m.start_date ? fmtD(m.start_date) : '…'} → ${m.end_date ? fmtD(m.end_date) : '∞'}`;
      }
      wrapText(`• ${m.name}${m.dose ? ` · ${m.dose}` : ''}   ·   ${timesStr}${period}`, M, W - 2 * M, 34, FONT(24, 600), INK);
      const future = (Array.isArray(m.schedule_phases) ? m.schedule_phases : [])
        .filter((p) => p?.from && p.from > today)
        .sort((a, b) => a.from.localeCompare(b.from));
      for (const p of future) {
        wrapText(`   🔁 ${t('med_phase_upcoming') || 'Dal'} ${fmtD(p.from)}: ${(p.times || []).join(', ')}`, M, W - 2 * M, 30, FONT(21), MUTED);
      }
      if (m.notes) wrapText(`   📝 ${m.notes}`, M, W - 2 * M, 30, FONT(21), MUTED);
      y += 8;
    }
  }

  // ---------- DIARIO RECENTE ----------
  const recent = [...diary].reverse().slice(0, 14); // più recenti prima
  if (recent.length > 0) {
    section(`📓 ${t('crs_section_diary') || 'Diario recente'}`);
    const moodEmoji = (v) => (['', '😢', '😕', '😐', '🙂', '😄'][v] || '');
    const appLabel = (v) => (['', t('dd_appetite_low') || 'poco', t('dd_appetite_med') || 'normale', t('dd_appetite_high') || 'tanto'][v] || '');
    let anyHigh = false;
    for (const d of recent) {
      const segs = [];
      const pushSeg = (text, color = INK, font = FONT(23)) => {
        if (segs.length) segs.push({ text: '·', color: MUTED });
        segs.push({ text, color, font });
      };
      pushSeg(new Date(d.diary_date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }));
      if (d.mood != null && moodEmoji(d.mood)) pushSeg(moodEmoji(d.mood));
      getBpReadings(d).forEach((r, i) => {
        const high = isBpHigh(r);
        if (high) anyHigh = true;
        pushSeg(
          `${i === 0 ? '🩺 ' : ''}${r.t ? `${r.t} ` : ''}${r.sys}/${r.dia}${high ? ' ⚠️' : ''}`,
          high ? ALERT : INK,
          high ? FONT(23, 800) : FONT(23),
        );
      });
      if (d.sleep_hours != null) pushSeg(`💤 ${d.sleep_hours}h`);
      if (d.appetite != null) pushSeg(`🍽️ ${appLabel(d.appetite)}`);
      if (d.weight_kg != null) pushSeg(`⚖️ ${d.weight_kg}kg`);
      wrapSegments(segs, M, W - 2 * M, 34);
      if (d.notes) wrapText(`   ${d.notes}`, M, W - 2 * M, 30, FONT(21), MUTED);
      y += 6;
    }
    if (anyHigh) {
      y += 4;
      wrapText(t('dr_bp_alert_legend') || `⚠️ In rosso: pressione ≥ ${BP_SYS_LIMIT}/${BP_DIA_LIMIT} mmHg`,
        M, W - 2 * M, 30, FONT(20, 700), ALERT);
    }
  }

  // ---------- CANVAS FINALE + FOOTER BRANDING ----------
  const footerH = 170;
  const finalH = Math.max(y + footerH + 30, 1754);
  const out = document.createElement('canvas');
  out.width = W; out.height = finalH;
  const c2 = out.getContext('2d');
  c2.fillStyle = '#FFFFFF';
  c2.fillRect(0, 0, W, finalH);
  c2.drawImage(work, 0, 0);

  // Footer
  const fy = finalH - footerH;
  c2.fillStyle = SOFT;
  c2.fillRect(0, fy, W, footerH);
  c2.strokeStyle = LINE; c2.lineWidth = 2;
  c2.beginPath(); c2.moveTo(0, fy); c2.lineTo(W, fy); c2.stroke();

  // QR code → sito FAMMY (angolo in basso a destra)
  try {
    const qr = document.createElement('canvas');
    await QRCode.toCanvas(qr, 'https://farxer.com', {
      width: 120, margin: 1,
      color: { dark: INK, light: '#F7F5F0' },
    });
    c2.drawImage(qr, W - M - 120, fy + 24);
  } catch (_) { /* QR opzionale */ }

  c2.fillStyle = ACCENT; c2.font = FONT(28, 800);
  c2.fillText('🏡 FAMMY', M, fy + 58);
  c2.fillStyle = INK; c2.font = FONT(22, 600);
  c2.fillText(t('dr_tagline') || "L'app che organizza la famiglia — anche la salute di chi ami.", M, fy + 96);
  c2.fillStyle = MUTED; c2.font = FONT(20);
  c2.fillText(t('dr_scan') || 'Scansiona il QR per provarla · farxer.com', M, fy + 128);

  return new Promise((resolve) => out.toBlob(resolve, 'image/png'));
}

// Mini line-chart su canvas. series: [{color, pts: [{x:'YYYY-MM-DD', v:number}]}]
function drawChart(ctx, x, y0, w, h, title, series) {
  ctx.fillStyle = SOFT;
  roundRect(ctx, x, y0, w, h, 14); ctx.fill();
  ctx.fillStyle = MUTED; ctx.font = FONT(20, 700);
  ctx.fillText(title, x + 16, y0 + 32);

  const all = series.flatMap((s) => s.pts.map((p) => p.v));
  if (all.length === 0) return;
  let min = Math.min(...all), max = Math.max(...all);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.15;
  min -= pad; max += pad;

  const dates = [...new Set(series.flatMap((s) => s.pts.map((p) => p.x)))].sort();
  const ix = new Map(dates.map((d, i) => [d, i]));
  const n = Math.max(dates.length - 1, 1);

  const px = (d) => x + 20 + (ix.get(d) / n) * (w - 40);
  const py = (v) => y0 + h - 24 - ((v - min) / (max - min)) * (h - 76);

  // Linee soglia tratteggiate (es. ipertensione) — solo se nel range visibile
  for (const s of series) {
    if (s.limit == null || s.limit < min || s.limit > max) continue;
    ctx.save();
    ctx.strokeStyle = ALERT; ctx.lineWidth = 2; ctx.setLineDash([9, 7]);
    ctx.beginPath();
    ctx.moveTo(x + 14, py(s.limit)); ctx.lineTo(x + w - 14, py(s.limit));
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = ALERT; ctx.font = FONT(15, 700);
    ctx.fillText(String(s.limit), x + 16, py(s.limit) - 5);
  }

  for (const s of series) {
    const pts = [...s.pts].sort((a, b) => a.x.localeCompare(b.x));
    ctx.strokeStyle = s.color; ctx.lineWidth = 3.5;
    ctx.beginPath();
    pts.forEach((p, i) => {
      if (i === 0) ctx.moveTo(px(p.x), py(p.v));
      else ctx.lineTo(px(p.x), py(p.v));
    });
    ctx.stroke();
    for (const p of pts) {
      // Punto rosso quando la media del giorno supera la soglia
      ctx.fillStyle = (s.limit != null && p.v >= s.limit) ? ALERT : s.color;
      ctx.beginPath(); ctx.arc(px(p.x), py(p.v), 4.5, 0, Math.PI * 2); ctx.fill();
    }
    // ultimo valore
    const last = pts[pts.length - 1];
    ctx.font = FONT(19, 800);
    ctx.fillText(String(last.v), Math.min(px(last.x) + 8, x + w - 50), py(last.v) - 8);
  }

  // etichette range date
  ctx.fillStyle = MUTED; ctx.font = FONT(16);
  const fmtShort = (ymd) => new Date(ymd + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  ctx.fillText(fmtShort(dates[0]), x + 16, y0 + h - 8);
  const lastLbl = fmtShort(dates[dates.length - 1]);
  ctx.fillText(lastLbl, x + w - 16 - ctx.measureText(lastLbl).width, y0 + h - 8);
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
