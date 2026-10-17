// Decupa UI localization for the original HyperFrames Studio.
// Translates presentation only. Never rewrites composition HTML, code or inputs.
(() => {
  const labels = {
    'HyperFrames Studio': 'Estúdio de animações',
    'Studio view': 'Visualização do estúdio',
    'Storyboard': 'Cenas', 'Preview': 'Prévia', 'Undo': 'Desfazer', 'Redo': 'Refazer',
    'Capture': 'Capturar', 'Capture current frame': 'Capturar quadro atual',
    'Inspector': 'Inspetor', 'Export': 'Exportar', 'Code': 'Código',
    'Comps': 'Composições', 'Assets': 'Arquivos', 'Catalog': 'Catálogo',
    'Hide sidebar': 'Ocultar painel lateral', 'Show sidebar': 'Mostrar painel lateral',
    'Lint': 'Verificação', 'Design': 'Aparência', 'Layers': 'Camadas',
    'Renders': 'Renderizações', 'Variables': 'Variáveis', 'Nothing selected': 'Nenhum elemento selecionado',
    'Click any element on the canvas to edit it, or drag to select several.': 'Clique em um elemento para editar ou arraste para selecionar vários.',
    'Record a gesture': 'Gravar um gesto', 'Describe a change to the agent': 'Descrever uma alteração para a IA',
    'Composition preview': 'Prévia da composição', 'Composition canvas': 'Área da composição',
    'HyperFrames Composition': 'Composição animada',
    'Play': 'Reproduzir', 'Pause': 'Pausar', 'Fit': 'Ajustar',
    'Zoom out': 'Diminuir zoom', 'Zoom in': 'Aumentar zoom', 'Timeline': 'Linha do tempo',
    'Timeline tracks': 'Faixas da linha do tempo', 'Timeline zoom': 'Zoom da linha do tempo',
    'Timeline zoom level': 'Nível de zoom da linha do tempo',
    'Preview volume': 'Volume da prévia', 'Mute audio': 'Silenciar áudio',
    'Enter fullscreen': 'Tela cheia', 'Exit fullscreen': 'Sair da tela cheia',
    'Enable loop playback': 'Repetir reprodução', 'Shortcuts and tools': 'Atalhos e ferramentas',
    'Toggle snap': 'Alternar encaixe', 'Toggle grid': 'Alternar grade',
    'Selection tool': 'Ferramenta de seleção', 'Razor tool': 'Ferramenta de corte',
    'Toggle timeline snapping': 'Alternar encaixe na linha do tempo',
    'Add keyframe at playhead': 'Adicionar quadro-chave no cursor',
    'Auto-record manual edits as keyframes': 'Gravar edições como quadros-chave',
    'Split at playhead': 'Dividir no cursor', 'Add beat at playhead': 'Adicionar batida no cursor',
    'Hide thumbnails — labels only': 'Ocultar miniaturas e mostrar nomes',
    'Show thumbnails': 'Mostrar miniaturas',
    'Drop media here or describe your video to start': 'Arraste arquivos ou descreva seu vídeo para começar',
    'Position': 'Posição', 'Rotation': 'Rotação', 'Scale': 'Escala', 'Opacity': 'Opacidade',
    'Width': 'Largura', 'Height': 'Altura', 'Size': 'Tamanho', 'Color': 'Cor',
    'Background': 'Fundo', 'Text': 'Texto', 'Font': 'Fonte', 'Font size': 'Tamanho da fonte',
    'Font family': 'Família da fonte', 'Font weight': 'Peso da fonte',
    'Letter spacing': 'Espaçamento entre letras', 'Line height': 'Altura da linha',
    'Alignment': 'Alinhamento', 'Left': 'Esquerda', 'Right': 'Direita', 'Center': 'Centro',
    'Top': 'Acima', 'Bottom': 'Abaixo', 'Middle': 'Meio', 'Duration': 'Duração',
    'Start': 'Início', 'End': 'Fim', 'Properties': 'Propriedades', 'Transform': 'Transformar',
    'Effects': 'Efeitos', 'Border': 'Borda', 'Radius': 'Raio', 'Shadow': 'Sombra',
    'Blur': 'Desfoque', 'Fill': 'Preenchimento', 'Stroke': 'Contorno',
    'Upload': 'Importar', 'Upload files': 'Importar arquivos', 'Import': 'Importar',
    'Search': 'Buscar', 'Search assets': 'Buscar arquivos', 'Search catalog': 'Buscar no catálogo',
    'All': 'Todos', 'Video': 'Vídeo', 'Audio': 'Áudio', 'Images': 'Imagens',
    'Image': 'Imagem', 'Videos': 'Vídeos', 'Fonts': 'Fontes',
    'Delete': 'Excluir', 'Remove': 'Remover', 'Duplicate': 'Duplicar',
    'Rename': 'Renomear', 'Reset': 'Redefinir', 'Apply': 'Aplicar', 'Save': 'Salvar',
    'Cancel': 'Cancelar', 'Close': 'Fechar', 'Done': 'Concluído',
    'Download': 'Baixar', 'Render': 'Renderizar', 'Rendering': 'Renderizando',
    'Render video': 'Renderizar vídeo', 'Export video': 'Exportar vídeo',
    'Resolution': 'Resolução', 'Quality': 'Qualidade', 'Format': 'Formato',
    'Frame rate': 'Taxa de quadros', 'Output': 'Saída', 'Output file': 'Arquivo de saída',
    'High': 'Alta', 'Medium': 'Média', 'Low': 'Baixa', 'Standard': 'Padrão',
    'Advanced': 'Avançado', 'Settings': 'Configurações', 'No renders yet': 'Nenhuma renderização ainda',
    'No assets yet': 'Nenhum arquivo ainda', 'Loading...': 'Carregando...',
    'Loading…': 'Carregando…', 'Retry': 'Tentar novamente',
    'Switch to time display': 'Mostrar tempo', 'Switch to frame display': 'Mostrar quadros',
    'Resize sidebar': 'Redimensionar painel lateral',
    'Resize inspector panel': 'Redimensionar inspetor',
    'Resize timeline (arrow keys)': 'Redimensionar linha do tempo (setas)',
    'Headline': 'Título', 'Subtitle': 'Subtítulo', 'Accent': 'Destaque',
    'Snap enabled (S)': 'Encaixe ativado (S)', 'Snap disabled (S)': 'Encaixe desativado (S)',
    'Grid hidden (G)': 'Grade oculta (G)', 'Grid visible (G)': 'Grade visível (G)',
    'Collapse keyframe lanes': 'Recolher faixas de quadros-chave',
    'keyframes': 'quadros-chave', 'keyframes,': 'quadros-chave,',
    'ease controls': 'controles de interpolação',
    'scale': 'escala', 'position': 'posição', 'rotation': 'rotação',
    'Dismiss': 'Fechar', 'Connecting to project…': 'Conectando ao projeto…',
    'Loading composition…': 'Carregando composição…',
    'No compositions found': 'Nenhuma composição encontrada',
    'Rendering…': 'Renderizando…', 'Rendering...': 'Renderizando…',
    'Draft': 'Rascunho', 'High Quality': 'Alta qualidade',
    'About video formats': 'Sobre os formatos de vídeo',
    'Starting frame capture': 'Iniciando captura dos quadros',
    'Capturing frames': 'Capturando quadros', 'Encoding video': 'Codificando vídeo',
    'Completed': 'Concluído', 'Queued': 'Na fila', 'Failed': 'Falhou',
    'Open file': 'Abrir arquivo', 'Open folder': 'Abrir pasta',
  }
  const translate = (raw) => {
    const s = raw.trim()
    let value = labels[s]
    if (!value) {
      const rules = [
        [/^Render progress: ([\d.]+)%$/, 'Progresso da renderização: $1%'],
        [/^Renders \((\d+)\)$/, 'Renderizações ($1)'],
        [/^Select off-canvas element (.+)$/, 'Selecionar elemento fora da área: $1'],
        [/^Capturing frame (\d+)\/(\d+) \((\d+) workers\)$/, 'Capturando quadro $1/$2 ($3 processos)'],
        [/^Completed in (.+)$/, 'Concluído em $1'],
        [/^Add (.+) to timeline at playhead$/, 'Adicionar $1 à linha do tempo no cursor'],
        [/^Render (.+)$/, 'Renderizar $1'],
        [/^Hide track (\d+)$/, 'Ocultar faixa $1'],
        [/^Show track (\d+)$/, 'Mostrar faixa $1'],
        [/^Collapse (.+) keyframes$/, 'Recolher quadros-chave de $1'],
        [/^Expand (.+) keyframes$/, 'Expandir quadros-chave de $1'],
        [/^Previous (.+) keyframe$/, 'Quadro-chave anterior: $1'],
        [/^Next (.+) keyframe$/, 'Próximo quadro-chave: $1'],
        [/^Add (.+) keyframe$/, 'Adicionar quadro-chave: $1'],
        [/^Remove (.+) keyframe$/, 'Remover quadro-chave: $1'],
        [/^(.+) keyframes$/, 'Quadros-chave: $1'],
        [/^(.+) keyframe at (.+)s$/, 'Quadro-chave de $1 em $2s'],
        [/^Edit (.+) easing after (.+)s$/, 'Editar interpolação $1 após $2s'],
        [/^Edit (.+) easing$/, 'Editar interpolação $1'],
        [/^(.+), ([\d.]+) to ([\d.]+) seconds$/, '$1, $2 a $3 segundos'],
        [/^(.+) • ([\d.]+)s – ([\d.]+)s$/, '$1, $2 a $3 segundos'],
        [/^Lint (\d+)$/, 'Verificação $1'],
      ]
      for (const [pattern, replacement] of rules) {
        if (pattern.test(s)) { value = s.replace(pattern, replacement); break }
      }
    }
    if (value) {
      value = value.replace(/\b(Scale|Position|Rotation)\b/g, term => labels[term] || term)
      return raw.replace(s, value)
    }
    return raw
      .replace(/(<[^>]+>) has `pointer-events: none` in its inline style\. Elements with this property are harder to select in the Studio preview\./g,
        '$1 usa pointer-events: none no estilo. Esse elemento pode ser mais difícil de selecionar na prévia.')
      .replace(/GSAP tweens overlap on "([^"]+)" for (.+?) between ([\d.]+)s and ([\d.]+)s\./g,
        'As animações GSAP de $2 em "$1" se sobrepõem entre $3s e $4s.')
      .replace('Font families will be substituted at render time:', 'As fontes serão substituídas na renderização:')
      .replace('The renderer maps these to bundled fonts for cross-platform consistency.', 'O renderizador usa as fontes incluídas para manter o resultado entre sistemas.')
      .replace('Use the target font name directly for consistent preview and render results.', 'Use o nome da fonte de destino para manter a prévia e a renderização iguais.')
      .replace('Composition insertion would create a cycle', 'Adicionar esta composição criaria uma referência circular')
      .replace('Failed to add composition to timeline', 'Não foi possível adicionar a composição à linha do tempo')
  }
  const excluded = 'script,style,textarea,pre,code,[contenteditable="true"],.monaco-editor,.cm-editor'
  const visit = (root) => {
    if (!root || root.nodeType !== Node.ELEMENT_NODE || root.closest(excluded)) return
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest(excluded)) continue
      const value = translate(node.nodeValue)
      if (value !== node.nodeValue) node.nodeValue = value
    }
    for (const el of [root, ...root.querySelectorAll('[title],[aria-label],[placeholder]')]) {
      if (el.closest(excluded)) continue
      for (const attr of ['title', 'aria-label', 'placeholder']) {
        const raw = el.getAttribute(attr)
        if (raw && translate(raw) !== raw) el.setAttribute(attr, translate(raw))
      }
    }
  }
  const start = () => {
    document.documentElement.lang = 'pt-BR'
    document.title = 'Estúdio de animações | Decupa Viral'
    visit(document.body)
    const pending = new Set()
    let scheduled = false
    new MutationObserver((changes) => {
      for (const change of changes) {
        const el = change.target.nodeType === Node.TEXT_NODE ? change.target.parentElement : change.target
        if (el && !el.closest(excluded)) pending.add(el)
      }
      if (!pending.size || scheduled) return
      scheduled = true
      requestAnimationFrame(() => {
        scheduled = false
        for (const el of pending) visit(el)
        pending.clear()
      })
    }).observe(document.body, { childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['title', 'aria-label', 'placeholder'] })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
})()
