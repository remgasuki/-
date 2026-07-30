"""
大乐透 / 双色球 数据加载与管理模块
支持从JSON文件加载历史开奖数据，以及从官方API获取真实开奖数据
"""
import json
import os
import random
from datetime import datetime, timedelta
from typing import List, Dict, Optional

import requests
import urllib3

# 禁用 verify=False 时的 SSL 警告
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# 彩种配置
LOTTERY_CONFIGS = {
    "dlt": {
        "name": "大乐透",
        "front_name": "前区",
        "back_name": "后区",
        "front_range": range(1, 36),   # 1-35
        "back_range": range(1, 13),    # 1-12
        "front_count": 5,
        "back_count": 2,
        "front_mid": 18,               # 大小分界 (1-17小, 18-35大)
        "back_mid": 7,                 # 大小分界 (1-6小, 7-12大)
        "zone_boundaries": [12, 24],   # 三区: 1-12, 13-24, 25-35
        "zone_labels": ["一区(1-12)", "二区(13-24)", "三区(25-35)"],
        "api_game_no": 85,
        "default_data_file": "data/lottery_data.json",
    },
    "ssq": {
        "name": "双色球",
        "front_name": "红球",
        "back_name": "蓝球",
        "front_range": range(1, 34),   # 1-33
        "back_range": range(1, 17),    # 1-16
        "front_count": 6,
        "back_count": 1,
        "front_mid": 17,               # 大小分界 (1-16小, 17-33大)
        "back_mid": 9,                 # 大小分界 (1-8小, 9-16大)
        "zone_boundaries": [11, 22],   # 三区: 1-11, 12-22, 23-33
        "zone_labels": ["一区(1-11)", "二区(12-22)", "三区(23-33)"],
        "api_game_no": 33,
        "default_data_file": "data/ssq_data.json",
    },
}


class LotteryData:
    """单期开奖数据"""
    def __init__(self, issue: str, date: str, front_nums: List[int], back_nums: List[int]):
        self.issue = issue          # 期号
        self.date = date            # 开奖日期
        self.front_nums = sorted(front_nums)  # 前区/红球号码
        self.back_nums = sorted(back_nums)    # 后区/蓝球号码

    def to_dict(self) -> Dict:
        return {
            "issue": self.issue,
            "date": self.date,
            "front_nums": self.front_nums,
            "back_nums": self.back_nums
        }

    @classmethod
    def from_dict(cls, d: Dict) -> "LotteryData":
        return cls(d["issue"], d["date"], d["front_nums"], d["back_nums"])


