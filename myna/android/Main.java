package com.paulscotti.myna;

import android.app.Activity;
import android.app.ActivityOptions;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.graphics.Color;
import android.media.AudioManager;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedDispatcher;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;

// Myna on Android is the web app at paulscotti.com/myna in a full-screen WebView, so it changes whenever the
// site does. This shell adds what a web page can't do: answer cards with the volume keys (up is correct, down
// is incorrect) without looking, keep the screen on through a session, and install a newer copy of itself.
public class Main extends Activity {
  static final String SITE = "https://www.paulscotti.com/myna/";
  WebView web;
  volatile boolean keys; // a session is on, so the volume keys answer cards

  @Override protected void onCreate(Bundle state) {
    super.onCreate(state);
    web = new WebView(this);
    web.setBackgroundColor(Color.TRANSPARENT); // the theme's paper shows until the page paints its own
    web.getSettings().setJavaScriptEnabled(true);
    web.getSettings().setDomStorageEnabled(true);
    web.getSettings().setMediaPlaybackRequiresUserGesture(false);
    web.setWebViewClient(new WebViewClient());
    web.addJavascriptInterface(new Bridge(), "MynaAndroid");
    setVolumeControlStream(AudioManager.STREAM_MUSIC);
    getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, () -> {
      if (web.canGoBack()) web.goBack();
      else finish();
    });
    setContentView(web);
    web.loadUrl(SITE);
  }

  @Override public boolean dispatchKeyEvent(KeyEvent e) {
    int code = e.getKeyCode();
    if (!keys || code != KeyEvent.KEYCODE_VOLUME_UP && code != KeyEvent.KEYCODE_VOLUME_DOWN) return super.dispatchKeyEvent(e);
    if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) {
      String key = code == KeyEvent.KEYCODE_VOLUME_UP ? "ArrowRight" : "ArrowLeft";
      web.evaluateJavascript("dispatchEvent(new KeyboardEvent('keydown', {key: '" + key + "'}))", null);
    }
    return true;
  }

  // Where an update reports back. The first one waits for Paul to confirm it; after that, Myna is the
  // app that installed itself and Android lets it update without asking.
  @Override protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    if (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, 0) == PackageInstaller.STATUS_PENDING_USER_ACTION) {
      startActivity(intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class));
    }
  }

  // What the page can call, as window.MynaAndroid.
  class Bridge {
    @JavascriptInterface public long version() throws Exception {
      return getPackageManager().getPackageInfo(getPackageName(), 0).getLongVersionCode();
    }

    @JavascriptInterface public void keys(boolean on) {
      keys = on;
      runOnUiThread(() -> {
        if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
      });
    }

    @JavascriptInterface public void update() throws Exception {
      PackageInstaller installer = getPackageManager().getPackageInstaller();
      PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
      params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
      try (PackageInstaller.Session session = installer.openSession(installer.createSession(params))) {
        try (InputStream in = new URL(SITE + "myna.apk").openStream(); OutputStream out = session.openWrite("myna.apk", 0, -1)) {
          in.transferTo(out);
          session.fsync(out);
        }
        // The installer reports back through this, and may bring Myna forward again to do so.
        Bundle forward = ActivityOptions.makeBasic().setPendingIntentCreatorBackgroundActivityStartMode(ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOW_ALWAYS).toBundle();
        Intent back = new Intent(Main.this, Main.class);
        session.commit(PendingIntent.getActivity(Main.this, 0, back, PendingIntent.FLAG_MUTABLE | PendingIntent.FLAG_UPDATE_CURRENT, forward).getIntentSender());
      }
    }
  }
}
