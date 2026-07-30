# 大乐透数据分析模型 - ProGuard 规则
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-keep public class * extends android.app.Activity
-keep public class * extends android.app.Application
-keep public class * extends android.app.Service
-keep public class * extends android.content.BroadcastReceiver
-keep public class * extends android.content.ContentProvider

# WebView
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# 保持应用类
-keep class com.lottery.analyzer.** { *; }

# ML Kit
-keep class com.google.mlkit.** { *; }
-dontwarn com.google.mlkit.**

# CameraX
-dontwarn androidx.camera.**