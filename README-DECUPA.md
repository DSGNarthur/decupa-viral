# Decupa com base no ViralMint

Esta é a modalidade atual autorizada: motores originais instalados no PC, com acesso local em http://localhost:16889 e interface em https://decupa-viral.vercel.app, exclusivamente na Vercel do Arthur. O PC precisa ficar ligado. Não usa AWS. A decisão substitui a tentativa anterior de processamento independente no celular, registrada em README-NAVEGADOR.md.

Esta distribuição copia o aplicativo aberto ViralMint 1.3.1 e adapta sua identidade e a entrada do clipador. Inclui o código das páginas de Chat, Scout, canais, biblioteca, vídeos com banco de imagens, Motion Graphics, ferramentas, mensagens e configurações. A licença e os avisos originais permanecem preservados. Consulte MODIFICATIONS.md e LICENSE.

## Executar no Windows

Requer Python 3.11+, Node.js 22+ e FFmpeg com FFprobe no PATH. O Node também é usado pelo solucionador do YouTube.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe scripts/setup_local.py
.\.venv\Scripts\python.exe scripts/package_source.py
npm.cmd ci --prefix frontend
npm.cmd run build --prefix frontend
.\.venv\Scripts\pythonw.exe launch-decupa.pyw
```

A versão local usa http://localhost:16889 e tem banco e mídia próprios. O ViralMint instalado anteriormente usa a porta 16888. O projeto publicado anterior continua em `E:\Codex\Decupa`; esta cópia não usa nem migra seu banco.

Nesta máquina, o ambiente local foi preparado em `C:\Users\arthu\Documents\ChatGPT\Editor\.runtime-decupa`, porque a instalação de dependências no volume E: apresentou lentidão e o Windows informou um alerta de saúde no volume. O arquivo ignorado `runtime.local.json` aponta para esse ambiente. O atalho `Decupa - nova versão` na Área de Trabalho usa essa configuração. A preferência atual do usuário é processar neste PC; os arquivos de implantação AWS são uma alternativa anterior que não foi instalada.

Mantenha o PC ligado e o aplicativo em execução durante as tarefas. No Windows, esta versão solicita temporariamente que o sistema não suspenda por inatividade enquanto há tarefas em execução, sem alterar o plano de energia nem manter a tela acesa. Fechar a tampa, suspender manualmente ou desligar o PC ainda pode interromper o trabalho. `DECUPA_KEEP_AWAKE=false` desativa essa solicitação.

## Fluxo de cortes

Abra Estúdio de cortes, cole o link do vídeo e clique em Baixar vídeo. O download usa o motor yt-dlp original, com qualidade solicitada de até 1080p. A qualidade entregue depende do que a origem oferece e do acesso permitido por ela. O resultado informa a resolução recebida, inclusive quando foi inferior à solicitada. Após o download, a fonte é selecionada automaticamente; use Corte automático para a IA escolher os cortes ou marque os intervalos na linha do tempo. O acompanhamento da importação é retomado após atualizar a página na mesma aba.

O campo Importar arquivo permite trabalhar com uma fonte local. A transcrição usa faster-whisper; os cortes e as legendas usam FFmpeg. A seleção de trechos por IA depende da chave do DeepSeek em Configurações > Provedor de IA > Atualizar. A distribuição vem configurada para `https://api.deepseek.com`, modelo `deepseek-flash`, sem chave no código. O usuário inseriu sua chave diretamente no aplicativo desta máquina; o teste de conexão respondeu com sucesso. A chave permanece no banco local, criptografada pelo aplicativo, e não integra o pacote de código.

Importar um arquivo também inicia a análise em segundo plano. A fonte fica disponível mesmo quando a análise por IA requer configurar a chave. O download por URL no campo principal baixa o vídeo primeiro; o Auto-cut inicia o restante do fluxo quando solicitado.

## Vercel com processamento no PC

Abra o aplicativo local pelo atalho `Decupa - nova versão`. Clique em `Abrir na Vercel` na faixa superior e depois em `Conectar PC`. No Chrome, permita o acesso aos aplicativos deste computador quando solicitado. A página recebe um token de pareamento pelo fragmento da URL, remove esse fragmento e mantém a sessão somente na aba. As rotas HTTP e WebSocket usam autenticação; a mídia passa pelo processador local, sem envio dos vídeos para a Vercel. Reiniciar o backend exige um novo pareamento.

O backend aceita somente a origem de produção exata `https://decupa-viral.vercel.app` quando iniciado com `DECUPA_COMPANION=1`, definido no inicializador desta cópia. Ele permanece vinculado a 127.0.0.1. Esse modo funciona neste mesmo computador. Acesso por celular fora do PC ainda requer uma conexão remota própria e não foi implementado. Se o navegador bloquear a conexão local, use diretamente http://localhost:16889, que oferece os motores completos sem essa ligação.

Processar tudo no navegador do próprio PC ou celular é uma alternativa distinta. Seria preciso substituir faster-whisper e FFmpeg nativos por implementações para navegador, além de adaptar download, armazenamento e execução em segundo plano. O código original não oferece essa modalidade. Em celulares, compatibilidade, memória, bateria e suspensão da página precisam de testes próprios. O fluxo de baixar um link do YouTube também não pode ser presumido equivalente ao yt-dlp instalado. Consulte `PLANO_VERCEL_LOCAL.md`.

## Alternativa anterior: AWS e Vercel

A Vercel pode servir a interface. O backend Python precisa permanecer em execução em um servidor com disco persistente, FFmpeg, acesso à rede e memória para Whisper. `deploy/Dockerfile` e `deploy/compose.yaml` preparam esse backend em um serviço próprio, sem substituir o worker SQS atual. A porta do backend fica vinculada apenas ao loopback do servidor.

O inventário ao vivo, o caminho nativo com systemd e as etapas ainda necessárias estão em `PLANO_PUBLICACAO_AWS.md`.

Antes de publicar: confirmar capacidade e serviços em uso na VM; configurar autenticação e um proxy HTTPS; conectar as rotas HTTP, mídia e WebSocket; manter a interface com acesso restrito; testar YouTube e cortes com a chave do DeepSeek no servidor; revisar a troca da versão publicada. A imagem Docker está preparada, mas seu build e funcionamento na AWS dependem de validação própria.

Esta cópia usa um único espaço de trabalho do ViralMint (`local`). Ela não implementa isolamento entre contas. O backend permanece local e não deve ser publicado diretamente na internet.

## Código correspondente

A página Sobre e código-fonte oferece o arquivo `source-code.zip` e a licença. Antes de cada compilação de uma versão modificada, execute `scripts/package_source.py` para atualizar o arquivo. O pacote deve acompanhar a versão publicada e inclui fontes, dependências e instruções de execução. Segredos, bancos e mídias não fazem parte dele.

Recursos comerciais ausentes no repositório original não são incluídos nesta cópia. Integrações externas continuam dependendo das respectivas contas e credenciais.
# Editor de cortes integrado

As instruções da integração com Supoclip estão em [docs/INTEGRACAO-SUPOCLIP.md](docs/INTEGRACAO-SUPOCLIP.md). Incluem rascunhos, revisão de legendas, montagem, reenquadramento, temas e validação. O checkout ativo desta instalação está no C:, com o atalho `Decupa` na Área de Trabalho.
