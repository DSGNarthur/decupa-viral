# Decupa com base no ViralMint

Estado atual: [Decupa Viral com os motores originais no PC](README-DECUPA.md), interface em https://decupa-viral.vercel.app na conta do Arthur. O usuário autorizou expressamente priorizar os recursos originais com o PC ligado. Essa decisão substitui a modalidade anterior independente no celular. Não usa AWS. As seções abaixo registram a evolução do pedido e seus resultados parciais, sem comprovar paridade integral.

## Unidade de 16/10/2026

Pedido: preparar uma cópia do aplicativo ViralMint com a marca Decupa, mantendo seus recursos e priorizando importar vídeos por URL do YouTube e produzir cortes. O processamento deverá ficar na AWS para funcionar com o PC desligado.

Base: ViralMint 1.3.1, commit `604d5f1a37900991217e1c7b06379c5f58e8c4dd`, licença AGPL-3.0. Fork local em `E:\Codex\Decupa-ViralMint`, branch `codex/decupa-viralmint`. O projeto atual em `E:\Codex\Decupa` tem alterações locais e permanece preservado.

Escopo desta unidade: cópia completa do código aberto; identidade Decupa; entrada direta no clipador; importação de fontes no clipador; avisos de autoria e oferta de código-fonte; execução e validação locais; preparação da hospedagem na AWS e da interface na Vercel.

Critérios: interface compilada, backend funcional, persistência local separada, importação e corte com arquivo de teste, fonte disponível sem segredos. Download do YouTube e cortes por IA devem ter evidência própria antes de serem declarados prontos. IA exige credencial do provedor; não copiar segredos do projeto existente para este fork.

Publicação: nenhuma substituição da produção nesta unidade. A publicação dependerá da validação do servidor, da proteção de acesso e da revisão da versão preparada.

Estado inicial: código clonado; dependências em instalação; arquitetura atual confirmada no código como interface/API Node na Vercel e worker SQS na AWS. O ViralMint usa FastAPI, SQLite e arquivos locais; não é compatível diretamente com as Functions e o banco atual do Decupa.

## Resultado desta unidade

- Copiado o código completo do aplicativo aberto e preservadas as licenças. Marca Decupa aplicada às áreas de interface, Chat e inicializador; entrada inicial pelo Clip Studio. Adicionado campo para URL e importação de arquivo na área de cortes, além da página Sobre e código-fonte.
- Interface compilada com sucesso. Adicionado o grupo de dependências `yt-dlp[default]` para incluir o solucionador EJS recomendado pelo próprio yt-dlp. Sintaxe Python e diferenças de whitespace verificadas.
- A instalação pesada em E: foi interrompida quando o volume apresentou lentidão e o Windows informou HealthStatus=Warning. As dependências e os dados da prévia ficam em `C:\Users\arthu\Documents\ChatGPT\Editor\.runtime-decupa`. O arquivo local ignorado `runtime.local.json` aponta para esse ambiente, separado do projeto anterior. O modelo Whisper já existente no C: é reutilizado sem duplicar seu download.
- Prévia local ativa em `http://localhost:16889`; atalho `Decupa - nova versão` na Área de Trabalho. O teste com mídia sintética validou importação, transcrição, corte vertical de 3 segundos com legendas, áudio e registro persistido na biblioteca. FFprobe confirmou H.264/AAC e 1080x1920.
- O vídeo público fornecido pelo usuário, ID `bM7TfuoieXY`, foi baixado integralmente pelo motor do aplicativo. Após falhas 403/429, a alternativa entregue foi 640x360, com áudio AAC, duração de 2.255,563 segundos e aproximadamente 128 MB. Não foi entregue o 1080p solicitado. Um corte manual de 10 segundos dessa fonte terminou com sucesso e foi inspecionado com FFprobe.
- A oferta de código correspondente foi testada pela API: ZIP válido com LICENSE e os arquivos novos, sem banco ou arquivos de chaves. O pacote precisa ser atualizado a cada versão.
- Renovada a sessão CLI da AWS e realizada inspeção somente leitura da VM. Worker existente ativo, Ubuntu 24.04, Python 3.12.3, Node, npm, FFmpeg, 4 vCPUs e 8 GB de RAM. Configurações preparadas para um serviço independente e um caminho alternativo com Docker. Nenhum deles foi instalado na AWS nesta unidade.

