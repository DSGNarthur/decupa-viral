// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2025-2026 ViralMint Contributors
/**
 * Shared caption + emoji enums for the tool pages and Clip Studio.
 *
 * The VALUES are the contract: they must match the keys of
 * backend/services/caption_service.py CAPTION_STYLES, minus `brainrot` (a look
 * applied by its own pipeline, not a general preset).
 * tests/test_caption_styles_parity.py fails if the two drift.
 *
 * They drifted once already: this list and the /api/tools/captions Literal
 * were both pinned to the original three, so the Captions tool offered 3 of
 * 10 styles — neon, karaoke, glow, urban, warm and mono were unreachable from
 * the tool built to apply them.
 *
 * Descriptions summarize the real render params (highlight colour, font,
 * words_per_group) rather than being decorative.
 */
export const CAPTION_STYLES = [
  { value: "viral", label: "Viral", description: "Destaque amarelo, frases de ~6 palavras" },
  { value: "classic", label: "Clássico", description: "Frase completa, sem destaque" },
  { value: "bold", label: "Negrito", description: "Destaque verde, frases de ~4 palavras" },
  { value: "neon", label: "Neon", description: "Texto rosa, fundo amarelo, cerca de 6 palavras" },
  { value: "minimal", label: "Mínimo", description: "Arial simples, linhas longas, sem destaque" },
  { value: "karaoke", label: "Karaokê", description: "Texto cinza acende palavra por palavra" },
  { value: "glow", label: "Brilho", description: "Brilho laranja suave, frases de cerca de 6 palavras" },
  { value: "urban", label: "Urban Negrito", description: "Arial Black, rajadas impactantes de cerca de 3 palavras" },
  { value: "warm", label: "Brilho Quente", description: "Georgia serifada, tom creme quente" },
  { value: "mono", label: "Monocromático", description: "Verdana, destaque cinza, discreto" },
]

export const EMOJI_LEVELS = [
  { value: "none", label: "Nenhum" },
  { value: "minimal", label: "Mínimo" },
  { value: "moderate", label: "Moderado" },
  { value: "heavy", label: "Intenso" },
]
