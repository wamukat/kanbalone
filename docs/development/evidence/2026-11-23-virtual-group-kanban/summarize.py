import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path


def timing(samples):
    values = [value for value in samples if value is not None]
    if not values:
        return None
    return {
        "median": statistics.median(values),
        "min": min(values),
        "max": max(values),
        "atOrBelow1000": sum(value <= 1000 for value in values),
        "n": len(values),
    }


def asset_gap(sample):
    generated = sample["resources"]
    assert generated, "Compiled entry resources were not observed"
    assert any(resource["path"].endswith(".js") for resource in generated), "Missing built JavaScript"
    assert any(resource["path"].endswith(".css") for resource in generated), "Missing built stylesheet"
    assert all(resource["bytes"] > 0 for resource in generated), "Empty generated resource"
    return max(resource["responseEnd"] for resource in generated) - sample["initial"]["at"]


def summarize(path):
    raw = json.loads(path.read_text())
    retained = raw["provenance"]["retained"]
    samples = defaultdict(list)
    pairs = defaultdict(dict)
    for sample in raw["samples"]:
        key = (sample["fixture"], sample["version"])
        samples[key].append(sample)
        if not sample["warmup"]:
            match = pairs[(sample["fixture"], sample["round"])]
            assert sample["version"] not in match, "Duplicate sample"
            match[sample["version"]] = sample

    for key, group in samples.items():
        assert len(group) == retained + 1, (key, "Missing navigation")
        assert sum(sample["warmup"] for sample in group) == 1, key

    geometry = defaultdict(list)
    for (fixture, _), builds in pairs.items():
        control = builds["baseline"]["initial"]["rows"]
        candidate = builds["candidate"]["initial"]["rows"]
        assert len(control) == len(candidate)
        assert [row["id"] for row in control] == [row["id"] for row in candidate]
        geometry[fixture].append(max(
            abs(a - b) for old, new in zip(control, candidate) for a, b in zip(old["rect"], new["rect"])
        ))

    summary = defaultdict(dict)
    for (fixture, version), group in samples.items():
        rows = [sample for sample in group if not sample["warmup"]]
        summary[fixture][version] = {
            "collectionReady": timing([sample["collection"]["collection"]["at"] for sample in rows]),
            "explicitProjectionReady": timing([sample["collection"].get("projection", {}).get("at") for sample in rows]),
            "firstDomPlus2Frames": timing([sample["first"] for sample in rows]),
            "sameViewportPlus2Frames": timing([sample["initial"]["at"] for sample in rows]),
            "completeDomPlus2Frames": timing([sample["completeDom"] for sample in rows]),
            "hostNavigationToTrustedEnterDetail": timing([sample["host"]["navigationToDetail"] for sample in rows]),
            "hostViewportObservedToKeyDispatch": timing([sample["host"]["viewportToKey"] for sample in rows]),
            "hostKeyDispatchToDetail": timing([sample["host"]["keyToDetail"] for sample in rows]),
            "browserTrustedKeyToDetail": timing([sample["detail"]["at"] - sample["key"]["at"] for sample in rows]),
            "initialMountedRange": [min(sample["initial"]["mounted"] for sample in rows), max(sample["initial"]["mounted"] for sample in rows)],
            "generatedResourceAfterViewportRange": [min(map(asset_gap, rows)), max(map(asset_gap, rows))],
        }

    return {
        "rawFile": str(path.resolve()),
        "units": "Milliseconds unless noted. Negative resource timing means response completion before the viewport checkpoint.",
        "operation": "Fixed navigation, matching viewport observation, title focus, trusted Enter and detail readiness. Includes automation transport and wait.",
        "fixtures": {key: {**values, "maxPairedInitialRectangleDeltaPx": max(geometry[key])} for key, values in summary.items()},
    }


if __name__ == "__main__":
    raw_path = Path(sys.argv[1])
    output = summarize(raw_path)
    raw_path.with_name("summary.json").write_text(json.dumps(output, indent=2) + "\n")
