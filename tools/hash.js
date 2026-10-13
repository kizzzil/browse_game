#!/usr/bin/env node
// Посчитать хэш ответа (обычно не нужно: tools/build.js хэширует answers из content/<id>/quest.js сам).
//   node tools/hash.js "Северный ветер"                  (соль по умолчанию "ep1:")
//   node tools/hash.js --quest ep2 "ответ" ["ответ2" …]   (соль "ep2:")
//   node tools/hash.js --salt "ep3:" "ответ"
const path = require("path");
const Answers = require(path.join(__dirname, "..", "js", "core", "answers.js"));

const args = process.argv.slice(2);
let salt = "ep1:";
let i = args.indexOf("--salt");
if (i !== -1) { salt = args[i + 1]; args.splice(i, 2); }
i = args.indexOf("--quest");
if (i !== -1) { salt = args[i + 1] + ":"; args.splice(i, 2); }
if (!args.length) {
  console.error('Использование: node tools/hash.js [--quest ep2 | --salt "соль"] "ответ" ["ответ2" ...]');
  process.exit(1);
}
(async () => {
  for (const a of args) {
    const h = await Answers.hashAnswer(salt, a);
    const fb = Answers.sha256Fallback(new TextEncoder().encode(salt + Answers.normalize(a)));
    if (h !== fb) throw new Error("fallback SHA-256 mismatch");
    console.log(`${JSON.stringify(a)} → "${Answers.normalize(a)}" (соль ${JSON.stringify(salt)})\n  ${h}`);
  }
})();
