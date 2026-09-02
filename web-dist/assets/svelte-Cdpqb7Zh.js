const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/svelte-app.js","assets/svelte-BXgljq6I.css","assets/svelte-BzABqhpW.js","assets/svelte-BzgwTHir.css","assets/svelte-D3zsPHFt.js"])))=>i.map(i=>d[i]);
import{_ as f,i as l,h as Lo,s as _a,a as re,q as w,e as r,b as m,c as b,f as Ta,t as d,g as k,d as Lt,j as Sa,k as Le,w as R,l as Co,m as q,n as Jt,o as Ts,p as Ss,r as Mo,u as As,v as Is,x as Ls,y as zo,z as Po,A as Cs,B as Ho,C as No,D as $t,I as ao,E as Bo,F as Ms,G as Ro,H as zs}from"./svelte-app.js";const Oo="chat-lateral-aberto",Ps='<div class="oc-feed" id="lat-feed"></div>';function Do(){const e=document.getElementById("lat-mensagens");!e||document.getElementById("lat-feed")||(e.innerHTML=Ps)}function Hs(){const e=document.getElementById("lat-mensagens");!e||e.dataset.vigiaIniciar||(e.dataset.vigiaIniciar="1",e.addEventListener("click",t=>{if(!t.target?.closest?.("#lat-iniciar"))return;const a=Date.now(),o=setInterval(()=>{if(!document.getElementById("chat-drawer")?.classList.contains("open")||document.getElementById("lat-feed")){clearInterval(o);return}(async()=>{try{const s=await fetch("/secretario/status",{headers:Lo()});if(!s.ok)return;(await s.json()).rodando&&(clearInterval(o),Do(),f(()=>Promise.resolve().then(()=>ja),void 0).then(c=>c.renderChatLateral()))}catch{}})(),Date.now()-a>3e4&&clearInterval(o)},800)}))}function Ns(){const e=document.getElementById("lat-enviar");e&&!e.innerHTML.trim()&&(e.innerHTML=l("run"))}function gt(){const e=document.getElementById("chat-drawer");e&&(document.getElementById("drawer")?.classList.contains("open")&&f(()=>Promise.resolve().then(()=>G),void 0).then(t=>t.fecharDrawer()),Do(),Ns(),e.classList.add("open"),e.removeAttribute("aria-hidden"),document.getElementById("chat-drawer-overlay")?.classList.add("open"),document.body.classList.add(Oo),Hs(),f(()=>Promise.resolve().then(()=>ja),void 0).then(t=>t.renderChatLateral()))}function ft(){const e=document.getElementById("chat-drawer");e?.contains(document.activeElement)&&document.activeElement?.blur?.(),e?.classList.remove("open"),e?.setAttribute("aria-hidden","true"),document.getElementById("chat-drawer-overlay")?.classList.remove("open"),document.body.classList.remove(Oo)}function qo(){document.getElementById("chat-drawer")?.classList.contains("open")?ft():gt()}const Yc=Object.freeze(Object.defineProperty({__proto__:null,abrirChatLateral:gt,alternarChatLateral:qo,fecharChatLateral:ft},Symbol.toStringTag,{value:"Module"}));function Aa(e){const t=e.replace(/^#\/?/,"").replace(/^\//,"");la(),t.startsWith("app/")?re("app-detail"):re(t||"home");const a="/"+t;(window.location.pathname!==a||window.location.search)&&history.pushState(null,"",a),He()}function la(){document.getElementById("drawer")?.classList.contains("open")&&ge()}function Bs(){const e=window.location.hash;return e.startsWith("#/")?e.replace(/^#\/?/,"").split("?")[0]??"":window.location.pathname.replace(/^\//,"").split("?")[0]??""}function Rs(){return window.location.hash.includes("?")?window.location.hash.split("?")[1]??"":window.location.search.replace(/^\?/,"")}function it(){const e=Bs();return e?e.startsWith("app/")?"app-detail":e:"home"}function Os(e){const t=Rs();return new URLSearchParams(t).get(e)}function jo(){window.addEventListener("popstate",()=>{la();const e=it();e.startsWith("app/")?re("app-detail"):re(e),He()}),window.addEventListener("hashchange",()=>{if(window.location.hash.startsWith("#/")){const t="/"+window.location.hash.replace(/^#\/?/,"");history.replaceState(null,"",t)}la();const e=it();e.startsWith("app/")?re("app-detail"):re(e),He()}),Fo(),document.addEventListener("keydown",e=>{e.key==="Escape"&&(document.getElementById("drawer")?.classList.contains("open")?ge():document.getElementById("chat-drawer")?.classList.contains("open")&&ft())})}function Fo(){const e=it();e.startsWith("app/")?re("app-detail"):re(e)}async function Uo(e,t){const{carregarDrawerConteudo:a}=await f(async()=>{const{carregarDrawerConteudo:o}=await Promise.resolve().then(()=>nr);return{carregarDrawerConteudo:o}},void 0);ft(),_a(e),document.getElementById("drawer-title").textContent=t,document.getElementById("drawer").classList.add("open"),document.getElementById("drawer-overlay").classList.add("open"),await a(e)}function ge(){_a(null),document.getElementById("drawer").classList.remove("open"),document.getElementById("drawer-overlay").classList.remove("open"),document.getElementById("drawer-content").innerHTML=""}const G=Object.freeze(Object.defineProperty({__proto__:null,abrirDrawer:Uo,fecharDrawer:ge,initRouter:jo,navegar:Aa,parametroHash:Os,parseHash:it,sincronizarComHash:Fo},Symbol.toStringTag,{value:"Module"}));function Ds(){const e=window;e.__estadoRetry||(e.__estadoRetry=()=>{})}function T(e="Carregando…"){return`
    <div class="empty-state estado-loading" role="status" aria-live="polite">
      <div class="empty-icon">${l("history")}</div>
      <div class="empty-title">${Ia(e)}</div>
    </div>
  `}function _(e,t,a="",o=""){return`
    <div class="empty-state">
      <div class="empty-icon">${l(e)}</div>
      <div class="empty-title">${Ia(t)}</div>
      ${a?`<div class="empty-desc">${a}</div>`:""}
      ${o?`<div class="empty-acao">${o}</div>`:""}
    </div>
  `}function S(e,t){Ds(),t&&(window.__estadoRetry=t);const a=t?`<div class="empty-acao"><button class="btn btn-ghost" onclick="window.__estadoRetry()">${l("run")} Tentar novamente</button></div>`:"";return`
    <div class="empty-state estado-erro" role="alert">
      <div class="empty-icon">${l("close")}</div>
      <div class="empty-title">Algo deu errado</div>
      <div class="empty-desc">${Ia(e)}</div>
      ${a}
    </div>
  `}function Ia(e){return String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}const La=[{nome:"status",descricao:"Resumo do estado da empresa",exemplo:"/status"},{nome:"tasks",descricao:"Resumo do board de tasks",exemplo:"/tasks"},{nome:"custos",descricao:"Gasto de hoje do workspace",exemplo:"/custos"},{nome:"fluxos",descricao:"Lista os flows disponíveis",exemplo:"/fluxos"},{nome:"agenda",descricao:"Lista as rotinas agendadas",exemplo:"/agenda"},{nome:"agentes",descricao:"Lista a equipe de agentes",exemplo:"/agentes"},{nome:"limpar",descricao:"Inicia uma nova conversa",exemplo:"/limpar"}],qs=/(^|\s)@([a-z0-9._-]+)/gi;function Vo(e){const t=e.trim(),a=[];for(const i of t.matchAll(qs)){const c=i[2];a.includes(c)||a.push(c)}const o=t.replace(/(^|\s)@[a-z0-9._-]+/gi,"$1").replace(/\s{2,}/g," ").trim();let n,s;if(t.startsWith("!")){const i=t.slice(1).trim();i&&(s={comando:i})}else if(t.startsWith("/")){const i=t.slice(1),c=i.search(/\s/),u=c===-1?i:i.slice(0,c);u&&(n={nome:u,args:c===-1?"":i.slice(c+1).trim()})}return{comando:n,terminal:s,contexto:a,textoLimpo:o}}const Ca="oc-chat-rascunho";let qe=null;function Ma(){try{return typeof localStorage>"u"?null:localStorage}catch{return null}}function Wt(){return qe!==null||(qe=Ma()?.getItem(Ca)??""),qe}function Ne(e){qe=e;try{Ma()?.setItem(Ca,e)}catch{}}function bt(){qe="";try{Ma()?.removeItem(Ca)}catch{}}const Zc=Object.freeze(Object.defineProperty({__proto__:null,getRascunho:Wt,limparRascunho:bt,setRascunho:Ne},Symbol.toStringTag,{value:"Module"}));function za(e,t,a,o,n,s,i=8){const c=e+a+i<=n,u=t+o+i<=s,p=Math.max(i,c?e:e-a),v=Math.max(i,u?t:t-o),h=Math.max(i,n-a-i),y=Math.max(i,s-o-i);return{left:Math.min(p,h),top:Math.min(v,y)}}function Pa(e,t,a,o){e.innerHTML="";const n=o??t[0]?.id??"",s=new Map;for(const c of t){const u=document.createElement("button");u.type="button",u.className="ui-tab"+(c.id===n?" ui-tab-ativa":""),u.textContent=c.rotulo,u.setAttribute("role","tab"),u.setAttribute("aria-selected",String(c.id===n)),u.onclick=()=>i(c.id),s.set(c.id,u),e.appendChild(u)}function i(c){for(const[u,p]of s){const v=u===c;p.classList.toggle("ui-tab-ativa",v),p.setAttribute("aria-selected",String(v))}a(c)}return i}const js=/^\/([A-Za-z0-9._-]*)$/,Jo=/(^|\s)@([A-Za-z0-9._-]*)$/,Fs=320,Us=38,Wo=8,oa=3;let $=null,B=[],V=0,Ce=null,da=0,Oe=null;function Vs(e){if(!$)return!1;switch(e.key){case"ArrowDown":return e.preventDefault(),e.stopPropagation(),B.length&&(V=(V+1)%B.length,Ct()),!0;case"ArrowUp":return e.preventDefault(),e.stopPropagation(),B.length&&(V=(V-1+B.length)%B.length,Ct()),!0;case"Enter":case"Tab":return e.preventDefault(),e.stopPropagation(),B.length?Ko(V):le(),!0;case"Escape":return e.preventDefault(),e.stopPropagation(),le(),!0;default:return!1}}function Js(e,t){const a=js.exec(e);if(a){Ws(a[1]??"",t);return}const o=Jo.exec(e);if(o){Xs(o[2]??"",t);return}le()}function le(){da++,Ce=null,B=[],$&&($.remove(),$=null),document.removeEventListener("mousedown",Xo)}function Xo(e){const t=e.target;$&&(t&&($.contains(t)||Ce&&Ce.contains(t))||le())}async function Ws(e,t){const a=e.toLowerCase(),o=La.filter(n=>n.nome.startsWith(a)).map(n=>({tipo:"comando",valor:n.nome,rotulo:"/"+n.nome,descricao:n.exemplo&&n.exemplo!=="/"+n.nome?`${n.descricao} · ex.: ${n.exemplo}`:n.descricao}));ua(o,t)}async function Xs(e,t){const a=++da;if(Oe?oo().then(s=>{Oe=s}).catch(()=>{}):(B=[],ua(B,t,"carregando contexto…"),Oe=await oo().catch(()=>({arquivos:[],agentes:[],tasks:[]}))),a!==da||!$)return;const o=e.toLowerCase(),n=[...Oe.arquivos.filter(s=>s.toLowerCase().includes(o)).slice(0,oa).map(s=>({tipo:"arquivo",valor:s,rotulo:s,descricao:"arquivo do workspace"})),...Oe.agentes.filter(s=>s.toLowerCase().includes(o)).slice(0,oa).map(s=>({tipo:"agente",valor:s,rotulo:"@"+s,descricao:"agente da equipe"})),...Oe.tasks.filter(s=>s.id.toLowerCase().includes(o)||s.titulo.toLowerCase().includes(o)).slice(0,oa).map(s=>({tipo:"task",valor:s.id,rotulo:`${s.id} — ${s.titulo}`,descricao:"task do board"}))].slice(0,Wo);$.dataset.para===Go(t)&&ua(n,t)}async function oo(){const[e,t,a]=await Promise.all([w("/files").catch(()=>({itens:[]})),w("/agents").catch(()=>[]),w("/tasks").catch(()=>[])]);return{arquivos:(e.itens??[]).map(o=>String(o.nome??"")).filter(Boolean),agentes:(Array.isArray(t)?t:[]).filter(o=>o.ativo!==!1).map(o=>String(o.id??"")).filter(Boolean),tasks:(Array.isArray(a)?a:[]).filter(o=>o.id).map(o=>({id:String(o.id),titulo:String(o.titulo??"")}))}}function Go(e){return e.id||String([...document.querySelectorAll("textarea")].indexOf(e))}function ua(e,t,a){const o=!$;if($||($=document.createElement("div"),$.className="palette-menu",$.setAttribute("role","listbox"),document.body.appendChild($)),Ce=t,B=e,V=0,$.dataset.para=Go(t),a&&!e.length){$.innerHTML="";const n=document.createElement("div");n.className="palette-vazio",n.textContent=a,$.appendChild(n)}else Ct();Gs(),o&&document.addEventListener("mousedown",Xo)}function Gs(){if(!$||!Ce)return;const e=Ce.getBoundingClientRect(),t=B.length?B.length:1,a=Math.min(t,Wo)*Us+12,o=za(e.left,e.bottom+4,Fs,a,window.innerWidth,window.innerHeight);$.style.left=o.left+"px",$.style.top=o.top+"px"}function Ct(){if(!$)return;$.innerHTML="";let e=null;B.forEach((t,a)=>{if(t.tipo!=="comando"&&t.tipo!==e){e=t.tipo;const n=document.createElement("div");n.className="palette-rotulo",n.textContent=t.tipo==="arquivo"?"Arquivos":t.tipo==="agente"?"Agentes":"Tasks",$.appendChild(n)}const o=document.createElement("button");if(o.type="button",o.className="palette-item"+(a===V?" ativa":""),o.setAttribute("role","option"),o.setAttribute("aria-selected",String(a===V)),o.dataset.tipo=t.tipo,o.dataset.valor=t.valor,o.textContent=t.rotulo,t.descricao){const n=document.createElement("span");n.className="palette-desc",n.textContent=t.descricao,o.appendChild(n)}o.addEventListener("click",()=>Ko(a)),o.addEventListener("mousemove",()=>{V!==a&&(V=a,Ct())}),$.appendChild(o)})}function Ko(e){const t=B[e],a=Ce;if(le(),!(!t||!a)){if(t.tipo==="comando")a.value="/"+t.valor+" ";else{const o=Jo.exec(a.value),n=o?a.value.slice(0,o.index+o[1].length):a.value.replace(/\s+$/,"")+" ";a.value=n+"@"+t.valor+" "}a.focus(),a.dispatchEvent(new Event("input",{bubbles:!0}))}}function Ks(){if(typeof window>"u")return;const e=window;e.__mdCopy=t=>{const o=t.parentElement?.querySelector("code")?.textContent??"";navigator.clipboard.writeText(o).then(()=>{const n=t.textContent;t.textContent="copiado ✓",setTimeout(()=>{t.textContent=n??"copy"},1500)})}}function Ys(e){const t=[],a=e.split(/```/);for(let o=0;o<a.length;o++)if(o%2===1){const n=a[o].split(`
`),s=n.slice(1).join(`
`);t.push({tipo:"code",conteudo:n[0]!==""||s?s||"":a[o]??""})}else t.push({tipo:"html",conteudo:a[o]??""});return t}function Ze(e){let t=e;return t=t.replace(/`([^`]+)`/g,'<code class="md-code-inline">$1</code>'),t=t.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>"),t=t.replace(/(^|[^*])\*([^*\n]+)\*/g,"$1<em>$2</em>"),t=t.replace(/~~([^~]+)~~/g,"<del>$1</del>"),t=t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s"']+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'),t=t.replace(new RegExp(`(?<!["'>])(https?:\\/\\/[^\\s"'<>]+)`,"g"),a=>{let o=a,n="";const s=/[.,;:!?)]+$/.exec(o);return s&&(n=s[0],o=o.slice(0,o.length-n.length)),`<a href="${o}" target="_blank" rel="noopener noreferrer">${o}</a>${n}`}),t}function Zs(e){const a=r(e).split(`
`),o=[];let n=null,s=[];const i=()=>{n&&(o.push(`<${n.tipo} class="md-lista">${n.itens.map(u=>`<li>${u}</li>`).join("")}</${n.tipo}>`),n=null)},c=()=>{s.length&&(o.push(`<p class="md-p">${s.map(Ze).join("<br>")}</p>`),s=[])};for(const u of a){const p=u.trimEnd(),v=/^[-*]\s+(.*)$/.exec(p),h=/^(\d+)[.)]\s+(.*)$/.exec(p),y=/^(#{1,4})\s+(.*)$/.exec(p),I=/^&gt;\s?(.*)$/.exec(p),K=/^(-{3,}|\*{3,})$/.test(p);if(v)c(),(!n||n.tipo!=="ul")&&(i(),n={tipo:"ul",itens:[]}),n.itens.push(Ze(v[1]));else if(h)c(),(!n||n.tipo!=="ol")&&(i(),n={tipo:"ol",itens:[]}),n.itens.push(Ze(h[2]));else if(y){c(),i();const Y=Math.min(y[1].length,4);o.push(`<p class="md-h md-h${Y}">${Ze(y[2])}</p>`)}else I?(c(),i(),o.push(`<blockquote class="md-quote">${Ze(I[1])}</blockquote>`)):K?(c(),i(),o.push('<hr class="md-hr"/>')):p.trim()===""?(c(),i()):(i(),s.push(p))}return c(),i(),o.join("")}function Mt(e){return Ks(),e?Ys(e).map(a=>a.tipo==="html"?Zs(a.conteudo):`
      <div class="md-code">
        <button class="md-copy" onclick="window.__mdCopy(this)" aria-label="Copiar código">copy</button>
        <pre><code>${r(a.conteudo.replace(/\n$/,""))}</code></pre>
      </div>`).join(""):""}const Qs=Object.freeze(Object.defineProperty({__proto__:null,renderMarkdown:Mt},Symbol.toStringTag,{value:"Module"})),ei={resumo:"badge-ok",aviso:"badge-warn",erro:"badge-err",info:"badge-neutral"};let De=!1;function Ha(e){const t=document.getElementById("nav-badge-notificacoes");t&&(t.textContent=String(e),t.classList.toggle("hidden",e===0))}async function Na(){try{const e=await m("/notifications");Ha(e.resumo?.nao_lidas??0)}catch{}}function no(){const e=document.getElementById("nav-badge-notificacoes");if(!e)return;const t=Number(e.textContent??"0");Ha((Number.isFinite(t)?t:0)+1)}async function fe(){const e=document.getElementById("view-notificacoes");if(!e)return;e.innerHTML.trim()||(e.innerHTML=`<div class="page-header"><div class="page-header-esq"><h1 class="page-header-titulo">${l("sino")} Notificações</h1><p class="page-header-sub">Avisos dos agentes</p></div></div>`+T());let t;try{t=await m("/notifications")}catch{t=null}if(!t){e.innerHTML=`<div class="page-header"><div class="page-header-esq"><h1 class="page-header-titulo">${l("sino")} Notificações</h1><p class="page-header-sub">Avisos dos agentes</p></div><div class="page-header-acoes"><span class="help-wrap">${b("notificacoes")}</span></div></div>`+S("Não foi possível carregar as notificações.",()=>{fe()});return}const a=t.notificacoes??[],o=t.resumo?.nao_lidas??0;Ha(o);const n=De?a.filter(i=>!i.lida):a;e.innerHTML=`
    <div class="page-header">
      <div class="page-header-esq">
        <h1 class="page-header-titulo">${l("sino")} Notificações</h1>
        <p class="page-header-sub">Avisos dos agentes — ${o} não lida${o===1?"":"s"} de ${a.length}</p>
      </div>
      <div class="page-header-acoes">
        <span class="help-wrap">${b("notificacoes")}</span>
        <button class="btn btn-ghost" onclick="marcarTodasNotificacoesLidas()">${l("check")} Marcar todas como lidas</button>
        <button class="btn btn-ghost text-error" onclick="limparNotificacoes()">${l("trash")} Limpar</button>
      </div>
    </div>
    <div class="flex items-center gap-2 mb-4">
      <button id="not-filtro-todas" class="not-filtro ${De?"":"ativo"}" onclick="alternarFiltroNotificacoes(false)">Todas (${a.length})</button>
      <button id="not-filtro-nao-lidas" class="not-filtro ${De?"ativo":""}" onclick="alternarFiltroNotificacoes(true)">Não lidas (${o})</button>
    </div>
    <div id="notificacoes-lista" class="space-y-3"></div>
  `;const s=document.getElementById("notificacoes-lista");if(s){if(!n.length){s.innerHTML=_("sino",De?"Nenhuma não lida":"Nenhuma notificação",De?"Tudo em ordem — não há avisos pendentes neste workspace.":"Agentes avisam aqui ao finalizar execuções relevantes (tool <strong>notificar</strong>). O painel também pode receber avisos manuais via <code>POST /notifications</code>.");return}s.innerHTML=n.map(i=>`
    <div class="not-card ${i.lida?"lida":"nao-lida"}" data-not-id="${r(i.id)}">
      <div class="flex items-start gap-3">
        ${i.lida?"":'<span class="not-dot"></span>'}
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-medium text-sm">${r(i.titulo)}</span>
            <span class="badge ${ei[i.tipo]??"badge-neutral"}">${r(i.tipo)}</span>
            <span class="text-xs text-zinc-500">${Ta(i.criado_em)}</span>
          </div>
          <div class="not-corpo text-sm text-zinc-300 mt-1">${r(i.corpo)}</div>
          <div class="text-xs text-zinc-600 mt-1 font-mono">origem: ${r(i.origem||"—")}</div>
        </div>
        ${i.lida?"":`<button class="btn btn-ghost flex-none" onclick="marcarNotificacaoLida('${r(i.id)}')">${l("check")} Marcar lida</button>`}
      </div>
    </div>
  `).join("")}}async function ti(e){try{await m("/notifications/"+encodeURIComponent(e)+"/lida",{method:"POST"}),await fe()}catch(t){d("Erro ao marcar como lida: "+t.message,"erro")}}async function ai(){try{await m("/notifications/lidas",{method:"POST"}),d("Notificações marcadas como lidas","ok"),await fe()}catch(e){d("Erro ao marcar todas: "+e.message,"erro")}}async function oi(){const{modalConfirm:e}=await f(async()=>{const{modalConfirm:t}=await Promise.resolve().then(()=>H);return{modalConfirm:t}},void 0);if(await e(`Apagar TODAS as notificações de "${r(k()||"workspace")}"? Essa ação não volta atrás.`,{titulo:"Limpar notificações",confirmar:"Limpar"}))try{await m("/notifications",{method:"DELETE"}),d("Notificações apagadas","ok"),await fe()}catch(t){d("Erro ao limpar: "+t.message,"erro")}}function ni(e){De=e,fe()}const si=6,ii=8,so=8,ri=120*1e3;function io(e,t){const a=t?Lt(t,42):"";switch(e){case"cron":return"rotina"+(a?` · ${a}`:"");case"mencao":return"menção"+(a?` · ${a}`:"");case"manual":return a?`manual · ${a}`:"manual";case"reuniao":return"reunião";case"fluxo":return"fluxo"+(a?` · ${a}`:"");case"hook":return"hook"+(a?` · ${a}`:"");case"dependencia":return"dependência";default:return Lt(e||"—",24)+(a?` · ${a}`:"")}}function ci(e){if(e<=0)return"agora";const t=Math.floor(e/1e3),a=Math.floor(t/86400),o=Math.floor(t%86400/3600),n=Math.floor(t%3600/60),s=t%60,i=c=>String(c).padStart(2,"0");return a>0?`em ${a}d ${i(o)}h ${i(n)}m`:`em ${i(o)}:${i(n)}:${i(s)}`}function Yo(e){const t=Math.max(0,Math.floor(e/1e3)),a=Math.floor(t/86400),o=Math.floor(t%86400/3600),n=Math.floor(t%3600/60),s=t%60,i=c=>String(c).padStart(2,"0");return a>0?`${a}d ${i(o)}:${i(n)}:${i(s)}`:`${i(o)}:${i(n)}:${i(s)}`}function li(e){switch(e){case"resumo":return"badge-pipeline";case"aviso":return"badge-warn";case"erro":return"badge-err";default:return"badge-neutral"}}function di(){return`
    <div class="card-header">
      <span class="font-semibold text-sm flex items-center gap-2">${l("history")} Ações da empresa</span>
      <span class="badge badge-neutral">escopo: empresa ativa</span>
    </div>
    <div class="card-body">
      <div class="acoes-grupo-rotulo">A seguir</div>
      <div id="acoes-a-seguir" class="mb-3"></div>
      <div class="acoes-grupo-rotulo">Executando agora</div>
      <div id="acoes-executando" class="mb-3"></div>
      <div class="acoes-grupo-rotulo">Executado recentemente</div>
      <div id="acoes-executadas"></div>
    </div>
  `}function ui(){return`
    <div class="card-header">
      <span class="font-semibold text-sm flex items-center gap-2">${l("sino")} Não vistas</span>
      <span id="nao-vistas-badge" class="badge badge-neutral"></span>
    </div>
    <div class="card-body">
      <div id="nao-vistas-lista"></div>
      <div id="nao-vistas-acoes" class="mt-2" style="display:none">
        <button class="btn btn-ghost text-xs w-full" onclick="homeNotifTodasLidas()">${l("check")} Marcar todas como lidas</button>
      </div>
    </div>
  `}async function Zo(){const e=document.getElementById("acoes-a-seguir"),t=document.getElementById("acoes-executando"),a=document.getElementById("acoes-executadas");if(!e||!t||!a)return;let o=null,n=null;try{const[p,v]=await Promise.all([m("/schedules"),m("/execucoes?limite=40")]);o=p,n=v}catch{e.innerHTML=t.innerHTML=a.innerHTML='<div class="text-xs" style="color:var(--err)">⚠ Falha ao carregar ações</div>';return}const s=(o||[]).filter(p=>p.ativo&&p.proxima_exec).sort((p,v)=>String(p.proxima_exec).localeCompare(String(v.proxima_exec))).slice(0,si);e.innerHTML=s.length?s.map(p=>`
      <div class="acao-item acao-pendente" title="${r(p.nome)} · próxima execução ${r(String(p.proxima_exec))}">
        <span class="acao-ico acao-ico-agenda">${l("agenda")}</span>
        <div class="acao-corpo">
          <div class="acao-titulo">${r(p.nome||p.id)}</div>
          <div class="acao-meta">${Sa(p)} · ${r(Lt((p.args||[]).join(" "),48))}</div>
        </div>
        <span class="acao-contagem" data-contagem-fim="${r(String(p.proxima_exec))}">…</span>
      </div>
    `).join(""):`<div class="acao-vazio">Nada agendado — crie rotinas em <a href="/agenda" onclick="navegar('agenda')">Agenda</a>.</div>`;const i=n||[],c=i.filter(p=>p.status==="executando"),u=i.filter(p=>p.status==="concluido"||p.status==="falhou"||p.status==="cancelado").slice(0,ii);t.innerHTML=c.length?c.map(p=>`
      <div class="acao-item acao-executando" title="${r(p.id)}">
        <span class="acao-ico acao-ico-run">${l("run")}</span>
        <div class="acao-corpo">
          <div class="acao-titulo">${r(p.agente)} <span class="acao-dot" title="executando"></span></div>
          <div class="acao-meta">${r(io(p.gatilho_tipo,p.gatilho_origem))}</div>
        </div>
        <span class="acao-contagem" data-contagem-inicio="${r(String(p.inicio))}">…</span>
      </div>
    `).join(""):'<div class="acao-vazio">Nada executando neste momento.</div>',a.innerHTML=u.length?u.map(p=>`
      <div class="acao-item acao-executada" title="${r(p.id)}">
        <span class="acao-ico ${p.status==="concluido"?"acao-ico-ok":"acao-ico-erro"}">${l(p.status==="concluido"?"check":"close")}</span>
        <div class="acao-corpo">
          <div class="acao-titulo">${r(p.agente)}</div>
          <div class="acao-meta">${r(io(p.gatilho_tipo,p.gatilho_origem))} · ${Ta(p.inicio)}</div>
        </div>
        <span class="badge ${p.status==="concluido"?"badge-ok":"badge-err"}">${r(p.status)}${p.duracao_ms?" · "+Yo(p.duracao_ms).slice(0,8):""}</span>
      </div>
    `).join(""):'<div class="acao-vazio">Nenhuma execução ainda — ações aparecem aqui ao acontecer.</div>',vi()}async function Xt(){const e=document.getElementById("nao-vistas-lista"),t=document.getElementById("nao-vistas-badge"),a=document.getElementById("nao-vistas-acoes");if(!e||!t||!a)return;let o=[],n=0;try{const s=await m("/notifications?nao_lidas=1&limite="+so);o=s.notificacoes||[],n=s.resumo?.nao_lidas??o.length}catch{e.innerHTML='<div class="text-xs" style="color:var(--err)">⚠ Falha ao carregar notificações</div>';return}t.textContent=String(n),t.className="badge "+(n>0?"badge-warn":"badge-neutral"),a.style.display=n>0?"":"none",e.innerHTML=o.length?o.slice(0,so).map(s=>`
      <div class="notif-nao-vista">
        <div class="notif-nao-vista-topo">
          <span class="badge ${li(s.tipo)}">${r(s.tipo)}</span>
          <span class="acao-meta">${r(Lt(s.origem,24))} · ${Ta(s.criado_em)}</span>
          <button class="notif-lida-btn" onclick="homeNotifLida('${r(s.id)}')" title="Marcar como lida">${l("check")}</button>
        </div>
        <div class="notif-nao-vista-titulo">${r(s.titulo)}</div>
        <div class="notif-nao-vista-corpo">${r(s.corpo)}</div>
      </div>
    `).join(""):_("check","Nenhuma não vista","Os avisos dos agentes aparecem aqui antes de virarem lidos.")}async function pi(e){try{await m("/notifications/"+encodeURIComponent(e)+"/lida",{method:"POST"}),await Promise.all([Xt(),Na()])}catch(t){d("Erro ao marcar como lida: "+t.message,"erro")}}async function mi(){try{await m("/notifications/lidas",{method:"POST"}),await Promise.all([Xt(),Na()]),d("Todas marcadas como lidas","ok")}catch(e){d("Erro: "+e.message,"erro")}}let Qe=null;function vi(){Qe||(Qe=setInterval(()=>{const e=document.querySelectorAll("[data-contagem-fim],[data-contagem-inicio]");if(!e.length){Qe&&(clearInterval(Qe),Qe=null);return}const t=Date.now();e.forEach(a=>{const o=a.dataset.contagemFim,n=a.dataset.contagemInicio;if(o){const s=new Date(o).getTime()-t;a.textContent=ci(s),a.classList.toggle("proxima",s>0&&s<ri)}else if(n){const s=new Date(n).getTime();isNaN(s)||(a.textContent=Yo(t-s))}})},1e3))}let ro=0;const gi=4e3;async function co(){const e=Date.now();e-ro<gi||(ro=e,await Promise.allSettled([Zo(),Xt()]))}async function fi(e,t=[]){let a=[];try{a=await m("/agents")}catch{a=[]}if(!a.length)return`<div id="${r(e)}" class="text-xs text-zinc-500">Nenhum agente no workspace — crie na aba <strong>Agentes</strong>.</div>`;const o=new Set(t);return`
    <div id="${r(e)}" class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 border border-zinc-800 rounded p-3 max-h-56 overflow-y-auto scrollbar-thin">
      ${a.map(n=>`
        <label class="flex items-center gap-2 text-sm cursor-pointer rounded px-1.5 py-1 hover:bg-zinc-800/60">
          <input type="checkbox" class="ag-check checkbox checkbox-sm checkbox-primary" data-id="${r(n.id)}" ${o.has(n.id)?"checked":""} />
          <span class="font-mono text-xs">${r(n.id)}</span>
          ${n.role?`<span class="text-xs text-zinc-500 truncate">${r(n.role)}</span>`:""}
        </label>
      `).join("")}
    </div>
  `}function Qo(e){return Array.from(document.querySelectorAll(`#${e} .ag-check:checked`)).map(t=>t.dataset.id??"").filter(Boolean)}let ee=null,kt=null;function me(){kt&&(clearInterval(kt),kt=null)}function en(){return ee!==null}async function bi(){const e=document.getElementById("sec-tab-reunioes");e&&(me(),e.innerHTML=`
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold flex items-center gap-2">${l("reunioes")} Reuniões ${b("reunioes")}</h1>
    </div>
    <div id="reuniao-sala" class="card p-4 mb-6 ${ee?"":"hidden"}"></div>
    <div class="card p-4 mb-6" id="reunioes-form">${T()}</div>
    <div id="reunioes-lista" class="space-y-4">${T()}</div>
    <div class="card p-4 mt-6" id="reuniao-agenda-form"></div>
    <div id="reuniao-agenda-lista" class="space-y-4 mt-4"></div>
  `,await hi(),await Gt(),$i(),await Kt(),ee&&await Ba(ee))}async function hi(){const e=document.getElementById("reunioes-form");if(!e)return;const t=await fi("reuniao-seletor-agentes",["ceo-documentos","secretario"]);e.innerHTML=`
    <h3 class="font-semibold mb-3 flex items-center gap-2">${l("plus")} Convocar reunião</h3>
    <form id="form-nova-reuniao" class="space-y-4" onsubmit="event.preventDefault(); criarReuniao()">
      <div>
        <label class="block text-xs text-zinc-500 mb-1">Pauta</label>
        <textarea id="reuniao-pauta" rows="3" placeholder="Descreva a pauta da reunião…" required></textarea>
      </div>
      <div>
        <label class="block text-xs text-zinc-500 mb-1">Participantes (marque quem chama — vazio usa o padrão)</label>
        ${t}
      </div>
      <div class="flex gap-2">
        <button type="submit" class="btn">${l("plus")} Convocar</button>
      </div>
    </form>
  `}async function wi(){const e=document.getElementById("reuniao-pauta")?.value.trim();if(!e)return;const t=Qo("reuniao-seletor-agentes");try{const a=await m("/meetings",{method:"POST",body:JSON.stringify({pauta:e,agentes:t.length?t.join(","):void 0})});a.status==="iniciado"&&d(`Reunião ${a.id??""} iniciada em background — acompanhe na Sala ao vivo`,"ok"),document.getElementById("reuniao-pauta").value="",await Gt()}catch(a){d("Erro: "+a.message,"erro")}}async function Gt(){let e;try{e=await m("/meetings")}catch{e=null}const t=document.getElementById("reunioes-lista");if(t){if(!e){t.innerHTML=S("Não foi possível carregar as reuniões.",()=>{Gt()});return}if(!e.length){t.innerHTML=_("reunioes","Nenhuma reunião",'Convoque acima ou use: <code>opencorp meeting start --pauta "..."</code>');return}t.innerHTML=e.map(a=>`
    <div class="card p-4">
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span class="font-mono text-sm">${r(String(a.id))}</span>
            <span class="badge ${a.status==="em-andamento"?"badge-warn":"badge-neutral"}">${r(String(a.status))}</span>
          </div>
          <div class="text-sm mb-1">${r(String(a.pauta))}</div>
          <div class="text-xs text-zinc-500">Participantes: ${r((a.participantes||[]).join(", "))}</div>
          <div class="text-xs text-zinc-500 font-mono mt-1">início: ${r(String(a.criado_em).slice(0,19).replace("T"," "))} ${a.encerrada_em?"· fim: "+r(String(a.encerrada_em).slice(0,19).replace("T"," ")):""}</div>
          ${a.ata?`<a class="text-xs inline-flex items-center gap-1 mt-1" href="/files?path=${encodeURIComponent(String(a.ata))}" target="_blank" rel="noopener">${l("reunioes")} ver ata</a>`:""}
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          ${a.status==="em-andamento"?`<button class="btn btn-ghost text-sm" onclick="abrirSalaViva('${r(String(a.id))}')" aria-label="Abrir sala ao vivo">${l("chat")} Sala ao vivo</button>`:""}
          ${a.status==="em-andamento"?`<button class="btn btn-ghost text-sm" style="color:var(--err)" onclick="encerrarReuniao('${r(String(a.id))}')" aria-label="Encerrar reunião">${l("stop")} Encerrar</button>`:""}
        </div>
      </div>
    </div>
  `).join("")}}async function xi(e){const{modalConfirm:t}=await f(async()=>{const{modalConfirm:a}=await Promise.resolve().then(()=>H);return{modalConfirm:a}},void 0);if(await t(`Encerrar a reunião ${e}? Os turnos param entre falas e a ata é gerada.`,{confirmar:"Encerrar"}))try{await m(`/meetings/${encodeURIComponent(e)}/stop`,{method:"POST"}),d("Interrupção solicitada — a sala encerra entre turnos","ok"),await Gt(),ee===e&&pa()}catch(a){d("Erro: "+a.message,"erro")}}async function Ba(e){ee=e,me();const t=document.getElementById("reuniao-sala");t&&(t.classList.remove("hidden"),t.innerHTML=T("Abrindo sala…"),await pa(),me(),kt=setInterval(()=>{pa()},2e3),t.scrollIntoView({behavior:"smooth",block:"nearest"}))}function tn(){ee=null,me();const e=document.getElementById("reuniao-sala");e&&(e.classList.add("hidden"),e.innerHTML="")}async function pa(){const e=ee;if(!e)return;const t=document.getElementById("reuniao-sala");if(!t){tn();return}let a=null;try{a=await m("/meetings/"+encodeURIComponent(e))}catch{a=null}if(ee===e){if(!a){me(),t.innerHTML=S("Não foi possível carregar a sala (pode não ter existido ou falhar ao iniciar).",()=>{Ba(e)})+`<div class="mt-3"><button class="btn btn-ghost text-sm" onclick="fecharSalaViva()">${l("close")} Fechar painel</button></div>`;return}yi(t,a)}}function yi(e,t){const a=t.status==="em_andamento"||t.status==="agendando",o=t.status==="em_andamento"?'<span class="badge badge-warn">em andamento</span>':t.status==="agendando"?'<span class="badge badge-warn">agendando…</span>':'<span class="badge badge-neutral">encerrada</span>',n=t.consenso,s=n.total>0?`<span class="badge ${n.pedidos>=n.total?"badge-ok":"badge-neutral"}" title="Participantes que sinalizaram [CONSENSO-ENCERRAR]" aria-label="Consenso">${l("check")} ${n.pedidos}/${n.total} pediram encerrar</span>`:"",i=t.participantes.map(p=>r(p.id)).join(", "),c=t.mensagens.length?t.mensagens.map(p=>`
        <div class="border-b border-zinc-800/60 py-2 last:border-b-0">
          <div class="flex items-center gap-2 mb-0.5">
            <span class="font-mono text-xs font-semibold">${r(p.agente)}</span>
            ${p.ts?`<span class="text-xs text-zinc-600 font-mono">${r(p.ts.slice(11,19))}</span>`:""}
          </div>
          <div class="text-sm whitespace-pre-wrap break-words">${r(p.texto)}</div>
        </div>
      `).join(""):'<div class="text-sm text-zinc-500 py-3">Nenhuma fala ainda — os turnos aparecem aqui conforme os agentes respondem.</div>';e.innerHTML=`
    <div class="flex items-start justify-between gap-4 mb-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2 mb-1 flex-wrap">
          <h3 class="font-semibold flex items-center gap-2">${l("reunioes")} Sala ao vivo</h3>
          ${o}
          ${s}
        </div>
        <div class="text-sm mb-0.5"><span class="text-zinc-500">Pauta:</span> ${r(t.pauta)}</div>
        <div class="text-xs text-zinc-500">Participantes: ${i}</div>
        <div class="text-xs text-zinc-500 font-mono">turno: ${t.turno_atual} · abertura: ${r(Le(t.iniciado_em))}</div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        ${a?`<button class="btn btn-ghost text-sm" style="color:var(--err)" onclick="encerrarReuniao('${r(t.id)}')" aria-label="Encerrar reunião">${l("stop")} Encerrar</button>`:""}
        <button class="btn btn-ghost text-sm" onclick="fecharSalaViva()" aria-label="Fechar painel da sala">${l("close")} Fechar painel</button>
      </div>
    </div>
    <div id="reuniao-sala-feed" class="border border-zinc-800 rounded p-3 max-h-96 overflow-y-auto scrollbar-thin">${c}</div>
  `;const u=document.getElementById("reuniao-sala-feed");u&&(u.scrollTop=u.scrollHeight)}function $i(){const e=document.getElementById("reuniao-agenda-form");e&&(e.innerHTML=`
    <h3 class="font-semibold mb-3 flex items-center gap-2">${l("agenda")} Agendar reunião automática ${b("reunioes")}</h3>
    <form id="form-agenda-reuniao" class="space-y-4" onsubmit="event.preventDefault(); criarAgendaReuniao()">
      <div>
        <label class="block text-xs text-zinc-500 mb-1">Pauta da reunião agendada</label>
        <input id="reuniao-ag-pauta" placeholder="Ex.: revisão semanal de custos" required />
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-xs text-zinc-500 mb-1">Frequência</label>
          <select id="reuniao-ag-freq" onchange="atualizarFrequenciaReuniao()">
            <option value="diario">Diária (hora fixa)</option>
            <option value="semanal">Semanal (segundas, hora fixa)</option>
            <option value="intervalo">Intervalo (minutos)</option>
          </select>
        </div>
        <div id="reuniao-ag-hora-container">
          <label class="block text-xs text-zinc-500 mb-1">Hora</label>
          <input id="reuniao-ag-hora" type="time" value="09:00" required />
        </div>
        <div id="reuniao-ag-valor-container" class="hidden">
          <label class="block text-xs text-zinc-500 mb-1">Intervalo (minutos)</label>
          <input id="reuniao-ag-valor" type="number" min="1" placeholder="Ex: 120" />
        </div>
      </div>
      <p class="text-xs text-zinc-500">Participantes: usa o check-list de agentes do form "Convocar" acima (vazio usa o padrão). A rotina roda <code class="font-mono">meeting iniciar --pauta "…" --nao-interativo</code> headless.</p>
      <div class="flex gap-2">
        <button type="submit" class="btn">${l("agenda")} Agendar</button>
      </div>
    </form>
  `)}function ki(){const e=document.getElementById("reuniao-ag-freq")?.value,t=document.getElementById("reuniao-ag-hora-container"),a=document.getElementById("reuniao-ag-valor-container");if(!t||!a)return;const o=e==="diario"||e==="semanal";t.classList.toggle("hidden",!o),a.classList.toggle("hidden",o)}async function Ei(){const e=document.getElementById("reuniao-ag-pauta")?.value.trim(),t=document.getElementById("reuniao-ag-freq")?.value;if(!e||!t){d("Preencha a pauta e a frequência para agendar a reunião","erro");return}let a="cron",o="";if(t==="intervalo"){const c=Number(document.getElementById("reuniao-ag-valor")?.value);if(!Number.isFinite(c)||c<1){d("Informe o intervalo em minutos (≥ 1)","erro");return}a="intervalo_min",o=String(c)}else{const c=document.getElementById("reuniao-ag-hora")?.value??"",[u,p]=c.split(":").map(Number);if(!Number.isFinite(u)||!Number.isFinite(p)){d("Informe a hora da reunião","erro");return}o=`${p} ${u} * * ${t==="semanal"?"1":"*"}`}const n=Qo("reuniao-seletor-agentes"),s=["meeting","iniciar","--pauta",e,"--nao-interativo"];n.length&&s.push("--agentes",n.join(","));const i=`reuniao-${e.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,30)||"auto"}-${Date.now().toString(36).slice(-4)}`;try{await m("/schedules",{method:"POST",body:JSON.stringify({nome:i,agenda_tipo:a,agenda_valor:o,args:s,workspace:k()||void 0})}),d("Reunião agendada — veja na aba Agenda","ok"),document.getElementById("reuniao-ag-pauta").value="",await Kt()}catch(c){d("Erro: "+c.message,"erro")}}async function Kt(){const e=document.getElementById("reuniao-agenda-lista");if(!e)return;let t;try{t=await w("/schedules")}catch{t=null}if(!t){e.innerHTML=S("Não foi possível carregar as rotinas de reunião.",()=>{Kt()});return}const a=t.filter(o=>Array.isArray(o.args)&&o.args[0]==="meeting");if(!a.length){e.innerHTML='<p class="text-xs text-zinc-500">Nenhuma reunião automática agendada — gerencie todas as rotinas na aba <a href="/agenda" class="underline">Agenda</a>.</p>';return}e.innerHTML=`
    <h4 class="text-sm font-semibold text-zinc-400">Rotinas de reunião (${a.length})</h4>
  `+a.map(o=>`
    <div class="card p-3">
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span class="font-medium text-sm">${r(String(o.nome))}</span>
            <span class="badge ${_i(o)}">${r(String(o.agenda?.tipo))}</span>
            <span class="badge ${o.ativo?"badge-ok":"badge-neutral"}">${o.ativo?"ativa":"pausada"}</span>
          </div>
          <div class="text-xs text-zinc-400 mb-1">${Sa(o)}</div>
          <div class="text-xs text-zinc-500 font-mono truncate">${r(o.args.join(" "))}</div>
          ${o.proxima_exec?`<div class="text-xs text-zinc-500 font-mono mt-1">próxima: ${r(Le(String(o.proxima_exec)))}</div>`:""}
        </div>
        <button class="btn btn-ghost text-sm flex-shrink-0" style="color:var(--err)" onclick="excluirRotinaReuniao('${r(String(o.id))}')" aria-label="Excluir rotina">${l("trash")} Excluir</button>
      </div>
    </div>
  `).join("")}function _i(e){const t=String(e.agenda?.tipo);return t==="cron"?"badge-pipeline":t==="intervalo_min"?"badge-review":"badge-warn"}async function Ti(e){const{modalConfirm:t}=await f(async()=>{const{modalConfirm:a}=await Promise.resolve().then(()=>H);return{modalConfirm:a}},void 0);if(await t("Excluir esta rotina de reunião?",{confirmar:"Excluir"}))try{await m("/schedules/"+encodeURIComponent(e),{method:"DELETE"}),d("Rotina excluída","ok"),await Kt()}catch(a){d("Erro: "+a.message,"erro")}}function We(e){const t=e.updated_at??e.created_at;if(t){const o=new Date(t);if(!isNaN(o.getTime()))return o}const a=e.updated??e.created;return typeof a=="number"?new Date(a):null}function zt(e){const t=(e.titulo_real||e.title||"Sem título").trim();return t.length>60?t.slice(0,59)+"…":t}function an(e){const t=Math.round((Date.now()-e.getTime())/6e4);if(t<2)return"agora";if(t<60)return`${t}min`;const a=Math.round(t/60);if(a<24)return`${a}h`;const o=new Date;return o.setDate(o.getDate()-1),o.setHours(0,0,0,0),e>=o?`ontem ${String(e.getHours()).padStart(2,"0")}:${String(e.getMinutes()).padStart(2,"0")}`:`${String(e.getDate()).padStart(2,"0")}/${String(e.getMonth()+1).padStart(2,"0")}`}function Ra(e){const t={Hoje:[],Ontem:[],Anteriores:[]},a=new Date;a.setHours(0,0,0,0);const o=new Date(a);o.setDate(o.getDate()-1);const n=i=>We(i)?.getTime()??0,s=[...e].sort((i,c)=>n(c)-n(i));for(const i of s){const c=We(i);if(!c){t.Anteriores.push(i);continue}c>=a?t.Hoje.push(i):c>=o?t.Ontem.push(i):t.Anteriores.push(i)}return["Hoje","Ontem","Anteriores"].filter(i=>t[i].length).map(i=>({grupo:i,itens:t[i]}))}function Si(e,t,a){const o=t.toLowerCase();return e.filter(n=>(n.id===a||!n.sem_conteudo)&&(!o||zt(n).toLowerCase().includes(o)))}const Me=R([]),te=R(null),x=R([]),Ai=R("secretario-exec"),Xe=R(!1),Ii=R(""),ht=R([]),Pt=R(0),lo=R([]),Li=R(null),uo=R(null),ma=R(0),Ht=R("conversa"),Qc=R(!0),Ci=Co([Me,Ii,te],([e,t,a])=>Si(e,t,a)),el=Co(Ci,e=>Ra(e));let j=null,J=[],de=!1,tt=[];Me.subscribe(e=>e);te.subscribe(e=>j=e);x.subscribe(e=>J=e);Xe.subscribe(e=>de=e);ht.subscribe(e=>tt=e);Pt.subscribe(e=>e);ma.subscribe(e=>e);let ce=null,X=null,ae=null,Et=null,po=0,mo=0,na=null;const vo=2e3,Mi=900*1e3,zi=60*1e3;function on(){try{return typeof window<"u"?window:globalThis.window??null}catch{return null}}function Nt(){try{const e=on();if(!e)return;const t=j?"/secretario?sessao="+encodeURIComponent(j):"/secretario";e.location.pathname+e.location.search!==t&&e.history.replaceState(null,"",t)}catch{}}function Pi(){const e=on();if(!e)return null;const t=e.location.hash.split("?")[1]??"";return t?new URLSearchParams(t).get("sessao"):new URLSearchParams(e.location.search).get("sessao")}async function ke(){try{const e=await w("/secretario/sessoes");Me.set(e)}catch{Me.set([])}}async function rt(e){try{const t=await w(`/secretario/sessoes/${encodeURIComponent(e)}/mensagens`);return x.set(t||[]),!0}catch{return x.set([]),!1}}async function nn(){try{const e=await w("/secretario/status");return Li.set(e),uo.set(null),e}catch(e){return uo.set(e.message),null}}async function wt(){try{const e=k(),t=e?`?workspace=${encodeURIComponent(e)}`:"",a=await w("/approvals"+t);lo.set((a??[]).filter(o=>o.status==="pendente"))}catch{lo.set([])}}async function tl(e){const t=k(),a=t?`?workspace=${encodeURIComponent(t)}`:"";await w("/approvals/"+encodeURIComponent(e)+"/approve"+a,{method:"POST"}),d("Aprovado — o agente retoma em instantes","ok"),await wt()}async function al(e,t){const a=k(),o=a?`?workspace=${encodeURIComponent(a)}`:"";await w("/approvals/"+encodeURIComponent(e)+"/reject"+o,{method:"POST",body:JSON.stringify({motivo:t})}),d("Rejeitado","ok"),await wt()}function sn(){Oa(),po=Date.now(),ma.set(0),Et=setInterval(()=>{ma.set(Math.floor((Date.now()-po)/1e3))},1e3)}function Oa(){Et&&(clearInterval(Et),Et=null)}function Yt(){X!==null&&(clearTimeout(X),X=null),ae=null}function Da(){de||(Xe.set(!0),ce=new AbortController,sn())}function W(){Xe.set(!1),ce=null,Oa(),X!==null&&(clearTimeout(X),X=null),ae=null}function rn(e){const t=J[J.length-1];if(!e||!t)return;if(t.role==="user"){Hi(e);return}if(t.concluida!==!1)return;Da(),Yt(),ae=e;const a=Date.now(),o=async()=>{if(ae!==e||j!==e||Date.now()-a>Mi){W();return}const n=[...J];if(await rt(e)||x.set(n),ae!==e||j!==e){W();return}const i=J[J.length-1];if(!i||i.role!=="assistant"){W();return}if(i.concluida!==!1){W();return}X=setTimeout(()=>{o()},vo)};X=setTimeout(()=>{o()},vo)}function Hi(e){Da(),Yt(),ae=e;const t=Date.now(),a=async()=>{if(ae!==e||j!==e||Date.now()-t>zi){d("A última mensagem ficou sem resposta — reenvie","aviso"),W();return}const o=[...J];if(await rt(e)||x.set(o),ae!==e||j!==e){W();return}const s=J[J.length-1];if(s&&s.role==="assistant"){rn(e);return}X=setTimeout(()=>{a()},3e3)};X=setTimeout(()=>{a()},3e3)}function go(e){const t=e.dados??e,a=typeof t.sessao_id=="string"?t.sessao_id:"",o=typeof t.fase=="string"?t.fase:"";if(o==="hitl"){wt(),ke();return}if(a&&!(de&&a===j&&!ae)){if(a===j&&(o==="inicio"||o==="delta"||o==="pensamento")){de||Da();const n=Date.now();if(na)return;const s=Math.max(0,1500-(n-mo));na=setTimeout(()=>{na=null,mo=Date.now(),rt(a)},s);return}if(a===j&&(o==="fim"||o==="erro")){rt(a).then(()=>{de&&W()}),ke();return}(o==="inicio"||o==="fim"||o==="erro")&&ke()}}function Ni(){de&&(ce?.abort(),W(),d("Conversa anterior interrompida — nova conversa iniciada","aviso")),te.set(null),x.set([]),Pt.set(0),Yt(),Nt(),bt()}async function cn(e){de||(te.set(e),Nt(),await rt(e),rn(e))}async function ol(){await m("/secretario/start",{method:"POST"}),d("Secretário iniciado","ok"),(await nn())?.rodando&&await ke()}function nl(e){if(e)for(const t of Array.from(e)){const a=new FileReader;t.type.startsWith("image/")?(a.onload=()=>{ht.update(o=>[...o,{nome:t.name,mime:t.type,url:String(a.result)}])},a.readAsDataURL(t)):(a.onload=()=>{const o=String(a.result??""),n=o.length>12e4?o.slice(0,12e4)+`
…(truncado)`:o,s=Wt(),i=(s?s+`

`:"")+`--- arquivo: ${t.name} ---
${n}
--- fim: ${t.name} ---`;Ne(i)},a.readAsText(t))}}function sl(e){ht.update(t=>t.filter((a,o)=>o!==e))}async function il(e){if(de){if(e.trim()){d("Resposta em andamento — aguarde ou interrompa para enviar","aviso");return}ce?.abort(),W(),d("Parado — a geração continua no servidor; reabra a conversa para retomar","aviso");return}const t=e.trim();if(!t)return;const a=Vo(t);if(a.terminal){await Ri(a.terminal.comando,t);return}if(a.comando&&La.some(s=>s.nome===a.comando.nome)){await Bi(a.comando);return}Xe.set(!0),sn(),ce=new AbortController,Pt.set(0),Yt();const o=J.length+1;x.update(s=>[...s,{role:"user",content:t,imagens:tt.length?tt.map(i=>i.url):void 0},{role:"assistant",content:""}]),bt();const n=tt.length?[...tt]:void 0;try{const{headers:s}=await f(async()=>{const{headers:v}=await import("./svelte-app.js").then(h=>h.aq);return{headers:v}},__vite__mapDeps([0,1])),i=k(),c=i?"?workspace="+encodeURIComponent(i):"",u=await fetch("/secretario/conversa/stream"+c,{method:"POST",headers:s(),body:JSON.stringify({mensagem:a.textoLimpo||t,sessao_id:j||void 0,agente:q(Ai),imagens:n,contexto:a.contexto.length?a.contexto:void 0}),signal:ce.signal});ht.set([]);const p=u.headers.get("content-type")??"";if(!u.ok||!p.includes("text/event-stream"))if(u.ok){const v=await u.json();x.update(h=>{const y=[...h];return y[o]&&(y[o].content=v.resposta),y}),te.set(v.sessao_id)}else{const v=await u.json().catch(()=>({}));throw new Error(v.erro??`HTTP ${u.status}`)}else{const v=u.body.getReader(),h=new TextDecoder;let y="",I=!1;for(;!I;){const{done:Y,value:he}=await v.read();if(Y)break;y+=h.decode(he,{stream:!0});const we=y.split(`

`);y=we.pop()??"";for(const aa of we){let Z="message",Be="";for(const M of aa.split(`
`))M.startsWith("event:")?Z=M.slice(6).trim():M.startsWith("data:")&&(Be+=M.slice(5).trim());if(!Be)continue;const C=JSON.parse(Be);if(Z==="inicio")C.sessao_id&&(te.set(C.sessao_id),Nt());else if(Z==="acao")C.acoes!==void 0&&Pt.set(C.acoes),C.itens&&x.update(M=>{const L=[...M];return L[o]&&(L[o].acoes=C.itens),L});else if(Z==="pensamento")x.update(M=>{const L=[...M],Re=L[o];return Re&&(Re.pensamento||(Re.pensamento=""),Re.pensamento+=C.delta??""),L});else if(Z==="delta")x.update(M=>{const L=[...M];return L[o]&&(L[o].content+=C.delta??""),L});else if(Z==="fim")C.resposta&&x.update(M=>{const L=[...M];return L[o]&&(L[o].content=C.resposta),L}),C.sessao_id&&(te.set(C.sessao_id),Nt()),I=!0;else if(Z==="erro")throw new Error(C.erro??"erro no stream")}}if(!q(x)[o]?.content)throw new Error("resposta vazia do servidor")}await ke()}catch(s){const i=s;i.name==="AbortError"?d("Interrompido — o processamento continua no servidor; reabra a conversa para ver a resposta completa","aviso"):(d(i.message,"erro"),j?x.update(c=>c.slice(0,-1)):x.update(c=>c.slice(0,-2)))}finally{Xe.set(!1),ce=null,Oa()}}async function Bi(e){if(e.nome==="limpar"){Ni();return}x.update(a=>[...a,{role:"user",content:"/"+e.nome+(e.args?" "+e.args:"")},{role:"assistant",content:""}]);const t=q(x).length-1;bt();try{const a=await qa(e.nome);x.update(o=>{const n=[...o];return n[t]&&(n[t].content=a),n})}catch(a){x.update(o=>{const n=[...o];return n[t]&&(n[t].content="⚠ "+a.message),n})}}async function qa(e){switch(e){case"status":{const[t,a]=await Promise.all([w("/status").catch(()=>null),w("/tasks").catch(()=>null)]),o=(a??[]).reduce((s,i)=>(s[i.coluna]=(s[i.coluna]??0)+1,s),{}),n=Object.values(o).reduce((s,i)=>s+i,0);return["**Estado da empresa**",`- Scheduler: ${t?.scheduler?"🟢 rodando":"🔴 parado"}`,`- Secretário: ${t?.secretario?"🟢 rodando":"🔴 parado"}`,`- Tasks: ${n}`+(n?` — ${Object.entries(o).map(([s,i])=>`${s} ${i}`).join(" · ")}`:"")].join(`
`)}case"tasks":{const t=await w("/tasks");if(!t.length)return"Board vazio — nenhuma task.";const a=t.length>8?`
… +${t.length-8} tasks`:"";return`**Board de tasks**
`+t.slice(0,8).map(o=>`- [${o.coluna}] ${o.titulo}`).join(`
`)+a}case"custos":{const t=await w("/budget/status");return`**Custos de hoje** (${t.estado?.dia??new Date().toISOString().slice(0,10)})
- Workspace: $${(t.estado?.workspace_usd_hoje??0).toFixed(4)}`+(t.limites?.daily_usd?`
- Limite diário: $${t.limites.daily_usd}`:"")}case"fluxos":{const t=await w("/flows");return t.length?`**Flows**
`+t.map(a=>`- ${a.id}${a.nome&&a.nome!==a.id?" — "+a.nome:""}`).join(`
`):"Nenhum flow disponível."}case"agenda":{const t=await w("/schedules");return t.length?`**Rotinas agendadas**
`+t.map(a=>`- ${a.nome} — ${a.agenda.tipo} ${a.agenda.valor} ${a.ativo?"· ativa":"· pausada"}`).join(`
`):"Nenhuma rotina agendada."}case"agentes":{const t=await w("/agents");return t.length?`**Equipe**
`+t.map(a=>`- **${a.id}**${a.role?" — "+a.role:""}`).join(`
`):"Nenhum agente configurado."}default:throw new Error(`comando /${e} não suportado`)}}async function Ri(e,t){x.update(o=>[...o,{role:"user",content:t},{role:"assistant",content:""}]);const a=q(x).length-1;bt();try{const o=await m("/terminal",{method:"POST",body:JSON.stringify({comando:e})}),n=o.saida||"(sem saída)";x.update(s=>{const i=[...s];return i[a]&&(i[a].content=n,i[a].terminal=`$ ${e}
${n}`+(o.codigo!==0?`
[código de saída: ${o.codigo}]`:"")),i})}catch(o){x.update(n=>{const s=[...n];return s[a]&&(s[a].content="⚠ "+o.message),s})}}async function Oi(){if(Ht.set("conversa"),me(),!(await nn())?.rodando)return;await ke();const t=Pi(),a=q(Me),o=q(te);t&&t!==o&&a.some(n=>n.id===t)?await cn(t):!t&&!o&&await Di(),wt()}async function Di(){const t=[...q(Me)].sort((a,o)=>(We(o)?.getTime()??0)-(We(a)?.getTime()??0))[0];if(t)try{const a=await w(`/secretario/sessoes/${encodeURIComponent(t.id)}/mensagens`);if(!a.length)return;const o=a[a.length-1],n=o.role==="assistant"&&o.concluida===!1||o.role==="user"&&!!o.criado_em&&Date.now()-new Date(o.criado_em).getTime()<10*6e4;await cn(t.id),n&&d("Resposta em andamento — conversa reaberta","aviso")}catch{}}async function rl(e){const t=q(x)[e];t&&await navigator.clipboard.writeText(t.content)}async function cl(e){const t=q(x),a=t[e];if(!a||a.role!=="user"){d("Só é possível editar prompts do usuário","aviso");return}q(Xe)&&(ce?.abort(),W(),d("Execução interrompida para edição","aviso"),await new Promise(c=>setTimeout(c,600)));const o=a.content,n=a.imagens?[...a.imagens]:[],s=e;x.set(t.slice(0,s));const i=q(te);if(i)try{const{headers:c}=await f(async()=>{const{headers:p}=await import("./svelte-app.js").then(v=>v.aq);return{headers:p}},__vite__mapDeps([0,1])),u=await fetch(`/secretario/sessoes/${encodeURIComponent(i)}/truncar`,{method:"POST",headers:c(),body:JSON.stringify({manter_ate:s})});if(!u.ok){const p=await u.json().catch(()=>({erro:`HTTP ${u.status}`}));d(p.erro||"Falha ao truncar histórico no servidor","aviso")}}catch(c){d("Falha de rede ao truncar: "+c.message,"aviso")}ht.set(n.map((c,u)=>{const p=c.match(/^data:([^;]+);/),v=p?p[1]:"image/png";return{nome:`imagem-${u+1}.png`,mime:v,url:c}})),Ne(o)}async function qi(){q(Me).length||await ke(),await wt()}let et=null,sa=null;async function Bt(e="conversa"){const t=document.getElementById("view-secretario");if(!t)return;if(e!=="reunioes"&&me(),e==="reunioes"){if(Ht.set("reunioes"),et&&sa===t)return}else Ht.set("conversa");if(et&&sa){try{et?.unmount?.()}catch{}et=null}t.innerHTML="",sa=t;const{mount:a}=await f(async()=>{const{mount:n}=await import("./svelte-app.js").then(s=>s.an);return{mount:n}},__vite__mapDeps([0,1])),{default:o}=await f(async()=>{const{default:n}=await import("./svelte-BzABqhpW.js");return{default:n}},__vite__mapDeps([2,0,1,3]));et=a(o,{target:t,props:{abaInicial:e}}),Oi()}function ln(e){Ht.set(e),Bt(e)}async function ji(){await qi();const{icone:e}=await f(async()=>{const{icone:a}=await import("./svelte-app.js").then(o=>o.ap);return{icone:a}},__vite__mapDeps([0,1])),t=document.getElementById("lat-enviar");t&&!t.innerHTML.trim()&&(t.innerHTML=e("run"))}const ja=Object.freeze(Object.defineProperty({__proto__:null,agruparSessoes:Ra,dataSessao:We,eventoRemotoSecretario:go,eventoRemotoSecretarioCompat:go,renderChatLateral:ji,renderSecretario:Bt,resolverComandoProprio:qa,secretarioAba:ln,tempoRelativo:an,tituloSessao:zt},Symbol.toStringTag,{value:"Module"}));function Fi(){const e=new Date,t=String(e.getMonth()+1).padStart(2,"0"),a=String(e.getDate()).padStart(2,"0");return`${e.getFullYear()}-${t}-${a}`}function fo(e){return`<span class="hub-dot" style="background:${e===void 0?"#737373":e?"var(--ok)":"var(--err)"}"></span>`}async function Fa(){const e=document.getElementById("view-home");if(!e)return;e.innerHTML.trim()||(e.innerHTML=T("Carregando hub…"));const[t,a,o,n,s,i]=await Promise.allSettled([m("/status"),m("/approvals"),m("/budget/status"),m("/tasks"),m("/flows"),m("/notifications")]),c=se=>se.status==="fulfilled"?se.value:null,u=c(t),p=c(a),v=c(o),h=c(n),y=c(s),I=c(i),K=!u&&!p&&!v&&!h&&!y&&!I,Y=k();if(K){e.innerHTML=Y?S("Não foi possível carregar os dados da empresa.",()=>{Fa()}):_("home","Selecione uma empresa","Escolha um workspace na barra lateral para ver os dados dela aqui.");return}const he=(p||[]).filter(se=>se.status==="pendente"),we=Fi(),aa=(h||[]).filter(se=>String(se.coluna)!=="feito"&&typeof se.due=="string"&&se.due.slice(0,10)<we).length,Z=v?.estado?.workspace_usd_hoje??0,Be=v?.limites?.daily_usd??0,C=y?y.length:null,M=I?.resumo?.nao_lidas??0,L=Ts(),Re=(y||[]).slice(0,4),_s=`
    <div class="kpi-card" data-kpi="tasks-vencidas" onclick="navegar('tasks')" style="cursor:pointer" title="Tasks com prazo vencido e fora de 'feito'">
      <div class="kpi-value">${h?aa:"—"}</div>
      <div class="kpi-label">Tasks vencidas ${b("tasks")}</div>
    </div>
    <div class="kpi-card" data-kpi="custos" onclick="navegar('config')" style="cursor:pointer" title="Consumo do workspace hoje">
      <div class="kpi-value">${v?"$"+Z.toFixed(2):"—"}</div>
      <div class="kpi-label">Custos do dia${v&&Be>0?" · teto $"+Be.toFixed(2):""} ${b("budget")}</div>
    </div>
    <div class="kpi-card" id="kpi-saude" data-kpi="saude" onclick="navegar('agenda')" style="cursor:pointer" title="scheduler: ${u?u.scheduler?"rodando":"parado":"desconhecido"} · secretário: ${u?u.secretario?"rodando":"parado":"desconhecido"}">
      <div class="kpi-value" style="display:flex;align-items:center;gap:.4rem;min-height:2.4rem">
        ${u?fo(u.scheduler)+fo(u.secretario):'<span class="text-zinc-500">—</span>'}
      </div>
      <div class="kpi-label">${u&&u.scheduler!==void 0&&u.secretario!==void 0?`scheduler ${u.scheduler?"ok":"parado"} / secretário ${u.secretario?"ok":"parado"}`:"saúde desconhecida"} ${b("agenda")}</div>
    </div>
    <div class="kpi-card" data-kpi="fluxos" onclick="navegar('fluxos')" style="cursor:pointer" title="Linhas de pensamento definidas no workspace">
      <div class="kpi-value">${C===null?"—":C}</div>
      <div class="kpi-label">Fluxos ativos ${b("flows")}</div>
    </div>
    <div class="kpi-card" data-kpi="notificacoes" onclick="navegar('notificacoes')" style="cursor:pointer;${M>0?"border-color:rgba(251,191,36,.55);background:rgba(251,191,36,.06)":""}" title="Avisos dos agentes não lidos">
      <div class="kpi-value"${M>0?' style="color:var(--warn)"':""}>${I?M:"—"}</div>
      <div class="kpi-label">Notificações não lidas ${b("notificacoes")}</div>
    </div>
  `;e.innerHTML=`
    <div class="page-header">
      <div class="page-header-esq">
        <h1 class="page-header-titulo">${l("home")} Início</h1>
        <p class="page-header-sub">Visão geral da empresa · ${r(Y||"selecione uma empresa")}</p>
      </div>
      <div class="page-header-acoes">
        <span class="help-wrap">${b("home")}</span>
        <button class="btn" onclick="navegar('tasks');setTimeout(()=>document.getElementById('task-titulo')?.focus(),100)">${l("plus")} Nova task</button>
        <button class="btn btn-ghost" onclick="abrirWizard()">${l("spark")} Criar empresa</button>
      </div>
    </div>
    <div class="hub-header card p-4 mb-5">
      <div class="hub-header-esq">
        <button class="hub-ws" onclick="toggleSidebar(true)" title="Trocar empresa">
          ${l("home")} <span class="font-mono font-semibold">${r(Y||"— empresa —")}</span> <span class="hub-ws-count">${L.length?L.length+" empresa(s)":""}</span>
        </button>
      </div>
      <div class="hub-acoes">
        <button class="btn" onclick="navegar('tasks');setTimeout(()=>document.getElementById('task-titulo')?.focus(),100)">${l("plus")} Nova task</button>
        <button class="btn" onclick="promptOrdem()">${l("run")} Run agente</button>
        <button class="btn btn-ghost" onclick="abrirWizard()">${l("spark")} Criar empresa</button>
      </div>
    </div>

    <div class="zona-rotulo">Informações importantes ${b("home")}</div>
    <div class="kpi-grid mb-5">${_s}</div>

    <div class="zona-rotulo">Ações e avisos ${b("feed")}</div>
    <div class="home-grid mb-5">
      <section class="card" id="card-acoes">${di()}</section>
      <section class="card" id="card-nao-vistas">${ui()}</section>
    </div>

    <div class="zona-rotulo">Comando ao Secretário ${b("home-comando")}</div>
    <section class="card p-4 mb-5">
      <div class="flex items-stretch gap-2">
        <textarea id="home-comando" rows="1" placeholder="Envie um comando ao Secretário — / comandos, @ contexto, ! terminal…" onkeydown="window.__homeComandoTecla(event)" oninput="window.__homeComandoInput(this.value)"></textarea>
        <button class="btn flex-shrink-0" onclick="window.__homeComandoEnviar()" title="Enviar ao Secretário (ou executar / e !)" aria-label="Enviar comando">${l("run")}</button>
      </div>
      <div id="home-comando-resultado" class="mt-3" style="display:none"></div>
    </section>

    <div class="zona-rotulo">Sistema e atalhos ${b("config")}</div>
    <section class="card p-4 mb-5">
      <div class="hub-sistema">
        <button class="hub-card" onclick="navegar('config')">
          ${l("gear")} <span><b>Config</b><small>preferências, orçamento, segurança</small></span>
        </button>
        <button class="hub-card" onclick="navegar('config');setTimeout(()=>window.__cfgAba?.('secrets'),350)">
          ${l("key")} <span><b>Secrets</b><small>credenciais — valores nunca exibidos</small></span>
        </button>
        <button class="hub-card" onclick="navegar('config');setTimeout(()=>window.__cfgAba?.('ferramentas'),350)">
          ${l("apps")} <span><b>Ferramentas</b><small>specs em .opencorp/tools</small></span>
        </button>
        <div class="hub-card hub-card-static" title="Rode no terminal">
          ${l("shield")} <span><b>Doutor</b><small><code>opencorp doctor</code> no CLI</small></span>
        </div>
      </div>
    </section>

    <div class="zona-rotulo">Aprovações ${b("hitl")}</div>
    <section class="card p-4 mb-5" id="aprovs-pendentes"></section>

    <div class="zona-rotulo">Linhas de pensamento ${b("flows")}</div>
    <section class="card p-4 mb-5" id="hub-flows"></section>

    <div class="zona-rotulo">Feed ao vivo <span class="badge badge-neutral">todas as empresas</span> ${b("feed")}</div>
    <section class="card p-4">
      <div id="feed-atividade" class="scrollbar-thin max-h-96 overflow-y-auto"></div>
    </section>
  `,Ui(),Ki(),Wi(he),Xi(Re,(y||[]).length),Zo(),Xt()}function Ui(){const e=window;e.__homeComandoTecla=t=>{Vs(t)||t.key==="Enter"&&!t.shiftKey&&(t.preventDefault(),bo())},e.__homeComandoInput=t=>{const a=document.getElementById("home-comando");a&&Js(t,a)},e.__homeComandoEnviar=()=>{bo()}}async function bo(){const e=document.getElementById("home-comando");if(!e)return;const t=e.value.trim();if(!t)return;const a=document.getElementById("home-comando-resultado"),o=Vo(t);if(o.terminal){le(),e.value="",await Vi(o.terminal.comando,a);return}if(o.comando&&La.some(s=>s.nome===o.comando.nome)){le(),e.value="",await Ji(o.comando,a);return}le(),Ne(o.textoLimpo||t),e.value="";const{navegar:n}=await f(async()=>{const{navegar:s}=await Promise.resolve().then(()=>G);return{navegar:s}},void 0);n("secretario"),d("Comando levado ao Secretário — aperte Enter para enviar","ok")}async function Vi(e,t){if(t){t.style.display="",t.innerHTML=`<pre class="terminal-saida">${r("$ "+e)}
…executando</pre>`;try{const a=await m("/terminal",{method:"POST",body:JSON.stringify({comando:e})}),o=a.saida||"(sem saída)";t.innerHTML=`<pre class="terminal-saida">${r("$ "+e+`
`+o)}${a.codigo!==0?r(`
[código de saída: `+a.codigo+"]"):""}</pre>`,d(a.codigo===0?"Terminal executado":`Terminal encerrou com código ${a.codigo}`,a.codigo===0?"ok":"aviso")}catch(a){t.innerHTML=`<pre class="terminal-saida">${r("$ "+e+`
⚠ `+a.message)}</pre>`,d("Erro: "+a.message,"erro")}}}async function Ji(e,t){if(t){if(e.nome==="limpar"){Ne("");const{navegar:a}=await f(async()=>{const{navegar:o}=await Promise.resolve().then(()=>G);return{navegar:o}},void 0);a("secretario"),d("Nova conversa pronta no Secretário","ok");return}t.style.display="",t.innerHTML=`<div class="text-sm text-zinc-400">/${r(e.nome)} — carregando…</div>`;try{const a=await qa(e.nome);t.innerHTML=`<div class="border border-zinc-800 rounded-lg p-3 text-sm">${Mt(a)}</div>`}catch(a){t.innerHTML=`<div class="text-sm" style="color:var(--err)">⚠ ${r(a.message)}</div>`}}}function Wi(e){const t=document.getElementById("aprovs-pendentes");if(t){if(!e.length){t.innerHTML=_("chat","Nenhuma aprovação pendente","Ações sensíveis (git push, npm publish…) pausam aqui esperando você.");return}t.innerHTML=e.map(a=>`
    <div class="approval-row">
      <div>
        <div class="font-mono text-xs">${String(a.id).slice(-8)}</div>
        <div class="text-xs text-zinc-400">${r(String(a.padrao||a.pattern||"—"))}</div>
      </div>
      <div class="approval-actions">
        <button class="btn btn-ghost" onclick="decidirAprovacao('${r(String(a.id))}', true)">${l("check")} Aprovar</button>
        <button class="btn" style="background:var(--err)" onclick="decidirAprovacao('${r(String(a.id))}', false)">${l("close")} Rejeitar</button>
      </div>
    </div>
  `).join("")}}function Xi(e,t){const a=document.getElementById("hub-flows");if(a){if(!e.length){a.innerHTML=`
      <div class="flex items-center justify-between gap-2 mb-2">
        <span class="text-sm text-zinc-400">O CEO analisa o board e abre tasks sozinho com elas.</span>
        <a class="btn-ghost text-xs" onclick="navegar('fluxos')" href="/fluxos">ver fluxos →</a>
      </div>
      ${_("fluxos","Nenhum fluxo no workspace","Crie com <code>opencorp flow create</code> ou instale as linhas de pensamento padrão.")}`;return}a.innerHTML=`
    <div class="flex items-center justify-between gap-2 mb-2">
      <span class="text-sm text-zinc-400">Executáveis a um clique:</span>
      <a class="btn-ghost text-xs" onclick="navegar('fluxos')" href="/fluxos">ver todas (${t}) →</a>
    </div>
    <div class="hub-flows-lista">
      ${e.map(o=>`
        <div class="hub-flow">
          <div class="min-w-0">
            <div class="font-mono text-sm truncate">${r(String(o.id))}</div>
            ${o.nome?`<div class="text-xs text-zinc-500 truncate">${r(String(o.nome))}</div>`:""}
          </div>
          <button class="btn btn-ghost text-xs flex-shrink-0" onclick="rodarFlowHub('${r(String(o.id))}')">${l("run")} Rodar agora</button>
        </div>
      `).join("")}
    </div>
  `}}async function Gi(e){const{modalPrompt:t}=await f(async()=>{const{modalPrompt:o}=await Promise.resolve().then(()=>H);return{modalPrompt:o}},void 0),a=await t({titulo:"Executar flow "+e,label:"Entrada (texto livre ou vazio):",multiline:!0});if(a!==null)try{await m("/flows/"+encodeURIComponent(e)+"/run",{method:"POST",body:JSON.stringify({entrada:a})}),d("Flow executando — acompanhe no Feed e no Histórico","ok")}catch(o){d("Erro: "+o.message,"erro")}}function Ki(){const e=document.getElementById("feed-atividade");e&&!e.innerHTML&&(e.innerHTML=_("spark","Aguardando eventos…","Atividade aparecerá aqui conforme tasks, sessões, hooks e teams gerarem eventos."))}function Yi(e){const t=document.getElementById("feed-atividade");if(!t)return;t.querySelector(".empty-state")&&(t.innerHTML="");const a=String(e.tipo||"desconhecido");let o="tasks",n="task";a.startsWith("sessao")?(o="run",n="sessao"):a.startsWith("hook")?(o="spark",n="hook"):a.startsWith("team")&&(o="teams",n="team");const s=Le(new Date().toISOString()),i=JSON.stringify(e).slice(0,120),c=document.createElement("div");for(c.className="feed-item",c.innerHTML='<span class="feed-icon '+n+'">'+l(o)+'</span><div class="feed-text"><div>'+r(i)+'</div><div class="meta">'+s+"</div></div>",t.prepend(c);t.children.length>30;)t.removeChild(t.lastChild)}async function Zi(e,t){await m("/approvals/"+e+(t?"/approve":"/reject"),{method:"POST",body:JSON.stringify({motivo:"web"})}),d(t?"Aprovação registrada":"Aprovação rejeitada",t?"ok":"aviso"),Jt()==="home"&&Fa()}async function Qi(){const{navegar:e}=await f(async()=>{const{navegar:t}=await Promise.resolve().then(()=>G);return{navegar:t}},void 0);e("agentes"),d("Escolha o agente e clique em Chamar","ok")}let A=null,_t=!1;const dn={backlog:"Tasks na fila — ninguém pegou ainda.",fazendo:"Em execução por um agente neste momento.",bloqueado:"Paradas: falta algo (dependência, aprovação HITL, erro).",feito:"Concluídas. Histórico fica em Histórico."};async function U(){const e=document.getElementById("view-tasks");if(!e)return;e.innerHTML.trim()||(e.innerHTML=T("Carregando tasks…"));let t;try{t=await m("/tasks")}catch{t=null}if(!t){e.innerHTML=S("Não foi possível carregar o task board.",()=>{U()});return}const a=["backlog","fazendo","bloqueado","feito"],o=[...new Set(t.map(i=>String(i.coluna)))].filter(i=>!a.includes(i)),n=[...a,...o];e.innerHTML=`
    <div class="page-header">
      <div class="page-header-esq">
        <h1 class="page-header-titulo">${l("tasks")} Tasks</h1>
        <p class="page-header-sub">Kanban · backlog → fazendo → bloqueado → feito</p>
      </div>
      <div class="page-header-acoes">
        <input id="task-titulo" placeholder="Título da task — Enter cria" class="flex-1 min-w-0 max-w-80" onkeydown="if(event.key==='Enter')criarTask()"/>
        <button class="btn" onclick="criarTask()">+ Criar task</button>
        <span class="help-wrap">${b("tasks")}</span>
      </div>
    </div>
    ${t.length===0?_("tasks","Nenhuma task na empresa","Crie a primeira no campo acima — os agentes assumem tasks do board automaticamente conforme a rotina."):'<div id="kanban" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"></div>'}
  `;const s=document.getElementById("kanban");if(s)for(const i of n){const c=t.filter(v=>String(v.coluna)===i).sort((v,h)=>Number(v.pos)-Number(h.pos)),u=document.createElement("div");u.className="kanban-col",u.innerHTML=`
      <div class="kanban-header">
        <span class="kanban-title capitalize">${r(i)}${dn[i]?er(i):""}</span>
        <span class="kanban-count">${c.length}</span>
      </div>
      <div class="kanban-cards scrollbar-thin" id="kanban-${r(i)}"></div>
    `,s.appendChild(u);const p=u.querySelector("#kanban-"+r(i));if(p){ar(p,s,i);for(const v of c){const h=document.createElement("div");h.className="task-card"+(v.bloqueado_por?.length?" locked":"");const y=v.prioridade==="alta"?"alta":v.prioridade==="baixa"?"baixa":"media";h.innerHTML=`
        <div class="task-title">${r(String(v.titulo))}</div>
        <div class="task-meta">
          <span class="font-mono">${r(String(v.responsavel||"—"))}</span>
          ${v.prioridade!=="media"?`<span class="task-priority ${y}">${r(String(v.prioridade))}</span>`:""}
          ${v.labels?.length?v.labels.map(I=>`<span class="badge badge-neutral">${r(I)}</span>`).join(""):""}
        </div>
      `,h.onclick=()=>{_t||mn(String(v.id),String(v.titulo))},tr(h,String(v.id),i),p.appendChild(h)}}}}function er(e){return b("kanban-"+e,dn[e]??"")}function tr(e,t,a){e.draggable=!0,e.dataset.taskId=t,e.dataset.colunaAtual=a,e.addEventListener("dragstart",o=>{_t=!1,o.dataTransfer&&(o.dataTransfer.setData("text/plain",t),o.dataTransfer.effectAllowed="move"),e.classList.add("arrastando")}),e.addEventListener("dragend",()=>{e.classList.remove("arrastando"),_t=!0,setTimeout(()=>{_t=!1},150)})}function ar(e,t,a){e.addEventListener("dragover",o=>{o.preventDefault(),o.dataTransfer&&(o.dataTransfer.dropEffect="move"),e.classList.add("drag-over")}),e.addEventListener("dragleave",o=>{e.contains(o.relatedTarget)||e.classList.remove("drag-over")}),e.addEventListener("drop",o=>{o.preventDefault(),e.classList.remove("drag-over");const n=o.dataTransfer?.getData("text/plain");if(!n)return;const s=t.querySelector('.task-card[data-task-id="'+n.replace(/"/g,'\\"')+'"]');!s||s.dataset.colunaAtual===a||(s.dataset.colunaAtual=a,un(n,a))})}async function un(e,t){await m("/tasks/"+e,{method:"PATCH",body:JSON.stringify({coluna:t})}).catch(()=>{}),U()}async function pn(){const e=document.getElementById("task-titulo");if(!e)return;const t=e.value.trim();if(t)try{await m("/tasks",{method:"POST",body:JSON.stringify({titulo:t})}),e.value="",U()}catch{}}async function mn(e,t){A=e,_a(e);const{abrirDrawer:a}=await f(async()=>{const{abrirDrawer:o}=await Promise.resolve().then(()=>G);return{abrirDrawer:o}},void 0);await a(e,t)}async function vn(e){const[t,a,o]=await Promise.all([m("/tasks/"+e).catch(()=>null),m("/tasks/"+e+"/chat").catch(()=>[]),m("/tasks/colunas").catch(()=>[])]);if(!t){ge();return}const n=["backlog","fazendo","bloqueado","feito",...new Set(o)],s=t.bloqueada===!0||(t.bloqueado_por?.length??0)>0,i=document.getElementById("drawer-content");if(!i)return;i.innerHTML=`
    <div class="space-y-4">
      <div class="task-detail-field">
        <span class="task-detail-label">ID</span>
        <span class="task-detail-value mono">${r(String(t.id))}</span>
      </div>
      <div class="task-detail-field">
        <span class="task-detail-label">Coluna</span>
        <select id="drawer-coluna" class="task-detail-value" onchange="moverTaskColuna()">
          ${n.map(u=>`<option value="${r(u)}" ${u===t.coluna?"selected":""}>${r(u)}</option>`).join("")}
        </select>
      </div>
      <div class="task-detail-field">
        <span class="task-detail-label">Prioridade</span>
        <select id="drawer-prioridade" class="task-detail-value" onchange="atualizarTaskPrioridade()">
          <option value="baixa" ${t.prioridade==="baixa"?"selected":""}>Baixa</option>
          <option value="media" ${t.prioridade==="media"?"selected":""}>Média</option>
          <option value="alta" ${t.prioridade==="alta"?"selected":""}>Alta</option>
        </select>
      </div>
      <div class="task-detail-field">
        <span class="task-detail-label">Responsável</span>
        <input id="drawer-responsavel" class="task-detail-value" value="${r(String(t.responsavel||""))}" onblur="atualizarTaskResponsavel()"/>
      </div>
      <div class="task-detail-field">
        <span class="task-detail-label">Due</span>
        <input id="drawer-due" type="date" class="task-detail-value" value="${t.due?String(t.due).slice(0,10):""}" onchange="atualizarTaskDue()"/>
      </div>
      <div class="task-detail-field">
        <span class="task-detail-label">Labels</span>
        <input id="drawer-labels" class="task-detail-value" value="${(t.labels||[]).join(", ")}" onblur="atualizarTaskLabels()"/>
      </div>
      <div class="task-detail-field">
        <span class="task-detail-label">Bloqueada por</span>
        <span class="task-detail-value mono">${(t.bloqueado_por||[]).join(", ")||"—"}</span>
      </div>
      <div class="task-detail-field">
        <span class="task-detail-label">Lock</span>
        <span class="task-detail-value">${s?'<span class="badge badge-err">BLOQUEADA</span>':'<span class="badge badge-ok">Livre</span>'}</span>
      </div>
      <div class="task-detail-field">
        <span class="task-detail-label">Descrição</span>
        <textarea id="drawer-descricao" class="task-detail-value" rows="3" onblur="atualizarTaskDescricao()">${r(String(t.descricao||""))}</textarea>
      </div>
      <div class="flex justify-end pt-1 border-t border-zinc-800 mt-2">
        <button class="btn btn-ghost text-error" onclick="excluirTask()">${l("trash")} Excluir task</button>
      </div>
    </div>
    <div class="border-t border-zinc-800 pt-4">
      <h3 class="font-semibold mb-2 flex items-center gap-2">${l("chat")} Chat</h3>
      <div id="drawer-chat" class="scrollbar-thin max-h-64 overflow-y-auto space-y-2 mb-4">${gn(a)}</div>
    </div>
    <div id="drawer-console-wrap" class="border-t border-zinc-800 pt-4">
      <h3 class="font-semibold mb-2 flex items-center gap-2">${l("run")} Execução ao vivo</h3>
      <div id="drawer-console" class="drawer-console"><div class="dc-status"><span class="dc-dot"></span>verificando…</div></div>
    </div>
  `;const c=String(t.responsavel||"").replace(/^agente:/,"");c&&or(c)}let xe=null;function or(e){xe&&(clearInterval(xe),xe=null);const t=document.getElementById("drawer-console");if(!t)return;const a=async()=>{if(!document.getElementById("drawer")?.classList.contains("open")){xe&&(clearInterval(xe),xe=null);return}try{const s=(await m("/sessions?agent="+encodeURIComponent(e)).catch(()=>[])??[]).find(v=>v.status==="executando");if(!s){t.innerHTML='<div class="dc-status" style="color:var(--muted)">nenhuma execução ativa deste agente agora</div>';return}const i=s.inicio?Date.parse(s.inicio):0,c=i?Math.max(1,Math.round((Date.now()-i)/1e3)):0,{log:u}=await m("/sessions/"+encodeURIComponent(s.id)+"/log"),p=(u||"").split(`
`).slice(-22).join(`
`);t.innerHTML=`
        <div class="dc-status"><span class="dc-dot"></span>executando há ${c}s · ${r(s.id)}</div>
        <pre>${r(p)}</pre>`,t.scrollTop=t.scrollHeight}catch{t.innerHTML='<div class="dc-status" style="color:var(--muted)">sem acesso ao log agora</div>'}};a(),xe=setInterval(()=>{a()},3e3)}function gn(e){return!Array.isArray(e)||!e.length?'<div class="text-zinc-500 text-sm text-center py-4">Sem mensagens</div>':e.map(t=>`
    <div class="chat-msg">
      <div class="chat-header">
        <span class="chat-author ${t.autor==="humano"?"humano":String(t.autor).startsWith("agente:")?"agente":"sistema"}">${r(String(t.autor))}</span>
        <span class="chat-time">${String(t.criado_em||"").slice(11,16)}</span>
        ${t.menciona?.length?`<span class="chat-mentions">${t.menciona.map(a=>"@"+a.replace("agente:","")).join(" ")}</span>`:""}
      </div>
      <div class="chat-body">${r(String(t.corpo))}</div>
    </div>
  `).join("")}async function fn(){const e=document.getElementById("drawer-chat-input");if(!e)return;const t=e.value.trim();if(!t||!A)return;await m("/tasks/"+A+"/chat",{method:"POST",body:JSON.stringify({autor:"humano",corpo:t})}).catch(()=>{}),e.value="";const a=await m("/tasks/"+A+"/chat"),o=document.getElementById("drawer-chat");o&&(o.innerHTML=gn(a),o.scrollTop=o.scrollHeight)}async function bn(){if(!A)return;const e=document.getElementById("drawer-coluna")?.value;e&&(await m("/tasks/"+A,{method:"PATCH",body:JSON.stringify({coluna:e})}).catch(()=>{}),U(),await vn(A))}async function hn(){if(!A)return;const e=document.getElementById("drawer-prioridade")?.value;e&&(await m("/tasks/"+A,{method:"PATCH",body:JSON.stringify({prioridade:e})}).catch(()=>{}),U())}async function wn(){if(!A)return;const e=document.getElementById("drawer-responsavel")?.value;await m("/tasks/"+A,{method:"PATCH",body:JSON.stringify({responsavel:e})}).catch(()=>{}),U()}async function xn(){if(!A)return;const e=document.getElementById("drawer-due")?.value;await m("/tasks/"+A,{method:"PATCH",body:JSON.stringify({due:e||null})}).catch(()=>{})}async function yn(){if(!A)return;const e=document.getElementById("drawer-labels")?.value.split(",").map(t=>t.trim()).filter(Boolean)||[];await m("/tasks/"+A,{method:"PATCH",body:JSON.stringify({labels:e})}).catch(()=>{}),U()}async function $n(){if(!A)return;const e=document.getElementById("drawer-descricao")?.value||"";await m("/tasks/"+A,{method:"PATCH",body:JSON.stringify({descricao:e})}).catch(()=>{})}async function kn(e){const t=e??A;if(!t)return;const{modalConfirm:a}=await f(async()=>{const{modalConfirm:o}=await Promise.resolve().then(()=>H);return{modalConfirm:o}},void 0);if(await a(`Excluir a task ${r(t)}? Esta ação não pode ser desfeita.`,{titulo:"Excluir task",confirmar:"Excluir"}))try{await m("/tasks/"+t,{method:"DELETE"}),d("Task excluída","ok"),ge(),U()}catch(o){d("Erro ao excluir: "+o.message,"erro")}}const nr=Object.freeze(Object.defineProperty({__proto__:null,abrirDrawer:mn,atualizarTaskDescricao:$n,atualizarTaskDue:xn,atualizarTaskLabels:yn,atualizarTaskPrioridade:hn,atualizarTaskResponsavel:wn,carregarDrawerConteudo:vn,criarTask:pn,enviarMsgDrawer:fn,excluirTask:kn,moverTaskColuna:bn,moverTaskColunaDireto:un,renderTasks:U},Symbol.toStringTag,{value:"Module"}));async function En(){const e=k(),t=document.getElementById("view-agenda");if(!t)return;t.innerHTML.trim()||(t.innerHTML=`<div class="page-header"><div class="page-header-esq"><h1 class="page-header-titulo">${l("agenda")} Agenda</h1><p class="page-header-sub">Rotinas agendadas</p></div></div>`+T()),t.innerHTML=`
    <div class="page-header">
      <div class="page-header-esq">
        <h1 class="page-header-titulo">${l("agenda")} Agenda</h1>
        <p class="page-header-sub">Rotinas · cron / intervalo / data única</p>
      </div>
      <div class="page-header-acoes">
        <span class="help-wrap">${b("agenda")}</span>
        <div class="flex items-center gap-1 rounded-lg border border-zinc-700 p-1" role="group" aria-label="Escopo da agenda">
          <button id="agenda-escopo-ws" class="btn text-xs" onclick="agendaEscopo('ws')">só ${r(e||"esta empresa")}</button>
          <button id="agenda-escopo-todas" class="btn text-xs" onclick="agendaEscopo('todas')">todas as empresas</button>
        </div>
      </div>
    </div>
    <div id="agenda-status" class="card p-4 mb-6"></div>
    <div id="agenda-lista" class="space-y-4">${T()}</div>
    <div class="card p-4 mt-6" id="agenda-form"></div>
  `;const a=Mo();await ir(),_n(a),await be(),Zt()}function sr(e){Ss(e),_n(e),be()}function _n(e){const t=document.getElementById("agenda-escopo-ws"),a=document.getElementById("agenda-escopo-todas");!t||!a||(t.style.background=e==="ws"?"#3b82f6":"transparent",a.style.background=e==="todas"?"#3b82f6":"transparent")}async function ir(){const e=document.getElementById("agenda-status");e&&(e.innerHTML=`
    <div class="flex items-start gap-3">
      <div class="flex-1">
        <p class="text-sm text-zinc-400">O daemon do scheduler executa os jobs a cada 30s. ${b("scheduler")}</p>
        <p class="text-sm text-zinc-400 mt-1">Inicie com: <code class="font-mono bg-zinc-800 px-1.5 py-0.5 rounded">opencorp scheduler start</code></p>
      </div>
    </div>
  `)}async function be(){const e=Mo();let t;try{t=e==="todas"?await m("/schedules?all=1"):await w("/schedules")}catch{t=null}const a=document.getElementById("agenda-lista");if(a){if(!t){a.innerHTML=S("Não foi possível carregar as rotinas.",()=>{be()});return}if(!t.length){a.innerHTML=_("agenda",e==="todas"?"Nenhuma rotina agendada em nenhuma empresa":"Nenhuma rotina nesta empresa","A empresa opera sozinha quando você agenda a primeira rotina.");return}a.innerHTML=t.map(o=>`
    <div class="card p-4">
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="font-medium truncate">${r(String(o.nome))}</span>
            <span class="badge ${As(String(o.agenda?.tipo))}">${r(String(o.agenda?.tipo))}</span>
            <span class="badge ${o.ativo?"badge-ok":"badge-neutral"}">${o.ativo?"ativo":"pausado"}</span>
          </div>
          <div class="text-sm text-zinc-400 mb-1">${Sa(o)}</div>
          <div class="text-xs text-zinc-500 font-mono truncate">${r((o.args||[]).join(" "))}</div>
          <div class="text-xs text-zinc-500 font-mono mt-1">workspace: ${r(String(o.workspace))}</div>
          ${o.proxima_exec?'<div class="text-xs text-zinc-500 font-mono mt-1">próxima: '+Le(String(o.proxima_exec))+"</div>":""}
          ${o.ultima_exec?'<div class="text-xs text-zinc-500 font-mono">última: '+Le(String(o.ultima_exec))+"</div>":'<div class="text-xs mt-1" style="color:var(--warn)">⚠ nunca rodou</div>'}
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <button class="btn btn-ghost text-sm" onclick="executarAgendaAgora('${r(String(o.id))}')" aria-label="Executar agora">${l("run")} Agora</button>
          <button class="btn btn-ghost text-sm" onclick="editarAgenda('${r(String(o.id))}')" aria-label="Editar">${l("gear")} Editar</button>
          <button class="btn btn-ghost text-sm" onclick="toggleAgendaAtivo('${r(String(o.id))}', ${o.ativo})" aria-label="${o.ativo?"Pausar":"Retomar"}">${o.ativo?l("pause"):l("run")} ${o.ativo?"Pausar":"Retomar"}</button>
          <button class="btn btn-ghost text-sm" style="color:var(--err)" onclick="excluirAgenda('${r(String(o.id))}')" aria-label="Excluir">${l("trash")}</button>
        </div>
      </div>
    </div>
  `).join("")}}function Zt(){const e=document.getElementById("agenda-form");e&&(e.innerHTML=`
    <h3 class="font-semibold mb-3 flex items-center gap-2">${l("plus")} Nova rotina ${b("agenda")}</h3>
    <form id="form-nova-agenda" class="space-y-4" onsubmit="event.preventDefault(); criarAgenda()">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-xs text-zinc-500 mb-1">Nome</label>
          <input id="agenda-nome" required placeholder="Ex: checar-fila" />
        </div>
        <div>
          <label class="block text-xs text-zinc-500 mb-1">Tipo</label>
          <select id="agenda-tipo" onchange="atualizarCampoAgenda()">
            <option value="intervalo_min">Intervalo (minutos)</option>
            <option value="cron">Cron (5 campos)</option>
            <option value="data_unica">Data única</option>
          </select>
        </div>
      </div>
      <div id="agenda-valor-container">
        <label class="block text-xs text-zinc-500 mb-1">Valor</label>
        <input id="agenda-valor" type="number" min="1" placeholder="Ex: 30" required />
      </div>
      <div>
        <label class="block text-xs text-zinc-500 mb-1">Comando (args)</label>
        <input id="agenda-args" placeholder='task create --titulo "Checar fila"' required />
      </div>
      <div class="flex gap-2">
        <button type="submit" class="btn">${l("plus")} Criar</button>
        <button type="button" class="btn btn-ghost" onclick="renderAgendaForm()">Cancelar</button>
      </div>
    </form>
  `)}function Tn(e="agenda-valor-container",t=""){const a=document.getElementById(e==="agenda-valor-container"?"agenda-tipo":"agenda-edit-tipo")?.value,o=document.getElementById(e);if(!o)return;const n=e==="agenda-valor-container"?"agenda-valor":"agenda-edit-valor";a==="intervalo_min"?o.innerHTML=`<label class="block text-xs text-zinc-500 mb-1">Valor (minutos)</label><input id="${n}" type="number" min="1" placeholder="Ex: 30" required value="${r(t)}" />`:a==="cron"?o.innerHTML=`<label class="block text-xs text-zinc-500 mb-1">Expressão cron</label><input id="${n}" type="text" placeholder="*/5 * * * *" required value="${r(t)}" />`:a==="data_unica"&&(o.innerHTML=`<label class="block text-xs text-zinc-500 mb-1">Data/hora (ISO)</label><input id="${n}" type="datetime-local" required value="${r(t)}" />`)}async function rr(){const e=document.getElementById("agenda-nome")?.value.trim(),t=document.getElementById("agenda-tipo")?.value;let a=document.getElementById("agenda-valor")?.value;const o=document.getElementById("agenda-args")?.value.trim().split(/\s+/).filter(Boolean)||[];if(!(!e||!a||!o.length)){t==="data_unica"?a=new Date(a).toISOString():t==="intervalo_min"&&(a=String(Number(a)));try{await m("/schedules",{method:"POST",body:JSON.stringify({nome:e,agenda_tipo:t,agenda_valor:String(a),args:o,workspace:k()||void 0})}),d("Rotina criada","ok"),await be(),Zt()}catch(n){d("Erro: "+n.message,"erro")}}}async function cr(e){try{const t=await m("/schedules/"+e+"/run",{method:"POST"});d("Executado: "+(t.resultado||"ok"),"ok"),await be()}catch(t){d("Erro: "+t.message,"erro")}}async function lr(e,t){try{await m("/schedules/"+e,{method:"PATCH",body:JSON.stringify({ativo:!t})}),d(t?"Pausado":"Retomado","ok"),await be()}catch(a){d("Erro: "+a.message,"erro")}}async function dr(e){const{modalConfirm:t}=await f(async()=>{const{modalConfirm:a}=await Promise.resolve().then(()=>H);return{modalConfirm:a}},void 0);if(await t("Excluir esta rotina?",{confirmar:"Excluir"}))try{await m("/schedules/"+e,{method:"DELETE"}),d("Excluído","ok"),await be()}catch(a){d("Erro: "+a.message,"erro")}}async function ur(e){let t=null;try{t=await m("/schedules/"+encodeURIComponent(e))}catch{t=null}if(!t){d("Não foi possível carregar a rotina "+e,"erro");return}const a=document.getElementById("agenda-form");if(!a)return;const o=String(t.agenda?.tipo??"intervalo_min");let n=String(t.agenda?.valor??"");if(o==="data_unica"&&n){const s=new Date(n);if(!Number.isNaN(s.getTime())){const i=c=>String(c).padStart(2,"0");n=`${s.getFullYear()}-${i(s.getMonth()+1)}-${i(s.getDate())}T${i(s.getHours())}:${i(s.getMinutes())}`}}a.innerHTML=`
    <h3 class="font-semibold mb-3 flex items-center gap-2">${l("gear")} Editar rotina <span class="font-mono text-xs text-zinc-500">${r(e)}</span></h3>
    <form id="form-editar-agenda" class="space-y-4" onsubmit="event.preventDefault(); salvarEdicaoAgenda('${r(e)}')">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-xs text-zinc-500 mb-1">Nome</label>
          <input id="agenda-edit-nome" required value="${r(String(t.nome))}" />
        </div>
        <div>
          <label class="block text-xs text-zinc-500 mb-1">Tipo</label>
          <select id="agenda-edit-tipo" onchange="atualizarCampoAgenda('agenda-edit-valor-container')">
            <option value="intervalo_min" ${o==="intervalo_min"?"selected":""}>Intervalo (minutos)</option>
            <option value="cron" ${o==="cron"?"selected":""}>Cron (5 campos)</option>
            <option value="data_unica" ${o==="data_unica"?"selected":""}>Data única</option>
          </select>
        </div>
      </div>
      <div id="agenda-edit-valor-container"></div>
      <div>
        <label class="block text-xs text-zinc-500 mb-1">Comando (args)</label>
        <input id="agenda-edit-args" value="${r((t.args||[]).join(" "))}" required />
      </div>
      <div class="flex gap-2">
        <button type="submit" class="btn">${l("check")} Salvar</button>
        <button type="button" class="btn btn-ghost" onclick="renderAgendaForm()">Cancelar</button>
      </div>
    </form>
  `,Tn("agenda-edit-valor-container",n),a.scrollIntoView({behavior:"smooth",block:"nearest"})}async function pr(e){const t=document.getElementById("agenda-edit-nome")?.value.trim(),a=document.getElementById("agenda-edit-tipo")?.value;let o=document.getElementById("agenda-edit-valor")?.value??"";const n=document.getElementById("agenda-edit-args")?.value.trim()??"";if(!(!t||!o||!n)){a==="data_unica"?o=new Date(o).toISOString():a==="intervalo_min"&&(o=String(Number(o)));try{await m("/schedules/"+encodeURIComponent(e),{method:"PATCH",body:JSON.stringify({nome:t,agenda_tipo:a,agenda_valor:o,args:n.split(/\s+/).filter(Boolean)})}),d("Rotina atualizada","ok"),Zt(),await be()}catch(s){d("Erro: "+s.message,"erro")}}}async function Sn(){const e=document.getElementById("view-fluxos");e&&(e.innerHTML.trim()||(e.innerHTML=`<div class="page-header"><div class="page-header-esq"><h1 class="page-header-titulo">${l("fluxos")} Fluxos</h1><p class="page-header-sub">Linhas de pensamento</p></div></div>`+T()),e.innerHTML=`
    <div class="page-header">
      <div class="page-header-esq">
        <h1 class="page-header-titulo">${l("fluxos")} Fluxos</h1>
        <p class="page-header-sub">Pipeline · fanout · review · debate</p>
      </div>
      <div class="page-header-acoes">
        <span class="help-wrap">${b("flows")}</span>
        <div class="flex items-center gap-1 rounded-lg border border-zinc-700 p-1" role="group" aria-label="Novo fluxo por template">
          <button class="btn text-xs" onclick="abrirFormFlow('pipeline')">${l("plus")} Pipeline</button>
          <button class="btn btn-ghost text-xs" onclick="abrirFormFlow('fanout')">${l("plus")} Fanout</button>
          <button class="btn btn-ghost text-xs" onclick="abrirFormFlow('review')">${l("plus")} Review</button>
          <button class="btn btn-ghost text-xs" onclick="abrirFormFlow('debate')">${l("plus")} Debate</button>
        </div>
      </div>
    </div>
    <div id="flow-form" class="mb-6"></div>
    <div id="times-legados" class="mb-6"></div>
    <div id="fluxos-lista" class="space-y-4"></div>
  `,await An(),await Ke())}async function An(){const e=document.getElementById("times-legados");if(!e)return;let t=[];try{t=await m("/teams")}catch{t=[]}if(!t.length){e.innerHTML="";return}e.innerHTML=`
    <div class="card p-4 border-dashed">
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold flex items-center gap-2">${l("teams")} Times legados (${t.length}) ${b("teams")}</h3>
          <p class="text-xs text-zinc-500 mt-1">Times e fluxos são o mesmo motor agora — migre para editar e acompanhar como fluxo (o arquivo original fica preservado).</p>
        </div>
        <button class="btn" onclick="migrarTeams()">${l("check")} Migrar todos para fluxos</button>
      </div>
      <div class="mt-3 space-y-2">
        ${t.map(a=>`
          <div class="flex items-center justify-between gap-2 text-sm border border-zinc-800 rounded p-2">
            <span class="font-mono text-xs">${r(a.id)} <span class="text-zinc-500">· ${r(a.padrao)} · ${a.passos} passo(s)</span></span>
          </div>
        `).join("")}
      </div>
    </div>
  `}async function mr(){try{const e=await m("/flows/migrate-teams",{method:"POST"}),t=[];e.criados.length&&t.push(`${e.criados.length} migrado(s): ${e.criados.join(", ")}`),e.pulados.length&&t.push(`${e.pulados.length} pulado(s) (${e.pulados.map(a=>a.id).join(", ")})`),d(t.length?t.join(" · "):"Nada a migrar",e.criados.length?"ok":"aviso"),await An(),await Ke()}catch(e){d("Erro ao migrar: "+e.message,"erro")}}let In=[];async function Ke(){let e;try{e=await m("/flows")}catch{e=null}const t=document.getElementById("fluxos-lista");if(t){if(!e){t.innerHTML=S("Não foi possível carregar os fluxos.",()=>{Ke()});return}if(!e.length){t.innerHTML=_("fluxos","Nenhum fluxo",'Escolha um template acima (Pipeline, Fanout, Review ou Debate), ou use <code>opencorp flow create &lt;id&gt; --nome "..."</code>');return}t.innerHTML=e.map(a=>`
    <div class="card p-4">
      <div class="flex items-center justify-between gap-4">
        <div class="flex-1 min-w-0">
          <div class="font-mono text-sm">${r(String(a.id))}</div>
          ${a.nome?'<div class="text-xs text-zinc-400 mt-1">'+r(String(a.nome))+"</div>":""}
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <button class="btn btn-ghost text-sm" onclick="executarFlow('${r(String(a.id))}')" aria-label="Executar">${l("run")} Executar</button>
          <button class="btn btn-ghost text-sm" onclick="detalhesFlow('${r(String(a.id))}')" aria-label="Detalhes">${l("chat")} Detalhes</button>
          <button class="btn btn-ghost text-sm" onclick="editarFlow('${r(String(a.id))}')" aria-label="Editar">${l("gear")} Editar</button>
          <button class="btn btn-ghost text-sm" style="color:var(--err)" onclick="excluirFlow('${r(String(a.id))}')" aria-label="Excluir">${l("trash")}</button>
        </div>
      </div>
    </div>
  `).join("")}}let ct=null;const vr=new Set(["manual","agente","task_create","registro","saida"]);async function gr(e){let t=null;try{t=await m("/flows/"+encodeURIComponent(e))}catch{t=null}if(!t){d("Não foi possível carregar o fluxo "+e,"erro");return}const a=t.nos??[];if(!a.every(v=>vr.has(String(v.tipo)))){const{modalConfirm:v}=await f(async()=>{const{modalConfirm:h}=await Promise.resolve().then(()=>H);return{modalConfirm:h}},void 0);await v(`O fluxo "${e}" tem nós avançados (condição/decisão/webhook) que este editor simples não edita sem risco de perder o grafo. Edite via <code>opencorp flow edit ${r(e)}</code> (abre o JSON com validação).`,{titulo:"Editor simples não suporta este fluxo",confirmar:"Entendi"});return}ct=e;const n=document.getElementById("flow-form");if(!n)return;n.innerHTML=`
    <div class="card p-4">
      <h3 class="font-semibold mb-3 flex items-center gap-2">${l("gear")} Editar fluxo <span class="font-mono text-xs text-zinc-500">${r(e)}</span></h3>
      <form id="form-novo-flow" class="space-y-4" onsubmit="event.preventDefault(); window.__submitFlowForm()">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs text-zinc-500 mb-1">ID (fixo)</label>
            <input id="flow-id" required value="${r(e)}" readonly class="opacity-60" />
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Nome</label>
            <input id="flow-nome" required value="${r(String(t.nome??e))}" />
          </div>
        </div>
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="text-xs text-zinc-500">Passos (executam em sequência após o gatilho manual)</label>
            <button type="button" class="btn btn-ghost text-xs" onclick="addPassoFlow()">${l("plus")} passo</button>
          </div>
          <div id="flow-passos" class="space-y-3"></div>
        </div>
        <div class="flex gap-2">
          <button type="submit" class="btn">${l("check")} Salvar fluxo</button>
          <button type="button" class="btn btn-ghost" onclick="fecharFormFlow()">Cancelar</button>
        </div>
      </form>
    </div>
  `;const s=new Map(a.map(v=>[String(v.id),v])),i=[];let c=t.arestas.find(v=>v.de==="gatilho");const u=new Set;for(;c&&!u.has(c.para);){u.add(c.para);const v=s.get(c.para);if(!v)break;i.push(v),c=t.arestas.find(h=>h.de===c.para)}const p=document.getElementById("flow-passos");p&&(p.innerHTML=""),i.length||Rt();for(const v of i){Rt();const h=p?.lastElementChild;if(!h)continue;const y=h.querySelector("select");y&&(y.value=v.tipo,window.__flowTipo(y));const I=v.config??{},K=(Y,he)=>{const we=h.querySelector(Y);we&&he!==void 0&&he!==null&&(we.value=String(he))};K(".flow-agente",I.agente),K(".flow-ordem",I.ordem),K(".flow-titulo",I.titulo),K(".flow-categoria",I.registro??I.categoria)}n.scrollIntoView({behavior:"smooth",block:"nearest"})}async function Ln(e){const t=document.getElementById("flow-nome")?.value.trim();if(!t)return;const a=Mn();if(a)try{await m("/flows/"+encodeURIComponent(e),{method:"PUT",body:JSON.stringify({id:e,nome:t,...a})}),d(`Fluxo "${e}" salvo`,"ok"),Ua(),await Ke()}catch(o){d("Erro ao salvar fluxo: "+o.message,"erro")}}async function fr(e){const{modalConfirm:t}=await f(async()=>{const{modalConfirm:a}=await Promise.resolve().then(()=>H);return{modalConfirm:a}},void 0);if(await t(`Excluir o fluxo "${r(e)}"? Execuções passadas continuam no Histórico.`,{titulo:"Excluir fluxo",confirmar:"Excluir"}))try{await m("/flows/"+encodeURIComponent(e),{method:"DELETE"}),d("Fluxo excluído","ok"),await Ke()}catch(a){d("Erro ao excluir: "+a.message,"erro")}}let at="pipeline";function br(e="pipeline"){ct=null,at=e;const t=document.getElementById("flow-form");if(!t)return;const a=`
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label class="block text-xs text-zinc-500 mb-1">ID (kebab-case)</label>
        <input id="flow-id" required placeholder="ex: ciclo-publicacao" pattern="[a-z0-9]+(-[a-z0-9]+)*" />
      </div>
      <div>
        <label class="block text-xs text-zinc-500 mb-1">Nome</label>
        <input id="flow-nome" required placeholder="ex: Ciclo de publicação" />
      </div>
    </div>
  `,o=(s,i="flow-team-passo")=>`
    <div class="border border-zinc-800 rounded p-3 space-y-2 ${i}">
      <div class="flex items-center gap-2">
        <span class="text-xs text-zinc-500">${s}</span>
        <button type="button" class="btn-ghost text-xs ml-auto" onclick="this.closest('.${i}').remove()" title="Remover">✕</button>
      </div>
      <input class="ft-agente" placeholder="id do agente" />
      <input class="ft-ordem" placeholder="ordem (aceita {{entrada}})" />
    </div>
  `;let n="";e==="pipeline"?n=`
      <div class="flex items-center justify-between mb-2">
        <label class="text-xs text-zinc-500">Passos (executam em sequência após o gatilho manual)</label>
        <button type="button" class="btn btn-ghost text-xs" onclick="addPassoFlow()">${l("plus")} passo</button>
      </div>
      <div id="flow-passos" class="space-y-3"></div>
    `:e==="fanout"?n=`
      <div class="flex items-center justify-between mb-2">
        <label class="text-xs text-zinc-500">Agentes em paralelo (2+)</label>
        <button type="button" class="btn btn-ghost text-xs" onclick="addPassoTemplate('ft-paralelos')">${l("plus")} agente</button>
      </div>
      <div id="ft-paralelos" class="space-y-3">${o("paralelo 1")}${o("paralelo 2")}</div>
      <label class="text-xs text-zinc-500 block mt-3 mb-1">Síntese final (opcional — agrega as saídas)</label>
      ${o("síntese","ft-sintese flow-team-passo")}
    `:e==="review"?n=`
      <label class="text-xs text-zinc-500 block mb-1">Executor (faz)</label>${o("executor","ft-executor flow-team-passo")}
      <label class="text-xs text-zinc-500 block mb-1 mt-3">Revisor (aprova com "APROVADO" ou pede "AJUSTES: ...")</label>${o("revisor","ft-revisor flow-team-passo")}
      <div class="w-40 mt-3">
        <label class="block text-xs text-zinc-500 mb-1">Turnos máximos (1-5)</label>
        <input id="ft-turnos" type="number" min="1" max="5" value="2" />
      </div>
    `:n=`
      <div class="flex items-center justify-between mb-2">
        <label class="text-xs text-zinc-500">Proponentes (2+)</label>
        <button type="button" class="btn btn-ghost text-xs" onclick="addPassoTemplate('ft-proponentes')">${l("plus")} proponente</button>
      </div>
      <div id="ft-proponentes" class="space-y-3">${o("proponente 1")}${o("proponente 2")}</div>
      <label class="text-xs text-zinc-500 block mb-1 mt-3">Moderador (decide com "DECISÃO: ...")</label>
      <input id="ft-moderador" placeholder="id do agente moderador (ex: secretario)" />
    `,t.innerHTML=`
    <div class="card p-4">
      <h3 class="font-semibold mb-3 flex items-center gap-2">${l("plus")} Novo fluxo <span class="badge badge-pipeline">${e}</span> ${b("flows")}</h3>
      <form id="form-novo-flow" class="space-y-4" onsubmit="event.preventDefault(); criarFlow()">
        ${a}
        <div id="flow-campos-template" class="space-y-3">${n}</div>
        <div class="flex gap-2">
          <button type="submit" class="btn">${l("plus")} Criar fluxo</button>
          <button type="button" class="btn btn-ghost" onclick="fecharFormFlow()">Cancelar</button>
        </div>
      </form>
    </div>
  `,e==="pipeline"&&Rt(),t.scrollIntoView({behavior:"smooth",block:"nearest"})}window.__submitFlowForm=()=>{ct?Ln(ct):zn()};function hr(e){const t=document.getElementById(e);if(!t)return;const a=document.createElement("div");a.className="border border-zinc-800 rounded p-3 space-y-2 flow-team-passo",a.innerHTML=`
    <div class="flex items-center gap-2">
      <span class="text-xs text-zinc-500">${t.childElementCount+1}</span>
      <button type="button" class="btn-ghost text-xs ml-auto" onclick="this.closest('.flow-team-passo').remove()" title="Remover">✕</button>
    </div>
    <input class="ft-agente" placeholder="id do agente" />
    <input class="ft-ordem" placeholder="ordem (aceita {{entrada}})" />
  `,t.appendChild(a)}const ho=e=>Array.from(document.querySelectorAll(`#${e} .flow-team-passo`)).map(t=>({agente:t.querySelector(".ft-agente")?.value.trim()??"",ordem:t.querySelector(".ft-ordem")?.value.trim()??"Contribua com a entrada."})).filter(t=>t.agente),ia=e=>{const t=document.querySelector(`.${e}`);if(!t)return null;const a=t.querySelector(".ft-agente")?.value.trim()??"";return a?{agente:a,ordem:t.querySelector(".ft-ordem")?.value.trim()||"Contribua com a entrada."}:null};function Ua(){ct=null;const e=document.getElementById("flow-form");e&&(e.innerHTML="")}function Rt(){const e=document.getElementById("flow-passos");if(!e)return;const t=e.childElementCount,a=document.createElement("div");a.className="border border-zinc-800 rounded p-3 space-y-2 flow-passo",a.innerHTML=`
    <div class="flex items-center gap-2">
      <span class="text-xs text-zinc-500 font-mono">#${t+1}</span>
      <select class="text-xs w-auto" onchange="window.__flowTipo(this)">
        <option value="agente">agente (executa ordem)</option>
        <option value="task_create">task (cria no board)</option>
        <option value="registro">registro (grava documento)</option>
        <option value="saida">saída (grava + encerra)</option>
      </select>
      <button type="button" class="btn-ghost text-xs ml-auto" onclick="this.closest('.flow-passo').remove()" title="Remover passo">✕</button>
    </div>
    <div class="flow-campos grid grid-cols-1 sm:grid-cols-2 gap-2"></div>
  `,e.appendChild(a),Cn(a,"agente")}function Cn(e,t){const a=e.querySelector(".flow-campos");if(!a)return;const o=In,n=o.length?`<select class="flow-agente"><option value="">— agente —</option>${o.map(s=>`<option value="${r(s.id)}">${r(s.id)}</option>`).join("")}</select>`:'<input class="flow-agente" placeholder="id do agente (ex: editor)" />';t==="agente"?a.innerHTML=`${n}<input class="flow-ordem" placeholder="ordem para o agente (aceita {{entrada}})" />`:t==="task_create"?a.innerHTML='<input class="flow-titulo sm:col-span-2" placeholder="título da task" />':a.innerHTML='<input class="flow-categoria" placeholder="categoria do registro (ex: documentos)" />'}window.__flowTipo=e=>{const t=e.closest(".flow-passo");Cn(t,e.value)};function Mn(){const e=[{id:"gatilho",tipo:"manual",config:{}}],t=[],a=Array.from(document.querySelectorAll("#flow-passos .flow-passo"));for(let o=0;o<a.length;o++){const n=a[o],s=n.querySelector("select")?.value??"agente",i=`passo-${o+1}`,c={};if(s==="agente"){const u=n.querySelector(".flow-agente")?.value.trim()??"",p=n.querySelector(".flow-ordem")?.value.trim()??"";if(!u||!p)return d(`Passo #${o+1}: agente e ordem são obrigatórios`,"erro"),null;c.agente=u,c.ordem=p}else if(s==="task_create"){const u=n.querySelector(".flow-titulo")?.value.trim()??"";if(!u)return d(`Passo #${o+1}: título da task é obrigatório`,"erro"),null;c.titulo=u}else{const u=n.querySelector(".flow-categoria")?.value.trim()??"";if(!u)return d(`Passo #${o+1}: categoria é obrigatória`,"erro"),null;s==="saida"?c.registro=u.includes("/")?u:`documentos/${u}`:c.categoria=u}e.push({id:i,tipo:s,config:c}),t.push({de:o===0?"gatilho":`passo-${o}`,para:i})}return{nos:e,arestas:t}}async function zn(){const e=document.getElementById("flow-id")?.value.trim(),t=document.getElementById("flow-nome")?.value.trim();if(!e||!t)return;let a=null;if(at==="pipeline"){if(a=Mn(),!a)return}else if(at==="fanout"){const o=ho("ft-paralelos");if(o.length<2){d("Fanout precisa de 2+ agentes em paralelo","erro");return}const n=ia("ft-sintese");a={nos:[{id:"gatilho",tipo:"manual",config:{}},{id:"fanout",tipo:"fanout",config:{paralelos:o,...n?{sintese:n}:{}}}],arestas:[{de:"gatilho",para:"fanout"}]}}else if(at==="review"){const o=ia("ft-executor"),n=ia("ft-revisor");if(!o||!n){d("Review precisa de executor e revisor","erro");return}const s=Math.min(Math.max(Number(document.getElementById("ft-turnos")?.value??2),1),5);a={nos:[{id:"gatilho",tipo:"manual",config:{}},{id:"review",tipo:"review",config:{executor:o,revisor:n,turnos:s}}],arestas:[{de:"gatilho",para:"review"}]}}else{const o=ho("ft-proponentes"),n=document.getElementById("ft-moderador")?.value.trim()??"";if(o.length<2){d("Debate precisa de 2+ proponentes","erro");return}if(!n){d("Debate precisa de um moderador","erro");return}a={nos:[{id:"gatilho",tipo:"manual",config:{}},{id:"debate",tipo:"debate",config:{proponentes:o,moderador:{agente:n}}}],arestas:[{de:"gatilho",para:"debate"}]}}try{await w("/flows",{method:"POST",body:JSON.stringify({id:e,nome:t,...a})}),d(`Fluxo "${e}" criado (${at})`,"ok"),Ua(),await Ke()}catch(o){d("Erro ao criar fluxo: "+o.message,"erro")}}(async()=>{try{In=await w("/agents")}catch{}})();async function wr(e){const{modalPrompt:t}=await f(async()=>{const{modalPrompt:o}=await Promise.resolve().then(()=>H);return{modalPrompt:o}},void 0),a=await t({titulo:"Executar flow "+e,label:"Entrada (JSON ou texto):",multiline:!0});if(a!==null)try{await m("/flows/"+encodeURIComponent(e)+"/run",{method:"POST",body:JSON.stringify({entrada:a})}),d("Flow executando — veja Início → Execuções","ok")}catch(o){d("Erro: "+o.message,"erro")}}async function xr(e){try{const t=await m("/flows/"+e),a=document.getElementById("drawer-content");if(!a)return;document.getElementById("drawer-title").textContent="Flow: "+e,document.getElementById("drawer").classList.add("open"),document.getElementById("drawer-overlay").classList.add("open");let o="";try{const n=await m("/flows/"+encodeURIComponent(e)+"/status");if(n){const s=n.nos||[],i=String(n.status??"?"),c=s.map(p=>`${p.status==="ok"?"✓":p.status==="falhou"?"✗":"·"} ${p.id} (${p.status})`).join("<br>"),u=i==="falhou";o=`
          <div class="mt-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs">
            <div class="flex items-center justify-between gap-2">
              <span><strong>última execução</strong> — <span class="mono">${r(String(n.execId))}</span> · ${r(i)}</span>
              ${u?`<button class="btn btn-ghost text-xs" onclick="retomarFlow('${r(e)}','${r(String(n.execId))}')">Retomar do último nó ok</button>`:""}
            </div>
            <div class="mt-2 text-zinc-500">${c}</div>
          </div>`}}catch{}a.innerHTML='<pre class="text-xs whitespace-pre-wrap max-h-[45vh] overflow-auto">'+r(JSON.stringify(t,null,2))+"</pre>"+o}catch(t){d("Erro: "+t.message,"erro")}}async function yr(e,t){try{await m("/flows/"+encodeURIComponent(e)+"/resume",{method:"POST",body:JSON.stringify({exec_id:t})}),d("Retomando execução "+t+" — nós concluídos serão preservados","ok")}catch(a){d("Erro: "+a.message,"erro")}}const Va=[{tipo:"task_create",rotulo:"criar task",campos:'<input class="hook-alvo-campo" data-chave="titulo" placeholder="título da task (aceita {{payload.corpo.x}})" required/><input class="hook-alvo-campo" data-chave="responsavel" placeholder="responsável opcional (agente:id)"/>'},{tipo:"agent_run",rotulo:"rodar agente",campos:'<input class="hook-alvo-campo" data-chave="agente" placeholder="id do agente (ex: executor-padrao)" required/><input class="hook-alvo-campo" data-chave="ordem" placeholder="ordem para o agente (aceita {{payload}})" required/>'},{tipo:"flow_run",rotulo:"rodar fluxo",campos:'<input class="hook-alvo-campo" data-chave="flow" placeholder="id do fluxo" required/><input class="hook-alvo-campo" data-chave="entrada" placeholder="entrada do fluxo (aceita {{payload}})" required/>'},{tipo:"webhook_out",rotulo:"webhook de saída",campos:'<input class="hook-alvo-campo" data-chave="url" placeholder="https://…" required/><input class="hook-alvo-campo" data-chave="metodo" placeholder="método (padrão POST)"/>'}],$r=e=>{const t=Va.find(o=>o.tipo===e?.tipo),a=e.tipo==="agent_run"?String(e.agente||""):e.tipo==="flow_run"?String(e.flow||""):e.tipo==="task_create"?String(e.titulo||""):String(e.url||"");return`${t?.rotulo??String(e?.tipo||"—")}${a?" · "+a:""}`};async function Ye(){const e=document.getElementById("view-hooks");if(!e)return;e.innerHTML.trim()||(e.innerHTML=`<div class="page-header"><div class="page-header-esq"><h1 class="page-header-titulo">${l("hook")} Hooks</h1><p class="page-header-sub">Webhooks de entrada</p></div></div>`+T());let t;try{t=await m("/hooks")}catch{t=null}if(!t){e.innerHTML=`<div class="page-header"><div class="page-header-esq"><h1 class="page-header-titulo">${l("hook")} Hooks</h1><p class="page-header-sub">Webhooks de entrada</p></div><div class="page-header-acoes"><span class="help-wrap">${b("hooks")}</span></div></div>`+S("Não foi possível carregar os hooks.",()=>{Ye()});return}e.innerHTML=`
    <div class="page-header">
      <div class="page-header-esq">
        <h1 class="page-header-titulo">${l("hook")} Hooks</h1>
        <p class="page-header-sub">POST externo → task / agente / fluxo</p>
      </div>
      <div class="page-header-acoes">
        <span class="help-wrap">${b("hooks")}</span>
        <button class="btn" onclick="abrirFormHook()">${l("plus")} Novo hook</button>
      </div>
    </div>
    <div id="hook-form" class="mb-6"></div>
    <div id="hooks-lista" class="space-y-4"></div>
  `;const a=document.getElementById("hooks-lista");if(a){if(!t.length){a.innerHTML=_("hooks","Nenhum hook configurado","Hooks recebem POST de serviços externos e criam tasks, rodam agentes ou fluxos. Clique em <strong>Novo hook</strong> acima.");return}a.innerHTML=t.map(o=>`
    <div class="team-card">
      <div class="team-header">
        <div>
          <div class="team-title">${r(o.nome||o.id)}</div>
          <div class="team-meta font-mono">${r(o.id)} · ${r($r(o.alvo))}</div>
        </div>
        <div class="flex items-center gap-2">
          <span class="badge ${o.ativo===!1?"badge-neutral":"badge-ok"}">${o.ativo===!1?"inativo":"ativo"}</span>
          <button class="btn btn-ghost" title="Copiar cURL de teste" onclick="copiarCurlHook('${r(o.id)}')">${l("copy")} cURL</button>
          <button class="btn btn-ghost text-error" title="Excluir hook" onclick="excluirHook('${r(o.id)}')">${l("trash")}</button>
        </div>
      </div>
      <div class="team-steps font-mono text-xs">POST /hooks/${r(k()||"<workspace>")}/${r(o.id)} · dedup ${r(String(o.dedup_seg??0))}s · resposta ${r(o.respond||"imediato")}</div>
    </div>
  `).join("")}}function kr(){const e=document.getElementById("hook-form");e&&(e.innerHTML=`
    <div class="card p-4">
      <h3 class="font-semibold mb-3 flex items-center gap-2">${l("plus")} Novo hook ${b("hooks")}</h3>
      <form id="form-novo-hook" class="space-y-4" onsubmit="event.preventDefault(); criarHook()">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Nome</label>
            <input id="hook-nome" required placeholder="ex: webhook-github" />
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">O que faz ao receber</label>
            <select id="hook-alvo-tipo" onchange="hookCamposAlvo()">
              ${Va.map(t=>`<option value="${t.tipo}">${t.rotulo}</option>`).join("")}
            </select>
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Responder</label>
            <select id="hook-respond">
              <option value="imediato">imediato (202 na hora)</option>
              <option value="final">final (espera conclusão)</option>
            </select>
          </div>
        </div>
        <div id="hook-campos-alvo" class="grid grid-cols-1 sm:grid-cols-2 gap-3"></div>
        <div class="flex gap-2 items-end">
          <div class="w-40">
            <label class="block text-xs text-zinc-500 mb-1">Dedup (segundos)</label>
            <input id="hook-dedup" type="number" min="0" value="0" />
          </div>
          <button type="submit" class="btn">${l("plus")} Criar hook</button>
          <button type="button" class="btn btn-ghost" onclick="fecharFormHook()">Cancelar</button>
        </div>
      </form>
    </div>
  `,Hn(),e.scrollIntoView({behavior:"smooth",block:"nearest"}))}function Pn(){const e=document.getElementById("hook-form");e&&(e.innerHTML="")}function Hn(){const e=document.getElementById("hook-alvo-tipo")?.value??"task_create",t=document.getElementById("hook-campos-alvo");t&&(t.innerHTML=Va.find(a=>a.tipo===e)?.campos??"")}async function Er(){const e=document.getElementById("hook-nome")?.value.trim(),t=document.getElementById("hook-alvo-tipo")?.value,a=document.getElementById("hook-respond")?.value,o=Number(document.getElementById("hook-dedup")?.value??0);if(!e)return;const n={tipo:t};let s=!1;if(document.querySelectorAll("#hook-campos-alvo .hook-alvo-campo").forEach(i=>{const c=i.value.trim();i.required&&!c&&(s=!0),c&&(n[i.dataset.chave]=i.dataset.chave==="dedup_seg"?Number(c):c)}),s){d("Preencha os campos obrigatórios do alvo","erro");return}try{const i=await m("/hooks",{method:"POST",body:JSON.stringify({nome:e,alvo:n,respond:a,dedup_seg:o})});Pn(),await Ye();const{modalConfirm:c}=await f(async()=>{const{modalConfirm:u}=await Promise.resolve().then(()=>H);return{modalConfirm:u}},void 0);await c(`Hook criado. URL: ${location.origin}/hooks/${r(k()||"")}/${r(i.id)} · token: ${r(String(i.token||""))}`,{titulo:"Hook criado — copie agora",confirmar:"Copiar cURL"}).then(async u=>{u&&await Nn(i.id,i.token)})}catch(i){d("Erro ao criar hook: "+i.message,"erro")}}async function Nn(e,t){try{let a=t;if(!a){const s=await m("/hooks/"+encodeURIComponent(e));a=String(s.token||"")}const o=k()||"",n=`curl -X POST ${location.origin}/hooks/${o}/${e} -H "x-opencorp-token: ${a}" -H "content-type: application/json" -d '{"exemplo":"valor"}'`;await navigator.clipboard.writeText(n),d("cURL copiado — cole no terminal para testar","ok")}catch(a){d("Erro ao copiar: "+a.message,"erro")}}async function _r(e){const{modalConfirm:t}=await f(async()=>{const{modalConfirm:a}=await Promise.resolve().then(()=>H);return{modalConfirm:a}},void 0);if(await t(`Excluir o hook "${r(e)}"? Serviços externos que usam a URL vão receber 404.`,{titulo:"Excluir hook",confirmar:"Excluir"}))try{await m("/hooks/"+encodeURIComponent(e),{method:"DELETE"}),d("Hook excluído","ok"),ge(),Ye()}catch(a){d("Erro ao excluir: "+a.message,"erro")}}const Tr=e=>e==="ceo"?"badge-review":e==="secretario"?"badge-fanout":e==="operario"?"badge-pipeline":"badge-neutral",Sr=e=>e==="level-1"?"só leitura":e==="level-2"?"bash local":"rede + HITL";function wo(e){const t=e.ativo===!1,a=e.id==="secretario"||e.id==="secretario-exec";return`
    <div class="card p-4 flex flex-col gap-2${t?" opacity-60":""}" data-agente-card="${r(e.id)}">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="font-mono text-sm truncate" title="${r(e.id)}">${r(e.id)}</div>
          <div class="text-xs text-zinc-400 truncate">${r(e.role||"—")}${a?' · <span class=\\"badge badge-pipeline\\">sistema</span>':""}</div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          ${t?'<span class="badge badge-neutral">desativado</span>':`<span class="badge ${Tr(String(e.category))}">${r(String(e.category||"custom"))}</span>`}
          <label class="toggle" title="${a?"Agente de sistema — não pode ser desativado":t?"Ativar agente":"Desativar agente"}">
            <input type="checkbox" data-toggle-agente="${r(e.id)}" ${t?"":"checked"} ${a?"disabled":""}
              onchange="toggleAgenteAtivo('${r(e.id)}', this)" />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
      <div class="text-xs text-zinc-500 space-y-1 flex-1">
        <div class="truncate font-mono" title="${r(e.model)}">${r(e.model)}</div>
        <div>${r(String(e.permissions))} · ${Sr(String(e.permissions))}</div>
        <div>orçamento: US$ ${r(Number(e.budget_daily_usd??0).toFixed(2))}/dia</div>
      </div>
      <div class="flex items-center gap-2 pt-1 border-t border-zinc-800">
        <button class="btn btn-sm flex-1" onclick="chamarAgente('${r(e.id)}')" title="Executar ordem">${l("run")} Chamar</button>
        <button class="btn btn-ghost btn-sm" onclick="editarAgente('${r(e.id)}')" title="Editar config">${l("gear")}</button>
        <button class="btn btn-ghost btn-sm text-error" onclick="excluirAgente('${r(e.id)}')" title="Excluir">${l("trash")}</button>
      </div>
    </div>
  `}async function ne(){const e=document.getElementById("view-agentes");if(!e)return;e.innerHTML.trim()||(e.innerHTML=`<div class="page-header"><div class="page-header-esq"><h1 class="page-header-titulo">${l("teams")} Agentes</h1><p class="page-header-sub">Equipe da empresa</p></div></div>`+T());let t;try{t=await m("/agents")}catch{t=null}if(!t){e.innerHTML=`<div class="page-header"><div class="page-header-esq"><h1 class="page-header-titulo">${l("teams")} Agentes</h1><p class="page-header-sub">Equipe da empresa</p></div><div class="page-header-acoes"><span class="help-wrap">${b("agentes")}</span></div></div>`+S("Não foi possível carregar os agentes.",()=>{ne()});return}if(e.innerHTML=`
    <div class="page-header">
      <div class="page-header-esq">
        <h1 class="page-header-titulo">${l("teams")} Agentes</h1>
        <p class="page-header-sub">Ativos e catálogo · habilite conforme a empresa</p>
      </div>
      <div class="page-header-acoes">
        <span class="help-wrap">${b("agentes")}</span>
        <button class="btn btn-ghost" id="btn-semear-catalogo" onclick="semearCatalogoAgentes()" title="Adicionar agentes prontos do catálogo (vendas, marketing…)">${l("plus")} Semear catálogo</button>
        <button class="btn" onclick="abrirFormAgente()">${l("plus")} Novo agente</button>
      </div>
    </div>
    <div id="agente-form" class="mb-6"></div>
    <h2 class="text-sm font-semibold uppercase tracking-wide text-zinc-400 mb-3">Ativos</h2>
    <div id="agentes-ativos" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8"></div>
    <h2 class="text-sm font-semibold uppercase tracking-wide text-zinc-400 mb-3">Catálogo (desativados)</h2>
    <div id="agentes-catalogo" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"></div>
  `,!t.length){document.getElementById("agentes-ativos").innerHTML=_("agentes","Nenhum agente nesta empresa","Todo workspace novo nasce com agentes do template (executor-padrao, secretario…). Crie variações com <strong>Novo agente</strong> ou use <strong>Semear catálogo</strong>."),document.getElementById("agentes-catalogo").innerHTML='<div class="text-xs text-zinc-500 col-span-full">Catálogo vazio — use <strong>Semear catálogo</strong> para adicionar agentes prontos (vendas, marketing, financeiro, suporte, jurídico, ops).</div>';return}const a=t.filter(n=>n.ativo!==!1),o=t.filter(n=>n.ativo===!1);document.getElementById("agentes-ativos").innerHTML=a.length?a.map(wo).join(""):'<div class="text-xs text-zinc-500 col-span-full">Nenhum agente ativo — ative pelo toggle no catálogo abaixo.</div>',document.getElementById("agentes-catalogo").innerHTML=o.length?o.map(wo).join(""):'<div class="text-xs text-zinc-500 col-span-full">Todo o catálogo está ativo. Use <strong>Semear catálogo</strong> para adicionar agentes prontos de áreas (vendas, marketing, financeiro, suporte, jurídico, ops).</div>'}async function Ar(e,t){const a=t.checked;t.disabled=!0;try{await m("/agents/"+encodeURIComponent(e),{method:"PUT",body:JSON.stringify({ativo:a})}),d(`Agente "${e}" ${a?"ativado":"desativado"}`,"ok"),ne()}catch(o){t.checked=a,d("Erro: "+o.message,"erro")}finally{t.disabled=!1}}async function Ir(){const e=document.getElementById("btn-semear-catalogo");e&&(e.disabled=!0);try{const t=await m("/agents/semear-catalogo",{method:"POST"});d(`Catálogo semeado: ${t.criados.length} criado(s), ${t.existentes.length} já existente(s)`,"ok"),ne()}catch(t){d("Erro: "+t.message,"erro")}finally{e&&(e.disabled=!1)}}async function Lr(e){const{modalPrompt:t}=await f(async()=>{const{modalPrompt:o}=await Promise.resolve().then(()=>H);return{modalPrompt:o}},void 0),a=await t({titulo:"Chamar "+e,label:"Ordem para o agente:",multiline:!0,obrigatorio:!0});if(a)try{await m("/agents/"+encodeURIComponent(e)+"/run",{method:"POST",body:JSON.stringify({ordem:a})}),d(`"${e}" executando — acompanhe no Histórico`,"ok")}catch(o){d("Erro: "+o.message,"erro")}}async function Cr(e){let t=null;try{t=await m("/agents/"+encodeURIComponent(e))}catch{t=null}if(!t){d("Não foi possível carregar o agente "+e,"erro");return}const{abrirDrawer:a}=await f(async()=>{const{abrirDrawer:s}=await Promise.resolve().then(()=>G);return{abrirDrawer:s}},void 0);await a(e,"Agente: "+e);const o=document.getElementById("drawer-content");if(!o)return;const n=t.budget||{};o.innerHTML=`
    <div class="space-y-4">
      <div class="task-detail-field"><span class="task-detail-label">ID</span><span class="task-detail-value mono">${r(e)}</span></div>
      <div class="task-detail-field"><span class="task-detail-label">Papel (role)</span><input id="ag-role" class="task-detail-value" value="${r(String(t.role??""))}"/></div>
      <div class="task-detail-field"><span class="task-detail-label">Modelo</span><input id="ag-model" class="task-detail-value" value="${r(String(t.model??""))}" placeholder="provider/model"/></div>
      <div class="task-detail-field"><span class="task-detail-label">Permissões</span>
        <select id="ag-permissions" class="task-detail-value">
          <option value="level-1" ${t.permissions==="level-1"?"selected":""}>level-1 — só leitura</option>
          <option value="level-2" ${t.permissions==="level-2"?"selected":""}>level-2 — bash local</option>
          <option value="level-3" ${t.permissions==="level-3"?"selected":""}>level-3 — rede + HITL</option>
        </select>
      </div>
      <div class="task-detail-field"><span class="task-detail-label">Tools (vírgula)</span><input id="ag-tools" class="task-detail-value" value="${r((t.tools||[]).join(", "))}"/></div>
      <div class="task-detail-field"><span class="task-detail-label">Orçamento diário (US$)</span><input id="ag-budget" type="number" step="0.01" min="0" class="task-detail-value" value="${r(String(n.daily_usd??0))}"/></div>
      <div class="task-detail-field"><span class="task-detail-label">Máx. turnos</span><input id="ag-turns" type="number" min="1" class="task-detail-value" value="${r(String(n.max_turns??20))}"/></div>
      <div class="flex gap-2 justify-end border-t border-zinc-800 pt-3">
        <button class="btn" onclick="salvarAgente('${r(e)}')">${l("check")} Salvar</button>
      </div>
      <div class="text-xs text-zinc-500">O prompt do agente não é editado aqui — use <code>opencorp agent edit ${r(e)}</code>.</div>
    </div>
  `}async function Mr(e){const t=document.getElementById("ag-role")?.value.trim(),a=document.getElementById("ag-model")?.value.trim(),o=document.getElementById("ag-permissions")?.value,n=(document.getElementById("ag-tools")?.value??"").split(",").map(c=>c.trim()).filter(Boolean),s=Number(document.getElementById("ag-budget")?.value??0),i=Number(document.getElementById("ag-turns")?.value??20);try{await m("/agents/"+encodeURIComponent(e),{method:"PUT",body:JSON.stringify({role:t,model:a,permissions:o,tools:n,budget_daily_usd:s,budget_max_turns:i})}),d(`Agente "${e}" salvo`,"ok"),ge(),ne()}catch(c){d("Erro ao salvar: "+c.message,"erro")}}function zr(){const e=document.getElementById("agente-form");e&&(e.innerHTML=`
    <div class="card p-4">
      <h3 class="font-semibold mb-3 flex items-center gap-2">${l("plus")} Novo agente (clone de base) ${b("agentes")}</h3>
      <form id="form-novo-agente" class="space-y-4" onsubmit="event.preventDefault(); criarAgente()">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label class="block text-xs text-zinc-500 mb-1">ID (kebab-case)</label>
            <input id="novo-agente-id" required placeholder="ex: editor-noturno" pattern="[a-z0-9]+(-[a-z0-9]+)*" />
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Clonar de</label>
            <input id="novo-agente-from" value="executor-padrao" placeholder="id do agente base" />
            <p class="text-xs text-zinc-500 mt-1">O clone <strong>herda o estado ativo/desativado</strong> do base — catálogo (ex.: agente-vendas) nasce desativado; ative com o toggle depois.</p>
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Modelo (opcional)</label>
            <input id="novo-agente-model" placeholder="provider/model" />
          </div>
        </div>
        <div class="flex gap-2">
          <button type="submit" class="btn">${l("plus")} Criar agente</button>
          <button type="button" class="btn btn-ghost" onclick="fecharFormAgente()">Cancelar</button>
        </div>
      </form>
    </div>
  `,e.scrollIntoView({behavior:"smooth",block:"nearest"}))}function Bn(){const e=document.getElementById("agente-form");e&&(e.innerHTML="")}async function Pr(){const e=document.getElementById("novo-agente-id")?.value.trim(),t=document.getElementById("novo-agente-from")?.value.trim()||"executor-padrao",a=document.getElementById("novo-agente-model")?.value.trim();if(e)try{await m("/agents",{method:"POST",body:JSON.stringify({id:e,from:t,model:a||void 0})}),d(`Agente "${e}" criado (clone de ${t}) — ajuste o prompt com agent edit`,"ok"),Bn(),ne()}catch(o){d("Erro ao criar: "+o.message,"erro")}}async function Hr(e){const{modalConfirm:t}=await f(async()=>{const{modalConfirm:a}=await Promise.resolve().then(()=>H);return{modalConfirm:a}},void 0);if(await t(`Excluir o agente "${r(e)}"? O arquivo .md e a cópia do OpenCode são removidos.`,{titulo:"Excluir agente",confirmar:"Excluir"}))try{await m("/agents/"+encodeURIComponent(e),{method:"DELETE"}),d("Agente excluído","ok"),ne()}catch(a){d(a.message||"Erro ao excluir","erro")}}const Nr=/^app:(vps|wordpress|mercadopago|cartao|custom):[a-z0-9][a-z0-9-]{0,40}$/;async function Rn(){const e=document.getElementById("view-apps");e&&(e.innerHTML=`
    <div class="page-header">
      <div class="page-header-esq">
        <h1 class="page-header-titulo">${l("apps")} Apps</h1>
        <p class="page-header-sub">Mini-apps e perfis de credenciais</p>
      </div>
      <div class="page-header-acoes"><span class="help-wrap">${b("apps")}</span></div>
    </div>
    <div id="apps-tabs" class="mb-4"></div>
    <div id="apps-painel-apps">
      <div id="apps-lista" class="apps-grid">${T()}</div>
      <div id="app-view" class="hidden"></div>
    </div>
    <div id="apps-painel-perfis" class="hidden"></div>
  `,Pa(document.getElementById("apps-tabs"),[{id:"apps",rotulo:"Apps"},{id:"perfis",rotulo:"Configurar apps"}],t=>{const a=document.getElementById("apps-painel-apps"),o=document.getElementById("apps-painel-perfis");!a||!o||(a.classList.toggle("hidden",t!=="apps"),o.classList.toggle("hidden",t!=="perfis"),t==="perfis"&&xt())}),Vr(),await On())}async function On(){let e;try{e=await m("/apps")}catch{e=null}const t=document.getElementById("apps-lista");if(t){if(!Array.isArray(e)||!e.length){t.innerHTML='<div style="grid-column:1/-1">'+_("apps","Nenhum mini-app","Instale com: <code>opencorp app seed painel-tarefas</code> ou crie via <code>POST /apps</code>.")+"</div>";return}t.innerHTML=e.map(a=>`
    <div class="app-card" onclick="abrirApp('${r(a.id)}')">
      <div class="app-title">${r(a.titulo)}</div>
      <div class="app-meta">${r(a.id)} · ${a.widgets} widget(s)</div>
    </div>
  `).join("")}}async function Dn(e){const t=document.getElementById("apps-lista"),a=document.getElementById("app-view");if(!t||!a)return;let o;try{o=await m("/apps/"+e+"/spec")}catch{t.classList.remove("hidden");return}t.classList.add("hidden"),a.classList.remove("hidden"),a.innerHTML=`
    <div class="flex items-center gap-3 mb-6">
      <button class="btn btn-ghost" onclick="fecharApp()">← Voltar</button>
      <h2 class="font-semibold">${r(o.titulo)}</h2>
    </div>
    <div class="widget-grid" id="widgets-container"></div>
  `;const n=document.getElementById("widgets-container");if(n)for(const s of o.paginas||[]){if(o.paginas.length>1){const c=document.createElement("h3");c.className="text-sm text-zinc-500 mb-2",c.textContent=String(s.titulo||""),n.appendChild(c)}const i=document.createElement("div");i.className="widget-grid",n.appendChild(i);for(const c of s.widgets||[])i.appendChild(await qn(c))}}function Br(){const e=document.getElementById("app-view"),t=document.getElementById("apps-lista");!e||!t||(e.classList.add("hidden"),e.innerHTML="",t.classList.remove("hidden"))}async function Rr(e){if(!e.fonte||!e.fonte.rota)return null;try{const t=await m(e.fonte.rota);return Array.isArray(t),t}catch{return null}}async function qn(e){const t=document.createElement("div");t.className="widget-card",t.innerHTML=`<h4 class="widget-title">${r(e.titulo)}</h4>`;const a=await Rr(e);if(e.tipo==="metrica"){const o=Array.isArray(a)?a.length:a?Object.keys(a).length:0;t.innerHTML+=`<div class="widget-metric">${o}</div>`}else if(e.tipo==="tabela"||e.tipo==="grafico"){const o=e.fonte?.rotulo_campo||"id",n=e.fonte?.campo_valor||"status",s=(Array.isArray(a)?a:[]).slice(0,10);if(e.tipo==="grafico"){const i={};s.forEach(u=>{const p=String(u[n]??"?");i[p]=(i[p]||0)+1});const c=Math.max(1,...Object.values(i));t.innerHTML+=Object.entries(i).map(([u,p])=>`
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xs w-24 truncate">${r(u)}</span>
          <div style="width:${p/c*100}%" class="widget-chart-bar"></div>
          <span class="text-xs">${p}</span>
        </div>
      `).join("")||'<div class="text-zinc-500 text-xs">Sem dados</div>'}else t.innerHTML+=`<table class="widget-table">${s.map(i=>`
        <tr>
          <td class="font-mono text-xs truncate max-w-[150px]">${r(String(i[o]??"").slice(0,30))}</td>
          <td class="text-xs text-zinc-500">${r(String(i[n]??""))}</td>
        </tr>
      `).join("")||'<tr><td class="text-zinc-500 text-xs" colspan="2">Sem dados</td></tr>'}</table>`}else if(e.tipo==="kanban"){const o={};(Array.isArray(a)?a:[]).forEach(n=>{const s=String(n.coluna||"backlog");(o[s]=o[s]||[]).push(n)}),t.innerHTML+=Object.entries(o).map(([n,s])=>`
      <div class="mb-2">
        <div class="text-xs text-zinc-500 capitalize">${r(n)} (${s.length})</div>
        ${s.map(i=>`<div class="text-xs bg-zinc-800 rounded p-1 mb-1 truncate">${r(String(i.titulo||""))}</div>`).join("")}
      </div>
    `).join("")||'<div class="text-zinc-500 text-xs">Sem dados</div>'}else if(e.tipo==="markdown")t.innerHTML+=`<div class="text-xs whitespace-pre-wrap">${r(String(e.texto||""))}</div>`;else if(e.tipo==="lista_tarefas")t.innerHTML+=(Array.isArray(a)?a:[]).map(o=>`
      <label class="flex items-center gap-2 text-xs mb-1">
        <input type="checkbox" ${o.coluna==="feito"?"checked":""} disabled/> ${r(String(o.titulo||""))}
      </label>
    `).join("")||'<div class="text-zinc-500 text-xs">Sem dados</div>';else if(e.tipo==="formulario"){const o=e.acao?.campos||[{nome:"titulo"}];t.innerHTML+=o.map(n=>`
      <input class="mb-2" placeholder="${r(String(n.rotulo||n.nome))}" data-campo="${r(n.nome)}"/>
    `).join("")+`<button class="btn" onclick="enviarForm(this, '${r(e.id)}')">${e.acao?.tipo==="post_rota"?"Enviar":"Executar"}</button>`,t.dataset.rota=e.fonte?.rota||"",t.dataset.acao=e.acao?.tipo||"post_rota"}return t}async function Or(e,t){const a=e.closest(".widget-card");if(!a)return;const o={};a.querySelectorAll("[data-campo]").forEach(s=>{const i=s;o[i.dataset.campo]=i.value});const n=a.dataset.rota||"/tasks";try{await m(n,{method:"POST",body:JSON.stringify(o)}),e.innerHTML="Enviado "+l("spark"),setTimeout(()=>{e.innerHTML=a.dataset.acao==="post_rota"?"Enviar":"Executar"},2e3)}catch(s){d("Erro: "+s.message,"erro"),e.innerHTML=a.dataset.acao==="post_rota"?"Enviar":"Executar"}}const jn="⚠ Atenção: recurso NÃO testado corretamente ainda — armazene apenas referência (bandeira/últimos 4), nunca número completo nem CVV. O servidor rejeita esses campos.",Ot={vps:[{nome:"rotulo",rotulo:"Rótulo",obrigatorio:!0},{nome:"host",rotulo:"Host / IP",obrigatorio:!0},{nome:"porta",rotulo:"Porta",numero:!0,dica:"opcional — ex.: 22"},{nome:"usuario",rotulo:"Usuário",obrigatorio:!0},{nome:"senha",rotulo:"Senha",segredo:!0},{nome:"chave_ssh",rotulo:"Chave SSH",segredo:!0},{nome:"notas",rotulo:"Notas"}],wordpress:[{nome:"rotulo",rotulo:"Rótulo",obrigatorio:!0},{nome:"url",rotulo:"URL do site",obrigatorio:!0,dica:"ex.: https://meusite.com"},{nome:"usuario",rotulo:"Usuário",obrigatorio:!0},{nome:"senha_app",rotulo:"Senha de aplicação",segredo:!0,obrigatorio:!0},{nome:"onde_roda",rotulo:"Onde roda",dica:"ex.: VPS app:vps:servidor-1"},{nome:"notas",rotulo:"Notas"}],mercadopago:[{nome:"rotulo",rotulo:"Rótulo",obrigatorio:!0},{nome:"public_key",rotulo:"Public key",obrigatorio:!0},{nome:"access_token",rotulo:"Access token",segredo:!0,obrigatorio:!0},{nome:"ambiente",rotulo:"Ambiente",obrigatorio:!0,opcoes:["test","prod"]},{nome:"notas",rotulo:"Notas"}],cartao:[{nome:"rotulo",rotulo:"Rótulo",obrigatorio:!0},{nome:"bandeira",rotulo:"Bandeira",obrigatorio:!0},{nome:"ultimos4",rotulo:"Últimos 4 dígitos",obrigatorio:!0,dica:"ex.: 4242 — nunca o número completo"},{nome:"validade",rotulo:"Validade",obrigatorio:!0,dica:"MM/AA"},{nome:"notas",rotulo:"Notas"}],custom:[{nome:"rotulo",rotulo:"Rótulo",obrigatorio:!0},{nome:"conteudo",rotulo:"Conteúdo",obrigatorio:!0,textarea:!0,dica:"informação livre para o agente (chaves de API, configurações…)"},{nome:"notas",rotulo:"Notas"}]},Fn={vps:"VPS / servidor",wordpress:"WordPress",mercadopago:"MercadoPago",cartao:"Cartão (só referência)",custom:"Customizado"},Dr=Object.keys(Ot),Un="rounded-lg border px-4 py-3 text-sm mb-3";function qr(){return`<div class="${Un}" id="app-perfil-banner-cartao" style="border-color:var(--err);color:var(--err);background:rgba(248,113,113,.08)">${r(jn)}</div>`}async function xt(){const e=document.getElementById("apps-painel-perfis");if(!e)return;let t;try{t=await m("/secrets")}catch{t=null}const a=`
    <section class="card p-4">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 class="font-semibold text-sm uppercase tracking-wide text-zinc-400 flex items-center gap-1">Perfis de apps ${b("apps-perfis")}</h2>
        <button class="btn" id="app-perfil-novo" onclick="window.__appPerfilNovo()">+ Novo perfil</button>
      </div>`;if(!t){e.innerHTML=a+S("Não foi possível carregar os perfis de app.",()=>{xt()})+"</section>";return}const o=t.filter(s=>typeof s.nome=="string"&&Nr.test(s.nome)).map(s=>{const i=s.nome.split(":");return{nome:s.nome,tipo:i[1]??"",id:i.slice(2).join(":")}}).sort((s,i)=>s.tipo.localeCompare(i.tipo)||s.id.localeCompare(i.id)),n=new Map;for(const s of o){const i=n.get(s.tipo)??[];i.push(s),n.set(s.tipo,i)}e.innerHTML=`
    ${a}
      ${o.length?[...n.entries()].sort((s,i)=>s[0].localeCompare(i[0])).map(([s,i])=>`
          <div class="cfg-dica mb-1 mt-3 uppercase tracking-wide">${r(Fn[s]??s)} (${i.length})</div>
          ${i.map(c=>`
          <div class="secret-row" data-perfil="${r(c.nome)}">
            <span class="badge badge-pipeline">${r(c.tipo)}</span>
            <span class="font-mono text-sm">${r(c.id)}</span>
            <span class="flex-1"></span>
            <span class="badge badge-ok">definido</span>
            <button class="btn-ghost text-xs" aria-label="Editar ${r(c.nome)}" onclick="window.__appPerfilEditar('${r(c.nome)}')">${l("gear")}</button>
            <button class="btn-ghost text-xs" style="color:var(--err)" aria-label="Excluir ${r(c.nome)}" onclick="window.__appPerfilExcluir('${r(c.nome)}')">${l("trash")}</button>
          </div>`).join("")}`).join(""):_("key","Nenhum perfil de app","Credenciais de VPS, WordPress, MercadoPago e outras informações ficam aqui — gravadas em ~/.opencorp/secrets.json e nunca exibidas.")}
      <div class="${Un} mt-3" data-banner-cartao style="border-color:var(--err);color:var(--err);background:rgba(248,113,113,.08)">${r(jn)}</div>
    </section>
  `}function jr(e){const t="app-perfil-campo-"+e.nome,a=e.dica?`<span class="cfg-dica">${r(e.dica)}</span>`:"";let o;if(e.opcoes)o=`<select id="${t}">${e.opcoes.map(n=>`<option value="${r(n)}">${r(n)}</option>`).join("")}</select>`;else if(e.textarea)o=`<textarea id="${t}" rows="4" placeholder="${r(e.rotulo)}"></textarea>`;else{const n=e.numero?"number":e.segredo?"password":"text",s=e.segredo?' autocomplete="new-password"':"";o=`<input id="${t}" type="${n}"${s} placeholder="${r(e.rotulo)}"/>`}return`
    <div class="cfg-campo">
      <div class="cfg-campo-topo">
        <span class="cfg-label">${r(e.rotulo)}${e.obrigatorio?" *":""}</span>
        ${e.segredo?'<span class="badge badge-neutral">segredo</span>':""}
      </div>
      ${a}
      <div class="cfg-linha">${o}</div>
    </div>
  `}function ra(e,t,a){const o=document.getElementById("apps-painel-perfis");if(!o)return;const n=Ot[e]??Ot.custom;o.innerHTML=`
    <section class="card p-4">
      <div class="flex items-center gap-3 mb-4">
        <button class="btn btn-ghost" onclick="window.__appPerfilVoltar()">← Voltar</button>
        <h2 class="font-semibold">${a?"Editar":"Novo"} perfil de app</h2>
      </div>
      ${e==="cartao"?qr():""}
      <div class="cfg-linha mb-3">
        <select id="app-perfil-tipo" ${a?"disabled":""} onchange="window.__appPerfilTipo()">
          ${Dr.map(s=>`<option value="${r(s)}" ${s===e?"selected":""}>${r(Fn[s]??s)}</option>`).join("")}
        </select>
        <input id="app-perfil-id" placeholder="id (ex.: servidor-1)" value="${r(t)}" ${a?"readonly":""}/>
      </div>
      ${n.map(s=>jr(s)).join("")}
      <div class="text-xs text-zinc-500 mt-3">Como o agente usa: <code>${r(`referencie nas ordens: OPENCORP_SECRET app:${e}:<id>`)}</code></div>
      <p class="cfg-dica mt-1">Salvar substitui todos os valores do perfil. Campos vazios são salvos como "" — o valor nunca volta para a tela.</p>
      <button class="btn mt-3" id="app-perfil-salvar" onclick="window.__appPerfilSalvar()">Salvar perfil</button>
    </section>
  `}async function Fr(){const e=document.getElementById("app-perfil-tipo"),t=document.getElementById("app-perfil-id");if(!e||!t)return;const a=e.value,o=t.value.trim().toLowerCase();if(!/^[a-z0-9][a-z0-9-]{0,40}$/.test(o)){d("ID inválido — use letras minúsculas, números e hífen (começando por letra ou número)","erro");return}const n={};for(const i of Ot[a]??[]){const c=document.getElementById("app-perfil-campo-"+i.nome);if(!c)continue;const u=c.value.trim();if(i.numero){if(!u)continue;const p=Number(u);if(!Number.isInteger(p)||p<1||p>65535){d("Porta inválida (1–65535)","erro");return}n[i.nome]=p;continue}if(!u&&i.obrigatorio){d(`Campo obrigatório: ${i.rotulo}`,"erro");return}n[i.nome]=u}if(a==="cartao"&&!/^\d{4}$/.test(String(n.ultimos4??""))){d("Últimos 4 deve ter exatamente 4 dígitos","erro");return}const s=`app:${a}:${o}`;try{await m("/secrets/"+encodeURIComponent(s),{method:"PUT",body:JSON.stringify({valor:JSON.stringify(n)})}),d(`Perfil "${s}" salvo`,"ok"),await xt()}catch{}}async function Ur(e){const{modalConfirm:t}=await f(async()=>{const{modalConfirm:a}=await Promise.resolve().then(()=>H);return{modalConfirm:a}},void 0);if(await t(`Excluir o perfil "${e}"? Os agentes perdem o acesso imediatamente.`,{confirmar:"Excluir"})){try{await m("/secrets/"+encodeURIComponent(e),{method:"DELETE"}),d(`Perfil "${e}" removido`,"ok")}catch{}await xt()}}function Vr(){const e=window;e.__appPerfilNovo=()=>ra("vps","",!1),e.__appPerfilEditar=t=>{const a=String(t).split(":");ra(a[1]??"custom",a.slice(2).join(":"),!0)},e.__appPerfilExcluir=t=>{Ur(t)},e.__appPerfilTipo=()=>{const t=document.getElementById("app-perfil-tipo"),a=document.getElementById("app-perfil-id");ra(t?.value??"vps",a?.value??"",!1)},e.__appPerfilVoltar=()=>{xt()},e.__appPerfilSalvar=()=>{Fr()}}async function Jr(){const e=window.location.hash.replace(/^#\/?/,""),t=e.startsWith("app/")?e.slice(4):"";if(!t){const{navegar:a}=await f(async()=>{const{navegar:o}=await Promise.resolve().then(()=>G);return{navegar:o}},void 0);a("apps");return}await Dn(decodeURIComponent(t))}function Vn(e){return e?`${e.tipo}${e.origem?":"+e.origem:""}`:""}const z={tipo:"tudo",agente:"",limite:100};let xo=!1;function Wr(e,t){return e==="execucao"?"var(--accent)":e==="task"?t==="feito"?"var(--ok)":t==="fazendo"?"var(--warn)":"var(--ok)":e==="conversa"?"var(--ok)":"var(--warn)"}function Xr(e){switch(e){case"execucao":return"Execução";case"task":return"Task";case"rotina":return"Rotina";case"conversa":return"Conversa"}}function va(){const e=[["tudo","Tudo"],["execucao","Execuções"],["task","Tasks"],["rotina","Rotinas"],["conversa","Conversas"]];return`
    <div class="page-header">
      <div class="page-header-esq">
        <h1 class="page-header-titulo">${l("history")} Histórico</h1>
        <p class="page-header-sub">Execuções · tasks · rotinas · conversas</p>
      </div>
      <div class="page-header-acoes flex-wrap">
        <span class="help-wrap">${b("historico")}</span>
        <div class="flex rounded-lg border border-zinc-700" role="group" aria-label="Filtro por tipo">
          ${e.map(([t,a])=>`<button class="btn-ghost text-xs px-3 py-1 ${z.tipo===t?"bg-blue-600 text-white":""}" onclick="window.__historicoSetFiltro('${t}')">${a}</button>`).join("")}
        </div>
        <select id="historico-agente" class="btn-ghost text-xs" onchange="window.__historicoSetAgente(this.value)" title="Filtrar por agente">
          <option value="">— agente —</option>
          <option value="secretario" ${z.agente==="secretario"?"selected":""}>secretário</option>
          <option value="secretario-exec" ${z.agente==="secretario-exec"?"selected":""}>secretário-exec</option>
        </select>
        <select class="btn-ghost text-xs" onchange="window.__historicoSetLimite(Number(this.value))" aria-label="Limite">
          <option value="50" ${z.limite===50?"selected":""}>50</option>
          <option value="100" ${z.limite===100?"selected":""}>100</option>
          <option value="200" ${z.limite===200?"selected":""}>200</option>
        </select>
      </div>
    </div>
  `}async function Jn(){const e=document.getElementById("view-historico");if(!e)return;if(!e.innerHTML.trim()&&(e.innerHTML=va()+T()),!xo){xo=!0;try{const a=await w("/agents"),o=document.getElementById("historico-agente");if(o){const n=(a??[]).filter(s=>s.id&&s.id!=="secretario"&&s.id!=="secretario-exec").map(s=>`<option value="${r(s.id)}" ${z.agente===s.id?"selected":""}>${r(s.id)}</option>`).join("");o.insertAdjacentHTML("beforeend",n),o.value=z.agente}}catch{}}await Qt()}async function Qt(){const e=document.getElementById("view-historico");if(!e)return;const t=document.getElementById("historico-lista");t?t.innerHTML=T():e.innerHTML=va()+'<div id="historico-lista">'+T()+"</div>";let a=null;try{const n=new URLSearchParams;z.tipo!=="tudo"&&n.set("tipo",z.tipo),z.agente&&n.set("agente",z.agente),n.set("limite",String(z.limite)),a=await w("/historico?"+n.toString())}catch{a=null}const o=document.getElementById("historico-lista");if(o){if(!a){e.innerHTML=va()+S("Não foi possível carregar o histórico.",()=>{Jn()});return}if(!a.length){o.innerHTML=_("history","Nada registrado ainda","Execuções, tasks, rotinas e conversas aparecem aqui conforme a empresa opera.");return}o.innerHTML=`<div class="hist-acordeao">${a.map((n,s)=>`    <div class="acc-item" data-idx="${s}">
      <button class="acc-header" onclick="window.__histToggle(${s})" aria-expanded="false">
        <span class="acc-dot" style="background: ${Wr(n.tipo,n.status)}"></span>
        <span class="acc-titulo">
          <span class="acc-titulo-texto">${r(n.titulo)}</span>
          <span class="acc-sub">${Xr(n.tipo)}${n.agente?" · "+r(n.agente):""}${n.status?" · "+r(n.status):""}${n.tipo==="execucao"&&n.gatilho?" · gatilho: "+r(Vn(n.gatilho)):""}</span>
        </span>
        <span class="acc-quando">${n.quando?Le(n.quando):"—"}</span>
        <span class="acc-seta">▾</span>
      </button>
      <div class="acc-body" id="acc-body-${s}" hidden></div>
    </div>
  `).join("")}</div>`,ga=a,fa.clear()}}let ga=[];const fa=new Set;window.__histToggle=async e=>{const t=document.querySelector(`.acc-item[data-idx="${e}"]`);if(!t)return;const a=t.querySelector(".acc-body"),o=t.querySelector(".acc-seta"),n=a?!a.hidden:!1;a&&(a.hidden=n),t.classList.toggle("aberto",!n),o&&(o.textContent=n?"▾":"▴"),!(n||!ga[e]||fa.has(e))&&(fa.add(e),a&&(a.innerHTML='<div class="acc-loading">carregando detalhes…</div>'),a.innerHTML=await Gr(ga[e]))};async function Gr(e){const{renderMarkdown:t}=await f(async()=>{const{renderMarkdown:o}=await Promise.resolve().then(()=>Qs);return{renderMarkdown:o}},void 0),a=o=>r(String(o??""));try{if(e.tipo==="execucao"){const{log:o}=await w("/sessions/"+encodeURIComponent(e.id)+"/log"),n=(o||"").split(`
`).slice(-40).join(`
`);return`<div class="acc-grid">
        <div><span class="acc-k">execução</span> <span class="acc-v mono">${a(e.id)}</span></div>
        <div><span class="acc-k">agente</span> <span class="acc-v">${a(e.agente||"—")}</span></div>
        <div><span class="acc-k">status</span> <span class="acc-v">${a(e.status||"—")}</span></div>
        ${e.gatilho?`<div><span class="acc-k">gatilho</span> <span class="acc-v">${a(Vn(e.gatilho))}</span></div>`:""}
      </div>
      <pre class="acc-log">${r(n||"(log vazio)")}</pre>`}if(e.tipo==="task"){const o=await w("/tasks/"+encodeURIComponent(e.id));return`<div class="acc-grid">
        <div><span class="acc-k">coluna</span> <span class="acc-v">${a(o.coluna)}</span></div>
        <div><span class="acc-k">responsável</span> <span class="acc-v">${a(String(o.responsavel||"—")).replace("agente:","")}</span></div>
        <div><span class="acc-k">prioridade</span> <span class="acc-v">${a(o.prioridade)}</span></div>
        <div><span class="acc-k">labels</span> <span class="acc-v">${a((o.labels||[]).join(", ")||"—")}</span></div>
        <div><span class="acc-k">due</span> <span class="acc-v">${a(o.due||"—")}</span></div>
      </div>
      ${o.descricao?`<div class="acc-desc">${t(String(o.descricao))}</div>`:""}
      <button class="btn-ghost text-xs" onclick="navegar('tasks');setTimeout(()=>abrirDrawer('${r(e.id)}',''),300)">abrir no board →</button>`}if(e.tipo==="rotina"){const o=await w("/schedules/"+encodeURIComponent(e.id)),n=await w("/schedules/"+encodeURIComponent(e.id)+"/runs?limite=5").catch(()=>[]);return`<div class="acc-grid">
        <div><span class="acc-k">agenda</span> <span class="acc-v mono">${o.agenda_tipo==="cron"?"cron "+a(o.agenda_valor):o.agenda_tipo==="intervalo_min"?"cada "+a(o.agenda_valor)+" min":"em "+a(o.agenda_valor)}</span></div>
        <div><span class="acc-k">workspace</span> <span class="acc-v">${a(o.workspace||"—")}</span></div>
        <div><span class="acc-k">próxima</span> <span class="acc-v">${o.proxima_exec?Le(String(o.proxima_exec)):"—"}</span></div>
        <div><span class="acc-k">estado</span> <span class="acc-v">${Number(o.ativo)===1?"ativa":"pausada"}</span></div>
      </div>
      <div class="acc-k" style="margin-top:.4rem">comando</div>
      <pre class="acc-log">${r(String(o.args_raw||(Array.isArray(o.args)?o.args.join(" "):"")))}</pre>
      ${n.length?'<div class="acc-k" style="margin-top:.5rem">últimas execuções</div>'+n.map(i=>`
        <div class="acc-run ${i.pulado?"pulou":""}">
          <span class="mono">${a(String(i.iniciado_em??"")).slice(0,16).replace("T"," ")}</span>
          <span>${i.pulado?"⏭ pulado":i.erro?"✗ "+a(String(i.erro)).slice(0,60):"✓ "+a(String(i.resultado)).slice(0,60)}</span>
        </div>`).join(""):""}`}return e.tipo==="conversa"?`<div class="acc-conversa">
        ${(await w("/secretario/sessoes/"+encodeURIComponent(e.id)+"/mensagens")).map(n=>`
          <div class="acc-msg ${n.role==="user"?"acc-user":"acc-assist"}">
            <span class="acc-role">${n.role==="user"?"você":"secretária"}</span>
            <div class="acc-msg-texto">${t(n.content)}</div>
          </div>`).join("")}
      </div>
      <button class="btn-ghost text-xs" onclick="navegar('secretario')">abrir no secretário →</button>`:'<div class="acc-loading">tipo desconhecido</div>'}catch(o){return`<div class="acc-loading">não foi possível carregar detalhes: ${a(o.message)}</div>`}}window.__historicoSetFiltro=e=>{z.tipo=e,Qt()};window.__historicoSetAgente=e=>{z.agente=e,Qt()};window.__historicoSetLimite=e=>{z.limite=e,Qt()};const Kr=["opencode/muse-spark-1.2-contributor-free","opencode/nemotron-3-nano-free","opencode/nemotron-3-ultra-free","opencode/nemotron-3-ultra-free:thinking","openrouter/nvidia/nemotron-3-nano-30b-a3b:free","openrouter/nvidia/nemotron-3-ultra-550b-a55b:free","opencode-go/glm-5.3-flash","opencode-go/mimo-v2.5","opencode-go/minimax-m3","openrouter/google/gemini-2.5-flash","openrouter/anthropic/claude-3.5-haiku","openrouter/minimax/minimax-m3:free"],Wn=[{id:"modelos",label:"Modelos",secoes:[{titulo:"Modelos de IA",ajuda:"modelos",campos:[{chave:"secretary.model",label:"Modelo do secretário (chat)",tipo:"model",dica:"vazio = usa o do template (opencode-go/glm-5.3-flash). Digite ou escolha: opencode/muse-spark-1.2-contributor-free, opencode/nemotron-3-nano-free, openrouter/nvidia/nemotron-3-ultra-550b-a55b:free etc. Após salvar, reinicie o secretário."},{chave:"default_model",label:"Modelo padrão dos agentes",tipo:"model",dica:"fallback para agentes sem model no frontmatter — formato provedor/modelo"},{chave:"test_model",label:"Modelo dos testes cegos",tipo:"model",dica:"juiz que avalia outputs"},{chave:"secretary.agent",label:"Agente do secretário",tipo:"string",dica:"qual agente atende o chat (secretario / secretario-exec)"}]}]},{id:"orcamento",label:"Orçamento",secoes:[{titulo:"Limites de gasto",ajuda:"budget",campos:[{chave:"budget.daily_usd",label:"Teto diário do workspace (USD)",tipo:"numero"},{chave:"budget.per_agent_usd",label:"Teto por agente (USD)",tipo:"numero"},{chave:"budget.pause_on_exceed",label:"Pausar agentes ao estourar",tipo:"bool",dica:"80% avisa · 100% pausa"},{chave:"budget.notify_registry",label:"Registry de notificação",tipo:"string"}]}]},{id:"seguranca",label:"Segurança",secoes:[{titulo:"Política de segurança",ajuda:"security",campos:[{chave:"security.level",label:"Nível padrão",tipo:"enum",opcoes:["permissive","standard","strict"]},{chave:"security.blocklist",label:"Comandos bloqueados",tipo:"lista",dica:"1 por linha — ex.: rm -rf"},{chave:"security.hitl_patterns",label:"Padrões que exigem aprovação humana (HITL)",tipo:"lista",dica:"1 por linha — ex.: git push"},{chave:"security.network_allowlist",label:"Allowlist de rede",tipo:"lista",dica:"1 domínio por linha"}]}]},{id:"workspace",label:"Workspace",secoes:[{titulo:"Localização",ajuda:"workspace",campos:[{chave:"paths.workspaces_root",label:"Raiz dos workspaces",tipo:"string",dica:"onde as empresas vivem em disco"}]}]},{id:"testes",label:"Testes",secoes:[{titulo:"Testes cegos",ajuda:"testes",campos:[{chave:"tests.blind",label:"Testes cegos ativos",tipo:"bool"},{chave:"tests.test_model",label:"Modelo avaliador",tipo:"string"},{chave:"tests.rotation",label:"Rotação de juízes",tipo:"lista",dica:"1 modelo por linha"},{chave:"tests.reports_dir",label:"Diretório dos relatórios",tipo:"string"},{chave:"tests.timeout_minutes",label:"Timeout (min)",tipo:"numero"},{chave:"tests.health_check",label:"Health check ativo",tipo:"bool"}]}]},{id:"scheduler",label:"Scheduler",secoes:[{titulo:"Supervisor",ajuda:"scheduler",campos:[{chave:"supervisor.enabled",label:"Supervisor ativo",tipo:"bool",dica:"limpa locks/zombies e reencaixa tarefas"},{chave:"supervisor.interval_minutes",label:"Intervalo entre ticks (min)",tipo:"numero"},{chave:"supervisor.max_orders_per_tick",label:"Máx. de ordens por tick",tipo:"numero"}]},{titulo:"Reuniões",ajuda:"reunioes",campos:[{chave:"meeting.max_turns",label:"Máx. de turnos",tipo:"numero"},{chave:"meeting.max_minutes",label:"Duração máxima (min)",tipo:"numero"},{chave:"meeting.per_agent_usd",label:"Orçamento por agente (USD)",tipo:"numero"},{chave:"meeting.moderator",label:"Moderador",tipo:"string"},{chave:"meeting.ata_model_rotation",label:"Rotação de modelos da ata",tipo:"lista",dica:"1 modelo por linha"}]},{titulo:"Self-healing",ajuda:"healing",campos:[{chave:"healing.enabled",label:"Self-healing ativo",tipo:"bool"},{chave:"healing.max_retries",label:"Tentativas máximas por execução",tipo:"numero"}]}]}];let ye="modelos",ue="global",Xn=new Map;async function Yr(){const e=document.getElementById("view-config");e&&(e.innerHTML=`
    <div class="page-header">
      <div class="page-header-esq">
        <h1 class="page-header-titulo">${l("gear")} Config</h1>
        <p class="page-header-sub">Preferências · segredos · ferramentas</p>
      </div>
      <div class="page-header-acoes">
        <span class="help-wrap">${b("config")}</span>
        <div class="flex items-center gap-1 rounded-lg border border-zinc-700 p-1" role="group" aria-label="Escopo das configurações">
          <button id="cfg-escopo-global" class="btn-ghost text-xs px-3 py-1" onclick="window.__cfgEscopo('global')">Global</button>
          <button id="cfg-escopo-workspace" class="btn-ghost text-xs px-3 py-1" onclick="window.__cfgEscopo('workspace')">Workspace${k()?": "+r(k()):""}</button>
        </div>
      </div>
    </div>
    <div class="config-abas mb-4" role="tablist" aria-label="Abas de configuração">
      ${Wn.map(t=>`<button role="tab" class="btn-ghost config-aba text-xs" data-aba="${t.id}" onclick="window.__cfgAba('${t.id}')">${r(t.label)}</button>`).join("")}
      <button role="tab" class="btn-ghost config-aba text-xs" data-aba="secrets" onclick="window.__cfgAba('secrets')">${l("key")} Secrets</button>
      <button role="tab" class="btn-ghost config-aba text-xs" data-aba="ferramentas" onclick="window.__cfgAba('ferramentas')">${l("apps")} Ferramentas</button>
      <button role="tab" class="btn-ghost config-aba text-xs" data-aba="opencode" onclick="window.__cfgAba('opencode')">${l("gear")} Opencode</button>
      <button role="tab" class="btn-ghost config-aba text-xs" data-aba="chaves" onclick="window.__cfgAba('chaves')">${l("key")} Chaves · opencode</button>
    </div>
    <div id="config-conteudo">${T()}</div>
  `,window.__cfgAba=t=>{ye=t,nt()},window.__cfgEscopo=t=>{if(t==="workspace"&&!k()){d("Selecione um workspace para usar escopo workspace","aviso");return}ue=t==="workspace"?"workspace":"global",Gn(),nt()},await nt())}async function nt(){const e=document.getElementById("config-conteudo");if(!e)return;if(Zr(),Gn(),ye==="secrets"){await ot();return}if(ye==="ferramentas"){await Yn();return}if(ye==="opencode"){await ba();return}if(ye==="chaves"){await Tt();return}const t=Wn.find(o=>o.id===ye);if(!t)return;let a;try{a=await m(ue==="global"?"/settings?escopo=global":"/settings?escopo=workspace")}catch{a=null}if(!a){e.innerHTML=S("Não foi possível carregar as configurações.",()=>{nt()});return}Xn=new Map(a.map(o=>[o.chave,o])),e.innerHTML=t.secoes.map(o=>`
    <section class="card p-4 mb-4">
      <h3 class="font-semibold mb-2 text-sm uppercase tracking-wide text-zinc-400 flex items-center gap-1">${r(o.titulo)}${o.ajuda?b(o.ajuda):""}</h3>
      ${o.campos.map(n=>ec(n)).join("")}
    </section>
  `).join(""),tc()}function Zr(){document.querySelectorAll(".config-aba").forEach(e=>{const t=e.dataset.aba===ye;e.classList.toggle("config-aba-ativa",t)})}function Gn(){const e=document.getElementById("cfg-escopo-global"),t=document.getElementById("cfg-escopo-workspace");e&&(e.style.background=ue==="global"?"var(--accent)":"transparent"),t&&(t.style.background=ue==="workspace"?"var(--accent)":"transparent")}function Qr(e){return`<span class="badge ${e==="workspace"?"badge-ok":e==="global"?"badge-pipeline":e==="default"?"badge-neutral":"badge-warn"}">${r(e)}</span>`}function Kn(e){return"cfg-"+e.replace(/\./g,"-")}function ec(e){const t=Xn.get(e.chave),a=t?.valor,o=t?.origem??"default",n=Kn(e.chave),s=e.dica?`<span class="cfg-dica">${r(e.dica)}</span>`:"";let i="";if(e.tipo==="bool")i=`
      <label class="toggle" title="${a?"ativo":"desativado"}">
        <input type="checkbox" id="${n}" ${a?"checked":""} onchange="window.__cfgBool('${e.chave}', this.checked)"/>
        <span class="toggle-slider"></span>
      </label>`;else if(e.tipo==="enum")i=`
      <div class="cfg-linha">
        <select id="${n}">
          ${(e.opcoes??[]).map(c=>`<option value="${r(c)}" ${c===String(a)?"selected":""}>${r(c)}</option>`).join("")}
        </select>
        <button class="btn" onclick="window.__cfgSalvar('${e.chave}', 'enum')">Salvar</button>
      </div>`;else if(e.tipo==="lista")Array.isArray(a)&&a.map(String).join(`
`),i=`
      <div class="cfg-linha">
        <textarea id="${n}" rows="3" placeholder="1 por linha"></textarea>
        <button class="btn" onclick="window.__cfgSalvar('${e.chave}', 'lista')">Salvar</button>
      </div>`;else if(e.tipo==="numero")i=`
      <div class="cfg-linha">
        <input id="${n}" type="number" step="any" value="${r(String(a??""))}"/>
        <button class="btn" onclick="window.__cfgSalvar('${e.chave}', 'numero')">Salvar</button>
      </div>`;else if(e.tipo==="model"){const c="dl-"+n,u=String(a??"");i=`
      <div class="cfg-linha">
        <input id="${n}" value="${r(u)}" list="${c}" placeholder="ex.: opencode/muse-spark-1.2-contributor-free" autocomplete="off"/>
        <datalist id="${c}">${Kr.map(p=>`<option value="${r(p)}"></option>`).join("")}</datalist>
        <button class="btn" onclick="window.__cfgSalvar('${e.chave}', 'model')">Salvar</button>
      </div>
      <div class="cfg-dica" style="margin-top:.25rem">Escolha na lista ou digite manualmente (<code>provedor/modelo</code>). Modelos com <code>:free</code> usam cota gratuita quando disponível.</div>`}else i=`
      <div class="cfg-linha">
        <input id="${n}" value="${r(String(a??""))}"/>
        <button class="btn" onclick="window.__cfgSalvar('${e.chave}', 'string')">Salvar</button>
      </div>`;return`
    <div class="cfg-campo">
      <div class="cfg-campo-topo">
        <span class="cfg-label">${r(e.label)}</span>
        ${Qr(o)}
        <span class="cfg-chave" title="chave no settings.json">${r(e.chave)}</span>
      </div>
      ${s}
      ${i}
    </div>
  `}async function yo(e,t,a){let o;if(t==="bool")o=a?"true":"false";else{const n=Kn(e),s=document.getElementById(n);if(!s)return;const i=s.value;if(t==="numero"){const c=Number(i);if(Number.isNaN(c)){d("Valor não é um número","erro");return}o=String(c)}else if(t==="lista"){const c=i.split(`
`).map(u=>u.trim()).filter(Boolean);o=JSON.stringify(c)}else o=i}try{await m("/settings",{method:"PUT",body:JSON.stringify({chave:e,valor:o,scope:ue})}),e==="secretary.model"||e==="default_model"?d(`${e} salvo (${ue==="workspace"?"workspace":"global"}) — reinicie o secretário para aplicar`,"ok"):d(`${e} salvo (${ue==="workspace"?"workspace":"global"})`,"ok"),await nt()}catch{}}function tc(){const e=window;e.__cfgSalvar=(t,a)=>{yo(t,a)},e.__cfgBool=(t,a)=>{yo(t,"bool",a)}}async function ot(){const e=document.getElementById("config-conteudo");if(!e)return;let t;try{t=await m("/secrets")}catch{t=null}if(!t){e.innerHTML=S("Não foi possível carregar os secrets.",()=>{ot()});return}e.innerHTML=`
    <section class="card p-4 mb-4">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h3 class="font-semibold text-sm uppercase tracking-wide text-zinc-400 flex items-center gap-1">Segredos cadastrados ${b("secrets")}</h3>
        <div class="flex gap-2 flex-wrap">
          <button class="btn-ghost text-xs" onclick="window.__cfgSecretTemplate('wp')">${l("key")} Credencial WordPress</button>
          <button class="btn-ghost text-xs" onclick="window.__cfgSecretTemplate('apikey')">${l("lock")} API Key genérica</button>
        </div>
      </div>
      ${t.length?`<div class="secret-lista">${t.map(o=>`
            <div class="secret-row">
              <span class="font-mono text-sm">${r(o.nome)}</span>
              <span class="flex-1"></span>
              <span class="badge badge-ok">definido</span>
              <button class="btn-ghost text-xs" style="color:var(--err)" aria-label="Remover ${r(o.nome)}" onclick="window.__cfgSecretRemover('${r(o.nome)}')">${l("trash")}</button>
            </div>`).join("")}
          </div>`:_("key","Nenhum segredo","Credenciais (senhas de API, WordPress…) ficam aqui. Os agentes usam sem nunca exibir o valor.")}
    </section>
    <section class="card p-4">
      <h3 class="font-semibold text-sm uppercase tracking-wide text-zinc-400 mb-2">Adicionar segredo</h3>
      <div class="cfg-linha">
        <input id="secret-nome" placeholder="nome (ex.: minha_api_key)" autocomplete="off"/>
        <input id="secret-valor" type="password" placeholder="valor — nunca é exibido" autocomplete="new-password"/>
        <button class="btn" onclick="window.__cfgSecretSalvar()">Adicionar</button>
      </div>
      <p class="cfg-dica" style="margin-top:.5rem">O valor é gravado em <code>~/.opencorp/secrets.json</code> e nunca volta para a tela — só o nome.</p>
    </section>
  `;const a=window;a.__cfgSecretSalvar=async()=>{const o=document.getElementById("secret-nome"),n=document.getElementById("secret-valor"),s=(o?.value??"").trim(),i=n?.value??"";if(!/^[a-zA-Z0-9_]+$/.test(s)){d("Nome inválido — use letras, números e _","erro");return}if(!i){d("Valor obrigatório","erro");return}await m("/secrets/"+encodeURIComponent(s),{method:"PUT",body:JSON.stringify({valor:i})}),d(`Segredo "${s}" salvo`,"ok"),await ot()},a.__cfgSecretRemover=async o=>{const{modalConfirm:n}=await f(async()=>{const{modalConfirm:s}=await Promise.resolve().then(()=>H);return{modalConfirm:s}},void 0);await n(`Remover o segredo "${o}"? Os agentes perdem o acesso imediatamente.`,{confirmar:"Remover"})&&(await m("/secrets/"+encodeURIComponent(o),{method:"DELETE"}),d(`Segredo "${o}" removido`,"ok"),await ot())},a.__cfgSecretTemplate=async o=>{const{modalPrompt:n}=await f(async()=>{const{modalPrompt:s}=await Promise.resolve().then(()=>H);return{modalPrompt:s}},void 0);if(o==="wp"){const s=await n({titulo:"Credencial WordPress",label:"Identificador do site (snake_case):",placeholder:"ex.: meu_site",obrigatorio:!0});if(!s)return;const i=s.trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,""),c=await n({titulo:"WordPress — usuário",label:`Usuário para wp_${i}_user:`,obrigatorio:!0});if(!c)return;const u=await n({titulo:"WordPress — senha",label:`Senha para wp_${i}_pass:`,obrigatorio:!0});if(!u)return;await m("/secrets/"+encodeURIComponent(`wp_${i}_user`),{method:"PUT",body:JSON.stringify({valor:c})}),await m("/secrets/"+encodeURIComponent(`wp_${i}_pass`),{method:"PUT",body:JSON.stringify({valor:u})}),d(`Credencial wp_${i}_user/_pass criada`,"ok")}else{const s=await n({titulo:"API Key genérica",label:"Nome da chave (ex.: openrouter_key):",obrigatorio:!0});if(!s)return;const i=await n({titulo:"API Key genérica",label:`Valor para ${s}:`,obrigatorio:!0});if(!i)return;await m("/secrets/"+encodeURIComponent(s.trim()),{method:"PUT",body:JSON.stringify({valor:i})}),d(`Segredo "${s.trim()}" salvo`,"ok")}await ot()}}async function Yn(){const e=document.getElementById("config-conteudo");if(!e)return;let t;try{t=await m("/tools")}catch{t=null}if(!t){e.innerHTML=S("Não foi possível carregar as ferramentas.",()=>{Yn()});return}if(!t.length){e.innerHTML=_("apps","Nenhuma ferramenta","Ferramentas são JSONs em <code>.opencorp/tools/</code> do workspace — o template default traz wp.pagina e wp.configurar.");return}e.innerHTML=`
    <section class="card p-4 mb-3">
      <h3 class="font-semibold text-sm uppercase tracking-wide text-zinc-400 flex items-center gap-1 mb-2">Ferramentas do workspace ${b("tools")}</h3>
      ${t.map(a=>{const o=a.spec??{};return`
        <div class="card p-4 mb-3">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <span class="font-mono text-sm font-semibold">${r(a.id)}</span>
            ${o.titulo?`<span class="text-sm text-zinc-300">${r(o.titulo)}</span>`:""}
            ${o.handler?.tipo?`<span class="badge badge-pipeline">${r(o.handler.tipo)}</span>`:""}
            ${o.approval?`<span class="badge ${o.approval==="nunca"?"badge-ok":"badge-warn"}">approval: ${r(o.approval)}</span>`:""}
            ${a.erro?'<span class="badge badge-err">JSON inválido</span>':""}
          </div>
          ${o.descricao?`<div class="text-sm text-zinc-400 mb-2">${r(o.descricao)}</div>`:""}
          ${a.erro?`<div class="text-xs" style="color:var(--err)">${r(a.erro)}</div>`:""}
          ${a.spec?`
            <details>
              <summary class="text-xs text-zinc-500 cursor-pointer">ver spec</summary>
              <pre class="text-xs whitespace-pre-wrap scrollbar-thin max-h-64 overflow-auto mt-2">${r(JSON.stringify(a.spec,null,2))}</pre>
            </details>`:""}
        </div>
      `}).join("")}
    </section>
  `}async function ba(){const e=document.getElementById("config-conteudo");if(!e)return;let t;try{t=await m("/opencode-config")}catch{t=null}if(!t){e.innerHTML=S("Não foi possível carregar a config do opencode.",()=>{ba()});return}e.innerHTML=`
    <section class="card p-4 mb-4">
      <h3 class="font-semibold text-sm uppercase tracking-wide text-zinc-400 flex items-center gap-1 mb-2">Opencode (do opencorp)</h3>
      <p class="cfg-dica mb-2">Arquivo: <code>${r(t.path)}</code> — JSON livre (model, small_model, mcp.opencorp…). O <code>$schema</code> é preservado pelo servidor.</p>
      <div class="cfg-linha">
        <textarea id="cfg-opencode-json" rows="18" spellcheck="false" class="font-mono text-xs" style="line-height:1.5">${r(JSON.stringify(t.config,null,2))}</textarea>
      </div>
      <div class="flex flex-wrap items-center gap-2 mt-2">
        <button class="btn" onclick="window.__cfgOpencodeSalvar()">Salvar</button>
        <span class="cfg-dica" style="color:var(--warn)">⚠ alterações valem após reiniciar o secretário (Config → Ações → Reiniciar secretário)</span>
      </div>
    </section>
  `,window.__cfgOpencodeSalvar=async()=>{const a=document.getElementById("cfg-opencode-json");if(!a)return;let o;try{o=JSON.parse(a.value)}catch(n){d("JSON inválido: "+n.message,"erro");return}if(o===null||typeof o!="object"||Array.isArray(o)){d('A config deve ser um objeto JSON (ex.: { "model": "…" })',"erro");return}try{await m("/opencode-config",{method:"PUT",body:JSON.stringify({config:o})}),d("Config do opencode salva — reinicie o secretário para valer","ok"),await ba()}catch{}}}async function Tt(){const e=document.getElementById("config-conteudo");if(!e)return;let t=null;try{t=await m("/provider-keys")}catch{t=null}if(!t){e.innerHTML=S("Não foi possível carregar as chaves de API.",()=>{Tt()});return}const a=ue==="workspace"&&!!t.workspace.id,o=a?t.workspace.chaves:t.global.chaves,n=a?t.workspace.herdadas:[],s=(i,c)=>`
    <div class="approval-row">
      <div class="min-w-0">
        <div class="font-mono text-sm">${r(i.provider)}</div>
        <div class="text-xs text-zinc-500 font-mono">${r(i.preview)} · ${r(i.tipo)}</div>
      </div>
      <button class="btn btn-ghost text-xs" onclick="window.__cfgChaveRemover('${r(i.provider)}','${c}')" title="Remover chave">${l("trash")} Remover</button>
    </div>`;e.innerHTML=`
    <section class="card p-4 mb-4">
      <h3 class="font-semibold text-sm uppercase tracking-wide text-zinc-400 flex items-center gap-1 mb-2">Chaves de API — motor opencode</h3>
      <p class="cfg-dica mb-2">Estas chaves configuram o <b>opencode</b> — o motor que executa os agentes da empresa (secretário, runs, reuniões). No futuro, outros motores de agentes terão chaves próprias.</p>
      <p class="cfg-dica mb-2">${a?`Escopo <b>workspace</b> (${r(t.workspace.id??"")}) — valem só para os agentes da empresa e <b>sobrepõem as globais</b> por provedor.`:"Escopo <b>global</b> — fallback para todas as empresas (o workspace pode sobrescrever por provedor no escopo dele)."}</p>
      ${o.map(i=>s(i,a?"workspace":"global")).join("")||'<div class="cfg-dica mb-2">Nenhuma chave configurada neste escopo.</div>'}
      ${a&&n.length?`<div class="cfg-dica mt-2 mb-1">Herdadas do global (ativas aqui enquanto não houver override):</div>${n.map(i=>`<div class="approval-row"><div class="min-w-0"><div class="font-mono text-sm">${r(i.provider)}</div><div class="text-xs text-zinc-500 font-mono">${r(i.preview)} (herdada)</div></div></div>`).join("")}`:""}
      <div class="cfg-linha mt-3">
        <input id="cfg-chave-provider" placeholder="provedor (ex.: opencode-go, openrouter)" class="font-mono text-xs"/>
        <input id="cfg-chave-valor" type="password" placeholder="chave de API (sk-…)" class="font-mono text-xs"/>
        <button class="btn" onclick="window.__cfgChaveSalvar('${a?"workspace":"global"}')">Salvar chave ${a?"no workspace":"no global"}</button>
      </div>
      <div class="cfg-dica" style="color:var(--warn)">⚠ após alterar, reinicie o secretário para aplicar no chat (agentes novos já pegam no próximo run)</div>
    </section>
  `,window.__cfgChaveSalvar=async i=>{const c=document.getElementById("cfg-chave-provider")?.value.trim()??"",u=document.getElementById("cfg-chave-valor")?.value.trim()??"";if(!c||!u){d("Informe o provedor e a chave","aviso");return}try{await m("/provider-keys",{method:"PUT",body:JSON.stringify({provider:c,key:u,escopo:i})}),d(`Chave de ${c} salva (${i==="workspace"?"workspace":"global"}) — reinicie o secretário para aplicar no chat`,"ok"),await Tt()}catch(p){d("Erro ao salvar chave: "+p.message,"erro")}},window.__cfgChaveRemover=async(i,c)=>{try{await m("/provider-keys/"+encodeURIComponent(i)+"?escopo="+c,{method:"DELETE"}),d(`Chave de ${i} removida (${c})`,"ok"),await Tt()}catch(u){d("Erro ao remover: "+u.message,"erro")}}}let Dt=null,ze=null;function Fe(){Dt?.remove(),Dt=null;const e=ze;ze=null,e?.()}let $o=!1;function ac(){$o||($o=!0,document.addEventListener("keydown",e=>{Dt&&e.key==="Escape"&&Fe()}))}function Zn(e,t){Fe(),ze=null;const a=document.createElement("div");a.className="modal-overlay",a.setAttribute("role","presentation");const o=document.createElement("div");return o.className="modal-box",o.setAttribute("role","dialog"),o.setAttribute("aria-modal","true"),o.setAttribute("aria-label",e),o.innerHTML=`
    <h2 class="modal-titulo">${e}</h2>
    <div class="modal-corpo"></div>
    <div class="modal-acoes">
      <button type="button" class="btn btn-ghost modal-cancelar" aria-label="Cancelar">Cancelar</button>
      <button type="button" class="btn modal-ok" aria-label="${t}">${t}</button>
    </div>
  `,a.appendChild(o),a.addEventListener("click",n=>{n.target===a&&Fe()}),document.body.appendChild(a),Dt=a,o.querySelector(".modal-cancelar").addEventListener("click",()=>Fe()),ac(),o}function oc(e){return new Promise(t=>{const a=Zn(e.titulo,e.textoOk||"OK");ze=()=>t(null);const o=a.querySelector(".modal-corpo");let n;e.multiline?(o.innerHTML=`
        ${e.label?`<label class="modal-label" for="modal-campo">${e.label}</label>`:""}
        <textarea id="modal-campo" class="modal-campo" rows="4" placeholder="${e.placeholder||""}"></textarea>
      `,n=o.querySelector("#modal-campo")):(o.innerHTML=`
        ${e.label?`<label class="modal-label" for="modal-campo">${e.label}</label>`:""}
        <input id="modal-campo" class="modal-campo" placeholder="${e.placeholder||""}"/>
      `,n=o.querySelector("#modal-campo")),e.valor&&(n.value=e.valor);const s=a.querySelector(".modal-ok");function i(){const c=n.value;if(e.obrigatorio&&!c.trim()){n.focus();return}ze=null,Fe(),t(c)}s.addEventListener("click",i),n.addEventListener("keydown",c=>{c.key==="Enter"&&!e.multiline&&i()}),setTimeout(()=>n.focus(),0)})}function Qn(e,t){return new Promise(a=>{const o=Zn(t?.titulo||"Confirmação",t?.confirmar||"Confirmar");ze=()=>a(!1);const n=o.querySelector(".modal-corpo");n.innerHTML=`<p class="modal-msg">${e}</p>`;const s=o.querySelector(".modal-ok");s.addEventListener("click",()=>{ze=null,Fe(),a(!0)}),setTimeout(()=>s.focus(),0)})}const H=Object.freeze(Object.defineProperty({__proto__:null,modalConfirm:Qn,modalPrompt:oc},Symbol.toStringTag,{value:"Module"})),es="oc-terminal-tabs",qt=4,ts=1024*1024,nc=20,sc=12,ic=4e3,rc=600,cc=new Set(["node_modules",".git","dist","web-dist","__pycache__"]);let Q=null,ha=!1,jt=null,Ue=new Set;const ie=new Map,Ge=new Set;let lt=!1,ca=!1,E=[],N=null,wa=null,P=[],oe=null,O=[],$e=0,xa="";function Ja(e){return e.toLowerCase().endsWith(".md")}function as(e){return Ja(e)?"preview":"editor"}function lc(e){return e==="editor"||e==="preview"||e==="split"}function dc(){const e=new Set(P.map(a=>a.nome));let t=1;for(;e.has("term-"+t);)t++;return"term-"+t}function Wa(e,t){return!!(cc.has(e)||e==="logs"&&t===".opencorp")}function ya(e){return[...e].sort((t,a)=>t.tipo!==a.tipo?t.tipo==="dir"?-1:1:t.nome.localeCompare(a.nome))}function uc(e){return e.length===0||e.every(t=>t.caminho===".opencorp"||t.caminho.startsWith(".opencorp/"))}function os(){return"oc-ws-tabs:"+(k()||"")}function Xa(){return"oc-ws-drafts:"+(k()||"")}function dt(){try{const e={tabs:E.map(t=>({p:t.caminho,m:t.modo})),ativa:N};localStorage.setItem(os(),JSON.stringify(e))}catch{}}function pc(){try{const e=JSON.parse(localStorage.getItem(os())??"null");return!e||!Array.isArray(e.tabs)?null:e}catch{return null}}function ea(){try{const e=JSON.parse(localStorage.getItem(Xa())??"{}");return e&&typeof e=="object"?e:{}}catch{return{}}}function $a(){try{const e=ea(),t={};for(const a of E)a.editado!==a.original&&(t[a.caminho]={c:a.editado,t:Date.now()});localStorage.setItem(Xa(),JSON.stringify({...e,...t}))}catch{}}function ta(e){try{const t=ea();if(!(e in t))return;delete t[e],localStorage.setItem(Xa(),JSON.stringify(t))}catch{}}function mc(e){const t=k(),a="/files?path="+encodeURIComponent(e);return t?a+"&workspace="+encodeURIComponent(t):a}async function ns(e,t){if(new TextEncoder().encode(e.editado).length>ts)throw new Error("conteúdo excede 1MB");const a=await fetch(mc(e.caminho),{method:"PUT",headers:Lo(),body:JSON.stringify({conteudo:e.editado}),...t?{keepalive:!0}:{}});if(!a.ok)throw new Error("HTTP "+a.status);e.original=e.editado,ta(e.caminho)}function ss(){return E.filter(e=>e.editado!==e.original)}async function ko(e){if(wa!==(k()||null))return;const t=ss();if(t.length&&(await Promise.allSettled(t.map(a=>ns(a,e))),document.getElementById("view-workspace")?.classList.contains("active"))){ve();const a=E.find(o=>o.caminho===N);a&&Za(a)}}let Eo=!1;function vc(){if(Eo)return;Eo=!0;const e=window;e.__workspaceAtualizar=()=>{Ga()},e.__workspaceDir=a=>bc(a),e.__workspaceArquivo=a=>{Ya(a)},e.__workspaceModo=a=>kc(a),e.__workspaceEditar=a=>ds(a),e.__workspaceSalvar=()=>{_o()},e.__workspaceFecharTab=a=>{Ea(a)},e.__workspaceTermCriar=()=>Ic(),e.__workspaceTermLimpar=()=>Lc(),e.__workspaceTermRodar=()=>{ps()},e.__workspaceTermTecla=a=>Cc(a),e.__workspaceEditorTecla=a=>Ec(a),e.__workspaceBuscaInput=a=>cs(a),e.__workspaceBuscaTecla=a=>xc(a),e.__workspaceBuscaAbrir=a=>{ls(a.dataset.caminho??"")},document.addEventListener("keydown",a=>{!(a.ctrlKey||a.metaKey)||a.key.toLowerCase()!=="s"||document.getElementById("view-workspace")?.classList.contains("active")&&(a.preventDefault(),_o())}),document.addEventListener("keydown",a=>{!(a.ctrlKey||a.metaKey)||a.key.toLowerCase()!=="p"||document.getElementById("view-workspace")?.classList.contains("active")&&(a.preventDefault(),document.getElementById("ws-busca")?.focus())}),window.addEventListener("hashchange",()=>{ss().length&&($a(),ko(!1))});const t=()=>{$a(),ko(!0)};window.addEventListener("pagehide",t),document.addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&t()})}async function is(){const e=document.getElementById("view-workspace");e&&(vc(),Sc(),wa!==(k()||null)&&(E=[],N=null,wa=k()||null,ie.clear(),Ge.clear(),lt=!1,Ue=new Set),e.innerHTML=`
    <div class="vs-root">
      <div class="vs-principal">
        <div id="ws-tabs-arq" class="vs-tabs scrollbar-none" role="tablist"></div>
        <div id="ws-arq-corpo" class="vs-corpo"></div>
        <div class="vs-term">
          <div class="vs-term-topo">
            <span class="vs-term-titulo">${l("run")} TERMINAL</span>
            <div class="flex gap-1">
              <button class="btn btn-ghost ws-btn-mini" onclick="window.__workspaceTermLimpar()" title="Limpar o log do terminal ativo">Limpar</button>
              <button class="btn btn-ghost ws-btn-mini" id="ws-btn-term-novo" onclick="window.__workspaceTermCriar()" title="Novo terminal (máx ${qt})">${l("plus")} terminal</button>
            </div>
          </div>
          <div id="ws-tabs-term" class="vs-tabs vs-tabs-term scrollbar-none"></div>
          <div id="ws-term-corpo" class="vs-term-corpo"></div>
        </div>
      </div>
      <aside class="vs-lateral">
        <div class="vs-lateral-topo">
          <span class="vs-lateral-rotulo">EXPLORADOR</span>
          <span class="text-xs text-zinc-500" id="ws-truncado"></span>
          <button class="btn btn-ghost ws-btn-mini" onclick="window.__workspaceAtualizar()" title="Recarregar árvore de arquivos">${l("run")} Atualizar</button>
        </div>
        <div class="vs-busca">
          <input id="ws-busca" class="ws-busca-campo" placeholder="Buscar arquivo… (Ctrl+P)" autocomplete="off" spellcheck="false"
                 oninput="window.__workspaceBuscaInput(this.value)" onkeydown="window.__workspaceBuscaTecla(event)"/>
          <div id="ws-busca-resultados"></div>
        </div>
        <div id="ws-arvore" class="vs-arvore scrollbar-none">${T("Carregando arquivos…")}</div>
        <div class="vs-lateral-pe">${b("workspace-view")}</div>
      </aside>
    </div>
  `,ve(),Pe(),us(),Tc(),await Ga())}async function Ga(){jt=null;try{const e=await m("/files/tree?profundidade=6");if(Q=Array.isArray(e?.arvore)?e.arvore:[],ha=!1,e?.truncado){const t=await m("/files").catch(()=>null);t?.tipo==="dir"&&Array.isArray(t.itens)&&t.itens.length?Q=ya(t.itens.filter(a=>!Wa(a.nome,"")).map(a=>({nome:a.nome,caminho:a.nome,tipo:a.tipo==="dir"?"dir":"arquivo",tamanho:a.tamanho,filhos:[]}))):ha=!0}Ka(Q)}catch(e){jt=e.message}Ve()}function Ka(e){for(const t of e)t.tipo==="arquivo"&&Ge.add(t.caminho),t.filhos?.length&&Ka(t.filhos)}function rs(e,t){for(const a of e){if(a.caminho===t)return a;if(a.filhos?.length){const o=rs(a.filhos,t);if(o)return o}}return null}async function gc(e){if(ie.has(e)){Ve();return}const t=Q?rs(Q,e):null;if(t?.filhos?.length){ie.set(e,ya(t.filhos)),Ka(t.filhos),Ve();return}try{const a=await m(`/files?path=${encodeURIComponent(e)}`);if(a.tipo!=="dir"||!Array.isArray(a.itens))ie.set(e,[]);else{const o=a.itens.filter(n=>!Wa(n.nome,e)).map(n=>({nome:n.nome,caminho:e?`${e}/${n.nome}`:n.nome,tipo:n.tipo==="dir"?"dir":"arquivo",tamanho:n.tamanho,filhos:[]}));ie.set(e,ya(o));for(const n of o)n.tipo==="arquivo"&&Ge.add(n.caminho)}}catch{ie.set(e,[])}Ue.has(e)&&Ve()}function fc(e){return ie.has(e.caminho)?ie.get(e.caminho)??null:e.filhos?.length?e.filhos:null}function Ve(){const e=document.getElementById("ws-arvore");if(!e)return;if(jt){e.innerHTML=S(jt,()=>{Ga()});return}if(!Q){e.innerHTML=T("Carregando arquivos…");return}const t=document.getElementById("ws-truncado");if(t&&(t.textContent=ha?"árvore truncada":""),uc(Q)){const a='<div class="ws-dica">Nada fora de <code>.opencorp</code> ainda — agentes, ferramentas e registros da empresa vivem lá.</div>';e.innerHTML=a+Q.map(o=>ka(o,0)).join("");return}e.innerHTML=Q.map(a=>ka(a,0)).join("")}function ka(e,t){const a=`padding-left:${8+t*14}px`;if(e.tipo==="dir"){const o=Ue.has(e.caminho),n=fc(e);let s="";return o&&(s=n?n.map(i=>ka(i,t+1)).join(""):`<div class="tree-carregando" style="${a}">carregando…</div>`),`
      <button type="button" class="tree-dir${o?" tree-aberto":""}" data-path="${r(e.caminho)}" style="${a}" onclick="window.__workspaceDir(this)" title="${r(e.caminho)}">
        <span class="tree-chev">${o?"▾":"▸"}</span>${l("folder","tree-ico")}<span class="tree-nome">${r(e.nome)}</span>
      </button>${s}`}return`
    <button type="button" class="tree-arquivo" data-path="${r(e.caminho)}" style="${a}" onclick="window.__workspaceArquivo(this)" title="${r(e.caminho)}">
      ${l("file","tree-ico")}<span class="tree-nome">${r(e.nome)}</span>
    </button>`}function bc(e){const t=e.dataset.path??"";if(t){if(Ue.has(t)){Ue.delete(t),Ve();return}Ue.add(t),Ve(),gc(t)}}async function Ya(e){const t=typeof e=="string"?e:e.dataset.path??"";if(!t)return;if(E.find(o=>o.caminho===t)){N=t,ve(),Pe(),dt();return}try{const o=await m(`/files?path=${encodeURIComponent(t)}`);if(o.tipo!=="arquivo"||typeof o.conteudo!="string"){d(o.motivo??"Não foi possível abrir o arquivo","aviso");return}const n=t.split("/").pop()??t,s={caminho:t,nome:n,original:o.conteudo,editado:o.conteudo,modo:as(n)},i=ea()[t];i&&typeof i.c=="string"&&i.c!==s.original?s.editado=i.c:ta(t),E.push(s),N=t,ve(),Pe(),dt()}catch{}}function hc(e){Ne("@"+e),gt();const t=document.getElementById("lat-input");t&&(t.value=Wt())}async function wc(){if(lt||ca)return;ca=!0;const e=[""];let t=0;for(;e.length&&t<rc&&Ge.size<ic;){const a=e.shift();t++;try{const o=a?`/files?path=${encodeURIComponent(a)}`:"/files",n=await m(o);if(n.tipo!=="dir"||!Array.isArray(n.itens))continue;for(const s of n.itens){const i=a?`${a}/${s.nome}`:s.nome;s.tipo==="dir"?Wa(s.nome,a)||e.push(i):Ge.add(i)}}catch{}}lt=!0,ca=!1,xa.trim().length>=2?cs(xa):Ee()}function cs(e){xa=e;const t=e.trim().toLowerCase();if(t.length<2){O=[],Ee();return}O=[...Ge].filter(a=>a.toLowerCase().includes(t)).sort((a,o)=>a.length-o.length||a.localeCompare(o)).slice(0,sc),$e=0,Ee(),lt||wc()}function Ee(){const e=document.getElementById("ws-busca-resultados");if(!e)return;if((document.getElementById("ws-busca")?.value??"").trim().length<2){e.innerHTML="",e.classList.remove("aberta");return}const o=!lt;if(!O.length){e.innerHTML=`<div class="vs-busca-vazio">${o?"indexando o workspace…":"nenhum arquivo encontrado"}</div>`,e.classList.add("aberta");return}e.innerHTML=O.map((n,s)=>{const i=n.includes("/")?n.slice(0,n.lastIndexOf("/")):"",c=n.split("/").pop()??n;return`<button type="button" class="vs-busca-item${s===$e?" ativa":""}" data-caminho="${r(n)}" onclick="window.__workspaceBuscaAbrir(this)">
        <span class="vs-busca-nome">${r(c)}</span><span class="vs-busca-dir">${r(i)}</span>
      </button>`}).join("")+(o?'<div class="vs-busca-mais">indexando o workspace…</div>':""),e.classList.add("aberta"),e.querySelector(".vs-busca-item.ativa")?.scrollIntoView({block:"nearest"})}async function ls(e){if(!e)return;const t=document.getElementById("ws-busca");t&&(t.value=""),O=[],Ee(),await Ya(e)}function xc(e){const t=e.target;if(e.key==="ArrowDown")e.preventDefault(),O.length&&($e=($e+1)%O.length,Ee());else if(e.key==="ArrowUp")e.preventDefault(),O.length&&($e=($e-1+O.length)%O.length,Ee());else if(e.key==="Enter"){e.preventDefault();const a=O[$e]??O[0];a&&ls(a)}else e.key==="Escape"&&(e.preventDefault(),t.value="",O=[],Ee(),t.blur())}function yc(e){return(e.editado!==e.original?"● ":"")+e.nome}function ve(){const e=document.getElementById("ws-tabs-arq");if(!e)return;const t=E.map(o=>({id:o.caminho,rotulo:yc(o)}));Pa(e,t,o=>{N=o,Pe(),dt()},N??void 0),Array.from(e.querySelectorAll(".ui-tab")).forEach((o,n)=>{const s=t[n]?.id;if(!s)return;o.onauxclick=c=>{c.button===1&&(c.preventDefault(),Ea(s))};const i=document.createElement("span");i.className="ui-tab-fechar",i.textContent="×",i.title="Fechar aba",i.onclick=c=>{c.stopPropagation(),Ea(s)},o.appendChild(i)})}async function Ea(e){const t=E.findIndex(o=>o.caminho===e);if(t<0)return;const a=E[t];a.editado!==a.original&&!await Qn(`Há alterações não salvas em <code>${r(a.nome)}</code>. Fechar mesmo assim?`,{titulo:"Descartar alterações?",confirmar:"Fechar"})||(E.splice(t,1),ta(e),N===e&&(N=E[Math.min(t,E.length-1)]?.caminho??null),ve(),Pe(),dt())}function Za(e){const t=e.editado!==e.original,a=document.getElementById("ws-btn-salvar");a&&(a.disabled=!t);const o=document.getElementById("ws-arq-nome");o&&(o.innerHTML=(t?'<span class="ws-dirty">●</span> ':"")+r(e.caminho))}function Pe(){const e=document.getElementById("ws-arq-corpo");if(!e)return;const t=E.find(i=>i.caminho===N);if(!t){e.innerHTML=_("file","Nenhum arquivo aberto","Abra um arquivo na árvore à direita ou busque pelo nome (Ctrl+P). As alterações não salvas sobrevivem à navegação e à recarga da página.");return}const a=Ja(t.nome),o=t.editado!==t.original,n=a?[["editor","Editor"],["preview","Preview"],["split","Lado a lado"]]:[["editor","Editor"],["preview","Preview"]];e.innerHTML=`
    <div class="ws-arq-header">
      <span class="ws-arq-nome" id="ws-arq-nome" title="${r(t.caminho)}">${o?'<span class="ws-dirty">●</span> ':""}${r(t.caminho)}</span>
      <div class="flex items-center gap-1">
        ${n.map(([i,c])=>`<button type="button" class="btn btn-ghost ws-btn-mini ws-modo${t.modo===i?" ws-modo-ativa":""}" data-modo="${i}" onclick="window.__workspaceModo(this)">${c}</button>`).join("")}
        <button type="button" class="btn ws-btn-mini" id="ws-btn-salvar" onclick="window.__workspaceSalvar()" title="Salvar (Ctrl+S)"${o?"":" disabled"}>${l("check")} Salvar</button>
      </div>
    </div>
    <div id="ws-arq-corpo-int">${$c(t)}</div>
  `;const s=document.getElementById("ws-editor");s&&(s.value=t.editado)}function $c(e){const t=Ja(e.nome);return e.modo==="split"&&t?`
      <div class="ws-split">
        <textarea id="ws-editor" class="ws-editor" spellcheck="false" oninput="window.__workspaceEditar(this.value)" onkeydown="window.__workspaceEditorTecla(event)"></textarea>
        <div class="ws-preview scrollbar-none">${Mt(e.editado)}</div>
      </div>`:e.modo==="preview"?`<div class="ws-preview scrollbar-none">${t?Mt(e.editado):`<pre class="ws-preview-pre">${r(e.editado)}</pre>`}</div>`:'<textarea id="ws-editor" class="ws-editor" spellcheck="false" oninput="window.__workspaceEditar(this.value)" onkeydown="window.__workspaceEditorTecla(event)"></textarea>'}function kc(e){const t=E.find(o=>o.caminho===N),a=e.dataset.modo;!t||!a||(t.modo=a,Pe(),dt())}function ds(e){const t=E.find(a=>a.caminho===N);t&&(t.editado=e,Za(t),ve(),_c())}function Ec(e){if(e.key!=="Tab")return;e.preventDefault();const t=e.target,a=t.selectionStart,o=t.selectionEnd;t.value=t.value.slice(0,a)+"  "+t.value.slice(o),t.selectionStart=t.selectionEnd=a+2,ds(t.value)}let yt;function _c(){yt&&clearTimeout(yt),yt=setTimeout(()=>{yt=void 0,$a()},500)}async function _o(){const e=E.find(a=>a.caminho===N);if(!e||e.editado===e.original)return;if(new TextEncoder().encode(e.editado).length>ts){d("Conteúdo excede 1MB — reduza antes de salvar","erro");return}const t=document.getElementById("ws-btn-salvar");t&&(t.disabled=!0);try{await ns(e,!1),d(`Salvo: ${e.nome}`,"ok"),ve(),Za(e)}catch{t&&(t.disabled=!1),d("Não foi possível salvar — o conteúdo continua no rascunho local","erro")}}async function Tc(){const e=pc();if(!e?.tabs.length)return;const t=e.tabs.map(s=>typeof s=="string"?{p:s,m:void 0}:{p:s.p,m:s.m}).filter(s=>typeof s.p=="string"&&s.p).slice(0,nc),a=ea(),o=N!==null,n=await Promise.allSettled(t.map(async({p:s,m:i})=>{const c=await m(`/files?path=${encodeURIComponent(s)}`);if(c.tipo!=="arquivo"||typeof c.conteudo!="string")return null;const u=s.split("/").pop()??s,p={caminho:s,nome:u,original:c.conteudo,editado:c.conteudo,modo:lc(i)?i:as(u)},v=a[s];return v&&typeof v.c=="string"&&v.c!==p.original?p.editado=v.c:ta(s),p}));for(const s of n)s.status==="fulfilled"&&s.value&&!E.some(i=>i.caminho===s.value.caminho)&&E.push(s.value);E.length&&(o||(N=e.ativa&&E.some(s=>s.caminho===e.ativa)?e.ativa:E[E.length-1].caminho),ve(),o||Pe())}function Sc(){if(!P.length){try{const e=JSON.parse(localStorage.getItem(es)??"[]");if(Array.isArray(e))for(const t of e)typeof t=="string"&&t&&P.push({nome:t,log:"",historico:[],histIdx:-1})}catch{}oe=P[P.length-1]?.nome??null}}function Ac(){try{localStorage.setItem(es,JSON.stringify(P.map(e=>e.nome)))}catch{}}function Ic(){if(P.length>=qt){d(`Máximo de ${qt} terminais`,"aviso");return}const e=dc();P.push({nome:e,log:"",historico:[],histIdx:-1}),oe=e,Ac(),us()}function Lc(){const e=P.find(t=>t.nome===oe);e&&(e.log="",Ft())}function us(){const e=document.getElementById("ws-tabs-term"),t=document.getElementById("ws-term-corpo");if(!e||!t)return;const a=P.map(n=>({id:n.nome,rotulo:n.nome}));Pa(e,a,n=>{oe=n,To()},oe??void 0);const o=document.getElementById("ws-btn-term-novo");if(o&&(o.disabled=P.length>=qt),!P.length){t.innerHTML=_("run","Nenhum terminal",'Abra com "+ terminal". Comandos passam pela whitelist do opencorp (sem flags nem paths).');return}To()}function To(){const e=document.getElementById("ws-term-corpo");if(!e)return;if(!P.find(a=>a.nome===oe)){e.innerHTML="";return}e.innerHTML=`
    <pre class="terminal-log scrollbar-none" id="ws-term-log"></pre>
    <div class="ws-term-input">
      <span class="ws-term-prompt">ws$</span>
      <input id="ws-term-cmd" class="ws-term-campo" placeholder="comando opencorp (whitelist) — ex.: tasks list" autocomplete="off" onkeydown="window.__workspaceTermTecla(event)"/>
      <button class="btn ws-btn-mini" id="ws-term-rodar" onclick="window.__workspaceTermRodar()">${l("run")} Rodar</button>
    </div>
  `,Ft()}function Ft(){const e=document.getElementById("ws-term-log"),t=P.find(a=>a.nome===oe);!e||!t||(e.textContent=t.log,e.scrollTop=e.scrollHeight)}function Cc(e){const t=P.find(o=>o.nome===oe),a=document.getElementById("ws-term-cmd");if(!(!t||!a))if(e.key==="ArrowUp"){if(e.preventDefault(),t.historico.length===0)return;t.histIdx=Math.max(0,t.histIdx<0?t.historico.length-1:t.histIdx-1),a.value=t.historico[t.histIdx]??""}else if(e.key==="ArrowDown"){if(e.preventDefault(),t.histIdx<0)return;t.histIdx=Math.min(t.historico.length,t.histIdx+1),a.value=t.histIdx===t.historico.length?"":t.historico[t.histIdx]??""}else e.key==="Enter"&&(e.preventDefault(),ps())}async function ps(){const e=P.find(o=>o.nome===oe),t=document.getElementById("ws-term-cmd");if(!e||!t)return;const a=t.value.trim();if(a){e.historico.push(a),e.histIdx=e.historico.length,t.value="",e.log+=`ws$ ${a}
`,Ft();try{const o=await m("/terminal",{method:"POST",body:JSON.stringify({comando:a})});e.log+=(o.saida?o.saida+`
`:"")+`[${o.codigo===0?"ok":"código "+o.codigo}]
`}catch(o){e.log+=`erro: ${o.message}
`}Ft()}}const Mc=Object.freeze(Object.defineProperty({__proto__:null,abrirArquivo:Ya,enviarComoContexto:hc,renderWorkspace:is},Symbol.toStringTag,{value:"Module"}));let D=1,g=ms();function ms(){return{empresa:"",id:"",idTocado:!1,nicho:"",publico:"",tom:[],tomEvitar:[],tipo:"portal",template:"default",topicos:[]}}const zc=["direto","jornalístico","técnico","acessível"],Pc=["clickbait","promessas exageradas","jargão sem explicação","linguagem robótica"],St=[{id:"portal",label:"Portal / Blog",desc:"conteúdo recorrente, SEO, fila editorial",topicos:["tendências do setor","guias práticos para o público","análises e casos de uso"]},{id:"servicos",label:"Prestador de serviços",desc:"página de venda, provas sociais, captação",topicos:["serviços e escopos","perguntas frequentes","cases e depoimentos"]},{id:"ecommerce",label:"E-commerce",desc:"catálogo, produto, conversão",topicos:["lançamentos e coleções","dicas de uso dos produtos","promoções e kits"]},{id:"generica",label:"Empresa genérica",desc:"presença digital completa, sem foco único",topicos:["sobre a empresa","novidades e avisos","conteúdo do setor"]}],Ut=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;function Hc(e){return e.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")}function Qa(){D=1,g=ms(),Nc()}function eo(){document.getElementById("wizard-overlay")?.remove()}function Nc(){eo();const e=document.createElement("div");e.id="wizard-overlay",e.className="wizard-overlay",e.innerHTML=`
    <div class="wizard-box" role="dialog" aria-modal="true" aria-label="Nova empresa">
      <div class="wizard-topo">
        <h2 class="wizard-titulo">${l("spark")} Nova empresa ${b("wizard-workspace")}</h2>
        <button class="btn-ghost text-xs" onclick="window.__wizFechar()" aria-label="Fechar wizard">✕</button>
      </div>
      <div class="wizard-progresso"><div class="wizard-progresso-barra" style="width:${D/4*100}%"></div></div>
      <div class="wizard-passos">Identidade · Tipo · Template · Revisão</div>
      <div class="wizard-corpo" id="wizard-corpo"></div>
      <div class="wizard-acoes" id="wizard-acoes"></div>
    </div>
  `,document.body.appendChild(e),Je()}function Je(){const e=document.getElementById("wizard-corpo"),t=document.getElementById("wizard-acoes"),a=document.querySelector(".wizard-progresso-barra");if(a&&(a.style.width=`${D/4*100}%`),!e||!t)return;const o=(s,i,c)=>`
    <div class="wiz-chips">
      ${s.map(u=>`<button class="chip ${i.includes(u)?"chip-ativo":""}" onclick="${c}('${r(u)}')">${r(u)}</button>`).join("")}
    </div>`,n=St.find(s=>s.id===g.tipo)?.topicos??[];if(D===1)e.innerHTML=`
      <label class="modal-label" for="wiz-nome">Nome da empresa</label>
      <input id="wiz-nome" value="${r(g.empresa)}" placeholder="ex.: Empório Aurora" oninput="window.__wizNome(this.value)"/>
      <label class="modal-label" for="wiz-id">ID (kebab-case, editável)</label>
      <input id="wiz-id" value="${r(g.id)}" placeholder="ex.: emporio-aurora" oninput="window.__wizId(this.value)"/>
      <div class="wiz-erro ${Ut.test(g.id)||!g.id?"hidden":""}" id="wiz-erro-id">use letras minúsculas, números e hífens</div>
      <label class="modal-label" for="wiz-nicho">Nicho (o que a empresa faz)</label>
      <textarea id="wiz-nicho" rows="2" placeholder="ex.: empório gourmet artesanal — cafés, queijos, presentes" oninput="window.__wizCampo('nicho', this.value)">${r(g.nicho)}</textarea>
      <label class="modal-label" for="wiz-publico">Público-alvo</label>
      <input id="wiz-publico" value="${r(g.publico)}" placeholder="ex.: consumidores que valorizam artesanato" oninput="window.__wizCampo('publico', this.value)"/>
      <label class="modal-label">Tom de voz ${o(zc,g.tom,"__wizToggleTom")}</label>
      <label class="modal-label">Tom a evitar ${o(Pc,g.tomEvitar,"__wizToggleEvitar")}</label>
    `,t.innerHTML=`
      <button class="btn btn-ghost" onclick="window.__wizFechar()">Cancelar</button>
      <button class="btn" onclick="window.__wizAvancar()">Continuar →</button>
    `;else if(D===2)e.innerHTML=`
      <div class="wiz-tipos">
        ${St.map(s=>`
          <button class="wiz-tipo ${g.tipo===s.id?"ativo":""}" onclick="window.__wizTipo('${s.id}')">
            <b>${r(s.label)}</b>
            <small>${r(s.desc)}</small>
          </button>`).join("")}
      </div>
    `,t.innerHTML=`
      <button class="btn btn-ghost" onclick="window.__wizVoltar()">← Voltar</button>
      <button class="btn" onclick="window.__wizAvancar()">Continuar →</button>
    `;else if(D===3)e.innerHTML=`
      <label class="modal-label" for="wiz-template">Template</label>
      <select id="wiz-template" onchange="window.__wizCampo('template', this.value)">
        <option value="default" selected>default — executor-padrao, critico-site, corretor-site, editor, ceo-documentos, auditor, secretário…</option>
      </select>
      <p class="wiz-dica">O template traz a papelaria completa: agentes, specs de ferramentas e configuração base.</p>
      <label class="modal-label" for="wiz-topicos">Tópicos editoriais (1 por linha — sugeridos pelo tipo)</label>
      <textarea id="wiz-topicos" rows="4" oninput="window.__wizTopicos(this.value)">${r(g.topicos.length?g.topicos.join(`
`):n.join(`
`))}</textarea>
    `,t.innerHTML=`
      <button class="btn btn-ghost" onclick="window.__wizVoltar()">← Voltar</button>
      <button class="btn" onclick="window.__wizAvancar()">Revisar →</button>
    `,g.topicos.length||(g.topicos=[...n]);else{const s=St.find(i=>i.id===g.tipo);e.innerHTML=`
      <div class="wiz-revisao">
        <div><small>Empresa</small><b>${r(g.empresa||"—")}</b></div>
        <div><small>ID</small><b class="font-mono">${r(g.id||"—")}</b></div>
        <div><small>Nicho</small><b>${r(g.nicho||"—")}</b></div>
        <div><small>Público</small><b>${r(g.publico||"—")}</b></div>
        <div><small>Tom</small><b>${r(g.tom.join(", ")||"—")}</b></div>
        <div><small>Evitar</small><b>${r(g.tomEvitar.join(", ")||"—")}</b></div>
        <div><small>Tipo</small><b>${r(s?.label??g.tipo)}</b></div>
        <div><small>Template</small><b class="font-mono">${r(g.template)}</b></div>
        <div><small>Tópicos</small><b>${r(g.topicos.join(" · ")||"—")}</b></div>
      </div>
      <p class="wiz-dica">Grava <code>.opencorp/projeto.json</code> no workspace — é o que guia editor e crítico.</p>
    `,t.innerHTML=`
      <button class="btn btn-ghost" onclick="window.__wizVoltar()">← Voltar</button>
      <button class="btn" id="wiz-criar" onclick="window.__wizCriar()">${l("spark")} Criar empresa</button>
    `}}function So(e,t){const a=e.indexOf(t);a>=0?e.splice(a,1):e.push(t)}async function Bc(){if(D===1){if(!g.empresa.trim()){d("Dê um nome à empresa","aviso");return}if(!Ut.test(g.id)){d("ID inválido — use kebab-case (ex.: minha-empresa)","erro");return}}D===3&&(g.topicos=g.topicos.map(e=>e.trim()).filter(Boolean)),D=Math.min(4,D+1),Je()}function Rc(){D=Math.max(1,D-1),Je()}async function Oc(){const e=document.getElementById("wiz-criar");if(e){e.disabled=!0,e.innerHTML=`${l("run")} Criando…`;try{const{api:t}=await f(async()=>{const{api:s}=await import("./svelte-app.js").then(i=>i.aq);return{api:s}},__vite__mapDeps([0,1])),{setWsAtivo:a}=await f(async()=>{const{setWsAtivo:s}=await import("./svelte-app.js").then(i=>i.ao);return{setWsAtivo:s}},__vite__mapDeps([0,1])),{navegar:o}=await f(async()=>{const{navegar:s}=await Promise.resolve().then(()=>G);return{navegar:s}},void 0),{renderView:n}=await f(async()=>{const{renderView:s}=await Promise.resolve().then(()=>Gc);return{renderView:s}},void 0);await t("/workspaces",{method:"POST",body:JSON.stringify({id:g.id,perfil:{empresa:g.empresa,nicho:g.nicho,publico:g.publico,tom:g.tom.join(", "),tom_evitar:g.tomEvitar,topicos:g.topicos}})}),eo(),a(g.id),o("tasks"),n(),d(`Empresa "${g.empresa}" criada — template ${g.template} instalado. Próximo: rode um agente ou agende a primeira rotina.`,"ok")}catch(t){d("Erro ao criar: "+t.message,"erro"),e.disabled=!1,e.innerHTML=`${l("spark")} Criar empresa`}}}function Dc(){const e=window;e.abrirWizard=Qa,e.__wizFechar=eo,e.__wizNome=t=>{g.empresa=t;const a=document.getElementById("wiz-id");a&&!g.idTocado&&(g.id=Hc(t),a.value=g.id);const o=document.getElementById("wiz-erro-id");o&&o.classList.toggle("hidden",!g.id||Ut.test(g.id))},e.__wizId=t=>{g.id=t,g.idTocado=!0;const a=document.getElementById("wiz-erro-id");a&&a.classList.toggle("hidden",!t||Ut.test(t))},e.__wizCampo=(t,a)=>{g[t]=a},e.__wizToggleTom=t=>{So(g.tom,t),Je()},e.__wizToggleEvitar=t=>{So(g.tomEvitar,t),Je()},e.__wizTipo=t=>{g.tipo=t,g.topicos=[...St.find(a=>a.id===t)?.topicos??[]],Je()},e.__wizTopicos=t=>{g.topicos=t.split(`
`)},e.__wizAvancar=()=>{Bc()},e.__wizVoltar=Rc,e.__wizCriar=()=>{Oc()}}let _e=null,st=null,je="";function At(){st&&(document.removeEventListener("keydown",st,{capture:!0}),st=null),je="",_e?.remove(),_e=null}async function qc(){if(_e)return;const e=document.createElement("div");e.className="hist-popup",e.setAttribute("role","dialog"),e.setAttribute("aria-label","Histórico de conversas"),e.innerHTML=`
    <div class="hist-popup-box scrollbar-thin">
      <div class="hist-popup-header">
        <h2 class="hist-popup-titulo">${l("history")} Histórico de conversas</h2>
        <button class="hist-popup-fechar" aria-label="Fechar histórico" title="Fechar (Esc)">${l("close")}</button>
      </div>
      <div class="hist-popup-busca">
        <span class="hist-busca-ico" aria-hidden="true">${l("search")}</span>
        <input id="hist-busca" type="search" placeholder="Buscar conversa…" aria-label="Buscar conversa"/>
      </div>
      <div class="hist-popup-lista scrollbar-thin" id="hist-lista">${T()}</div>
    </div>
  `,document.body.appendChild(e),_e=e,e.querySelector(".hist-popup-fechar")?.addEventListener("click",()=>At()),e.addEventListener("mousedown",a=>{a.target===e&&At()}),st=a=>{a.key==="Escape"&&(a.stopPropagation(),a.preventDefault(),At())},document.addEventListener("keydown",st,{capture:!0});const t=e.querySelector("#hist-busca");t?.addEventListener("input",()=>{je=t.value.toLowerCase();const a=document.getElementById("hist-lista");a&&Vt.length&&vs(a)}),await It()}let Vt=[];async function It(){const e=document.getElementById("hist-lista");if(!(!e||!_e)){try{Vt=await w("/secretario/sessoes")??[]}catch(t){if(!_e)return;const a=t.message??"";if(a.includes("não iniciado")||a.includes("409")){e.innerHTML=_("history","Secretário em standby","O secretário não foi iniciado. Inicie para ver o histórico.",'<button class="btn" onclick="window.__histIniciarSecretario()">Iniciar secretário</button>'),window.__histIniciarSecretario=async()=>{const o=document.querySelector(".hist-popup-box .btn");o&&(o.disabled=!0,o.textContent="Iniciando…");try{await w("/secretario/start",{method:"POST"}),e.innerHTML=T(),await new Promise(n=>setTimeout(n,1500)),await It()}catch(n){e.innerHTML=S("Falha ao iniciar o secretário: "+n.message,()=>{It()})}};return}e.innerHTML=S("Não foi possível carregar o histórico de conversas.",()=>{e&&(e.innerHTML=T()),It()});return}if(_e){if(!Vt.length){e.innerHTML=_("history","Nenhuma conversa ainda","Pergunte qualquer coisa ao Secretário — o histórico fica aqui.");return}vs(e)}}}function vs(e){const t=Vt.filter(a=>!a.sem_conteudo&&(!je||zt(a).toLowerCase().includes(je)));if(!t.length){e.innerHTML=_("search","Nenhuma conversa encontrada",je?`Nada para “${r(je)}”.`:"");return}e.innerHTML=Ra(t).map(({grupo:a,itens:o})=>`
    <div class="sessao-grupo">${a}</div>
    ${o.map(n=>`
      <button class="sessao-item" data-sessao-id="${r(n.id)}">
        <div class="sessao-titulo">${r(zt(n))}</div>
        <div class="sessao-data">${(()=>{const s=We(n);return s?an(s):""})()}</div>
      </button>
    `).join("")}
  `).join(""),e.querySelectorAll(".sessao-item").forEach(a=>{a.addEventListener("click",()=>{jc(a.dataset.sessaoId??"")})})}async function jc(e){if(!e)return;At();const a=window.__secretarioSelecionarSessao;typeof a=="function"&&await a(e);const{getViewAtual:o}=await f(async()=>{const{getViewAtual:n}=await import("./svelte-app.js").then(s=>s.ao);return{getViewAtual:n}},__vite__mapDeps([0,1]));if(o()!=="secretario"){const{navegar:n}=await f(async()=>{const{navegar:s}=await Promise.resolve().then(()=>G);return{navegar:s}},void 0);n("secretario")}}let pe=null,Te=null,Se=null,Ae=null;function Fc(){document.addEventListener("contextmenu",e=>{const t=e.target,a=t?.closest?.(".tree-arquivo"),o=t?.closest?.(".task-card");if(!a&&!o){F();return}e.preventDefault(),a?Uc(e.clientX,e.clientY,a.dataset.path??""):Vc(e.clientX,e.clientY,o)})}function F(){Te&&document.removeEventListener("mousedown",Te),Se&&document.removeEventListener("keydown",Se),Ae&&window.removeEventListener("scroll",Ae,!0),Te=null,Se=null,Ae=null,pe?.remove(),pe=null}function Uc(e,t,a){if(!a)return;F();const o=[{rotulo:"Abrir",acao:()=>{f(()=>import("./svelte-D3zsPHFt.js"),__vite__mapDeps([4,0,1])).then(i=>{if(i.abrirArquivo)return i.abrirArquivo(a);throw new Error("sem store")}).catch(()=>{f(()=>Promise.resolve().then(()=>Mc),void 0).then(i=>i.abrirArquivo(a))})}},{rotulo:"Enviar como contexto @",acao:()=>{Ne("@"+a),gt();const i=document.getElementById("lat-input");i&&(i.value=Wt())}},{rotulo:"Copiar caminho",acao:()=>{navigator.clipboard.writeText(a).then(()=>d("Caminho copiado","ok"))}}],n=document.createElement("div");n.className="ctx-menu",n.setAttribute("role","menu");for(const i of o){const c=document.createElement("button");c.type="button",c.className="palette-item"+(i.perigoso?" perigoso":""),c.setAttribute("role","menuitem"),c.textContent=i.rotulo,c.addEventListener("click",()=>{F(),i.acao()}),n.appendChild(c)}document.body.appendChild(n);const s=za(e,t,210,o.length*34+8,window.innerWidth,window.innerHeight);n.style.left=s.left+"px",n.style.top=s.top+"px",pe=n,Te=i=>{pe&&i.target instanceof Node&&pe.contains(i.target)||F()},Se=i=>{i.key==="Escape"&&F()},Ae=()=>F(),document.addEventListener("mousedown",Te),document.addEventListener("keydown",Se),window.addEventListener("scroll",Ae,!0)}function Vc(e,t,a){F();const o=a.dataset.taskId??"",n=a.querySelector(".task-title")?.textContent?.trim()??o,s=[{rotulo:"Ver detalhes",acao:()=>a.dispatchEvent(new MouseEvent("click",{bubbles:!0}))},{rotulo:"Copiar título",acao:()=>{navigator.clipboard.writeText(n).then(()=>d("Título copiado","ok"))}},{rotulo:"Excluir",perigoso:!0,acao:()=>{window.excluirTask?.(o)}}],i=document.createElement("div");i.className="ctx-menu",i.setAttribute("role","menu");for(const u of s){const p=document.createElement("button");p.type="button",p.className="palette-item"+(u.perigoso?" perigoso":""),p.setAttribute("role","menuitem"),p.textContent=u.rotulo,p.addEventListener("click",()=>{F(),u.acao()}),i.appendChild(p)}document.body.appendChild(i);const c=za(e,t,210,s.length*34+8,window.innerWidth,window.innerHeight);i.style.left=c.left+"px",i.style.top=c.top+"px",pe=i,Te=u=>{pe&&u.target instanceof Node&&pe.contains(u.target)||F()},Se=u=>{u.key==="Escape"&&F()},Ae=()=>F(),document.addEventListener("mousedown",Te),document.addEventListener("keydown",Se),window.addEventListener("scroll",Ae,!0)}let Ao=!1;function ut(){Ao||(Ao=!0,document.getElementById("login-logo")?.insertAdjacentHTML("beforeend",l("home","text-3xl")),document.getElementById("sidebar-logo")?.insertAdjacentHTML("beforeend",l("home","mr-2")+'<span class="sidebar-logo-text">opencorp</span>'),document.getElementById("sidebar-collapse-btn")?.insertAdjacentHTML("beforeend",ao.chevron),document.getElementById("nav-icon-home")?.insertAdjacentHTML("beforeend",l("home")),document.getElementById("nav-icon-tasks")?.insertAdjacentHTML("beforeend",l("tasks")),document.getElementById("nav-icon-agentes")?.insertAdjacentHTML("beforeend",l("teams")),document.getElementById("nav-icon-agenda")?.insertAdjacentHTML("beforeend",l("agenda")),document.getElementById("nav-icon-fluxos")?.insertAdjacentHTML("beforeend",l("fluxos")),document.getElementById("nav-icon-workspace")?.insertAdjacentHTML("beforeend",l("folder")),document.getElementById("nav-icon-hooks")?.insertAdjacentHTML("beforeend",l("hook")),document.getElementById("nav-icon-apps")?.insertAdjacentHTML("beforeend",l("apps")),document.getElementById("nav-icon-historico")?.insertAdjacentHTML("beforeend",l("history")),document.getElementById("nav-icon-notificacoes")?.insertAdjacentHTML("beforeend",l("sino")),document.getElementById("nav-icon-secretario")?.insertAdjacentHTML("beforeend",l("chat")),document.getElementById("nav-icon-config")?.insertAdjacentHTML("beforeend",l("gear")),document.getElementById("drawer-close-icon")?.insertAdjacentHTML("beforeend",l("close")),document.getElementById("chat-drawer-close-icon")?.insertAdjacentHTML("beforeend",l("close")),document.getElementById("lat-hist-icon")?.insertAdjacentHTML("beforeend",l("history")),document.getElementById("fab-chat")?.insertAdjacentHTML("beforeend",ao.chat))}let Io=!1;function Ie(e=""){const t=document.getElementById("login-screen"),a=document.getElementById("app");t&&(t.classList.add("hidden"),t.style.display="flex",t.classList.remove("hidden")),a&&(a.classList.add("hidden"),a.style.display="none");const o=document.getElementById("login-error");o&&(e?(o.textContent=e,o.classList.remove("hidden")):(o.classList.add("hidden"),o.textContent="")),document.getElementById("login-token")?.focus()}function pt(){const e=document.getElementById("login-screen"),t=document.getElementById("app");e&&(e.classList.add("hidden"),e.style.display="none"),t&&(t.classList.remove("hidden"),t.style.display="block")}function gs(e="Sessão encerrada — faça login novamente"){Jc();const t=Bo();t&&(clearInterval(t),Ro(null)),zs(),mt=!1,Ie(e)}let mt=!1;function Jc(){const e=Ho();if(e){try{e.close()}catch{}No(null)}$t(!1);const t=document.getElementById("conn-dot"),a=document.getElementById("conn-text");t&&(t.className="connection-dot disconnected"),a&&(a.textContent="desconectado")}async function fs(){const t=document.getElementById("login-token").value.trim();if(t)try{if((await fetch("/workspaces",{headers:{Authorization:`Bearer ${t}`}})).status===401)throw new Error("401");zo(t);const o=localStorage.getItem("oc-ws");o&&!k()&&Po(o),mt=!0,pt(),ut();const{sincronizarComHash:n}=await f(async()=>{const{sincronizarComHash:s}=await Promise.resolve().then(()=>G);return{sincronizarComHash:s}},void 0);n(),await vt()}catch{Ie("Token inválido — veja ~/.opencorp/secrets.json")}}function to(){const e=Cs(),t=Ho();t&&t.close();const a=e?new EventSource("/events?token="+encodeURIComponent(e)):new EventSource("/events");No(a),a.onopen=()=>{if(!mt){try{a.close()}catch{}$t(!1);return}$t(!0);const o=document.getElementById("conn-dot"),n=document.getElementById("conn-text");o&&(o.className="connection-dot connected"),n&&(n.textContent="conectado")},a.onerror=()=>{$t(!1);const o=document.getElementById("conn-dot"),n=document.getElementById("conn-text");o&&(o.className="connection-dot disconnected"),n&&(n.textContent="desconectado")},a.onmessage=o=>{try{const n=JSON.parse(o.data);Wc(n)}catch{}}}function Wc(e){const t=String(e.tipo||""),a=Jt();if(t==="secretario.mensagem"&&f(()=>Promise.resolve().then(()=>ja),void 0).then(o=>o.eventoRemotoSecretario(e)),a==="home"){Yi(e),t.startsWith("sessao")&&co(),t==="notificacao.nova"&&(no(),co());return}if(a==="tasks"&&t.startsWith("task.")&&U(),a==="agentes"&&ne(),a==="agenda"&&En(),a==="fluxos"&&Sn(),a==="hooks"&&Ye(),a==="reunioes"||a==="secretario"){if(en())return;const o=document.activeElement;o&&(o.tagName==="INPUT"||o.tagName==="TEXTAREA"||o.tagName==="SELECT")||bi()}if(a==="apps"&&Rn(),t==="notificacao.nova"&&no(),a==="notificacoes"&&t.startsWith("notificacao.")){const o=document.activeElement;o&&(o.tagName==="INPUT"||o.tagName==="TEXTAREA"||o.tagName==="SELECT")||fe()}}async function vt(){const e=Bo();e&&clearInterval(e),fetch("/health").then(a=>a.json()).then(a=>{const o=document.getElementById("version");o&&a.versao&&(o.textContent="v"+a.versao)}).catch(()=>{}),await Ms(),to(),Na(),He();const t=setInterval(()=>{const a=Jt();if(a==="secretario"||a==="reunioes"&&en()||a==="workspace"||document.getElementById("drawer")?.classList.contains("open"))return;const n=document.activeElement;n&&(n.tagName==="INPUT"||n.tagName==="TEXTAREA"||n.tagName==="SELECT"||n.closest(".main, .drawer"))||He()},8e3);Ro(t)}const Xc={home:"Início",tasks:"Tasks",agentes:"Agentes",secretario:"Secretário",reunioes:"Secretário",agenda:"Agenda",fluxos:"Fluxos",hooks:"Hooks",apps:"Apps","app-detail":"Apps",config:"Config",workspace:"Workspace",historico:"Histórico",notificacoes:"Notificações"};function bs(e){const t=Xc[e]??e,a=document.getElementById("topbar-view");a&&(a.textContent=t);const o=document.getElementById("topbar-ws");o&&(o.textContent=k()||"—")}async function He(){const e=Jt();bs(e),e!=="reunioes"&&me();const t=document.getElementById("ws-chip");t&&(t.textContent=k()||"— empresa —"),document.body.classList.toggle("view-secretario",e==="secretario"),document.querySelectorAll(".view").forEach(s=>s.classList.remove("active")),document.querySelectorAll(".nav-item").forEach(s=>s.classList.toggle("active",s.dataset.view===e));const o=e==="app-detail"?"apps":e==="reunioes"?"secretario":e,n=document.getElementById("view-"+o);switch(n&&n.classList.add("active"),e){case"home":await Fa();break;case"tasks":await U();break;case"agentes":await ne();break;case"agenda":await En();break;case"teams":Aa("fluxos");break;case"reunioes":await Bt("reunioes");break;case"fluxos":await Sn();break;case"hooks":await Ye();break;case"apps":await Rn();break;case"app-detail":await Jr();break;case"historico":await Jn();break;case"secretario":await Bt();break;case"workspace":await is();break;case"notificacoes":await fe();break;case"config":await Yr();break}}function hs(){Qa()}function ws(){if(Io)return;Io=!0,jo(),Es(),Is(),Dc(),Fc(),$s();const{token:e,ws:t}=Ls();if(e&&zo(e),t&&Po(t),!e){(async()=>{try{const a=await fetch("/workspaces");if(a.status===401){Ie();return}if(!a.ok){Ie();return}mt=!0,pt(),ut(),vt()}catch{Ie()}})();return}mt=!0,pt(),ut(),vt()}function xs(e){const t=document.getElementById("sidebar"),a=document.getElementById("sidebar-backdrop");if(!t)return;const o=e??!t.classList.contains("open");t.classList.toggle("open",o),a?.classList.toggle("open",o)}const ys="oc-sidebar-colapsada";function $s(){localStorage.getItem(ys)==="1"&&document.body.classList.add("sidebar-colapsada")}function ks(){const e=document.body.classList.toggle("sidebar-colapsada");localStorage.setItem(ys,e?"1":"0")}function Es(){const e=window;e.navegar=Aa,e.parseHash=it,e.toggleSidebar=xs,e.toggleSidebarCollapse=ks,e.abrirChatLateral=gt,e.fecharChatLateral=ft,e.alternarChatLateral=qo,e.abrirHistoricoPopup=qc,e.abrirDrawer=Uo,e.fecharDrawer=ge,e.criarTask=pn,e.enviarMsgDrawer=fn,e.renderAgentes=ne,e.chamarAgente=Lr,e.editarAgente=Cr,e.salvarAgente=Mr,e.abrirFormAgente=zr,e.fecharFormAgente=Bn,e.criarAgente=Pr,e.excluirAgente=Hr,e.toggleAgenteAtivo=Ar,e.semearCatalogoAgentes=Ir,e.moverTaskColuna=bn,e.atualizarTaskPrioridade=hn,e.atualizarTaskResponsavel=wn,e.atualizarTaskDue=xn,e.atualizarTaskLabels=yn,e.atualizarTaskDescricao=$n,e.agendaEscopo=sr,e.atualizarCampoAgenda=Tn,e.criarAgenda=rr,e.editarAgenda=ur,e.salvarEdicaoAgenda=pr,e.executarAgendaAgora=cr,e.toggleAgendaAtivo=lr,e.excluirAgenda=dr,e.criarReuniao=wi,e.encerrarReuniao=xi,e.abrirSalaViva=Ba,e.fecharSalaViva=tn,e.criarAgendaReuniao=Ei,e.excluirRotinaReuniao=Ti,e.atualizarFrequenciaReuniao=ki,e.secretarioAba=ln,e.executarFlow=wr,e.detalhesFlow=xr,e.retomarFlow=yr,e.abrirFormFlow=br,e.fecharFormFlow=Ua,e.addPassoFlow=Rt,e.addPassoTemplate=hr,e.migrarTeams=mr,e.criarFlow=zn,e.editarFlow=gr,e.salvarEdicaoFlow=Ln,e.excluirFlow=fr,e.excluirTask=kn,e.renderHooks=Ye,e.abrirFormHook=kr,e.fecharFormHook=Pn,e.hookCamposAlvo=Hn,e.criarHook=Er,e.excluirHook=_r,e.copiarCurlHook=Nn,e.rodarFlowHub=Gi,e.homeNotifLida=pi,e.homeNotifTodasLidas=mi,e.renderAgendaForm=Zt,e.loadAppsList=On,e.abrirApp=Dn,e.fecharApp=Br,e.renderWidget=qn,e.enviarForm=Or,e.decidirAprovacao=Zi,e.promptOrdem=Qi,e.fazerLogin=fs,e.novoWorkspace=hs,e.abrirWizard=Qa,e.mostrarLogin=Ie,e.esconderLogin=pt,e.sairParaLogin=gs,e.configurarIconesIniciais=ut,e.conectarSSE=to,e.iniciarApp=vt,e.renderView=He,e.renderNotificacoes=fe,e.marcarNotificacaoLida=ti,e.marcarTodasNotificacoesLidas=ai,e.limparNotificacoes=oi,e.alternarFiltroNotificacoes=ni}ws();const Gc=Object.freeze(Object.defineProperty({__proto__:null,aplicarColapsoPersistido:$s,atualizarBreadcrumb:bs,boot:ws,conectarSSE:to,configurarIconesIniciais:ut,esconderLogin:pt,exporGlobais:Es,fazerLogin:fs,iniciarApp:vt,mostrarLogin:Ie,novoWorkspace:hs,renderView:He,sairParaLogin:gs,toggleSidebar:xs,toggleSidebarCollapse:ks},Symbol.toStringTag,{value:"Module"}));export{Js as A,zt as B,ol as C,nn as D,gt as E,tl as F,al as G,We as H,an as I,Mt as J,Yc as K,G as L,Zc as M,Mc as N,Gc as O,te as a,Ai as b,Xe as c,Ii as d,ht as e,Pt as f,Wt as g,lo as h,Li as i,uo as j,ma as k,Ht as l,x as m,el as n,Oi as o,Qc as p,nl as q,Ni as r,Me as s,cn as t,sl as u,rl as v,cl as w,Ne as x,il as y,Vs as z};
