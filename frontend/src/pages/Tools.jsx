import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Box, Typography, Stack, CardActionArea, Divider, TextField, InputAdornment } from "@mui/material"
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined"
import useDocumentTitle from "../hooks/useDocumentTitle"
import PageHero from "../components/PageHero"
import { alpha } from "@mui/material/styles"
import { GlassCard } from "../utils/glassFx"
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined"
import SubtitlesOutlinedIcon from "@mui/icons-material/SubtitlesOutlined"
import AspectRatioOutlinedIcon from "@mui/icons-material/AspectRatioOutlined"
import GraphicEqOutlinedIcon from "@mui/icons-material/GraphicEqOutlined"
import BrandingWatermarkOutlinedIcon from "@mui/icons-material/BrandingWatermarkOutlined"
import FastRewindOutlinedIcon from "@mui/icons-material/FastRewindOutlined"
import RecordVoiceOverOutlinedIcon from "@mui/icons-material/RecordVoiceOverOutlined"
import GraphicEqIcon from "@mui/icons-material/GraphicEq"
import TransformIcon from "@mui/icons-material/Transform"
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined"
import TranslateOutlinedIcon from "@mui/icons-material/TranslateOutlined"
import MovieFilterOutlinedIcon from "@mui/icons-material/MovieFilterOutlined"
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined"
import HeadphonesOutlinedIcon from "@mui/icons-material/HeadphonesOutlined"
import ClosedCaptionOutlinedIcon from "@mui/icons-material/ClosedCaptionOutlined"
import GifOutlinedIcon from "@mui/icons-material/GifOutlined"
import SpeedOutlinedIcon from "@mui/icons-material/SpeedOutlined"
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined"
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered"
import ContentCutOutlinedIcon from "@mui/icons-material/ContentCutOutlined"
import ZoomInMapOutlinedIcon from "@mui/icons-material/ZoomInMapOutlined"
import CompressOutlinedIcon from "@mui/icons-material/CompressOutlined"
import CropOutlinedIcon from "@mui/icons-material/CropOutlined"
import VolumeOffOutlinedIcon from "@mui/icons-material/VolumeOffOutlined"
import DownloadForOfflineOutlinedIcon from "@mui/icons-material/DownloadForOfflineOutlined"
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined"

// ── Catalog ────────────────────────────────────────────────────────────────
//
// Each tool has a `category` that maps into the CATEGORIES array below.
// The open-source build ships the local FFmpeg / Whisper / Edge-TTS tools;
// media-generation tools (AI image / music / video / SFX / thumbnail) are
// not part of this build since they require external media-gen providers.

