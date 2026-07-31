"""
趋势预测算法模块
支持大乐透和双色球，基于历史数据的多种预测模型
"""
import random
from typing import List, Dict, Tuple
from collections import Counter
from .data_loader import DataLoader, LotteryData


class TrendPredictor:
    """趋势预测器，提供多种预测算法"""

    def __init__(self, loader: DataLoader):
        self.loader = loader

    # ==================== 基于统计分析的确定性预测（无随机） ====================

    def predict_by_statistics(self, lookback: int = 50, freq_weight: float = 0.55) -> Dict:
        """
        基于统计分析的多维度预测算法
        - 热号分析：统计所选期内各号码的出现频率，优先推荐高频号
        - 冷号分析：统计所选期内长期未出的号码
        - 连号/重号趋势：分析所选期内连号的出现规律
        - 奇偶/大小分布：参考所选期内的奇偶比、大小比分布
        - 双色球和大乐透各自独立计算
        - freq_weight: 频率权重(0.3~0.7)，不同权重产生不同预测结果
        """
        data = self.loader.get_recent(lookback)
        if len(data) < 10:
            return self._fallback_prediction()

        fc = self.loader.FRONT_COUNT
        bc = self.loader.BACK_COUNT
        fm = self.loader.FRONT_MID
        bm = self.loader.BACK_MID
        fn = self.loader.FRONT_NAME
        bn = self.loader.BACK_NAME
        front_range = list(self.loader.FRONT_RANGE)
        back_range = list(self.loader.BACK_RANGE)

        # 1. 频率统计
        front_freq = {n: 0 for n in front_range}
        back_freq = {n: 0 for n in back_range}
        for d in data:
            for n in d.front_nums:
                front_freq[n] += 1
            for n in d.back_nums:
                back_freq[n] += 1

        # 2. 遗漏统计
        front_missing = {}
        for n in front_range:
            missing = 0
            for i in range(len(data) - 1, -1, -1):
                if n in data[i].front_nums:
                    break
                missing += 1
            front_missing[n] = missing

        back_missing = {}
        for n in back_range:
            missing = 0
            for i in range(len(data) - 1, -1, -1):
                if n in data[i].back_nums:
                    break
                missing += 1
            back_missing[n] = missing

        # 3. 连号趋势
        consecutive_count = 0
        for d in data:
            sorted_front = sorted(d.front_nums)
            for i in range(len(sorted_front) - 1):
                if sorted_front[i + 1] - sorted_front[i] == 1:
                    consecutive_count += 1
                    break
        consecutive_rate = consecutive_count / len(data) if data else 0

        # 4. 奇偶比分布
        odd_even_counts = {}
        for d in data:
            odd = sum(1 for n in d.front_nums if n % 2 == 1)
            key = f"{odd}:{fc - odd}"
            odd_even_counts[key] = odd_even_counts.get(key, 0) + 1
        sorted_oe = sorted(odd_even_counts.items(), key=lambda x: x[1], reverse=True)
        best_odd_even = sorted_oe[0][0] if sorted_oe else "0:0"
        target_odd = int(best_odd_even.split(":")[0])

        back_odd_even_counts = {}
        for d in data:
            odd = sum(1 for n in d.back_nums if n % 2 == 1)
            key = f"{odd}:{bc - odd}"
            back_odd_even_counts[key] = back_odd_even_counts.get(key, 0) + 1
        sorted_boe = sorted(back_odd_even_counts.items(), key=lambda x: x[1], reverse=True)
        best_back_odd_even = sorted_boe[0][0] if sorted_boe else "0:0"
        target_back_odd = int(best_back_odd_even.split(":")[0])

        # 5. 大小比分布
        big_small_counts = {}
        for d in data:
            big = sum(1 for n in d.front_nums if n >= fm)
            key = f"{big}:{fc - big}"
            big_small_counts[key] = big_small_counts.get(key, 0) + 1
        sorted_bs = sorted(big_small_counts.items(), key=lambda x: x[1], reverse=True)
        best_big_small = sorted_bs[0][0] if sorted_bs else "0:0"
        target_big = int(best_big_small.split(":")[0])

        back_big_small_counts = {}
        for d in data:
            big = sum(1 for n in d.back_nums if n >= bm)
            key = f"{big}:{bc - big}"
            back_big_small_counts[key] = back_big_small_counts.get(key, 0) + 1
        sorted_bbs = sorted(back_big_small_counts.items(), key=lambda x: x[1], reverse=True)
        best_back_big_small = sorted_bbs[0][0] if sorted_bbs else "0:0"
        target_back_big = int(best_back_big_small.split(":")[0])

        # 6. 综合评分 (频率权重 + 遗漏权重)
        max_front_freq = max(front_freq.values()) or 1
        max_front_missing = max(front_missing.values()) or 1
        missing_weight = 1.0 - freq_weight

        front_scores = []
        for n in front_range:
            score = (front_freq[n] / max_front_freq) * freq_weight + (front_missing[n] / max_front_missing) * missing_weight
            front_scores.append({
                "number": n,
                "freq": front_freq[n],
                "missing": front_missing[n],
                "is_odd": n % 2 == 1,
                "is_big": n >= fm,
                "score": score
            })
        front_scores.sort(key=lambda x: x["score"], reverse=True)

        max_back_freq = max(back_freq.values()) or 1
        max_back_missing = max(back_missing.values()) or 1

        back_scores = []
        for n in back_range:
            score = (back_freq[n] / max_back_freq) * freq_weight + (back_missing[n] / max_back_missing) * missing_weight
            back_scores.append({
                "number": n,
                "freq": back_freq[n],
                "missing": back_missing[n],
                "is_odd": n % 2 == 1,
                "is_big": n >= bm,
                "score": score
            })
        back_scores.sort(key=lambda x: x["score"], reverse=True)

        # 7. 选择前区号码（兼顾奇偶比和大小比）
        selected_front = []
        selected_front_set = set()
        selected_odd = 0
        selected_big = 0

        for c in front_scores:
            if len(selected_front) >= fc:
                break
            if c["number"] in selected_front_set:
                continue
            would_odd = selected_odd + (1 if c["is_odd"] else 0)
            would_big = selected_big + (1 if c["is_big"] else 0)
            remaining = fc - len(selected_front)
            max_odd = target_odd + max(1, (remaining + 1) // 2)
            max_big = target_big + max(1, (remaining + 1) // 2)
            if would_odd > max_odd or would_big > max_big:
                continue
            selected_front.append(c["number"])
            selected_front_set.add(c["number"])
            selected_odd = would_odd
            selected_big = would_big

        # 如果还不够，放宽限制补齐
        for c in front_scores:
            if len(selected_front) >= fc:
                break
            if c["number"] not in selected_front_set:
                selected_front.append(c["number"])
                selected_front_set.add(c["number"])

        selected_front.sort()

        # 8. 选择后区号码
        selected_back = []
        selected_back_set = set()
        selected_back_odd = 0
        selected_back_big = 0

        for c in back_scores:
            if len(selected_back) >= bc:
                break
            if c["number"] in selected_back_set:
                continue
            would_odd = selected_back_odd + (1 if c["is_odd"] else 0)
            would_big = selected_back_big + (1 if c["is_big"] else 0)
            remaining = bc - len(selected_back)
            max_odd = target_back_odd + max(1, (remaining + 1) // 2)
            max_big = target_back_big + max(1, (remaining + 1) // 2)
            if would_odd > max_odd or would_big > max_big:
                continue
            selected_back.append(c["number"])
            selected_back_set.add(c["number"])
            selected_back_odd = would_odd
            selected_back_big = would_big

        for c in back_scores:
            if len(selected_back) >= bc:
                break
            if c["number"] not in selected_back_set:
                selected_back.append(c["number"])
                selected_back_set.add(c["number"])

        selected_back.sort()

        # 9. 生成推荐理由
        reasons = self._build_reasons(
            selected_front, selected_back,
            front_freq, back_freq, front_missing, back_missing,
            lookback, best_odd_even, best_big_small, best_back_odd_even, best_back_big_small,
            consecutive_rate, odd_even_counts, big_small_counts, len(data)
        )

        # 10. 热门号/冷门号列表
        top_hot_front = [c["number"] for c in front_scores if c["freq"] > 0][:fc + 3]
        top_cold_front = sorted(front_scores, key=lambda x: x["missing"], reverse=True)[:fc + 3]
        top_cold_front = [c["number"] for c in top_cold_front]
        top_hot_back = [c["number"] for c in back_scores if c["freq"] > 0][:bc + 3]
        top_cold_back = sorted(back_scores, key=lambda x: x["missing"], reverse=True)[:bc + 3]
        top_cold_back = [c["number"] for c in top_cold_back]

        return {
            "method": f"基于近{lookback}期数据的统计分析推荐",
            "front_pred": selected_front,
            "back_pred": selected_back,
            "reasons": reasons,
            "stats": {
                "lookback": lookback,
                "total_issues": len(data),
                "hot_front": top_hot_front,
                "cold_front": top_cold_front,
                "hot_back": top_hot_back,
                "cold_back": top_cold_back,
                "odd_even_front": best_odd_even,
                "big_small_front": best_big_small,
                "odd_even_back": best_back_odd_even,
                "big_small_back": best_back_big_small,
                "consecutive_rate": consecutive_rate,
            },
            "lottery_type": self.loader.lottery_type,
            "front_name": fn,
            "back_name": bn,
        }

    def _build_reasons(self, front, back, front_freq, back_freq, front_missing, back_missing,
                       lookback, best_oe, best_bs, best_boe, best_bbs,
                       consecutive_rate, oe_counts, bs_counts, total_issues):
        """生成推荐理由"""
        fn = self.loader.FRONT_NAME
        bn = self.loader.BACK_NAME
        reasons = []

        # 前区理由
        front_reasons = []
        for n in front:
            freq = front_freq.get(n, 0)
            missing = front_missing.get(n, 0)
            if freq >= 2:
                front_reasons.append(f"{fn}{n:02d}(热号，近{lookback}期出现{freq}次)")
            elif missing >= lookback * 0.3:
                front_reasons.append(f"{fn}{n:02d}(冷号回补，已遗漏{missing}期)")
            else:
                front_reasons.append(f"{fn}{n:02d}(出现{freq}次，遗漏{missing}期)")
        reasons.append("；".join(front_reasons))

        # 后区理由
        back_reasons = []
        for n in back:
            freq = back_freq.get(n, 0)
            missing = back_missing.get(n, 0)
            if freq >= 2:
                back_reasons.append(f"{bn}{n:02d}(热号，近{lookback}期出现{freq}次)")
            elif missing >= lookback * 0.3:
                back_reasons.append(f"{bn}{n:02d}(冷号回补，已遗漏{missing}期)")
            else:
                back_reasons.append(f"{bn}{n:02d}(出现{freq}次，遗漏{missing}期)")
        reasons.append("；".join(back_reasons))

        # 连号趋势
        if consecutive_rate >= 0.4:
            reasons.append(f"近{lookback}期连号率{consecutive_rate * 100:.0f}%，建议关注连号组合")

        # 奇偶比参考
        oe_count = oe_counts.get(best_oe, 0)
        reasons.append(f"参考{fn}奇偶比 {best_oe}（近{lookback}期出现{oe_count}次，占比{oe_count / total_issues * 100:.0f}%）")

        # 大小比参考
        bs_count = bs_counts.get(best_bs, 0)
        reasons.append(f"参考{fn}大小比 {best_bs}（近{lookback}期出现{bs_count}次，占比{bs_count / total_issues * 100:.0f}%）")

        return reasons

    # ==================== 原有预测方法（保留向后兼容） ====================

    def predict_weighted_random(self, lookback: int = 50) -> Dict:
        """
        加权随机预测法
        根据近期出现频率加权随机选择号码
        """
        data = self.loader.get_recent(lookback)
        front_counter = Counter()
        back_counter = Counter()

        for d in data:
            front_counter.update(d.front_nums)
            back_counter.update(d.back_nums)

        return self._weighted_sample(front_counter, back_counter)

    def predict_markov_chain(self, lookback: int = 30) -> Dict:
        """
        马尔可夫链预测法
        基于号码间转移概率预测下一期号码
        """
        data = self.loader.get_recent(lookback)

        # 构建转移矩阵：某号码出现后，下一期其他号码出现的概率
        front_transitions = {}
        back_transitions = {}

        for i in range(len(data) - 1):
            current = data[i]
            next_draw = data[i + 1]

            for n in current.front_nums:
                if n not in front_transitions:
                    front_transitions[n] = Counter()
                front_transitions[n].update(next_draw.front_nums)

            for n in current.back_nums:
                if n not in back_transitions:
                    back_transitions[n] = Counter()
                back_transitions[n].update(next_draw.back_nums)

        # 基于最近一期进行预测
        last = data[-1] if data else None
        if last is None:
            return self._fallback_prediction()

        front_candidates = Counter()
        back_candidates = Counter()

        for n in last.front_nums:
            if n in front_transitions:
                for candidate, weight in front_transitions[n].items():
                    front_candidates[candidate] += weight

        for n in last.back_nums:
            if n in back_transitions:
                for candidate, weight in back_transitions[n].items():
                    back_candidates[candidate] += weight

        # 如果候选不足，补充随机
        fc = self.loader.FRONT_COUNT
        bc = self.loader.BACK_COUNT
        if len(front_candidates) < fc:
            for n in self.loader.FRONT_RANGE:
                if n not in front_candidates:
                    front_candidates[n] = 1

        if len(back_candidates) < bc:
            for n in self.loader.BACK_RANGE:
                if n not in back_candidates:
                    back_candidates[n] = 1

        return self._weighted_sample(front_candidates, back_candidates, method="马尔可夫链预测")

    def predict_moving_average(self, window: int = 10) -> Dict:
        """
        移动平均趋势预测法
        分析号码出现间隔的移动平均，预测即将出现的号码
        """
        data = self.loader.get_all()
        if len(data) < window:
            return self._fallback_prediction()

        front_intervals = {}
        back_intervals = {}

        for n in self.loader.FRONT_RANGE:
            intervals = []
            last_seen = None
            for i, d in enumerate(data):
                if n in d.front_nums:
                    if last_seen is not None:
                        intervals.append(i - last_seen)
                    last_seen = i
            if intervals:
                front_intervals[n] = sum(intervals[-window:]) / min(len(intervals), window)
            else:
                front_intervals[n] = float("inf")

        for n in self.loader.BACK_RANGE:
            intervals = []
            last_seen = None
            for i, d in enumerate(data):
                if n in d.back_nums:
                    if last_seen is not None:
                        intervals.append(i - last_seen)
                    last_seen = i
            if intervals:
                back_intervals[n] = sum(intervals[-window:]) / min(len(intervals), window)
            else:
                back_intervals[n] = float("inf")

        # 间隔越小越容易出现（预测近期将出现）
        sorted_front = sorted(front_intervals.items(), key=lambda x: x[1], reverse=True)
        sorted_back = sorted(back_intervals.items(), key=lambda x: x[1], reverse=True)

        fc = self.loader.FRONT_COUNT
        bc = self.loader.BACK_COUNT
        top_front = [n for n, _ in sorted_front[:fc * 3]]
        top_back = [n for n, _ in sorted_back[:bc * 3]]

        front_pred = sorted(random.sample(top_front, min(fc, len(top_front))))
        back_pred = sorted(random.sample(top_back, min(bc, len(top_back))))

        return {
            "method": "移动平均趋势预测",
            "front_pred": front_pred,
            "back_pred": back_pred,
            "confidence": "低（仅供参考）"
        }

    def predict_comprehensive(self) -> Dict:
        """综合预测 - 结合多种算法给出推荐"""
        weighted = self.predict_weighted_random()
        markov = self.predict_markov_chain()
        moving_avg = self.predict_moving_average()

        all_front = Counter()
        all_back = Counter()

        for n in weighted["front_pred"]:
            all_front[n] += 1
        for n in markov["front_pred"]:
            all_front[n] += 1
        for n in moving_avg["front_pred"]:
            all_front[n] += 1

        for n in weighted["back_pred"]:
            all_back[n] += 1
        for n in markov["back_pred"]:
            all_back[n] += 1
        for n in moving_avg["back_pred"]:
            all_back[n] += 1

        fc = self.loader.FRONT_COUNT
        bc = self.loader.BACK_COUNT
        top_front = [n for n, _ in all_front.most_common(fc)]
        top_back = [n for n, _ in all_back.most_common(bc)]

        return {
            "weighted_random": weighted,
            "markov_chain": markov,
            "moving_average": moving_avg,
            "comprehensive": {
                "front_pred": sorted(top_front),
                "back_pred": sorted(top_back)
            },
            "lottery_type": self.loader.lottery_type,
            "front_name": self.loader.FRONT_NAME,
            "back_name": self.loader.BACK_NAME,
        }

    def _fallback_prediction(self) -> Dict:
        """预测数据不足时的回退"""
        fc = self.loader.FRONT_COUNT
        bc = self.loader.BACK_COUNT
        front = sorted(random.sample(list(self.loader.FRONT_RANGE), fc))
        back = sorted(random.sample(list(self.loader.BACK_RANGE), bc))
        return {
            "method": "加权随机预测",
            "front_pred": front,
            "back_pred": back,
            "confidence": "低（仅供参考）"
        }

    def _weighted_sample(self, front_counter: Counter, back_counter: Counter, method: str = "加权随机预测") -> Dict:
        """加权随机采样"""
        front_weights = []
        front_nums = []
        for n in self.loader.FRONT_RANGE:
            front_nums.append(n)
            front_weights.append(front_counter.get(n, 0) + 1)

        back_weights = []
        back_nums = []
        for n in self.loader.BACK_RANGE:
            back_nums.append(n)
            back_weights.append(back_counter.get(n, 0) + 1)

        fc = self.loader.FRONT_COUNT
        bc = self.loader.BACK_COUNT
        front_pred = self._weighted_choices(front_nums, front_weights, fc)
        back_pred = self._weighted_choices(back_nums, back_weights, bc)

        return {
            "method": method,
            "front_pred": sorted(front_pred),
            "back_pred": sorted(back_pred),
            "confidence": "低（仅供参考）"
        }

    @staticmethod
    def _weighted_choices(population: List, weights: List, k: int) -> List:
        """加权不放回抽样"""
        result = []
        pop = list(population)
        w = list(weights)
        for _ in range(k):
            if not pop:
                break
            total = sum(w)
            r = random.uniform(0, total)
            cumsum = 0
            for i, weight in enumerate(w):
                cumsum += weight
                if r <= cumsum:
                    result.append(pop[i])
                    pop.pop(i)
                    w.pop(i)
                    break
        return result