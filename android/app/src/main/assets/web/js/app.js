/**
 * 大乐透 / 双色球数据分析模型 - Android 离线版
 * 包含完整分析引擎（纯 JavaScript 实现）
 */

// ==================== 彩种配置 ====================
const LOTTERY_CONFIGS = {
    dlt: {
        name: "大乐透",
        front_name: "前区",
        back_name: "后区",
        front_range: Array.from({length: 35}, (_, i) => i + 1),   // 1-35
        back_range: Array.from({length: 12}, (_, i) => i + 1),    // 1-12
        front_count: 5,
        back_count: 2,
        front_mid: 18,
        back_mid: 7,
        zone_boundaries: [12, 24],
        zone_labels: ["一区(1-12)", "二区(13-24)", "三区(25-35)"],
        api_game_no: 85,
        storage_key: "lottery_data",
    },
    ssq: {
        name: "双色球",
        front_name: "红球",
        back_name: "蓝球",
        front_range: Array.from({length: 33}, (_, i) => i + 1),   // 1-33
        back_range: Array.from({length: 16}, (_, i) => i + 1),    // 1-16
        front_count: 6,
        back_count: 1,
        front_mid: 17,
        back_mid: 9,
        zone_boundaries: [11, 22],
        zone_labels: ["一区(1-11)", "二区(12-22)", "三区(23-33)"],
        api_game_no: 33,
        storage_key: "ssq_data",
    },
};

let currentLotteryType = "dlt";
const PER_PAGE = 20;

// ==================== 全局状态 ====================
let lotteryData = [];  // 当前彩种数据
let allCharts = {};
let currentPage = 1;

// 彩种数据缓存（避免频繁切换时重新加载）
const dataCache = { dlt: null, ssq: null };

// ==================== 快捷访问 ====================
function cfg() { return LOTTERY_CONFIGS[currentLotteryType]; }
function FR() { return cfg().front_range; }
function BR() { return cfg().back_range; }
function FC() { return cfg().front_count; }
function BC() { return cfg().back_count; }
function FM() { return cfg().front_mid; }
function BM() { return cfg().back_mid; }
function ZB() { return cfg().zone_boundaries; }
function ZL() { return cfg().zone_labels; }
function FN() { return cfg().front_name; }
function BN() { return cfg().back_name; }
function LTN() { return cfg().name; }
function SK() { return cfg().storage_key; }

// ==================== 数据管理 ====================
function loadData() {
    if (dataCache[currentLotteryType] !== null) {
        lotteryData = dataCache[currentLotteryType];
        return lotteryData;
    }
    const raw = localStorage.getItem(SK());
    if (raw) {
        lotteryData = JSON.parse(raw);
        dataCache[currentLotteryType] = lotteryData;
    } else {
        lotteryData = [];
    }
    return lotteryData;
}

function saveData() {
    localStorage.setItem(SK(), JSON.stringify(lotteryData));
    dataCache[currentLotteryType] = lotteryData;
}

function addRecord(issue, date, frontNums, backNums) {
    frontNums.sort((a, b) => a - b);
    backNums.sort((a, b) => a - b);
    lotteryData.push({ issue, date, front_nums: frontNums, back_nums: backNums });
    saveData();
}

async function fetchRealData(count = 200) {
    if (lotteryData.length > 0) {
        if (!confirm(`将清空现有${LTN()}数据并从官方获取最新真实开奖数据，是否继续？`)) return;
    }
    showToast(`正在从官方获取${LTN()}最新数据...`, "info");

    if (currentLotteryType === "ssq") {
        return fetchSSQData(count);
    } else {
        return fetchDLTData(count);
    }
}

async function fetchDLTData(count = 200) {
    const headers = {
        "Accept": "application/json",
        "Referer": "https://static.sporttery.cn/"
    };
    const pageSize = Math.min(count, 100);
    const totalPages = Math.ceil(count / pageSize);
    let allItems = [];
    const gameNo = cfg().api_game_no;

    try {
        for (let page = 1; page <= totalPages; page++) {
            const url = `https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=${gameNo}&provinceId=0&pageSize=${pageSize}&isVerify=1&pageNo=${page}`;
            const res = await fetch(url, { headers });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const data = await res.json();
            const items = data.value && data.value.list;
            if (!items || items.length === 0) break;
            allItems = allItems.concat(items);
        }
        if (allItems.length === 0) {
            throw new Error("未获取到数据");
        }
        lotteryData = [];
        const fc = FC();
        const bc = BC();
        allItems.reverse().forEach(item => {
            const issue = item.lotteryDrawNum;
            const date = item.lotteryDrawTime;
            const raw = item.lotteryDrawResult;
            if (!raw) return;
            const nums = raw.split(" ");
            if (nums.length < fc + bc) return;
            const front = nums.slice(0, fc).map(n => parseInt(n));
            const back = nums.slice(fc, fc + bc).map(n => parseInt(n));
            addRecord(issue, date, front, back);
        });
        saveData();
        showToast(`已获取最新 ${lotteryData.length} 期${LTN()}真实数据`);
        loadDataList();
        loadDashboard();
    } catch (err) {
        showToast("获取失败: " + err.message + "，请检查网络", "error");
        console.error(err);
    }
}

