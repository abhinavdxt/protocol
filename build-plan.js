#!/usr/bin/env node
/*
 * build-plan.js — refreshes plan.json for THE PROTOCOL app.
 * Fetches the XLRI Command Centre, extracts assessments for the enrolled
 * courses, computes a 4-hour study block before each, and writes plan.json.
 * Run by the twice-daily cloud routine. Pure Node (needs global fetch, Node 18+).
 */

const EXEC_URL = "https://script.google.com/macros/s/AKfycbymFXMRs78rb8_KjyqZ7VQBK6PV8iUL5f6ansiPRGPqGTSN5B5UV5ZEJQcsCMLHFOjzjg/exec";
const ENROLLED = ["BAV", "CNB", "INM", "PJM", "PPBS"];
const TERM = "XLRI Term IV · Sec E · B25349";

// ---- date helpers (all in IST) --------------------------------------------
const IST_OFFSET = 5.5 * 60; // minutes
function nowIST() {
  const d = new Date();
  return new Date(d.getTime() + (IST_OFFSET + d.getTimezoneOffset()) * 60000);
}
function iso(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function label(d) { return `${WD[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}`; }
function parseISO(s) { const [y, m, day] = s.split("-").map(Number); return new Date(y, m - 1, day); }

function cleanSlot(s) {
  if (!s) return "";
  return s.replace(/u2013/g, "–").replace(/u2019/g, "’").trim();
}

async function main() {
  const res = await fetch(EXEC_URL, { redirect: "follow" });
  const raw = await res.text();

  // Decode the multi-escaped embedded data: \xHH hex escapes, then drop backslash noise.
  const dec = raw.replace(/\\x([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const flat = dec.replace(/\\/g, "");

  const re = /"id":"(EX_[^"]+)","date":"(\d{4}-\d{2}-\d{2})","type":"([^"]*)","code":"([^"]*)","text":"([^"]*)"(?:,"slot":"([^"]*)")?/g;
  const seen = new Set();
  const all = [];
  let m;
  while ((m = re.exec(flat)) !== null) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    all.push({ id: m[1], date: m[2], type: m[3], code: m[4], text: m[5], slot: cleanSlot(m[6]) });
  }

  // Safety net: a healthy Command Centre response has dozens of assessment
  // records. Zero here means the fetch/decode failed (blocked, redirected,
  // format changed) rather than "no exams exist" — bail out instead of
  // writing empty data over a known-good plan.json.
  if (all.length === 0) {
    console.error(`build-plan failed: parsed 0 total assessment records from ${res.status} response (${raw.length} bytes) — source fetch or decode is broken, not writing plan.json.`);
    process.exit(1);
  }

  const today = nowIST();
  const todayISO = iso(today);

  const exams = all
    .filter(a => ENROLLED.includes(a.code) && a.date >= todayISO)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(a => {
      const ed = parseISO(a.date);
      const bd = new Date(ed); bd.setDate(bd.getDate() - 1); // study block: evening before
      return {
        name: a.text.replace(/\s+/g, " ").trim(),
        date: a.date,
        dateLabel: label(ed),
        time: a.slot || a.type,
        type: a.type,
        block: `${label(bd)} · 2:30–6:30 PM`,
        blockDate: iso(bd)
      };
    });

  const hh = today.getHours(), mm = today.getMinutes();
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = ((hh + 11) % 12) + 1;
  const updated = `${label(today)}, ${h12}:${String(mm).padStart(2, "0")} ${ampm}`;

  const plan = {
    updated,
    term: TERM,
    exams,
    note: exams.length ? "" : "No upcoming exams for your courses right now."
  };

  const fs = require("fs");

  // Second safety net: source parsed fine (all.length > 0 above) but our
  // enrolled-course filter came back empty. If the existing plan.json still
  // has future exams in it, that's a real signal something's wrong (course
  // codes changed, date field changed) rather than exams genuinely running
  // out — refuse to clobber good data, surface it as a failure instead.
  if (exams.length === 0) {
    try {
      const prev = JSON.parse(fs.readFileSync("plan.json", "utf8"));
      const prevFuture = (prev.exams || []).filter(e => e.date >= todayISO);
      if (prevFuture.length > 0) {
        console.error(`build-plan failed: parsed ${all.length} total records but 0 matched enrolled courses (${ENROLLED.join(",")}), while existing plan.json still has ${prevFuture.length} future exam(s). Not overwriting — investigate before re-running.`);
        process.exit(1);
      }
    } catch (_) { /* no existing plan.json — fine, proceed to write */ }
  }

  fs.writeFileSync("plan.json", JSON.stringify(plan, null, 2) + "\n");
  console.log(`Wrote plan.json — ${exams.length} upcoming exam(s):`);
  exams.forEach(e => console.log(`  ${e.date} ${e.name} (block ${e.blockDate})`));
}

main().catch(e => { console.error("build-plan failed:", e); process.exit(1); });
