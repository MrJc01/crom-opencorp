<script lang="ts">
  import { onMount } from 'svelte';
  import { goto, currentView } from './lib/router.svelte';
  import Wizard from './views/Wizard.svelte';
  import Home from './views/Home.svelte';
  import Tasks from './views/Tasks.svelte';
  import Agentes from './views/Agentes.svelte';
  import Secretario from './views/Secretario.svelte';
  import Workspace from './views/Workspace.svelte';
  import Agenda from './views/Agenda.svelte';
  import Fluxos from './views/Fluxos.svelte';
  import Hooks from './views/Hooks.svelte';
  import Historico from './views/Historico.svelte';
  import Apps from './views/Apps.svelte';
  import Notificacoes from './views/Notificacoes.svelte';
  import Config from './views/Config.svelte';
  import Reunioes from './views/Reunioes.svelte';

  let view = $state('home');

  onMount(() => {
    // Initialize vanilla boot for incremental migration (keeps SSE, auth, etc. for now)
    import('./main.ts').then((m) => {
      if ((m as unknown as { boot?: () => void }).boot) (m as unknown as { boot: () => void }).boot();
    });
    const unsub = currentView.subscribe((v) => (view = v));
    return () => unsub();
  });
</script>

<div id="svelte-app" data-view={view}>
  {#if view === 'home'}<Home />{:else if view === 'tasks'}<Tasks />{:else if view === 'agentes'}<Agentes />{:else if view === 'secretario'}<Secretario />{:else if view === 'reunioes'}<Reunioes />{:else if view === 'workspace'}<Workspace />{:else if view === 'agenda'}<Agenda />{:else if view === 'fluxos'}<Fluxos />{:else if view === 'hooks'}<Hooks />{:else if view === 'apps' || view === 'app-detail'}<Apps />{:else if view === 'historico'}<Historico />{:else if view === 'notificacoes'}<Notificacoes />{:else if view === 'config'}<Config />{:else}
    <!-- Fallback to vanilla views during incremental migration -->
    <slot />
  {/if}
  <Wizard />
</div>

<style>
  #svelte-app {
    display: contents;
  }
</style>
