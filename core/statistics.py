"""
统计分析模块
支持大乐透和双色球，提供高级统计指标：奇偶比、大小比、和值、区间分布、连号分析等
"""
from typing import List, Dict
from .data_loader import DataLoader, LotteryData


class StatisticsAnalyzer:
    """高级统计分析器"""

    def __init__(self, loader: DataLoader):
        self.loader = loader

    @property
    def _front_mid(self):
        return self.loader.FRONT_MID

    @property
    def _back_mid(self):
        return self.loader.BACK_MID

    @property
    def _front_count(self):
        return self.loader.FRONT_COUNT

    @property
    def _back_count(self):
        return self.loader.BACK_COUNT

    def analyze_odd_even(self, data: List[LotteryData] = None) -> Dict:
        """奇偶比分析"""
        if data is None:
            data = self.loader.get_all()

        front_ratios = {}
        back_ratios = {}
        fc = self._front_count
        bc = self._back_count

        for d in data:
            front_odd = sum(1 for n in d.front_nums if n % 2 == 1)
            front_even = fc - front_odd
            key = f"{front_odd}:{front_even}"
            front_ratios[key] = front_ratios.get(key, 0) + 1

            back_odd = sum(1 for n in d.back_nums if n % 2 == 1)
            back_even = bc - back_odd
            key = f"{back_odd}:{back_even}"
            back_ratios[key] = back_ratios.get(key, 0) + 1

        return {
            "front": [{"ratio": k, "count": v} for k, v in
                      sorted(front_ratios.items(), key=lambda x: x[1], reverse=True)],
            "back": [{"ratio": k, "count": v} for k, v in
                     sorted(back_ratios.items(), key=lambda x: x[1], reverse=True)]
        }

    def analyze_big_small(self, data: List[LotteryData] = None) -> Dict:
        """大小比分析"""
        if data is None:
            data = self.loader.get_all()

        front_ratios = {}
        back_ratios = {}
        fm = self._front_mid
        bm = self._back_mid
        fc = self._front_count
        bc = self._back_count

        for d in data:
            front_big = sum(1 for n in d.front_nums if n >= fm)
            front_small = fc - front_big
            key = f"{front_big}:{front_small}"
            front_ratios[key] = front_ratios.get(key, 0) + 1

            back_big = sum(1 for n in d.back_nums if n >= bm)
            back_small = bc - back_big
            key = f"{back_big}:{back_small}"
            back_ratios[key] = back_ratios.get(key, 0) + 1

        return {
            "front": [{"ratio": k, "count": v} for k, v in
                      sorted(front_ratios.items(), key=lambda x: x[1], reverse=True)],
            "back": [{"ratio": k, "count": v} for k, v in
                     sorted(back_ratios.items(), key=lambda x: x[1], reverse=True)]
        }

    def analyze_sum(self, data: List[LotteryData] = None) -> Dict:
        """和值分析"""
        if data is None:
            data = self.loader.get_all()

        front_sums = [sum(d.front_nums) for d in data]
        back_sums = [sum(d.back_nums) for d in data]

        return {
            "front": {
                "min": min(front_sums),
                "max": max(front_sums),
                "avg": round(sum(front_sums) / len(front_sums), 2),
                "all": front_sums[-50:]
            },
            "back": {
                "min": min(back_sums),
                "max": max(back_sums),
                "avg": round(sum(back_sums) / len(back_sums), 2),
                "all": back_sums[-50:]
            }
        }

    def analyze_zone_distribution(self, data: List[LotteryData] = None) -> Dict:
        """区间分布分析"""
        if data is None:
            data = self.loader.get_all()

        boundaries = self.loader.ZONE_BOUNDARIES
        zones = {"zone1": 0, "zone2": 0, "zone3": 0}
        for d in data:
            for n in d.front_nums:
                if n <= boundaries[0]:
                    zones["zone1"] += 1
                elif n <= boundaries[1]:
                    zones["zone2"] += 1
                else:
                    zones["zone3"] += 1

        total = sum(zones.values())
        labels = self.loader.ZONE_LABELS
        return {
            "zone1": {"count": zones["zone1"], "ratio": round(zones["zone1"] / total * 100, 1) if total else 0,
                      "label": labels[0]},
            "zone2": {"count": zones["zone2"], "ratio": round(zones["zone2"] / total * 100, 1) if total else 0,
                      "label": labels[1]},
            "zone3": {"count": zones["zone3"], "ratio": round(zones["zone3"] / total * 100, 1) if total else 0,
                      "label": labels[2]},
        }

    def analyze_consecutive(self, data: List[LotteryData] = None) -> Dict:
        """连号分析"""
        if data is None:
            data = self.loader.get_all()

        consecutive_count = 0
        for d in data:
            nums = sorted(d.front_nums)
            for i in range(len(nums) - 1):
                if nums[i + 1] - nums[i] == 1:
                    consecutive_count += 1
                    break

        ratio = round(consecutive_count / len(data) * 100, 1) if data else 0
        return {
            "consecutive_issues": consecutive_count,
            "total_issues": len(data),
            "ratio": ratio
        }

    def get_dashboard_stats(self) -> Dict:
        """仪表盘综合统计"""
        data = self.loader.get_all()
        return {
            "odd_even": self.analyze_odd_even(data),
            "big_small": self.analyze_big_small(data),
            "sum": self.analyze_sum(data),
            "zone": self.analyze_zone_distribution(data),
            "consecutive": self.analyze_consecutive(data),
            "lottery_type": self.loader.lottery_type,
            "front_name": self.loader.FRONT_NAME,
            "back_name": self.loader.BACK_NAME,
        }