async function fetchSSQData(count = 200) {
    const headers = {
        "Accept": "application/json",
        "Referer": "https://www.cwl.gov.cn/"
    };
    const pageSize = Math.min(count, 30);
    const totalPages = Math.ceil(count / pageSize);
    let allItems = [];

    try {
        for (let page = 1; page <= totalPages; page++) {
            const url = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=ssq&pageNo=${page}&pageSize=${pageSize}&systemType=PC`;
            const res = await fetch(url, { headers });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const data = await res.json();
            const items = data.result;
            if (!items || items.length === 0) break;
            allItems = allItems.concat(items);
        }
        if (allItems.length === 0) {
            throw new Error("未获取到数据");
        }
        lotteryData = [];
        allItems.reverse().forEach(item => {
            const issue = item.code;
            let date = item.date;
            // 清理日期格式 "2026-07-30(四)" -> "2026-07-30"
            if (date && date.includes("(")) {
                date = date.substring(0, date.indexOf("("));
            }
            const red = item.red;
            const blue = item.blue;
            if (!red) return;
            const front = red.split(",").map(n => parseInt(n));
            const back = blue ? blue.split(",").filter(n => n).map(n => parseInt(n)) : [];
            addRecord(issue, date, front, back);
        });
        saveData();
        showToast(`已获取最新 ${lotteryData.length} 期${LTN()}真实数据`);
        loadDataList();
        loadDashboard();
    } catch (err) {
        showToast("获取失败: " + err.message + "，请检查网络", "error");
        console.error(err);
    }
}

function sample(arr, k) {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, k).sort((a, b) => a - b);
}

// ==================== 彩种切换 ====================
function switchLotteryType(type) {
    if (type === currentLotteryType) return;
    currentLotteryType = type;
    loadData();
    updateLotteryLabels();
    refreshCurrentTab();
}

function updateLotteryLabels() {
    document.querySelectorAll(".type-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.type === currentLotteryType);
    });
    const brandSpan = document.querySelector(".navbar-brand span:last-child");
    if (brandSpan) {
        brandSpan.textContent = `${LTN()}数据分析模型`;
    }
}

function refreshCurrentTab() {
    const activeTab = document.querySelector(".tab-btn.active");
    if (!activeTab) return;
    const tab = activeTab.dataset.tab;
    switch (tab) {
        case "dashboard": loadDashboard(); break;
        case "data": loadDataList(); break;
        case "frequency": loadFrequencyAnalysis(); break;
        case "statistics": loadStatistics(); break;
        case "predict":
            document.getElementById("prediction-results").innerHTML = "";
            break;
    }
}

// ==================== 分析引擎 ====================
function getFrontFrequency(data) {
    const counter = {};
    FR().forEach(n => counter[n] = 0);
    (data || lotteryData).forEach(d => d.front_nums.forEach(n => counter[n]++));
    return counter;
}

function getBackFrequency(data) {
    const counter = {};
    BR().forEach(n => counter[n] = 0);
    (data || lotteryData).forEach(d => d.back_nums.forEach(n => counter[n]++));
    return counter;
}

function getHotColdAnalysis(topN = 10) {
    const frontFreq = getFrontFrequency();
    const backFreq = getBackFrequency();
    const sortedFront = Object.entries(frontFreq).sort((a, b) => b[1] - a[1]);
    const sortedBack = Object.entries(backFreq).sort((a, b) => b[1] - a[1]);
    return {
        front: {
            hot: sortedFront.slice(0, topN).map(([n, c]) => ({ number: parseInt(n), count: c })),
            cold: sortedFront.slice(-topN).map(([n, c]) => ({ number: parseInt(n), count: c }))
        },
        back: {
            hot: sortedBack.slice(0, topN).map(([n, c]) => ({ number: parseInt(n), count: c })),
            cold: sortedBack.slice(-topN).map(([n, c]) => ({ number: parseInt(n), count: c }))
        }
    };
}

function getMissingAnalysis() {
    const frontMissing = {};
    const backMissing = {};
    FR().forEach(n => {
        let missing = 0;
        for (let i = lotteryData.length - 1; i >= 0; i--) {
            if (lotteryData[i].front_nums.includes(n)) break;
            missing++;
        }
        frontMissing[n] = missing;
    });
    BR().forEach(n => {
        let missing = 0;
        for (let i = lotteryData.length - 1; i >= 0; i--) {
            if (lotteryData[i].back_nums.includes(n)) break;
            missing++;
        }
        backMissing[n] = missing;
    });
    return {
        front: Object.entries(frontMissing).map(([n, c]) => ({ number: parseInt(n), missing: c })).sort((a, b) => b.missing - a.missing),
        back: Object.entries(backMissing).map(([n, c]) => ({ number: parseInt(n), missing: c })).sort((a, b) => b.missing - a.missing)
    };
}

function getSummary() {
    const frontFreq = getFrontFrequency();
    const backFreq = getBackFrequency();
    const frontValues = Object.values(frontFreq);
    const backValues = Object.values(backFreq);
    const frontMost = Object.entries(frontFreq).sort((a, b) => b[1] - a[1])[0];
    const backMost = Object.entries(backFreq).sort((a, b) => b[1] - a[1])[0];
    return {
        total_issues: lotteryData.length,
        date_range: {
            start: lotteryData.length > 0 ? lotteryData[0].date : "",
            end: lotteryData.length > 0 ? lotteryData[lotteryData.length - 1].date : ""
        },
        front_avg: (frontValues.reduce((a, b) => a + b, 0) / FR().length).toFixed(2),
        back_avg: (backValues.reduce((a, b) => a + b, 0) / BR().length).toFixed(2),
        front_most: parseInt(frontMost[0]),
        front_most_count: frontMost[1],
        back_most: parseInt(backMost[0]),
        back_most_count: backMost[1],
        front_name: FN(),
        back_name: BN(),
    };
}

function analyzeOddEven(data) {
    const frontRatios = {};
    const backRatios = {};
    data = data || lotteryData;
    const fc = FC();
    const bc = BC();
    data.forEach(d => {
        const frontOdd = d.front_nums.filter(n => n % 2 === 1).length;
        const fk = frontOdd + ":" + (fc - frontOdd);
        frontRatios[fk] = (frontRatios[fk] || 0) + 1;
        const backOdd = d.back_nums.filter(n => n % 2 === 1).length;
        const bk = backOdd + ":" + (bc - backOdd);
        backRatios[bk] = (backRatios[bk] || 0) + 1;
    });
    return {
        front: Object.entries(frontRatios).map(([r, c]) => ({ ratio: r, count: c })).sort((a, b) => b.count - a.count),
        back: Object.entries(backRatios).map(([r, c]) => ({ ratio: r, count: c })).sort((a, b) => b.count - a.count)
    };
}

function analyzeBigSmall(data) {
    const frontRatios = {};
    const backRatios = {};
    data = data || lotteryData;
    const fm = FM();
    const bm = BM();
    const fc = FC();
    const bc = BC();
    data.forEach(d => {
        const frontBig = d.front_nums.filter(n => n >= fm).length;
        const fk = frontBig + ":" + (fc - frontBig);
        frontRatios[fk] = (frontRatios[fk] || 0) + 1;
        const backBig = d.back_nums.filter(n => n >= bm).length;
        const bk = backBig + ":" + (bc - backBig);
        backRatios[bk] = (backRatios[bk] || 0) + 1;
    });
    return {
        front: Object.entries(frontRatios).map(([r, c]) => ({ ratio: r, count: c })).sort((a, b) => b.count - a.count),
        back: Object.entries(backRatios).map(([r, c]) => ({ ratio: r, count: c })).sort((a, b) => b.count - a.count)
    };
}

function analyzeSum(data) {
    data = data || lotteryData;
    const frontSums = data.map(d => d.front_nums.reduce((a, b) => a + b, 0));
    const backSums = data.map(d => d.back_nums.reduce((a, b) => a + b, 0));
    return {
        front: { min: Math.min(...frontSums), max: Math.max(...frontSums),
            avg: (frontSums.reduce((a, b) => a + b, 0) / frontSums.length).toFixed(2), all: frontSums.slice(-50) },
        back: { min: Math.min(...backSums), max: Math.max(...backSums),
            avg: (backSums.reduce((a, b) => a + b, 0) / backSums.length).toFixed(2), all: backSums.slice(-50) }
    };
}

function analyzeZone(data) {
    data = data || lotteryData;
    const boundaries = ZB();
    const zones = { zone1: 0, zone2: 0, zone3: 0 };
    data.forEach(d => {
        d.front_nums.forEach(n => {
            if (n <= boundaries[0]) zones.zone1++;
            else if (n <= boundaries[1]) zones.zone2++;
            else zones.zone3++;
        });
    });
    const total = zones.zone1 + zones.zone2 + zones.zone3;
    const labels = ZL();
    return {
        zone1: { count: zones.zone1, ratio: total ? (zones.zone1 / total * 100).toFixed(1) : 0, label: labels[0] },
        zone2: { count: zones.zone2, ratio: total ? (zones.zone2 / total * 100).toFixed(1) : 0, label: labels[1] },
        zone3: { count: zones.zone3, ratio: total ? (zones.zone3 / total * 100).toFixed(1) : 0, label: labels[2] },
    };
}

function analyzeConsecutive(data) {
    data = data || lotteryData;
    let count = 0;
    data.forEach(d => {
        const nums = [...d.front_nums].sort((a, b) => a - b);
        for (let i = 0; i < nums.length - 1; i++) {
            if (nums[i + 1] - nums[i] === 1) { count++; break; }
        }
    });
    return { consecutive_issues: count, total_issues: data.length, ratio: (count / data.length * 100).toFixed(1) };
}

// ==================== 预测算法 ====================
function weightedSample(population, weights, k) {
    const result = [];
    const pop = [...population];
    const w = [...weights];
    for (let i = 0; i < k; i++) {
        if (pop.length === 0) break;
        const total = w.reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        let cumsum = 0;
        for (let j = 0; j < w.length; j++) {
            cumsum += w[j];
            if (r <= cumsum) {
                result.push(pop[j]);
                pop.splice(j, 1);
                w.splice(j, 1);
                break;
            }
        }
    }
    return result;
}

function predictWeightedRandom(lookback = 50) {
    const data = lotteryData.slice(-lookback);
    const frontCounter = {};
    const backCounter = {};
    FR().forEach(n => frontCounter[n] = 0);
    BR().forEach(n => backCounter[n] = 0);
    data.forEach(d => { d.front_nums.forEach(n => frontCounter[n]++); d.back_nums.forEach(n => backCounter[n]++); });
    const frontWeights = FR().map(n => frontCounter[n] + 1);
    const backWeights = BR().map(n => backCounter[n] + 1);
    return {
        method: "加权随机预测",
        front_pred: weightedSample(FR(), frontWeights, FC()).sort((a, b) => a - b),
        back_pred: weightedSample(BR(), backWeights, BC()).sort((a, b) => a - b),
        confidence: "低（仅供参考）"
    };
}

function predictMarkovChain(lookback = 30) {
    const data = lotteryData.slice(-lookback);
    if (data.length < 2) return predictWeightedRandom(lookback);
    const frontTrans = {};
    const backTrans = {};
    for (let i = 0; i < data.length - 1; i++) {
        const curr = data[i], next = data[i + 1];
        curr.front_nums.forEach(n => {
            if (!frontTrans[n]) frontTrans[n] = {};
            next.front_nums.forEach(m => { frontTrans[n][m] = (frontTrans[n][m] || 0) + 1; });
        });
        curr.back_nums.forEach(n => {
            if (!backTrans[n]) backTrans[n] = {};
            next.back_nums.forEach(m => { backTrans[n][m] = (backTrans[n][m] || 0) + 1; });
        });
    }
    const last = data[data.length - 1];
    const frontCandidates = {};
    const backCandidates = {};
    last.front_nums.forEach(n => {
        if (frontTrans[n]) Object.entries(frontTrans[n]).forEach(([m, w]) => { frontCandidates[m] = (frontCandidates[m] || 0) + w; });
    });
    last.back_nums.forEach(n => {
        if (backTrans[n]) Object.entries(backTrans[n]).forEach(([m, w]) => { backCandidates[m] = (backCandidates[m] || 0) + w; });
    });
    FR().forEach(n => { if (!frontCandidates[n]) frontCandidates[n] = 1; });
    BR().forEach(n => { if (!backCandidates[n]) backCandidates[n] = 1; });
    const fEntries = Object.entries(frontCandidates);
    const bEntries = Object.entries(backCandidates);
    return {
        method: "马尔可夫链预测",
        front_pred: weightedSample(fEntries.map(e => parseInt(e[0])), fEntries.map(e => e[1]), FC()).sort((a, b) => a - b),
        back_pred: weightedSample(bEntries.map(e => parseInt(e[0])), bEntries.map(e => e[1]), BC()).sort((a, b) => a - b),
        confidence: "低（仅供参考）"
    };
}

function predictMovingAverage(window = 10) {
    if (lotteryData.length < window) return predictWeightedRandom();
    const frontIntervals = {};
    const backIntervals = {};
    FR().forEach(n => {
        const intervals = [];
        let lastSeen = null;
        lotteryData.forEach((d, i) => {
            if (d.front_nums.includes(n)) { if (lastSeen !== null) intervals.push(i - lastSeen); lastSeen = i; }
        });
        frontIntervals[n] = intervals.length > 0 ? intervals.slice(-window).reduce((a, b) => a + b, 0) / Math.min(intervals.length, window) : Infinity;
    });
    BR().forEach(n => {
        const intervals = [];
        let lastSeen = null;
        lotteryData.forEach((d, i) => {
            if (d.back_nums.includes(n)) { if (lastSeen !== null) intervals.push(i - lastSeen); lastSeen = i; }
        });
        backIntervals[n] = intervals.length > 0 ? intervals.slice(-window).reduce((a, b) => a + b, 0) / Math.min(intervals.length, window) : Infinity;
    });
    const sortedFront = Object.entries(frontIntervals).sort((a, b) => b[1] - a[1]);
    const sortedBack = Object.entries(backIntervals).sort((a, b) => b[1] - a[1]);
    const fc = FC(), bc = BC();
    const topFront = sortedFront.slice(0, fc * 3).map(e => parseInt(e[0]));
    const topBack = sortedBack.slice(0, bc * 3).map(e => parseInt(e[0]));
    return {
        method: "移动平均预测",
        front_pred: sample(topFront, Math.min(fc, topFront.length)),
        back_pred: sample(topBack, Math.min(bc, topBack.length)),
        confidence: "低（仅供参考）"
    };
}

function predictComprehensive() {
    const weighted = predictWeightedRandom();
    const markov = predictMarkovChain();
    const movingAvg = predictMovingAverage();
    const allFront = {};
    const allBack = {};
    [weighted, markov, movingAvg].forEach(p => {
        p.front_pred.forEach(n => allFront[n] = (allFront[n] || 0) + 1);
        p.back_pred.forEach(n => allBack[n] = (allBack[n] || 0) + 1);
    });
    const fc = FC(), bc = BC();
    const topFront = Object.entries(allFront).sort((a, b) => b[1] - a[1]).slice(0, fc).map(e => parseInt(e[0]));
    const topBack = Object.entries(allBack).sort((a, b) => b[1] - a[1]).slice(0, bc).map(e => parseInt(e[0]));
    return { weighted_random: weighted, markov_chain: markov, moving_average: movingAvg,
             comprehensive: { front_pred: topFront.sort((a, b) => a - b), back_pred: topBack.sort((a, b) => a - b) } };
}

// ==================== UI 工具 ====================
function showToast(msg, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function destroyChart(id) {
    if (allCharts[id]) { allCharts[id].destroy(); delete allCharts[id]; }
}

// ==================== 初始化 ====================
document.addEventListener("DOMContentLoaded", () => {
    loadData();
    updateLotteryLabels();
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", function() {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            this.classList.add("active");
            document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
            document.getElementById("tab-" + this.dataset.tab).classList.add("active");
            onTabSwitch(this.dataset.tab);
        });
    });
    loadDashboard();
    loadDataList();
});

function onTabSwitch(tab) {
    switch (tab) {
        case "dashboard": loadDashboard(); break;
        case "data": loadDataList(); break;
        case "frequency": loadFrequencyAnalysis(); break;
        case "statistics": loadStatistics(); break;
        case "predict": break;
        case "scanner": break;
        case "export": break;
    }
}

// ==================== 仪表盘 ====================
function loadDashboard() {
    if (lotteryData.length === 0) {
        document.getElementById("dashboard-stats").innerHTML =
            `<div class="empty-state">暂无${LTN()}数据，请点击"获取最新数据"获取真实开奖记录</div>`;
        document.getElementById("data-count").textContent = "无数据";
        return;
    }
    const summary = getSummary();
    const fn = FN(), bn = BN();
    document.getElementById("data-count").textContent = `共 ${summary.total_issues} 期`;
    document.getElementById("dashboard-stats").innerHTML = `
        <div class="stat-card"><div class="label">总期数</div><div class="value">${summary.total_issues}</div></div>
        <div class="stat-card"><div class="label">${fn}最热</div><div class="value"><span class="ball ball-front">${summary.front_most}</span></div><div class="label">${summary.front_most_count}次</div></div>
        <div class="stat-card"><div class="label">${bn}最热</div><div class="value"><span class="ball ball-back">${summary.back_most}</span></div><div class="label">${summary.back_most_count}次</div></div>
        <div class="stat-card"><div class="label">${fn}平均</div><div class="value">${summary.front_avg}</div><div class="label">次/号码</div></div>
    `;
    const frontFreq = getFrontFrequency();
    const backFreq = getBackFrequency();
    drawFrontFrequency(frontFreq, fn);
    drawBackFrequency(backFreq, bn);
    const sumData = analyzeSum();
    drawSumTrend(sumData.front.all, fn);
}

function drawFrontFrequency(freqData, label) {
    destroyChart("chart-front-freq");
    const labels = Object.keys(freqData);
    const values = Object.values(freqData);
    const max = Math.max(...values);
    const colors = labels.map(n => {
        const ratio = freqData[n] / max;
        return ratio > 0.7 ? "rgba(231,76,60,0.8)" : ratio > 0.4 ? "rgba(243,156,18,0.8)" : "rgba(52,152,219,0.8)";
    });
    const ctx = document.getElementById("chart-front-freq").getContext("2d");
    allCharts["chart-front-freq"] = new Chart(ctx, {
        type: "bar", data: { labels, datasets: [{ label: "出现次数", data: values, backgroundColor: colors, borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: `${label}号码频率分布`, font: { size: 14 } } },
            scales: { y: { beginAtZero: true } } }
    });
}

function drawBackFrequency(freqData, label) {
    destroyChart("chart-back-freq");
    const labels = Object.keys(freqData);
    const values = Object.values(freqData);
    const max = Math.max(...values);
    const colors = labels.map(n => {
        const ratio = freqData[n] / max;
        return ratio > 0.7 ? "rgba(52,152,219,0.8)" : ratio > 0.4 ? "rgba(46,204,113,0.8)" : "rgba(155,89,182,0.8)";
    });
    const ctx = document.getElementById("chart-back-freq").getContext("2d");
    allCharts["chart-back-freq"] = new Chart(ctx, {
        type: "bar", data: { labels, datasets: [{ label: "出现次数", data: values, backgroundColor: colors, borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: `${label}号码频率分布`, font: { size: 14 } } },
            scales: { y: { beginAtZero: true } } }
    });
}

function drawSumTrend(sumData, label) {
    destroyChart("chart-sum-trend");
    const ctx = document.getElementById("chart-sum-trend").getContext("2d");
    allCharts["chart-sum-trend"] = new Chart(ctx, {
        type: "line", data: {
            labels: sumData.map((_, i) => i + 1),
            datasets: [{ label: `${label}和值`, data: sumData, borderColor: "rgba(26,115,232,1)",
                backgroundColor: "rgba(26,115,232,0.1)", fill: true, tension: 0.3, pointRadius: 2 }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// ==================== 数据管理 ====================
function loadDataList(page = 1) {
    currentPage = page;
    const tbody = document.getElementById("data-table-body");
    const fn = FN(), bn = BN();
    if (lotteryData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">暂无${LTN()}数据，请点击"获取最新数据"获取真实开奖记录</td></tr>`;
        document.getElementById("data-pagination").innerHTML = "";
        return;
    }
    // 更新表头
    const thead = document.querySelector("#tab-data thead tr");
    if (thead) thead.innerHTML = `<th>期号</th><th>开奖日期</th><th>${fn}号码</th><th>${bn}号码</th><th>${fn}和值</th><th>${bn}和值</th>`;
    const reversed = [...lotteryData].reverse();
    const start = (page - 1) * PER_PAGE;
    const items = reversed.slice(start, start + PER_PAGE);
    tbody.innerHTML = items.map(d => `
        <tr>
            <td><strong>${d.issue}</strong></td>
            <td>${d.date}</td>
            <td>${d.front_nums.map(n => `<span class="ball ball-front ball-small">${n}</span>`).join("")}</td>
            <td>${d.back_nums.map(n => `<span class="ball ball-back ball-small">${n}</span>`).join("")}</td>
            <td>${d.front_nums.reduce((a, b) => a + b, 0)}</td>
            <td>${d.back_nums.reduce((a, b) => a + b, 0)}</td>
        </tr>
    `).join("");
    const totalPages = Math.ceil(lotteryData.length / PER_PAGE);
    let pagHtml = "";
    for (let i = 1; i <= totalPages; i++) {
        pagHtml += `<button class="${i === page ? 'active' : ''}" onclick="loadDataList(${i})">${i}</button>`;
    }
    document.getElementById("data-pagination").innerHTML = pagHtml;
}

// ==================== 频率分析 ====================
function loadFrequencyAnalysis() {
    if (lotteryData.length === 0) return;
    const fn = FN(), bn = BN();
    const frontFreq = getFrontFrequency();
    const backFreq = getBackFrequency();
    drawFrontHeatmap(frontFreq, fn);
    drawBackHeatmap(backFreq, bn);
    const missing = getMissingAnalysis();
    drawFrontMissing(missing.front, fn);
    drawBackMissing(missing.back, bn);
    const hotCold = getHotColdAnalysis(10);
    renderHotCold(hotCold, fn, bn);
}

function drawFrontHeatmap(freqData, label) {
    destroyChart("chart-front-heat");
    const labels = Object.keys(freqData);
    const values = Object.values(freqData);
    const max = Math.max(...values);
    const ctx = document.getElementById("chart-front-heat").getContext("2d");
    allCharts["chart-front-heat"] = new Chart(ctx, {
        type: "bar", data: {
            labels, datasets: [{
                label: "出现次数", data: values,
                backgroundColor: values.map(v => `rgba(${Math.floor(255*v/max)},${Math.floor(100-30*v/max)},${Math.floor(255-128*v/max)},0.8)`),
                borderRadius: 6
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: "y", plugins: { legend: { display: false }, title: { display: true, text: `${label}号码热力图`, font: { size: 14 } } },
            scales: { x: { beginAtZero: true } } }
    });
}

function drawBackHeatmap(freqData, label) {
    destroyChart("chart-back-heat");
    const labels = Object.keys(freqData);
    const values = Object.values(freqData);
    const max = Math.max(...values);
    const ctx = document.getElementById("chart-back-heat").getContext("2d");
    allCharts["chart-back-heat"] = new Chart(ctx, {
        type: "bar", data: {
            labels, datasets: [{
                label: "出现次数", data: values,
                backgroundColor: values.map(v => `rgba(52,${Math.floor(100+60*v/max)},${Math.floor(255*v/max)},0.8)`),
                borderRadius: 6
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: "y", plugins: { legend: { display: false }, title: { display: true, text: `${label}号码热力图`, font: { size: 14 } } },
            scales: { x: { beginAtZero: true } } }
    });
}

function drawFrontMissing(missingData, label) {
    destroyChart("chart-front-missing");
    const labels = missingData.map(d => d.number);
    const values = missingData.map(d => d.missing);
    const ctx = document.getElementById("chart-front-missing").getContext("2d");
    allCharts["chart-front-missing"] = new Chart(ctx, {
        type: "bar", data: { labels, datasets: [{ label: "遗漏期数", data: values, backgroundColor: "rgba(231,76,60,0.7)", borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: `遗漏分析 - ${label}`, font: { size: 14 } } }, scales: { y: { beginAtZero: true } } }
    });
}

function drawBackMissing(missingData, label) {
    destroyChart("chart-back-missing");
    const labels = missingData.map(d => d.number);
    const values = missingData.map(d => d.missing);
    const ctx = document.getElementById("chart-back-missing").getContext("2d");
    allCharts["chart-back-missing"] = new Chart(ctx, {
        type: "bar", data: { labels, datasets: [{ label: "遗漏期数", data: values, backgroundColor: "rgba(52,152,219,0.7)", borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: `遗漏分析 - ${label}`, font: { size: 14 } } }, scales: { y: { beginAtZero: true } } }
    });
}

function renderHotCold(data, fn, bn) {
    const frontHot = data.front.hot.map(d => `<span class="ball ball-front ball-small">${d.number}</span>(${d.count})`).join(" ");
    const frontCold = data.front.cold.map(d => `<span class="ball ball-front ball-small">${d.number}</span>(${d.count})`).join(" ");
    const backHot = data.back.hot.map(d => `<span class="ball ball-back ball-small">${d.number}</span>(${d.count})`).join(" ");
    const backCold = data.back.cold.map(d => `<span class="ball ball-back ball-small">${d.number}</span>(${d.count})`).join(" ");
    document.getElementById("hot-cold-card").innerHTML = `
        <div class="card-title">🔥❄️ 冷热号分析</div>
        <div><h4 style="color:#e74c3c;margin-bottom:4px;">🔥 ${fn}热号</h4><p style="font-size:13px;">${frontHot}</p></div>
        <div style="margin-top:8px;"><h4 style="color:#3498db;margin-bottom:4px;">❄️ ${fn}冷号</h4><p style="font-size:13px;">${frontCold}</p></div>
        <div style="margin-top:8px;"><h4 style="color:#e74c3c;margin-bottom:4px;">🔥 ${bn}热号</h4><p style="font-size:13px;">${backHot}</p></div>
        <div style="margin-top:8px;"><h4 style="color:#3498db;margin-bottom:4px;">❄️ ${bn}冷号</h4><p style="font-size:13px;">${backCold}</p></div>
    `;
}

// ==================== 统计分析 ====================
function loadStatistics() {
    if (lotteryData.length === 0) return;
    const fn = FN(), bn = BN();
    const oddEven = analyzeOddEven();
    drawRatioChart("chart-odd-even-front", oddEven.front, `${fn}奇偶比`);
    drawRatioChart("chart-odd-even-back", oddEven.back, `${bn}奇偶比`);
    const bigSmall = analyzeBigSmall();
    drawRatioChart("chart-big-small-front", bigSmall.front, `${fn}大小比`);
    drawRatioChart("chart-big-small-back", bigSmall.back, `${bn}大小比`);
    const zone = analyzeZone();
    drawZoneChart(zone);
    const consecutive = analyzeConsecutive();
    document.getElementById("consecutive-card").innerHTML = `
        <div class="card-title">🔗 连号分析</div>
        <div class="stat-grid">
            <div class="stat-card"><div class="label">含连号期数</div><div class="value">${consecutive.consecutive_issues}</div></div>
            <div class="stat-card"><div class="label">总期数</div><div class="value">${consecutive.total_issues}</div></div>
            <div class="stat-card"><div class="label">连号比例</div><div class="value">${consecutive.ratio}%</div></div>
        </div>
    `;
}

function drawRatioChart(id, data, title) {
    destroyChart(id);
    const labels = data.map(d => d.ratio);
    const values = data.map(d => d.count);
    const colors = ["rgba(231,76,60,0.8)","rgba(52,152,219,0.8)","rgba(46,204,113,0.8)","rgba(243,156,18,0.8)","rgba(155,89,182,0.8)","rgba(26,188,156,0.8)"];
    const ctx = document.getElementById(id).getContext("2d");
    allCharts[id] = new Chart(ctx, {
        type: "doughnut", data: { labels, datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length), borderWidth: 2, borderColor: "#fff" }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" }, title: { display: true, text: title, font: { size: 14 } } } }
    });
}

function drawZoneChart(zoneData) {
    destroyChart("chart-zone");
    const labels = [zoneData.zone1.label || "一区", zoneData.zone2.label || "二区", zoneData.zone3.label || "三区"];
    const ctx = document.getElementById("chart-zone").getContext("2d");
    allCharts["chart-zone"] = new Chart(ctx, {
        type: "pie", data: {
            labels,
            datasets: [{ data: [zoneData.zone1.count, zoneData.zone2.count, zoneData.zone3.count],
                backgroundColor: ["rgba(231,76,60,0.8)","rgba(52,152,219,0.8)","rgba(46,204,113,0.8)"], borderWidth: 2, borderColor: "#fff" }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" }, title: { display: true, text: "区间分布", font: { size: 14 } } } }
    });
}

// ==================== 趋势预测 ====================
function runPrediction() {
    if (lotteryData.length < 10) {
        showToast("数据不足，至少需要10期数据", "error");
        return;
    }
    const container = document.getElementById("prediction-results");
    container.innerHTML = '<div style="text-align:center;padding:30px;"><span class="loading"></span> 计算中...</div>';
    setTimeout(() => {
        const data = predictComprehensive();
        const renderResult = (result, title) => `
            <div class="prediction-result">
                ${title ? `<div class="method-name">${title}</div>` : ""}
                <div class="balls-row">
                    ${result.front_pred.map(n => `<span class="ball ball-front">${n}</span>`).join("")}
                    <span style="margin:0 6px;font-weight:bold;">+</span>
                    ${result.back_pred.map(n => `<span class="ball ball-back">${n}</span>`).join("")}
                </div>
                ${result.confidence ? `<div class="confidence">⚠️ ${result.confidence} - 彩票有风险，请理性购彩</div>` : ""}
            </div>
        `;
        container.innerHTML = `
            <div style="margin-top:10px;"><h3 style="margin-bottom:8px;">🎯 综合推荐（多算法共识）</h3>${renderResult(data.comprehensive, "综合推荐")}</div>
            <div style="margin-top:16px;"><h4 style="margin-bottom:6px;">${data.weighted_random.method}</h4>${renderResult(data.weighted_random, "")}</div>
            <div style="margin-top:12px;"><h4 style="margin-bottom:6px;">${data.markov_chain.method}</h4>${renderResult(data.markov_chain, "")}</div>
            <div style="margin-top:12px;"><h4 style="margin-bottom:6px;">${data.moving_average.method}</h4>${renderResult(data.moving_average, "")}</div>
            <div style="margin-top:16px;padding:12px;background:#fff3cd;border-radius:8px;font-size:11px;color:#856404;">
                ⚠️ <strong>免责声明：</strong>所有预测结果仅供参考，彩票开奖为随机事件，无法保证预测准确。请理性购彩，量力而行，切勿沉迷。
            </div>
        `;
    }, 300);
}

// ==================== 数据导出 ====================
function exportDataJSON() {
    if (lotteryData.length === 0) { showToast("没有数据可导出", "error"); return; }
    const json = JSON.stringify(lotteryData, null, 2);
    downloadFile(`${LTN()}数据.json`, json, "application/json");
    showToast("导出成功");
}

function exportReport() {
    if (lotteryData.length === 0) { showToast("没有数据可导出", "error"); return; }
    const report = {
        lottery_type: currentLotteryType,
        summary: getSummary(),
        hot_cold: getHotColdAnalysis(),
        missing: getMissingAnalysis(),
        odd_even: analyzeOddEven(),
        big_small: analyzeBigSmall(),
        zone: analyzeZone(),
        consecutive: analyzeConsecutive(),
        prediction: predictComprehensive()
    };
    const json = JSON.stringify(report, null, 2);
    downloadFile(`${LTN()}分析报告.json`, json, "application/json");
    showToast("报告导出成功");
}

function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ==================== 弹窗关闭 ====================
document.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-overlay")) e.target.classList.remove("show");
});

// ==================== 扫描验奖 ====================

/**
 * 启动扫描（通过 Android 原生桥接）
 */
function startScan() {
    if (typeof ScannerBridge !== "undefined" && ScannerBridge.startScanner) {
        ScannerBridge.startScanner(currentLotteryType);
    } else {
        // 非 Android 环境（浏览器调试），模拟扫描
        showToast("扫描功能仅在 Android App 中可用", "error");
        // 调试模式：显示手动输入
        showManualInput();
    }
}

/**
 * 扫描结果回调（由 Android 原生调用）
 * @param {Object} result - { front_nums: [], back_nums: [], lottery_type: "dlt"|"ssq" }
 */
function onScannerResult(result) {
    if (!result || !result.front_nums || !result.back_nums) {
        showToast("扫描结果无效", "error");
        return;
    }

    const frontNums = result.front_nums;
    const backNums = result.back_nums;
    const lotteryType = result.lottery_type || currentLotteryType;

    // 确保切换到正确的彩种
    if (lotteryType !== currentLotteryType) {
        switchLotteryType(lotteryType);
    }

    // 切换到扫描验奖页签
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    const scannerBtn = document.querySelector('.tab-btn[data-tab="scanner"]');
    if (scannerBtn) scannerBtn.classList.add("active");
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    const scannerPanel = document.getElementById("tab-scanner");
    if (scannerPanel) scannerPanel.classList.add("active");

    // 检查数据是否存在
    if (lotteryData.length === 0) {
        showScanResult(frontNums, backNums, null, "暂无开奖数据，请先获取最新开奖号码");
        return;
    }

    // 获取最新一期开奖数据
    const latestDraw = lotteryData[lotteryData.length - 1];
    checkPrize(frontNums, backNums, latestDraw, lotteryType);
}

/**
 * 比对中奖
 */
function checkPrize(userFront, userBack, drawData, lotteryType) {
    const config = LOTTERY_CONFIGS[lotteryType];
    const drawFront = drawData.front_nums;
    const drawBack = drawData.back_nums;

    // 计算命中数
    const frontHit = userFront.filter(n => drawFront.includes(n)).length;
    const backHit = userBack.filter(n => drawBack.includes(n)).length;

    let prizeResult;
    if (lotteryType === "ssq") {
        prizeResult = checkSSQPrize(frontHit, backHit);
    } else {
        prizeResult = checkDLTPrize(frontHit, backHit);
    }

    showScanResult(userFront, userBack, {
        issue: drawData.issue,
        date: drawData.date,
        drawFront: drawFront,
        drawBack: drawBack,
        frontHit: frontHit,
        backHit: backHit,
        prizeLevel: prizeResult.level,
        prizeName: prizeResult.name,
        prizeAmount: prizeResult.amount,
        lotteryType: lotteryType
    }, null);
}

/**
 * 双色球中奖规则
 * 一等奖: 6+1
 * 二等奖: 6+0
 * 三等奖: 5+1
 * 四等奖: 5+0 或 4+1
 * 五等奖: 4+0 或 3+1
 * 六等奖: 2+1 或 1+1 或 0+1
 */
function checkSSQPrize(frontHit, backHit) {
    if (frontHit === 6 && backHit === 1) return { level: 1, name: "一等奖", amount: "浮动奖金（最高1000万）" };
    if (frontHit === 6 && backHit === 0) return { level: 2, name: "二等奖", amount: "浮动奖金" };
    if (frontHit === 5 && backHit === 1) return { level: 3, name: "三等奖", amount: "3000元" };
    if ((frontHit === 5 && backHit === 0) || (frontHit === 4 && backHit === 1))
        return { level: 4, name: "四等奖", amount: "200元" };
    if ((frontHit === 4 && backHit === 0) || (frontHit === 3 && backHit === 1))
        return { level: 5, name: "五等奖", amount: "10元" };
    if (backHit === 1 && frontHit >= 0 && frontHit <= 2)
        return { level: 6, name: "六等奖", amount: "5元" };
    return { level: 0, name: "未中奖", amount: "0元" };
}

/**
 * 大乐透中奖规则
 * 一等奖: 5+2
 * 二等奖: 5+1
 * 三等奖: 5+0
 * 四等奖: 4+2
 * 五等奖: 4+1
 * 六等奖: 3+2
 * 七等奖: 4+0
 * 八等奖: 3+1 或 2+2
 * 九等奖: 3+0 或 1+2 或 2+1 或 0+2
 */
function checkDLTPrize(frontHit, backHit) {
    if (frontHit === 5 && backHit === 2) return { level: 1, name: "一等奖", amount: "浮动奖金（最高1800万）" };
    if (frontHit === 5 && backHit === 1) return { level: 2, name: "二等奖", amount: "浮动奖金" };
    if (frontHit === 5 && backHit === 0) return { level: 3, name: "三等奖", amount: "10000元" };
    if (frontHit === 4 && backHit === 2) return { level: 4, name: "四等奖", amount: "3000元" };
    if (frontHit === 4 && backHit === 1) return { level: 5, name: "五等奖", amount: "300元" };
    if (frontHit === 3 && backHit === 2) return { level: 6, name: "六等奖", amount: "200元" };
    if (frontHit === 4 && backHit === 0) return { level: 7, name: "七等奖", amount: "100元" };
    if ((frontHit === 3 && backHit === 1) || (frontHit === 2 && backHit === 2))
        return { level: 8, name: "八等奖", amount: "15元" };
    if ((frontHit === 3 && backHit === 0) || (frontHit === 1 && backHit === 2) ||
        (frontHit === 2 && backHit === 1) || (frontHit === 0 && backHit === 2))
        return { level: 9, name: "九等奖", amount: "5元" };
    return { level: 0, name: "未中奖", amount: "0元" };
}

/**
 * 显示扫描结果
 */
function showScanResult(userFront, userBack, prizeInfo, errorMsg) {
    const container = document.getElementById("scanner-result");
    if (!container) return;

    if (errorMsg) {
        container.innerHTML = `<div class="prize-result no-prize">
            <div class="scan-numbers">
                <span class="scan-label">扫描号码：</span>
                ${renderScanBalls(userFront, userBack)}
            </div>
            <div class="error-msg">${errorMsg}</div>
        </div>`;
        return;
    }

    const config = LOTTERY_CONFIGS[prizeInfo.lotteryType];
    const isWin = prizeInfo.prizeLevel > 0;
    const prizeClass = isWin ? `prize-level-${prizeInfo.prizeLevel}` : "no-prize";

    container.innerHTML = `
        <div class="prize-result ${prizeClass}">
            <div class="scan-numbers">
                <span class="scan-label">您的号码：</span>
                ${renderScanBalls(userFront, userBack)}
            </div>
            <div class="draw-numbers">
                <span class="scan-label">开奖号码（${prizeInfo.issue}期 ${prizeInfo.date}）：</span>
                ${renderScanBalls(prizeInfo.drawFront, prizeInfo.drawBack)}
            </div>
            <div class="hit-info">
                <span class="scan-label">命中：</span>
                <span style="color:${isWin ? '#e74c3c' : '#666'}">
                    ${config.front_name} ${prizeInfo.frontHit} 个，${config.back_name} ${prizeInfo.backHit} 个
                </span>
            </div>
            <div class="prize-badge ${isWin ? 'win' : 'lose'}">
                ${isWin ? '🎉 ' + prizeInfo.prizeName : '😔 ' + prizeInfo.prizeName}
            </div>
            ${isWin ? `<div class="prize-amount">💰 ${prizeInfo.prizeAmount}</div>` : ""}
            <button class="btn btn-outline" onclick="startScan()" style="margin-top:12px;">📷 再次扫描</button>
        </div>`;
}

/**
 * 渲染扫描号码球
 */
function renderScanBalls(front, back) {
    const frontClass = currentLotteryType === "ssq" ? "ball-front" : "ball-front";
    const backClass = currentLotteryType === "ssq" ? "ball-back" : "ball-back";
    const frontBalls = front.map(n => `<span class="ball ${frontClass}">${String(n).padStart(2, '0')}</span>`).join("");
    const backBalls = back.map(n => `<span class="ball ${backClass}">${String(n).padStart(2, '0')}</span>`).join("");
    return `${frontBalls} <span class="ball-separator">+</span> ${backBalls}`;
}

/**
 * 手动输入模式（调试/回退用）
 */
function showManualInput() {
    const container = document.getElementById("scanner-result");
    if (!container) return;

    const config = LOTTERY_CONFIGS[currentLotteryType];
    container.innerHTML = `
        <div class="manual-input" style="margin-top:16px;padding:16px;background:#f8f9fa;border-radius:8px;">
            <p style="font-size:13px;color:#666;margin-bottom:8px;">手动输入模式（请逐行输入号码，每行一个，用空格或逗号分隔）</p>
            <textarea id="manual-numbers" rows="3" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;font-size:16px;text-align:center;"
                placeholder="例如：${config.front_name}号码在前，${config.back_name}号码在后&#10;01 02 03 04 05 + 06 07"></textarea>
            <div style="margin-top:8px;display:flex;gap:8px;">
                <button class="btn btn-primary" onclick="processManualInput()" style="flex:1;">确认比对</button>
                <button class="btn btn-outline" onclick="startScan()" style="flex:1;">重试扫描</button>
            </div>
        </div>`;
}

/**
 * 处理手动输入
 */
function processManualInput() {
    const textarea = document.getElementById("manual-numbers");
    if (!textarea) return;

    const rawText = textarea.value.trim();
    if (!rawText) {
        showToast("请输入号码", "error");
        return;
    }

    // 使用 ScannerActivity 中的解析逻辑（JS 版本）
    const parsed = parseNumbersFromText(rawText, currentLotteryType);
    if (!parsed) {
        showToast("无法识别号码格式，请检查输入", "error");
        return;
    }

    if (lotteryData.length === 0) {
        showScanResult(parsed.front, parsed.back, null, "暂无开奖数据，请先获取最新开奖号码");
        return;
    }

    const latestDraw = lotteryData[lotteryData.length - 1];
    checkPrize(parsed.front, parsed.back, latestDraw, currentLotteryType);
}

/**
 * JS 版号码解析（与 ScannerActivity.parseLotteryNumbers 逻辑一致）
 */
function parseNumbersFromText(text, lotteryType) {
    const cleaned = text.replace(/[Oo]/g, "0").replace(/[lI|]/g, "1")
        .replace(/[Zz]/g, "2").replace(/[BS]/g, "8").replace(/[b]/g, "6")
        .replace(/[gq]/g, "9").replace(/[T]/g, "7")
        .replace(/\s+/g, " ").replace(/[；;：:。，,\-—]/g, " ")
        .trim();

    const frontCount = lotteryType === "ssq" ? 6 : 5;
    const backCount = lotteryType === "ssq" ? 1 : 2;
    const frontMax = lotteryType === "ssq" ? 33 : 35;
    const backMax = lotteryType === "ssq" ? 16 : 12;

    let allNumbers = [];
    const m2 = cleaned.match(/\b\d{2}\b/g);
    if (m2 && m2.length >= frontCount + backCount) {
        allNumbers = m2;
    } else {
        const m1 = cleaned.match(/\b\d{1,2}\b/g);
        if (m1) {
            allNumbers = m1.map(n => n.length === 1 ? "0" + n : n);
        }
    }

    if (allNumbers.length < frontCount + backCount) return null;

    // 寻找分隔符
    let splitIndex = frontCount;
    const full = allNumbers.join(" ");
    const splitMatch = full.match(/\d{2}\s+[+|｜]\s+\d{2}/);
    if (splitMatch) {
        const before = full.substring(0, splitMatch.index + 2);
        splitIndex = before.split(/\s+/).length;
    }

    const front = [];
    const back = [];
    const frontSet = new Set();
    const backSet = new Set();

    for (let i = 0; i < allNumbers.length; i++) {
        const num = parseInt(allNumbers[i]);
        if (isNaN(num)) continue;
        if (i < splitIndex) {
            if (num >= 1 && num <= frontMax && !frontSet.has(num)) {
                front.push(num);
                frontSet.add(num);
            }
        } else {
            if (num >= 1 && num <= backMax && !backSet.has(num)) {
                back.push(num);
                backSet.add(num);
            }
        }
    }

    // 如果数量不对，重新分配
    if (front.length !== frontCount || back.length !== backCount) {
        front.length = 0;
        back.length = 0;
        frontSet.clear();
        backSet.clear();
        for (const ns of allNumbers) {
            const num = parseInt(ns);
            if (isNaN(num)) continue;
            if (num >= 1 && num <= frontMax && front.length < frontCount && !frontSet.has(num)) {
                front.push(num);
                frontSet.add(num);
            } else if (num >= 1 && num <= backMax && back.length < backCount && !backSet.has(num)) {
                back.push(num);
                backSet.add(num);
            }
        }
    }

    front.sort((a, b) => a - b);
    back.sort((a, b) => a - b);

    if (front.length === frontCount && back.length === backCount) {
        return { front, back };
    }
    return null;
}