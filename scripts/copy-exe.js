// После сборки кладёт готовый плеер в корень проекта: Deka.exe и Deka-setup.exe.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const rel = path.join(root, "src-tauri", "target", "release");
const win = process.platform === "win32";

const src = path.join(rel, win ? "deka.exe" : "deka");
const dst = path.join(root, win ? "Deka.exe" : "Deka");
try {
  fs.copyFileSync(src, dst);
} catch (e) {
  console.error("\nНе удалось скопировать плеер в корень папки. Закройте «Деку» и запустите сборку ещё раз.\n" + e.message);
  process.exit(1);
}

const nsis = path.join(rel, "bundle", "nsis");
if (fs.existsSync(nsis)) {
  const setup = fs.readdirSync(nsis).filter((f) => f.endsWith("-setup.exe")).sort().pop();
  if (setup) fs.copyFileSync(path.join(nsis, setup), path.join(root, "Deka-setup.exe"));
}
console.log("\nГотово: " + dst);
