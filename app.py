"""
大乐透 / 双色球数据分析模型 - Flask Web 后端
提供 RESTful API 接口和前端页面服务
"""
import os
import sys
import io
import webbrowser
import threading

# 确保 Windows 控制台输出使用 UTF-8 编码，防止中文乱码
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
from flask import Flask, jsonify, request, render_template, send_file

from core.data_loader import DataLoader, LOTTERY_CONFIGS
from core.frequency_analyzer import FrequencyAnalyzer
from core.trend_predictor import TrendPredictor
from core.statistics import StatisticsAnalyzer
from core.exporter import DataExporter


def _get_base_path():
    """获取基础路径，兼容 PyInstaller 打包后的路径"""
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))


BASE_PATH = _get_base_path()
sys.path.insert(0, BASE_PATH)

app = Flask(__name__,
            template_folder=os.path.join(BASE_PATH, "web", "templates"),
            static_folder=os.path.join(BASE_PATH, "web", "static"))
app.config['JSON_AS_ASCII'] = False

# 数据文件路径：开发模式用相对路径，打包后基于 exe 所在目录
if getattr(sys, 'frozen', False):
    EXE_DIR = os.path.dirname(sys.executable)
else:
    EXE_DIR = os.path.dirname(os.path.abspath(__file__))


def _get_data_file(lottery_type: str) -> str:
    """获取指定彩种的数据文件路径"""
    config = LOTTERY_CONFIGS[lottery_type]
    if getattr(sys, 'frozen', False):
        return os.path.join(EXE_DIR, "data", os.path.basename(config["default_data_file"]))
    return config["default_data_file"]


# 初始化两种彩种的核心模块
_loaders = {}
_analyzers = {}
_predictors = {}
_statistics = {}

for lt in ["dlt", "ssq"]:
    data_file = _get_data_file(lt)
    loader = DataLoader(data_file=data_file, lottery_type=lt)
    loader.load()
    _loaders[lt] = loader
    _analyzers[lt] = FrequencyAnalyzer(loader)
    _predictors[lt] = TrendPredictor(loader)
    _statistics[lt] = StatisticsAnalyzer(loader)

# 默认使用大乐透
exporter = DataExporter()


def _get_lt():
    """从请求参数中获取彩种类型，默认 dlt"""
    lt = request.args.get("type", "dlt")
    return lt if lt in _loaders else "dlt"


# ==================== 页面路由 ====================

@app.route("/")
def index():
    """主页面"""
    return render_template("index.html")


@app.route("/api/lottery/config")
def api_lottery_config():
    """获取当前彩种配置"""
    lt = _get_lt()
    config = LOTTERY_CONFIGS[lt]
    return jsonify({
        "type": lt,
        "name": config["name"],
        "front_name": config["front_name"],
        "back_name": config["back_name"],
        "front_count": config["front_count"],
        "back_count": config["back_count"],
        "front_range": [config["front_range"].start, config["front_range"].stop - 1],
        "back_range": [config["back_range"].start, config["back_range"].stop - 1],
    })


# ==================== 数据管理 API ====================

@app.route("/api/data/summary")
def api_data_summary():
    """获取数据概览"""
    lt = _get_lt()
    return jsonify(_analyzers[lt].get_summary())


@app.route("/api/data/list")
def api_data_list():
    """获取开奖数据列表（倒序，最新在前）"""
    lt = _get_lt()
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)
    data = list(reversed(_loaders[lt].get_all()))
    total = len(data)
    start = (page - 1) * per_page
    end = start + per_page
    items = [d.to_dict() for d in data[start:end]]
    return jsonify({"total": total, "page": page, "per_page": per_page, "items": items,
                    "lottery_type": lt, "front_name": _loaders[lt].FRONT_NAME,
                    "back_name": _loaders[lt].BACK_NAME})


@app.route("/api/data/add", methods=["POST"])
def api_data_add():
    """手动添加开奖记录"""
    lt = _get_lt()
    body = request.get_json()
    try:
        record = _loaders[lt].add_record(
            issue=body["issue"],
            date=body["date"],
            front_nums=body["front_nums"],
            back_nums=body["back_nums"]
        )
        return jsonify({"success": True, "record": record.to_dict()})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/api/data/refresh", methods=["POST"])
def api_data_refresh():
    """刷新数据：从官方API获取最新真实开奖数据"""
    lt = _get_lt()
    count = request.args.get("count", 200, type=int)
    new_count = _loaders[lt].regenerate(count)
    return jsonify({"success": True, "total": new_count,
                    "message": f"已刷新为最新{new_count}期{LOTTERY_CONFIGS[lt]['name']}真实数据"})


# ==================== 频率分析 API ====================

@app.route("/api/analysis/frequency")
def api_frequency():
    """号码频率分析"""
    lt = _get_lt()
    return jsonify({
        "front": _analyzers[lt].get_front_frequency(),
        "back": _analyzers[lt].get_back_frequency(),
        "lottery_type": lt,
        "front_name": _loaders[lt].FRONT_NAME,
        "back_name": _loaders[lt].BACK_NAME,
    })


