#!/usr/bin/env node
/*
 * Сквозной автотест сезона «Маяк».
 *
 *   node tools/playtest.js            — собрать (tools/build.js) и прогнать всё
 *   node tools/playtest.js --no-build — тестировать уже собранный dist/
 *   node tools/playtest.js --headed   — с окном браузера
 *
 * Сам поднимает статический сервер из dist/ на свободном порту и в Chromium (Playwright, 390×844):
 *  - витрина: статусы эпизодов, модалка покупки, неверный/верный код (MAYAK-DEMO-2026), прогресс;
 *  - проходит эп.1–4 от начала до победы по docs/walkthrough/ep*.md (неверный ответ отклоняется,
 *    неверный финал проигрывает, верный — побеждает);
 *  - для каждой главы открывает её ссылки и проверяет, что ответ действительно выводим из материалов
 *    мира (страница есть, ник виден при текущем mayak:worldEpisode, медиа отдаётся, EXIF/WAV на месте —
 *    Морзе декодируется, в спектрограмме есть «надпись»);
 *  - «Лента»: посты/профили эп.2–4 скрыты до соответствующего эпизода, затем сливаются с эп.1;
 *  - обходит все страницы world/ и все профили «Ленты»: ошибки консоли, HTTP ≥ 400, битые ссылки,
 *    горизонтальный скролл на 390px, подвал о вымышленности.
 * Выход: код 0 — всё зелёное, 1 — есть проблемы (список печатается).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execSync, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const ARGS = new Set(process.argv.slice(2));
const W = 390, H = 844;
const CODE = "MAYAK-DEMO-2026";

// ---------------------------------------------------------------- журнал
const problems = [];
let passed = 0;
let section = "";
function ok(cond, msg) {
  if (cond) passed++;
  else { problems.push(`[${section}] ${msg}`); console.log(`   ✘ ${msg}`); }
  return !!cond;
}
function head(s) { section = s; console.log(`\n▶ ${s}`); }
function info(s) { console.log(`   · ${s}`); }

// ---------------------------------------------------------------- playwright
function loadPlaywright() {
  try { return require("playwright"); } catch (e) { /* глобальная установка */ }
  const roots = [];
  try { roots.push(execSync("npm root -g", { encoding: "utf8" }).trim()); } catch (e) { /* нет npm */ }
  roots.push("/opt/node22/lib/node_modules", "/usr/local/lib/node_modules", "/usr/lib/node_modules");
  for (const r of roots) {
    try { return require(path.join(r, "playwright")); } catch (e) { /* дальше */ }
  }
  console.error("Playwright не найден (ни локально, ни в npm root -g).");
  process.exit(1);
}

// ---------------------------------------------------------------- статический сервер
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".gif": "image/gif",
  ".webp": "image/webp", ".ico": "image/x-icon", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".woff2": "font/woff2"
};
function startServer() {
  const server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch (e) { res.writeHead(400); return res.end(); }
    let file = path.join(DIST, p);
    if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
    try {
      let st = fs.statSync(file);
      if (st.isDirectory()) {
        if (!p.endsWith("/")) { res.writeHead(301, { Location: p + "/" }); return res.end(); }
        file = path.join(file, "index.html");
        st = fs.statSync(file);
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Content-Length": st.size, "Cache-Control": "no-store" });
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404");
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}
function fetchBuf(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, type: res.headers["content-type"] || "", buf: Buffer.concat(chunks) }));
    }).on("error", () => resolve({ status: 0, type: "", buf: Buffer.alloc(0) }));
  });
}

// ---------------------------------------------------------------- медиа: EXIF
function readExif(buf) {
  let i = 2;
  while (i < buf.length - 4) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (marker === 0xe1 && buf.toString("latin1", i + 4, i + 10) === "Exif\0\0") {
      const t = i + 10;
      const le = buf.toString("latin1", t, t + 2) === "II";
      const u16 = (o) => (le ? buf.readUInt16LE(t + o) : buf.readUInt16BE(t + o));
      const u32 = (o) => (le ? buf.readUInt32LE(t + o) : buf.readUInt32BE(t + o));
      const ifd = (off) => {
        const out = {};
        const n = u16(off);
        for (let k = 0; k < n; k++) {
          const e = off + 2 + k * 12;
          const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
          const size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 10: 8 }[type] || 1;
          const vo = size * count > 4 ? u32(e + 8) : e + 8;
          if (type === 2) out[tag] = buf.toString("latin1", t + vo, t + vo + count).replace(/\0+$/, "");
          else if (type === 5) { const a = []; for (let c = 0; c < count; c++) a.push(u32(vo + c * 8) / u32(vo + c * 8 + 4)); out[tag] = a; }
          else if (type === 3) out[tag] = u16(vo);
          else if (type === 4) out[tag] = u32(vo);
          else if (type === 1 || type === 7) out[tag] = buf.slice(t + vo, t + vo + count);
        }
        return out;
      };
      const ifd0 = ifd(u32(4));
      return { ifd0, exif: ifd0[0x8769] ? ifd(ifd0[0x8769]) : {}, gps: ifd0[0x8825] ? ifd(ifd0[0x8825]) : {} };
    }
    i += 2 + len;
  }
  return null;
}
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length - 9) {
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xc3) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