class DataLoader:
    """数据加载器，管理所有历史开奖数据"""

    def __init__(self, data_file: str = "data/lottery_data.json", lottery_type: str = "dlt"):
        self.data_file = data_file
        self.lottery_type = lottery_type
        self.config = LOTTERY_CONFIGS[lottery_type]
        self.data: List[LotteryData] = []
        self._ensure_data_dir()

    @property
    def FRONT_RANGE(self):
        return self.config["front_range"]

    @property
    def BACK_RANGE(self):
        return self.config["back_range"]

    @property
    def FRONT_COUNT(self):
        return self.config["front_count"]

    @property
    def BACK_COUNT(self):
        return self.config["back_count"]

    @property
    def FRONT_MID(self):
        return self.config["front_mid"]

    @property
    def BACK_MID(self):
        return self.config["back_mid"]

    @property
    def ZONE_BOUNDARIES(self):
        return self.config["zone_boundaries"]

    @property
    def ZONE_LABELS(self):
        return self.config["zone_labels"]

    @property
    def FRONT_NAME(self):
        return self.config["front_name"]

    @property
    def BACK_NAME(self):
        return self.config["back_name"]

    @property
    def LOTTERY_NAME(self):
        return self.config["name"]

    def _ensure_data_dir(self):
        dir_name = os.path.dirname(self.data_file) if os.path.dirname(self.data_file) else "data"
        os.makedirs(dir_name, exist_ok=True)

    def load(self) -> List[LotteryData]:
        """加载历史数据，优先从本地缓存加载"""
        if os.path.exists(self.data_file):
            with open(self.data_file, "r", encoding="utf-8") as f:
                raw = json.load(f)
                self.data = [LotteryData.from_dict(d) for d in raw]
        else:
            # 首次运行尝试从API获取真实数据
            if self._fetch_real_data():
                self.save()
            else:
                # API不可用时降级为模拟数据
                self._generate_sample_data()
                self.save()
        return self.data

    def save(self):
        """保存数据到文件"""
        self._ensure_data_dir()
        with open(self.data_file, "w", encoding="utf-8") as f:
            json.dump([d.to_dict() for d in self.data], f, ensure_ascii=False, indent=2)

    def add_record(self, issue: str, date: str, front_nums: List[int], back_nums: List[int]):
        """添加一条开奖记录"""
        record = LotteryData(issue, date, front_nums, back_nums)
        self.data.append(record)
        self.save()
        return record

    def get_all(self) -> List[LotteryData]:
        return self.data

    def get_recent(self, n: int = 100) -> List[LotteryData]:
        return self.data[-n:]

    def _generate_sample_data(self, count: int = 200):
        """生成模拟历史数据，截止到今天，共 count 期"""
        self.data = []
        today = datetime.now()
        fc = self.FRONT_COUNT
        bc = self.BACK_COUNT
        start_date = today - timedelta(days=(count - 1) * 3)
        for i in range(count):
            issue = f"{24001 + i}"
            date = (start_date + timedelta(days=i * 3)).strftime("%Y-%m-%d")
            front = sorted(random.sample(list(self.FRONT_RANGE), fc))
            back = sorted(random.sample(list(self.BACK_RANGE), bc))
            self.data.append(LotteryData(issue, date, front, back))

    def regenerate(self, count: int = 200):
        """清空并重新获取最新真实数据"""
        self.data = []
        if self._fetch_real_data(count):
            self.save()
            return len(self.data)
        # API不可用时降级为模拟数据
        self._generate_sample_data(count)
        self.save()
        return len(self.data)

    def _fetch_real_data(self, count: int = 200) -> bool:
        """从官方API获取真实历史开奖数据，返回是否成功"""
        if self.lottery_type == "ssq":
            return self._fetch_ssq_data(count)
        else:
            return self._fetch_dlt_data(count)

    def _fetch_dlt_data(self, count: int = 200) -> bool:
        """从体彩官方API获取大乐透数据
        API单页最多100条，超出自动分页获取；API返回倒序（最新在前），内部转为正序存储（最早在前）"""
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://static.sporttery.cn/",
            "Accept": "application/json",
        }
        all_items = []
        page_size = min(count, 100)
        total_pages = (count + page_size - 1) // page_size
        game_no = self.config["api_game_no"]
        try:
            for page in range(1, total_pages + 1):
                url = (
                    f"https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry"
                    f"?gameNo={game_no}&provinceId=0&pageSize={page_size}&isVerify=1&pageNo={page}"
                )
                response = requests.get(url, headers=headers, timeout=15, verify=True)
                response.raise_for_status()
                data = response.json()
                items = data.get("value", {}).get("list", [])
                if not items:
                    break
                all_items.extend(items)
        except Exception as e:
            print(f"[数据加载] 首次请求失败: {e}，尝试绕过SSL验证...")
            try:
                all_items = []
                for page in range(1, total_pages + 1):
                    url = (
                        f"https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry"
                        f"?gameNo={game_no}&provinceId=0&pageSize={page_size}&isVerify=1&pageNo={page}"
                    )
                    response = requests.get(url, headers=headers, timeout=15, verify=False)
                    response.raise_for_status()
                    data = response.json()
                    items = data.get("value", {}).get("list", [])
                    if not items:
                        break
                    all_items.extend(items)
            except Exception as e2:
                print(f"[数据加载] 绕过SSL后仍失败: {e2}")
                return False
        if not all_items:
            return False
        self.data = []
        fc = self.FRONT_COUNT
        # API返回倒序（最新在前），反转后按时间正序存储（最早在前）
        for item in reversed(all_items):
            issue = item.get("lotteryDrawNum", "")
            date = item.get("lotteryDrawTime", "")
            raw_result = item.get("lotteryDrawResult", "")
            if not raw_result:
                continue
            nums = raw_result.split()
            if len(nums) < fc + self.BACK_COUNT:
                continue
            front = [int(n) for n in nums[:fc]]
            back = [int(n) for n in nums[fc:fc + self.BACK_COUNT]]
            self.data.append(LotteryData(issue, date, front, back))
        return len(self.data) > 0

    def _fetch_ssq_data(self, count: int = 200) -> bool:
        """从福彩官方API获取双色球数据
        API: cwl.gov.cn, 单页最多30条，API返回倒序（最新在前），内部转为正序存储（最早在前）"""
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://www.cwl.gov.cn/",
            "Accept": "application/json",
        }
        all_items = []
        page_size = min(count, 30)
        total_pages = (count + page_size - 1) // page_size
        try:
            for page in range(1, total_pages + 1):
                url = (
                    f"https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice"
                    f"?name=ssq&pageNo={page}&pageSize={page_size}&systemType=PC"
                )
                response = requests.get(url, headers=headers, timeout=15, verify=True)
                response.raise_for_status()
                data = response.json()
                items = data.get("result", [])
                if not items:
                    break
                all_items.extend(items)
        except Exception as e:
            print(f"[数据加载] SSQ首次请求失败: {e}，尝试绕过SSL验证...")
            try:
                all_items = []
                for page in range(1, total_pages + 1):
                    url = (
                        f"https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice"
                        f"?name=ssq&pageNo={page}&pageSize={page_size}&systemType=PC"
                    )
                    response = requests.get(url, headers=headers, timeout=15, verify=False)
                    response.raise_for_status()
                    data = response.json()
                    items = data.get("result", [])
                    if not items:
                        break
                    all_items.extend(items)
            except Exception as e2:
                print(f"[数据加载] SSQ绕过SSL后仍失败: {e2}")
                return False
        if not all_items:
            return False
        self.data = []
        # API返回倒序（最新在前），反转后按时间正序存储（最早在前）
        for item in reversed(all_items):
            issue = item.get("code", "")
            date = item.get("date", "")
            # 清理日期格式 "2026-07-30(四)" -> "2026-07-30"
            if "(" in date:
                date = date[:date.index("(")]
            red = item.get("red", "")
            blue = item.get("blue", "")
            if not red:
                continue
            front = [int(n) for n in red.split(",")]
            back = [int(n) for n in blue.split(",") if n]
            self.data.append(LotteryData(issue, date, front, back))
        return len(self.data) > 0