<script lang="ts">
  import { currentView, goto } from '../lib/router.svelte';
  import { wsAtivo } from '../stores/auth.svelte';
  import { workspaces } from '../stores/workspaces.svelte';

  let view: string;
  currentView.subscribe(v => view = v);
  let ws: string;
  wsAtivo.subscribe(v => ws = v);
  let wss: any[] = [];
  workspaces.subscribe(v => wss = v);
</script>

<aside class="sidebar" id="sidebar">
  <nav class="flex-1 p-2 overflow-y-auto">
    <button class="nav-item" class:active={view==='home'} on:click={()=> goto('home')}>Início</button>
    <button class="nav-item" class:active={view==='tasks'} on:click={()=> goto('tasks')}>Tasks</button>
    <button class="nav-item" class:active={view==='secretario'} on:click={()=> goto('secretario')}>Secretário</button>
    <button class="nav-item" class:active={view==='workspace'} on:click={()=> goto('workspace')}>Workspace</button>
    <button class="nav-item" class:active={view==='config'} on:click={()=> goto('config')}>Config</button>
  </nav>
</aside>
