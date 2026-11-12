/**
 * TEKILA Cartas backend: Google Sheet + Apps Script web app.
 *
 * The sheet is the admin panel:
 *   - every letter sealed on the site lands as a new row with Status = Pending
 *   - set Status to "Show" to put it in the bag, "Hide" to keep it out
 *   - stamp counts update live in the Yo también / Gracias / Respira / Total columns
 *   - voice letters: add a row by hand with Type = voice and an Audio URL
 *
 * Setup: see cartas-backend/README.md
 */

var SHEET = 'Cartas';
var HEAD = ['Number', 'Created', 'Status', 'Type', 'Text', 'Audio URL', 'WhatsApp', 'Private',
            'Yo también', 'Gracias', 'Respira', 'Total stamps', 'Notes'];
var C = { number: 1, created: 2, status: 3, type: 4, text: 5, audio: 6, phone: 7, priv: 8,
          yo: 9, gracias: 10, respira: 11, total: 12, notes: 13 };
var STAMP_COL = { yo: C.yo, gracias: C.gracias, respira: C.respira };
var MIN_LEN = 120, MAX_LEN = 2000;
var LIST_CACHE = 'cartas-list-v1', LIST_TTL = 120;          // seconds the public list is cached
var LIMITS = { seal: [20, 600], stamp: [400, 600] };       // max requests per window (seconds)

/* ---------------- one-time setup (run from the editor) ---------------- */
function setup() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
  sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold').setBackground('#171310').setFontColor('#F4EADA');
  sh.setFrozenRows(1);
  var rows = sh.getMaxRows() - 1;
  sh.getRange(2, C.status, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Pending', 'Show', 'Hide'], true).setAllowInvalid(false).build());
  sh.getRange(2, C.type, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['text', 'voice'], true).build());
  sh.getRange(2, C.text, rows, 1).setWrap(true);
  sh.setColumnWidth(C.text, 420);
  var cf = sh.getConditionalFormatRules();
  var stat = sh.getRange(2, 1, rows, HEAD.length);
  cf.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$C2="Show"').setBackground('#E3F1DF').setRanges([stat]).build());
  cf.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$C2="Pending"').setBackground('#FFF4D6').setRanges([stat]).build());
  cf.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$C2="Hide"').setFontColor('#999999').setRanges([stat]).build());
  sh.setConditionalFormatRules(cf);
  var d = ss.getSheetByName('Sheet1'); if (d && d.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(d);
}

/* Menu + instant publish after editing Status. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Cartas').addItem('Publish changes to the site now', 'publishNow').addToUi();
}
function onEdit(e) {
  if (e && e.range && e.range.getSheet().getName() === SHEET) CacheService.getScriptCache().remove(LIST_CACHE);
}
function publishNow() { CacheService.getScriptCache().remove(LIST_CACHE); SpreadsheetApp.getActive().toast('The site will show the update on next load.'); }

/* ---------------- HTTP ---------------- */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'list' || !p.action) return out(list(parseInt(p.limit, 10) || 20));
  return out({ error: 'Unknown action' });
}

/* The site posts JSON as text/plain (avoids a CORS preflight Apps Script can't answer). */
function doPost(e) {
  var b = {};
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return out({ error: 'Bad request' }); }
  try {
    if (b.action === 'seal') return out(seal(b));
    if (b.action === 'stamp') return out(stamp(b));
  } catch (err) { return out({ error: err.message || 'Server error' }); }
  return out({ error: 'Unknown action' });
}

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ---------------- actions ---------------- */
function list(limit) {
  limit = Math.max(1, Math.min(60, limit));
  var cache = CacheService.getScriptCache(), all = null, hit = cache.get(LIST_CACHE);
  if (hit) { try { all = JSON.parse(hit); } catch (e) {} }
  if (!all) {
    var sh = sheet(), n = sh.getLastRow() - 1;
    var rows = n > 0 ? sh.getRange(2, 1, n, HEAD.length).getValues() : [];
    all = [];
    rows.forEach(function (r) {
      if (String(r[C.status - 1]).trim() !== 'Show' || r[C.priv - 1] === true) return;
      var type = String(r[C.type - 1]).trim() === 'voice' ? 'voice' : 'text';
      var l = { number: +r[C.number - 1], type: type,
                stamps: { yo: +r[C.yo - 1] || 0, gracias: +r[C.gracias - 1] || 0, respira: +r[C.respira - 1] || 0 } };
      if (type === 'voice') l.audio = String(r[C.audio - 1]).trim(); else l.text = String(r[C.text - 1]);
      if (l.number && (l.text || l.audio)) all.push(l);
    });
    try { cache.put(LIST_CACHE, JSON.stringify(all), LIST_TTL); } catch (e) { /* >100KB: skip cache */ }
  }
  // voice letters first, the rest shuffled so every visit gets a different bag
  var voice = all.filter(function (l) { return l.type === 'voice'; });
  var text = shuffle(all.filter(function (l) { return l.type !== 'voice'; }));
  return { letters: voice.concat(text).slice(0, limit) };
}

