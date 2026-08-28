# Spec de Teste Cego — ETAPA 08: Nuvem (Backup/Sync) — OPCIONAL

**Setup:** workspace `test-cloud` com alguns registros criados. Use alvos fictícios locais (pastas em `/tmp/opencode/cloud-alvo/`). NUNCA use remotos reais (S3/SSH) neste teste.

## Cenários

### 1. Wizard de configuração
- Comando: `node bin/opencorp.mjs cloud configure` (interativo; responda: modo `backup-local`, alvo `/tmp/opencode/cloud-alvo`, sem agenda)
- Esperado: exit 0; `cat ~/.opencorp/cloud/cloud.json` mostra o perfil criado com modo e alvo corretos.

### 2. Dry-run obrigatório no primeiro uso
- Comando: `node bin/opencorp.mjs cloud backup --perfil <id>`
- Esperado: na PRIMEIRA execução sem `--dry-run`, o CLI se recusa e pede dry-run (ou executa o dry-run automaticamente mostrando o plano: quais arquivos seriam copiados).

### 3. Backup real
- Comandos:
  1. `node bin/opencorp.mjs cloud backup --perfil <id> --dry-run` → plano plausível (agents/, registries/, docs/)
  2. `node bin/opencorp.mjs cloud backup --perfil <id>`
- Esperado: exit 0; `/tmp/opencode/cloud-alvo/` contém a cópia (verifique com `ls -R` que registries e agentes estão lá); `cloud status` mostra o último backup com data.

### 4. Backup incremental
- Comando: crie um registro novo no workspace e rode `cloud backup` de novo
- Esperado: a segunda rodada copia apenas o novo (ou o `cloud status`/saída indica quantidade menor de itens copiados). Evidência: saída do comando.

### 5. Segredos nunca sincronizados
- Setup: crie `secrets.json` dentro de `.opencorp/` do workspace
- Comando: `cloud backup` novamente
- Esperado: `secrets.json` NÃO aparece no alvo. Se aparecer, FAIL crítico.

### 6. Mirror-remoto (monitoramento) com pasta local como "remoto"
- Comandos:
  1. Crie `/tmp/opencode/remoto-falso/` com 2-3 arquivos
  2. Configure perfil `monitor` modo `mirror-remoto` apontando para essa pasta
  3. `node bin/opencorp.mjs cloud diff monitor`
- Esperado: o diff lista o que existe no "remoto" vs local. Ao adicionar um arquivo lá e rodar de novo, o diff muda e um evento é registrado (`registry list logs` contém o alerta).

### 7. Lock de concorrência
- Comando: inicie dois `cloud backup` quase simultâneos (background + foreground)
- Esperado: um deles reporta "já existe backup em andamento" (lock), nenhum corrompe o estado.

### 8. Status saudável
- Comando: `node bin/opencorp.mjs cloud status`
- Esperado: mostra cada perfil, último backup, e estado dos alvos sem erro.

## Relatório

Formato da doc 09. Limpe `/tmp/opencode/cloud-alvo` e `remoto-falso` ao final.
