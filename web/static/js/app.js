/**
 * 大乐透 / 双色球数据分析模型 - 前端交互逻辑
 */
// ==================== 全局状态 ====================
let currentTab = "dashboard";
let currentPage = 1;
let allCharts = {};
let currentLotteryType = "dlt";  // dlt=大乐透, ssq=双色球
let lotteryConfig = {};          // 当前彩种配置

// ==================== 初始化 ====================
document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    loadLotteryConfig().then(() => {
        loadDashboard();
        loadDataList();
    });

    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const tab = btn.dataset.tab;
            switchTab(tab);
        });
    });
});

// ==================== 彩种切换 ====================
async function loadLotteryConfig() {
    const data = await apiGet(`/api/lottery/config?type=${currentLotteryType}`);
    if (data) lotteryConfig = data;
    updateLotteryLabels();
}

function updateLotteryLabels() {
    const fn = lotteryConfig.front_name || "前区";
    const bn = lotteryConfig.back_name || "后区";
    // 更新导航栏标题
    const brandSpan = document.querySelector(".navbar-brand span:last-child");
    if (brandSpan) {
        brandSpan.textContent = `${lotteryConfig.name || "大乐透"}数据分析模型`;
    }
    // 更新彩种切换按钮
    document.querySelectorAll(".type-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.type === currentLotteryType);
    });
}

async function switchLotteryType(type) {
    if (type === currentLotteryType) return;
    currentLotteryType = type;
    await loadLotteryConfig();
    // 刷新当前页面
    if (currentTab === "dashboard") loadDashboard();
    else if (currentTab === "data") loadDataList();
    else if (currentTab === "frequency") loadFrequencyAnalysis();
    else if (currentTab === "statistics") loadStatistics();
    else if (currentTab === "predict") {
        document.getElementById("prediction-results").innerHTML = "";
    }
}

// ==================== 标签切换 ====================
function initTabs() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", function() {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            this.classList.add("active");

            document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
            document.getElementById("tab-" + this.dataset.tab).classList.add("active");

            currentTab = this.dataset.tab;
            onTabSwitch(currentTab);
        });
    });
}

function switchTab(tab) {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelector(`[data-tab="${tab}"]`).classList.add("active");
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    document.getElementById("tab-" + tab).classList.add("active");
    currentTab = tab;
    onTabSwitch(tab);
}

function onTabSwitch(tab) {
    switch (tab) {
        case "dashboard": loadDashboard(); break;
        case "data": loadDataList(); break;
        case "frequency": loadFrequencyAnalysis(); break;
        case "statistics": loadStatistics(); break;
        case "predict": break;
        case "export": break;
    }
}

