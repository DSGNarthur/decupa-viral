# Instalação do Decupa Viral

O site é [decupa-viral.vercel.app](https://decupa-viral.vercel.app). O motor roda no computador de cada pessoa. Não utiliza AWS. Ele não inicia com o Windows, macOS ou Linux. Depois da instalação, use "Iniciar e conectar" no site para abrir o motor local e conectar. O navegador pode pedir confirmação para abrir o aplicativo e permitir acesso local.

Os pacotes ficam em [Releases](https://github.com/DSGNarthur/decupa-viral/releases). Consulte as evidências e as pendências da versão antes de instalar. Um script de compilação não comprova que o pacote foi testado no seu sistema.

A versão `2026.10.17.2` inclui instalador Windows e pacotes para Mac Apple Silicon, Mac Intel e Linux x64, compilados nos respectivos sistemas e testados com instalação isolada e exportação Full HD. Veja o [escopo e os resultados da validação](VALIDACAO-2026.10.17.2.md).

## Windows 10 e 11, 64 bits

1. Baixe `Decupa-Windows-Setup.exe` da versão `2026.10.17.2` e execute no seu usuário. Ele inclui Python, Node.js, FFmpeg, FFprobe e as dependências do motor.
2. O instalador não configura início automático.
3. Abra o site e clique em "Iniciar e conectar". Confirme a abertura do Decupa e permita o acesso aos aplicativos deste computador ou à rede local quando o navegador solicitar.

A alternativa portátil é `Decupa-Windows-x64.zip`. Extraia todo o ZIP e execute `payload/Instalar.cmd`. Ele verifica os arquivos e copia o motor para `%LOCALAPPDATA%/Programs/Decupa Viral`. Não é necessário instalar Python ou Node globalmente.

Antes de instalar uma atualização, termine as tarefas e encerre o motor anterior. O instalador recusa uma pasta já existente ou a porta 16889 ocupada. Ele não encerra outra aplicação para liberar a porta. A pasta de dados é separada da instalação e deve ser preservada. A confirmação de início verifica a conexão usada pelo site, além da disponibilidade do servidor.

O pacote não tem assinatura comercial de código enquanto a versão não informar um certificado verificado. O Windows pode avisar que o editor é desconhecido. Confira a origem e o SHA-256 publicado. Não desative o antivírus ou as proteções do Windows.

## macOS

Há pacotes separados para Apple Silicon (`arm64`, M1 e posteriores) e Intel (`x64`). Os builds usam macOS 14 no Apple Silicon e macOS 15 no Intel. Compatibilidade com versões anteriores precisa de teste específico.

1. Baixe o ZIP da arquitetura do seu Mac e extraia todo o conteúdo.
2. Execute `Instalar.command`, ao lado de `Decupa Viral.app`. Ele usa o Python incluído no pacote, verifica os arquivos e instala o app em `~/Applications`.
3. Abra o site e clique em "Iniciar e conectar". Confirme a abertura do Decupa e permita o acesso local quando solicitado. O motor não inicia com a sessão do macOS.

O aplicativo registra `decupaviral://start` para o botão "Iniciar e conectar". Não há assinatura Developer ID nem notarização sem um certificado Apple configurado. O Gatekeeper pode impedir a abertura. Verifique a origem e use apenas as opções de autorização oferecidas pelo próprio macOS. Não remova a quarentena ou desative o Gatekeeper como etapa automática de instalação.

## Linux

O pacote inicial é para Linux x86_64, com base de compilação Ubuntu 22.04. Requer uma sessão gráfica, navegador com suporte a acesso local, `tar` e as bibliotecas básicas compatíveis com o runtime. Outras distribuições e Linux ARM precisam de validação própria.

1. Baixe `Decupa-Linux-x64.tar.gz` e extraia.
2. No terminal, dentro da pasta extraída, execute `sh instalar.sh`.
3. Abra o site e clique em "Iniciar e conectar". Confirme a abertura do Decupa e autorize o acesso local se solicitado.

A instalação não usa `sudo`. O motor fica em `~/.local/share/decupa-viral/engine`, respeitando `XDG_DATA_HOME` quando definido. O protocolo é registrado via `xdg-mime`, quando disponível. O motor não inicia com a sessão do Linux.

## Primeiro uso

O motor deve estar instalado no mesmo computador do navegador. O botão "Iniciar e conectar" abre o aplicativo pelo protocolo registrado na instalação. O navegador pode exigir confirmação para abrir o programa; páginas da internet não podem executá-lo silenciosamente. O site não processa no celular usando o PC desligado.

O supervisor em segundo plano registra quedas do backend e tenta reiniciá-lo até três vezes em dez minutos. Se esse limite for ultrapassado, consulte os logs antes de iniciar novamente. O supervisor não assume nem encerra um serviço externo que ocupe a porta do motor.

Em Configurações, selecione seu provedor de IA. Para DeepSeek, use a URL e o modelo oferecidos pela sua conta e insira sua própria chave no aplicativo. Não compartilhe a chave em issues ou no código. Modelos de transcrição são baixados no primeiro uso e exigem internet e espaço livre. Integrações como publicação em redes sociais exigem as contas, autorizações e configurações de cada pessoa. Módulos opcionais podem baixar seus próprios modelos e runtimes quando ativados.

O download do YouTube usa a conexão local e o yt-dlp incluído. Vídeos privados, restrições de acesso e verificações exigidas pelo YouTube ainda podem impedir determinados downloads. Não há garantia de que todos os links sejam baixáveis. Use a configuração de acesso oferecida pelo aplicativo quando tiver acesso legítimo ao vídeo.

Nesta distribuição, atualize o extrator instalando uma nova versão do motor. O Python incluído e as dependências verificadas por hash não são alterados silenciosamente por `pip` durante a inicialização.

O editor nativo exporta vertical em 1080 × 1920 e quadrado em 1080 × 1080. A qualidade da fonte limita o detalhe da saída. Importações são transmitidas ao disco e têm limite inicial de 20 GB por arquivo, configurável com `MAX_IMPORT_SIZE_GB` no `.env` da pasta de dados. Importar e editar também exige espaço para fontes, rascunhos, temporários e exportações.

## Dados e atualizações

Os pacotes não incluem vídeos, contas, chaves ou banco de dados do Arthur. Cada usuário tem sua própria pasta de dados:

| Sistema | Pasta padrão |
| :--- | :--- |
| Windows | `%LOCALAPPDATA%/Decupa Viral/data` |
| macOS | `~/Library/Application Support/Decupa Viral/data` |
| Linux | `~/.local/share/decupa-viral/data` |

Para atualizar, termine os trabalhos, encerre o motor, guarde uma cópia da pasta de dados e remova apenas a instalação do motor. Instale o novo pacote. O instalador recusa sobrescrever uma instalação existente para evitar substituir um Python em execução. A reinstalação preserva os dados separados do motor.

No Windows, o menu Iniciar tem Encerrar motor quando o instalador `.exe` foi usado. A distribuição portátil permite executar `python/python.exe app/desktop/stop.py` dentro da instalação. Esse comando identifica apenas os processos desta instalação e recusa interromper tarefas ativas. No Mac/Linux, use `python/bin/python3 app/desktop/stop.py` dentro da pasta do motor. A opção `--force` interrompe tarefas, portanto use-a apenas se aceitar perder o trabalho em andamento.

As instalações novas não configuram início automático. Para desativá-lo numa instalação antiga do Windows, remova apenas a entrada `DecupaViral` em `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`. No Mac, remova o arquivo `~/Library/LaunchAgents/app.decupa.viral.engine.plist`; no Linux, remova `~/.config/autostart/decupa-viral.desktop`. Desinstalar o motor não remove a pasta de dados. Apague-a separadamente apenas se quiser excluir seus arquivos e configurações.

## Código, créditos e diagnóstico

O código é publicado em [DSGNarthur/decupa-viral](https://github.com/DSGNarthur/decupa-viral). O projeto deriva do [ViralMint](https://github.com/openclaw-easy/ViralMint) e inclui adaptações do [Supoclip](https://github.com/FujiwaraChoki/supoclip). Arthur mantém a distribuição Decupa Viral. Os autores originais conservam seus direitos e avisos. Veja `LICENSE`, `THIRD_PARTY_NOTICES.md` e os avisos de runtime dentro do pacote.

O backend fica restrito a `127.0.0.1:16889`. A credencial temporária de conexão fica no navegador e no processo local. Ela não é enviada a funções da Vercel. Não exponha essa porta na internet. A interface só autoriza a origem publicada do Decupa e as origens locais da instalação.

Se a conexão falhar, confira se o motor está instalado e ativo, se o navegador permitiu o acesso local e se outra aplicação usa a porta 16889. Os logs ficam em `logs` e `storage/tmp` na pasta de dados. Antes de compartilhar logs, remova informações pessoais e credenciais. Informe sistema, arquitetura, versão do pacote e a etapa exata que falhou.
