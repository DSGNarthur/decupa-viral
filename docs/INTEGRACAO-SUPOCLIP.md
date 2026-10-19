# Editor integrado do Decupa

O Decupa incorpora o documento de edição e a análise de rostos do Supoclip, adaptados ao backend Python, SQLite, sistema de tarefas e conexão pareada existentes. A interface continua em React/MUI. Não foram acrescentados AWS, PostgreSQL, Redis ou pagamentos à instalação.

## Acesso

Instale o motor nativo seguindo [o guia de instalação](INSTALACAO.md). Ele não inicia com a sessão do sistema. Abra [o site](https://decupa-viral.vercel.app), clique em "Iniciar e conectar" e permita a abertura do aplicativo e o acesso local do navegador. A interface local fica em `http://localhost:16889`. O PC deve continuar ligado durante processamento. Acesso independente por celular não está incluído.

O checkout ativo desta integração está em `C:/Users/arthu/Documents/ChatGPT/Editor/Decupa-ViralMint`. O disco E: não estava disponível durante a retomada. A base foi restaurada a partir do pacote correspondente da publicação anterior, com SHA-256 conferido. O Decupa antigo não foi alterado.

## Funcionalidades

Abra um corte no Estúdio de cortes ou na Biblioteca e selecione `Abrir editor de corte`. O editor prepara uma fonte sem a legenda gravada. Cortes antigos recuperados do vídeo original apresentam uma mensagem quando não existe mapa da remoção de silêncios. Cortes novos guardam os intervalos e as palavras remapeadas para a preparação fiel da fonte limpa.

O editor permite dividir, remover e ordenar trechos; alterar entrada e saída; corrigir palavras; mudar agrupamento, fonte, tamanho, posição, fundo e cores das legendas; configurar volume; escolher formato e enquadramento; e ajustar brilho, contraste, saturação, desfoque e matiz.

O salvamento automático ocorre após a pausa na edição. O botão Salvar força a gravação. Revisões antigas recebem conflito, sem sobrescrever outra aba. O histórico de desfazer e refazer é da sessão atual. A fonte original permanece preservada.

Uma exportação cria outro vídeo na biblioteca, com referência à fonte limpa e ao documento utilizado. É possível reabrir essa versão no editor. Na lista de rascunhos, selecionar dois a oito itens permite juntá-los em outra montagem editável. As palavras acompanham os tempos da montagem; legendas não são gravadas duplamente.

O modo de acompanhar rostos usa YuNet e o planejamento de trajetória do Supoclip. Tomadas sem rostos têm alternativa de quadro inteiro. O usuário pode selecionar o enquadramento manual. Detecção de rosto não identifica automaticamente quem está falando. A análise de rostos é calculada na exportação, e a interface informa essa diferença na prévia.

Na extração automática, as opções avançadas incluem comparação global de candidatos. O modo preserva os limites de quantidade e duração e mantém o motor original como padrão. Usa o provedor de IA já configurado. Os títulos sugeridos nesse modo ficam como informações revisáveis; não entram automaticamente na imagem como gancho.

O tema claro ou escuro fica salvo neste navegador. Os ícones Material e as animações originais foram preservados com paleta neutra, novos estados e respeito à preferência de movimento reduzido. A logo foi convertida também para SVG, ícones e favicons a partir do desenho aprovado.

## Persistência e cancelamento

A tabela `editor_drafts` é criada na inicialização. As duas colunas novas de referência de fonte em `generated_videos` usam migração idempotente. Uma cópia de segurança do banco anterior foi feita antes da inicialização da versão integrada.

Fontes e cortes vinculados a rascunhos não podem ser excluídos pela operação normal. Rascunhos usados por uma exportação ou montagem ativa também ficam protegidos. A exclusão de um rascunho conserva arquivos que podem estar associados a vídeos exportados. Não há limpeza indiscriminada desses diretórios nesta versão.

Exportações usam arquivos temporários e confirmação do estado da tarefa antes da publicação no banco. Um cancelamento não deve gerar vídeo parcial na biblioteca. As tarefas seguem o limite de concorrência do Decupa.

## Validação

Os testes usam mídia descartável e SQLite isolado. O teste adicional com rostos usa mídia autorizada no laboratório local. Em outra instalação, configure `DECUPA_TEST_FACE_MEDIA` com um vídeo autorizado; a ausência dessa amostra ignora apenas esse caso específico. Os demais testes geram uma fonte sintética se não houver a amostra local.

Em PowerShell, configure `$env:PYTHONUTF8='1'` antes de executar pytest. As fontes são UTF-8. A execução ampla inicial sem essa configuração apresentou falhas de leitura; elas foram rechecadas com a codificação correta. As verificações de migração e geometria foram atualizadas para reconhecer as funcionalidades adicionadas, mantendo as demais proteções.

Comandos úteis:

```powershell
$env:PYTHONUTF8='1'
python -m pytest tests -q
npm --prefix frontend run test:editor
npm --prefix frontend run test:browser
python scripts/package_source.py
npm --prefix frontend run build:companion
```

Os relatórios de execução desta máquina ficam em `C:/Users/arthu/Documents/ChatGPT/Editor/.runtime-decupa/validation`, separados do pacote público. O relatório de entrega registra o resultado exato, inclusive as limitações do controle do navegador.

## Publicação e atribuição

Somente o workspace `arthurcarvalho2317-1652s-projects`, projeto `decupa-viral`, pode receber esta publicação. O script de deploy consulta usuário, workspace e projeto antes de agir. A conta do Matheus não é destino autorizado.

Preservar `THIRD_PARTY_NOTICES.md`, AGPL-3.0 e a licença do YuNet. O pacote público contém o código correspondente, sem configurações locais, bancos, credenciais ou vídeos pessoais.
