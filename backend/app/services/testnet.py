"""Titles for testnet outcomes (Milestone 27.7b).

Testnet uses the same templates, questions and Recurring markets as
mainnet, so its outcomes go through the same normalize_markets as the
main market list: Hyperliquid's approved template wording, parent
question titles ("Draw — Chinese Super League: Shanghai Port FC v
Beijing Guoan FC") and template side names, instead of a second
labelling scheme to keep in sync.

One testnet-only case: older outcomes with plain names ("Exactly
4.3%", "France") and no template. The shared pipeline would title them
with their long rules sentence, so they keep their own name, joined
with their question's name when that is readable too.
"""

from typing import Any

from app.models.testnet import TestnetOutcome
from app.services.normalize import (
    FALLBACK_OUTCOME_NAMES,
    MarketData,
    index_templates,
    normalize_markets,
    questions_by_outcome,
)

# Hyperliquid's own markets, handled by the shared pipeline.
SPECIAL_NAMES = frozenset({"Recurring", "Recurring Named Outcome", *FALLBACK_OUTCOME_NAMES})


def _is_plain(name: str) -> bool:
    return name != "" and not name.startswith("template") and name not in SPECIAL_NAMES


def testnet_outcomes(meta: dict[str, Any], templates: list[dict[str, Any]]) -> list[TestnetOutcome]:
    markets = normalize_markets(MarketData(meta=meta, templates=index_templates(templates)))
    questions = questions_by_outcome(meta)
    rows: list[TestnetOutcome] = []
    for market in markets:
        title = market.question
        if _is_plain(market.name):
            question = questions.get(int(market.id))
            question_name = str(question.get("name", "")) if question is not None else ""
            title = f"{market.name} — {question_name}" if _is_plain(question_name) else market.name
        rows.append(TestnetOutcome(
            id=market.id,
            title=title,
            sides=[side.label for side in market.sides],
            payout=market.payout,
        ))
    return rows