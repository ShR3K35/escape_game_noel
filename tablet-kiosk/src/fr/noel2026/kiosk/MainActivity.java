package fr.noel2026.kiosk;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputType;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.Toast;

/**
 * Kiosque de la tablette des lutins : une WebView plein écran, en paysage, verrouillée sur /lutins.
 *
 * Réglages (via adb) : am start -n fr.noel2026.kiosk/.MainActivity --es url http://IP/lutins --es pin 1234
 * Sortie adulte : appui long de 3 s dans le coin en haut à gauche, puis code PIN.
 */
public class MainActivity extends Activity {

    private static final String DEFAULT_URL = "http://192.168.1.5/lutins";
    private static final String DEFAULT_PIN = "2512";
    private static final long CORNER_HOLD_MS = 3000;
    private static final long RETRY_MS = 5000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private DevicePolicyManager dpm;
    private ComponentName admin;
    private WebView webView;
    private boolean suspended;
    private boolean showingError;
    private float cornerPx;

    private final Runnable retry = new Runnable() {
        @Override public void run() {
            showingError = false;
            webView.loadUrl(url());
        }
    };

    private final Runnable cornerHeld = new Runnable() {
        @Override public void run() { askPin(); }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("kiosk", MODE_PRIVATE);
        dpm = (DevicePolicyManager) getSystemService(Context.DEVICE_POLICY_SERVICE);
        admin = new ComponentName(this, AdminReceiver.class);
        cornerPx = 96 * getResources().getDisplayMetrics().density;
        applyIntentSettings(getIntent());

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        webView = buildWebView();
        setContentView(webView);
        webView.loadUrl(url());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (applyIntentSettings(intent)) webView.loadUrl(url());
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemBars();
        if (!suspended) lockDown();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    public void onBackPressed() {
        // Le bouton retour ne fait rien : impossible de quitter /lutins.
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        // Sortie cachée : doigt maintenu 3 s dans le coin en haut à gauche (le toucher passe quand même à la page).
        switch (ev.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                if (ev.getX() < cornerPx && ev.getY() < cornerPx) handler.postDelayed(cornerHeld, CORNER_HOLD_MS);
                break;
            case MotionEvent.ACTION_MOVE:
                if (ev.getX() >= cornerPx || ev.getY() >= cornerPx) handler.removeCallbacks(cornerHeld);
                break;
            case MotionEvent.ACTION_POINTER_DOWN:
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                handler.removeCallbacks(cornerHeld);
                break;
            default:
                break;
        }
        return super.dispatchTouchEvent(ev);
    }

    // ---------------------------------------------------------------- WebView

    private WebView buildWebView() {
        // Inspection à distance (chrome://inspect) via USB uniquement : sert à mesurer les performances sur la tablette.
        WebView.setWebContentsDebuggingEnabled(true);
        WebView view = new WebView(this);
        view.setBackgroundColor(Color.BLACK);
        view.setLongClickable(false);
        view.setHapticFeedbackEnabled(false);
        view.setOnLongClickListener(new View.OnLongClickListener() {
            @Override public boolean onLongClick(View v) { return true; }
        });
        view.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings s = view.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setAllowFileAccess(false);

        view.setWebChromeClient(new WebChromeClient());
        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                // Navigation autorisée uniquement sur le serveur du jeu.
                Uri target = request.getUrl();
                Uri home = Uri.parse(url());
                return !(String.valueOf(target.getHost()).equals(home.getHost())
                        && target.getPort() == home.getPort());
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showOffline();
            }

            @Override
            public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
                recreate();
                return true;
            }
        });
        return view;
    }

    private void showOffline() {
        if (showingError) return;
        showingError = true;
        String html = "<html><body style='margin:0;height:100vh;display:flex;align-items:center;justify-content:center;"
                + "background:#0d2b1a;color:#f5d77a;font-family:sans-serif;text-align:center'>"
                + "<div><div style='font-size:72px'>🧝</div><h1>Connexion au pôle Nord…</h1>"
                + "<p style='color:#cfe'>Nouvel essai dans quelques secondes.</p></div></body></html>";
        webView.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
        handler.removeCallbacks(retry);
        handler.postDelayed(retry, RETRY_MS);
    }

    // ---------------------------------------------------------------- Kiosque

    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    private boolean isOwner() {
        return dpm != null && dpm.isDeviceOwnerApp(getPackageName());
    }

    private void lockDown() {
        if (isOwner()) {
            dpm.setLockTaskPackages(admin, new String[] {getPackageName()});
            if (Build.VERSION.SDK_INT >= 28) dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_NONE);
            IntentFilter homeFilter = new IntentFilter(Intent.ACTION_MAIN);
            homeFilter.addCategory(Intent.CATEGORY_HOME);
            homeFilter.addCategory(Intent.CATEGORY_DEFAULT);
            dpm.addPersistentPreferredActivity(admin, homeFilter, new ComponentName(this, MainActivity.class));
            dpm.setKeyguardDisabled(admin, true);
            dpm.setStatusBarDisabled(admin, true);
            dpm.setGlobalSetting(admin, Settings.Global.STAY_ON_WHILE_PLUGGED_IN, "7");
        }
        try {
            // Propriétaire de l'appareil : verrouillage silencieux. Sinon : épinglage d'écran Android (demande confirmation).
            startLockTask();
        } catch (RuntimeException ignored) {
            // Déjà verrouillé ou refusé : rien à faire.
        }
    }

    private void unlock() {
        suspended = true;
        try { stopLockTask(); } catch (RuntimeException ignored) { }
        if (isOwner()) {
            dpm.clearPackagePersistentPreferredActivities(admin, getPackageName());
            dpm.setStatusBarDisabled(admin, false);
        }
    }

    // ---------------------------------------------------------------- Menu adulte

    private void askPin() {
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        input.setHint("Code");
        new AlertDialog.Builder(this)
                .setTitle("Accès adulte")
                .setView(input)
                .setNegativeButton("Annuler", null)
                .setPositiveButton("OK", (d, w) -> {
                    if (input.getText().toString().equals(prefs.getString("pin", DEFAULT_PIN))) showAdminMenu();
                    else Toast.makeText(this, "Code incorrect", Toast.LENGTH_SHORT).show();
                    hideSystemBars();
                })
                .setOnDismissListener(d -> hideSystemBars())
                .show();
    }

    private void showAdminMenu() {
        String[] items = suspended
                ? new String[] {"Recharger la page", "Réactiver le kiosque", "Paramètres Android"}
                : new String[] {"Recharger la page", "Quitter le kiosque (paramètres Android)"};
        new AlertDialog.Builder(this)
                .setTitle("Kiosque — " + url())
                .setItems(items, (d, which) -> {
                    if (which == 0) {
                        webView.loadUrl(url());
                    } else if (suspended && which == 1) {
                        suspended = false;
                        lockDown();
                    } else {
                        unlock();
                        startActivity(new Intent(Settings.ACTION_SETTINGS));
                    }
                })
                .setOnDismissListener(d -> hideSystemBars())
                .show();
    }

    // ---------------------------------------------------------------- Réglages

    private String url() {
        return prefs.getString("url", DEFAULT_URL);
    }

    /** Enregistre url / pin passés en extra (adb). Renvoie vrai si l'URL a changé. */
    private boolean applyIntentSettings(Intent intent) {
        if (intent == null) return false;
        SharedPreferences.Editor e = prefs.edit();
        boolean urlChanged = false;
        String newUrl = intent.getStringExtra("url");
        if (newUrl != null && newUrl.startsWith("http")) {
            e.putString("url", newUrl);
            urlChanged = true;
        }
        String newPin = intent.getStringExtra("pin");
        if (newPin != null && newPin.matches("\\d{4,8}")) e.putString("pin", newPin);
        e.apply();
        return urlChanged;
    }
}
