#!/usr/bin/env node
// Посчитать хэш ответа для case.js:
//   node tools/hash.js "Северный ветер"
//   node tools/hash.js --salt "my-case:" "ответ"
const path = require("path");
const Answers = require(path.join(__dirname, "..", "js", "answers.js"));

const args = process.argv.slice(2);
let salt = "mayak-01:";
const i = args.indexOf("--salt");
if (i !== -1) { salt = args[i + 1]; args.splice(i, 2); }
if (!args.length) {
  console.error('Использование: node tools/hash.js [--salt "соль"] "ответ" ["ответ2" ...]');
  process.exit(1);
}
(async () => {
  for (const a of args) {
    const h = await Answers.hashAnswer(salt, a);
    const fb = Answers.sha256Fallback(new TextEncoder().encode(salt + Answers.normalize(a)));
    if (h !== fb) throw new Error("fallback SHA-256 mismatch");
    console.log(`${JSON.stringify(a)} → "${Answers.normalize(a)}"\n  ${h}`);
  }
})();
