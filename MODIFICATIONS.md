# Alterações do Decupa sobre o ViralMint

Base original: https://github.com/openclaw-easy/ViralMint, versão 1.3.1, commit `604d5f1a37900991217e1c7b06379c5f58e8c4dd`.

Copyright do código original: ViralMint Contributors, conforme os avisos dos arquivos. Licença GNU AGPL versão 3, preservada em LICENSE.

Alterações iniciadas em 16/10/2026: identidade Decupa na interface e no inicializador; página inicial direcionada ao clipador; importação por URL e arquivo no clipador; página de autoria, licença e código correspondente; endpoint de saúde; ambiente local separado na porta 16889; preparação de imagem para servidor AWS. Aplicadas também as atualizações compatíveis do lockfile já verificadas na instalação local do ViralMint.

Esta versão é uma derivação do projeto original. As modificações do programa são oferecidas sob a mesma AGPL-3.0. O nome Decupa identifica esta distribuição modificada e não altera a autoria do código original. Não há declaração de afiliação aos autores do ViralMint.

Continuação local em 16/10/2026: acompanhamento de importação retomado após atualizar a aba; seleção automática da fonte importada; informação da resolução efetivamente recebida; solicitação temporária de prevenção de suspensão por inatividade no Windows durante tarefas; documentação da execução local e da alternativa Vercel com processador no PC.

Adaptação Decupa Viral para navegador em 16/10/2026: tradução da interface para português brasileiro; FFmpeg.wasm e Whisper/Transformers.js no aparelho; biblioteca IndexedDB; chave cifrada com AES-GCM; proxy de IA e narração Edge TTS na Vercel; contratos de importação, seleção de cortes, legendas ASS e ferramentas de mídia; diagnóstico com recarga para persistência; bloqueio de publicação fora do novo projeto Vercel do Arthur. A interface informa os módulos nativos ainda não adaptados. O teste de download YouTube na Vercel falhou e permanece documentado. Os testes de núcleo WASM fora de navegador não comprovam a jornada no celular.

Modo atual com PC em 16/10/2026: adicionados pareamento temporário com a interface da Vercel, autenticação HTTP/WebSocket, proxy de mídia por Service Worker e mensagens de conexão/desconexão. Os motores nativos voltam a executar no PC por autorização expressa do usuário, sem AWS. Preservado o código da tentativa anterior para navegador, que não é a modalidade publicada atual. Traduções adicionais na interface de cortes e nas mensagens de progresso. O backend permanece restrito ao loopback.

Auditoria dos motores em 16/10/2026: corrigidos o contrato de análise de gancho, a recuperação de resultados de ferramentas, o JSON de variáveis salvo pelo HyperFrames, a inicialização durante manutenção do extrator e os callbacks de instalações em portas diferentes. Tradução do estúdio de animações e dos nomes da biblioteca. Correções de testes no Windows, exportação pela interface pareada e empacotamento dos arquivos públicos. Detalhes, alcance e configurações pendentes em `docs/AUDITORIA-DECUPA.md`.