// ==================== API 工具 ====================
function apiUrl(path) {
    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}type=${currentLotteryType}`;
}

async function apiGet(url) {
    try {
        const res = await fetch(apiUrl(url));
        return await res.json();
    } catch (e) {
        showToast("网络请求失败: " + e.message, "error");
        return null;
    }
}

function showToast(msg, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ==================== 仪表盘 ====================
async function loadDashboard() {
    const summary = await apiGet("/api/data/summary");
    if (!summary) return;

    const fn = summary.front_name || "前区";
    const bn = summary.back_name || "后区";

    document.getElementById("data-count").textContent = `共 ${summary.total_issues} 期`;
    document.getElementById("data-range").textContent =
        `${summary.date_range.start} ~ ${summary.date_range.end}`;

    const statsHtml = `
        <div class="stat-card">
            <div class="label">总期数</div>
            <div class="value">${summary.total_issues}</div>
        </div>
        <div class="stat-card">
            <div class="label">${fn}最热号码</div>
            <div class="value">
                <span class="ball ball-front">${summary.front_most}</span>
            </div>
            <div class="label">出现 ${summary.front_most_count} 次</div>
        </div>
        <div class="stat-card">
            <div class="label">${bn}最热号码</div>
            <div class="value">
                <span class="ball ball-back">${summary.back_most}</span>
            </div>
            <div class="label">出现 ${summary.back_most_count} 次</div>
        </div>
        <div class="stat-card">
            <div class="label">${fn}平均出现</div>
            <div class="value">${summary.front_avg}</div>
            <div class="label">次/号码</div>
        </div>
        <div class="stat-card">
            <div class="label">${bn}平均出现</div>
            <div class="value">${summary.back_avg}</div>
            <div class="label">次/号码</div>
        </div>
    `;
    document.getElementById("dashboard-stats").innerHTML = statsHtml;

    const freqData = await apiGet("/api/analysis/frequency");
    if (freqData) {
        drawFrontFrequency(freqData.front, freqData.front_name || fn);
        drawBackFrequency(freqData.back, freqData.back_name || bn);
    }

    const sumData = await apiGet("/api/analysis/sum");
    if (sumData) {
        drawSumTrend(sumData.front.all, fn);
    }
}

function drawFrontFrequency(freqData, label) {
    destroyChart("chart-front-freq");
    const labels = Object.keys(freqData);
    const values = Object.values(freqData);
    const colors = labels.map(n => {
        const v = freqData[n];
        const max = Math.max(...values);
        const ratio = v / max;
        return ratio > 0.7 ? "rgba(231, 76, 60, 0.8)" :
               ratio > 0.4 ? "rgba(243, 156, 18, 0.8)" :
                             "rgba(52, 152, 219, 0.8)";
    });

    const ctx = document.getElementById("chart-front-freq").getContext("2d");
    allCharts["chart-front-freq"] = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "出现次数",
                data: values,
                backgroundColor: colors,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: true, text: `${label}号码频率分布`, font: { size: 14 } }
            },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: "出现次数" } },
                x: { title: { display: true, text: "号码" } }
            }
        }
    });
}

function drawBackFrequency(freqData, label) {
    destroyChart("chart-back-freq");
    const labels = Object.keys(freqData);
    const values = Object.values(freqData);
    const colors = labels.map(n => {
        const v = freqData[n];
        const max = Math.max(...values);
        const ratio = v / max;
        return ratio > 0.7 ? "rgba(52, 152, 219, 0.8)" :
               ratio > 0.4 ? "rgba(46, 204, 113, 0.8)" :
                             "rgba(155, 89, 182, 0.8)";
    });

    const ctx = document.getElementById("chart-back-freq").getContext("2d");
    allCharts["chart-back-freq"] = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "出现次数",
                data: values,
                backgroundColor: colors,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: true, text: `${label}号码频率分布`, font: { size: 14 } }
            },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: "出现次数" } },
                x: { title: { display: true, text: "号码" } }
            }
        }
    });
}

function drawSumTrend(sumData, label) {
    destroyChart("chart-sum-trend");
    const labels = sumData.map((_, i) => `第${i + 1}期`);
    const ctx = document.getElementById("chart-sum-trend").getContext("2d");
    allCharts["chart-sum-trend"] = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: `${label}和值`,
                data: sumData,
                borderColor: "rgba(26, 115, 232, 1)",
                backgroundColor: "rgba(26, 115, 232, 0.1)",
                fill: true,
                tension: 0.3,
                pointRadius: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { title: { display: true, text: "和值" } }
            }
        }
    });
}

// ==================== 数据管理 ====================
async function loadDataList(page = 1) {
    currentPage = page;
    const data = await apiGet(`/api/data/list?page=${page}&per_page=20`);
    if (!data) return;

    const fn = data.front_name || "前区";
    const bn = data.back_name || "后区";

    const tbody = document.getElementById("data-table-body");
    if (data.items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">暂无数据</td></tr>`;
        return;
    }

    tbody.innerHTML = data.items.map(d => `
        <tr>
            <td><strong>${d.issue}</strong></td>
            <td>${d.date}</td>
            <td>${d.front_nums.map(n => `<span class="ball ball-front ball-small">${n}</span>`).join("")}</td>
            <td>${d.back_nums.map(n => `<span class="ball ball-back ball-small">${n}</span>`).join("")}</td>
            <td>${d.front_nums.reduce((a, b) => a + b, 0)}</td>
            <td>${d.back_nums.reduce((a, b) => a + b, 0)}</td>
        </tr>
    `).join("");

    // 更新表头
    document.querySelector("#tab-data thead tr").innerHTML = `
        <th>期号</th><th>开奖日期</th><th>${fn}号码</th><th>${bn}号码</th><th>${fn}和值</th><th>${bn}和值</th>
    `;

    const totalPages = Math.ceil(data.total / data.per_page);
    let pagHtml = "";
    for (let i = 1; i <= totalPages; i++) {
        pagHtml += `<button class="${i === page ? 'active' : ''}" onclick="loadDataList(${i})">${i}</button>`;
    }
    document.getElementById("data-pagination").innerHTML = pagHtml;
}

