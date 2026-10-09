"""PROTOTYPE. Bundle seeds-<layout>-d<depth>.json into seeds.js for intro.html.

Keeps only the deepest depth found per layout, so the pool is uniform.
"""
import glob
import json
import pathlib
import re

here = pathlib.Path(__file__).parent
best = {}
for p in sorted(glob.glob(str(here / "seeds-*-d*.json"))):
    layout, depth = re.match(r".*seeds-(.+?)-d(\d+)(?:-o\d+)?\.json", p).groups()
    depth = int(depth)
    data = json.load(open(p))
    seeds = [dict(s, target=data["target"]) for s in data["seeds"]]
    if not seeds or depth < best.get(layout, (0, []))[0]:
        continue
    if depth > best.get(layout, (0, []))[0]:
        best[layout] = (depth, [])
    best[layout][1].extend(seeds)
out = {k: v[1] for k, v in best.items()}
(here / "seeds.js").write_text("window.SEEDS = " + json.dumps(out) + ";\n")
for k, v in best.items():
    print(k, f"depth {v[0]}", f"{len(v[1])} seeds")
