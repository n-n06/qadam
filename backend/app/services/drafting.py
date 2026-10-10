"""NLP step: transcript -> draft tasks.

The real implementation (LLM prompt + parser, tasks T5 / N6) is NOT done yet. This module defines the
contract the rest of the app depends on (`DraftGenerator`) plus a deliberately dumb regex
`PlaceholderDrafter`, so the whole loop call -> transcript -> review -> backlog can be exercised end to end.

To plug in the real thing: implement `DraftGenerator.generate`, then return it from `get_drafter()`.

Contract rules (A2, F5):
  * AC1: one draft per clearly stated action item.
  * AC2: never invent an assignee or a due date -> leave `assignee_name` / `due_text` as None.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional, Protocol, Sequence


@dataclass
class SegmentIn:
    start_sec: float
    speaker: Optional[str]
    text: str


@dataclass
class DraftProposal:
    title: str
    description: str = ""
    acceptance_criteria: list[str] = field(default_factory=list)
    assignee_name: Optional[str] = None  # must be one of `known_people` or None
    due_text: Optional[str] = None
    source_quote: str = ""


@dataclass
class DraftingResult:
    summary: str = ""
    drafts: list[DraftProposal] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)  # topics discussed but not decided


class DraftGenerator(Protocol):
    def generate(self, segments: Sequence[SegmentIn], known_people: Sequence[str]) -> DraftingResult: ...


class NoopDrafter:
    def generate(self, segments, known_people) -> DraftingResult:
        return DraftingResult()


# ---------------------------------------------------------------- placeholder (regex, ru + en)
_PROPOSE = re.compile(r"\b(давайте|надо|нужно|необходимо|добавим|сделаем|let\x27s|we need to|we should)\b", re.I)
_OWNER = re.compile(r"\b(сделает|возьмёт|возьмет|займётся|займется|will do|will take)\b", re.I)
_HEDGE = re.compile(r"когда-нибудь|без решения|потом решим|someday|maybe|not decided", re.I)
_DONE_WHEN = re.compile(r"^(?:готово|done|принято)[,:]?\s*(?:когда|when)\s+(.*)$", re.I)
_TOPIC = re.compile(r"\b(?:про|about)\s+(.+?)[.!?]*$", re.I)
_DUE = re.compile(
    r"\b(сегодня|завтра|послезавтра|понедельник\w*|вторник\w*|сред[уаы]|четверг\w*|пятниц\w*|суббот\w*"
    r"|воскресень\w*|на следующей неделе|до конца (?:недели|месяца)|today|tomorrow|next week"
    r"|(?:next )?(?:monday|tuesday|wednesday|thursday|friday))\b",
    re.I,
)


def _cap(s: str) -> str:
    return s[:1].upper() + s[1:]


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s.strip()]


def _title(sentence: str) -> str:
    t = re.sub(r"\bв этот спринт\b", "", sentence, flags=re.I)
    t = re.sub(r"\s{2,}", " ", t).strip()
    t = re.sub(r"^(?:и|а|ну|тогда)\s+", "", t, flags=re.I)
    t = re.sub(r"^(?:давайте|надо|нужно|необходимо|let\x27s|we need to|we should)\s+", "", t, flags=re.I)
    return _cap(t.strip(" .!?,;—-"))


def _find_person(sentence: str, people: Sequence[str]) -> Optional[str]:
    for name in people:
        stem = name[: max(3, len(name) - 2)]  # crude handling of Russian case endings
        if re.search(r"\b" + re.escape(stem), sentence, re.I):
            return name
    return None


class PlaceholderDrafter:
    """Keyword heuristics. NOT the product\x27s NLP -- exists so the pipeline can be demoed and tested."""

    def generate(self, segments: Sequence[SegmentIn], known_people: Sequence[str]) -> DraftingResult:
        result = DraftingResult()
        current: Optional[DraftProposal] = None

        def apply_attrs(draft: DraftProposal, sentence: str) -> None:
            person = _find_person(sentence, known_people)
            due = _DUE.search(sentence)
            if person:
                draft.assignee_name = person
                draft.source_quote = sentence
            if due:
                draft.due_text = due.group(1).lower()
                draft.source_quote = sentence

        for seg in segments:
            collecting_criteria = False
            for sent in _sentences(seg.text):
                if _HEDGE.search(sent):
                    topic = _TOPIC.search(sent)
                    if topic:
                        result.skipped.append(topic.group(1).strip())
                    current, collecting_criteria = None, False
                    continue
                done_when = _DONE_WHEN.match(sent)
                if done_when and current:
                    current.acceptance_criteria.append(_cap(done_when.group(1).strip()))
                    collecting_criteria = True
                    continue
                if collecting_criteria and current:
                    current.acceptance_criteria.append(_cap(sent))
                    continue
                if _PROPOSE.search(sent) and not _OWNER.search(sent):
                    current = DraftProposal(title=_title(sent), description=sent, source_quote=sent)
                    apply_attrs(current, sent)
                    result.drafts.append(current)
                elif _OWNER.search(sent) and current:
                    apply_attrs(current, sent)

        if result.drafts:
            parts = []
            for d in result.drafts:
                extra = ", ".join(x for x in (d.assignee_name and f"исполнитель — {d.assignee_name}", d.due_text and f"срок — {d.due_text}") if x)
                parts.append(f"«{d.title}»" + (f" ({extra})" if extra else ""))
            result.summary = f"Предложено задач: {len(result.drafts)}. " + "; ".join(parts) + "."
        return result


def get_drafter(kind: str) -> DraftGenerator:
    if kind == "none":
        return NoopDrafter()
    # TODO(N6): return LlmDrafter() once the prompt + parser from T5 are productionised.
    return PlaceholderDrafter()
