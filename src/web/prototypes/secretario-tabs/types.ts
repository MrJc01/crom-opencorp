export type PrototypeVariantId = "1" | "2" | "3" | "4";

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

export interface PrototypeMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content?: string; // Para mensagens do usuário
  parts?: MessagePart[]; // Para mensagens do assistente em stream intercalado
  timestamp: string;
}

export interface SimulationState {
  currentStep: "idle" | "typing" | "sending" | "thinking_1" | "explaining_1" | "tool_1" | "thinking_2" | "tool_2" | "thinking_3" | "final_response" | "completed";
  inputText: string;
  cursorVisible: boolean;
  progressPercent: number;
  isPaused: boolean;
}
