# Validação dos pacotes 2026.10.17.2

Os quatro pacotes foram compilados e executados em runners dos respectivos sistemas. Cada teste instalou o pacote numa pasta separada, iniciou o supervisor e o backend, criou e reabriu um rascunho e renderizou um MP4 em 1080 x 1920. O FFmpeg decodificou o arquivo inteiro e o teste conferiu a preservação da fonte.

Também passaram os testes de recuperação após queda do backend, rotação da credencial temporária, bloqueio de leitura sem pareamento, bloqueio de origem externa e respostas HTTP Range. São testes com mídia real pela API do motor instalado. Eles não equivalem a uma sessão gráfica completa em todos os sistemas.

| Pacote | Sistema de compilação e teste | Código correspondente |
| :--- | :--- | :--- |
| Windows x64, ZIP e Setup | Windows Server 2022 do GitHub Actions | `43e3e6e15d09aee3b065ad202783ffeb727476a8` |
| Mac Apple Silicon | macOS 14 arm64 | `89d366b3512dda950f5b230640e88f062c31309f` |
| Mac Intel | macOS 15 x64 | `89d366b3512dda950f5b230640e88f062c31309f` |
| Linux x64 | Ubuntu 22.04 | `89d366b3512dda950f5b230640e88f062c31309f` |

O Windows tem uma segunda validação: instalação pelo `.exe`, conexão autenticada ao motor instalado, registro do protocolo, desinstalação e confirmação de que seu próprio motor foi encerrado. O teste não interrompe aplicações preexistentes.

Os arquivos dos quatro manifestos foram conferidos por SHA-256 após baixar os artefatos do CI. Os ZIPs também passaram pela verificação CRC. Os fontes incluídos foram comparados aos commits correspondentes, considerando a diferença de quebra de linha do checkout Windows. Cada pacote inclui seu próprio ZIP de código, licença, créditos e avisos das dependências. Os pacotes não contêm configurações, credenciais, banco ou mídia pessoais do desenvolvedor.

## Reproduzir e consultar evidências

- [Build e aceitação de Mac e Linux](https://github.com/DSGNarthur/decupa-viral/actions/runs/39066167492). Os três jobs desses sistemas passaram. O job Windows dessa execução foi cancelado por um problema de espera no teste do instalador; a execução separada abaixo o substitui.
- [Build, aceitação e instalação/desinstalação Windows](https://github.com/DSGNarthur/decupa-viral/actions/runs/39066756143).
- [Pacotes, hashes, fontes correspondentes e relatórios JSON](https://github.com/DSGNarthur/decupa-viral/releases/tag/decupa-2026.10.17.2-native).

O ONNX Runtime do Mac Intel usa 1.23.2, que tem wheel para essa arquitetura. Os demais usam 1.31.0. Os builds Mac incluem FFmpeg com libass para renderizar legendas. Os relatórios por plataforma descrevem as verificações executadas e seus limites.

## Limites da validação

O registro e a abertura pela sessão gráfica do Mac e Linux, o início após reiniciar o sistema e os avisos de Gatekeeper/SmartScreen ainda exigem aceitação em máquinas de usuários. Não há certificado comercial Windows nem notarização Apple configurados. O teste Windows usa Server 2022; ele não substitui testes específicos em instalações limpas de Windows 10 e 11.

Publicação em redes sociais, bancos de mídia, mensageria e provedores de IA exigem as chaves e contas de cada usuário. O YouTube pode impor restrições a vídeos e conexões. Preservar o módulo original não comprova cada integração externa configurada. Não há promessa de funcionamento de todos os links ou de ausência absoluta de falhas.

O download integral de teste do YouTube com 1920 x 1080, áudio e 37 minutos e 36 segundos foi validado no motor Windows 2026.10.17.1, com decodificação completa. Esse teste anterior é distinto da aceitação dos quatro pacotes desta versão.

## Site publicado e navegador Windows

Em 17/10/2026, o Chrome acessou o site publicado e se conectou ao motor instalado no computador do Arthur. A sessão alterou uma legenda, salvou a revisão, recarregou a página, confirmou a persistência e restaurou o documento original. Uma nova exportação com dois trechos resultou em um MP4 de quatro segundos em 1080 x 1920, com áudio e decodificação completa.

O teste encontrou uma falha no download do Chrome. A correção usa uma transferência de uso único no service worker e uma navegação que entrega o arquivo como anexo ao navegador, sem reter o vídeo inteiro em memória. Arthur confirmou o download, e o arquivo salvo foi comparado por SHA-256 ao MP4 produzido pelo motor. O teste não inclui Safari ou Firefox.
