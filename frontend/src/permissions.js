// Mirrors the ownership rules in backend/app/routers/{tasks,meetings}.py - for hiding controls only;
// the API is what actually enforces them.

export const canEditTask = (me, can, task) =>
  can("tasks.update") || (can("tasks.update_own") && [task.assignee_id, task.created_by_id].includes(me.id));

export const canManageMeeting = (me, can, meeting) =>
  can("meetings.manage") || (can("meetings.manage_own") && meeting.created_by_id === me.id);
