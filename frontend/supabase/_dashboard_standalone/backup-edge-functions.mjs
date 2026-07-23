#!/usr/bin/env node
// =============================================================================
// FAMMY — backup-edge-functions.mjs
// =============================================================================
// Scarica il sorgente di TUTTE le Edge Functions deployate su Supabase e le
// salva in questa cartella, così il repo resta l'archivio di sicurezza del
// codice che gira davvero in produzione.
//
// USO (Windows / Mac / Linux, serve solo Node 18+):
//
//   1. Genera un Personal Access Token su:
//      https://supabase.com/dashboard/account/tokens
//
//   2. Da terminale, nella cartella frontend/supabase/_dashboard_standalone:
//
//      Windows (PowerShell):
//        $env:SUPABASE_PAT="sbp_incolla_qui"
//        node backup-edge-functions.mjs
//
//      Mac/Linux:
//        SUPABASE_PAT="sbp_incolla_qui" node backup-edge-functions.mjs
//
// ⚠️ Il token NON va mai scritto dentro questo file né committato.
//    Viene letto solo dalla variabile d'ambiente.
//
// Output:
//   - <slug>.ts                 per le funzioni a file singolo
//   - <slug>/<file>             per le funzioni multi-file
//   - _functions-manifest.json  metadati (versione, verify_jwt, updated_at)
// =============================================================================

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PAT = process.env.SUPABASE_PAT;
const PROJECT = process.env.SUPABASE_PROJECT_REF || 'jwzoymvtxjzpymaywjtw';
const API = 'https://api.supabase.com';

const auth = { Authorization: `Bearer ${PAT}` };

/**
 * Estrae il boundary dall'header Content-Type di una risposta multipart.
 * Gestisce sia `boundary=abc` che `boundary="abc"`.
 */
export function parseBoundary(contentType) {
  if (!contentType) return null;
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!m) return null;
  return (m[1] || m[2] || '').trim();
}

/**
 * Parser multipart/form-data minimale ma robusto.
 * Ritorna [{ filename, content }, ...].
 *
 * Nota: lavora su stringa perché i sorgenti delle funzioni sono testo UTF-8.
 */
export function parseMultipart(body, boundary) {
  const parts = [];
  const sep = `--${boundary}`;
  // Divide sulle occorrenze del boundary, scartando preambolo ed epilogo.
  const chunks = body.split(sep);
  for (const raw of chunks) {
    const chunk = raw.replace(/^\r\n/, '');
    if (!chunk || chunk === '--' || chunk === '--\r\n' || chunk.trim() === '--') continue;
    // Header e corpo sono separati da una riga vuota.
    const idx = chunk.search(/\r?\n\r?\n/);
    if (idx === -1) continue;
    const headerBlock = chunk.slice(0, idx);
    const sepMatch = /\r?\n\r?\n/.exec(chunk.slice(idx));
    let content = chunk.slice(idx + sepMatch[0].length);
    // Rimuove il CRLF finale che precede il boundary successivo.
    content = content.replace(/\r?\n$/, '');
    // Cerca filename="..." e, in fallback, name="..."
    const fn = /filename\*?="?([^";\r\n]+)"?/i.exec(headerBlock);
    const nm = /\bname="?([^";\r\n]+)"?/i.exec(headerBlock);
    const filename = (fn && fn[1]) || null;
    const partName = (nm && nm[1]) || null;
    if (!filename && !partName) continue;
    parts.push({ filename, partName, content });
  }
  // Le parti con un vero filename sono i file sorgente; quelle con solo
  // `name` (es. metadata JSON) vengono usate solo se non c'è nient'altro.
  const fileParts = parts.filter((p) => p.filename);
  const chosen = fileParts.length > 0 ? fileParts : parts;
  return chosen.map((p) => ({ filename: p.filename || p.partName, content: p.content }));
}

/**
 * Rende sicuro un filename ricevuto dall'API prima di scriverlo su disco:
 * rimuove drive letter/slash iniziali, il prefisso deployment "source/",
 * e neutralizza eventuali "..".
 */
