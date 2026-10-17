# Componentes adaptados

O Decupa preserva o código e os avisos dos contribuidores do ViralMint, base AGPL-3.0.

O editor de cortes e os módulos de detecção e trajetória de rostos foram adaptados de [FujiwaraChoki/supoclip](https://github.com/FujiwaraChoki/supoclip), revisão `c61076544365ef8b49ffe3210f8e12b25fb60b74`, sob AGPL-3.0. Os autores originais conservam seus direitos. A licença está em `backend/services/supoclip/LICENSE`.

Arquivos adaptados: `backend/services/supoclip/document.py`, `face_detection.py`, `tracking.py` e auxiliares de legenda de `support.py`. A seleção global adapta a ideia de janelas sobrepostas e comparação de candidatos ao provedor e aos contratos já existentes no Decupa. A integração de API, SQLite, jobs e interface fica nos módulos próprios do Decupa.

O modelo YuNet incluído preserva seu aviso em `backend/services/supoclip/models/LICENSE-yunet`. Os avisos das fontes e dos demais componentes permanecem junto aos arquivos originais.

O código correspondente desta versão é oferecido na página Sobre e código-fonte. O pacote exclui chaves de API, bancos e dados pessoais.