// ==================== 频率分析 ====================
async function loadFrequencyAnalysis() {
    const freqData = await apiGet("/api/analysis/frequency");
    const fn = freqData ? (freqData.front_name || "前区") : "前区";
    const bn = freqData ? (freqData.back_name || "后区") : "后区";

    if (freqData) {
        drawFrontHeatmap(freqData.front, fn);
        drawBackHeatmap(freqData.back, bn);
    }

    const missingData = await apiGet("/api/analysis/missing");
    if (missingData) {
        drawFrontMissing(missingData.front, fn);
        drawBackMissing(missingData.back, bn);
    }

    const hotCold = await apiGet("/api/analysis/hot_cold?top_n=10");
    if (hotCold) {
        renderHotCold(hotCold, fn, bn);
    }
}

function drawFrontHeatmap(freqData, label) {
    destroyChart("chart-front-heat");
    const labels = Object.keys(freqData);
    const values = Object.values(freqData);
    const ctx = document.getElementById("chart-front-heat").getContext("2d");
    allCharts["chart-front-heat"] = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "出现次数",
                data: values,
                backgroundColor: values.map(v => {
                    const max = Math.max(...values);
                    const r = Math.floor(255 * (v / max));
                    return `rgba(${r}, ${Math.floor(100 - r * 0.3)}, ${Math.floor(255 - r * 0.5)}, 0.8)`;
                }),
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: "y",
            plugins: {
                legend: { display: false },
                title: { display: true, text: `${label}号码热力图`, font: { size: 14 } }
            },
            scales: {
                x: { beginAtZero: true, title: { display: true, text: "出现次数" } },
                y: { title: { display: true, text: `${label}号码` } }
            }
        }
    });
}

function drawBackHeatmap(freqData, label) {
    destroyChart("chart-back-heat");
    const labels = Object.keys(freqData);
    const values = Object.values(freqData);
    const ctx = document.getElementById("chart-back-heat").getContext("2d");
    allCharts["chart-back-heat"] = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "出现次数",
                data: values,
                backgroundColor: values.map(v => {
                    const max = Math.max(...values);
                    const b = Math.floor(255 * (v / max));
                    return `rgba(52, ${Math.floor(100 + b * 0.3)}, ${b}, 0.8)`;
                }),
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: "y",
            plugins: {
                legend: { display: false },
                title: { display: true, text: `${label}号码热力图`, font: { size: 14 } }
            },
            scales: {
                x: { beginAtZero: true, title: { display: true, text: "出现次数" } },
                y: { title: { display: true, text: `${label}号码` } }
            }
        }
    });
}

function drawFrontMissing(missingData, label) {
    destroyChart("chart-front-missing");
    const labels = missingData.map(d => d.number);
    const values = missingData.map(d => d.missing);
    const ctx = document.getElementById("chart-front-missing").getContext("2d");
    allCharts["chart-front-missing"] = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "遗漏期数",
                data: values,
                backgroundColor: "rgba(231, 76, 60, 0.7)",
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: true, text: `遗漏分析 - ${label}`, font: { size: 14 } }
            },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: "遗漏期数" } },
                x: { title: { display: true, text: `${label}号码` } }
            }
        }
    });
}

function drawBackMissing(missingData, label) {
    destroyChart("chart-back-missing");
    const labels = missingData.map(d => d.number);
    const values = missingData.map(d => d.missing);
    const ctx = document.getElementById("chart-back-missing").getContext("2d");
    allCharts["chart-back-missing"] = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "遗漏期数",
                data: values,
                backgroundColor: "rgba(52, 152, 219, 0.7)",
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: true, text: `遗漏分析 - ${label}`, font: { size: 14 } }
            },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: "遗漏期数" } },
                x: { title: { display: true, text: `${label}号码` } }
            }
        }
    });
}

