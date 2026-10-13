#!/usr/bin/env node
/*
 * Сборка платформы «Маяк».
 *
 *   node tools/build.js            → quests/<id>/quest(.enc).json + dist/
 *   node tools/build.js --no-dist  → только quests/
 *
 * Для каждого квеста из js/platform/catalog.js:
 *   content/<id>/quest.js (открытые ответы) → answers превращаются в answerHash (соль "<id>:");
 *   бесплатный → quests/<id>/quest.json;
 *   платный    → quests/<id>/quest.enc.json (AES-GCM, ключ K из content/<id>/key.json,
 *                обёртки K для кодов из content/codes.json[<id>] + content/codes.json.season).
 * Затем публикуемое копируется в dist/: index.html, play.html, css, js, quests, world, .nojekyll.
 * content/, tools/, docs/ в dist НЕ попадают.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Answers = require("../js/core/answers.js");
const Vault = require("../js/core/vault.js");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const PUBLISH = ["index.html", "play.html", ".nojekyll", "css", "js", "quests", "world"];

const warnings = [];
const warn = (m) => { warnings.push(m); console.warn("⚠  " + m); };
const fail = (m) => { console.error("✖  " + m); process.exitCode = 1; };
const rel = (p) => path.relative(ROOT, p);

function loadCatalog() {
  const file = path.join(ROOT, "js/platform/catalog.js");
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
  const cat = sandbox.window.CATALOG;
  if (!cat || !Array.isArray(cat.quests)) throw new Error("catalog.js: нет window.CATALOG.quests");
  return cat;
}

function loadQuestSource(id) {
  const file = path.join(ROOT, "content", id, "quest.js");
  if (!fs.existsSync(file)) return null;
  delete require.cache[require.resolve(file)];
  return require(file);
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return fallback; }
}

// ---------- проверка исходника ----------
function validate(q, meta) {
  const errs = [];
  const where = `content/${meta.id}/quest.js`;
  if (q.id !== meta.id) errs.push(`id "${q.id}" не совпадает с каталогом "${meta.id}"`);
  if (!q.title) errs.push("нет title");
  if (!Array.isArray(q.chapters) || !q.chapters.length) errs.push("нет chapters");
  const chIds = new Set();
  const evIds = new Set();
  (q.chapters || []).forEach((ch, i) => {
    const at = `глава ${i + 1} (${ch.id || "без id"})`;
    if (!ch.id) errs.push(`${at}: нет id`);
    else if (chIds.has(ch.id)) errs.push(`${at}: повтор id`);
    chIds.add(ch.id);
    if (!ch.title) errs.push(`${at}: нет title`);
    if (!Array.isArray(ch.briefing) || !ch.briefing.length) errs.push(`${at}: briefing должен быть непустым массивом`);
    if (!ch.task || !ch.task.prompt) errs.push(`${at}: нет task.prompt`);
    else {
      if (!Array.isArray(ch.task.answers) || !ch.task.answers.length) errs.push(`${at}: нет task.answers`);
      else ch.task.answers.forEach((a) => { if (!Answers.normalize(a)) errs.push(`${at}: ответ "${a}" после нормализации пуст`); });
      if (!Array.isArray(ch.task.hints) || ch.task.hints.length < 1) warn(`${where}: ${at}: нет подсказок`);
    }
    if (!ch.reward || !Array.isArray(ch.reward.evidence) || !ch.reward.evidence.length) errs.push(`${at}: нет reward.evidence`);
    else ch.reward.evidence.forEach((e) => {
      if (!e.id || !e.title) errs.push(`${at}: улика без id/title`);
      if (evIds.has(e.id)) errs.push(`${at}: повтор id улики "${e.id}"`);
      evIds.add(e.id);
    });
    (ch.links || []).forEach((l) => {
      if (/^(https?:)?\/\//.test(l.url)) warn(`${where}: ${at}: внешняя ссылка ${l.url}`);
      else {
        const target = l.url.split("#")[0].split("?")[0];
        const abs = path.join(ROOT, target.endsWith("/") || !target ? path.join(target, "index.html") : target);
        if (target && !fs.existsSync(abs)) warn(`${where}: ${at}: ссылка ведёт на несуществующий файл ${l.url}`);
      }
    });
  });
  const f = q.finale;
  if (!f) errs.push("нет finale");
  else {
    if (!Array.isArray(f.options) || !f.options.length) errs.push("finale: нет options");
    if (!Array.isArray(f.answers) || !f.answers.length) errs.push("finale: нет answers");
    if (!Array.isArray(f.win) || !Array.isArray(f.lose)) errs.push("finale: нужны массивы win и lose");
    const optIds = new Set((f.options || []).map((o) => o.id));
    (f.answers || []).forEach((a) => {
      const parts = f.multi ? String(a).split("+") : [String(a)];
      parts.forEach((p) => { if (!optIds.has(p)) errs.push(`finale: ответ "${a}" ссылается на неизвестный вариант "${p}"`); });
      if (f.multi) {
        const sorted = parts.slice().sort().join("+");
        if (sorted !== a) errs.push(`finale: ответ "${a}" должен быть отсортирован по алфавиту: "${sorted}"`);
      }
    });
  }
  return errs.map((e) => `${where}: ${e}`);
}

// ---------- преобразование ----------
async function compile(q) {
  const salt = `${q.id}:`;
  const out = JSON.parse(JSON.stringify(q));
  out.salt = salt;
  const hashAll = (list) => Promise.all(list.map((a) => Answers.hashAnswer(salt, a)));
  for (const ch of out.chapters) {
    ch.task.answerHash = await hashAll(ch.task.answers);
    delete ch.task.answers;
  }
  out.finale.answerHash = await hashAll(out.finale.answers);
  delete out.finale.answers;
  return out;
}

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === "string" ? data : JSON.stringify(data, null, 0) + "\n");
}

async function encryptQuest(id, compiled, codes) {
  const keyFile = path.join(ROOT, "content", id, "key.json");
  let keyData = readJson(keyFile, null);
  if (!keyData || !keyData.k) {
    keyData = { k: Vault.generateKey(), note: "Ключ контента эпизода. Не публиковать. Смена ключа делает старые ключи игроков недействительными." };
    write(keyFile, JSON.stringify(keyData, null, 2) + "\n");
    console.log(`   новый ключ контента: ${rel(keyFile)}`);
  }
  const outFile = path.join(ROOT, "quests", id, "quest.enc.json");
  // Не перешифровываем без изменений, чтобы не плодить диффы.
  const prev = readJson(outFile, null);
  if (prev) {
    try {
      const wantKids = (await Promise.all([...new Set(codes.map(Vault.normalizeCode))].map(Vault.kidOf))).sort().join(",");
      const haveKids = prev.keys.map((k) => k.kid).sort().join(",");
      const old = await Vault.decrypt(prev, keyData.k);
      if (wantKids === haveKids && JSON.stringify(old) === JSON.stringify(compiled)) return { file: outFile, unchanged: true };
    } catch (e) { /* пересоберём */ }
  }
  const enc = await Vault.encrypt(compiled, keyData.k, codes);
  // Самопроверка: каждый код открывает эпизод.
  for (const c of codes) {
    const K = await Vault.unlockWithCode(enc, c);
    if (K !== keyData.k) throw new Error(`${id}: код ${c} не открывает ключ`);
  }
  write(outFile, enc);
  return { file: outFile, unchanged: false };
}

