"""PROTOTYPE (throwaway, branch prototype/gol-portfolio). The name's exact cell layout.

Hand-drawn bold glyphs, 9 cells tall, 2-cell vertical strokes, 1-cell horizontals.
Run directly to write name-layouts.json for the UI prototype.
"""
import json
import pathlib

GLYPHS = {
    "A": [".#####.", "##...##", "##...##", "##...##", "#######", "##...##", "##...##", "##...##", "##...##"],
    "N": ["##...##", "###..##", "####.##", "#######", "##.####", "##..###", "##...##", "##...##", "##...##"],
    "D": ["######.", "##...##", "##...##", "##...##", "##...##", "##...##", "##...##", "##...##", "######."],
    "R": ["######.", "##...##", "##...##", "##...##", "######.", "##.##..", "##..##.", "##...##", "##...##"],
    "E": ["#######", "##.....", "##.....", "##.....", "######.", "##.....", "##.....", "##.....", "#######"],
    "W": ["##...##", "##...##", "##...##", "##...##", "##.#.##", "##.#.##", "#######", "###.###", "##...##"],
    "B": ["######.", "##...##", "##...##", "##...##", "######.", "##...##", "##...##", "##...##", "######."],
    "U": ["##...##"] * 8 + [".#####."],
    "S": [".######", "##.....", "##.....", "##.....", ".#####.", ".....##", ".....##", ".....##", "######."],
    "T": ["######", "..##..", "..##..", "..##..", "..##..", "..##..", "..##..", "..##..", "..##.."],
    "M": ["##...##", "###.###", "#######", "##.#.##", "##.#.##", "##...##", "##...##", "##...##", "##...##"],
}
LETTER_GAP = 2
WORD_GAP = 5
LINE_GAP = 4


def word_rows(word):
    rows = [""] * 9
    for i, ch in enumerate(word):
        if i:
            rows = [r + "." * LETTER_GAP for r in rows]
        rows = [r + g for r, g in zip(rows, GLYPHS[ch])]
    return rows


def one_line():
    a, b = word_rows("ANDREW"), word_rows("ABURUSTUM")
    return [x + "." * WORD_GAP + y for x, y in zip(a, b)]


def two_lines():
    a, b = word_rows("ANDREW"), word_rows("ABURUSTUM")
    w = len(b[0])
    pad = (w - len(a[0])) // 2
    a = ["." * pad + r + "." * (w - pad - len(r)) for r in a]
    return a + ["." * w] * LINE_GAP + b


LAYOUTS = {"one-line": one_line(), "two-lines": two_lines()}

if __name__ == "__main__":
    for name, rows in LAYOUTS.items():
        print(name, f"{len(rows[0])}x{len(rows)}")
        print("\n".join(rows))
    out = pathlib.Path(__file__).with_name("name-layouts.json")
    out.write_text(json.dumps(LAYOUTS, indent=1))
