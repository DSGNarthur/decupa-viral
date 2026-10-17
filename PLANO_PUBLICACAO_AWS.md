# Publicação do Decupa com base no ViralMint

## Estrutura escolhida

O usuário escolheu processamento na AWS, independente do PC. A Vercel continuará entregando a interface. O backend FastAPI deverá executar continuamente em um serviço separado do worker SQS existente, com disco persistente para SQLite, originais e cortes.

Não basta substituir os arquivos estáticos da Vercel: o aplicativo original depende de tarefas em segundo plano, arquivos locais e WebSocket. Também usa um único usuário lógico `local`, sem o login e isolamento do Decupa atual.

## Servidor conferido em 16/10/2026

Instância `decupa-worker-01`, região `sa-east-1`, Ubuntu 24.04, 4 vCPUs, 8 GB de RAM. Conferência por SSH confirmou worker atual ativo, Python 3.12.3, Node, npm e FFmpeg. Havia aproximadamente 269 GB livres e 6,7 GB de memória disponível no momento da consulta. Docker não foi encontrado. A regra de entrada consultada expõe apenas SSH.

As medidas são instantâneas, não uma garantia de capacidade para tarefas simultâneas. A instalação nova deve limitar concorrência e uso de memória para preservar o worker atual.

## Etapas antes de substituir a produção

1. Instalar uma versão candidata em diretório e ambiente Python próprios, vinculada ao loopback. `deploy/decupa-viralmint.service` prepara os caminhos e limites para systemd; ele ainda não foi instalado nem iniciado no servidor. O Dockerfile é uma alternativa, sem build validado na AWS.
2. Disponibilizar a credencial do DeepSeek somente dentro da AWS. O worker atual já tem um carregador de Secrets Manager para esse fim. A nova aplicação precisa de uma integração própria ou injeção segura na inicialização. Nenhuma chave foi transferida para este PC.
3. Proteger todas as APIs, arquivos e WebSockets. Integrar o login e a lista de acesso do Decupa antes de abrir acesso ao backend. O clone atual ainda não faz isso. Decidir se as contas de teste compartilham o espaço de trabalho ou se haverá migração para `user_id` individuais.
4. Configurar HTTPS e o encaminhamento entre Vercel e backend, incluindo mídia com HTTP Range e o WebSocket do aplicativo. As URLs relativas da interface precisam chegar ao mesmo backend. Não há regra de proxy publicada nesta unidade.
5. Repetir o vídeo fornecido pelo usuário, `https://www.youtube.com/watch?v=bM7TfuoieXY`, no servidor AWS. O download local terminou integralmente com áudio após respostas 403 e 429, usando a alternativa de 360p do motor original. FFprobe registrou 2.255,563 segundos, H.264 e AAC. O pedido era 1080p, portanto a qualidade solicitada não foi atingida. Um corte manual entre 60 e 70 segundos terminou com sucesso. Download e cortes por IA na AWS ainda precisam de evidência própria.
6. Validar transcrição, sugestões da IA, corte vertical, legendas, áudio, persistência após recarga e download do MP4 na versão candidata.
7. Revisar a prévia e realizar a troca da interface publicada com um caminho de retorno para a versão anterior. Não importar o SQLite sobre o banco atual nem desligar o worker existente durante a preparação.

## Licença

Esta versão modificada mantém AGPL-3.0, autoria e a página Sobre e código-fonte. A oferta do código correspondente precisa acompanhar o mesmo código executado no servidor. O fato de o projeto não ser comercial não elimina a obrigação de oferecer as fontes da versão modificada a usuários remotos.