// ---------------------------------------------------------------- медиа: WAV
function readWav(buf) {
  if (buf.toString("latin1", 0, 4) !== "RIFF" || buf.toString("latin1", 8, 12) !== "WAVE") return null;
  let i = 12, fmt = null, data = null;
  while (i < buf.length - 8) {
    const id = buf.toString("latin1", i, i + 4), size = buf.readUInt32LE(i + 4);
    if (id === "fmt ") fmt = { format: buf.readUInt16LE(i + 8), channels: buf.readUInt16LE(i + 10), rate: buf.readUInt32LE(i + 12), bits: buf.readUInt16LE(i + 22) };
    if (id === "data") data = buf.slice(i + 8, i + 8 + size);
    i += 8 + size + (size & 1);
  }
  if (!fmt || !data || fmt.bits !== 16) return fmt ? { ...fmt, samples: null } : null;
  const n = Math.floor(data.length / 2 / fmt.channels);
  const s = new Float32Array(n);
  for (let k = 0; k < n; k++) s[k] = data.readInt16LE(k * 2 * fmt.channels) / 32768;
  return { ...fmt, samples: s, duration: n / fmt.rate };
}
function goertzel(s, from, len, freq, rate) {
  const w = (2 * Math.PI * freq) / rate, c = 2 * Math.cos(w);
  let p1 = 0, p2 = 0;
  for (let k = from; k < from + len && k < s.length; k++) { const p0 = s[k] + c * p1 - p2; p2 = p1; p1 = p0; }
  return p1 * p1 + p2 * p2 - c * p1 * p2;
}
const MORSE = {
  ".-": "A", "-...": "B", "-.-.": "C", "-..": "D", ".": "E", "..-.": "F", "--.": "G", "....": "H", "..": "I", ".---": "J",
  "-.-": "K", ".-..": "L", "--": "M", "-.": "N", "---": "O", ".--.": "P", "--.-": "Q", ".-.": "R", "...": "S", "-": "T",
  "..-": "U", "...-": "V", ".--": "W", "-..-": "X", "-.--": "Y", "--..": "Z", "-----": "0", ".----": "1", "..---": "2",
  "...--": "3", "....-": "4", ".....": "5", "-....": "6", "--...": "7", "---..": "8", "----.": "9"
};
// Простейший декодер Морзе по огибающей тона (окна 10 мс).
function decodeMorse(wav, tone) {
  const win = Math.round(wav.rate / 100);
  const env = [];
  for (let i = 0; i + win <= wav.samples.length; i += win) env.push(Math.sqrt(goertzel(wav.samples, i, win, tone, wav.rate)));
  const max = env.reduce((a, b) => Math.max(a, b), 0);
  const on = env.map((v) => v > max * 0.3);
  const runs = [];
  for (let i = 0; i < on.length;) { let j = i; while (j < on.length && on[j] === on[i]) j++; runs.push([on[i], j - i]); i = j; }
  const marks = runs.filter((r) => r[0]).map((r) => r[1]).sort((a, b) => a - b);
  const unit = marks[Math.floor(marks.length * 0.25)] || 1;
  let out = "", sym = "";
  for (const [isOn, len] of runs) {
    if (isOn) sym += len < unit * 2 ? "." : "-";
    else if (len >= unit * 2) {
      if (sym) { out += MORSE[sym] || "?"; sym = ""; }
      if (len >= unit * 5) out += " ";
    }
  }
  if (sym) out += MORSE[sym] || "?";
  return out.replace(/\s+/g, " ").trim();
}
// Доля энергии в полосе [f1,f2] внутри интервала [t1,t2] относительно той же полосы вне его.
function bandContrast(wav, f1, f2, t1, t2) {
  const win = 1024, freqs = [];
  for (let f = f1; f <= f2; f += (f2 - f1) / 24) freqs.push(f);
  let inE = 0, inN = 0, outE = 0, outN = 0;
  for (let i = 0; i + win <= wav.samples.length; i += win) {
    const t = (i + win / 2) / wav.rate;
    const e = freqs.reduce((a, f) => a + goertzel(wav.samples, i, win, f, wav.rate), 0);
    if (t > t1 && t < t2) { inE += e; inN++; } else if (t < t1 - 0.1 || t > t2 + 0.1) { outE += e; outN++; }
  }
  return (inE / Math.max(1, inN)) / (outE / Math.max(1, outN) || 1e-12);
}

