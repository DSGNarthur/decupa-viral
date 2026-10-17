import axios from "axios"
import { pcSession } from '../companion/session'

const http = axios.create({
  baseURL: window.location.origin,  // works for both dev (localhost:16888) and packaged Electron app
  timeout: 30000,
})
if (import.meta.env.VITE_COMPANION_RUNTIME === 'true') {
  http.interceptors.request.use(config => {
    const pc = pcSession()
    if (!pc) throw new Error('Conecte o aplicativo deste PC antes de continuar.')
    config.baseURL = pc.origin
    config.headers.Authorization = 'Bearer ' + pc.token
    config.adapter = 'fetch'
    config.fetchOptions = { ...config.fetchOptions, targetAddressSpace: 'loopback' }
    return config
  })
}

if (import.meta.env.VITE_BROWSER_RUNTIME === 'true') {
  http.defaults.adapter = async config => {
    try {
      const { handleRequest } = await import('../browser/runtime')
      const data = await handleRequest(config)
      return { data, status: 200, statusText: 'OK', headers: {}, config }
    } catch (error) {
      if (!error.response) error.response = { status: 400, data: { detail: error.message || 'Não foi possível concluir a operação.' }, config }
      throw error
    }
  }
}

http.interceptors.response.use(
  res => res,
  err => {
    console.error("API error:", err.response?.data || err.message)
    return Promise.reject(err)
  }
)

export default http
