// Translate the native engine's progress messages at the presentation boundary.
export function jobStep(value = '') {
  const labels = {
    'Done': 'Concluído', 'Processing...': 'Processando…',
    'Transcribing audio...': 'Transcrevendo áudio…',
    'Burning captions into video...': 'Aplicando legendas ao vídeo…',
    'Denoising + normalizing audio...': 'Removendo ruído e normalizando o áudio…',
    'Applying watermark...': "Aplicando marca d'água…",
    'Detecting silence...': 'Detectando silêncio…',
    'Probing clip dimensions...': 'Conferindo dimensões dos clipes…',
    'Transcribing source audio...': 'Transcrevendo áudio original…',
    'Burning translated captions...': 'Aplicando legendas traduzidas…',
    'Extracting opening audio...': 'Extraindo áudio da abertura…',
    'Transcribing opening audio...': 'Transcrevendo a abertura…',
    'Asking AI to score the hook...': 'A IA está avaliando o gancho…',
    'Rendering visualizer...': 'Renderizando o visualizador…',
    'Building color palette...': 'Criando paleta de cores…',
    'Encoding GIF...': 'Gerando GIF…',
    'Generating metadata...': 'Gerando metadados…',
    'Transcribing audio (~30-60s on CPU)...': 'Transcrevendo áudio no PC…',
    'Clustering chapters...': 'Organizando capítulos…',
    'Trimming...': 'Cortando…', 'Compressing...': 'Comprimindo…', 'Cropping...': 'Recortando a imagem…',
    'Looking for captions…': 'Procurando legendas…', 'Reading cues…': 'Lendo legendas…',
    'Source already vertical...': 'O vídeo já está na vertical…',
    'Reframing to 9:16 (blur-fill)...': 'Reenquadrando para 9:16 com fundo desfocado…',
    'Generating dubbed voiceover (Edge TTS)...': 'Gerando dublagem…',
    'Muxing audio onto video...': 'Unindo áudio e vídeo…',
    'Overlaying voice on video...': 'Aplicando narração ao vídeo…',
    'Designing the composition': 'Criando a composição',
    'Fixing what the renderer rejected': 'Corrigindo os pontos indicados pelo renderizador',
    'Opening it in the studio': 'Abrindo no estúdio',
  }
  if (!value) return ''
  if (labels[value]) return labels[value]
  return value
    .replace(/^Generating (.+) captions\.\.\.$/, 'Gerando legendas no estilo $1…')
    .replace(/^Cutting (\d+) silent gaps\.\.\.$/, 'Removendo $1 trechos de silêncio…')
    .replace(/^Stitching (\d+) clips\.\.\.$/, 'Unindo $1 clipes…')
    .replace(/^Translating (\d+) segments\.\.\.$/, 'Traduzindo $1 trechos…')
    .replace(/^Generating voice \((.+)\)\.\.\.$/, 'Gerando narração ($1)…')
    .replace(/^Re-encoding at (.+)x speed\.\.\.$/, 'Gerando vídeo na velocidade $1x…')
    .replace(/^Writing \.(\w+)(?:\.\.\.|…)$/, 'Salvando arquivo .$1…')
    .replace(/^Applying zoom pulses to (\d+) words\.\.\.$/, 'Aplicando zoom em $1 palavras…')
    .replace(/^Cropping clip (\d+)\/(\d+) to (.+)\.\.\.$/, 'Reenquadrando clipe $1/$2 para $3…')
    .replace(/^Transcribing ([\d.]+)min audio \(this may take a few minutes\)\.\.\.$/, 'Transcrevendo $1 minutos de áudio. Isso pode levar alguns minutos.')
    .replace(/^Transcribing ([\d.]+)min audio [\u2014\u2013-] (\d+)%$/, 'Transcrevendo $1 minutos de áudio: $2%')
    .replace(/^Loading transcript\.\.\.$/, 'Carregando a transcrição…')
    .replace(/^AI analyzing transcript for viral moments\.\.\.$/, 'A IA está analisando a transcrição para escolher os momentos…')
    .replace(/^Analyzing (\d+) sections of the video in parallel\.\.\.$/, 'Analisando $1 partes do vídeo em paralelo…')
    .replace(/^Processing (\d+) clips \(extracting, captioning, thumbnails\)\.\.\.$/, 'Processando $1 clipes: cortes, legendas e miniaturas…')
    .replace(/^Cutting (\d+) clips from source video\.\.\.$/, 'Cortando $1 clipes do vídeo de origem…')
    .replace(/^Generating thumbnails and metadata\.\.\.$/, 'Gerando miniaturas e informações dos clipes…')
    .replace(/^Finalizing clips\.\.\.$/, 'Finalizando os clipes…')
    .replace(/^Extracted (\d+) clips$/, '$1 clipes concluídos')
    .replace(/^Downloading (\d+)\/(\d+)\.\.\.$/, 'Baixando $1/$2…')
    .replace(/^Downloaded (\d+)\/(\d+) videos.*$/, '$1/$2 vídeos baixados. Abra a Biblioteca para analisar.')
}
