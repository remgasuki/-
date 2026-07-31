# -*- mode: python ; coding: utf-8 -*-
"""
大乐透数据分析模型 - PyInstaller 打包配置
生成 Windows 免安装绿色版
"""
import glob
import os
from pathlib import Path

block_cipher = None

ROOT = Path(".").resolve()

# 收集所有需要打包的数据文件
datas = []

# web/templates 下的 HTML 文件
for f in glob.glob("web/templates/**/*.html", recursive=True):
    dest = os.path.dirname(f)
    datas.append((f, dest))

# web/static 下的所有文件
for f in glob.glob("web/static/**/*.*", recursive=True):
    dest = os.path.dirname(f)
    datas.append((f, dest))

# core 模块
for f in glob.glob("core/*.py"):
    datas.append((f, "core"))

print(f"共收集 {len(datas)} 个数据文件:")
for src, dst in datas:
    print(f"  {src} -> {dst}")

a = Analysis(
    ["app.py"],
    pathex=[str(ROOT)],
    binaries=[],
    datas=datas,
    hiddenimports=[
        "flask",
        "flask.json",
        "jinja2",
        "jinja2.ext",
        "openpyxl",
        "core",
        "core.data_loader",
        "core.frequency_analyzer",
        "core.trend_predictor",
        "core.statistics",
        "core.exporter",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tkinter",
        "matplotlib",
        "numpy",
        "pandas",
        "scipy",
        "PIL",
        "cv2",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="lottery",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)