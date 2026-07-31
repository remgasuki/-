package com.lottery.analyzer;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.view.View;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;

import java.io.File;

/**
 * 关于页面
 * 显示应用版本信息，提供版本更新检查功能
 * 支持通过 DownloadManager 自动下载 APK，下载完成后调用系统安装器安装
 */
public class AboutActivity extends AppCompatActivity {

    private TextView tvVersion;
    private TextView tvUpdateStatus;
    private Button btnCheckUpdate;
    private UpdateChecker updateChecker;
    private String currentVersionName;
    private long downloadId = -1;
    private String downloadedVersionName;
    private BroadcastReceiver downloadCompleteReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_about);

        tvVersion = findViewById(R.id.tvVersion);
        tvUpdateStatus = findViewById(R.id.tvUpdateStatus);
        btnCheckUpdate = findViewById(R.id.btnCheckUpdate);
        Button btnBack = findViewById(R.id.btnBack);

        // 获取当前版本号
        currentVersionName = getAppVersionName();
        tvVersion.setText("v" + currentVersionName);

        // 点击版本号跳转到安装包页面（GitHub Releases）
        tvVersion.setOnClickListener(v -> {
            Intent intent = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://github.com/remgasuki/lottery-data-analyzer/releases"));
            startActivity(intent);
        });

        // 初始化版本检查器
        updateChecker = new UpdateChecker(this, currentVersionName);

        // 返回按钮
        btnBack.setOnClickListener(v -> finish());

        // 检查更新按钮
        btnCheckUpdate.setOnClickListener(v -> {
            btnCheckUpdate.setEnabled(false);
            btnCheckUpdate.setText("正在检查...");
            tvUpdateStatus.setText("正在连接 GitHub...");

            updateChecker.check(new UpdateChecker.UpdateCheckCallback() {
                @Override
                public void onNewVersion(UpdateChecker.UpdateInfo updateInfo) {
                    btnCheckUpdate.setEnabled(true);
                    btnCheckUpdate.setText("检查更新");
                    tvUpdateStatus.setText("发现新版本 " + updateInfo.versionName);
                    showNewVersionDialog(updateInfo);
                }

                @Override
                public void onLatestVersion() {
                    btnCheckUpdate.setEnabled(true);
                    btnCheckUpdate.setText("检查更新");
                    tvUpdateStatus.setText("当前已是最新版本");
                    Toast.makeText(AboutActivity.this, "已是最新版本", Toast.LENGTH_SHORT).show();
                }

                @Override
                public void onError(String message) {
                    btnCheckUpdate.setEnabled(true);
                    btnCheckUpdate.setText("检查更新");
                    tvUpdateStatus.setText("检查失败，请稍后重试");
                    Toast.makeText(AboutActivity.this, "网络异常，请稍后重试", Toast.LENGTH_SHORT).show();
                }
            });
        });

        // 注册下载完成广播接收器
        downloadCompleteReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) {
                    long receivedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (receivedId == downloadId) {
                        checkDownloadStatus(receivedId);
                    }
                }
            }
        };
        registerReceiver(downloadCompleteReceiver,
                new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                Context.RECEIVER_EXPORTED);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (downloadCompleteReceiver != null) {
            try {
                unregisterReceiver(downloadCompleteReceiver);
            } catch (IllegalArgumentException ignored) {}
        }
    }

    /**
     * 获取当前应用的版本名称
     */
    private String getAppVersionName() {
        try {
            PackageInfo packageInfo = getPackageManager()
                    .getPackageInfo(getPackageName(), 0);
            return packageInfo.versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return "1.0";
        }
    }

    /**
     * 显示新版本对话框
     */
    private void showNewVersionDialog(UpdateChecker.UpdateInfo updateInfo) {
        new AlertDialog.Builder(this)
                .setTitle("发现新版本")
                .setMessage("发现新版本 " + updateInfo.versionName + "，是否下载更新？")
                .setPositiveButton("下载", (dialog, which) -> {
                    if (updateInfo.downloadUrl != null) {
                        startDownload(updateInfo);
                    } else {
                        // 没有找到 APK 下载链接，回退到浏览器打开
                        Intent intent = new Intent(Intent.ACTION_VIEW,
                                Uri.parse(updateInfo.releaseUrl));
                        startActivity(intent);
                        Toast.makeText(AboutActivity.this,
                                "未找到下载链接，已打开发布页面", Toast.LENGTH_SHORT).show();
                    }
                })
                .setNeutralButton("跳过", (dialog, which) -> {
                    String skipVer = updateInfo.versionName.startsWith("v") ?
                            updateInfo.versionName.substring(1) : updateInfo.versionName;
                    updateChecker.skipVersion(skipVer);
                    tvUpdateStatus.setText("已跳过 " + updateInfo.versionName);
                    Toast.makeText(AboutActivity.this,
                            "已跳过 " + updateInfo.versionName, Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton("稍后", (dialog, which) -> dialog.dismiss())
                .setCancelable(true)
                .show();
    }

    /**
     * 使用 DownloadManager 开始下载 APK
     */
    private void startDownload(UpdateChecker.UpdateInfo updateInfo) {
        DownloadManager downloadManager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);

        // 清理旧的更新 APK 文件
        cleanupOldApks();

        String fileName = "lottery-update-" + updateInfo.versionName + ".apk";
        File destFile = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName);

        // 如果文件已存在，先删除
        if (destFile.exists()) {
            destFile.delete();
        }

        DownloadManager.Request request = new DownloadManager.Request(
                Uri.parse(updateInfo.downloadUrl))
                .setTitle("彩票分析 " + updateInfo.versionName)
                .setDescription("正在下载更新...")
                .setMimeType("application/vnd.android.package-archive")
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(false)
                .setNotificationVisibility(
                        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationUri(Uri.fromFile(destFile));

        downloadId = downloadManager.enqueue(request);
        downloadedVersionName = updateInfo.versionName;

        tvUpdateStatus.setText("正在下载 " + updateInfo.versionName + "...");
        Toast.makeText(this, "开始下载更新，请查看通知栏进度", Toast.LENGTH_LONG).show();
    }

    /**
     * 清理旧的更新 APK 文件
     */
    private void cleanupOldApks() {
        File downloadDir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (downloadDir != null && downloadDir.isDirectory()) {
            File[] files = downloadDir.listFiles((dir, name) ->
                    name.startsWith("lottery-update-") && name.endsWith(".apk"));
            if (files != null) {
                for (File f : files) {
                    f.delete();
                }
            }
        }
    }

    /**
     * 检查下载状态
     */
    private void checkDownloadStatus(long downloadId) {
        DownloadManager downloadManager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        DownloadManager.Query query = new DownloadManager.Query();
        query.setFilterById(downloadId);
        Cursor cursor = downloadManager.query(query);

        if (cursor != null && cursor.moveToFirst()) {
            int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            if (statusIndex >= 0) {
                int status = cursor.getInt(statusIndex);
                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    // 下载成功，弹出安装提示
                    int uriIndex = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI);
                    if (uriIndex >= 0) {
                        String localUri = cursor.getString(uriIndex);
                        tvUpdateStatus.setText("下载完成 " + downloadedVersionName);
                        showInstallDialog(localUri);
                    }
                } else if (status == DownloadManager.STATUS_FAILED) {
                    tvUpdateStatus.setText("下载失败，请重试");
                    Toast.makeText(this, "下载失败，请检查网络后重试", Toast.LENGTH_SHORT).show();
                }
            }
            cursor.close();
        }
    }

    /**
     * 显示安装提示对话框
     */
    private void showInstallDialog(String localUri) {
        new AlertDialog.Builder(this)
                .setTitle("下载完成")
                .setMessage("更新包已下载完成，是否立即安装？\n\n" +
                        "注意：安装前请确认已允许\"未知来源\"安装权限。")
                .setPositiveButton("安装", (dialog, which) -> {
                    installApk(localUri);
                })
                .setNegativeButton("稍后", (dialog, which) -> {
                    dialog.dismiss();
                    Toast.makeText(AboutActivity.this,
                            "可在通知栏中找到已下载的更新包", Toast.LENGTH_SHORT).show();
                })
                .setCancelable(true)
                .show();
    }

    /**
     * 通过 FileProvider 安装 APK
     */
    private void installApk(String localUri) {
        try {
            File apkFile;
            if (localUri.startsWith("file://")) {
                apkFile = new File(Uri.parse(localUri).getPath());
            } else {
                apkFile = new File(Uri.parse(localUri).getPath());
            }

            if (!apkFile.exists()) {
                Toast.makeText(this, "安装包文件不存在", Toast.LENGTH_SHORT).show();
                return;
            }

            // Android 8.0+ 需要检查"未知来源"安装权限
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!getPackageManager().canRequestPackageInstalls()) {
                    // 引导用户开启"未知来源"安装权限
                    Intent settingsIntent = new Intent(
                            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + getPackageName()));
                    startActivity(settingsIntent);
                    Toast.makeText(this,
                            "请开启\"允许安装未知应用\"权限后重新安装", Toast.LENGTH_LONG).show();
                    return;
                }
            }

            Uri apkUri = FileProvider.getUriForFile(
                    this,
                    getPackageName() + ".fileprovider",
                    apkFile);

            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            startActivity(installIntent);
        } catch (Exception e) {
            Toast.makeText(this, "安装失败: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }
}