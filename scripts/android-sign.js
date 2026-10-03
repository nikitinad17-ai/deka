// Подключает Android release signing только из переменных окружения.
// Ключ и пароль не должны храниться в репозитории.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const keyAlias = process.env.ANDROID_KEY_ALIAS;
const password = process.env.ANDROID_KEYSTORE_PASSWORD;
const storeFile = process.env.ANDROID_KEYSTORE_PATH || path.join(root, "android", "deka-release.p12");

if (!keyAlias || !password || !fs.existsSync(storeFile)) {
  console.error("Android signing не настроен: нужны ANDROID_KEY_ALIAS, ANDROID_KEYSTORE_PASSWORD и ANDROID_KEYSTORE_PATH.");
  process.exit(1);
}

const androidDir = path.join(root, "src-tauri", "gen", "android");

fs.writeFileSync(
  path.join(androidDir, "keystore.properties"),
  [
    `keyAlias=${keyAlias}`,
    `password=${password}`,
    `storeFile=${storeFile.replace(/\\/g, "/")}`,
  ].join("\n") + "\n"
);

const gradle = path.join(androidDir, "app", "build.gradle.kts");
let s = fs.readFileSync(gradle, "utf8");
if (!s.includes("signingConfigs")) {
  if (!s.includes("import java.io.FileInputStream")) s = "import java.io.FileInputStream\n" + s;
  if (!s.includes("import java.util.Properties")) s = "import java.util.Properties\n" + s;
  s = s.replace(/android\s*\{/, (m) => m + `
    signingConfigs {
        create("release") {
            val props = Properties()
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
console.log("Подпись .apk подключена из защищённых переменных окружения");