function copyRecursive(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      if (name === ".DS_Store") continue;
      copyRecursive(path.join(src, name), path.join(dst, name));
    }
  } else {
    fs.copyFileSync(src, dst);
  }
}

async function main() {
  const noDist = process.argv.includes("--no-dist");
  const catalog = loadCatalog();
  const codesFile = path.join(ROOT, "content", "codes.json");
  const codes = readJson(codesFile, null);
  if (!codes) warn(`${rel(codesFile)} не найден — платные эпизоды не будут собраны`);

  console.log(`Сезон «${catalog.season.title}»: ${catalog.quests.length} эпизод(ов)`);
  const manifest = { season: catalog.season.id, quests: {} };
  for (const meta of catalog.quests) {
    const src = loadQuestSource(meta.id);
    if (!src) {
      // Исходника нет (ещё не написан или хранится в приватном репозитории): используем ранее собранный файл, если он есть.
      const file = meta.free ? "quest.json" : "quest.enc.json";
      if (fs.existsSync(path.join(ROOT, "quests", meta.id, file))) {
        warn(`content/${meta.id}/quest.js нет — публикуется ранее собранный quests/${meta.id}/${file}`);
        manifest.quests[meta.id] = { file, free: !!meta.free };
      } else {
        warn(`content/${meta.id}/quest.js нет — эпизод ${meta.number} пропущен`);
      }
      continue;
    }
    const errs = validate(src, meta);
    if (errs.length) { errs.forEach(fail); continue; }
    const compiled = await compile(src);
    const dir = path.join(ROOT, "quests", meta.id);
    if (meta.free) {
      fs.rmSync(path.join(dir, "quest.enc.json"), { force: true });
      write(path.join(dir, "quest.json"), compiled);
      console.log(`✔  ${meta.id}: бесплатный → ${rel(path.join(dir, "quest.json"))}`);
      manifest.quests[meta.id] = { file: "quest.json", free: true };
    } else {
      fs.rmSync(path.join(dir, "quest.json"), { force: true });
      const list = [...(codes && codes[meta.id] || []), ...(codes && codes.season || [])];
      if (!list.length) { fail(`${meta.id}: нет ни одного кода доступа в content/codes.json`); continue; }
      const r = await encryptQuest(meta.id, compiled, list);
      console.log(`✔  ${meta.id}: платный → ${rel(r.file)} (${new Set(list.map(Vault.normalizeCode)).size} код(ов))${r.unchanged ? ", без изменений" : ""}`);
      manifest.quests[meta.id] = { file: "quest.enc.json", free: false };
    }
  }
  write(path.join(ROOT, "quests", "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  // Квесты, которых больше нет в каталоге.
  const qdir = path.join(ROOT, "quests");
  if (fs.existsSync(qdir)) {
    for (const name of fs.readdirSync(qdir)) {
      if (name !== "manifest.json" && !catalog.quests.some((q) => q.id === name)) warn(`quests/${name} нет в каталоге (не удалён, проверьте вручную)`);
    }
  }

  if (!noDist && !process.exitCode) {
    fs.rmSync(DIST, { recursive: true, force: true });
    fs.mkdirSync(DIST, { recursive: true });
    for (const item of PUBLISH) {
      const src = path.join(ROOT, item);
      if (!fs.existsSync(src)) { warn(`нет ${item} — не скопирован`); continue; }
      copyRecursive(src, path.join(DIST, item));
    }
    // Страховка: секреты не должны попасть в публикацию.
    const leaks = [];
    (function scan(d) {
      for (const n of fs.readdirSync(d)) {
        const p = path.join(d, n);
        if (fs.statSync(p).isDirectory()) scan(p);
        else if (n === "key.json" || n === "codes.json" || (n === "quest.js" && p.includes(`${path.sep}content${path.sep}`))) leaks.push(rel(p));
      }
    })(DIST);
    if (leaks.length) { leaks.forEach((l) => fail(`секрет в dist: ${l}`)); }
    else console.log(`✔  dist/ готов: ${PUBLISH.join(", ")}`);
  }
  if (warnings.length) console.log(`Предупреждений: ${warnings.length}`);
  if (process.exitCode) console.error("Сборка завершилась с ошибками.");
}

main().catch((e) => { console.error(e); process.exit(1); });
