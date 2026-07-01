export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { system, messages, webSearch = false } = req.body

    const body = {
      model: 'claude-opus-4-5',
      max_tokens: 4000,
      system,
      messages
    }

    // Dodaj web search tool kada AI treba aktuelne cijene
    if (webSearch) {
      body.tools = [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 3
        }
      ]
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify(body)
    })

    const data = await response.json()

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'API greška' })
    }

    // Izvuci samo text blokove (ignorisi tool_use i tool_result blokove)
    const textContent = data.content?.filter(b => b.type === 'text') || []

    return res.status(200).json({ content: textContent })

  } catch (err) {
    console.error('Chat API greška:', err)
    return res.status(500).json({ error: err.message })
  }
}