// ---------------------------------------------------------------- main
(async () => {
  if (!ARGS.has("--no-build")) {
    head("Сборка");
    const r = spawnSync(process.execPath, [path.join(ROOT, "tools/build.js")], { cwd: ROOT, encoding: "utf8" });
    process.stdout.write(r.stdout.split("\n").map((l) => (l ? "   " + l : l)).join("\n"));
    if (r.status !== 0) { console.error(r.stderr); console.error("build.js завершился с ошибкой"); process.exit(1); }
    ok(!/⚠|warn|предупрежд/i.test(r.stdout + r.stderr), "сборка без предупреждений");
  }
  if (!fs.existsSync(path.join(DIST, "index.html"))) { console.error("Нет dist/ — запустите node tools/build.js"); process.exit(1); }

  const server = await startServer();
  const BASE = `http://127.0.0.1:${server.address().port}/`;
  console.log(`\nСервер: ${BASE}`);
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: !ARGS.has("--headed") });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: "reduce", locale: "ru-RU" });
  ctx.setDefaultTimeout(15000);

  // ---- наблюдение за страницами
  function watch(page) {
    const tag = () => { try { return page.url().replace(BASE, "/"); } catch (e) { return "?"; } };
    page.on("console", (m) => { if (m.type() === "error") ok(false, `console.error на ${tag()}: ${m.text()}`); });
    page.on("pageerror", (e) => ok(false, `JS-ошибка на ${tag()}: ${e.message}`));
    page.on("response", (r) => { if (r.status() >= 400) ok(false, `HTTP ${r.status()} ${r.url().replace(BASE, "/")} (со страницы ${tag()})`); });
    page.on("requestfailed", (r) => {
      const f = r.failure() && r.failure().errorText;
      if (!/ERR_ABORTED/.test(f || "")) ok(false, `запрос не удался ${r.url().replace(BASE, "/")}: ${f}`);
    });
    return page;
  }
  const page = watch(await ctx.newPage());
  const aux = watch(await ctx.newPage());

  async function noHScroll(p, label) {
    const r = await p.evaluate(() => document.documentElement.scrollWidth);
    return ok(r <= W, `${label}: горизонтальный скролл (scrollWidth ${r} > ${W})`);
  }
  const norm = (s) => String(s).toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
  async function textOf(p) { return p.evaluate(() => document.body ? document.body.innerText : ""); }
  async function open(url, label) {
    const res = await aux.goto(new URL(url, BASE).href, { waitUntil: "load" });
    if (res && !res.ok() && res.status() !== 304) ok(false, `${label || url}: HTTP ${res.status()}`);
    await aux.waitForTimeout(80);
    await noHScroll(aux, label || url);
    return textOf(aux);
  }
  async function expectText(url, needles, label) {
    const t = norm(await open(url, label));
    for (const n of [].concat(needles)) ok(t.includes(norm(n)), `${label || url}: нет текста «${n}»`);
    return t;
  }
  const worldEp = () => page.evaluate(() => Number(JSON.parse(localStorage.getItem("mayak:worldEpisode") || "null")));
  // Профиль «Ленты» в текущем эпизоде мира: null если «Профиль не найден».
  async function social(nick) {
    await aux.goto(`${BASE}world/social/#${encodeURIComponent(nick)}`, { waitUntil: "load" });
    await aux.waitForSelector("#root > *");
    await noHScroll(aux, `Лента @${nick}`);
    return aux.evaluate((n) => {
      const v = window.World.view(n);
      return v && !document.querySelector(".notfound") ? JSON.parse(JSON.stringify(v)) : null;
    }, nick);
  }
  async function expectSocial(nick, needles, label) {
    const v = await social(nick);
    if (!ok(v, `${label || "Лента"}: профиль @${nick} не виден (worldEpisode=${await worldEp()})`)) return null;
    const blob = norm(JSON.stringify(v));
    for (const n of [].concat(needles || [])) ok(blob.includes(norm(n)), `@${nick}: нет «${n}»`);
    return v;
  }
  async function media(url, label) {
    const r = await fetchBuf(new URL(url, BASE).href);
    ok(r.status === 200 && r.buf.length > 0, `${label || url}: медиафайл не отдаётся (HTTP ${r.status})`);
    return r;
  }

  // ---- игровые действия
  async function startEpisode(id) {
    await page.goto(`${BASE}play.html#${id}`);
    await page.waitForSelector("#start-form, #answer-input, #accuse-form, .ending, .locked");
    ok(await page.$("#start-form"), `${id}: нет стартового экрана (есть доступ?)`);
    await noHScroll(page, `play#${id} старт`);
    if (!(await page.inputValue("#agent"))) await page.fill("#agent", "Ворон");
    await page.click("#start-form .btn");
  }
  async function chapterLinks() {
    await page.waitForSelector("#answer-input");
    return page.$$eval("#rest a[href]", (as) => as.map((a) => ({ href: a.href, label: a.textContent.trim() })));
  }
  async function tryAnswer(text) {
    await page.fill("#answer-input", text);
    await page.click("#answer-form .btn");
    await page.waitForFunction(() => { const f = document.querySelector("#feedback"); return !f || /good|bad/.test(f.className) || document.querySelector("#next-btn"); });
    return !!(await page.waitForSelector("#next-btn", { timeout: 1500 }).catch(() => null));
  }
  async function solveChapter(ep, ch, wrong, right) {
    const title = await page.textContent("#app h2");
    info(`${title}`);
    await noHScroll(page, `play#${ep} ${ch}`);
    if (wrong) ok(!(await tryAnswer(wrong)), `${ep}/${ch}: ловушка «${wrong}» принята как верная`);
    if (wrong) ok(await page.$(".feedback.bad"), `${ep}/${ch}: нет сообщения о неверном ответе`);
    if (await page.$("#hint-btn")) { await page.click("#hint-btn"); ok(await page.$(".hints ol li"), `${ep}/${ch}: подсказка не показалась`); }
    ok(await tryAnswer(right), `${ep}/${ch}: верный ответ «${right}» не принят`);
    await noHScroll(page, `play#${ep} ${ch} награда`);
    await page.click("#next-btn");
    await page.waitForSelector("#answer-input, #accuse-form");
  }
  async function accuse(ids) {
    await page.waitForSelector("#accuse-form");
    await page.$$eval("#accuse-form input", (els) => els.forEach((e) => { if (e.type === "checkbox") e.checked = false; }));
    for (const id of ids) await page.check(`#accuse-form input[value="${id}"]`);
    await page.click("#accuse-form .btn");
    await page.waitForFunction(() => document.querySelector("#accuse-form .btn").dataset.armed === "1");
    await page.click("#accuse-form .btn");
    await page.waitForSelector(".ending");
    await page.waitForSelector("#after:not([hidden])");
    return !!(await page.$(".ending.win"));
  }
  async function finale(ep, wrongIds, rightIds) {
    await noHScroll(page, `play#${ep} финал`);
    ok(!(await accuse(wrongIds)), `${ep}: неверный финал ${wrongIds.join("+")} засчитан как победа`);
    await page.click("#again-btn");
    ok(await accuse(rightIds), `${ep}: верный финал ${rightIds.join("+")} не принят`);
    await noHScroll(page, `play#${ep} эпилог`);
    ok((await worldEp()) >= Number(ep.slice(2)), `${ep}: mayak:worldEpisode после победы < ${ep.slice(2)}`);
  }
  async function homeStatuses() {
    await page.goto(BASE + "index.html");
    await page.waitForSelector(".ep .ep-status");
    await page.waitForFunction(() => !document.querySelector(".ep.soon") || true);
    await page.waitForTimeout(150); // manifest
    await noHScroll(page, "витрина");
    return page.$$eval(".ep .ep-status", (els) => els.map((e) => e.textContent.trim()));
  }
  async function checkLinksOpen(links, ep, ch) {
    for (const l of links) {
      const u = new URL(l.href);
      if (u.origin + "/" !== BASE) { ok(false, `${ep}/${ch}: внешняя ссылка ${l.href}`); continue; }
      if (u.pathname.startsWith("/world/social/")) {
        const nick = decodeURIComponent(u.hash.slice(1));
        ok(await social(nick), `${ep}/${ch}: ссылка «${l.label}» → @${nick} не виден (worldEpisode=${await worldEp()})`);
      } else await open(l.href, `${ep}/${ch} ссылка «${l.label}»`);
    }
  }
  const visible = async (nick) => !!(await social(nick));

  try {
    // =========================================================== ВИТРИНА (начало)
    head("Витрина: начало сезона");
    let st = await homeStatuses();
    info(st.join(" | "));
    ok(JSON.stringify(st) === JSON.stringify(["Не начат", "Заблокирован", "Заблокирован", "Заблокирован"]), `статусы в начале: ${st.join(", ")}`);
    await page.click('.ep [data-buy="ep2"]');
    await page.waitForSelector(".acc-modal[open]");
    const modal = await page.textContent(".acc-modal");
    ok(/199/.test(modal) && /скоро/i.test(modal), "модалка покупки ep2: нет цены или «оплата скоро»");
    await noHScroll(page, "модалка покупки");
    await page.click(".acc-modal .acc-x");
    await page.waitForFunction(() => !document.querySelector(".acc-modal[open]"));
    await page.click(`[data-buy="season-mayak"]`);
    await page.waitForSelector(".acc-modal[open]");
    ok(/449/.test(await page.textContent(".acc-modal")), "модалка сезона: нет цены 449");
    await page.fill("#acc-code-input", "WRONG-CODE-0000");
    await page.click("#acc-code button[type=submit]");
    await page.waitForSelector(".acc-msg.bad");
    await page.click(".acc-modal .acc-x");
    await page.fill("#code-input", "NOPE-1234");
    await page.click("#code-form button");
    await page.waitForSelector("#code-msg.bad");
    ok(true, "неверный код отклонён");
    ok(!(await page.evaluate(() => localStorage.getItem("mayak:keys"))) || (await page.evaluate(() => localStorage.getItem("mayak:keys"))) === "{}", "после неверного кода появились ключи");

    head("«Лента» в начале сезона");
    for (const n of ["vera.somova", "k.lebedev.arch", "mark.velsky", "lina.serves", "anna.velskaya"]) ok(await visible(n), `@${n} (эп.1) не виден`);
    for (const n of ["t.krylova.buh", "gleb.ortov", "sea.wolf.kron", "kulik.na.ostrove", "sonya.liniya", "k.lapteva"]) ok(!(await visible(n)), `@${n} виден до своего эпизода`);
    const keb1 = await social("k.lebedev.arch");
    const keb1Posts = keb1 ? keb1.items.length : 0;
    ok(keb1 && !/эллинг/i.test(JSON.stringify(keb1)), "@k.lebedev.arch: посты поздних эпизодов видны в эп.1");
    await aux.goto(`${BASE}world/social/#nobody.here`);
    ok(await aux.waitForSelector(".notfound"), "несуществующий ник не даёт «Профиль не найден»");
    const dataScripts = await aux.evaluate(() => [...document.scripts].map((x) => x.src).filter((x) => /\/data\/ep\d+\.js/.test(x)).map((x) => x.replace(/^.*\/data\//, "")));
    ok(dataScripts.join(",") === "ep1.js", `«Лента» в эп.1 загрузила данные будущих эпизодов: ${dataScripts.join(", ")}`);
    await aux.goto(`${BASE}world/social/#%E0%A4%A`);
    ok(await aux.waitForSelector(".notfound"), "битый хэш в «Ленте» не даёт «Профиль не найден»");
    for (const f of ["world/social/data/ep2.js", "world/social/data/ep4.js", "world/moretrack/data.js"]) {
      ok(!/\/\*|^\s*\/\//m.test(fs.readFileSync(path.join(DIST, f), "utf8")), `${f}: в dist остались комментарии`);
    }

    head("Заблокированный эпизод");
    await page.goto(`${BASE}play.html#ep2`);
    await page.waitForSelector(".locked");
    await noHScroll(page, "play#ep2 заблокирован");
    await page.click("#code-btn");
    await page.fill("#code-form #code-input", "BAD-CODE");
    await page.click("#code-form .btn");
    await page.waitForSelector("#code-feedback.bad");
    ok(true, "код на экране блокировки отклонён");
    await page.goto(`${BASE}play.html#ep3`);
    await page.waitForSelector(".locked");
    await page.goto(`${BASE}play.html#ep9`);
    await page.waitForSelector(".stamp");
    ok(/не найдено/i.test(await textOf(page)), "play#ep9: нет экрана «Дело не найдено»");
    await page.goto(`${BASE}index.html`);
    await page.goto(`${BASE}play.html#%E0%A4%A`);
    await page.waitForSelector(".stamp");
    ok(/не найдено/i.test(await textOf(page)), "play#<битый хэш>: нет экрана «Дело не найдено»");
    for (const bad of ['{"chapter":1,"solved":null,"evidence":null,"hints":null}', '{"chapter":1.5}', '"x"', '[1,2]']) {
      const keep = await page.evaluate(() => localStorage.getItem("mayak:progress:ep1"));
      await page.evaluate((v) => localStorage.setItem("mayak:progress:ep1", v), bad);
      await page.goto(`${BASE}index.html`);
      await page.goto(`${BASE}play.html#ep1`);
      const okScreen = await page.waitForSelector("#start-form, #answer-input, #accuse-form, .ending", { timeout: 5000 }).catch(() => null);
      ok(okScreen, `play#ep1 с испорченным прогрессом ${bad} зависает на загрузке`);
      await page.goto(`${BASE}index.html`);
      await page.evaluate((v) => v == null ? localStorage.removeItem("mayak:progress:ep1") : localStorage.setItem("mayak:progress:ep1", v), keep);
    }

    // =========================================================== ЭП.1
    head("Эпизод 1 «Дело №0913»");
    await startEpisode("ep1");
    ok((await worldEp()) === 1, "ep1: worldEpisode != 1");
    // Глава 1: ответ в рапорте внутри дела
    let links = await chapterLinks();
    ok(norm(await textOf(page)).includes("23:47"), "ep1/prologue: в рапорте нет 23:47");
    await solveChapter("ep1", "prologue", "12:00", "23:47");
    links = await chapterLinks();
    await checkLinksOpen(links, "ep1", "receipt");
    await expectSocial("vera.somova", ["Северный ветер", "4417"], "ep1/receipt");
    await solveChapter("ep1", "receipt", "Морской", "северный ветер");
    links = await chapterLinks();
    await checkLinksOpen(links, "ep1", "witness");
    await expectSocial("vera.somova", ["lina.serves"], "ep1/witness");
    await expectSocial("lina.serves", ["В.С."], "ep1/witness");
    await solveChapter("ep1", "witness", "АВ", "вс");
    links = await chapterLinks();
    await checkLinksOpen(links, "ep1", "source");
    await expectText("world/fund/index.html", ["Отчётность"], "ep1/source фонд");
    ok(/<!--[\s\S]*ПРИЛИВ[\s\S]*-->/.test((await fetchBuf(BASE + "world/fund/reports.html")).buf.toString("utf8")), "ep1/source: ПРИЛИВ не в HTML-комментарии reports.html");
    await solveChapter("ep1", "source", "маяк", "прилив");
    await finale("ep1", ["lebedev"], ["somova"]);
    ok((await worldEp()) === 1, "ep1: после победы worldEpisode должен остаться 1");
    ok(/play\.html#ep2/.test(await page.getAttribute(".next-ep a.btn", "href")), "ep1: нет перехода к эп.2");
    ok(!(await visible("t.krylova.buh")), "после эп.1 профиль эп.2 уже виден");

    head("Витрина: ввод кода");
    st = await homeStatuses();
    ok(JSON.stringify(st) === JSON.stringify(["Пройден", "Заблокирован", "Заблокирован", "Заблокирован"]), `статусы после эп.1: ${st.join(", ")}`);
    await page.fill("#code-input", "mayak demo 2026");
    await page.click("#code-form button");
    await page.waitForSelector("#code-msg.good", { timeout: 30000 });
    ok((await page.$$("#code-msg a")).length === 3, "код открыл не 3 эпизода");
    st = await homeStatuses();
    info(st.join(" | "));
    ok(JSON.stringify(st) === JSON.stringify(["Пройден", "Не начат", "Не начат", "Не начат"]), `статусы после кода: ${st.join(", ")}`);
    ok(/Весь сезон открыт|Сезон открыт/i.test(await page.evaluate(() => document.body.textContent)), "витрина не показывает, что сезон открыт");
    const keys = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("mayak:keys") || "{}")).sort());
    ok(JSON.stringify(keys) === '["ep2","ep3","ep4"]', `mayak:keys: ${keys}`);

    // =========================================================== ЭП.2
    head("Эпизод 2 «Партнёры»");
    await startEpisode("ep2");
    ok((await worldEp()) === 2, "ep2/ch1: worldEpisode != 2");
    links = await chapterLinks();
    await checkLinksOpen(links, "ep2", "registry");
    ok(norm(await textOf(page)).includes("0078 412 265"), "ep2/registry: в выписке нет ИНН 0078 412 265");
    await expectText("world/registry/#q=0078412265", ["Крылова Татьяна Сергеевна"], "ep2/registry поиск по ИНН");
    await expectText("world/registry/#org=0078412265", ["Нордлихт Трейдинг", "Крылова Татьяна Сергеевна"], "ep2/registry карточка");
    ok(!(await visible("sea.wolf.kron")), "в эп.2 виден профиль эп.3");
    await solveChapter("ep2", "registry", "Шилов", "Крылова Т.С.");

    links = await chapterLinks();
    await checkLinksOpen(links, "ep2", "base64");
    const kry = await expectSocial("t.krylova.buh", [], "ep2/base64");
    if (kry) {
      const b64 = (kry.bio.match(/[A-Za-z0-9+/=]{20,}/g) || []).join("");
      const decoded = Buffer.from(b64, "base64").toString("utf8");
      info(`Base64 → «${decoded}»`);
      ok(/яхтсмен/.test(decoded), "ep2/base64: строка в профиле не декодируется в ответ");
      const atobOk = await aux.evaluate((s) => { try { return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))); } catch (e) { return ""; } }, kry.bio.match(/[A-Za-z0-9+/=\n]{40,}/)?.[0] || b64);
      ok(/яхтсмен/.test(atobOk), "ep2/base64: atob в браузере не декодирует строку из профиля");
    }
    await solveChapter("ep2", "base64", "Debet = Kredit", "яхтсмен");

    links = await chapterLinks();
    await checkLinksOpen(links, "ep2", "address");
    const org = await expectText("world/registry/#org=0078412265", ["Шхерный"], "ep2/address карточка");
    ok(await aux.$('a[href*="addr=shkherny-9"]'), "ep2/address: в карточке нет ссылки на массовый адрес");
    const addr = await expectText("world/registry/#addr=shkherny-9", ["03.06.2026", "Ортов Глеб Андреевич", "Галс"], "ep2/address массовый адрес");
    ok((addr.match(/03\.06\.2026/g) || []).length === 2, "ep2/address: дата 03.06.2026 должна встречаться ровно у двух фирм");
    await solveChapter("ep2", "address", "Крылова", "Ортов");

    links = await chapterLinks();
    await checkLinksOpen(links, "ep2", "robots");
    const gleb = await expectSocial("gleb.ortov", ["ortov-yachts"], "ep2/robots");
    if (gleb && gleb.link) await open(new URL(gleb.link.url, BASE + "world/social/").href, "ep2/robots ссылка из профиля Ортова");
    const robots = await fetchBuf(BASE + "world/ortov-yachts/robots.txt");
    ok(robots.status === 200 && /owners-club-26/.test(robots.buf.toString()), "ep2/robots: robots.txt не отдаётся или без owners-club-26");
    await expectText("world/ortov-yachts/admin/", [], "ep2/robots admin");
    await expectText("world/ortov-yachts/owners-club-26/", ["Галс", "ШТИЛЬ", "Альбатрос Марин"], "ep2/robots закрытый раздел");
    const card = await media("world/media/ep2/owner-card.jpg", "ep2 карточка владельца");
    ok(jpegSize(card.buf), "ep2: owner-card.jpg не JPEG");
    await solveChapter("ep2", "robots", "зюйд", "штиль");
    await finale("ep2", ["broker"], ["albatros"]);
    ok((await worldEp()) === 2, "ep2: worldEpisode после победы != 2");
    const keb2 = await social("k.lebedev.arch");
    ok(keb2 && keb2.items.length > keb1Posts, "@k.lebedev.arch: посты эп.2 не добавились к эп.1");

    // =========================================================== ЭП.3
    head("Эпизод 3 «Альбатрос»");
    await startEpisode("ep3");
    ok((await worldEp()) === 3, "ep3/ch1: worldEpisode != 3");
    links = await chapterLinks();
    await checkLinksOpen(links, "ep3", "exif");
    await expectSocial("gleb.ortov", ["seskar-original.jpg"], "ep3/exif");
    await aux.goto(`${BASE}world/social/#gleb.ortov`);
    await aux.click('.tile[data-i="0"]');
    await aux.waitForSelector("#post[open]");
    const dl = await aux.getAttribute('#post a[download][href$="seskar-original.jpg"]', "href").catch(() => null);
    ok(dl, "ep3/exif: в окне первого поста Ортова нет «Скачать оригинал»");
    await noHScroll(aux, "ep3/exif окно поста");
    if (dl) {
      const orig = await media(new URL(dl, BASE + "world/social/").href, "ep3 оригинал фото");
      ok(orig.buf.equals(fs.readFileSync(path.join(ROOT, "world/media/ep3/seskar-original.jpg"))), "ep3/exif: скачанный файл не совпадает с исходником");
      const ex = readExif(orig.buf);
      if (ok(ex && ex.gps[2], "ep3/exif: в оригинале нет GPS")) {
        const dms = (a) => a[0] + a[1] / 60 + a[2] / 3600;
        const lat = dms(ex.gps[2]) * (ex.gps[1] === "S" ? -1 : 1), lon = dms(ex.gps[4]) * (ex.gps[3] === "W" ? -1 : 1);
        info(`EXIF GPS ${lat.toFixed(5)}, ${lon.toFixed(5)}; DateTimeOriginal ${ex.exif[0x9003]} ${ex.exif[0x9011] || ""}`);
        // о. Сескар ≈ 60.03 N, 28.38 E
        ok(Math.abs(lat - 60.03) < 0.03 && Math.abs(lon - 28.37) < 0.06, "ep3/exif: координаты не на о. Сескар");
        ok(ex.exif[0x9003] === "2026:11:01 07:46:12", "ep3/exif: DateTimeOriginal не 2026:11:01 07:46:12");
      }
      const small = readExif((await media("world/media/ep3/seskar-dawn.jpg")).buf);
      ok(!small || !small.gps[2], "ep3/exif: уменьшенная копия содержит GPS");
    }
    await solveChapter("ep3", "exif", "Гогланд", "остров Сескар");

    links = await chapterLinks();
    await checkLinksOpen(links, "ep3", "moretrack");
    await expectText("world/moretrack/#q=Альбатрос", ["Альбатрос"], "ep3/moretrack поиск");
    await expectText("world/moretrack/#v=albatros-yacht", ["31.10.2026 21:31", "UTC"], "ep3/moretrack судно");
    await expectSocial("sea.wolf.kron", ["двенадцать"], "ep3/moretrack свидетель");
    await solveChapter("ep3", "moretrack", "21:31", "00:31");

    links = await chapterLinks();
    await checkLinksOpen(links, "ep3", "morse");
    await open("world/efir/thread-2611.html", "ep3/morse форум");
    const wavHref = await aux.$$eval('a[href$=".wav"], audio[src$=".wav"], audio source[src$=".wav"]', (as) => as.map((a) => a.href || a.src));
    ok(wavHref.some((h) => /efir-0358\.wav$/.test(h)), "ep3/morse: на форуме нет ссылки на efir-0358.wav");
    const ew = readWav((await media("world/media/ep3/efir-0358.wav", "ep3 WAV")).buf);
    if (ok(ew && ew.samples, "ep3/morse: WAV не PCM16")) {
      const txt = decodeMorse(ew, 700);
      info(`Морзе → «${txt}»`);
      ok(/LOTSMAN DE ALBATROS ZHDU 0800 U SEVERNOGO MYSA/.test(txt), "ep3/morse: запись не декодируется в LOTSMAN DE ALBATROS ZHDU 0800 …");
    }
    await solveChapter("ep3", "morse", "08:40", "8:00");

    links = await chapterLinks();
    await checkLinksOpen(links, "ep3", "timeline");
    await expectSocial("kulik.na.ostrove", ["08:05", "08:40"], "ep3/timeline свидетель");
    const area = await expectText("world/moretrack/#area=seskar&date=2026-11-01", ["Створ", "04:58", "05:44", "Пикша"], "ep3/timeline журнал района");
    await solveChapter("ep3", "timeline", "Пикша", "Створ");
    await finale("ep3", ["utc"], ["seskar"]);

    // =========================================================== ЭП.4
    head("Эпизод 4 «Лоцман»");
    await startEpisode("ep4");
    ok((await worldEp()) === 4, "ep4/ch1: worldEpisode != 4");
    links = await chapterLinks();
    ok(norm(await textOf(page)).includes("tetrad.lenta/lotsman"), "ep4/archive: в деле нет адреса блога");
    await checkLinksOpen(links, "ep4", "archive");
    await open("world/webpamyat/", "ep4/archive поиск");
    await aux.fill("input", "https://www.Tetrad.lenta/lotsman");
    await aux.press("input", "Enter");
    await aux.waitForTimeout(150);
    ok(await aux.$('a[href*="lotsman/"]'), "ep4/archive: поиск по адресу блога не дал ссылку на календарь");
    await expectText("world/webpamyat/lotsman/", ["2025", "2026"], "ep4/archive календарь");
    ok(await aux.$('a[href*="20250614"]'), "ep4/archive: в календаре нет снимка 14.06.2025");
    await expectText("world/webpamyat/lotsman/20250614/about.html", ["архитектор"], "ep4/archive об авторе 2025");
    await expectText("world/webpamyat/lotsman/20260905/about.html", ["лоцман"], "ep4/archive ловушка 2026");
    await solveChapter("ep4", "archive", "лоцман", "архитектор");

    links = await chapterLinks();
    await checkLinksOpen(links, "ep4", "spectrogram");
    await open("world/webpamyat/lotsman/20260905/index.html", "ep4/spectrogram снимок 05.09.2026");
    ok(await aux.$('a[href$="otliv.wav"], audio[src$="otliv.wav"], source[src$="otliv.wav"]'), "ep4/spectrogram: в снимке нет otliv.wav");
    const ow = readWav((await media("world/media/ep4/otliv.wav", "ep4 otliv.wav")).buf);
    if (ok(ow && ow.samples, "ep4/spectrogram: WAV не PCM16")) {
      const c = bandContrast(ow, 2200, 7800, 0.8, 5.4);
      info(`спектрограмма: контраст полосы 2,2–7,8 кГц в 0,8–5,4 с = ${c.toFixed(1)}×`);
      ok(c > 10, "ep4/spectrogram: в полосе 2–8 кГц не видно «надписи»");
    }
    const pw = readWav((await media("world/media/ep4/priboy.wav", "ep4 priboy.wav")).buf);
    if (pw && pw.samples) ok(bandContrast(pw, 2200, 7800, 0.8, 3.2) < 3, "ep4: в ловушке priboy.wav тоже есть надпись");
    await solveChapter("ep4", "spectrogram", "прибой", "Вера");

    links = await chapterLinks();
    await checkLinksOpen(links, "ep4", "alibi");
    await expectSocial("k.lebedev.arch", ["23:10", "Весь вечер дома"], "ep4/alibi пост эп.1");
    await expectSocial("sonya.liniya", ["sonya-desk.jpg"], "ep4/alibi фото Сони");
    const sd = await media("world/media/ep4/sonya-desk.jpg", "ep4 sonya-desk.jpg");
    ok((jpegSize(sd.buf) || {}).w >= 1000, "ep4/alibi: фото Сони слишком мелкое для чтения часов");
    await solveChapter("ep4", "alibi", "23:10", "16:40");

    links = await chapterLinks();
    await checkLinksOpen(links, "ep4", "signature");
    await expectSocial("k.lapteva", ["К.Л."], "ep4/signature ловушка");
    await open("world/webpamyat/mayak-fund/", "ep4/signature календарь фонда");
    ok(await aux.$('a[href*="20251220"]'), "ep4/signature: нет снимка фонда 20.12.2025");
    const docsHtml = (await fetchBuf(BASE + "world/webpamyat/mayak-fund/20251220/docs.html")).buf.toString("utf8");
    ok(/protokol-4\.jpg/.test(docsHtml), "ep4/signature: в снимке документов нет протокола");
    await open("world/webpamyat/mayak-fund/20251220/docs.html", "ep4/signature документы фонда");
    await media("world/media/ep4/protokol-4.jpg", "ep4 protokol-4.jpg");
    ok(/owner-card\.jpg/.test((await fetchBuf(BASE + "world/ortov-yachts/owners-club-26/")).buf.toString()), "ep4/signature: в журнале сделок нет карточки владельца");
    await solveChapter("ep4", "signature", "Лаптева", "Лебедев");
    await finale("ep4", ["alibi", "blog", "card", "lebedev", "sign"], ["alibi", "blog", "lebedev", "sign", "vera"]);
    ok(/завершён/i.test(await textOf(page)), "ep4: нет сообщения о завершении сезона");

    head("Витрина: конец сезона");
    st = await homeStatuses();
    info(st.join(" | "));
    ok(st.every((s) => s === "Пройден"), `статусы в конце: ${st.join(", ")}`);
    ok(/Сезон завершён/.test(await page.textContent("#progress-text")), "прогресс не показывает завершение сезона");
    ok(/4\/4/.test(await page.textContent("#nav-progress")), "индикатор прогресса не 4/4");

    // =========================================================== «Лента»: слияние
    head("«Лента»: слияние эп.1–4");
    const nicks = new Set();
    for (const f of fs.readdirSync(path.join(DIST, "world/social/data"))) {
      for (const m of fs.readFileSync(path.join(DIST, "world/social/data", f), "utf8").matchAll(/World\.(?:profile|posts|bio)\("([^"]+)"/g)) nicks.add(m[1]);
    }
    for (const n of nicks) {
      const v = await social(n);
      if (!ok(v, `@${n} не виден при worldEpisode=4`)) continue;
      ok(await aux.$("footer") && /Вымышленн/.test(await aux.textContent("footer")), `@${n}: нет подвала о вымышленности`);
      const tiles = await aux.$$(".tile");
      ok(tiles.length === v.items.length, `@${n}: плиток ${tiles.length}, постов ${v.items.length}`);
      for (let i = 0; i < Math.min(tiles.length, 8); i++) {
        await aux.click(`.tile[data-i="${i}"]`);
        await aux.waitForSelector("#post[open]");
        await noHScroll(aux, `@${n} пост ${i}`);
        const brokenImg = await aux.$$eval("#post img", (imgs) => imgs.filter((im) => !im.complete || !im.naturalWidth).length).catch(() => 0);
        if (brokenImg) await aux.waitForTimeout(400);
        ok(!(await aux.$$eval("#post img", (imgs) => imgs.filter((im) => !im.naturalWidth).length)), `@${n} пост ${i}: картинка не загрузилась`);
        await aux.click("#close");
      }
    }
    const keb4 = await social("k.lebedev.arch");
    ok(keb4 && keb4.items.length > keb2.items.length, "@k.lebedev.arch: посты эп.3–4 не добавились");
    ok(keb4 && /23:10/.test(JSON.stringify(keb4)), "@k.lebedev.arch: пропал пост эп.1 после слияния");

    // =========================================================== обход world/
    head("Обход world/: ошибки, ссылки, 390px, подвал");
    const pages = [];
    (function walk(dir) {
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (f.endsWith(".html")) pages.push(path.relative(DIST, p).split(path.sep).join("/"));
      }
    })(path.join(DIST, "world"));
    const checkedUrls = new Map();
    for (const p of pages) {
      await open(p, p);
      if (!p.startsWith("world/social/")) {
        const foot = await aux.evaluate(() => document.body.innerText);
        ok(/Вымышленный сайт для игры «Маяк»\. Все совпадения случайны\./.test(foot), `${p}: нет строки «Вымышленный сайт для игры «Маяк». Все совпадения случайны.»`);
      }
      const refs = await aux.evaluate(() => {
        const abs = (v) => { try { return new URL(v, document.baseURI).href; } catch (e) { return String(v); } };
        return [
          ...[...document.querySelectorAll("a[href], link[href]")].map((a) => abs(a.getAttribute("href"))),
          ...[...document.querySelectorAll("img[src], audio[src], source[src], video[src], script[src]")].map((e) => abs(e.getAttribute("src")))
        ];
      });
      for (const r of refs) {
        if (/^(data|mailto|javascript|blob):/.test(r)) continue;
        let u;
        try { u = new URL(r); } catch (e) { ok(false, `${p}: некорректный адрес «${r}»`); continue; }
        if (u.origin + "/" !== BASE) { ok(false, `${p}: внешняя ссылка ${r}`); continue; }
        const key = u.origin + u.pathname;
        if (!checkedUrls.has(key)) checkedUrls.set(key, (await fetchBuf(key)).status);
        ok(checkedUrls.get(key) === 200, `${p}: битая ссылка ${u.pathname} (HTTP ${checkedUrls.get(key)})`);
      }
    }
    info(`страниц: ${pages.length}, уникальных ссылок проверено: ${checkedUrls.size}`);

    head("Движок: экраны на 390px");
    for (const id of ["ep1", "ep2", "ep3", "ep4"]) {
      await page.goto(`${BASE}play.html#${id}`);
      await page.waitForSelector(".ending");
      await noHScroll(page, `play#${id} (пройден)`);
      await page.click("#btn-evidence");
      await noHScroll(page, `play#${id} панель улик`);
    }

    head("Ссылка с кодом ?code= (новый браузер)");
    const ctx2 = await browser.newContext({ viewport: { width: W, height: H }, reducedMotion: "reduce" });
    const p2 = watch(await ctx2.newPage());
    await p2.goto(`${BASE}index.html?code=${CODE}`);
    await p2.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem("mayak:keys") || "{}")).length === 3, null, { timeout: 30000 }).catch(() => null);
    ok((await p2.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("mayak:keys") || "{}")).length)) === 3, "?code= не открыл эпизоды");
    await p2.goto(`${BASE}play.html#ep4`);
    await p2.waitForSelector("#start-form");
    ok(await p2.$("#start-form"), "?code=: эп.4 не открылся");
    await ctx2.close();
  } catch (e) {
    ok(false, `сценарий прерван:${e.message.split("\n")[0]}`);
    try { await page.screenshot({ path: path.join(require("os").tmpdir(), "mayak-playtest-fail.png"), fullPage: true }); console.log(`   скриншот: ${path.join(require("os").tmpdir(), "mayak-playtest-fail.png")}`); } catch (e2) { /* нет */ }
  }

  await browser.close();
  server.close();
  console.log("\n" + "=".repeat(60));
  if (problems.length) {
    console.log(`ПРОВАЛ: ${problems.length} проблем(ы), успешных проверок: ${passed}`);
    for (const p of problems) console.log(" - " + p);
    process.exit(1);
  }
  console.log(`ОК: все проверки пройдены (${passed}).`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
