"""Export everything the web game needs from the Python project.

    uv run --group web export_web.py             # everything
    uv run --group web export_web.py fourrow     # only some presets (bagh map ids and/or "fourrow")

For every bagh-chal preset this writes
    web/public/maps/<preset>/game.json    board geometry + rules (start position, capture target, ...)
    web/public/maps/<preset>/model.onnx   the trained network (only if a checkpoint exists)
    web/tests/fixtures/<preset>.json      positions with the answers Python gives (legal moves,
                                          winner, input planes, network output), so the TypeScript
                                          port of the rules can be tested against the original
and web/public/maps/index.json listing the maps. For four-in-a-row:
    web/public/fourrow/game.json          board size + whether a network is trained
    web/public/fourrow/model.onnx         the trained network (only if a checkpoint exists)
    web/tests/fixtures/fourrow.json       positions with Python's answers

Re-run it after training: the web game picks up new networks automatically.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import torch

from bagh.boards import get_board
from bagh.config import PRESETS
from bagh.game import DRAW, State
from core.net import load_checkpoint
from core.spec import spec_of
from fourrow.config import PRESETS as FOURROW_PRESETS
from fourrow.game import State as FourRowState

ROOT = Path(__file__).parent
PUBLIC = ROOT / "web" / "public" / "maps"
FOURROW_PUBLIC = ROOT / "web" / "public" / "fourrow"
FIXTURES = ROOT / "web" / "tests" / "fixtures"

# How the maps are presented in the game (the Python side only knows preset names).
DISPLAY = {
    "hourglass": ("Hourglass", "The local 13-point board. 1 tiger, 7 goats. Goats move first."),
    "tiny": ("Little Square", "A tiny 3x3 warm-up. 1 tiger, 3 goats. One capture wins."),
    "small": ("Village Square", "The classic 5x5 board. 1 tiger, 8 goats."),
    "full": ("Four Tigers", "5x5 with a tiger in every corner and 12 goats."),
}


def game_json(name: str) -> dict:
    cfg = PRESETS[name].game
    geo = get_board(cfg.board)
    title, blurb = DISPLAY[name]
    return {
        "id": name,
        "title": title,
        "blurb": blurb,
        "board": {
            "name": geo.name,
            "rows": geo.rows,
            "cols": geo.cols,
            "coords": [list(rc) for rc in geo.coords],
            "lines": [list(line) for line in geo.lines],
            "labels": list(geo.labels),
            "shading": [list(poly) for poly in geo.shading],
            "gridLabels": geo.grid_labels,
            # Derived tables, exported rather than re-derived so both sides agree exactly.
            "steps": [list(s) for s in geo.steps],
            "jumps": [[list(j) for j in js] for js in geo.jumps],
            "pointMask": geo.point_mask.ravel().tolist(),
            "degreePlane": geo.degree_plane.ravel().tolist(),
        },
        "rules": {
            "tigers": list(cfg.tigers),
            "goats": list(cfg.goats),
            "capturesToWin": cfg.captures_to_win,
            "maxPlies": cfg.max_plies,
            "first": cfg.first,
        },
    }


def export_model(name: str, game, out: Path) -> tuple[torch.nn.Module | None, dict | None]:
    ckpt_path = ROOT / "checkpoints" / name / "best.pt"
    if not ckpt_path.exists():
        out.unlink(missing_ok=True)
        return None, None
    net, ckpt = load_checkpoint(ckpt_path, torch.device("cpu"))
    spec = spec_of(game)
    shape = (spec.num_planes, spec.rows, spec.cols)
    dummy = torch.zeros(1, *shape)
    torch.onnx.export(
        net, (dummy,), out, input_names=["planes"], output_names=["policy", "value"],
        dynamic_shapes={"x": {0: torch.export.Dim("batch", min=1, max=1024)}}, dynamo=True, external_data=False, verbose=False,
    )  # fmt: skip

    # Check the exported model computes the same thing as PyTorch.
    import onnxruntime as ort

    x = torch.randn(5, *shape)
    with torch.no_grad():
        ref_p, ref_v = net(x)
    sess = ort.InferenceSession(str(out))
    p, v = sess.run(None, {"planes": x.numpy()})
    assert np.allclose(p, ref_p.numpy(), atol=1e-4) and np.allclose(v, ref_v.numpy(), atol=1e-4), "ONNX mismatch"
    return net, ckpt


def fixtures(name: str, net, positions: int = 150, seed: int = 0) -> dict:
    """Random positions from random games, with Python's answers for each."""
    cfg = PRESETS[name].game
    rng = np.random.default_rng(seed)
    cases = []
    while len(cases) < positions:
        s = State.initial(cfg)
        while True:
            cases.append(s)
            if s.is_terminal():
                break
            s = s.apply(int(rng.choice(s.legal_actions())))
    cases = cases[:positions]

    out = []
    planes = np.stack([s.encode() for s in cases])
    if net is not None:
        with torch.no_grad():
            logits, values = net(torch.from_numpy(planes))
        logits, values = logits.numpy(), values.numpy()
    for i, s in enumerate(cases):
        w = s.winner()
        case = {
            "board": s.board.tolist(),
            "toPlay": s.to_play,
            "captures": s.captures,
            "ply": s.ply,
            "legal": sorted(int(a) for a in s.legal_actions()),
            "winner": None if w is None else ("draw" if w == DRAW else int(w)),
            "planes": planes[i].ravel().tolist(),
        }
        if net is not None and w is None:
            case["logits"] = logits[i][s.legal_actions()].tolist()  # only legal moves matter
            case["value"] = float(values[i])
        out.append(case)
    return {"preset": name, "cases": out}


