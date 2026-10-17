# Decupa no navegador

Arthur escolheu este modo em 17/10/2026: compartilhar o endereço da plataforma, sem instalação, atalho ou pareamento obrigatório. A produção usa `npm run build:browser`. A distribuição nativa e `build:companion` continuam disponíveis separadamente; não há comunicação automática com localhost no modo web.

## Uso

Abra a plataforma por HTTPS. Em Editor de cortes, use Importar vídeo para editar. Escolha um arquivo deste dispositivo, ajuste os trechos e exporte. Não precisa de chave de IA para edição manual. No estúdio, os cortes automáticos e a comparação global exigem a chave de IA configurada nesse navegador. A transcrição baixa o modelo na primeira utilização.

Os vídeos, rascunhos, tarefas e configurações ficam no IndexedDB deste navegador. O amigo que recebe o link tem sua própria biblioteca. Os arquivos não são enviados para um motor instalado nem sincronizados entre dispositivos. Limpar os dados do site remove essa biblioteca. Baixe as exportações que quiser guardar.

## Recursos adaptados

- Importação de arquivos, cortes manuais, transcrição local e seleção de cortes por IA.
- Editor não destrutivo com divisão, remoção, reordenação, correção de palavras, estilos de legenda, enquadramento manual, volume e efeitos.
- Rascunhos com revisão, rejeição de alterações concorrentes, fonte protegida e reabertura de exportações com seu documento original.
- Montagem de dois a oito rascunhos com legendas editáveis. Arquivos com dimensões diferentes são normalizados para a proporção da primeira edição.
- MP4 H.264/AAC. Editor vertical em 720 × 1280, quadrado em 720 × 720, formato original limitado a 1280 pixels no maior lado. Até 10 minutos por exportação do editor e 512 MB por arquivo de entrada.
- Publicação atômica dos resultados do editor, dos cortes e das ferramentas: cancelamento antes da gravação impede a publicação parcial. A exportação individual do editor pode encerrar o worker de FFmpeg ao cancelar. Algumas etapas de transcrição, detecção de silêncio e montagem terminam a operação atual antes de liberar o motor.

## Limites

O acompanhamento de rostos nativo, o HyperFrames, a pesquisa/canais de origem, os vídeos de banco e a mensageria não foram portados. Essas páginas mostram o limite em vez de solicitar conexão ao PC. A tradução de legendas não substitui a dublagem completa. A montagem das ferramentas usa corte direto, sem as transições nativas.

Quando a transcrição contém frases, o editor distribui os tempos entre as palavras da frase. Esses tempos são estimados. Cortes antigos sem mapa de remoção de silêncio são preparados a partir do intervalo original, com aviso. Cores e fontes no editor são limitadas aos controles validados. A versão web oferece Noto Sans e Noto Serif.

Download por URL continua dependente da origem. O fluxo do YouTube chama um resolvedor leve na Vercel e pode ser recusado pelo YouTube. Não há garantia de download de todos os links. A alternativa é importar o arquivo. A chave da IA é salva criptografada no dispositivo e enviada ao provedor pelo proxy de IA quando o usuário pede uma operação. Ela não é compartilhada com outros usuários.

## Verificação

Os testes Node validam persistência, migração de biblioteca, revisão concorrente, cancelamento sem resultado parcial, reabertura de exportações, seleção global e entrega da mídia pelo service worker. A troca de `pc-worker.js` por `media-worker.js` é aguardada antes de abrir a interface; a capacidade de pareamento anterior é descartada.

`scripts/test-browser-editor-wasm.mjs` executa os planos reais do editor no FFmpeg WebAssembly em V8. Usa mídia sintética, verifica áudio e dimensões com FFprobe, decodifica a saída inteira e compara a sequência com uma referência nativa por SSIM. Esse teste não substitui interação em um navegador.

A validação visual precisa ser informada separadamente. Não declarar a interface ou todas as integrações como integralmente verificadas a partir de build, testes Node ou HTTP 200.

O código correspondente está em `/source-code.zip`, sob AGPL-3.0, com avisos de autoria do ViralMint e do Supoclip. O pacote exclui chaves, banco local e arquivos pessoais.
