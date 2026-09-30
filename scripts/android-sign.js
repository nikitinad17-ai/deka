// Подключает постоянный ключ подписи к Android-проекту, который Tauri генерирует в CI.
// Один и тот же ключ нужен, чтобы новые версии .apk ставились поверх старых
// (без удаления приложения и без потери входа в аккаунты).
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const cfg = JSON.parse(fs.readFileSync(path.join(root, "android", "signing.json"), "utf8"));
const androidDir = path.join(root, "src-tauri", "gen", "android");

fs.writeFileSync(
  path.join(androidDir, "keystore.properties"),
  [
    `keyAlias=${cfg.keyAlias}`,
    `password=${cfg.password}`,
    `storeFile=${path.join(root, cfg.storeFile).replace(/\\/g, "/")}`,
  ].join("\n") + "\n"
);

const gradle = path.join(androidDir, "app", "build.gradle.kts");
let s = fs.readFileSync(gradle, "utf8");
if (!s.includes("signingConfigs")) {
  if (!s.includes("import java.io.FileInputStream")) s = "import java.io.FileInputStream\n" + s;
  s = s.replace(/android\s*\{/, (m) => m + `
    signingConfigs {
        create("release") {
            val props = java.util.Properties()
            props.load(FileInputStream(rootProject.file("keystore.properties")))
            keyAlias = props["keyAlias"] as String
            keyPassword = props["password"] as String
            storeFile = file(props["storeFile"] as String)
            storePassword = props["password"] as String
            storeType = "pkcs12"
        }
    }`);
  const before = s;
  s = s.replace(/getByName\("release"\)\s*\{/, (m) => m + `
            signingConfig = signingConfigs.getByName("release")`);
  if (s === before) {
    console.error("Не нашёл блок release в build.gradle.kts — подпись не подключена");
    process.exit(1);
  }
  fs.writeFileSync(gradle, s);
}
console.log("Подпись .apk подключена");
