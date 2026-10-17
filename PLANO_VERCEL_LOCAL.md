# Vercel com processamento no PC

O usuário autorizou voltar aos motores originais com o PC ligado. O pareamento foi implementado e publicado exclusivamente em https://decupa-viral.vercel.app, na Vercel do Arthur. A execução atual está em [README-DECUPA.md](README-DECUPA.md). A tentativa intermediária de processamento independente no celular é histórica e não é a modalidade publicada.

Consulta inicial em 16/10/2026: hospedar na Vercel e dispensar o backend AWS. As seções abaixo registram o estudo inicial. O pareamento no mesmo PC foi implementado; o controle remoto por celular continua fora da implantação atual.

## Caminho que preserva os motores do ViralMint

A Vercel entrega a interface web. O backend Python instalado neste PC baixa vídeos com yt-dlp, transcreve com faster-whisper e corta/renderiza com FFmpeg. O DeepSeek continua como API externa para seleção de trechos e outras funções de IA. Vídeos, SQLite e resultados permanecem no PC, salvo se uma sincronização for implementada.

Implementação necessária: pareamento e autenticação do processador; conexão HTTPS acessível ao navegador ou uma ponte de comandos com conexão de saída do PC; rotas de mídia com Range; progresso e reconexão; estados de PC disponível/indisponível; persistência dos comandos sem depender da memória de uma Function. Não expor o backend local atual sem proteção. O `localhost` do celular identifica o próprio celular, não este PC.

O acesso pelo celular pode controlar o PC conectado. Esse modo não processa os vídeos no celular e não funciona com o PC desligado. Acesso fora da rede doméstica depende da ponte remota escolhida. Essa conexão ainda não está implementada.

## Caminho inteiramente no navegador

FFmpeg.wasm permite processamento de mídia no navegador. Transformers.js permite transcrição Whisper no navegador, inclusive com WebGPU quando disponível. Isso exige outra implementação do processamento, integração com armazenamento do navegador e testes por dispositivo. Não se obtém esse resultado apenas publicando a interface do ViralMint.

Prioridade prática: arquivos locais e trechos curtos; medir memória e tempo; depois avaliar legendas, fontes longas e importação por URL. A documentação do FFmpeg.wasm informa desempenho inferior ao FFmpeg nativo. Não prometer paridade de todas as funções nem processamento de vídeos longos em qualquer celular.

## Referências oficiais verificadas

- Vercel Functions: https://vercel.com/docs/functions/limitations
- WebSockets na Vercel: https://vercel.com/docs/functions/websockets
- FFmpeg.wasm: https://ffmpegwasm.netlify.app/docs/faq/
- Whisper/WebGPU no navegador: https://huggingface.co/docs/transformers.js/guides/webgpu

As Functions da Vercel têm limites de duração, memória e transferência; há recursos adicionais e betas atuais na plataforma. Esses recursos não tornam SQLite local e tarefas Python em memória equivalentes a um serviço persistente. A arquitetura precisa ser adaptada, independentemente de escolher recursos hospedados ou um processador no PC.
