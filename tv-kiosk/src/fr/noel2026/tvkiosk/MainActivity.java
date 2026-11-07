package fr.noel2026.tvkiosk;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
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
import android.widget.FrameLayout;

/**
 * « TV Noël » sur le Google TV Streamer : /tv en plein écran, vidéos avec le son, écran toujours allumé.
 * La touche Accueil ferme l'appli normalement ; Retour ne fait rien (évite une sortie accidentelle).
 *
 * Changer l'adresse (adb) : am start -n fr.noel2026.tvkiosk/.MainActivity --es url http://IP/tv
 */
public class MainActivity extends Activity {

    private static final String DEFAULT_URL = "http://192.168.1.5/tv";
    private static final long RETRY_MS = 5000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private FrameLayout root;
    private WebView webView;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private boolean showingError;

    private final Runnable retry = new Runnable() {
        @Override public void run() {
            showingError = false;
            webView.loadUrl(url());
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("kiosk", MODE_PRIVATE);
        applyIntentSettings(getIntent());

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        webView = buildWebView();
        root.addView(webView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        webView.loadUrl(url());
        webView.requestFocus();
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
        webView.onResume();
    }

    @Override
    protected void onPause() {
        // Accueil : l'appli passe en arrière-plan, plus de son ni de vidéo.
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        webView.destroy();
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    public void onBackPressed() {
        if (customView != null) exitCustomView();
        // Sinon rien : seule la touche Accueil quitte l'appli.
    }

    // ---------------------------------------------------------------- WebView

    private WebView buildWebView() {
        // Inspection à distance (chrome://inspect) via adb : utile pour mesurer les performances vidéo.
        WebView.setWebContentsDebuggingEnabled(true);
        WebView view = new WebView(this);
        view.setBackgroundColor(Color.BLACK);
        view.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        view.setOverScrollMode(View.OVER_SCROLL_NEVER);
        view.setVerticalScrollBarEnabled(false);
        view.setHorizontalScrollBarEnabled(false);

        WebSettings s = view.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // vidéos avec le son, sans clic
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setTextZoom(100);                          // ignore la taille de police système
        s.setOffscreenPreRaster(true);               // transitions sans saccade
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setAllowFileAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " NoelTv/1.0");

        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public Bitmap getDefaultVideoPoster() {
                // Pas d'icône « lecture » grise pendant le chargement d'une vidéo.
                return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
            }

            @Override
            public void onShowCustomView(View v, CustomViewCallback callback) {
                // requestFullscreen() de la page : l'élément s'affiche par-dessus tout.
                if (customView != null) { callback.onCustomViewHidden(); return; }
                customView = v;
                customViewCallback = callback;
                root.addView(v, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                hideSystemBars();
            }

            @Override
            public void onHideCustomView() { exitCustomView(); }
        });
        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                // Navigation autorisée uniquement sur le serveur du jeu.
                Uri target = request.getUrl();
                Uri home = Uri.parse(url());
                return !(String.valueOf(target.getHost()).equals(home.getHost()) && target.getPort() == home.getPort());
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

    private void exitCustomView() {
        if (customView == null) return;
        root.removeView(customView);
        customView = null;
        if (customViewCallback != null) customViewCallback.onCustomViewHidden();
        customViewCallback = null;
        webView.requestFocus();
    }

    private void showOffline() {
        if (showingError) return;
        showingError = true;
        String html = "<html><body style='margin:0;height:100vh;display:flex;align-items:center;justify-content:center;"
                + "background:#0d2b1a;color:#f5d77a;font-family:sans-serif;text-align:center'>"
                + "<div><div style='font-size:12vh'>🎄</div><h1 style='font-size:6vh'>Connexion au bureau du Père Noël…</h1>"
                + "<p style='color:#cfe;font-size:3vh'>Nouvel essai dans quelques secondes.</p></div></body></html>";
        webView.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
        handler.removeCallbacks(retry);
        handler.postDelayed(retry, RETRY_MS);
    }

    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    // ---------------------------------------------------------------- Réglages

    private String url() {
        return prefs.getString("url", DEFAULT_URL);
    }

    /** Enregistre l'url passée en extra (adb). Renvoie vrai si elle a changé. */
    private boolean applyIntentSettings(Intent intent) {
        if (intent == null) return false;
        String newUrl = intent.getStringExtra("url");
        if (newUrl == null || !newUrl.startsWith("http")) return false;
        prefs.edit().putString("url", newUrl).apply();
        return true;
    }
}
