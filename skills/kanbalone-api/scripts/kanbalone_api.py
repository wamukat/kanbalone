#!/usr/bin/env python3
"""Small Kanbalone HTTP API helper.

Examples:
  kanbalone_api.py --base http://127.0.0.1:3000 GET /api/boards
  kanbalone_api.py --base http://127.0.0.1:3000 POST /api/tickets/95/comments '{"bodyMarkdown":"Started work."}'
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Call a Kanbalone API endpoint.")
    parser.add_argument(
        "--base",
        default=os.environ.get("KANBALONE_URL", "http://127.0.0.1:3000"),
        help="Kanbalone base URL. Defaults to KANBALONE_URL or http://127.0.0.1:3000.",
    )
    parser.add_argument("method", choices=["GET", "POST", "PATCH", "DELETE", "get", "post", "patch", "delete"])
    parser.add_argument("path", help="API path, for example /api/boards.")
    parser.add_argument("json_body", nargs="?", help="JSON body. If omitted, stdin is used when piped.")
    return parser.parse_args()


def read_body(arg: str | None) -> bytes | None:
    if arg is None and sys.stdin.isatty():
        return None
    text = arg if arg is not None else sys.stdin.read()
    if not text.strip():
        return None
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid JSON body: {exc}") from exc
    return json.dumps(parsed).encode("utf-8")


def build_url(base: str, path: str) -> str:
    parsed = urllib.parse.urlparse(base.rstrip("/"))
    if parsed.scheme and parsed.netloc:
        base = urllib.parse.urlunparse((parsed.scheme, parsed.netloc, "", "", "", ""))
    else:
        base = base.rstrip("/")
    if path.startswith("http://") or path.startswith("https://"):
        return path
    if not path.startswith("/"):
        path = f"/{path}"
    return urllib.parse.urljoin(f"{base}/", path.lstrip("/"))


def main() -> int:
    args = parse_args()
    method = args.method.upper()
    body = read_body(args.json_body)
    request = urllib.request.Request(
        build_url(args.base, args.path),
        data=body,
        method=method,
        headers={"accept": "application/json", "content-type": "application/json"},
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            status = response.status
    except urllib.error.HTTPError as error:
        raw = error.read()
        sys.stderr.write(f"HTTP {error.code} {error.reason}\n")
        if raw:
            sys.stderr.write(raw.decode("utf-8", errors="replace") + "\n")
        return 1
    except urllib.error.URLError as error:
        sys.stderr.write(f"Request failed: {error.reason}\n")
        return 1

    if status == 204 or not raw:
        print(f"HTTP {status}")
        return 0

    text = raw.decode("utf-8", errors="replace")
    try:
        print(json.dumps(json.loads(text), ensure_ascii=False, indent=2))
    except json.JSONDecodeError:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
