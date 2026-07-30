"""
号码频率分析模块
支持大乐透和双色球，分析号码的出现频率、冷热号、遗漏期数等
"""
from typing import List, Dict, Tuple
from collections import Counter
from .data_loader import DataLoader, LotteryData


class FrequencyAnalyzer:
    """号码频率分析器"""

    def __init__(self, loader: DataLoader):
        self.loader = loader

    def get_front_frequency(self, data: List[LotteryData] = None) -> Dict[int, int]:
        """前区/红球号码出现频次统计"""
        if data is None:
            data = self.loader.get_all()
        counter = Counter()
        for d in data:
            counter.update(d.front_nums)
        return {n: counter.get(n, 0) for n in self.loader.FRONT_RANGE}

    def get_back_frequency(self, data: List[LotteryData] = None) -> Dict[int, int]:
        """后区/蓝球号码出现频次统计"""
        if data is None:
            data = self.loader.get_all()
        counter = Counter()
        for d in data:
            counter.update(d.back_nums)
        return {n: counter.get(n, 0) for n in self.loader.BACK_RANGE}

    def get_hot_cold_analysis(self, top_n: int = 10) -> Dict:
        """冷热号分析"""
        front_freq = self.get_front_frequency()
        back_freq = self.get_back_frequency()

        sorted_front = sorted(front_freq.items(), key=lambda x: x[1], reverse=True)
        sorted_back = sorted(back_freq.items(), key=lambda x: x[1], reverse=True)

        return {
            "front": {
                "hot": [{"number": n, "count": c} for n, c in sorted_front[:top_n]],
                "cold": [{"number": n, "count": c} for n, c in sorted_front[-top_n:]]
            },
            "back": {
                "hot": [{"number": n, "count": c} for n, c in sorted_back[:top_n]],
                "cold": [{"number": n, "count": c} for n, c in sorted_back[-top_n:]]
            }
        }

    def get_missing_analysis(self) -> Dict:
        """遗漏分析 - 各号码已连续未出现的期数"""
        data = self.loader.get_all()
        front_missing = {}
        back_missing = {}

        for n in self.loader.FRONT_RANGE:
            missing = 0
            for d in reversed(data):
                if n in d.front_nums:
                    break
                missing += 1
            front_missing[n] = missing

        for n in self.loader.BACK_RANGE:
            missing = 0
            for d in reversed(data):
                if n in d.back_nums:
                    break
                missing += 1
            back_missing[n] = missing

        return {
            "front": [{"number": n, "missing": c} for n, c in
                      sorted(front_missing.items(), key=lambda x: x[1], reverse=True)],
            "back": [{"number": n, "missing": c} for n, c in
                     sorted(back_missing.items(), key=lambda x: x[1], reverse=True)]
        }

    def get_summary(self) -> Dict:
        """综合频率分析摘要"""
        data = self.loader.get_all()
        total_issues = len(data)

        front_freq = self.get_front_frequency(data)
        back_freq = self.get_back_frequency(data)

        front_range_len = len(list(self.loader.FRONT_RANGE))
        back_range_len = len(list(self.loader.BACK_RANGE))

        return {
            "total_issues": total_issues,
            "date_range": {
                "start": data[0].date if data else "",
                "end": data[-1].date if data else ""
            },
            "front_avg": round(sum(front_freq.values()) / front_range_len, 2),
            "back_avg": round(sum(back_freq.values()) / back_range_len, 2),
            "front_most": max(front_freq, key=front_freq.get),
            "front_most_count": front_freq[max(front_freq, key=front_freq.get)],
            "back_most": max(back_freq, key=back_freq.get),
            "back_most_count": back_freq[max(back_freq, key=back_freq.get)],
            "lottery_type": self.loader.lottery_type,
            "front_name": self.loader.FRONT_NAME,
            "back_name": self.loader.BACK_NAME,
        }