export function sanitizeFilename(name) {
  let n = String(name || '').replace(/\\/g, '/');
  n = n.replace(/^[A-Za-z]:/, '');          // C: → via
  n = n.replace(/^\/+/, '');                // slash iniziali → via
  n = n.replace(/^source\//, '');           // prefisso deployment noto
  n = n.split('/').filter((seg) => seg && seg !== '.' && seg !== '..').join('/');
  return n || 'index.ts';
}

async function listFunctions() {
  const res = await fetch(`${API}/v1/projects/${PROJECT}/functions`, { headers: auth });
  if (!res.ok) {
    throw new Error(`Elenco funzioni fallito: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function fetchBody(slug) {
  const res = await fetch(`${API}/v1/projects/${PROJECT}/functions/${slug}/body`, {
    headers: { ...auth, Accept: 'multipart/form-data' },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
  }
  const ct = res.headers.get('content-type') || '';
  const text = await res.text();
  const boundary = parseBoundary(ct);
  if (!boundary) {
    // Alcune risposte possono tornare il sorgente nudo: lo trattiamo come index.ts
    return [{ filename: 'index.ts', content: text }];
  }
  return parseMultipart(text, boundary);
}

async function main() {
  if (!PAT) {
    console.error('\n❌ Manca il token.\n');
    console.error('   Windows PowerShell:  $env:SUPABASE_PAT="sbp_..."');
    console.error('   Mac/Linux:           export SUPABASE_PAT="sbp_..."\n');
    console.error('   Generalo su https://supabase.com/dashboard/account/tokens\n');
    process.exit(1);
  }
  console.log(`\n🔎 Progetto: ${PROJECT}\n`);
  const fns = await listFunctions();
  console.log(`Trovate ${fns.length} funzioni deployate.\n`);

  const manifest = [];
  let ok = 0;
  let ko = 0;

  for (const fn of fns) {
    const slug = fn.slug || fn.name;
    process.stdout.write(`  ${slug} … `);
    try {
      const files = await fetchBody(slug);
      if (files.length === 0) throw new Error('nessun file nella risposta');

      if (files.length === 1) {
        // File singolo → <slug>.ts, coerente con la convenzione esistente
        await writeFile(`${slug}.ts`, files[0].content, 'utf8');
        console.log(`✅ salvata in ${slug}.ts`);
      } else {
        // Multi-file → sottocartella
        for (const f of files) {
          const out = join(slug, sanitizeFilename(f.filename));
          await mkdir(dirname(out), { recursive: true });
          await writeFile(out, f.content, 'utf8');
        }
        console.log(`✅ salvati ${files.length} file in ${slug}/`);
      }

      manifest.push({
        slug,
        version: fn.version ?? null,
        verify_jwt: fn.verify_jwt ?? null,
        status: fn.status ?? null,
        updated_at: fn.updated_at ? new Date(fn.updated_at).toISOString() : null,
        files: files.map((f) => sanitizeFilename(f.filename)),
      });
      ok++;
    } catch (e) {
      console.log(`❌ ${e.message}`);
      ko++;
    }
  }

  manifest.sort((a, b) => a.slug.localeCompare(b.slug));
  await writeFile(
    '_functions-manifest.json',
    JSON.stringify({ project: PROJECT, exported_at: new Date().toISOString(), functions: manifest }, null, 2),
    'utf8',
  );

  console.log(`\n✅ Backup completato: ${ok} ok, ${ko} falliti.`);
  console.log('   Manifest scritto in _functions-manifest.json');
  console.log('   Ora committa i file su GitHub.\n');

  if (ko > 0) process.exitCode = 1;
}

// Esegue solo se lanciato direttamente (così i parser restano testabili).
// Confronta path filesystem con path filesystem: funziona su Windows e Unix.
const isMain = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main().catch((e) => {
    console.error(`\n❌ ${e.message}\n`);
    process.exit(1);
  });
}
