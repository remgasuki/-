package com.lottery.analyzer;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.net.http.SslError;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.Toast;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Scanner;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private ActivityResultLauncher<Intent> scannerLauncher;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);

        // 关于按钮
        Button btnAbout = findViewById(R.id.btnAbout);
        btnAbout.setOnClickListener(v -> {
            Intent intent = new Intent(MainActivity.this, AboutActivity.class);
            startActivity(intent);
        });

        // 配置 WebView
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setDefaultTextEncodingName("UTF-8");

        // 允许跨域请求（用于 Chart.js CDN）
        settings.setAllowUniversalAccessFromFileURLs(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                // 忽略 SSL 证书错误，确保 API 请求（如 sporttery.cn）能正常访问
                handler.proceed();
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                // 拦截大乐透 API 请求，用原生 HTTP 客户端替代 WebView fetch
                // 解决 WebView 访问 sporttery.cn 返回 HTTP 567 的问题
                if (url.contains("webapi.sporttery.cn") && url.contains("getHistoryPageListV1")) {
                    try {
                        return nativeFetch(url);
                    } catch (Exception e) {
                        return null; // 回退到 WebView 默认处理
                    }
                }
                return super.shouldInterceptRequest(view, request);
            }
        });

        webView.setWebChromeClient(new WebChromeClient());

        // 注册 JavaScript 接口（用于扫描验奖）
        webView.addJavascriptInterface(new ScannerInterface(), "ScannerBridge");

        // 注册 ActivityResultLauncher
        scannerLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                result -> {
                    if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                        Intent data = result.getData();
                        int[] frontNums = data.getIntArrayExtra("front_nums");
                        int[] backNums = data.getIntArrayExtra("back_nums");
                        String lotteryType = data.getStringExtra("lottery_type");
                        if (frontNums != null && backNums != null && lotteryType != null) {
                            onScanResult(frontNums, backNums, lotteryType);
                        }
                    }
                });

        // 加载本地 HTML（独立离线版）
        webView.loadUrl("file:///android_asset/web/index.html");
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    /**
     * 处理扫描结果，回调给 JavaScript
     */
    private void onScanResult(int[] frontNums, int[] backNums, String lotteryType) {
        StringBuilder js = new StringBuilder("onScannerResult({");
        js.append("front_nums: [");
        for (int i = 0; i < frontNums.length; i++) {
            if (i > 0) js.append(",");
            js.append(frontNums[i]);
        }
        js.append("], back_nums: [");
        for (int i = 0; i < backNums.length; i++) {
            if (i > 0) js.append(",");
            js.append(backNums[i]);
        }
        js.append("], lottery_type: '").append(lotteryType).append("'})");
        webView.post(() -> webView.evaluateJavascript(js.toString(), null));
    }

    /**
     * 启动扫描器 Activity
     */
    private void startScanner(String lotteryType) {
        Intent intent = new Intent(MainActivity.this, ScannerActivity.class);
        intent.putExtra("lottery_type", lotteryType);
        scannerLauncher.launch(intent);
    }

    /**
     * 使用原生 HTTP 客户端请求 API，绕过 WebView 的 fetch 限制
     * 解决 sporttery.cn 在 WebView 中返回 HTTP 567 的问题
     */
    private WebResourceResponse nativeFetch(String urlString) throws Exception {
        URL url = new URL(urlString);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setRequestProperty("Accept", "application/json");
        conn.setRequestProperty("Referer", "https://static.sporttery.cn/");
        conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(15000);
        conn.setInstanceFollowRedirects(true);

        int responseCode = conn.getResponseCode();
        if (responseCode != HttpURLConnection.HTTP_OK) {
            // 读取错误流
            InputStream errorStream = conn.getErrorStream();
            if (errorStream != null) {
                Scanner s = new Scanner(errorStream, "UTF-8").useDelimiter("\\A");
                String errorBody = s.hasNext() ? s.next() : "";
                s.close();
                errorStream.close();
            }
            conn.disconnect();
            return null;
        }

        // 读取响应
        InputStream inputStream = conn.getInputStream();
        Scanner s = new Scanner(inputStream, "UTF-8").useDelimiter("\\A");
        String responseBody = s.hasNext() ? s.next() : "";
        s.close();
        inputStream.close();
        conn.disconnect();

        // 返回 WebResourceResponse
        ByteArrayInputStream dataStream = new ByteArrayInputStream(
                responseBody.getBytes(StandardCharsets.UTF_8));
        return new WebResourceResponse("application/json", "UTF-8", dataStream);
    }

    /**
     * 供 WebView JavaScript 调用的接口
     */
    public class ScannerInterface {
        @JavascriptInterface
        public void startScanner(String lotteryType) {
            runOnUiThread(() -> MainActivity.this.startScanner(lotteryType));
        }

        @JavascriptInterface
        public void showToast(String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show());
        }
    }
}