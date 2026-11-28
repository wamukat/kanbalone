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
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request


def parse_header(arg: str) -> tuple[str, str]:
    name, separator, value = arg.partition(":")
    if not separator or not re.fullmatch(r"[!#$%&'*+.^_`|~0-9A-Za-z-]+", name):
        raise argparse.ArgumentTypeError("expected an HTTP header in Name: Value format")
    if re.search(r"[^\x20-\x7e\xa0-\xff]", value):
        raise argparse.ArgumentTypeError("header values must be Latin-1 text without control characters")
    return name.lower(), value.strip(" ")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Call a Kanbalone API endpoint.")
    parser.add_argument(
        "--base",
        default=os.environ.get("KANBALONE_URL", "http://127.0.0.1:3000"),
        help="Kanbalone base URL. Defaults to KANBALONE_URL or http://127.0.0.1:3000.",
    )
    parser.add_argument("method", choices=["GET", "POST", "PUT", "PATCH", "DELETE", "get", "post", "put", "patch", "delete"])
    parser.add_argument("path", help="API path, for example /api/boards.")
    parser.add_argument("json_body", nargs="?", help="JSON body. If omitted, stdin is used when piped.")
    parser.add_argument("--body-file", help="UTF-8 Markdown file to send as bodyMarkdown. Optional JSON argument supplies other fields; stdin is not read.")
    parser.add_argument(
        "--header", metavar="NAME: VALUE", action="append", type=parse_header, default=[],
        help="Send a request header. Repeat to set more headers. The last value wins for each case-insensitive name.",
    )
    return parser.parse_intermixed_args()


def read_body(arg: str | None, body_file: str | None = None) -> bytes | None:
    if body_file is not None:
        try:
            fields = json.loads(arg) if arg is not None else {}
        except json.JSONDecodeError as exc:
            raise SystemExit(f"Invalid JSON body: {exc}") from exc
        if not isinstance(fields, dict):
            raise SystemExit("--body-file requires a JSON object for additional fields")
        if "bodyMarkdown" in fields or "appendMarkdown" in fields:
            raise SystemExit("--body-file cannot be combined with bodyMarkdown or appendMarkdown")
        try:
            with Path(body_file).open(encoding="utf-8", newline="") as source:
                fields["bodyMarkdown"] = source.read()
        except (OSError, UnicodeError) as exc:
            raise SystemExit(f"Cannot read Markdown file: {exc}") from exc
        return json.dumps(fields).encode("utf-8")
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
    body = read_body(args.json_body, args.body_file)
    headers = {"accept": "application/json"}
    if body is not None:
        headers["content-type"] = "application/json"
    request = urllib.request.Request(
        build_url(args.base, args.path),
        data=body,
        method=method,
        headers=headers,
    )
    for name, value in dict(args.header).items():
        # Custom headers take precedence on the initial request and stay off redirects.
        request.add_unredirected_header(name, value)

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
