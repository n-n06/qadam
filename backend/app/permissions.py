"""Role-based access control (F7). The only place that says which role may do what.

Roles are cumulative: lead can do everything a member can, admin everything a lead can.
Ownership rules ("a member may edit tasks assigned to them") live next to the endpoints that need them
and are expressed with the `*_own` permissions below.
"""
from typing import Literal

Role = Literal["admin", "lead", "member"]
ROLES: tuple[Role, ...] = ("admin", "lead", "member")
ROLE_LABEL = {"admin": "Администратор", "lead": "Руководитель", "member": "Участник"}

_MEMBER = {
    "users.read",
    "meetings.read",
    "meetings.create",
    "meetings.manage_own",  # upload audio / transcript, reprocess, end the call - for meetings you created
    "calls.join",
    "drafts.read",
    "tasks.read",
    "tasks.create",
    "tasks.update_own",  # tasks assigned to you or created by you
}
_LEAD = _MEMBER | {
    "meetings.manage",  # same as above, for any meeting
    "drafts.review",  # edit / approve / reject AI drafts (F6)
    "tasks.update",  # any task
}
_ADMIN = _LEAD | {
    "users.manage",  # create users, change roles, deactivate, reset passwords
}

PERMISSIONS: dict[str, frozenset[str]] = {
    "member": frozenset(_MEMBER),
    "lead": frozenset(_LEAD),
    "admin": frozenset(_ADMIN),
}


def permissions_for(role: str) -> frozenset[str]:
    return PERMISSIONS.get(role, frozenset())


def has_permission(role: str, permission: str) -> bool:
    return permission in permissions_for(role)
