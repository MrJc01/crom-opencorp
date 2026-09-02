<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { get } from "svelte/store";
  import {
    sessoesStore,
    sessaoAtivaIdStore,
    mensagensStore,
    agenteSelecionadoStore,
    carregandoStore,
    buscaStore,
    anexosStore,
    acoesEmAndamentoStore,
    hitlPendentesStore,
    statusSecretarioStore,
    erroCarregamentoStore,
    decorridoSegundosStore,
    abaAtivaStore,
    pertoDoFundoStore,
    gruposSessoesStore,
    sessoesFiltradasStore,
    carregarStatus,
    carregarHitlPendentes,
    aprovarHitl,
    rejeitarHitl,
    selecionarSessao,
    novaConversa,
    iniciarSecretario,
    enviarMensagem,
    adicionarAnexos,
    removerAnexo,
    copiarMensagem,
    editarMensagem,
    inicializarSecretario,
  } from "../stores/secretario.svelte.js";
  import { getRascunho, setRascunho } from "../rascunho.js";
  import { renderMarkdown } from "../md.js";
  import { escapeHtml } from "../format.js";
  import { icone } from "../icons.js";
  import { ajuda } from "../help.js";
  import { gatilhoComposer, paletteTecla } from "../palette.js";
  import { abrirChatLateral } from "../chat-lateral.js";
  import { tituloSessao, tempoRelativo, dataSessao } from "../sessoes-utils.js";

  let { abaInicial = "conversa" as "conversa" | "reunioes" } = $props();

  // local state
  let inputValor = $state(getRascunho());
  let feedEl: HTMLDivElement | null = $state(null);
  let textareaEl: HTMLTextAreaElement | null = $state(null);
  let fileInputEl: HTMLInputElement | null = $state(null);

  // subscribe to stores via $derived reactivity (Svelte 5)
  let sessoes: any[] = $state([]);
  let sessaoAtivaId: string | null = $state(null);
  let mensagens: any[] = $state([]);
  let agenteSelecionado: "secretario" | "secretario-exec" = $state("secretario-exec");
  let carregando = $state(false);
  let busca = $state("");
  let anexos: any[] = $state([]);
  let acoesEmAndamento = $state(0);
  let hitlPendentes: any[] = $state([]);
  let statusSecretario: any = $state(null);
  let erroCarregamento: string | null = $state(null);
  let decorridoSegundos = $state(0);
  let abaAtiva: "conversa" | "reunioes" = $state("conversa");
  let pertoDoFundo = $state(true);
  let grupos: Array<{ grupo: string; itens: any[] }> = $state([]);

  let unsubs: Array<() => void> = [];

  const SUGESTOES = [
    "O que aconteceu hoje?",
    "Como está o board?",
    "Rodar linha ceo-analise-board",
    "Qual meu custo hoje?",
  ];
  const FOLLOWUPS = ["Detalhe o 1º ponto", "E o que faço agora?"];
  const CAPACIDADES = [
    "Mantém o contexto da conversa atual",
    "Consulta tasks, custos, fluxos e agenda",
    "Entende comandos / e terminal !",
    "Analisa imagens e arquivos anexados 📎",
  ];
  const LIMITACOES = [
    "Pode cometer erros sobre os dados da empresa",
    "secretário analisa; só o secretário-exec executa ações",
    "Vê apenas o workspace ativo no momento",
  ];

  let decorridoFmt = $derived(`${Math.floor(decorridoSegundos / 60)}:${String(decorridoSegundos % 60).padStart(2, "0")}`);

  function autoAltura(ta: HTMLTextAreaElement) {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 150) + "px";
  }

  function onInputValor(v: string) {
    inputValor = v;
    setRascunho(v);
    if (textareaEl) autoAltura(textareaEl);
  }

  function onScrollFeed() {
    if (!feedEl) return;
    const val = feedEl.scrollHeight - feedEl.scrollTop - feedEl.clientHeight < 80;
    pertoDoFundoStore.set(val);
  }

  function irFim() {
    if (feedEl) feedEl.scrollTop = feedEl.scrollHeight;
  }

  $effect(() => {
    const _len = mensagens.length;
    const _c = mensagens[_len - 1]?.content;
    const _p = mensagens[_len - 1]?.pensamento;
    void tick().then(() => {
      if (pertoDoFundo && feedEl) feedEl.scrollTop = feedEl.scrollHeight;
    });
  });

  onMount(async () => {
    // subscribe stores
    unsubs.push(sessoesStore.subscribe((v) => (sessoes = v)));
    unsubs.push(sessaoAtivaIdStore.subscribe((v) => (sessaoAtivaId = v)));
    unsubs.push(mensagensStore.subscribe((v) => (mensagens = v)));
    unsubs.push(agenteSelecionadoStore.subscribe((v) => (agenteSelecionado = v)));
    unsubs.push(carregandoStore.subscribe((v) => (carregando = v)));
    unsubs.push(buscaStore.subscribe((v) => (busca = v)));
    unsubs.push(anexosStore.subscribe((v) => (anexos = v)));
    unsubs.push(acoesEmAndamentoStore.subscribe((v) => (acoesEmAndamento = v)));
    unsubs.push(hitlPendentesStore.subscribe((v) => (hitlPendentes = v)));
    unsubs.push(statusSecretarioStore.subscribe((v) => (statusSecretario = v)));
    unsubs.push(erroCarregamentoStore.subscribe((v) => (erroCarregamento = v)));
    unsubs.push(decorridoSegundosStore.subscribe((v) => (decorridoSegundos = v)));
    unsubs.push(abaAtivaStore.subscribe((v) => (abaAtiva = v)));
    unsubs.push(pertoDoFundoStore.subscribe((v) => (pertoDoFundo = v)));
    unsubs.push(gruposSessoesStore.subscribe((v) => (grupos = v as any)));

    abaAtivaStore.set(abaInicial as any);

    await inicializarSecretario();

    await tick();
    if (textareaEl) {
      textareaEl.value = getRascunho();
      inputValor = textareaEl.value;
      autoAltura(textareaEl);
    }

    const onPaste = (ev: ClipboardEvent) => {
      const items = Array.from(ev.clipboardData?.items ?? []).filter((i) =>
        i.type.startsWith("image/"),
      );
      if (!items.length) return;
      ev.preventDefault();
      items.forEach((item, idx) => {
        const file = item.getAsFile();
        if (!file) return;
        const nome =
          file.name && file.name !== "image.png"
            ? file.name
            : `colado-${Date.now()}${idx ? "-" + idx : ""}.png`;
        const comNome = new File([file], nome, { type: item.type });
        const dt = new DataTransfer();
        dt.items.add(comNome);
        adicionarAnexos(dt.files);
      });
    };
    textareaEl?.addEventListener("paste", onPaste as any);
    return () => textareaEl?.removeEventListener("paste", onPaste as any);
  });

  onDestroy(() => {
    unsubs.forEach((u) => u());
  });

  async function handleEnviar(forcarStop = false) {
    const texto = inputValor.trim();
    if (!texto && !forcarStop) return;
    if (carregando && !forcarStop && texto) return;
    if (carregando) {
      await enviarMensagem("");
      return;
    }
    inputValor = "";
    if (textareaEl) {
      textareaEl.value = "";
      autoAltura(textareaEl);
    }
    await enviarMensagem(texto);
    textareaEl?.focus();
  }

  function handleKeydown(ev: KeyboardEvent) {
    if (paletteTecla(ev)) return;
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      void handleEnviar();
    }
  }

  function handleComposerInput(v: string) {
    onInputValor(v);
    if (textareaEl) gatilhoComposer(v, textareaEl);
  }

  function handleSugestao(texto: string) {
    inputValor = texto;
    setRascunho(texto);
    if (textareaEl) {
      textareaEl.value = texto;
      autoAltura(textareaEl);
    }
    void handleEnviar();
  }

  function htmlImagens(imagens?: string[]): string {
    const urls = (awaitImportUrls(imagens));
    if (!urls.length) return "";
    return `<div class="oc-imagens">${urls.map((u) => `<img class="oc-img-anexo" src="${u}" alt="imagem anexada">`).join("")}</div>`;
  }

  function awaitImportUrls(imagens?: string[]): string[] {
    if (!Array.isArray(imagens)) return [];
    return imagens.filter((u) => typeof u === "string" && u.startsWith("data:image/"));
  }

  function htmlAcoes(acoes?: Array<{ tool: string; status: string; resumo?: string }>): string {
    if (!acoes || !acoes.length) return "";
    return `<div class="oc-acoes">${acoes
      .map((a) => {
        const ok = a.status === "completed";
        const falhou = a.status === "error";
        return (
          `<div class="oc-acao ${ok ? "ok" : falhou ? "erro" : "rodando"}">` +
          `<span class="oc-acao-ico" aria-hidden="true">${ok ? "✓" : falhou ? "✕" : "⚙"}</span>` +
          `<span class="oc-acao-nome">${escapeHtml(a.tool)}</span>` +
          (a.resumo ? `<span class="oc-acao-resumo">${escapeHtml(a.resumo)}</span>` : "") +
          `</div>`
        );
      })
      .join("")}</div>`;
  }

  function statusPensando(acoes?: Array<{ tool: string; status: string }>): string {
    const decorrendo = `<span class="oc-decorrendo"> (${decorridoFmt})</span>`;
    if (acoes && acoes.length) {
      const rodando = acoes.filter((a) => a.status !== "completed" && a.status !== "error").length;
      return rodando > 0
        ? `<span class="oc-pensando-texto">Trabalhando…<span class="oc-dots"><i>.</i><i>.</i><i>.</i></span>${decorrendo}</span>`
        : `<span class="oc-pensando-texto">Pensando<span class="oc-dots"><i>.</i><i>.</i><i>.</i></span>${decorrendo}</span>`;
    }
    return acoesEmAndamento > 0
      ? `<span class="oc-pensando-texto">⚙ Executando ações (${acoesEmAndamento})<span class="oc-dots"><i>.</i><i>.</i><i>.</i></span>${decorrendo}</span>`
      : `<span class="oc-pensando-texto">Pensando<span class="oc-dots"><i>.</i><i>.</i><i>.</i></span>${decorrendo}</span>`;
  }

  // Compat globals para chat-lateral
  $effect(() => {
    const g: any = window;
    g.__secretarioEnviar = (_alvo?: string, forcarStop?: boolean) => handleEnviar(!!forcarStop);
    g.__secretarioNovaConversa = () => novaConversa();
    g.__secretarioSelecionarSessao = (id: string) => selecionarSessao(id);
    g.__secretarioBusca = (v: string) => buscaStore.set(v);
    g.__secretarioSetAgente = (v: string) => agenteSelecionadoStore.set(v as any);
    g.__secretarioAnexar = () => fileInputEl?.click();
    g.__secretarioAnexos = (files: FileList) => adicionarAnexos(files);
    g.__secretarioAnexoRemover = (i: number) => removerAnexo(i);
    g.__secretarioCopyMsg = (idx: number) => copiarMensagem(idx);
    g.__secretarioEditar = (idx: number) =>
      editarMensagem(idx).then(() => {
        inputValor = getRascunho();
        if (textareaEl) {
          textareaEl.value = inputValor;
          autoAltura(textareaEl);
          textareaEl.focus();
        }
      });
    g.__composerTecla = (ev: KeyboardEvent) => handleKeydown(ev);
    g.__composerInput = (v: string) => handleComposerInput(v);
    g.__chatRascunhoInput = (v: string) => onInputValor(v);
  });
