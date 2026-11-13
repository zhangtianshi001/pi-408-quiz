package com.tianshi.pai408;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ContentValues;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;

public class MainActivity extends Activity {

    static final String HOST = "appassets.androidplatform.net";
    static final String BASE = "https://" + HOST + "/assets/web/";
    static final String BG_LIGHT = "#f6f7fb";
    static final String BG_DARK = "#0f1219";

    private WebView web;
    private long lastBack = 0;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);

        applyBarColors(false);

        web = new WebView(this);
        web.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.setBackgroundColor(Color.parseColor(BG_LIGHT));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }

        web.setWebViewClient(new AssetClient());
        web.addJavascriptInterface(new Bridge(this), "AndroidBridge");
        setContentView(web);
        web.loadUrl(BASE + "index.html");
    }

    /** 统一设置状态栏 / 导航栏颜色与图标明暗，避免浅色主题下白字看不清 */
    void applyBarColors(boolean dark) {
        Window w = getWindow();
        if (w == null) return;
        int bg = Color.parseColor(dark ? BG_DARK : BG_LIGHT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            w.setStatusBarColor(bg);
            w.setNavigationBarColor(bg);
        }
        int flags = 0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!dark) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!dark) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        w.getDecorView().setSystemUiVisibility(flags);
    }

    static final class ThemeTask implements Runnable {
        private final MainActivity act;
        private final boolean dark;

        ThemeTask(MainActivity a, boolean d) {
            act = a;
            dark = d;
        }

        @Override
        public void run() {
            act.applyBarColors(dark);
        }
    }

    /* ---------- assets 路由 ---------- */
    static class AssetClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
            return Assets.serve(v, req.getUrl().toString());
        }

        @Override
        @SuppressWarnings("deprecation")
        public WebResourceResponse shouldInterceptRequest(WebView v, String url) {
            return Assets.serve(v, url);
        }
    }

    static final class Assets {
        static WebResourceResponse serve(WebView v, String url) {
            if (url == null) return null;
            String prefix = "https://" + HOST + "/assets/";
            if (!url.startsWith(prefix)) return null;
            String path = url.substring(prefix.length());
            int cut = path.indexOf('?');
            if (cut >= 0) path = path.substring(0, cut);
            cut = path.indexOf('#');
            if (cut >= 0) path = path.substring(0, cut);
            try {
                path = URLDecoder.decode(path, "UTF-8");
            } catch (Exception ignored) {
            }
            if (path.contains("..")) return null;

            byte[] data = readAsset(v, path);
            if (data == null) data = readAsset(v, "web/" + path);
            HashMap<String, String> headers = new HashMap<String, String>();
            headers.put("Cache-Control", "no-cache");
            headers.put("Access-Control-Allow-Origin", "*");
            String mime = guessMime(path);
            if (data == null) {
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                        headers, new ByteArrayInputStream(new byte[0]));
            }
            return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers,
                    new ByteArrayInputStream(data));
        }

        static byte[] readAsset(WebView v, String path) {
            AssetManager am = v.getContext().getAssets();
            InputStream is = null;
            try {
                is = am.open(path);
                ByteArrayOutputStream bo = new ByteArrayOutputStream(8192);
                byte[] buf = new byte[16384];
                int n;
                while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
                return bo.toByteArray();
            } catch (IOException e) {
                return null;
            } finally {
                if (is != null) {
                    try {
                        is.close();
                    } catch (IOException ignored) {
                    }
                }
            }
        }
    }

    static String guessMime(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".html") || p.endsWith(".htm")) return "text/html";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".svg")) return "image/svg+xml";
        String ext = MimeTypeMap.getFileExtensionFromUrl(p);
        if (ext != null && ext.length() > 0) {
            String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
            if (m != null) return m;
        }
        return "application/octet-stream";
    }

    /* ---------- 返回键 ---------- */
    static final class BackCallback implements ValueCallback<String> {
        private final MainActivity act;

        BackCallback(MainActivity a) {
            act = a;
        }

        @Override
        public void onReceiveValue(String value) {
            boolean handled = "true".equals(value);
            if (handled) return;
            long now = System.currentTimeMillis();
            if (now - act.lastBack < 2000) {
                act.finish();
            } else {
                act.lastBack = now;
                Toast.makeText(act, "再按一次退出", Toast.LENGTH_SHORT).show();
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript(
                "(function(){try{return !!(window.AppBack&&window.AppBack());}catch(e){return false;}})()",
                new BackCallback(this));
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    /* ---------- JS 桥 ---------- */
    static final class Bridge {
        private final MainActivity act;

        Bridge(MainActivity a) {
            act = a;
        }

        /** 导出 JSON 到系统「下载」目录 */
        @JavascriptInterface
        public String saveText(String name, String content) {
            try {
                byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    cv.put(MediaStore.MediaColumns.MIME_TYPE, name != null && name.endsWith(".txt") ? "text/plain" : "application/json");
                    cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = act.getContentResolver()
                            .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri != null) {
                        OutputStream os = act.getContentResolver().openOutputStream(uri);
                        if (os != null) {
                            os.write(bytes);
                            os.close();
                            return "下载目录";
                        }
                    }
                }
                File dir = act.getExternalFilesDir(null);
                if (dir == null) dir = act.getFilesDir();
                File f = new File(dir, name);
                FileOutputStream fo = new FileOutputStream(f);
                fo.write(bytes);
                fo.close();
                return f.getAbsolutePath();
            } catch (Exception ignored) {
                return "保存失败";
            }
        }

        @JavascriptInterface
        public String version() {
            return "1.2";
        }

        @JavascriptInterface
        public void copyText(String text) {
            ClipboardManager cm = (ClipboardManager) act.getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("派立方408", text));
        }

        @JavascriptInterface
        public void openUrl(String url) {
            try {
                android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_VIEW, Uri.parse(url));
                act.startActivity(i);
            } catch (Exception ignored) { }
        }

        /** 跟随网页主题切换系统栏配色 */
        @JavascriptInterface
        public void setTheme(String mode) {
            boolean dark = "dark".equals(mode);
            act.runOnUiThread(new ThemeTask(act, dark));
        }
    }
}
