package com.lottery.analyzer;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ScannerActivity extends AppCompatActivity {

    private static final int CAMERA_PERMISSION_REQUEST = 1001;
    private static final String EXTRA_LOTTERY_TYPE = "lottery_type";

    private PreviewView previewView;
    private TextView tvHint;
    private TextView tvLotteryType;
    private TextView tvDetectedNumbers;
    private LinearLayout resultPanel;
    private Button btnFlash;
    private Button btnConfirm;
    private Button btnCancel;
    private Button btnClose;

    private ExecutorService cameraExecutor;
    private TextRecognizer textRecognizer;
    private Camera camera;
    private boolean flashEnabled = false;
    private final AtomicBoolean isAnalyzing = new AtomicBoolean(false);
    private String currentLotteryType = "dlt";
    private List<Integer> lastDetectedFront = null;
    private List<Integer> lastDetectedBack = null;
    private long lastAnalysisTime = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_scanner);

        String lotteryType = getIntent().getStringExtra(EXTRA_LOTTERY_TYPE);
        if (lotteryType != null) {
            currentLotteryType = lotteryType;
        }

        initViews();
        initMLKit();
        cameraExecutor = Executors.newSingleThreadExecutor();

        if (hasCameraPermission()) {
            startCamera();
        } else {
            requestCameraPermission();
        }
    }

    private void initViews() {
        previewView = findViewById(R.id.previewView);
        tvHint = findViewById(R.id.tvHint);
        tvLotteryType = findViewById(R.id.tvLotteryType);
        tvDetectedNumbers = findViewById(R.id.tvDetectedNumbers);
        resultPanel = findViewById(R.id.resultPanel);
        btnFlash = findViewById(R.id.btnFlash);
        btnConfirm = findViewById(R.id.btnConfirm);
        btnCancel = findViewById(R.id.btnCancel);
        btnClose = findViewById(R.id.btnClose);

        btnFlash.setOnClickListener(v -> toggleFlash());
        btnClose.setOnClickListener(v -> finish());

        btnConfirm.setOnClickListener(v -> {
            confirmResult();
        });

        btnCancel.setOnClickListener(v -> {
            resetScanning();
        });
    }

    private void initMLKit() {
        textRecognizer = TextRecognition.getClient(
                new ChineseTextRecognizerOptions.Builder().build());
    }

    private boolean hasCameraPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED;
    }

    private void requestCameraPermission() {
        ActivityCompat.requestPermissions(this,
                new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == CAMERA_PERMISSION_REQUEST) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startCamera();
            } else {
                Toast.makeText(this, "需要相机权限才能扫描彩票", Toast.LENGTH_LONG).show();
                finish();
            }
        }
    }

    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> cameraProviderFuture =
                ProcessCameraProvider.getInstance(this);
        cameraProviderFuture.addListener(() -> {
            try {
                ProcessCameraProvider cameraProvider = cameraProviderFuture.get();

                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());

                CameraSelector cameraSelector = new CameraSelector.Builder()
                        .requireLensFacing(CameraSelector.LENS_FACING_BACK)
                        .build();

                ImageAnalysis imageAnalysis = new ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build();

                imageAnalysis.setAnalyzer(cameraExecutor, this::analyzeImage);

                cameraProvider.unbindAll();
                camera = cameraProvider.bindToLifecycle(this, cameraSelector, preview, imageAnalysis);

            } catch (Exception e) {
                Toast.makeText(this, "相机启动失败: " + e.getMessage(), Toast.LENGTH_LONG).show();
                finish();
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void toggleFlash() {
        if (camera != null && camera.getCameraInfo().hasFlashUnit()) {
            flashEnabled = !flashEnabled;
            camera.getCameraControl().enableTorch(flashEnabled);
            btnFlash.setText(flashEnabled ? "🔆" : "🔦");
        }
    }

    private void analyzeImage(@NonNull ImageProxy image) {
        long now = System.currentTimeMillis();
        // 限流：每 600ms 分析一次
        if (now - lastAnalysisTime < 600) {
            image.close();
            return;
        }
        lastAnalysisTime = now;

        if (isAnalyzing.getAndSet(true)) {
            image.close();
            return;
        }

        try {
            @SuppressWarnings("ConstantConditions")
            InputImage inputImage = InputImage.fromMediaImage(
                    image.getImage(), image.getImageInfo().getRotationDegrees());

            textRecognizer.process(inputImage)
                    .addOnSuccessListener(this::onTextRecognized)
                    .addOnFailureListener(e -> {
                        isAnalyzing.set(false);
                    })
                    .addOnCompleteListener(task -> image.close());

        } catch (Exception e) {
            isAnalyzing.set(false);
            image.close();
        }
    }

    private void onTextRecognized(Text text) {
        isAnalyzing.set(false);
        try {
            String fullText = text.getText();
            if (fullText == null || fullText.isEmpty()) return;

            List<Integer>[] parsed = parseLotteryNumbers(fullText, currentLotteryType);
            if (parsed == null) return;

            List<Integer> frontNums = parsed[0];
            List<Integer> backNums = parsed[1];

            if (frontNums == null || backNums == null) return;

            // 验证号码数量
            int expectedFront = currentLotteryType.equals("ssq") ? 6 : 5;
            int expectedBack = currentLotteryType.equals("ssq") ? 1 : 2;

            if (frontNums.size() != expectedFront || backNums.size() != expectedBack) {
                return;
            }

            lastDetectedFront = frontNums;
            lastDetectedBack = backNums;

            runOnUiThread(() -> displayDetectedNumbers(frontNums, backNums));

        } catch (Exception ignored) {
        }
    }

    /**
     * 从 OCR 识别文本中解析彩票号码
     * 支持多种格式：01 02 03 04 05 | 06 07 / 01,02,03,04,05+06,07 等
     */
    public static List<Integer>[] parseLotteryNumbers(String text, String lotteryType) {
        // 清理文本：处理常见 OCR 错误
        String cleaned = text.replaceAll("[Oo]", "0")
                .replaceAll("[lI|]", "1")
                .replaceAll("[Zz]", "2")
                .replaceAll("[BS]", "8")
                .replaceAll("[b]", "6")
                .replaceAll("[gq]", "9")
                .replaceAll("[T]", "7")
                .replaceAll("\\s+", " ")
                .replaceAll("[；;：:。，,\\-—]", " ")
                .trim();

        int frontCount = lotteryType.equals("ssq") ? 6 : 5;
        int backCount = lotteryType.equals("ssq") ? 1 : 2;
        int frontMax = lotteryType.equals("ssq") ? 33 : 35;
        int backMax = lotteryType.equals("ssq") ? 16 : 12;

        // 提取所有 2 位数字
        List<String> allNumbers = new ArrayList<>();
        Matcher m = Pattern.compile("\\b\\d{2}\\b").matcher(cleaned);
        while (m.find()) {
            allNumbers.add(m.group());
        }

        if (allNumbers.size() < frontCount + backCount) {
            // 也尝试匹配 1 位数字
            allNumbers.clear();
            m = Pattern.compile("\\b\\d{1,2}\\b").matcher(cleaned);
            while (m.find()) {
                String num = m.group();
                if (num.length() == 1) num = "0" + num;
                allNumbers.add(num);
            }
        }

        if (allNumbers.size() < frontCount + backCount) {
            return null;
        }

        // 尝试找到分隔符位置（+ 或 | 或 空格+数字模式变化）
        int splitIndex = -1;
        String full = String.join(" ", allNumbers);

        // 寻找 " + " 或 " | " 分隔符
        Matcher splitMatcher = Pattern.compile("\\d{2}\\s+[+|｜]\\s+\\d{2}").matcher(full);
        if (splitMatcher.find()) {
            String before = full.substring(0, splitMatcher.start() + 2);
            splitIndex = before.split("\\s+").length;
        }

        if (splitIndex < 0) {
            splitIndex = frontCount;
        }

        List<Integer> front = new ArrayList<>();
        List<Integer> back = new ArrayList<>();

        Set<Integer> frontSet = new HashSet<>();
        Set<Integer> backSet = new HashSet<>();

        for (int i = 0; i < allNumbers.size(); i++) {
            int num;
            try {
                num = Integer.parseInt(allNumbers.get(i));
            } catch (NumberFormatException e) {
                continue;
            }

            if (i < splitIndex) {
                if (num >= 1 && num <= frontMax && !frontSet.contains(num)) {
                    front.add(num);
                    frontSet.add(num);
                }
            } else {
                if (num >= 1 && num <= backMax && !backSet.contains(num)) {
                    back.add(num);
                    backSet.add(num);
                }
            }
        }

        // 如果分隔点不准确，尝试重新分配
        if (front.size() != frontCount || back.size() != backCount) {
            front.clear();
            back.clear();
            frontSet.clear();
            backSet.clear();

            for (String numStr : allNumbers) {
                int num;
                try {
                    num = Integer.parseInt(numStr);
                } catch (NumberFormatException e) {
                    continue;
                }

                if (num >= 1 && num <= frontMax && front.size() < frontCount && !frontSet.contains(num)) {
                    front.add(num);
                    frontSet.add(num);
                } else if (num >= 1 && num <= backMax && back.size() < backCount && !backSet.contains(num)) {
                    back.add(num);
                    backSet.add(num);
                }
            }
        }

        Collections.sort(front);
        Collections.sort(back);

        if (front.size() == frontCount && back.size() == backCount) {
            @SuppressWarnings("unchecked")
            List<Integer>[] result = new List[]{front, back};
            return result;
        }

        return null;
    }

    private void displayDetectedNumbers(List<Integer> front, List<Integer> back) {
        String typeName = currentLotteryType.equals("ssq") ? "双色球" : "大乐透";

        StringBuilder sb = new StringBuilder();
        for (int n : front) {
            sb.append(String.format("%02d", n)).append("  ");
        }
        sb.append("+  ");
        for (int n : back) {
            sb.append(String.format("%02d", n)).append("  ");
        }

        tvLotteryType.setText(typeName + " - 已识别号码");
        tvDetectedNumbers.setText(sb.toString().trim());
        tvHint.setVisibility(View.GONE);
        resultPanel.setVisibility(View.VISIBLE);
    }

    private void resetScanning() {
        lastDetectedFront = null;
        lastDetectedBack = null;
        resultPanel.setVisibility(View.GONE);
        tvHint.setVisibility(View.VISIBLE);
        lastAnalysisTime = 0;
    }

    private void confirmResult() {
        if (lastDetectedFront == null || lastDetectedBack == null) return;

        Intent resultIntent = new Intent();
        resultIntent.putExtra("front_nums", convertListToIntArray(lastDetectedFront));
        resultIntent.putExtra("back_nums", convertListToIntArray(lastDetectedBack));
        resultIntent.putExtra("lottery_type", currentLotteryType);
        setResult(RESULT_OK, resultIntent);
        finish();
    }

    private int[] convertListToIntArray(List<Integer> list) {
        int[] arr = new int[list.size()];
        for (int i = 0; i < list.size(); i++) {
            arr[i] = list.get(i);
        }
        return arr;
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (cameraExecutor != null) {
            cameraExecutor.shutdown();
        }
        if (textRecognizer != null) {
            textRecognizer.close();
        }
    }
}