</script>

<div class="secretario-svelte-root">
  <div class="page-header">
    <div class="page-header-esq">
      <h1 class="page-header-titulo">{@html icone("chat")} Secretário</h1>
      <p class="page-header-sub">Chat da empresa · conversa e reuniões</p>
    </div>
    <div class="page-header-acoes">
      <span class="help-wrap">{@html ajuda("secretario")}</span>
      <div class="flex items-center gap-1 rounded-lg border border-zinc-700 p-1">
        <button
          class="btn {abaAtiva === 'conversa' ? '' : 'btn-ghost'} text-sm"
          onclick={() => abaAtivaStore.set("conversa")}
          aria-label="Aba Conversa">{@html icone("chat")} Conversa</button
        >
        <button
          class="btn {abaAtiva === 'reunioes' ? '' : 'btn-ghost'} text-sm"
          onclick={() => abaAtivaStore.set("reunioes")}
          aria-label="Aba Reuniões">{@html icone("reunioes")} Reuniões</button
        >
      </div>
    </div>
  </div>

  {#if abaAtiva === "reunioes"}
    <div id="sec-tab-reunioes">
      <div class="card p-6 text-center text-zinc-400 text-sm">Reuniões nesta aba — use o menu de navegação para detalhes</div>
    </div>
  {:else if !statusSecretario}
    <div class="card p-6 text-center">
      <div class="empty-icon mb-4">{@html icone("chat")}</div>
      <h2 class="text-xl font-semibold mb-2">Carregando status…</h2>
    </div>
  {:else if !statusSecretario.rodando}
    <div class="card p-8 text-center max-w-md mx-auto">
      <div class="empty-icon mb-4">{@html icone("chat")}</div>
      <h2 class="text-xl font-semibold mb-2">Secretário em standby</h2>
      <p class="text-zinc-400 mb-6">O secretário ainda não foi iniciado. Clique abaixo para começar.</p>
      <button class="btn" onclick={() => iniciarSecretario()} disabled={carregando}>
        {@html icone("run")} Iniciar secretário
      </button>
      <p class="text-zinc-500 text-sm mt-3">Pode demorar ~10s para subir o servidor.</p>
    </div>
  {:else if erroCarregamento}
    <div class="card p-6 text-center">
      <p class="text-zinc-400">Não foi possível conectar ao secretário: {erroCarregamento}</p>
      <button class="btn btn-ghost mt-3" onclick={() => carregarStatus()}>Tentar novamente</button>
    </div>
  {:else}
    <div class="secretario-grid" id="secretario-grid">
      <div class="card flex flex-col" id="secretario-chat" class:secgpt-vazio={mensagens.length === 0}>
        <div class="p-3 border-b border-zinc-800 flex items-center justify-between gap-2">
          <h3 class="font-semibold text-sm truncate" id="chat-titulo">
            {sessaoAtivaId
              ? tituloSessao(sessoes.find((s) => s.id === sessaoAtivaId) ?? { id: sessaoAtivaId } as any)
              : "Nova conversa"}
          </h3>
          <div class="flex items-center gap-2 flex-shrink-0">
            <label class="flex items-center gap-1 text-xs text-zinc-400">
              <select
                class="text-xs w-auto"
                value={agenteSelecionado}
                onchange={(e) => agenteSelecionadoStore.set((e.target as HTMLSelectElement).value as any)}
              >
                <option value="secretario">secretário</option>
                <option value="secretario-exec">secretário-exec</option>
              </select>
              {@html ajuda("secretario")}
            </label>
            <button class="btn btn-ghost text-xs" onclick={() => novaConversa()} title="Nova conversa" aria-label="Nova conversa">{@html icone("plus")}</button>
            <button class="btn-ghost text-xs" onclick={() => abrirChatLateral()} title="Abrir chat lateral" aria-label="Abrir chat lateral">{@html icone("chat")}</button>
          </div>
        </div>

        {#if hitlPendentes.length}
          <div id="hitl-pendentes" class="p-2 border-b border-zinc-800 space-y-2">
            {#each hitlPendentes as p (p.id)}
              <div class="hitl-card">
                <div class="hitl-header">🔒 Permissão necessária — {p.agente}</div>
                <div class="hitl-ordem">{p.ordem.slice(0, 160)}</div>
                <div class="hitl-motivo">{p.motivo_guard}</div>
                <div class="hitl-acoes">
                  <button class="btn text-xs" onclick={() => aprovarHitl(p.id)}>Aprovar</button>
                  <button
                    class="btn-ghost text-xs"
                    onclick={() => {
                      const motivo = prompt("Motivo da rejeição:")?.trim();
                      if (motivo) void rejeitarHitl(p.id, motivo);
                    }}>Rejeitar</button
                  >
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <div
          class="flex-1 overflow-y-auto scrollbar-thin"
          id="chat-mensagens"
          bind:this={feedEl}
          onscroll={onScrollFeed}
        >
          <div class="oc-feed" id="oc-feed">
            {#if mensagens.length === 0}
              <div class="secgpt-welcome">
                <div class="secgpt-cabeca">
                  <div class="secgpt-logo">{@html icone("chat")}</div>
                  <h2 class="secgpt-titulo">Secretário</h2>
                  <p class="secgpt-sub">Como posso ajudar?</p>
                </div>
                <div class="secgpt-cols">
                  <div class="secgpt-coluna">
                    <h3 class="secgpt-col-titulo">Exemplos</h3>
                    {#each SUGESTOES as s}
                      <button class="secgpt-card" onclick={() => handleSugestao(s)} title="Enviar este exemplo">
                        <span class="secgpt-card-texto">{s}</span>
                        <span class="secgpt-card-ico" aria-hidden="true">{@html icone("spark")}</span>
                      </button>
                    {/each}
                  </div>
                  <div class="secgpt-coluna secgpt-coluna-estatica">
                    <h3 class="secgpt-col-titulo">Capacidades</h3>
                    {#each CAPACIDADES as c}
                      <div class="secgpt-card secgpt-card-estatico"><span class="secgpt-card-texto">{c}</span></div>
                    {/each}
                  </div>
                  <div class="secgpt-coluna secgpt-coluna-estatica">
                    <h3 class="secgpt-col-titulo">Limitações</h3>
                    {#each LIMITACOES as l}
                      <div class="secgpt-card secgpt-card-estatico"><span class="secgpt-card-texto">{l}</span></div>
                    {/each}
                  </div>
                </div>
              </div>
            {:else}
              {#each mensagens as m, i}
                <div class="oc-msg {m.role === 'user' ? 'oc-user' : 'oc-assistant'}">
                  <div class="oc-msg-corpo">
                    {#if m.role === "user"}
                      {#if m.imagens}
                        <div class="oc-imagens">
                          {#each m.imagens.filter((u: string) => u.startsWith("data:image/")) as u}
                            <img class="oc-img-anexo" src={u} alt="imagem anexada" />
                          {/each}
                        </div>
                      {/if}
                      <p class="md-p">{@html escapeHtml(m.content).replace(/\n/g, "<br>")}</p>
                    {:else if m.terminal !== undefined}
                      <pre class="terminal-saida"><code>{m.terminal}</code></pre>
                    {:else}
                      {#if m.pensamento}
                        <details class="oc-pensamento" open={m.concluida === false}>
                          <summary class="oc-pensamento-sumario">
                            {#if m.concluida === false}💭 Pensando… <span class="oc-decorrendo">({decorridoFmt})</span>{:else}💭 Pensamento{/if}
                          </summary>
                          <div class="oc-pensamento-corpo">{@html renderMarkdown(m.pensamento)}</div>
                        </details>
                      {/if}
                      {@html htmlAcoes(m.acoes)}
                      {#if m.content}
                        {@html renderMarkdown(m.content)}
                      {:else if (carregando && i === mensagens.length - 1) || m.concluida === false}
                        {@html statusPensando(m.acoes)}
                      {:else}
                        <span class="oc-sem-resposta">(sem resposta do modelo — reenvie)</span>
                      {/if}
                    {/if}
                  </div>
                  {#if m.role === "user"}
                    <button class="oc-edit" title="Editar prompt" aria-label="Editar prompt" onclick={() => editarMensagem(i).then(() => { inputValor = getRascunho(); if(textareaEl){ textareaEl.value = inputValor; autoAltura(textareaEl); textareaEl.focus(); } })}>{@html icone("edit")}</button>
                  {/if}
                  <button class="oc-copy" title="Copiar mensagem" aria-label="Copiar mensagem" onclick={(e) => { void copiarMensagem(i).then(()=> { const btn = e.currentTarget as HTMLButtonElement; const orig = btn.textContent; btn.textContent = "✓"; setTimeout(()=> btn.textContent = orig ?? "copy", 1200); }); }}>copy</button>
                </div>
              {/each}
              {#if mensagens[mensagens.length - 1]?.role === "assistant" && !carregando && mensagens[mensagens.length - 1]?.concluida !== false}
                <div class="oc-chips oc-followups">
                  {#each FOLLOWUPS as s}
                    <button class="chip" onclick={() => handleSugestao(s)}>{s}</button>
                  {/each}
                </div>
              {/if}
              {#if carregando && mensagens[mensagens.length - 1]?.role === "user"}
                <div class="oc-msg oc-assistant oc-pensando">
                  <div class="oc-msg-corpo">{@html statusPensando()}</div>
                </div>
              {/if}
            {/if}
          </div>
        </div>

        <button id="btn-ir-fim" class="oc-ir-fim {pertoDoFundo ? 'hidden' : ''}" onclick={irFim} aria-label="Ir para o fim">↓</button>

        <div class="hidden">
          <input id="sessao-busca" placeholder="Buscar conversa…" value={busca} oninput={(e) => buscaStore.set((e.target as HTMLInputElement).value)} />
          <div id="lista-sessoes">
            {#each grupos as g}
              <div class="sessao-grupo">{g.grupo}</div>
              {#each g.itens as s}
                <button class="sessao-item {s.id === sessaoAtivaId ? 'ativa' : ''}" onclick={() => selecionarSessao(s.id)}>
                  <div class="sessao-titulo">{tituloSessao(s)}</div>
                  <div class="sessao-data">{(() => { const d = dataSessao(s); return d ? tempoRelativo(d) : ""; })()}</div>
                </button>
              {/each}
            {/each}
          </div>
        </div>

        <div class="p-3 border-t border-zinc-800">
          <div class="composer">
            {#if anexos.length}
              <div id="anexos-chips" class="anexos-chips" style="display:flex">
                {#each anexos as a, idx}
                  <span class="anexo-chip">🖼 {a.nome}
                    <button onclick={() => removerAnexo(idx)} aria-label="Remover anexo" title="Remover">✕</button>
                  </span>
                {/each}
              </div>
            {/if}
            <div class="composer-row2">
              <button class="btn-ghost composer-anexo" onclick={() => fileInputEl?.click()} title="Anexar imagem ou arquivo" aria-label="Anexar">📎</button>
              <input
                bind:this={fileInputEl}
                id="anexo-input"
                type="file"
                multiple
                accept="image/*,.txt,.md,.json,.csv,.log,.py,.js,.ts,.sh,.yaml,.yml,.html,.css"
                style="display:none"
                onchange={(e) => { const inp = e.target as HTMLInputElement; adicionarAnexos(inp.files); inp.value = ""; }}
              />
              <textarea
                bind:this={textareaEl}
                id="chat-input"
                placeholder="Pergunte qualquer coisa… (/ comandos · @ contexto · ! terminal)"
                rows="1"
                value={inputValor}
                onkeydown={handleKeydown}
                oninput={(e) => handleComposerInput((e.target as HTMLTextAreaElement).value)}
              ></textarea>
              <button
                class="btn composer-enviar"
                id="btn-enviar"
                onclick={() => handleEnviar(true)}
                aria-label={carregando ? "Parar resposta" : "Enviar mensagem"}
                class:parando={carregando}
              >{@html carregando ? icone("stop") : icone("run")}</button>
            </div>
            <div class="composer-row">
              <span class="text-xs text-zinc-500 composer-dica">secretário analisa · secretário-exec executa · / comandos · @ contexto · ! terminal · 📎 anexa</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .secretario-svelte-root { display: contents; }
  .hitl-card { background: rgba(251,191,36,0.08); border:1px solid rgba(251,191,36,0.25); border-radius:.5rem; padding:.6rem .75rem; }
  .hitl-header { font-size:.78rem; font-weight:600; }
  .hitl-ordem { font-size:.78rem; color: var(--text); margin-top:.2rem; }
  .hitl-motivo { font-size:.72rem; color: var(--muted); margin-top:.15rem; }
  .hitl-acoes { display:flex; gap:.5rem; margin-top:.5rem; }
  .anexos-chips { display:flex; flex-wrap:wrap; gap:.4rem; margin-bottom:.5rem; }
  .anexo-chip { display:inline-flex; align-items:center; gap:.35rem; background:#1c1c1c; border:1px solid var(--border); border-radius:9999px; padding:.2rem .55rem; font-size:.72rem; }
</style>
