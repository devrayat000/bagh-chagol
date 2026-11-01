"""The AlphaZero training loop.

    repeat:
      1. self-play  : the current best net + MCTS plays games against itself
      2. train      : fit the net to (pi, z) from recent games
                      loss = cross_entropy(pi, policy) + (z - value)^2   (+ weight decay)
      3. arena      : new net vs best net; promote the new one if it scores >= threshold
      4. evaluate   : vs the game's greedy baseline (and vs perfect play when the game is solvable)

Checkpoints and a CSV log go to checkpoints/<preset>/.
"""

from __future__ import annotations

import copy
import csv
import math
import random
import time
from collections import deque
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

from .config import Preset
from .mcts import MCTS, MCTSAgent
from .net import NetEvaluator, build_net, default_device, load_checkpoint, save_checkpoint
from .parallel import SelfPlayPool
from .selfplay import format_results, play_match, score, self_play
from .spec import spec_of
from .symmetry import transform_batch

CHECKPOINT_DIR = Path("checkpoints")


def train(preset_name: str, preset: Preset, resume: bool = False, seed: int = 0) -> None:
    game, tc = preset.game, preset.train
    spec = spec_of(game)
    side0, side1 = spec.side_names
    device = default_device()
    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    random.seed(seed)
    out_dir = CHECKPOINT_DIR / preset_name
    print(f"device: {device}" + (f" ({torch.cuda.get_device_name(device)})" if device.type == "cuda" else ""))
    print(f"game: {game}\ntrain: {tc}")

    start_iter = 1
    if resume and (out_dir / "latest.pt").exists():
        net, ckpt = load_checkpoint(out_dir / "latest.pt", device)
        best, _ = load_checkpoint(out_dir / "best.pt", device)
        start_iter = ckpt["iteration"] + 1
        print(f"resumed from iteration {ckpt['iteration']}")
    else:
        net = build_net(game, tc).to(device)
        best = copy.deepcopy(net)
        save_checkpoint(out_dir / "best.pt", best, preset_name, 0)
    print(f"network parameters: {sum(p.numel() for p in net.parameters()):,}")

    opt = torch.optim.Adam(net.parameters(), lr=tc.lr, weight_decay=tc.weight_decay)
    use_amp = device.type == "cuda"
    scaler = torch.amp.GradScaler(device.type, enabled=use_amp)
    buffer: deque = deque(maxlen=tc.buffer_size)
    syms = spec.symmetries

    perfect_test = None
    if spec.perfect_positions:  # small enough to solve exactly: measure against perfect play
        perfect_test = spec.perfect_positions(1000, seed)

    last_iter = start_iter + tc.iterations - 1

    def learning_rate(it: int) -> float:
        """Constant, or a cosine glide from lr to lr_final: big steps early, fine-tuning at the end."""
        if tc.lr_final is None or last_iter == start_iter:
            return tc.lr
        p = (it - start_iter) / (last_iter - start_iter)
        return tc.lr_final + (tc.lr - tc.lr_final) * 0.5 * (1 + math.cos(math.pi * p))

    pool = SelfPlayPool(preset, tc.workers, device) if tc.workers > 0 else None
    if pool:
        print(f"self-play in {tc.workers} worker processes")

    def make_mcts(model, sims):
        return MCTS(NetEvaluator(model, device), sims, tc.c_puct, tc.dirichlet_alpha, tc.dirichlet_eps,
                    seed=int(rng.integers(1 << 31)))  # fmt: skip

    log_path = out_dir / "log.csv"
    new_log = not (resume and log_path.exists())
    with open(log_path, "w" if new_log else "a", newline="") as log_file:
        log = csv.writer(log_file)
        if new_log:
            log.writerow(["iter", "positions", "selfplay", "loss_policy", "loss_value", "arena_score", "promoted",
                          f"{side0}_vs_greedy", f"{side1}_vs_greedy", "perfect_move_acc", "seconds"])  # fmt: skip

        for it in range(start_iter, start_iter + tc.iterations):
            t0 = time.time()

            # 1. Self-play with the best network.
            if pool:
                samples, sp_results = pool.play(best, tc.games_per_iter, rng)
            else:
                samples, sp_results = self_play(make_mcts(best, tc.sims), game, tc.games_per_iter, tc.temp_plies, rng,
                                                tc.q_weight)  # fmt: skip
            buffer.extend(samples)

            # 2. Train the candidate network on the replay buffer.
            for group in opt.param_groups:
                group["lr"] = learning_rate(it)
            net.train()
            loss_p_sum = loss_v_sum = 0.0
            steps = tc.train_steps if len(buffer) >= tc.batch_size else 0
            for _ in range(steps):
                batch = random.sample(buffer, tc.batch_size)
                planes = torch.from_numpy(np.stack([b[0] for b in batch])).to(device)
                pi = torch.from_numpy(np.stack([b[1] for b in batch])).to(device)
                z = torch.tensor([b[2] for b in batch], dtype=torch.float32, device=device)
                planes, pi = transform_batch(planes, pi, syms[random.randrange(len(syms))])  # augmentation

                with torch.autocast(device.type, dtype=torch.float16, enabled=use_amp):
                    logits, value = net(planes)
                    loss_p = -(pi * F.log_softmax(logits.float(), dim=1)).sum(1).mean()
                    loss_v = F.mse_loss(value.float(), z)
                    loss = loss_p + loss_v
                opt.zero_grad(set_to_none=True)
                scaler.scale(loss).backward()
                scaler.step(opt)
                scaler.update()
                loss_p_sum += loss_p.item()
                loss_v_sum += loss_v.item()
            net.eval()
            loss_p_avg = loss_p_sum / max(steps, 1)
            loss_v_avg = loss_v_sum / max(steps, 1)

            # 3. Arena: does the new net beat the current best?
            if tc.arena_games > 0:
                half = tc.arena_games // 2
                new_agent = MCTSAgent(make_mcts(net, tc.arena_sims), temperature=1.0, temp_plies=4,
                                      seed=int(rng.integers(1 << 31)))  # fmt: skip
                best_agent = MCTSAgent(make_mcts(best, tc.arena_sims), temperature=1.0, temp_plies=4,
                                       seed=int(rng.integers(1 << 31)))  # fmt: skip
                as_first = play_match(new_agent, best_agent, game, half)
                as_second = play_match(best_agent, new_agent, game, half)
                arena = (score(as_first, 0) + score(as_second, 1)) / 2
                promoted = arena >= tc.arena_threshold
            else:
                arena, promoted = float("nan"), True
            if promoted:
                best.load_state_dict(net.state_dict())
                save_checkpoint(out_dir / "best.pt", best, preset_name, it)
            save_checkpoint(out_dir / "latest.pt", net, preset_name, it)

            # 4. Every few iterations: evaluate the best net vs the greedy baseline, playing each side.
            evaluated = it % tc.eval_every == 0 or it == start_iter + tc.iterations - 1
            eval_text, score0, score1 = "", "", ""
            if evaluated:
                agent = MCTSAgent(make_mcts(best, tc.arena_sims))
                vs_g0 = play_match(agent, spec.make_greedy(it), game, tc.eval_games)
                vs_g1 = play_match(spec.make_greedy(it), agent, game, tc.eval_games)
                score0, score1 = f"{score(vs_g0, 0):.3f}", f"{score(vs_g1, 1):.3f}"
                eval_text = (f" | as {side0} vs greedy {format_results(vs_g0, spec.letters)},"
                             f" as {side1} vs greedy {format_results(vs_g1, spec.letters)}")  # fmt: skip
            acc = perfect_move_accuracy(best, device, perfect_test) if perfect_test else float("nan")

            secs = time.time() - t0
            print(
                f"[{it:3d}] buf={len(buffer):6d} selfplay={format_results(sp_results, spec.letters)} "
                f"loss_p={loss_p_avg:.3f} loss_v={loss_v_avg:.3f}"
                + (f" arena={arena:.2f}{' *promoted*' if promoted else ''}" if tc.arena_games else "")
                + eval_text
                + (f" | perfect-move acc {acc:.1%}" if perfect_test else "")
                + f" | {secs:.0f}s",
                flush=True,
            )
            log.writerow([it, len(buffer), format_results(sp_results, spec.letters), f"{loss_p_avg:.4f}", f"{loss_v_avg:.4f}",
                          f"{arena:.3f}", int(promoted), score0, score1, f"{acc:.4f}", f"{secs:.1f}"])  # fmt: skip
            log_file.flush()

    if pool:
        pool.close()
    print(f"done. best network: {out_dir / 'best.pt'}")


def perfect_move_accuracy(net, device, test_set) -> float:
    """Fraction of decisive positions where the raw network's top move is a perfect move (no search)."""
    evaluator = NetEvaluator(net, device)
    states = [s for s, _ in test_set]
    hits = 0
    for i in range(0, len(states), 512):
        priors, _ = evaluator(states[i : i + 512])
        for s, p, (_, optimal) in zip(states[i : i + 512], priors, test_set[i : i + 512]):
            hits += int(s.legal_actions()[int(np.argmax(p))]) in optimal
    return hits / len(states)