const TOOLS = [
  // Video — visual / structural edits
  {
    id: "video-download",
    title: "Download de Vídeo",
    description: "Cole um link e baixe o vídeo , escolha a qualidade, mantenha ou incorpore as legendas.",
    icon: <DownloadForOfflineOutlinedIcon />,
    category: "video",
  },
  {
    id: "merge-clips",
    title: "Mesclar Clipes",
    description: "Junte vários clipes em um único vídeo. Recorte automaticamente para a proporção desejada.",
    icon: <MovieFilterOutlinedIcon />,
    category: "video",
  },
  {
    id: "transform",
    title: "Transformar",
    description: "Inverta, rotacione, repita ou altere o volume de um clipe.",
    icon: <TransformIcon />,
    category: "video",
  },
  {
    // One runner, one job type, one history — but its own card, because
    // "remove audio" is what people search for, not "transform".
    id: "remove-audio",
    title: "Remover Áudio",
    description: "Remova o som de um vídeo e mantenha a imagem intacta.",
    icon: <VolumeOffOutlinedIcon />,
    category: "audio",
    route: "/tools/transform?op=mute",
  },
  {
    id: "compress",
    title: "Comprimir Vídeo",
    description: "Reduza um arquivo para e-mail, chat ou limite de upload. Escolha um tamanho e uma intensidade.",
    icon: <CompressOutlinedIcon />,
    category: "video",
  },
  {
    id: "crop",
    title: "Recortar Vídeo",
    description: "Arraste uma caixa sobre o quadro e mantenha apenas essa parte. Formato livre ou fixo.",
    icon: <CropOutlinedIcon />,
    category: "video",
  },
  {
    id: "reframe",
    title: "Reenquadrar para Vertical",
    description: "Converta 16:9 para 9:16 com rastreamento facial para Shorts/TikTok.",
    icon: <AspectRatioOutlinedIcon />,
    category: "video",
  },
  {
    id: "watermark",
    title: "Adicionar Marca d'Água",
    description: "Marque cada exportação com seu logo. Posição, opacidade, tamanho.",
    icon: <BrandingWatermarkOutlinedIcon />,
    category: "video",
  },
  {
    id: "gif",
    title: "Vídeo → GIF",
    description: "Converta qualquer clipe em um GIF animado. Paleta de duas passagens para cores limpas.",
    icon: <GifOutlinedIcon />,
    category: "video",
  },
  {
    id: "speed",
    title: "Acelerar / Desacelerar",
    description: "Reajuste um vídeo de 0,25× a 4×, com preservação opcional de tom.",
    icon: <SpeedOutlinedIcon />,
    category: "video",
  },
  {
    id: "trim",
    title: "Aparar / Cortar",
    description: "Mantenha apenas a parte que você quer: defina início e fim, descarte o resto.",
    icon: <ContentCutOutlinedIcon />,
    category: "video",
  },
  {
    id: "auto-zoom",
    title: "Auto-Zoom",
    description: "Zoom sutil de aproximação nas palavras faladas para mais energia.",
    icon: <ZoomInMapOutlinedIcon />,
    category: "video",
  },

  // Audio — cleanup / processing / voice
  {
    id: "voiceover",
    title: "Gerador de Locução",
    description: "Transforme um roteiro em áudio TTS natural.",
    icon: <RecordVoiceOverOutlinedIcon />,
    category: "audio",
  },
  {
    id: "audio-enhance",
    title: "Melhorar Áudio",
    description: "Remova chiados, normalize o volume, refine a fala.",
    icon: <GraphicEqOutlinedIcon />,
    category: "audio",
  },
  {
    id: "remove-silence",
    title: "Removedor de Silêncio",
    description: "Corte pausas, muletas e silêncios automaticamente.",
    icon: <FastRewindOutlinedIcon />,
    category: "audio",
  },
  {
    id: "music-visualizer",
    title: "Visualizador de Música",
    description: "Áudio → vídeo animado com forma de onda / barras / espectro, sincronizado com o som.",
    icon: <GraphicEqIcon />,
    category: "audio",
  },

  // Subtitles & Insights — text overlays + analysis
  {
    id: "captions",
    title: "Adicionar Legendas",
    description: "Incorpore legendas palavra por palavra. Estilos viral, clássico ou bold.",
    icon: <SubtitlesOutlinedIcon />,
    category: "subtitles",
  },
  {
    id: "subtitles",
    title: "Exportar Legendas",
    description: "Transcreva para um arquivo .srt / .vtt baixável ou transcrição simples.",
    icon: <ClosedCaptionOutlinedIcon />,
    category: "subtitles",
  },
  {
    id: "transcript",
    title: "Baixador de Transcrição",
    description: "Cole um link e pegue as legendas que ele já tem como .txt / .srt / .vtt, sem transcrever.",
    icon: <ArticleOutlinedIcon />,
    category: "subtitles",
  },
  {
    id: "translate",
    title: "Traduzir + Dublar",
    description: "Traduza legendas para 19+ idiomas ou duble o áudio por completo.",
    icon: <TranslateOutlinedIcon />,
    category: "subtitles",
  },
  {
    id: "hook-analysis",
    title: "Detector de Gancho",
    description: "Pontue os primeiros 10s de qualquer vídeo e receba aberturas mais fortes alternativas.",
    icon: <LightbulbOutlinedIcon />,
    category: "subtitles",
  },
  {
    id: "metadata",
    title: "Título / Tags / Descrição",
    description: "Metadados de SEO para qualquer vídeo, transcrição ou tópico, prontos para YT + TikTok.",
    icon: <LabelOutlinedIcon />,
    category: "subtitles",
  },
  {
    id: "auto-chapters",
    title: "Capítulos Automáticos",
    description: "Marcadores de capítulo do YouTube gerados por IA a partir do seu vídeo longo.",
    icon: <FormatListNumberedIcon />,
    category: "subtitles",
  },
]

// ── Category metadata ──────────────────────────────────────────────────────
//
// `accent` keys map to MUI theme palette slots — used for the section
// header's icon background tint and the colored left-border on each card,
// so each section reads at a glance even when scrolling fast.

const CATEGORIES = [
  {
    id: "video",
    label: "Vídeo",
    description: "Edições visuais e estruturais em filmagens finalizadas.",
    icon: <VideocamOutlinedIcon />,
    accent: "info",
  },
  {
    id: "audio",
    label: "Áudio",
    description: "Voz, limpeza e polimento da trilha sonora.",
    icon: <HeadphonesOutlinedIcon />,
    accent: "success",
  },
  {
    id: "subtitles",
    label: "Legendas e Insights",
    description: "Legendas, tradução e sobreposições de análise.",
    icon: <ClosedCaptionOutlinedIcon />,
    accent: "warning",
  },
]

