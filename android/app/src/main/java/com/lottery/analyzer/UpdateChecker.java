package com.lottery.analyzer;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * GitHub Releases 版本检查工具
 * 通过请求 GitHub API 获取最新 Release 版本号，与当前版本进行比较
 */
public class UpdateChecker {

    private static final String GITHUB_API_URL =
            "https://api.github.com/repos/remgasuki/lottery-data-analyzer/releases/latest";
    private static final String PREFS_NAME = "update_prefs";
    private static final String KEY_SKIPPED_VERSION = "skipped_version";

    private final Context context;
    private final String currentVersion;
    private final Handler mainHandler;

    public UpdateChecker(Context context, String currentVersion) {
        this.context = context;
        this.currentVersion = currentVersion;
        this.mainHandler = new Handler(Looper.getMainLooper());
    }

    /**
     * 检查更新回调接口
     */
    public interface UpdateCheckCallback {
        /** 发现新版本 */
        void onNewVersion(String versionName, String releaseUrl, String releaseNotes);
        /** 已是最新版本 */
        void onLatestVersion();
        /** 网络请求失败 */
        void onError(String message);
    }

    /**
     * 执行版本检查
     */
    public void check(UpdateCheckCallback callback) {
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                // 信任所有证书（解决某些环境下的 SSL 问题）
                TrustManager[] trustAll = new TrustManager[]{
                        new X509TrustManager() {
                            public java.security.cert.X509Certificate[] getAcceptedIssuers() { return null; }
                            public void checkClientTrusted(java.security.cert.X509Certificate[] certs, String authType) {}
                            public void checkServerTrusted(java.security.cert.X509Certificate[] certs, String authType) {}
                        }
                };
                SSLContext sc = SSLContext.getInstance("TLS");
                sc.init(null, trustAll, new java.security.SecureRandom());
                HttpsURLConnection.setDefaultSSLSocketFactory(sc.getSocketFactory());
                HttpsURLConnection.setDefaultHostnameVerifier((hostname, session) -> true);

                URL url = new URL(GITHUB_API_URL);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setRequestProperty("Accept", "application/vnd.github+json");
                conn.setRequestProperty("User-Agent", "LotteryAnalyzer-Android");
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);

                int responseCode = conn.getResponseCode();
                if (responseCode == HttpURLConnection.HTTP_OK) {
                    BufferedReader reader = new BufferedReader(
                            new InputStreamReader(conn.getInputStream(), "UTF-8"));
                    StringBuilder response = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        response.append(line);
                    }
                    reader.close();

                    JSONObject release = new JSONObject(response.toString());
                    String tagName = release.optString("tag_name", "");
                    String htmlUrl = release.optString("html_url", "");
                    String body = release.optString("body", "");

                    // 提取版本号（去掉 "v" 前缀）
                    String latestVersion = tagName.startsWith("v") ?
                            tagName.substring(1) : tagName;

                    // 检查是否跳过过该版本
                    String skipped = getSkippedVersion();
                    if (latestVersion.equals(skipped)) {
                        mainHandler.post(callback::onLatestVersion);
                        return;
                    }

                    // 比较版本号
                    if (compareVersions(latestVersion, currentVersion) > 0) {
                        mainHandler.post(() ->
                                callback.onNewVersion("v" + latestVersion, htmlUrl, body));
                    } else {
                        mainHandler.post(callback::onLatestVersion);
                    }
                } else {
                    mainHandler.post(() -> callback.onError("服务器响应异常: " + responseCode));
                }
            } catch (Exception e) {
                mainHandler.post(() -> callback.onError(e.getMessage()));
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        }).start();
    }

    /**
     * 记录跳过的版本号
     */
    public void skipVersion(String version) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_SKIPPED_VERSION, version).apply();
    }

    /**
     * 获取已跳过的版本号
     */
    private String getSkippedVersion() {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getString(KEY_SKIPPED_VERSION, "");
    }

    /**
     * 比较两个版本号的大小
     * @return 正数表示 v1 > v2，0 表示相等，负数表示 v1 < v2
     */
    private int compareVersions(String v1, String v2) {
        try {
            String[] parts1 = v1.split("\\.");
            String[] parts2 = v2.split("\\.");
            int maxLen = Math.max(parts1.length, parts2.length);
            for (int i = 0; i < maxLen; i++) {
                int num1 = i < parts1.length ? Integer.parseInt(parts1[i]) : 0;
                int num2 = i < parts2.length ? Integer.parseInt(parts2[i]) : 0;
                if (num1 != num2) {
                    return num1 - num2;
                }
            }
            return 0;
        } catch (NumberFormatException e) {
            return v1.compareTo(v2);
        }
    }
}