import { useState } from 'react'
import { supabase } from './supabase.js'

export default function Auth() {
  const [mode, setMode] = useState('login') // login | register | reset
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null) // {text, type: 'error'|'success'}

  const handle = async () => {
    setLoading(true)
    setMsg(null)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'register') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMsg({ text: 'Registracija uspješna! Provjerite email za potvrdu.', type: 'success' })
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email)
        if (error) throw error
        setMsg({ text: 'Link za reset lozinke poslan na vaš email.', type: 'success' })
      }
    } catch (e) {
      setMsg({ text: e.message, type: 'error' })
    }
    setLoading(false)
  }

  const inp = {
    width: '100%', border: '1px solid #D8D5CC', borderRadius: 8,
    padding: '10px 14px', fontSize: 14, fontFamily: 'inherit',
    background: '#F5F4F0', marginBottom: 10
  }

  return (
    <div style={{ minHeight: '100vh', background: '#C7C7C4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 36, width: 380, boxShadow: '0 4px 24px rgba(0,0,0,0.10)' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📐</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1B2F43' }}>Predmjer / Troškovnik</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            {mode === 'login' && 'Prijavite se na vaš nalog'}
            {mode === 'register' && 'Kreirajte besplatan nalog'}
            {mode === 'reset' && 'Resetujte lozinku'}
          </div>
        </div>

        {/* Form */}
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Email adresa</div>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="vas@email.com" style={inp}
            onKeyDown={e => e.key === 'Enter' && handle()} />

          {mode !== 'reset' && (
            <>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Lozinka</div>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" style={inp}
                onKeyDown={e => e.key === 'Enter' && handle()} />
            </>
          )}

          {msg && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13,
              background: msg.type === 'error' ? '#fdf0ef' : '#E8ECF0',
              color: msg.type === 'error' ? '#C0392B' : '#1B2F43',
              border: `1px solid ${msg.type === 'error' ? '#f5c6c2' : '#A8BED5'}`
            }}>{msg.text}</div>
          )}

          <button onClick={handle} disabled={loading}
            style={{
              width: '100%', background: '#1B2F43', color: '#fff', border: 'none',
              borderRadius: 8, padding: '11px 0', fontSize: 14, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              opacity: loading ? 0.7 : 1, marginBottom: 14
            }}>
            {loading ? 'Molimo sačekajte...' : (
              mode === 'login' ? 'Prijava' :
              mode === 'register' ? 'Registracija' : 'Pošalji link'
            )}
          </button>

          {/* Links */}
          <div style={{ textAlign: 'center', fontSize: 13, color: '#666' }}>
            {mode === 'login' && <>
              <span>Nemate nalog? </span>
              <button onClick={() => { setMode('register'); setMsg(null); }}
                style={{ color: '#1B2F43', fontWeight: 700, border: 'none', background: 'none', cursor: 'pointer', fontSize: 13 }}>
                Registrujte se
              </button>
              <div style={{ marginTop: 8 }}>
                <button onClick={() => { setMode('reset'); setMsg(null); }}
                  style={{ color: '#888', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12 }}>
                  Zaboravili ste lozinku?
                </button>
              </div>
            </>}
            {mode === 'register' && <>
              <span>Već imate nalog? </span>
              <button onClick={() => { setMode('login'); setMsg(null); }}
                style={{ color: '#1B2F43', fontWeight: 700, border: 'none', background: 'none', cursor: 'pointer', fontSize: 13 }}>
                Prijavite se
              </button>
            </>}
            {mode === 'reset' && (
              <button onClick={() => { setMode('login'); setMsg(null); }}
                style={{ color: '#1B2F43', fontWeight: 700, border: 'none', background: 'none', cursor: 'pointer', fontSize: 13 }}>
                ← Nazad na prijavu
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
