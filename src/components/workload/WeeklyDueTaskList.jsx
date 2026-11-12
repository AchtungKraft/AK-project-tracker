import React, { useMemo } from "react";
import { groupTasksByWeek, weekTitle } from "@/lib/weeklyDueGrouping";
import WeeklyDueSection from "./WeeklyDueSection";

/**
 * WEEKLY DUE body: Week (Mon–Sun) → Phase → tasks by due date.
 * Tasks come pre-filtered from the Workload view; rows are rendered by the
 * Workload's own renderTaskRow, so every inline action is the same.
 */
export default function WeeklyDueTaskList({ tasks, buckets, renderTaskRow }) {
  const sections = useMemo(() => {
    const { weeks, unscheduled } = groupTasksByWeek(tasks);
    const list = weeks.map(w => ({ key: w.key, title: weekTitle(w), tasks: w.tasks }));
    if (unscheduled.length > 0) list.push({ key: "unscheduled", title: "Unscheduled / No Due Date", tasks: unscheduled });
    return list;
  }, [tasks]);

  return (
    <div>
      {sections.map(s => (
        <WeeklyDueSection key={s.key} title={s.title} tasks={s.tasks} buckets={buckets} renderTaskRow={renderTaskRow} />
      ))}
    </div>
  );
}