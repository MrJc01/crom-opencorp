export interface EventoBus {
  tipo: string;
  em: string;
  dados: Record<string, unknown>;
}

type Ouvinte = (evento: EventoBus) => void;

export class EventBus {
  private readonly ouvintes = new Map<Ouvinte, true>();

  on(ouvinte: Ouvinte): () => void {
    this.ouvintes.set(ouvinte, true);
    return () => this.off(ouvinte);
  }

  off(ouvinte: Ouvinte): void {
    this.ouvintes.delete(ouvinte);
  }

  emit(tipo: string, dados: Record<string, unknown> = {}): void {
    const evento: EventoBus = { tipo, em: new Date().toISOString(), dados };
    for (const ouvinte of [...this.ouvintes.keys()]) {
      try {
        ouvinte(evento);
      } catch {
        continue;
      }
    }
  }
}

export const eventBus = new EventBus();
