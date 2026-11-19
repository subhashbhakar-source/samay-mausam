#!/usr/bin/env node
/*
 * Builds the locked page: takes a readable web page, encrypts it, and writes one index.html
 * that shows nothing until the visitor's device has been approved.
 *
 * How the lock works
 * - The page is compressed and encrypted with a random content key (AES-256-GCM).
 * - The owner key (a typed code) opens it on any device: it is stretched with PBKDF2-SHA256 and
 *   unwraps the content key.
 * - Every other device makes its own key pair (ECDH P-256) and shows its public half as a request.
 *   The owner's page seals the content key to that public half. The sealed key opens the page only
 *   in the browser that holds the matching private half, so a forwarded link or key opens nothing.
 * - No key is written into this file or this repository.
 *
 * Use
 *   OWNER_KEY=XXXX-XXXX-XXXX-XXXX node lock.mjs --page page.html --out index.html [--previous index.html]
 *   node lock.mjs --new-key          prints a fresh owner key
 *
 * --page      the page as it is published as a Claude artifact (its <title>, <style>, content and script,
 *             without <html>, <head> or <body> tags)
 * --previous  the index.html that is live now. With it the content key is kept, so every device that
 *             was approved earlier stays approved. Without it all earlier keys stop working.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pbkdf2Sync, randomBytes, randomInt, createCipheriv, createDecipheriv } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROUNDS = 600000;
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';        /* no I, L, O, U, 0 or 1: nothing that reads two ways */

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : null; };
const b64 = (buf) => Buffer.from(buf).toString('base64');
const cleanKey = (k) => String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

if (args.includes('--new-key')) {
  let k = '';
  for (let i = 0; i < 16; i++) k += ALPHABET[randomInt(ALPHABET.length)] + (i % 4 === 3 && i < 15 ? '-' : '');
  console.log(k);
  process.exit(0);
}

const pagePath = opt('page'), outPath = opt('out'), prevPath = opt('previous');
const ownerKey = cleanKey(process.env.OWNER_KEY);
if (!pagePath || !outPath) { console.error('Give --page and --out. See the top of this file.'); process.exit(1); }
if (ownerKey.length < 12) { console.error('Set OWNER_KEY to the owner key (12 or more letters and digits).'); process.exit(1); }

function seal(key, plain) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv);
  return { iv, data: Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]) };
}
function unseal(key, iv, data) {
  const d = createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
}
function readPayload(html) {
  const m = /var P = (\{[^\n]*\});\n/.exec(html);
  if (!m) throw new Error('No locked payload found in the previous file.');
  return JSON.parse(m[1]);
}

/* the content key and the owner's salt: kept from the live file when one is given, so approved devices
   stay approved and the owner's own devices stay open */
let contentKey, salt;
if (prevPath) {
  const old = readPayload(readFileSync(prevPath, 'utf8'));
  if (old.oi !== ROUNDS) { console.error('The previous file was made with other settings. Build without --previous.'); process.exit(1); }
  salt = Buffer.from(old.os, 'base64');
  const oldOwner = pbkdf2Sync(ownerKey, salt, old.oi, 32, 'sha256');
  try { contentKey = unseal(oldOwner, Buffer.from(old.ov, 'base64'), Buffer.from(old.ow, 'base64')); }
  catch (e) { console.error('OWNER_KEY does not open the previous file.'); process.exit(1); }
} else {
  contentKey = randomBytes(32);
  salt = randomBytes(16);
}

/* the readable page, made into a whole document */
const SKELETON = '<!doctype html><html lang="hi-Latn"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">' +
  '<style>:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}' +
  'body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n';
/* a key or request link opened in a tab that already shows the page: load the lock again so it is read;
   and the owner alone gets a button that leads to the "approve a device" screen */
const OWNER_BUTTON = '\n<script>(function(){' +
  'window.addEventListener("hashchange",function(){if(/^#(approve|key)/.test(location.hash))location.reload()});' +
  'var own=null;try{own=window.localStorage.getItem("solar-calc.owner")}catch(e){}' +
  'if(!own)return;var b=document.createElement("button");b.type="button";b.className="btn";b.id="owner-approve";' +
  'b.textContent="Device approve karein";b.addEventListener("click",function(){location.hash="#approve";location.reload()});' +
  '(document.querySelector(".top-actions")||document.body).appendChild(b)})();</script>\n';
const page = readFileSync(pagePath, 'utf8');
if (/<html[\s>]|<body[\s>]/i.test(page)) { console.error('--page must be the artifact form of the page, without <html> or <body> tags.'); process.exit(1); }
/* the button's script goes ahead of the page's font link, so a slow font server cannot hold it back */
const FONT_LINK = /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>\s*$/;
const withButton = FONT_LINK.test(page) ? page.replace(FONT_LINK, (m) => OWNER_BUTTON + m) : page + OWNER_BUTTON;
const plain = Buffer.from(SKELETON + withButton + '</body></html>\n', 'utf8');

const body = seal(contentKey, deflateRawSync(plain, { level: 9 }));
const wrap = seal(pbkdf2Sync(ownerKey, salt, ROUNDS, 32, 'sha256'), contentKey);
const payload = { v: 1, n: plain.length, iv: b64(body.iv), ct: b64(body.data), os: b64(salt), oi: ROUNDS, ov: b64(wrap.iv), ow: b64(wrap.data) };

/* check the round trip before anything is written */
const back = inflateRawSync(unseal(unseal(pbkdf2Sync(ownerKey, salt, ROUNDS, 32, 'sha256'), wrap.iv, wrap.data), body.iv, body.data));
if (!back.equals(plain)) { console.error('Round-trip check failed. Nothing written.'); process.exit(1); }

/* tiny-inflate, with its comments taken out to save weight; its licence notice is kept in the page */
const inflate = readFileSync(join(HERE, 'tiny-inflate.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^module\.exports.*$/m, '').replace(/^\s*\n/gm, '').replace(/^ +/gm, '');
const shell = readFileSync(join(HERE, 'lock-page.tmpl'), 'utf8');
if (!shell.includes('__PAYLOAD__') || !shell.includes('__INFLATE__')) { console.error('lock-page.tmpl has lost its placeholders.'); process.exit(1); }
const out = shell.replace('__PAYLOAD__', () => JSON.stringify(payload)).replace('__INFLATE__', () => inflate);
writeFileSync(outPath, out);
console.error(`Wrote ${outPath}: ${out.length} bytes (page ${plain.length} bytes, ${prevPath ? 'content key kept' : 'new content key'}).`);
