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