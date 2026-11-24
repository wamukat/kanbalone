"""Capture one browser state from a dedicated synthetic Kanbalone session."""

import argparse
import datetime
import hashlib
import json
import pathlib
import re
import struct
import subprocess
from urllib.parse import urlsplit


def browser(session, *arguments, script=None):
    command = subprocess.run(
        ["agent-browser", "--session", session, "--json", *arguments],
        input=script, capture_output=True, text=True, check=True, timeout=30,
    )
    result = json.loads(command.stdout)
    if not result["success"]:
        raise RuntimeError(result["error"])
    return result["data"]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", required=True, help="An open agent-browser session using the synthetic fixture")
    parser.add_argument("--origin", default="http://127.0.0.1:3675")
    parser.add_argument("--source", required=True, help="Commit or source fingerprint of the running build")
    parser.add_argument("--screen", required=True)
    parser.add_argument("--state", required=True)
    parser.add_argument("--note", required=True, help="Observed state and any simulated adapters")
    parser.add_argument("--output", required=True, type=pathlib.Path)
    parser.add_argument("--require", action="append", default=[], metavar="ELEMENT_ID")
    parser.add_argument("--styles-only", action="store_true", help="Use when the state already has comparable visual evidence")
    args = parser.parse_args()
    origin = urlsplit(args.origin)
    if origin.scheme != "http" or origin.hostname != "127.0.0.1" or origin.port is None or origin.path not in ("", "/"):
        parser.error("--origin must be the loopback HTTP origin of the dedicated fixture")
    origin_url = f"{origin.scheme}://{origin.netloc}"
    for key in (args.screen, args.state):
        if not re.fullmatch("[a-z0-9]+(?:-[a-z0-9]+)*", key):
            parser.error("screen and state must be lowercase slugs")

    tools = pathlib.Path(__file__).resolve().parent
    screens = tools.parent.parent / "screens"
    if not (screens / f"{args.screen}.json").is_file():
        parser.error(f"unknown screen {args.screen}")
    selectors = {}
    for file in sorted(screens.glob("*.json")):
        for entry in json.loads(file.read_text(encoding="utf-8")).get("elements", []):
            selectors[entry["id"]] = entry["selector"]
    script = (tools / "collect.js").read_text(encoding="utf-8")
    script = script.replace("/* inventory IDs */ {}", json.dumps(selectors, ensure_ascii=False))
    guarded = f"location.origin === {json.dumps(origin_url)} ? ({script.strip()}) : null"
    state = browser(args.session, "eval", "--stdin", script=guarded)["result"]
    if not state:
        raise RuntimeError(f"Open the synthetic instance at {origin_url} in the selected browser session")
    missing = sorted(set(args.require) - state["elementIdMatches"].keys())
    if missing:
        raise RuntimeError(f"Required selectors missing from rendered DOM: {', '.join(missing)}")

    locale, theme = state["locale"], state["colorScheme"]
    label = f"{locale}-{theme}-{args.screen}-{args.state}"
    files = {
        "styles": args.output / "styles" / f"{label}.json",
        "record": args.output / "records" / f"{label}.json",
    }
    if not args.styles_only:
        files["image"] = args.output / "images" / f"{label}.png"
    for path in files.values():
        if path.exists():
            raise FileExistsError(path)
        path.parent.mkdir(parents=True, exist_ok=True)

    stamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    state.update({"frameId": label, "screen": args.screen, "state": args.state,
        "source": args.source, "note": args.note, "capturedAtUtc": stamp})
    raw = (json.dumps(state, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    row = {"id": label, "source": args.source, "screen": args.screen, "state": args.state,
        "note": args.note, "path": state["path"], "locale": locale, "theme": theme,
        "viewport": state["viewport"], "elementCount": len(state["elements"]),
        "exactElementIds": len(state["elementIdMatches"]), "capturedAtUtc": stamp,
        "styles": str(files["styles"].relative_to(args.output)), "styleSha256": digest(raw)}
    if "image" in files:
        browser(args.session, "screenshot", str(files["image"].resolve()))
        image = files["image"].read_bytes()
        width, height, dpr = state["viewport"]
        if image[:8] != b"\x89PNG\r\n\x1a\n" or struct.unpack(">II", image[16:24]) != (round(width*dpr), round(height*dpr)):
            raise RuntimeError("PNG size does not match the measured browser viewport")
        row["image"] = str(files["image"].relative_to(args.output))
        row["sha256"] = digest(image)
    files["styles"].write_bytes(raw)
    files["record"].write_text(json.dumps(row, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(files["record"])


if __name__ == "__main__":
    main()
