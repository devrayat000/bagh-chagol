"""All presets of all games, by name. A new game adds its PRESETS dict here."""

from bagh.config import PRESETS as BAGH_PRESETS
from core.config import Preset, with_overrides
from fourrow.config import PRESETS as FOURROW_PRESETS

PRESETS: dict[str, Preset] = {**BAGH_PRESETS, **FOURROW_PRESETS}


def get_preset(name: str, **train_overrides) -> Preset:
    if name not in PRESETS:
        raise SystemExit(f"unknown preset {name!r}; choose from {', '.join(PRESETS)}")
    return with_overrides(PRESETS[name], **train_overrides)
