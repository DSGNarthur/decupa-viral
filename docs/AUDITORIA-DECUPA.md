# Auditoria dos motores do Decupa Viral

Auditoria iniciada em 16/10/2026. Base: ViralMint 1.3.1, commit `604d5f1a37900991217e1c7b06379c5f58e8c4dd`.

## Arquitetura em uso

A interface publicada em https://decupa-viral.vercel.app usa os motores Python instalados no PC. Não usa AWS. A publicação pertence exclusivamente ao workspace `arthurcarvalho2317-1652s-projects`, do Arthur. O script de publicação confirma a identidade, o workspace e o projeto remoto antes de qualquer alteração.

O backend permanece em `127.0.0.1:16889`, com SQLite e mídia na pasta de dados da instalação. O estúdio HyperFrames desta cópia usa a porta 16902. A interface publicada usa pareamento temporário na aba, HTTP autenticado, WebSocket com subprotocolo autenticado e proxy de mídia com suporte a Range. Reiniciar o backend exige parear novamente.

O inventário compara os arquivos da base com a distribuição: os 138 arquivos originais de backend e recursos de animação estão presentes. A distribuição preserva os serviços de yt-dlp, faster-whisper, FFmpeg e HyperFrames. Há modificações de integração, idioma, segurança e correção de falhas. Presença de arquivos não é prova de funcionamento de todas as integrações.

Na publicação, o editor de animações abre a interface nativa em outra aba deste PC. Isso evita a instabilidade observada ao incorporar um editor HTTP local dentro da página HTTPS. A linha do tempo e a exportação continuam no HyperFrames original, com o mesmo projeto e banco local. A composição por IA continua disponível na página publicada.

## Execuções reais verificadas

O fluxo principal baixou o vídeo de teste do YouTube integralmente, transcreveu em português, escolheu trechos com o DeepSeek, aplicou legendas e exportou MP4. As evidências incluem arquivos de 1080x1920 e conferência por FFprobe, reprodução na interface e comparação entre o download pela Vercel e o arquivo produzido no PC.

O roteiro `scripts/audit_native.py` exercitou a API real, acompanhou cada tarefa no banco, baixou os resultados e decodificou os arquivos de mídia. Foram executadas as ferramentas: aparar, comprimir, recortar imagem, velocidade, GIF, transformar, marca d'água, unir clipes, aprimorar áudio, remover silêncio, visualizador de áudio, reenquadrar, exportar legendas, aplicar legendas, zoom automático, metadados, análise de gancho, capítulos, tradução e narração.

Verificações adicionais executaram dublagem com voz, união com transição, aprimoramento de áudio sem vídeo e extração da faixa de legendas existente no YouTube. A composição por IA em português passou pela validação do HyperFrames e foi renderizada em MP4. A prévia e a linha do tempo foram conferidas no navegador, considerando o tempo necessário ao carregamento do motor.

Os testes usam um trecho curto com fala real. Eles não comprovam cada combinação de opções, qualquer duração ou qualquer dispositivo. Integrações de publicação e mensagens não enviaram conteúdo real.

## Falhas corrigidas

- O editor de análise de gancho procurava campos diferentes dos que o motor retornava. A API agora preserva os campos originais e fornece os campos usados pela interface. A tela também lê os resultados antigos. As respostas novas pedem português e fidelidade aos fatos do trecho.
- Ferramentas agora recuperam a última tarefa desta aba e conferem o estado e a existência do resultado no backend. Uma consulta periódica cobre eventos perdidos do WebSocket. Uma nova execução limpa a seleção da tarefa anterior.
- A análise de gancho deixa de oferecer download de um arquivo inexistente, pois seu resultado é estruturado na tarefa.
- O HyperFrames 0.7.111 salvava variáveis como entidades HTML, mas seu validador tentava ler o JSON sem decodificá-las. A correção usa o leitor de atributos do próprio motor, é restrita à instalação independente e mantém uma cópia do arquivo original do plugin.
- A composição por IA recebe orientação para manter o texto acima das camadas decorativas. A validação continua ativa e uma composição rejeitada não substitui o projeto atual.
- A interface do estúdio recebeu tradução de controles e mensagens, sem alterar o código editado ou os arquivos importados pelo usuário.
- A manutenção do yt-dlp não bloqueia mais a inicialização da API. Os callbacks OAuth padrão acompanham a porta da instalação, evitando encaminhá-los ao ViralMint anterior.
- Uma rota de API inexistente retorna 404 em JSON, em vez de receber o HTML da aplicação.
- Downloads da interface publicada usam o processador pareado. A exportação do vídeo em seu formato original também usa esse caminho.
- A publicação da interface com PC inclui apenas os arquivos públicos necessários. Motores experimentais de navegador e amostras de teste não entram nos arquivos estáticos dessa publicação.
- Os testes foram ajustados para UTF-8, URLs de módulos e caminhos do Windows, sem criar fixtures nas raízes dos discos. Os nomes da biblioteca foram alinhados em português.

## Dependências de configuração

A chave do DeepSeek está configurada localmente. A auditoria identificou ausência das credenciais de YouTube Data API, OAuth de publicação no YouTube e TikTok, TikHub e Pexels. Telegram, WhatsApp, Discord e Slack estão desconectados. Esses recursos exigem configurar as respectivas contas antes de uma validação completa.

Acesso remoto por celular não faz parte desta conexão local. O PC deve ficar ligado durante o processamento. Resultados de IA e acesso ao YouTube dependem dos serviços externos, da conexão e das permissões da origem.

## Evidências e reprodução

Nesta máquina, os relatórios JSON, logs, vídeos e imagens ficam em `C:\Users\arthu\Documents\ChatGPT\Editor\.runtime-decupa\validation`. O relatório final dessa pasta registra os resultados das suítes e da publicação. Ele não entra no pacote público com dados pessoais.

Para executar a suíte com codificação correta no Windows:

```powershell
$env:PYTHONUTF8 = "1"
python -m pytest tests -q
```

Para auditar os motores contra a instalação independente, informe um vídeo de origem autorizado e uma pasta de evidências a `scripts/audit_native.py`. Esse roteiro confirma o nome do aplicativo antes de iniciar tarefas. Não envie credenciais para logs ou para o pacote de código.
