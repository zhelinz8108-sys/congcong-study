"""Read completed rounds using the family's scoped cloud credential."""
import argparse
import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def read_rounds(token, since, after):
    client = build_opener(NoRedirect())
    endpoint = "https://congcong-study.cn/practice-reports/rounds"
    seen = set()
    rounds = []
    while True:
        query = urlencode({k: v for k, v in (("since", since), ("after", after)) if v})
        req = Request(endpoint + ("?" + query if query else ""), headers={"Authorization": "Bearer " + token})
        with client.open(req, timeout=25) as response:
            data = json.load(response)
        if not isinstance(data.get("rounds"), list) or "nextAfter" not in data:
            raise ValueError("学习站返回的格式不正确")
        for row in data["rounds"]:
            if (set(row) != {"id", "activity", "answered", "finishedAt"} or
                    not isinstance(row["answered"], int) or row["answered"] <= 0 or row["id"] in seen):
                raise ValueError("练习报告无效或出现重复编号")
            seen.add(row["id"])
            rounds.append(row)
        after = data["nextAfter"]
        if after is None:
            return rounds
        if not data["rounds"] or after != data["rounds"][-1]["id"]:
            raise ValueError("学习站返回的分页编号无效")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--since", help="UTC time, inclusive, e.g. 2026-11-21T08:00:00Z")
    parser.add_argument("--after", help="resume after this round ID")
    args = parser.parse_args()
    token = os.environ.get("CONGCONG_REPORT_TOKEN")
    if not token:
        sys.exit("尚未配置运行时密钥 CONGCONG_REPORT_TOKEN")
    try:
        rows = read_rounds(token, args.since, args.after)
    except HTTPError as error:
        sys.exit(f"学习站请求失败（HTTP {error.code}）")
    except (OSError, URLError, ValueError, TypeError, KeyError) as error:
        sys.exit(f"未能读取完整的练习报告（{type(error).__name__}）")
    print(json.dumps(rows, ensure_ascii=False))


if __name__ == "__main__":
    main()