## Pendências explícitas

A migração publicada não está concluída. Faltam a instalação do backend candidato na AWS, a integração segura com o DeepSeek existente no servidor, o controle de acesso e a ligação HTTP/mídia/WebSocket com a Vercel. A cópia ainda usa um espaço de trabalho `local`, sem isolamento entre contas. O Auto-cut por IA não foi validado. A edição comercial do ViralMint não faz parte deste código aberto.

O controle local do navegador foi informado como desabilitado nas configurações do ambiente, por isso a conferência visual da nova versão ficou pendente. Os testes realizados foram técnicos, com API e arquivos de mídia, e não substituem a jornada autenticada na Vercel.

Evidências locais: `.runtime-decupa/validation/local-flow.json`, `youtube-status.json`, `youtube-source-probe.json`, `youtube-cut-status.json` e `youtube-cut-probe.json`, sob `C:\Users\arthu\Documents\ChatGPT\Editor`. A interface compilada está em `.runtime-decupa/frontend/dist`.

## Continuação local em 16/10/2026

O usuário mudou a preferência para processamento neste PC e autorizou continuar. AWS e Vercel deixam de ser o destino desta unidade. O serviço local já responde na porta 16889, com os vídeos e cortes anteriores preservados. A chave do DeepSeek foi solicitada diretamente nas configurações do aplicativo, sem envio pela conversa e sem copiar segredos da AWS.

Objetivo desta continuação: testar a credencial salva, transcrever o vídeo real, gerar um pequeno lote de cortes escolhidos por IA, conferir mídia e persistência, ajustar as instruções para uso local e atualizar a oferta de código. O PC deve permanecer ligado e sem suspensão enquanto processa. YouTube e DeepSeek ainda usam internet.

## Mudança de alvo: Decupa Viral no navegador

O usuário autorizou publicar uma plataforma separada na própria Vercel, com a identidade visual do ViralMint e toda a interface em português. Ao esclarecer a modalidade móvel, escolheu expressamente que o celular processe sozinho, sem PC. Portanto, o modo final desta nova unidade não depende de um processador instalado no PC nem de AWS. Os motores nativos anteriores ficam preservados como distribuição local, sem serem apresentados como prova da versão móvel.

Implementação necessária: processamento de mídia com FFmpeg.wasm; transcrição com Whisper para navegador; arquivos e biblioteca no armazenamento do dispositivo; adaptação dos contratos da interface; chamadas de IA por API da Vercel usando credencial do usuário; importação por URL com validação própria. Nem a publicação estática nem os testes da versão Python comprovam esse fluxo.

A CLI estava conectada a outra conta Vercel. Foi iniciada uma autenticação isolada para a conta mostrada pelo usuário. Nenhum projeto existente foi substituído.

## Publicação independente do Arthur

Autenticação isolada confirmada como `arthurcarvalho2317-1652`, equipe `arthurcarvalho2317-1652s-projects`, ID `team_jmaJdMk79JyMSB5lrkBlBodK`. Novo projeto `decupa-viral`, ID `prj_7aDlxxrqufoZnLxmcFTPC5hyuQZP`. Domínio https://decupa-viral.vercel.app. Nenhuma publicação foi feita na conta do Matheus, no Decupa anterior ou na AWS. O script de implantação bloqueia identidade, equipe ou projeto diferentes.

Interface traduzida para português brasileiro, marca Decupa Viral, identidade visual original e créditos ViralMint preservados. Adaptados IndexedDB, arquivos locais, Web Worker de transcrição e FFmpeg.wasm. Rotas nativas sem adaptação exibem a limitação. Incluído diagnóstico explícito de importação, transcrição, corte, exportação e persistência no aparelho.

