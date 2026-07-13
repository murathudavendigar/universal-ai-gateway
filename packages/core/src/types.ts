export type TaskType =
  | "chat"
  | "documentation"
  | "coding"
  | "review"
  | "reasoning";

export interface RouteRequest {
  task: TaskType;
}
