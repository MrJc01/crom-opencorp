export type MessagePart =
  | {
      type: "reasoning";
      id: string;
      title: string;
      thoughts: string[];
      durationSeconds: number;
      completed: boolean;
    }
  | {
      type: "text";
      id: string;
      content: string;
    }
  | {
      type: "tool";
      id: string;
      tool: string;
      command: string;
      status: "executing" | "success" | "error";
      durationMs: number;
      exitCode: number;
      output: string;
    };

export interface TabSession {
  id: string;
  title: string;
  active: boolean;
  unread?: boolean;
  agent?: string;
  model?: string;
  tokensTotal?: number;
  costEstimate?: string;
  updatedAt?: string;
}

export interface SecretarioMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content?: string;
  parts?: MessagePart[];
  timestamp: string;
}