def fourrow_fixtures(net, positions: int = 200, seed: int = 0) -> dict:
    """Random positions from random four-in-a-row games, with Python's answers for each."""
    cfg = FOURROW_PRESETS["fourrow"].game
    rng = np.random.default_rng(seed)
    cases = []
    while len(cases) < positions:
        s = FourRowState.initial(cfg)
        while True:
            cases.append(s)
            if s.is_terminal():
                break
            s = s.apply(int(rng.choice(s.legal_actions())))
    cases = cases[:positions]

    planes = np.stack([s.encode() for s in cases])
    if net is not None:
        with torch.no_grad():
            logits, values = net(torch.from_numpy(planes))
        logits, values = logits.numpy(), values.numpy()
    out = []
    for i, s in enumerate(cases):
        w = s.winner()
        case = {
            "grid": s.grid.ravel().tolist(),
            "toPlay": s.to_play,
            "ply": s.ply,
            "last": -1 if s.last is None else s.last[0] * cfg.cols + s.last[1],
            "legal": [int(a) for a in s.legal_actions()],
            "winner": None if w is None else ("draw" if w == DRAW else int(w)),
            "winningCells": sorted({r * cfg.cols + c for r, c in s.winning_cells()}) if w not in (None, DRAW) else [],
            "planes": planes[i].ravel().tolist(),
        }
        if net is not None and w is None:
            case["logits"] = logits[i][s.legal_actions()].tolist()  # only legal moves matter
            case["value"] = float(values[i])
        out.append(case)
    return {"preset": "fourrow", "cases": out}


def export_fourrow() -> None:
    cfg = FOURROW_PRESETS["fourrow"].game
    FOURROW_PUBLIC.mkdir(parents=True, exist_ok=True)
    net, ckpt = export_model("fourrow", cfg, FOURROW_PUBLIC / "model.onnx")
    trained = net is not None
    game = {"id": "fourrow", "rows": cfg.rows, "cols": cfg.cols, "connect": cfg.connect,
            "trained": trained, "iteration": ckpt["iteration"] if trained else 0}  # fmt: skip
    (FOURROW_PUBLIC / "game.json").write_text(json.dumps(game, indent=1))
    (FIXTURES / "fourrow.json").write_text(json.dumps(fourrow_fixtures(net)))
    print(f"{'fourrow':10s} {'network iteration ' + str(ckpt['iteration']) if trained else 'no network yet'}")


def main():
    everything = [*DISPLAY, "fourrow"]
    wanted = set(sys.argv[1:]) or set(everything)
    if unknown := wanted - set(everything):
        raise SystemExit(f"unknown preset(s) {', '.join(sorted(unknown))}; choose from {', '.join(everything)}")
    PUBLIC.mkdir(parents=True, exist_ok=True)
    FIXTURES.mkdir(parents=True, exist_ok=True)

    index_path = PUBLIC / "index.json"
    old_index = {m["id"]: m for m in json.loads(index_path.read_text())} if index_path.exists() else {}
    index = []
    for name in DISPLAY:  # display order
        if name not in wanted:
            if name in old_index:
                index.append(old_index[name])  # keep what an earlier export wrote
            continue
        folder = PUBLIC / name
        folder.mkdir(exist_ok=True)
        (folder / "game.json").write_text(json.dumps(game_json(name)))
        net, ckpt = export_model(name, PRESETS[name].game, folder / "model.onnx")
        (FIXTURES / f"{name}.json").write_text(json.dumps(fixtures(name, net)))
        trained = net is not None
        index.append({"id": name, "trained": trained, "iteration": ckpt["iteration"] if trained else 0})
        print(f"{name:10s} {'network iteration ' + str(ckpt['iteration']) if trained else 'no network yet'}")
    index_path.write_text(json.dumps(index, indent=1))

    if "fourrow" in wanted:
        export_fourrow()


if __name__ == "__main__":
    main()
