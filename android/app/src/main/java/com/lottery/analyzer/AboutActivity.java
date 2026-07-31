package com.lottery.analyzer;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

/**
 * 关于页面
 * 显示应用版本信息，提供版本更新检查功能
 */
public class AboutActivity extends AppCompatActivity {

    private TextView tvVersion;
    private TextView tvUpdateStatus;
    private Button btnCheckUpdate;
    private UpdateChecker updateChecker;
    private String currentVersionName;

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
                public void onNewVersion(String versionName, String releaseUrl, String releaseNotes) {
                    btnCheckUpdate.setEnabled(true);
                    btnCheckUpdate.setText("检查更新");
                    tvUpdateStatus.setText("发现新版本 " + versionName);
                    showNewVersionDialog(versionName, releaseUrl);
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
    private void showNewVersionDialog(String versionName, String releaseUrl) {
        new AlertDialog.Builder(this)
                .setTitle("发现新版本")
                .setMessage("发现新版本 " + versionName + "，是否前往下载？")
                .setPositiveButton("下载", (dialog, which) -> {
                    // 调用系统浏览器打开 Release 页面
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(releaseUrl));
                    startActivity(intent);
                })
                .setNeutralButton("跳过", (dialog, which) -> {
                    // 记录跳过版本，提取纯版本号（去掉 "v" 前缀）
                    String skipVer = versionName.startsWith("v") ?
                            versionName.substring(1) : versionName;
                    updateChecker.skipVersion(skipVer);
                    tvUpdateStatus.setText("已跳过 " + versionName);
                    Toast.makeText(AboutActivity.this,
                            "已跳过 " + versionName, Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton("稍后", (dialog, which) -> dialog.dismiss())
                .setCancelable(true)
                .show();
    }
}