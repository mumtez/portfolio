"""PROTOTYPE (throwaway, branch prototype/gol-portfolio). Intro Seed backward search, strict B3/S23.

Walks backward from the name one generation at a time. Each step is a SAT call
(kissat; PySAT only for the cardinality encoding) for a predecessor whose live cells sit within 1 cell of the
current pattern, with LOOKAHEAD extra unknown generations required to exist so
we don't step straight into a Garden of Eden. On a dead end it backtracks.
Diversity comes from random assumptions on a handful of cells per attempt.

Usage: python seed_search.py <layout> <target_depth> <n_seeds> [time_budget_s]
Writes seeds-<layout>.json (each seed = list of rows, top-left anchored with an offset).
"""
import itertools
import os
import subprocess
import tempfile
import json
import random
import sys
import time

from pysat.card import CardEnc, EncType

from name_layout import LAYOUTS

LOOKAHEAD = 1
STEP_TIMEOUT = 60  # seconds per SAT call before giving up on that branch
ATTEMPTS_PER_LEVEL = 4


def step(alive):
    counts = {}
    for (x, y) in alive:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if dx or dy:
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


NBR = [(dx, dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy]


class Enc:
    def __init__(self):
        self.n = 0
        self.clauses = []

    def layer(self, box):
        lay = {}
        for c in cells(box):
            self.n += 1
            lay[c] = self.n
        return lay

    def add(self, lits):
        # lits: ints or bools. True satisfies the clause; False is dropped.
        out = []
        for l in lits:
            if l is True:
                return
            if l is False:
                continue
            out.append(l)
        self.clauses.append(out)

    def rule(self, prev, cell, nxt):
        """Constrain nxt (var or bool) == Life(prev around cell). prev: dict cell->var, missing = dead."""
        def v(c):
            return prev.get(c, False)

        def neg(l):
            return (not l) if isinstance(l, bool) else -l

        s = v(cell)
        nb = [v((cell[0] + dx, cell[1] + dy)) for dx, dy in NBR]
        if all(x is False for x in nb):
            self.add([neg(nxt)]) if nxt is not False else None
            return
        idx = range(8)
        # birth / survival forces nxt
        for T in itertools.combinations(idx, 3):
            self.add([neg(nb[i]) for i in T] + [nb[i] for i in idx if i not in T] + [nxt])
        for T in itertools.combinations(idx, 2):
            self.add([neg(s)] + [neg(nb[i]) for i in T] + [nb[i] for i in idx if i not in T] + [nxt])
        nn = neg(nxt)
        if nn is True:
            return
        for S in itertools.combinations(idx, 7):
            self.add([nn] + [nb[i] for i in S])
        for S in itertools.combinations(idx, 4):
            self.add([nn] + [neg(nb[i]) for i in S])
        for S in itertools.combinations(idx, 6):
            self.add([nn, s] + [nb[i] for i in S])


def predecessors(alive, rng, timeout, joint=1, lookahead=LOOKAHEAD, pop_ratio=None):
    """Find P_1..P_joint with step(P_k) == P_{k-1}, P_0 == alive, in an unbounded empty plane,
    plus `lookahead` more unknown generations that must exist. Returns [P_1..P_joint],
    None (UNSAT) or "timeout". Solved by kissat in a subprocess (hard timeout, --seed for variety)."""
    enc = Enc()
    boxes = [bbox(alive)]
    layers = [None]
    for k in range(1, joint + lookahead + 1):
        boxes.append(grow(boxes[-1], 1))
        layers.append(enc.layer(boxes[-1]))
    for c in cells(grow(boxes[1], 1)):
        enc.rule(layers[1], c, c in alive)
    for k in range(2, len(layers)):
        for c in cells(grow(boxes[k], 1)):
            enc.rule(layers[k], c, layers[k - 1].get(c, False))
    if pop_ratio is not None:
        for k in range(1, joint + 1):
            card = CardEnc.atmost(list(layers[k].values()), bound=int(len(alive) * pop_ratio),
                                  top_id=enc.n, encoding=EncType.seqcounter)
            enc.n = max(enc.n, card.nv)
            enc.clauses.extend(card.clauses)
    with tempfile.NamedTemporaryFile("w", suffix=".cnf", delete=False) as f:
        f.write(f"p cnf {enc.n} {len(enc.clauses)}\n")
        f.write("".join(" ".join(map(str, cl)) + " 0\n" for cl in enc.clauses))
        path = f.name
    try:
        r = subprocess.run(["kissat", "-q", f"--seed={rng.randrange(1 << 30)}", f"--time={int(timeout)}", path],
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
    return [{c for c, var in layers[k].items() if var in model} for k in range(1, joint + 1)]


def search(target, depth, rng, deadline, stats):
    """DFS backward. Returns list [seed(depth), ..., target] or the deepest chain found."""
    best = [target]

    def go(chain):
        nonlocal best
        if len(chain) > len(best):
            best = list(chain)
            print(f"  reached {len(chain) - 1} gens back", flush=True)
        if len(chain) - 1 >= depth:
            return True
        for attempt in range(ATTEMPTS_PER_LEVEL):
            if time.time() > deadline:
                return False
            t = time.time()
            n_assume = [12, 6, 2, 0][attempt]
            p = predecessor(chain[-1], rng, n_assume, STEP_TIMEOUT)
            stats.append((len(chain), time.time() - t, "timeout" if p == "timeout" else bool(p)))
            if p in (None, "timeout") or not p:
                continue
            if go(chain + [p]):
                return True
        return False

    go([target])
    return best


def to_rows(alive, origin):
    x0, y0, x1, y1 = bbox(alive)
    rows = ["".join("#" if (x, y) in alive else "." for x in range(x0, x1 + 1)) for y in range(y0, y1 + 1)]
    return {"dx": x0 - origin[0], "dy": y0 - origin[1], "rows": rows}


def main():
    layout, depth, n_seeds = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    budget = float(sys.argv[4]) if len(sys.argv) > 4 else 3600
    rows = LAYOUTS[layout]
    target = {(x, y) for y, r in enumerate(rows) for x, ch in enumerate(r) if ch == "#"}
    seeds = []
    out = f"seeds-{layout}.json"
    t_start = time.time()
    for i in range(n_seeds):
        rng = random.Random(i * 7919 + len(layout))
        stats = []
        t = time.time()
        print(f"[{layout}] seed {i}", flush=True)
        chain = search(target, depth, rng, t_start + budget, stats)
        reached = len(chain) - 1
        seed = chain[-1]
        # verify forward in an unbounded plane
        s = seed
        for _ in range(reached):
            s = step(s)
        assert s == target, "forward check failed"
        dt = time.time() - t
        calls = len(stats)
        print(f"[{layout}] seed {i}: {reached} gens, {dt:.1f}s, {calls} SAT calls, density "
              f"{len(seed) / ((bbox(seed)[2] - bbox(seed)[0] + 1) * (bbox(seed)[3] - bbox(seed)[1] + 1)):.2f}", flush=True)
        seeds.append({"generations": reached, "seconds": round(dt, 1), "sat_calls": calls,
                      "seed": to_rows(seed, (0, 0))})
        with open(out, "w") as f:
            json.dump({"layout": layout, "target": rows, "seeds": seeds}, f)
        if time.time() > t_start + budget:
            break


if __name__ == "__main__":
    main()
