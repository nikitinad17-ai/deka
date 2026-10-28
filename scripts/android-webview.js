// Настраивает Android-проект, который Tauri генерирует в CI, чтобы «Дека» играла
// при выключенном экране:
// 1) WebView может запускать медиа без дополнительного касания;
// 2) wry ставит WebView на паузу вместе с активностью (а она «на паузе», когда гаснет
//    экран). MainActivity сразу снимает эту паузу. Окно WebView само не считает себя
//    скрытым — это делает код из .cargo/config.toml (WRY_RUSTWEBVIEW_CLASS_EXTENSION);
// 3) процесс страницы важен и в фоне (renderer priority), его не выгружают;
// 4) DekaAndroid.keepAwake(true/false) управляет foreground media service. Сервис
//    держит PARTIAL_WAKE_LOCK и Wi‑Fi и НЕ гасится на коротких паузах (между треками,
//    при подгрузке, при переходе по страницам VK): Android не даёт снова запустить его,
//    пока экран выключен, поэтому гаснет он только через 3 минуты тишины;
// 5) один раз просим снять для «Деки» экономию батареи (системный диалог),
//    DekaAndroid.backgroundAllowed()/openBackgroundSettings() — для кнопки «Разрешить фон».
const fs = require("fs");
const path = require("path");

function find(dir, name) {
  if (!fs.existsSync(dir)) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const r = find(p, name);
      if (r) return r;
    } else if (e.name === name) {
      return p;
    }
  }
  return null;
}

const defaultBase = path.join(__dirname, "..", "src-tauri", "gen", "android", "app", "src", "main");
const base = process.env.DEKA_ANDROID_MAIN_DIR || defaultBase;
const activityFile = find(base, "MainActivity.kt");
const manifestFile = find(base, "AndroidManifest.xml");

if (!activityFile) {
  console.error("MainActivity.kt не найден в " + base);
  process.exit(1);
}
if (!manifestFile) {
  console.error("AndroidManifest.xml не найден в " + base);
  process.exit(1);
}

let activity = fs.readFileSync(activityFile, "utf8");
const packageMatch = activity.match(/^\s*package\s+([A-Za-z0-9_.]+)/m);
if (!packageMatch) {
  console.error("Не удалось определить package из MainActivity.kt");
  process.exit(1);
}
const packageName = packageMatch[1];

