"""PROTOTYPE (throwaway, branch prototype/gol-portfolio). Intro Seed backward search, strict B3/S23.

Finds a seed S with step^depth(S) == name, in an unbounded empty plane.

What didn't work (kept here as findings):
- One generation at a time: gen -1 is easy (~1s) but it's dense (~700 cells) and almost always a
  Garden of Eden, so gen -2 is UNSAT.
- Solving all generations jointly over the whole name: 2 gens 84s, 3+ gens didn't finish in 25 min.
  A lone letter does 5 gens in 5s, so the problem is area, not depth.

What this does: all `depth` generations jointly, but over a window of columns that sweeps left to
right. Each window's SAT call (kissat, subprocess, hard timeout) sees the already-fixed columns as
constants; after solving, the leftmost STRIDE columns of every generation are frozen and the window
moves on. Constraints whose 3x3 input crosses the window's right edge are deferred to the next
window. UNSAT/timeout -> backtrack one window and re-solve it with a different random seed.

- Splitting the tall stacked layout into horizontal bands of 2-D windows (band/band_stride args)
  fails at the corners: each x-window freezes upper rows whose lower neighbours were solved by a
  different window, so the next band has no joint completion. Fix would be staircase-shaped windows
  (keep the unfrozen lower rows of earlier windows as variables). Not done within the time-box.

Usage: python seed_search.py <layout> <depth> <n_seeds> [budget_s] [window] [stride] [window_timeout_s] [band] [band_stride]
(band/band_stride split tall layouts into horizontal bands of 2-D windows.)
Writes seeds-<layout>.json.
"""
import itertools
import json
import os
import random
import subprocess
import sys
import tempfile
import time

from name_layout import LAYOUTS

