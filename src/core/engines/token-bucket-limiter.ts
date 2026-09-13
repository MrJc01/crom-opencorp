/**
 * Token Bucket Rate Limiter para chamadas aos motores de IA.
 * 
 * Regula a vazão e amortece rajadas simultâneas (ex: crons disparando nos minutos cheios),
 * garantindo que as chamadas respeitem os limites de RPM configurados nas contas.
 */

export interface TokenBucketConfig {
  rpmPadrao?: number;
  capacidadeBurst?: number;
}

export class TokenBucketLimiter {
  private baldes = new Map<
    string,
    {
      tokens: number;
      capacidade: number;
      taxaPorMs: number;
      ultimoRefill: number;
      fila: Array<() => void>;
    }
  >();

  private rpmPadrao: number;

  constructor(opts: TokenBucketConfig = {}) {
    this.rpmPadrao = opts.rpmPadrao ?? 60;
  }

  private obterBalde(chave: string, rpm?: number) {
    let balde = this.baldes.get(chave);
    const rpmEfetivo = Math.max(rpm ?? this.rpmPadrao, 1);
    const taxaPorMs = rpmEfetivo / 60_000;
    const capacidade = Math.max(Math.ceil(rpmEfetivo / 4), 2); // Capacidade de burst (~15s de RPM)

    if (!balde) {
      balde = {
        tokens: capacidade,
        capacidade,
        taxaPorMs,
        ultimoRefill: Date.now(),
        fila: [],
      };
      this.baldes.set(chave, balde);
    } else {
      balde.capacidade = capacidade;
      balde.taxaPorMs = taxaPorMs;
    }
    return balde;
  }

  private refill(balde: ReturnType<typeof this.obterBalde>) {
    const agora = Date.now();
    const decorridoMs = agora - balde.ultimoRefill;
    if (decorridoMs > 0) {
      const novosTokens = decorridoMs * balde.taxaPorMs;
      balde.tokens = Math.min(balde.capacidade, balde.tokens + novosTokens);
      balde.ultimoRefill = agora;
    }
  }

  /**
   * Adquire 1 token para efetuar chamada à LLM.
   * Se não houver tokens disponíveis, aguarda assincronamente até que o balde receba refill.
   */
  async adquirirToken(chave: string, rpm?: number, timeoutMs = 30_000): Promise<void> {
    const balde = this.obterBalde(chave, rpm);
    this.refill(balde);

    if (balde.tokens >= 1) {
      balde.tokens -= 1;
      return;
    }

    return new Promise<void>((resolve) => {
      let timer: NodeJS.Timeout | undefined;

      const tentarDesbloquear = () => {
        this.refill(balde);
        if (balde.tokens >= 1) {
          balde.tokens -= 1;
          if (timer) clearTimeout(timer);
          resolve();
        } else {
          const tempoAteToken = Math.max(Math.ceil((1 - balde.tokens) / balde.taxaPorMs), 50);
          setTimeout(tentarDesbloquear, Math.min(tempoAteToken, 500));
        }
      };

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          const idx = balde.fila.indexOf(tentarDesbloquear);
          if (idx !== -1) balde.fila.splice(idx, 1);
          resolve(); // Degrada graciosamente em caso de timeout em vez de travar
        }, timeoutMs);
      }

      balde.fila.push(tentarDesbloquear);
      const tempoEspera = Math.max(Math.ceil((1 - balde.tokens) / balde.taxaPorMs), 50);
      setTimeout(tentarDesbloquear, Math.min(tempoEspera, 500));
    });
  }

  /**
   * Retorna estatísticas de uso de um balde.
   */
  status(chave: string) {
    const balde = this.baldes.get(chave);
    if (!balde) return null;
    this.refill(balde);
    return {
      tokensDisponiveis: balde.tokens,
      capacidade: balde.capacidade,
      emFila: balde.fila.length,
    };
  }

  /**
   * Limpa o estado de todos os baldes (útil para testes).
   */
  reset() {
    this.baldes.clear();
  }
}

export const tokenBucketGlobal = new TokenBucketLimiter();