function seal(b) {
  if (b.hp) return { number: 0, error: 'Rejected' };                      // honeypot filled = bot
  var text = String(b.text || '').trim(), phone = String(b.phone || '').trim();
  if (text.length < MIN_LEN) throw new Error('Your letter needs at least ' + MIN_LEN + ' characters.');
  if (text.length > MAX_LEN) text = text.slice(0, MAX_LEN);
  if (phone.replace(/\D/g, '').length < 10) throw new Error('Check your WhatsApp number.');
  limit('seal');
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var sh = sheet(), last = sh.getLastRow(), next = 1;
    if (last > 1) {
      var nums = sh.getRange(2, C.number, last - 1, 1).getValues();
      nums.forEach(function (r) { if (+r[0] >= next) next = +r[0] + 1; });
    }
    var row = [next, new Date(), 'Pending', 'text', safe(text), '', safe(phone), b.private === true, 0, 0, 0, 0, ''];
    sh.getRange(last + 1, 1, 1, row.length).setValues([row]);
    sh.getRange(last + 1, C.priv).insertCheckboxes().setValue(b.private === true);
    sh.getRange(last + 1, C.total).setFormula('=SUM(I' + (last + 1) + ':K' + (last + 1) + ')');
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  notify(next, text, b.private === true);
  return { number: next };
}

function stamp(b) {
  var col = STAMP_COL[b.type], no = parseInt(b.number, 10);
  if (!col || !no) throw new Error('Bad stamp');
  limit('stamp');
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var sh = sheet(), last = sh.getLastRow();
    if (last < 2) throw new Error('Letter not found');
    var nums = sh.getRange(2, C.number, last - 1, 1).getValues();
    for (var i = 0; i < nums.length; i++) {
      if (+nums[i][0] === no) {
        var cell = sh.getRange(i + 2, col);
        cell.setValue((+cell.getValue() || 0) + 1);
        return { ok: true };
      }
    }
    throw new Error('Letter not found');
  } finally { lock.releaseLock(); }
}

/* ---------------- helpers ---------------- */
function sheet() { var sh = SpreadsheetApp.getActive().getSheetByName(SHEET); if (!sh) throw new Error('Run setup() first'); return sh; }
// Stop text like "=IMPORTXML(...)" from becoming a formula in the sheet.
function safe(s) { return /^[=+\-@]/.test(s) ? "'" + s : s; }
function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
// Site-wide rate limit per window, so a script can't flood the sheet.
function limit(kind) {
  var c = CacheService.getScriptCache(), k = 'rl-' + kind, n = +(c.get(k) || 0);
  if (n >= LIMITS[kind][0]) throw new Error('Too many letters right now. Try again in a few minutes.');
  c.put(k, String(n + 1), LIMITS[kind][1]);
}
// Optional email on every new letter: set Script property NOTIFY_EMAIL.
function notify(no, text, priv) {
  var to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
  if (!to) return;
  try {
    MailApp.sendEmail(to, 'New carta Nº ' + no + (priv ? ' (private)' : ''),
      text + '\n\nOpen the sheet to approve it: ' + SpreadsheetApp.getActive().getUrl());
  } catch (e) {}
}
