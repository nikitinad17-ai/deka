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
//    DekaAndroid.backgroundAllowed()/openBackgroundSettings() — для кнопки «Разрешить фон»;
// 6) вход в VK — в ОТДЕЛЬНОМ чистом окне (DekaAndroid.openLogin): обычный android.webkit.WebView
//    без скриптов «Деки», без подмены видимости и прочих добавок основного окна, как в старой Деке.
//    Куки у всех WebView приложения общие, поэтому после входа основное окно уже авторизовано.
//    Окно закрывается само, когда VK вернул на свой сайт; журнал окна — в «Отчёте»;
// 7) язычок «← Дека» — это кнопка Android поверх WebView, а не элемент страницы VK.
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

const MARK = "DEKA_BACKGROUND_V4";
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

      @android.webkit.JavascriptInterface
      fun setBackChip(show: Boolean) {
        runOnUiThread { dekaShowChip(show) }
      }

      @android.webkit.JavascriptInterface
      fun log(line: String) { DekaLog.add(line) }

      @android.webkit.JavascriptInterface
      fun readLog(): String = DekaLog.dump()

      @android.webkit.JavascriptInterface
      fun openLogin() {
        runOnUiThread { dekaOpenLogin() }
      }

      @android.webkit.JavascriptInterface
      fun hasSession(): Boolean = dekaHasSession()

      @android.webkit.JavascriptInterface
      fun toast(text: String) {
        runOnUiThread { android.widget.Toast.makeText(this@MainActivity, text, android.widget.Toast.LENGTH_LONG).show() }
      }
    }, "DekaAndroid")
  }

  // ---------- окно входа VK: чистый WebView поверх «Деки» ----------
  private var dekaLoginRoot: android.widget.LinearLayout? = null
  private var dekaLoginView: android.webkit.WebView? = null
  private var dekaLoginBack: androidx.activity.OnBackPressedCallback? = null
  private var dekaLoginSawAuth = false

  private fun dekaHasSession(): Boolean {
    val cm = android.webkit.CookieManager.getInstance()
    return listOf("https://vk.ru", "https://m.vk.ru", "https://vk.com", "https://m.vk.com")
      .any { Regex("(^|;\\\\s*)remixn?sid=[^;\\\\s]").containsMatchIn(cm.getCookie(it) ?: "") }
  }

  private fun dekaLoginLog(line: String) {
    DekaLog.add(java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US).format(java.util.Date()) + " login " + line)
  }

  private fun dekaMasked(url: String): String {
    val u = android.net.Uri.parse(url)
    return (u.scheme ?: "") + "://" + (u.host ?: "") + (u.path ?: "").replace(Regex("\\\\d+"), "#").take(40)
  }

  @Suppress("DEPRECATION")
  private fun dekaOpenLogin() {
    if (dekaLoginRoot != null) return
    val density = resources.displayMetrics.density
    fun dp(v: Int) = (v * density).toInt()
    val root = android.widget.LinearLayout(this)
    root.orientation = android.widget.LinearLayout.VERTICAL
    root.setBackgroundColor(0xFF101318.toInt())
    root.isClickable = true
    root.setOnApplyWindowInsetsListener { v, insets ->
      v.setPadding(0, insets.systemWindowInsetTop, 0, insets.systemWindowInsetBottom)
      insets
    }

    val bar = android.widget.LinearLayout(this)
    bar.orientation = android.widget.LinearLayout.HORIZONTAL
    bar.gravity = android.view.Gravity.CENTER_VERTICAL
    bar.setPadding(dp(16), dp(8), dp(8), dp(8))
    val title = android.widget.TextView(this)
    title.text = "ДЕКА · вход в VK"
    title.textSize = 16f
    title.setTypeface(title.typeface, android.graphics.Typeface.BOLD)
    title.setTextColor(0xFFF5B44B.toInt())
    val cancel = android.widget.TextView(this)
    cancel.text = "Закрыть"
    cancel.textSize = 15f
    cancel.setTextColor(0xFFE7ECF3.toInt())
    cancel.setPadding(dp(14), dp(10), dp(14), dp(10))
    val cancelBg = android.graphics.drawable.GradientDrawable()
    cancelBg.setColor(0xFF262E3A.toInt())
    cancelBg.cornerRadius = 8f * density
    cancel.background = cancelBg
    cancel.setOnClickListener { dekaCloseLogin(false) }
    bar.addView(title, android.widget.LinearLayout.LayoutParams(0, android.view.ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    bar.addView(cancel)

    val note = android.widget.TextView(this)
    note.text = "Логин и пароль вводятся в форме VK — «Дека» их не видит и не хранит. После входа окно закроется само."
    note.textSize = 12f
    note.setTextColor(0xFFA7B6C8.toInt())
    note.setPadding(dp(16), 0, dp(16), dp(8))

    val web = android.webkit.WebView(this)
    web.settings.javaScriptEnabled = true
    web.settings.domStorageEnabled = true
    web.webViewClient = object : android.webkit.WebViewClient() {
      override fun shouldOverrideUrlLoading(view: android.webkit.WebView, request: android.webkit.WebResourceRequest): Boolean {
        val url = request.url.toString()
        val scheme = request.url.scheme ?: ""
        if (scheme == "http" || scheme == "https") return false
        val fallback = Regex("[#;]S\\\\.browser_fallback_url=([^;]+)").find(url)?.groupValues?.get(1)
        val target = if (fallback != null) android.net.Uri.decode(fallback) else null
        dekaLoginLog("ссылка " + scheme + (if (target != null) " → веб" else " — не открыть"))
        if (target != null && (target.startsWith("https://") || target.startsWith("http://"))) view.loadUrl(target)
        return true
      }

      override fun onPageStarted(view: android.webkit.WebView, url: String, favicon: android.graphics.Bitmap?) {
        dekaLoginLog("открыто " + dekaMasked(url))
      }

      override fun onPageFinished(view: android.webkit.WebView, url: String) {
        dekaLoginCheck(url)
      }

      override fun onReceivedError(view: android.webkit.WebView, request: android.webkit.WebResourceRequest, error: android.webkit.WebResourceError) {
        if (request.isForMainFrame) dekaLoginLog("ошибка " + error.errorCode + " " + dekaMasked(request.url.toString()))
      }

      override fun onReceivedHttpError(view: android.webkit.WebView, request: android.webkit.WebResourceRequest, response: android.webkit.WebResourceResponse) {
        if (request.isForMainFrame) dekaLoginLog("HTTP " + response.statusCode + " " + dekaMasked(request.url.toString()))
      }
    }
    web.webChromeClient = object : android.webkit.WebChromeClient() {
      override fun onConsoleMessage(message: android.webkit.ConsoleMessage): Boolean {
        if (message.messageLevel() == android.webkit.ConsoleMessage.MessageLevel.ERROR) dekaLoginLog("JS: " + message.message().take(120))
        return false
      }
    }

    root.addView(bar, android.widget.LinearLayout.LayoutParams(android.view.ViewGroup.LayoutParams.MATCH_PARENT, android.view.ViewGroup.LayoutParams.WRAP_CONTENT))
    root.addView(note, android.widget.LinearLayout.LayoutParams(android.view.ViewGroup.LayoutParams.MATCH_PARENT, android.view.ViewGroup.LayoutParams.WRAP_CONTENT))
    root.addView(web, android.widget.LinearLayout.LayoutParams(android.view.ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
    (window.decorView as android.view.ViewGroup).addView(root, android.widget.FrameLayout.LayoutParams(
      android.view.ViewGroup.LayoutParams.MATCH_PARENT, android.view.ViewGroup.LayoutParams.MATCH_PARENT))
    root.requestApplyInsets()

    val back = object : androidx.activity.OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        val w = dekaLoginView
        if (w != null && w.canGoBack()) w.goBack() else dekaCloseLogin(false)
      }
    }
    onBackPressedDispatcher.addCallback(this, back)

    dekaLoginRoot = root
    dekaLoginView = web
    dekaLoginBack = back
    dekaLoginSawAuth = false
    dekaShowChip(false)
    dekaLoginLog("окно входа · сессия " + (if (dekaHasSession()) "есть" else "нет"))
    web.loadUrl("https://vk.ru/login")
  }

  // Вход завершён, когда VK после своей страницы входа вернул на сайт (или сессия уже есть).
  private fun dekaLoginCheck(url: String) {
    val u = android.net.Uri.parse(url)
    val host = u.host ?: return
    val path = u.path ?: ""
    val authPage = Regex("^(id|login|oauth|connect|passport|account|auth|sso)\\\\.vk\\\\.(ru|com)$").matches(host) ||
      Regex("^/(login|join|restore|auth|signup|register|challenge|checkpoint|oauth|verify)").containsMatchIn(path)
    if (authPage) { dekaLoginSawAuth = true; return }
    val vkSite = host == "vk.ru" || host == "m.vk.ru" || host == "vk.com" || host == "m.vk.com"
    if (vkSite && (dekaHasSession() || dekaLoginSawAuth)) {
      dekaLoginLog("вход завершён · сессия " + (if (dekaHasSession()) "есть" else "нет"))
      dekaCloseLogin(true)
    }
  }

  private fun dekaCloseLogin(done: Boolean) {
    val root = dekaLoginRoot ?: return
    android.webkit.CookieManager.getInstance().flush()
    dekaLoginBack?.remove()
    (window.decorView as android.view.ViewGroup).removeView(root)
    dekaLoginView?.destroy()
    dekaLoginRoot = null
    dekaLoginView = null
    dekaLoginBack = null
    // В любом случае перечитываем музыку VK в основном окне: оно увидит новую сессию (или снова предложит войти).
    dekaLoginLog(if (done) "закрыто: вход выполнен" else "закрыто вручную")
    dekaWebView?.loadUrl("https://vk.ru/audio")
  }

  // «← Дека» поверх страницы VK. Касание — назад в Деку, перетаскивание — сдвинуть вверх/вниз.
  private var dekaChip: android.widget.TextView? = null

  private fun dekaShowChip(show: Boolean) {
    if (dekaChip == null && show) {
      val density = resources.displayMetrics.density
      val chip = android.widget.TextView(this)
      chip.text = "← Дека"
      chip.textSize = 15f
      chip.setTypeface(chip.typeface, android.graphics.Typeface.BOLD)
      chip.setTextColor(0xFF101318.toInt())
      val radius = 24f * density
      val bg = android.graphics.drawable.GradientDrawable()
      bg.setColor(0xFFF5B44B.toInt())
      bg.setCornerRadii(floatArrayOf(radius, radius, 0f, 0f, 0f, 0f, radius, radius))
      chip.background = bg
      chip.setPadding((16 * density).toInt(), (11 * density).toInt(), (12 * density).toInt(), (11 * density).toInt())
      chip.elevation = 8f * density
      chip.contentDescription = "Вернуться в Деку"
      chip.setOnClickListener {
        val wv = dekaWebView
        if (wv != null) {
          wv.evaluateJavascript("(function(){ if (window.__dekaBack) { window.__dekaBack(); return 1; } return 0; })()") { result ->
            // Страница без «Деки» (ушли с VK): просто возвращаемся к музыке VK.
            if (result != "1") wv.loadUrl("https://vk.ru/audio")
          }
        }
      }
      var downY = 0f
      var startY = 0f
      var moved = false
      chip.setOnTouchListener { v, e ->
        when (e.actionMasked) {
          android.view.MotionEvent.ACTION_DOWN -> { downY = e.rawY; startY = v.translationY; moved = false; true }
          android.view.MotionEvent.ACTION_MOVE -> {
            val dy = e.rawY - downY
            if (Math.abs(dy) > 12f * density) moved = true
            if (moved) {
              val limit = Math.max(0f, v.rootView.height / 2f - v.height * 1.5f)
              v.translationY = Math.max(-limit, Math.min(limit, startY + dy))
            }
            true
          }
          android.view.MotionEvent.ACTION_UP -> { if (!moved) v.performClick(); true }
          else -> false
        }
      }
      val lp = android.widget.FrameLayout.LayoutParams(
        android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
        android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
        android.view.Gravity.END or android.view.Gravity.CENTER_VERTICAL
      )
      (window.decorView as android.view.ViewGroup).addView(chip, lp)
      dekaChip = chip
    }
    dekaChip?.visibility = if (show) android.view.View.VISIBLE else android.view.View.GONE
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

// Журнал входа в VK для «Отчёта»: последние нажатия, переходы и ошибки страниц VK (без ввода).
object DekaLog {
  private val lines = java.util.ArrayDeque<String>()
  @Synchronized fun add(line: String) {
    if (lines.peekLast() == line) return
    lines.addLast(line.take(200))
    while (lines.size > 120) lines.removeFirst()
  }
  @Synchronized fun dump(): String = lines.joinToString("\\n")
}

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
  "Android настроен: фон (WebView не засыпает, сервис с wake/Wi‑Fi lock), вход VK (куки VK ID, UA без wv), " +
  "нативный язычок «← Дека», запрос на снятие экономии батареи."
);
