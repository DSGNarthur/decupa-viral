"""Apply the approved monochrome identity, preserving original icon/motion primitives."""
from pathlib import Path
import re
import shutil

root=Path(__file__).resolve().parents[1]
front=root/'frontend'
theme=front/'src/theme.js'
text=theme.read_text(encoding='utf-8')
for old,new in {'201,100,66':'128,128,128','120,95,72':'90,90,90','#141210':'#101012','#1e1c1a':'#1a1a1d','#1a1816':'#161619','#f5f0ea':'#fafafa','#faf6f2':'#f4f4f5','#e8e4df':'#f5f5f6','#2d2b28':'#18181b','#9c9690':'#a6a6af','#6b6560':'#63636c','20,18,16':'16,16,18'}.items():text=text.replace(old,new)
text=text.replace('const P = "#c96442"','const P = isDark ? "#f4f4f5" : "#18181b"')
text=text.replace('primary: { main: P, contrastText: "#fff" }','primary: { main: P, contrastText: isDark ? "#18181b" : "#fff" }')
text=text.replace('background: `linear-gradient(135deg, ${P}, #e88a5a)`','background: P')
text=text.replace('background: `linear-gradient(135deg, #b85838, #d47a4e)`','background: isDark ? "#dedee2" : "#303036"')
text=text.replace('          // Smoother scrollbars','          "@keyframes decupa-panel-in": { from: { opacity: 0, transform: "translateY(10px)" }, to: { opacity: 1, transform: "translateY(0)" } },\n          "@media (prefers-reduced-motion: reduce)": { "*, *::before, *::after": { animation: "none !important", transition: "none !important", scrollBehavior: "auto !important" } },\n          // Smoother scrollbars')
theme.write_text(text,encoding='utf-8')
glass=front/'src/utils/glassFx.jsx'
text=glass.read_text(encoding='utf-8')
for old,new in {'99,179,237':'148,148,155','201,100,66':'148,148,155','120,95,72':'90,90,95','255,251,245':'255,255,255','250,243,234':'244,244,246'}.items():text=text.replace(old,new)
glass.write_text(text,encoding='utf-8')

layout=front/'src/components/Layout.jsx'
text=layout.read_text(encoding='utf-8')
start=text.index('          <Box\n            component="img"')
end=text.index('\n        </Box>',start)
text=text[:start]+'''          {collapsed && !isNarrow ? <ContentCutIcon sx={{ fontSize: 28 }} /> : <Box component="img" src="/decupa-logo.png" alt="Decupa" sx={{ width: 164, maxWidth: "100%", filter: theme.palette.mode === "dark" ? "invert(1)" : "none" }} />}'''+text[end:]
text=text.replace('201,100,66','128,128,128')
text=text.replace('      <Box\n        component="main"','      <Box\n        component="main"')
needle='''        {import.meta.env.VITE_BROWSER_RUNTIME !== 'true' && <Alert'''
idx=text.index(needle)
text=text[:idx]+'''        <Box component="header" sx={{ minHeight: 52, px: { xs: 1.5, md: 3 }, display: 'flex', alignItems: 'center', gap: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', flexShrink: 0 }}>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>Meu espaço / {navItems.find(i => location.pathname.startsWith(i.to))?.label || 'Decupa'}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>Processamento no PC</Typography>
          <Tooltip title={theme.palette.mode === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}><IconButton aria-label={theme.palette.mode === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'} onClick={() => { localStorage.setItem('decupa-theme', theme.palette.mode === 'dark' ? 'light' : 'dark'); window.dispatchEvent(new Event('decupa-theme-change')) }}>{theme.palette.mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}</IconButton></Tooltip>
        </Box>
'''+text[idx:]
text=text.replace('background: "linear-gradient(135deg, #0D9F6E, #34D399)",','color: "text.primary",').replace('WebkitTextFillColor: "transparent",','')
layout.write_text(text,encoding='utf-8')
shutil.copy2(root.parent/'Decupa-Evolucao-20261017/identidade/decupa-logo-transparente.png',front/'public/decupa-logo.png')

clip=front/'src/pages/ClipStudio.jsx'
text=clip.read_text(encoding='utf-8').replace('201,100,66','128,128,128').replace('30,28,26','26,26,29')
text=text.replace('display: "flex", alignItems: "center", justifyContent: "space-between",','display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2,')
text=text.replace('<Stack direction="row" spacing={1}>\n          {/* Search */}','<Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>\n          {/* Search */}')
clip.write_text(text,encoding='utf-8')
print('Monochrome theme, original icons and motion primitives preserved; logo applied.')
