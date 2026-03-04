declare module 'expo-live-activity' {
  export function startActivity(options: {
    data: Record<string, unknown>;
    state: Record<string, unknown>;
  }): Promise<string>;

  export function updateActivity(activityId: string, options: { state: Record<string, unknown> }): Promise<void>;

  export function endActivity(activityId: string): Promise<void>;
}
