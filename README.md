# Decupa Viral

Editor e clipador de vídeos por Arthur (DSGNarthur), baseado no código aberto do ViralMint e com editor integrado a partir do Supoclip. Interface em português, temas claro e escuro, ícones originais e animações preservadas.

O site fica na Vercel do Arthur. Cada pessoa instala um motor no próprio computador, que executa downloads, transcrição, cortes e renderização. O motor pode iniciar com a sessão do sistema. A conexão inicial exige a permissão local do navegador. Não depende de AWS.

- [Abrir o site](https://decupa-viral.vercel.app)
- [Pacotes e evidências de cada versão](https://github.com/DSGNarthur/decupa-viral/releases)
- [Guia de instalação para Windows, macOS e Linux](docs/INSTALACAO.md)
- [Build dos pacotes e testes](desktop/README.md)
- [Licença AGPL-3.0](LICENSE)
- [Créditos e componentes adaptados](THIRD_PARTY_NOTICES.md)

## Recursos

O código preserva os módulos nativos do ViralMint, incluindo download por yt-dlp, transcrição local, seleção de cortes, legendas, renderização FFmpeg, biblioteca, ferramentas, motion e integrações. A disponibilidade de serviços externos depende das chaves, contas e modelos configurados por cada usuário.

O editor integrado tem rascunhos persistidos, revisão de palavras, remoção de trechos, enquadramento manual e por rosto, volume, composição de cortes e exportação em Full HD. Ele conserva a fonte limpa e permite reabrir a edição. Importações nativas têm limite inicial de 20 GB por arquivo, configurável na instalação.

O download do YouTube usa a rede do usuário. Restrições e verificações do próprio YouTube ainda podem impedir links específicos. Os pacotes não incluem contas, chaves, banco ou mídia pessoais.

## Desenvolvimento

Use Python 3.11, Node.js e FFmpeg/FFprobe. Instale as dependências de `desktop/requirements.lock` com uv, rode `npm ci` dentro de `frontend`, gere o código correspondente com `python scripts/package_source.py` e compile com `npm run build`. Execute `python desktop/runtime.py --background` no diretório do projeto. Os dados vão para a pasta do usuário; `runtime.local.json`, ignorado pelo Git, permite configurar uma instalação de desenvolvimento separada.

A interface hospedada usa `npm run build:companion`. A implementação experimental de processamento no navegador continua no código, mas tem limitações próprias e não substitui os módulos nativos desta distribuição.

A publicação é restrita ao projeto `decupa-viral` no workspace `arthurcarvalho2317-1652s-projects`. O script `scripts/deploy_arthur.py` verifica a identidade e o vínculo antes de permitir deploy.

## Autoria e licença

Distribuição e integração Decupa Viral: Arthur (DSGNarthur). Base: ViralMint Contributors, [openclaw-easy/ViralMint](https://github.com/openclaw-easy/ViralMint). Editor e rastreamento adaptados de [FujiwaraChoki/supoclip](https://github.com/FujiwaraChoki/supoclip), com os avisos preservados. Modelo YuNet e demais dependências mantêm suas respectivas licenças.

O código correspondente é oferecido no site e neste repositório sob AGPL-3.0. A documentação original do ViralMint foi preservada em [docs/upstream/README-ViralMint.md](docs/upstream/README-ViralMint.md). O Decupa é uma distribuição derivada, sem reivindicar autoria exclusiva sobre o código dos projetos originais.