NBR = [(dx, dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy]


def step(alive):
    counts = {}
    for (x, y) in alive:
        for dx, dy in NBR:
            k = (x + dx, y + dy)
            counts[k] = counts.get(k, 0) + 1
    return {c for c, n in counts.items() if n == 3 or (n == 2 and c in alive)}


def bbox(alive):
    xs = [x for x, _ in alive]
    ys = [y for _, y in alive]
    return min(xs), min(ys), max(xs), max(ys)


def grow(box, m):
    return box[0] - m, box[1] - m, box[2] + m, box[3] + m


def cells(box):
    return [(x, y) for y in range(box[1], box[3] + 1) for x in range(box[0], box[2] + 1)]


def neg(l):
    return (not l) if isinstance(l, bool) else -l


def life_clauses(s, nb, nxt, out):
    """CNF for nxt == B3/S23(s, nb). Literals are ints or bools; bools are folded away."""
    def add(lits):
        cl = []
        for l in lits:
            if l is True:
                return
            if l is not False:
                cl.append(l)
        out.append(cl)

    idx = range(8)
    for T in itertools.combinations(idx, 3):
        add([neg(nb[i]) for i in T] + [nb[i] for i in idx if i not in T] + [nxt])
    for T in itertools.combinations(idx, 2):
        add([neg(s)] + [neg(nb[i]) for i in T] + [nb[i] for i in idx if i not in T] + [nxt])
    nn = neg(nxt)
    if nn is True:
        return
    for S in itertools.combinations(idx, 7):
        add([nn] + [nb[i] for i in S])
    for S in itertools.combinations(idx, 4):
        add([nn] + [neg(nb[i]) for i in S])
    for S in itertools.combinations(idx, 6):
        add([nn, s] + [nb[i] for i in S])


def kissat(nvars, clauses, seed, timeout):
    with tempfile.NamedTemporaryFile("w", suffix=".cnf", delete=False) as f:
        f.write(f"p cnf {nvars} {len(clauses)}\n")
        f.write("".join(" ".join(map(str, cl)) + " 0\n" for cl in clauses))
        path = f.name
    try:
        r = subprocess.run(["kissat", "-q", f"--seed={seed}", f"--time={int(timeout)}", path],
                           capture_output=True, text=True)
    finally:
        os.unlink(path)
    if r.returncode == 20:
        return None
    if r.returncode != 10:
        return "timeout"
    model = set()
    for line in r.stdout.splitlines():
        if line.startswith("v "):
            model.update(int(t) for t in line[2:].split() if int(t) > 0)
    return model


class Search:
    def __init__(self, target, depth, window, stride, timeout, rng):
        self.target, self.depth, self.window, self.stride = target, depth, window, stride
        self.timeout, self.rng = timeout, rng
        self.boxes = [grow(bbox(target), k) for k in range(depth + 1)]
        self.fixed = [dict() for _ in range(depth + 1)]  # layer -> cell -> bool
        self.calls = 0

    def solve_window(self, lo, hi, ylo, yhi):
        D = self.depth
        var = [dict() for _ in range(D + 1)]
        n = 0
        for k in range(1, D + 1):
            for c in cells(self.boxes[k]):
                if lo <= c[0] < hi and ylo <= c[1] < yhi and c not in self.fixed[k]:
                    n += 1
                    var[k][c] = n

        def get(k, c):
            if k == 0:
                return c in self.target
            b = self.boxes[k]
            if not (b[0] <= c[0] <= b[2] and b[1] <= c[1] <= b[3]):
                return False
            if c in self.fixed[k]:
                return self.fixed[k][c]
            return var[k].get(c)  # None = outside window, unknown

        # Constrain every cell whose 3x3 input and output are all known (fixed or in this window)
        # and that touches at least one window variable. Anything touching an unknown is deferred.
        clauses = []
        for k in range(1, D + 1):
            for c in cells(grow(self.boxes[k], 1)):
                if not (lo - 1 <= c[0] <= hi and ylo - 1 <= c[1] <= yhi):
                    continue
                ins = [get(k, c)] + [get(k, (c[0] + dx, c[1] + dy)) for dx, dy in NBR]
                outv = get(k - 1, c)
                if outv is None or any(v is None for v in ins):
                    continue
                if all(isinstance(v, bool) for v in ins + [outv]):
                    continue
                life_clauses(ins[0], ins[1:], outv, clauses)
        # diversity: nudge a few cells of the seed layer
        nudge = [v for c, v in var[D].items() if c[0] < lo + self.stride]
        units = [[v if self.rng.random() < 0.5 else -v] for v in self.rng.sample(nudge, min(len(nudge), 3))]
        for attempt_units in (units, []):
            self.calls += 1
            model = kissat(n, clauses + attempt_units, self.rng.randrange(1 << 30), self.timeout)
            if model not in (None, "timeout"):
                return {k: {c: (v in model) for c, v in var[k].items()} for k in range(1, D + 1)}
        return None

    def run(self, deadline, band=10 ** 6, band_stride=10 ** 6):
        """Sweep windows left to right within horizontal bands, bands top to bottom."""
        x0, y0, x1, y1 = self.boxes[self.depth]
        ystarts = list(range(y0, y1 + 1, band_stride))
        for bi, ylo in enumerate(ystarts):
            yhi = ylo + band
            last_band = yhi > y1
            starts = list(range(x0, x1 + 1, self.stride))
            i, history, retries = 0, [], 0
            while i < len(starts):
                if time.time() > deadline:
                    return None
                lo = starts[i]
                hi = lo + self.window
                last = hi > x1
                sol = self.solve_window(lo, hi, ylo, yhi)
                if sol is None:
                    retries += 1
                    if not history or retries > 30:
                        return None
                    i -= 1  # backtrack one window within this band
                    for k, cs in history.pop().items():
                        for c in cs:
                            del self.fixed[k][c]
                    continue
                frozen = {}
                for k, vals in sol.items():
                    frozen[k] = [c for c in vals if (last or c[0] < lo + self.stride)
                                 and (last_band or c[1] < ylo + band_stride)]
                    for c in frozen[k]:
                        self.fixed[k][c] = vals[c]
                history.append(frozen)
                i += 1
                if last:
                    break
            if last_band:
                break
        return {c for c, v in self.fixed[self.depth].items() if v}


def to_rows(alive):
    x0, y0, x1, y1 = bbox(alive)
    rows = ["".join("#" if (x, y) in alive else "." for x in range(x0, x1 + 1)) for y in range(y0, y1 + 1)]
    return {"dx": x0, "dy": y0, "rows": rows}


def main():
    layout, depth, n_seeds = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    budget = float(sys.argv[4]) if len(sys.argv) > 4 else 3600
    window = int(sys.argv[5]) if len(sys.argv) > 5 else 24
    stride = int(sys.argv[6]) if len(sys.argv) > 6 else 8
    wt = float(sys.argv[7]) if len(sys.argv) > 7 else 300
    band = int(sys.argv[8]) if len(sys.argv) > 8 else 10 ** 6
    band_stride = int(sys.argv[9]) if len(sys.argv) > 9 else 10 ** 6
    rows = LAYOUTS[layout]
    target = {(x, y) for y, r in enumerate(rows) for x, ch in enumerate(r) if ch == "#"}
    off = int(os.environ.get("SEED_OFFSET", "0"))
    out = f"seeds-{layout}-d{depth}-o{off}.json"
    seeds, t_start = [], time.time()
    for i in range(n_seeds):
        t = time.time()
        s = Search(target, depth, window, stride, timeout=wt, rng=random.Random(1000 * depth + 100 * off + i))
        seed = s.run(t_start + budget, band, band_stride)
        dt = time.time() - t
        if seed is None:
            print(f"[{layout} d{depth}] seed {i}: FAILED after {dt:.0f}s, {s.calls} SAT calls", flush=True)
            if time.time() > t_start + budget:
                break
            continue
        cur = seed
        for _ in range(depth):
            cur = step(cur)
        ok = cur == target
        b = bbox(seed)
        dens = len(seed) / ((b[2] - b[0] + 1) * (b[3] - b[1] + 1))
        print(f"[{layout} d{depth}] seed {i}: {'OK' if ok else 'VERIFY FAILED'} {dt:.0f}s, "
              f"{s.calls} SAT calls, {len(seed)} cells, density {dens:.2f}", flush=True)
        if ok:
            seeds.append({"generations": depth, "seconds": round(dt, 1), "sat_calls": s.calls, "seed": to_rows(seed)})
            with open(out, "w") as f:
                json.dump({"layout": layout, "target": rows, "seeds": seeds}, f)


if __name__ == "__main__":
    main()
