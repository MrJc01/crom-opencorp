export interface StreamCallbacks {
  onInicio?: (payload: { sessao_id?: string; agente?: string; modelo?: string; motor?: string }) => void;
  onDelta?: (delta: string, payload?: any) => void;
  onPensamento?: (pensamento: string, payload?: any) => void;
  onPassos?: (passos: any[]) => void;
  onAcao?: (acoes: number, itens: any[]) => void;
  onStatus?: (payload: any) => void;
  onFim?: (payload: any) => void;
  onErro?: (erro: string, payload?: any) => void;
}

/**
 * Lê e processa SSE (Server-Sent Events) de streams do Secretário.
 */
export async function consumirStreamSse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";

  while (true) {
    if (signal?.aborted) {
      await reader.cancel().catch(() => {});
      break;
    }

    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const linhas = buffer.split("\n");
    buffer = linhas.pop() ?? "";

    for (const linha of linhas) {
      const trimmed = linha.trim();

      if (trimmed.startsWith("event: ")) {
        currentEvent = trimmed.slice(7).trim();
        continue;
      }

      if (!trimmed.startsWith("data: ")) {
        if (trimmed === "") currentEvent = "";
        continue;
      }

      const jsonStr = trimmed.slice(6).trim();
      if (jsonStr === "[DONE]") continue;

      try {
        const payload = JSON.parse(jsonStr);
        const evtType = currentEvent || payload.tipo || "";

        switch (evtType) {
          case "inicio":
            callbacks.onInicio?.(payload);
            break;
          case "delta":
            callbacks.onDelta?.(payload.delta || payload.texto || "", payload);
            break;
          case "pensamento":
            callbacks.onPensamento?.(payload.delta || payload.pensamento || payload.texto || "", payload);
            break;
          case "passos":
            if (Array.isArray(payload.passos)) {
              callbacks.onPassos?.(payload.passos);
            }
            break;
          case "acao":
            callbacks.onAcao?.(payload.acoes ?? 0, payload.itens ?? []);
            break;
          case "status":
          case "fallback_modelo":
            callbacks.onStatus?.(payload);
            break;
          case "fim":
            callbacks.onFim?.(payload);
            break;
          case "erro":
            callbacks.onErro?.(payload.erro || "Erro no stream", payload);
            break;
          default:
            if (payload.delta) callbacks.onDelta?.(payload.delta, payload);
            break;
        }
      } catch {}
    }
  }
}