function renderHotCold(data, fn, bn) {
    const frontHot = data.front.hot.map(d =>
        `<span class="ball ball-front ball-small">${d.number}</span>(${d.count})`
    ).join(" ");
    const frontCold = data.front.cold.map(d =>
        `<span class="ball ball-front ball-small">${d.number}</span>(${d.count})`
    ).join(" ");
    const backHot = data.back.hot.map(d =>
        `<span class="ball ball-back ball-small">${d.number}</span>(${d.count})`
    ).join(" ");
    const backCold = data.back.cold.map(d =>
        `<span class="ball ball-back ball-small">${d.number}</span>(${d.count})`
    ).join(" ");

    document.getElementById("hot-cold-card").innerHTML = `
        <div class="card-title">🔥❄️ 冷热号分析</div>
        <div class="chart-row">
            <div>
                <h4 style="color: #e74c3c; margin-bottom: 8px;">🔥 ${fn}热号</h4>
                <p>${frontHot}</p>
                <h4 style="color: #3498db; margin: 12px 0 8px;">❄️ ${fn}冷号</h4>
                <p>${frontCold}</p>
            </div>
            <div>
                <h4 style="color: #e74c3c; margin-bottom: 8px;">🔥 ${bn}热号</h4>
                <p>${backHot}</p>
                <h4 style="color: #3498db; margin: 12px 0 8px;">❄️ ${bn}冷号</h4>
                <p>${backCold}</p>
            </div>
        </div>
    `;
}

// ==================== 统计分析 ====================
async function loadStatistics() {
    const dashboard = await apiGet("/api/analysis/dashboard");
    if (!dashboard) return;

    const fn = dashboard.front_name || "前区";
    const bn = dashboard.back_name || "后区";

    drawRatioChart("chart-odd-even-front", dashboard.odd_even.front, `${fn}奇偶比`);
    drawRatioChart("chart-odd-even-back", dashboard.odd_even.back, `${bn}奇偶比`);
    drawRatioChart("chart-big-small-front", dashboard.big_small.front, `${fn}大小比`);
    drawRatioChart("chart-big-small-back", dashboard.big_small.back, `${bn}大小比`);
    drawZoneChart(dashboard.zone);

    document.getElementById("consecutive-card").innerHTML = `
        <div class="card-title">🔗 连号分析</div>
        <div class="stat-grid">
            <div class="stat-card">
                <div class="label">含连号期数</div>
                <div class="value">${dashboard.consecutive.consecutive_issues}</div>
            </div>
            <div class="stat-card">
                <div class="label">总期数</div>
                <div class="value">${dashboard.consecutive.total_issues}</div>
            </div>
            <div class="stat-card">
                <div class="label">连号比例</div>
                <div class="value">${dashboard.consecutive.ratio}%</div>
            </div>
        </div>
    `;
}

function drawRatioChart(canvasId, data, title) {
    destroyChart(canvasId);
    const labels = data.map(d => d.ratio);
    const values = data.map(d => d.count);
    const colors = [
        "rgba(231, 76, 60, 0.8)", "rgba(52, 152, 219, 0.8)",
        "rgba(46, 204, 113, 0.8)", "rgba(243, 156, 18, 0.8)",
        "rgba(155, 89, 182, 0.8)", "rgba(26, 188, 156, 0.8)"
    ];

    const ctx = document.getElementById(canvasId).getContext("2d");
    allCharts[canvasId] = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: "#fff"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: "bottom" },
                title: { display: true, text: title, font: { size: 14 } }
            }
        }
    });
}