Evidências em `.runtime-decupa/validation`: `vercel-api-check.json` e `vercel-voiceover.mp3` confirmam chamadas de IA e narração; `vercel-youtube-resolve-error.json` registra a falha do YouTube; `wasm/wasm-caption-cut.mp4`, `wasm-caption-frame.png` e `wasm-probe.json` confirmam exportação pelo núcleo WASM em V8, fora de navegador. Sete testes Node passaram após as correções finais. Compilação não prova o fluxo móvel.

A transcrição completa do vídeo real terminou na distribuição Python. A seleção automática dessa tentativa falhou antes da correção do modo thinking do DeepSeek. Não foi repetida como prova da versão web. O acesso de automação ao navegador continua desabilitado no Work, mesmo após o usuário informar que iria habilitá-lo.

Pendências: jornada real pela interface e em celular; resolver o bloqueio de download YouTube; adaptar HyperFrames, pesquisa/canais, publicação em redes sociais, mensagens e geração por banco de imagens. Dublagem em outros idiomas, transições e exportação ZIP com vários formatos também não estão disponíveis no navegador.

## Motores originais no PC, retomados em 16/10/2026

O usuário autorizou: "Sim, priorize os recursos originais com o PC ligado". Implementado o modo companion: a interface da Vercel usa o backend local pareado, com autenticação HTTP e WebSocket e transmissão local de mídia. O processo gera o token de pareamento em memória e aceita somente a origem exata do novo projeto do Arthur. O backend continua em loopback, sem AWS. O navegador precisa permitir acesso aos aplicativos locais. A conexão pela interface ainda está em validação; acesso remoto pelo celular não está implementado.

Novo download do vídeo bM7TfuoieXY concluído pelo aplicativo, tarefa d72001b1-5a0e-43d6-b029-9e79880ad730: MP4 com H.264/AAC, 1920x1080, 2.255,540 segundos e 578.562.034 bytes. Dois cortes por IA sobre a fonte anterior do mesmo vídeo concluídos na tarefa a2f75fd1-e88a-4f43-9fa9-14e88106fc4f: 26,9 e 25,3 segundos, H.264/AAC, 1080x1920, com legendas aplicadas. Prévia e legendas conferidas no arquivo e no navegador local. Uma nova extração sobre o download 1080p foi iniciada pela própria interface, incluindo nova transcrição. Ainda não há comprovação de todos os módulos externos; pesquisa do YouTube, publicação em redes e outras integrações exigem suas credenciais.

## Verificação dos motores originais e da conexão

O novo download em 1080p foi transcrito novamente em português pela tarefa 74e9317d-7996-4abe-b9bd-9c8c5988cda3, iniciada pela interface. Ela concluiu a seleção por IA e o clipe 6d9f948d-c3e4-45a7-9112-01adfaf0e172, de 26,300 segundos, H.264/AAC, 1080x1920, com legendas aplicadas. A ferramenta Aparar / Cortar também foi exercitada pela interface, com um trecho de cinco segundos exportado, baixado pelo navegador e conferido com FFprobe.

Depois que o usuário permitiu o acesso aos aplicativos locais no Chrome, a página de produção da Vercel conectou, carregou a biblioteca do PC e recebeu o novo corte pela URL de mídia da própria publicação. O elemento de vídeo confirmou readyState=4, duração de 26,3s e 1080x1920. Corrigida também a negociação do subprotocolo do WebSocket, exigida pelo navegador para manter a conexão autenticada aberta.

O estúdio de animações desta cópia usa a porta 16902 e não executa o comando global de encerramento do HyperFrames. O ViralMint original continua nas portas 16888 e 16890. A renderização de teste do estúdio concluiu na tarefa cd1fe639-1119-47eb-b51c-05b0b477c8b1: MP4 H.264 de seis segundos, 1080x1920, com o conteúdo padrão conferido visualmente. A interface do HyperFrames ainda contém controles em inglês. Não foi comprovada a operação de todos os módulos externos, que exigem credenciais próprias; não houve publicação em redes sociais ou envio de mensagens.
