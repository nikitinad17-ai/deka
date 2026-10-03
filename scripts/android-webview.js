// Настраивает Android-проект, который Tauri генерирует в CI:
// 1) WebView может запускать медиа без дополнительного касания;
// 2) DekaAndroid.keepAwake(true/false) управляет foreground media service;
// 3) service держит PARTIAL_WAKE_LOCK, поэтому экран может погаснуть,
//    а процесс с WebView и музыка продолжают работать в фоне.
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

if (!activity.includes("mediaPlaybackRequiresUserGesture")) {
  const override = `
  override fun onWebViewCreate(webView: android.webkit.WebView) {
    super.onWebViewCreate(webView)
    webView.settings.mediaPlaybackRequiresUserGesture = false
    webView.addJavascriptInterface(object {
      @android.webkit.JavascriptInterface
      fun keepAwake(on: Boolean) {
        runOnUiThread {
          val intent = android.content.Intent(this@MainActivity, DekaPlaybackService::class.java)
          if (on) {
            intent.action = DekaPlaybackService.ACTION_START
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
              startForegroundService(intent)
            } else {
              startService(intent)
            }
          } else {
            stopService(intent)
          }
        }
      }
    }, "DekaAndroid")
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
    private const val CHANNEL_ID = "deka_playback"
    private const val NOTIFICATION_ID = 6507
  }

  private var wakeLock: android.os.PowerManager.WakeLock? = null

  override fun onBind(intent: android.content.Intent?): android.os.IBinder? = null

  override fun onStartCommand(intent: android.content.Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_START) {
      startPlaybackGuard()
    } else {
      stopPlaybackGuard()
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
      .setContentText("Музыка играет в фоне")
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

  private fun releaseWakeLock() {
    val lock = wakeLock
    if (lock != null && lock.isHeld) lock.release()
    wakeLock = null
  }

  private fun stopPlaybackGuard() {
    releaseWakeLock()
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
    releaseWakeLock()
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
  "Android WebView настроен: autoplay + foreground media service + PARTIAL_WAKE_LOCK. " +
  "Экран может гаснуть, музыка должна продолжать играть."
);