// ── Components ─────────────────────────────────────────────────────────────

function ToolCard({ tool, onClick }) {
  return (
    <GlassCard sx={{ borderRadius: 2 }}>
      <CardActionArea
        onClick={onClick}
        sx={{
          p: 1.25,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 0.5, width: "100%" }}>
          <Box sx={{ color: "primary.main", display: "flex", "& svg": { fontSize: 22 } }}>
            {tool.icon}
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.9rem", flex: 1 }}>
            {tool.title}
          </Typography>
        </Stack>
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            lineHeight: 1.4,
            fontSize: "0.78rem",
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            overflow: "hidden",
          }}
        >
          {tool.description}
        </Typography>
      </CardActionArea>
    </GlassCard>
  )
}

function CategorySection({ category, tools, onPick }) {
  return (
    <Box sx={{ mb: 2 }}>
      {/* Section header */}
      <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 1, px: 0.5 }}>
        <Box sx={{
          width: 32, height: 32,
          borderRadius: 1.25,
          display: "flex", alignItems: "center", justifyContent: "center",
          bgcolor: (t) => alpha(t.palette[category.accent].main, t.palette.mode === "dark" ? 0.22 : 0.13),
          color: `${category.accent}.main`,
          "& svg": { fontSize: 20 },
        }}>
          {category.icon}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="baseline" spacing={1}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, letterSpacing: -0.2 }}>
              {category.label}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.disabled", fontWeight: 600 }}>
              {tools.length}
            </Typography>
          </Stack>
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block", lineHeight: 1.3 }}>
            {category.description}
          </Typography>
        </Box>
      </Stack>

      {/* Grid */}
      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, 1fr)",
            md: "repeat(3, 1fr)",
            lg: "repeat(3, 1fr)",
          },
        }}
      >
        {tools.map((t) => (
          <ToolCard key={t.id} tool={t} onClick={() => onPick(t.id)} />
        ))}
      </Box>
    </Box>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function Tools() {
  useDocumentTitle("Ferramentas")
  const navigate = useNavigate()
  const pick = (id) => {
    const tool = TOOLS.find((t) => t.id === id)
    navigate(tool?.route || `/tools/${id}`)
  }

  // Hub search — a flat ranked result grid when a query is present, else the
  // categorized layout (title/description/id all match against the query).
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()
  const matches = q
    ? TOOLS.filter((t) => [t.title, t.description, t.id].some((s) => (s || "").toLowerCase().includes(q)))
    : null

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHero
        icon={<BuildOutlinedIcon sx={{ fontSize: 22 }} />}
        title={"Ferramentas"}
        subtitle={"Utilitários de propósito único para refinar vídeos finalizados"}
      />

      {/* Body */}
      <Box sx={{ flex: 1, overflow: "auto", p: { xs: 2, md: 3 } }}>
        <Box sx={{ maxWidth: 1280, mx: "auto" }}>

          {/* Search */}
          <TextField
            fullWidth
            size="small"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={"Ferramentas de busca , ex.: legenda, reenquadramento, velocidade, tradução…"}
            sx={{ mb: 2.5 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlinedIcon fontSize="small" sx={{ color: "text.secondary" }} />
                  </InputAdornment>
                ),
              },
            }}
          />

          {matches ? (
            /* Flat search results */
            matches.length ? (
              <Box>
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1.5 }}>
                  {matches.length} {matches.length === 1 ? "ferramenta" : "ferramentas"} correspondente a “{query.trim()}”
                </Typography>
                <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" } }}>
                  {matches.map((t) => (
                    <ToolCard key={t.id} tool={t} onClick={() => pick(t.id)} />
                  ))}
                </Box>
              </Box>
            ) : (
              <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "center", py: 6 }}>
                Nenhuma ferramenta corresponde a “{query.trim()}”. Tente “legenda”, “áudio”, “velocidade” ou “tradução”.
              </Typography>
            )
          ) : (
            <>
              {/* Categories */}
              {CATEGORIES.map((cat, i) => {
                const tools = TOOLS.filter((t) => t.category === cat.id)
                if (!tools.length) return null
                return (
                  <Box key={cat.id}>
                    <CategorySection category={cat} tools={tools} onPick={pick} />
                    {i < CATEGORIES.length - 1 && (
                      <Divider sx={{ mb: 2, opacity: 0.5 }} />
                    )}
                  </Box>
                )
              })}
            </>
          )}
        </Box>
      </Box>
    </Box>
  )
}
