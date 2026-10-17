# Decupa Viral no navegador

Registro da tentativa anterior, que processava no próprio navegador. A modalidade atual autorizada usa os motores originais no PC ligado, descrita em [README-DECUPA.md](README-DECUPA.md). Esta modalidade de navegador independente não é a publicação atual.

Aplicativo derivado do ViralMint 1.3.1, com interface em português brasileiro e processamento no próprio navegador. O código original e esta adaptação seguem AGPL-3.0. A distribuição Python anterior permanece no repositório; os testes dela não comprovam o funcionamento desta versão.

## Compilar

```powershell
cd frontend
npm ci
npm run build:browser
```

Requer Node.js 22.12+ ou versão compatível com o Vite 8. A compilação copia o FFmpeg.wasm instalado pelo npm para os arquivos estáticos. O modelo Whisper é baixado no dispositivo quando a transcrição é usada. A fonte Noto Sans acompanha sua licença OFL em `public/engine`.

## Dados e processamento

Vídeos, resultados, biblioteca e configurações ficam no IndexedDB deste navegador. Outros dispositivos e outros navegadores têm bibliotecas separadas. Limpar os dados do site apaga os arquivos locais; baixe os resultados que deseja guardar. A chave de IA é cifrada com AES-GCM e uma CryptoKey local não exportável. A plataforma envia essa chave por HTTPS à API da própria publicação, que encaminha a chamada ao provedor escolhido sem incluí-la na resposta.

FFmpeg.wasm processa vídeo e áudio. Whisper/Transformers.js transcreve em um Web Worker. O processamento precisa da página aberta; suspensão do navegador ou fechamento da aba interrompem tarefas. A biblioteca já salva continua disponível. Um pedido de Wake Lock é usado quando o navegador permite, mas não garante execução em segundo plano no celular.

## Vercel do Arthur

Único destino autorizado: usuário `arthurcarvalho2317-1652`, workspace `arthurcarvalho2317-1652s-projects`, projeto novo `decupa-viral`. `scripts/deploy_arthur.py` verifica a identidade e o workspace antes de vincular ou publicar. Nunca usar a CLI padrão conectada a Matheus Lino. A autenticação deve estar em uma pasta local separada, fora do pacote de código.

As funções `api/ai.js`, `api/resolve.py`, `api/media.js` e `api/voiceover.py` atendem integrações externas. A Vercel não faz a transcrição nem a codificação dos vídeos nesta arquitetura. `DOWNLOAD_SIGNING_SECRET` deve existir no novo projeto para autenticar a transferência por partes do YouTube. O script de implantação configura um valor aleatório se ele ainda não existir. Nenhuma chave do DeepSeek é embutida na compilação.

## Estado de validação

Publicação atual: https://decupa-viral.vercel.app, exclusivamente no novo projeto `decupa-viral` do Arthur. A regra de conta também consta em `AGENTS.md`; o script de publicação confere usuário, equipe e ID do projeto antes de modificar a Vercel.

Em 16/10/2026, a API publicada do DeepSeek respondeu ao teste. A narração Edge TTS em português gerou um MP3 de 3,504 segundos, conferido com FFprobe. O teste de download do vídeo YouTube fornecido pelo usuário retornou HTTP 502 nas duas primeiras publicações. Esse fluxo permanece indisponível no teste realizado.

Sete testes automatizados verificam criptografia, destinos permitidos, assinatura de downloads, resposta vazia de IA, tempos de cortes, recuperação entre abas e cancelamento de tarefa na fila. O FFmpeg.wasm 0.12.10 executado em V8/Node.js também exportou três segundos em 720x1280 com áudio AAC e vídeo H.264. A legenda ASS em português foi inspecionada visualmente; o contêiner foi conferido com FFprobe nativo. Esse teste não executa navegador nem comprova desempenho no celular.

A interface compila e há testes de criptografia, recusa de destinos arbitrários e assinatura de downloads. O pipeline de mídia no navegador ainda precisa de execução real, incluindo celulares. O acesso de automação ao navegador foi informado como desabilitado no Work durante esta unidade. Build e testes sem navegador não comprovam exportação de vídeo.

A adaptação implementa biblioteca local, importação, cortes manuais e seleção por IA, transcrição, legendas e ferramentas de mídia. Sua execução ainda está em validação. Estúdio HyperFrames, publicação autenticada em redes sociais, pesquisa/canais e geração com banco de imagens ainda precisam de adaptação própria para navegador. A união de vídeos ainda limita transições a corte direto. Não declarar paridade integral com o ViralMint.

O download por link depende de o YouTube aceitar a origem da Vercel. Em caso de bloqueio, a interface retorna o erro e permite importar um arquivo do dispositivo. Não substituir uma falha de seleção por cortes aleatórios apresentados como escolhas da IA.

## Verificar no aparelho

Abra `/diagnostico` e use "Testar importação e exportação". O teste usa um vídeo sintético com fala, baixa o modelo Whisper, exporta um corte com legenda e recarrega a página para conferir a persistência. Em seguida, reproduza e baixe o vídeo para verificar áudio e texto. O resultado vale para o aparelho e navegador em que foi executado. Essa jornada ainda não foi executada pela automação porque o Work continua informando acesso local ao navegador desabilitado.

Para repetir os testes sem navegador, execute `npm run test:browser`. O comando `npm run test:wasm -- C:\caminho\resultado` requer FFprobe no PATH e registra o vídeo e um quadro de conferência fora da pasta pública.
