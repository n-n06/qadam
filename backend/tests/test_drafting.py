from app.services.drafting import PlaceholderDrafter, SegmentIn

PEOPLE = ["Алия", "Ерлан", "Айгерим"]


def test_mock_meeting_gives_one_draft_and_skips_notifications():
    segs = [
        SegmentIn(4, "Алия", "Давайте в этот спринт добавим выгрузку недельного отчёта в Excel."),
        SegmentIn(6, "Ерлан", "Хорошо. Пусть сделает Айгерим, срок — пятница."),
        SegmentIn(7, "Айгерим", "Готово, когда руководитель скачивает файл. Внутри дата, статус и исполнитель."),
        SegmentIn(11, "Ерлан", "И когда-нибудь надо подумать про уведомления. Пока без решения."),
    ]
    result = PlaceholderDrafter().generate(segs, PEOPLE)
    assert len(result.drafts) == 1
    draft = result.drafts[0]
    assert draft.assignee_name == "Айгерим" and draft.due_text == "пятница"
    assert len(draft.acceptance_criteria) == 2
    assert result.skipped == ["уведомления"]


def test_never_invents_assignee_or_due_date():  # F5 AC2
    result = PlaceholderDrafter().generate([SegmentIn(0, None, "Нужно обновить документацию по API.")], PEOPLE)
    assert len(result.drafts) == 1
    assert result.drafts[0].assignee_name is None and result.drafts[0].due_text is None