function drawZoneChart(zoneData) {
    destroyChart("chart-zone");
    const labels = [
        zoneData.zone1.label || "一区",
        zoneData.zone2.label || "二区",
        zoneData.zone3.label || "三区"
    ];
    const values = [zoneData.zone1.count, zoneData.zone2.count, zoneData.zone3.count];

    const ctx = document.getElementById("chart-zone").getContext("2d");
    allCharts["chart-zone"] = new Chart(ctx, {
        type: "pie",
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: [
                    "rgba(231, 76, 60, 0.8)",
                    "rgba(52, 152, 219, 0.8)",
                    "rgba(46, 204, 113, 0.8)"
                ],
                borderWidth: 2,
                borderColor: "#fff"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: "bottom" },
                title: { display: true, text: "前区/红球区间分布", font: { size: 14 } }
            }
        }
    });
}

// ==================== 趋势预测 ====================
async function runPrediction() {
    const container = document.getElementById("prediction-results");
    container.innerHTML = '<div style="text-align:center;padding:40px;"><span class="loading"></span> 正在计算预测结果...</div>';

    const data = await apiGet("/api/predict/comprehensive");
    if (!data) {
        container.innerHTML = '<p style="color:red;">预测失败，请重试</p>';
        return;
    }

    const renderPrediction = (result, title) => `
        <div class="prediction-result">
            <div class="method-name">${title}</div>
            <div class="balls-row">
                ${result.front_pred.map(n => `<span class="ball ball-front">${n}</span>`).join("")}
                <span style="margin: 0 8px; font-weight: bold;">+</span>
                ${result.back_pred.map(n => `<span class="ball ball-back">${n}</span>`).join("")}
            </div>
            ${result.confidence ? `<div class="confidence">⚠️ ${result.confidence} - 彩票有风险，请理性购彩</div>` : ""}
        </div>
    `;

    container.innerHTML = `
        <div style="margin-top: 16px;">
            <h3 style="margin-bottom: 12px;">🎯 综合推荐（多算法共识）</h3>
            ${renderPrediction(data.comprehensive, "综合推荐")}
        </div>
        <div class="chart-row" style="margin-top: 20px;">
            <div>
                <h4 style="margin-bottom: 8px;">${data.weighted_random.method}</h4>
                ${renderPrediction(data.weighted_random, "")}
            </div>
            <div>
                <h4 style="margin-bottom: 8px;">${data.markov_chain.method}</h4>
                ${renderPrediction(data.markov_chain, "")}
            </div>
        </div>
        <div style="margin-top: 20px;">
            <h4 style="margin-bottom: 8px;">${data.moving_average.method}</h4>
            ${renderPrediction(data.moving_average, "")}
        </div>
        <div style="margin-top: 20px; padding: 16px; background: #fff3cd; border-radius: 8px; font-size: 13px; color: #856404;">
            ⚠️ <strong>免责声明：</strong>所有预测结果仅供参考，彩票开奖为随机事件，无法保证预测准确。
            请理性购彩，量力而行，切勿沉迷。
        </div>
    `;
}

// ==================== 数据导出 ====================
function exportData(format) {
    const statusEl = document.getElementById("export-status");
    statusEl.innerHTML = '<span class="loading"></span> 正在导出...';

    const urls = {
        csv: `/api/export/csv?type=${currentLotteryType}`,
        json: `/api/export/json?type=${currentLotteryType}`,
        excel: `/api/export/excel?type=${currentLotteryType}`,
        report: `/api/export/report?type=${currentLotteryType}`
    };

    const url = urls[format];
    if (!url) return;

    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => {
        statusEl.innerHTML = "✅ 导出完成！文件已保存到 exports 目录";
    }, 1000);
}

// ==================== 工具函数 ====================
function destroyChart(canvasId) {
    if (allCharts[canvasId]) {
        allCharts[canvasId].destroy();
        delete allCharts[canvasId];
    }
}

document.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-overlay")) {
        e.target.classList.remove("show");
    }
});

// ==================== 数据刷新 ====================
async function refreshData() {
    if (!confirm("将清空现有数据并重新获取截至今天的最新200期开奖数据，是否继续？")) return;
    try {
        const res = await fetch(apiUrl("/api/data/refresh"), { method: "POST" });
        const data = await res.json();
        if (data.success) {
            showToast(data.message);
            loadDataList();
            loadDashboard();
        } else {
            showToast("刷新失败", "error");
        }
    } catch (e) {
        showToast("刷新失败: " + e.message, "error");
    }
}