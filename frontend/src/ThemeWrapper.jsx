import { useMemo, useEffect, useState } from "react"
import { ThemeProvider, useMediaQuery } from "@mui/material"
import createAppTheme from "./theme"

export default function ThemeWrapper({ children }) {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)")
  const [choice, setChoice] = useState(() => localStorage.getItem('decupa-theme') || 'system')
  useEffect(() => {
    const update = () => setChoice(localStorage.getItem('decupa-theme') || 'system')
    window.addEventListener('decupa-theme-change', update)
    window.addEventListener('storage', update)
    return () => { window.removeEventListener('decupa-theme-change', update); window.removeEventListener('storage', update) }
  }, [])
  const mode = choice === 'system' ? (prefersDark ? 'dark' : 'light') : choice
  const theme = useMemo(() => createAppTheme(mode), [mode])

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>
}
