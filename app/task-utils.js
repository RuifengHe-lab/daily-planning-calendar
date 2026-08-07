export function updateTaskText(tasks, id, text) {
  return tasks.map((task) => (task.id === id ? { ...task, text } : task));
}
