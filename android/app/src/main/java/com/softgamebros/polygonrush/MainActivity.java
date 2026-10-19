package com.softgamebros.polygonrush;

import android.os.Bundle;
import android.view.Display;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** Pauses the web view a moment after the app leaves the screen (see onStop). */
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean webPaused = false;
    private final Runnable pauseWeb = () -> {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null || webPaused) return;
        webView.onPause();
        webView.pauseTimers();
        webPaused = true;
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // A game: keep the screen awake while the app is in the foreground.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            // Web audio for music/SFX must be able to start without an extra gesture
            // once the player has tapped "Play".
            settings.setMediaPlaybackRequiresUserGesture(false);
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
            webView.setHapticFeedbackEnabled(false);
        }
        preferSixtyHertz();
        enterImmersiveMode();
    }

    /**
     * The game never draws more than 60 frames a second, so ask 90/120 Hz
     * screens for their 60 Hz mode (same resolution): a big battery saving.
     */
    private void preferSixtyHertz() {
        Display display = getWindowManager().getDefaultDisplay();
        Display.Mode current = display.getMode();
        Display.Mode best = null;
        for (Display.Mode mode : display.getSupportedModes()) {
            if (mode.getPhysicalWidth() != current.getPhysicalWidth() || mode.getPhysicalHeight() != current.getPhysicalHeight()) continue;
            if (mode.getRefreshRate() < 59f) continue;
            if (best == null || mode.getRefreshRate() < best.getRefreshRate()) best = mode;
        }
        if (best == null || best.getModeId() == current.getModeId()) return;
        WindowManager.LayoutParams params = getWindow().getAttributes();
        params.preferredDisplayModeId = best.getModeId();
        getWindow().setAttributes(params);
    }

    @Override
    public void onResume() {
        super.onResume();
        resumeWeb();
        enterImmersiveMode();
    }

    @Override
    public void onStart() {
        super.onStart();
        resumeWeb();
    }

    /**
     * Out of sight: stop the game's JavaScript timers and the web view's work so
     * nothing drains the battery in the background. Waits a moment first so the
     * save made on the "pause" event can finish.
     */
    @Override
    public void onStop() {
        super.onStop();
        handler.postDelayed(pauseWeb, 1500);
    }

    private void resumeWeb() {
        handler.removeCallbacks(pauseWeb);
        if (!webPaused) return;
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.resumeTimers();
            webView.onResume();
        }
        webPaused = false;
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enterImmersiveMode();
        }
    }

    /** Edge-to-edge, sticky-immersive fullscreen: system bars only appear on a swipe. */
    private void enterImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }
}