@app.route("/api/analysis/hot_cold")
def api_hot_cold():
    """冷热号分析"""
    lt = _get_lt()
    top_n = request.args.get("top_n", 10, type=int)
    return jsonify(_analyzers[lt].get_hot_cold_analysis(top_n))


@app.route("/api/analysis/missing")
def api_missing():
    """遗漏分析"""
    lt = _get_lt()
    return jsonify(_analyzers[lt].get_missing_analysis())


# ==================== 统计分析 API ====================

@app.route("/api/analysis/odd_even")
def api_odd_even():
    """奇偶比分析"""
    lt = _get_lt()
    return jsonify(_statistics[lt].analyze_odd_even())


@app.route("/api/analysis/big_small")
def api_big_small():
    """大小比分析"""
    lt = _get_lt()
    return jsonify(_statistics[lt].analyze_big_small())


@app.route("/api/analysis/sum")
def api_sum():
    """和值分析"""
    lt = _get_lt()
    return jsonify(_statistics[lt].analyze_sum())


@app.route("/api/analysis/zone")
def api_zone():
    """区间分布"""
    lt = _get_lt()
    return jsonify(_statistics[lt].analyze_zone_distribution())


@app.route("/api/analysis/consecutive")
def api_consecutive():
    """连号分析"""
    lt = _get_lt()
    return jsonify(_statistics[lt].analyze_consecutive())


@app.route("/api/analysis/dashboard")
def api_dashboard():
    """仪表盘综合统计"""
    lt = _get_lt()
    return jsonify(_statistics[lt].get_dashboard_stats())


# ==================== 预测 API ====================

@app.route("/api/predict/weighted")
def api_predict_weighted():
    """加权随机预测"""
    lt = _get_lt()
    lookback = request.args.get("lookback", 50, type=int)
    return jsonify(_predictors[lt].predict_weighted_random(lookback))


@app.route("/api/predict/markov")
def api_predict_markov():
    """马尔可夫链预测"""
    lt = _get_lt()
    lookback = request.args.get("lookback", 30, type=int)
    return jsonify(_predictors[lt].predict_markov_chain(lookback))


@app.route("/api/predict/moving_avg")
def api_predict_moving_avg():
    """移动平均预测"""
    lt = _get_lt()
    window = request.args.get("window", 10, type=int)
    return jsonify(_predictors[lt].predict_moving_average(window))


@app.route("/api/predict/comprehensive")
def api_predict_comprehensive():
    """综合预测"""
    lt = _get_lt()
    return jsonify(_predictors[lt].predict_comprehensive())


# ==================== 导出 API ====================

@app.route("/api/export/csv")
def api_export_csv():
    """导出CSV"""
    lt = _get_lt()
    path = exporter.export_csv(_loaders[lt].get_all(), lottery_type=lt)
    return send_file(os.path.abspath(path), as_attachment=True,
                     download_name=os.path.basename(path))


@app.route("/api/export/json")
def api_export_json():
    """导出JSON"""
    lt = _get_lt()
    path = exporter.export_json(_loaders[lt].get_all(), lottery_type=lt)
    return send_file(os.path.abspath(path), as_attachment=True,
                     download_name=os.path.basename(path))


@app.route("/api/export/excel")
def api_export_excel():
    """导出Excel"""
    lt = _get_lt()
    path = exporter.export_excel(_loaders[lt].get_all(), lottery_type=lt)
    return send_file(os.path.abspath(path), as_attachment=True,
                     download_name=os.path.basename(path))


@app.route("/api/export/report")
def api_export_report():
    """导出分析报告"""
    lt = _get_lt()
    analysis = {
        "lottery_type": lt,
        "frequency": _analyzers[lt].get_hot_cold_analysis(),
        "missing": _analyzers[lt].get_missing_analysis(),
        "statistics": _statistics[lt].get_dashboard_stats(),
        "prediction": _predictors[lt].predict_comprehensive()
    }
    path = exporter.export_analysis_report(analysis, lottery_type=lt)
    return send_file(os.path.abspath(path), as_attachment=True,
                     download_name=os.path.basename(path))


# ==================== 启动入口 ====================

def open_browser():
    """延迟打开浏览器"""
    webbrowser.open("http://127.0.0.1:5000")


def main():
    print("=" * 60)
    print("  大乐透 / 双色球 数据分析模型 v1.3")
    print("  Windows 桌面版 / Android 移动版")
    print("=" * 60)
    for lt in ["dlt", "ssq"]:
        loader = _loaders[lt]
        print(f"  [{LOTTERY_CONFIGS[lt]['name']}] 数据文件: {os.path.abspath(loader.data_file)}")
        print(f"  [{LOTTERY_CONFIGS[lt]['name']}] 已加载 {len(loader.get_all())} 期开奖数据")
    print(f"  访问地址: http://127.0.0.1:5000")
    print("=" * 60)

    threading.Timer(1.5, open_browser).start()
    app.run(host="127.0.0.1", port=5000, debug=False)


if __name__ == "__main__":
    main()