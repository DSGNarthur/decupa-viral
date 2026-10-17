export const maxDuration = 120
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ detail: 'Use POST.' })
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    if (!body?.api_key || typeof body.api_key !== 'string') return res.status(400).json({ detail: 'Configure sua chave da API nas configurações.' })
    const url = new URL(body.base_url || 'https://api.deepseek.com')
    const allowed = new Set(['api.deepseek.com', 'api.openai.com', 'openrouter.ai', 'api.groq.com', 'api.together.xyz'])
    if (url.protocol !== 'https:' || !allowed.has(url.hostname) || url.username || url.password || url.port) return res.status(400).json({ detail: 'Provedor de IA não permitido nesta versão web.' })
    if (!Array.isArray(body.messages) || body.messages.length > 60 || JSON.stringify(body.messages).length > 500000) return res.status(400).json({ detail: 'A solicitação de IA excedeu o limite.' })
    const endpoint = url.href.replace(/\/$/, '') + '/chat/completions'
    const upstream = await fetch(endpoint, {
      method: 'POST', signal: AbortSignal.timeout(110000),
      headers: { Authorization: `Bearer ${body.api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: body.model || 'deepseek-flash', messages: body.messages, max_tokens: Math.min(8192, Math.max(32, Number(body.max_tokens) || 2048)), stream: false, ...(url.hostname === 'api.deepseek.com' ? { thinking: { type: 'disabled' } } : {}) }),
    })
    if (!upstream.ok) {
      const message = upstream.status === 401 ? 'O provedor recusou a chave da API.' : upstream.status === 402 ? 'O provedor informou saldo insuficiente.' : upstream.status === 429 ? 'O provedor atingiu o limite de solicitações. Tente novamente.' : `O provedor retornou o erro ${upstream.status}.`
      return res.status(upstream.status).json({ detail: message })
    }
    const result = await upstream.json()
    if (!result.choices?.[0]?.message?.content?.trim()) return res.status(502).json({ detail: 'A IA retornou uma resposta vazia. Tente novamente com menos conteúdo.' })
    return res.status(200).json({ text: result.choices?.[0]?.message?.content || '', usage: result.usage })
  } catch (error) {
    return res.status(502).json({ detail: error.name === 'TimeoutError' ? 'A resposta da IA demorou além do limite. Tente novamente.' : 'Não foi possível consultar a IA.' })
  }
}
