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
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.Toast;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;

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