const MARK = "DEKA_BACKGROUND_V2";
if (!activity.includes(MARK)) {
  const override = `
  // ${MARK}: фоновая работа «Деки».
  private var dekaWebView: android.webkit.WebView? = null

  override fun onWebViewCreate(webView: android.webkit.WebView) {
    super.onWebViewCreate(webView)
    dekaWebView = webView
    webView.settings.mediaPlaybackRequiresUserGesture = false
    // Процесс страницы остаётся важным и при погасшем экране: Android не выгружает его ради памяти.
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
      webView.setRendererPriorityPolicy(android.webkit.WebView.RENDERER_PRIORITY_IMPORTANT, false)
    }
    webView.addJavascriptInterface(object {
      @android.webkit.JavascriptInterface
      fun keepAwake(on: Boolean) {
        runOnUiThread { dekaKeepAwake(on) }
      }

      @android.webkit.JavascriptInterface
      fun backgroundAllowed(): Boolean = dekaBackgroundAllowed()

      @android.webkit.JavascriptInterface
      fun openBackgroundSettings() {
        runOnUiThread { dekaOpenBackgroundSettings() }
      }
    }, "DekaAndroid")
  }

  // wry вызывает webView.onPause() вместе с активностью — и когда гаснет экран.
  // Для плеера это значит «стоп»: сразу возвращаем WebView в рабочее состояние.
  override fun onPause() {
    super.onPause()
    dekaWebView?.onResume()
  }

  private fun dekaKeepAwake(on: Boolean) {
    try {
      val intent = android.content.Intent(this, DekaPlaybackService::class.java)
      if (!on) {
        // Не останавливаем сразу: сервис сам погаснет после 3 минут тишины.
        if (DekaPlaybackService.running) {
          intent.action = DekaPlaybackService.ACTION_IDLE
          startService(intent)
        }
        return
      }
      intent.action = DekaPlaybackService.ACTION_START
      if (DekaPlaybackService.running || android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O) {
        startService(intent)
      } else {
        startForegroundService(intent)
      }
      dekaAskBatteryOnce()
    } catch (e: Exception) {
      // При выключенном экране Android 12+ может запретить запуск — не роняем приложение.
      android.util.Log.w("Deka", "playback guard: " + e)
    }
  }

  private fun dekaBackgroundAllowed(): Boolean {
    if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.M) return true
    val power = getSystemService(android.content.Context.POWER_SERVICE) as android.os.PowerManager
    return power.isIgnoringBatteryOptimizations(packageName)
  }

  private fun dekaOpenBackgroundSettings() {
    if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.M) return
    try {
      startActivity(android.content.Intent(
        android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
        android.net.Uri.parse("package:" + packageName)
      ))
    } catch (e: Exception) {
      try {
        startActivity(android.content.Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
      } catch (e2: Exception) {
        android.util.Log.w("Deka", "battery settings: " + e2)
      }
    }
  }

  // Один раз, при первом запуске музыки, пока «Дека» на экране.
  private fun dekaAskBatteryOnce() {
    if (dekaBackgroundAllowed() || !hasWindowFocus()) return
    val prefs = getSharedPreferences("deka", android.content.Context.MODE_PRIVATE)
    if (prefs.getBoolean("batteryAsked", false)) return
    prefs.edit().putBoolean("batteryAsked", true).apply()
    dekaOpenBackgroundSettings()
  }
`;
  const withBody = /class MainActivity\s*:\s*TauriActivity\(\)\s*\{/;
  const noBody = /class MainActivity[ \t]*:[ \t]*TauriActivity\(\)[ \t]*$/m;
  if (withBody.test(activity)) activity = activity.replace(withBody, (m) => m + override);
  else if (noBody.test(activity)) activity = activity.replace(noBody, (m) => m + " {" + override + "}");
  else {
    console.error("Не узнал формат MainActivity.kt:\n" + activity);
    process.exit(1);
  }
  fs.writeFileSync(activityFile, activity);
}

const serviceFile = path.join(path.dirname(activityFile), "DekaPlaybackService.kt");
const service = `package ${packageName}

class DekaPlaybackService : android.app.Service() {
  companion object {
    const val ACTION_START = "ru.volna.player.action.PLAYBACK_START"
    const val ACTION_IDLE = "ru.volna.player.action.PLAYBACK_IDLE"
    private const val CHANNEL_ID = "deka_playback"
    private const val NOTIFICATION_ID = 6507
    // Паузы между треками, подгрузка и переходы по страницам VK не должны гасить фон.
    private const val IDLE_GRACE_MS = 3L * 60L * 1000L
    @Volatile @JvmStatic var running = false
  }

  private var wakeLock: android.os.PowerManager.WakeLock? = null
  private var wifiLock: android.net.wifi.WifiManager.WifiLock? = null
  private val handler = android.os.Handler(android.os.Looper.getMainLooper())
  private val stopLater = Runnable { stopPlaybackGuard() }

  override fun onBind(intent: android.content.Intent?): android.os.IBinder? = null

  override fun onStartCommand(intent: android.content.Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START -> {
        handler.removeCallbacks(stopLater)
        startPlaybackGuard()
      }
      ACTION_IDLE -> {
        if (running) {
          handler.removeCallbacks(stopLater)
          handler.postDelayed(stopLater, IDLE_GRACE_MS)
        } else {
          stopSelf()
        }
      }
      else -> stopPlaybackGuard()
    }
    return START_NOT_STICKY
  }

  private fun startPlaybackGuard() {
    ensureChannel()

    if (wakeLock?.isHeld != true) {
      val power = getSystemService(android.content.Context.POWER_SERVICE) as android.os.PowerManager
      wakeLock = power.newWakeLock(
        android.os.PowerManager.PARTIAL_WAKE_LOCK,
        packageName + ":DekaPlayback"
      ).apply {
        setReferenceCounted(false)
        acquire()
      }
    }

    // Wi‑Fi при погасшем экране уходит в экономию, и поток музыки/сета может застрять.
    if (wifiLock?.isHeld != true) {
      try {
        val wifi = applicationContext.getSystemService(android.content.Context.WIFI_SERVICE) as android.net.wifi.WifiManager
        @Suppress("DEPRECATION")
        val mode = android.net.wifi.WifiManager.WIFI_MODE_FULL_HIGH_PERF
        wifiLock = wifi.createWifiLock(mode, packageName + ":DekaPlayback").apply {
          setReferenceCounted(false)
          acquire()
        }
      } catch (e: Exception) {
        wifiLock = null
      }
    }

    val notification = buildNotification()
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    running = true
  }

  private fun buildNotification(): android.app.Notification {
    val builder =
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O)
        android.app.Notification.Builder(this, CHANNEL_ID)
      else
        android.app.Notification.Builder(this)

    val icon = if (applicationInfo.icon != 0) applicationInfo.icon else android.R.drawable.ic_media_play
    builder
      .setContentTitle("Дека")
      .setContentText("Играет в фоне · экран можно выключить")
      .setSmallIcon(icon)
      .setOngoing(true)
      .setCategory(android.app.Notification.CATEGORY_TRANSPORT)
      .setOnlyAlertOnce(true)

    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    if (launchIntent != null) {
      val pending = android.app.PendingIntent.getActivity(
        this,
        0,
        launchIntent,
        android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
      )
      builder.setContentIntent(pending)
    }

    return builder.build()
  }

  private fun ensureChannel() {
    if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O) return
    val manager = getSystemService(android.content.Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
    val channel = android.app.NotificationChannel(
      CHANNEL_ID,
      "Воспроизведение Деки",
      android.app.NotificationManager.IMPORTANCE_LOW
    )
    channel.description = "Фоновое воспроизведение музыки"
    channel.setSound(null, null)
    manager.createNotificationChannel(channel)
  }

  private fun releaseLocks() {
    val lock = wakeLock
    if (lock != null && lock.isHeld) lock.release()
    wakeLock = null
    val wifi = wifiLock
    if (wifi != null && wifi.isHeld) wifi.release()
    wifiLock = null
  }

  private fun stopPlaybackGuard() {
    handler.removeCallbacks(stopLater)
    running = false
    releaseLocks()
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
  }

  override fun onTaskRemoved(rootIntent: android.content.Intent?) {
    stopPlaybackGuard()
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    handler.removeCallbacks(stopLater)
    running = false
    releaseLocks()
    super.onDestroy()
  }
}
`;
fs.writeFileSync(serviceFile, service);

let manifest = fs.readFileSync(manifestFile, "utf8");
function addPermission(name) {
  if (manifest.includes('android:name="' + name + '"')) return;
  manifest = manifest.replace(
    /<manifest\b[^>]*>/,
    (m) => m + '\n    <uses-permission android:name="' + name + '" />'
  );
}
addPermission("android.permission.WAKE_LOCK");
addPermission("android.permission.FOREGROUND_SERVICE");
addPermission("android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK");
addPermission("android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS");

if (!manifest.includes('android:name=".DekaPlaybackService"')) {
  manifest = manifest.replace(
    /<\/application>/,
    `        <service
            android:name=".DekaPlaybackService"
            android:exported="false"
            android:stopWithTask="true"
            android:foregroundServiceType="mediaPlayback" />
    </application>`
  );
}
fs.writeFileSync(manifestFile, manifest);

console.log(
  "Android настроен для фона: WebView не засыпает с экраном, foreground media service " +
  "с wake/Wi‑Fi lock и 3‑минутной паузой, запрос на снятие экономии батареи."
);
