# Distribuições nativas

O build deve rodar no sistema e na arquitetura de destino. O resultado inclui código do app, Python 3.11.16 independente, dependências travadas e verificadas por hash, Node.js 24.22.0, FFmpeg/FFprobe e o pacote de código correspondente. Não copie um venv do desenvolvedor para distribuir: ele contém caminhos absolutos.

A receita `desktop/ci-workflow.yml` gera Windows x64, macOS Apple Silicon, macOS Intel e Linux x64. Ela deve ser aplicada a `.github/workflows/build-desktop.yml` e executada manualmente. Não publica releases automaticamente. Cada job executa `smoke_distribution.py` com um banco isolado e mídia real, verifica conexão, bloqueio de origem, importação, rascunho, exportação Full HD, range HTTP, decodificação completa e preservação da fonte. A validação visual continua separada.

Para construir em um sistema de destino com Python, uv, Node/npm e FFmpeg/FFprobe disponíveis:

```sh
python scripts/package_source.py
cd frontend
npm ci
npm run build
cd ..
python desktop/build_distribution.py --output /caminho/fora/do/repositorio --version 2026.10.17
python desktop/smoke_distribution.py --payload /caminho/fora/do/repositorio/payload --output /caminho/fora/do/repositorio/smoke.json
```

`desktop/scripts/build-decupa.sh` reúne essas etapas e prepara FFmpeg estático no Linux. No macOS, requer Homebrew, `ffmpeg-full` com libass e dylibbundler; o builder inclui as dependências dylib do FFmpeg. No Windows, o `.exe` é compilado com Inno Setup e `desktop/windows.iss`. Os pacotes ZIP e tar.gz também têm instalador por usuário.

O teste `accept_installation.py` instala numa pasta isolada antes de exercitar o motor, incluindo recuperação de queda. No runner Windows, `windows-smoke.ps1` também executa o Setup, verifica pareamento, ausência de início automático e registro do protocolo, depois executa o desinstalador. Esse teste recusa rodar fora do ambiente descartável do GitHub Actions. As instalações padrão não registram início automático em nenhum sistema.

Os pacotes incluem SHA-256 e manifesto de arquivos. Isso detecta corrupção em relação ao conteúdo publicado, mas não substitui uma assinatura de código. Não há Developer ID/notarização Apple ou certificado Authenticode configurado. Não desative as proteções dos sistemas.

As receitas originais do ViralMint em `desktop/scripts/build-app.sh` e `viralmint.spec` permanecem como referência upstream. O Decupa usa o builder source-based para preservar os módulos dinâmicos e distribuir o código correspondente junto ao motor.

Veja o guia de uso em [docs/INSTALACAO.md](../docs/INSTALACAO.md).
