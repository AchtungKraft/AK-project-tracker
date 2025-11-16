import React from "react";
import TasksExplorerLayout from "../components/tasks/TasksExplorerLayout";

export default function TasksExplorer() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-3 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">
            TASKS
          </h1>
          <p className="text-sm text-gray-400">Navigate and manage tasks by project and category</p>
        </div>

        <TasksExplorerLayout />
      </div>
    </div>
  );
}