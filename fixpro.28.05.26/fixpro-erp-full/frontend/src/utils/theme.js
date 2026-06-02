// ── Theme & Language utilities ────────────────────────────

const LIGHT_VARS = {
  '--ink':     '#F8FAFC',
  '--ink-2':   '#FFFFFF',
  '--ink-3':   '#F1F5F9',
  '--ink-4':   '#E2E8F0',
  '--border':  '#E2E8F0',
  '--border-2':'#CBD5E1',
  '--muted':   '#94A3B8',
  '--muted-2': '#64748B',
  '--text':    '#334155',
  '--text-2':  '#0F172A',
  '--white':   '#0F172A',
}

const DARK_VARS = {
  '--ink':     '#0E1117',
  '--ink-2':   '#1A2030',
  '--ink-3':   '#242D3D',
  '--ink-4':   '#2E3849',
  '--border':  '#2A3445',
  '--border-2':'#394558',
  '--muted':   '#5A6A82',
  '--muted-2': '#7A8BA3',
  '--text':    '#C8D3E0',
  '--text-2':  '#E8EDF3',
  '--white':   '#F0F4F8',
}

export function applyTheme(theme) {
  const vars = theme === 'light' ? LIGHT_VARS : DARK_VARS
  Object.entries(vars).forEach(([k, v]) => {
    document.documentElement.style.setProperty(k, v)
  })
  localStorage.setItem('theme', theme)
}

export function applyLanguage(lang) {
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  localStorage.setItem('lang', lang)
}

// يُشغَّل مرة واحدة عند تحميل التطبيق
export function initPreferences() {
  const savedTheme = localStorage.getItem('theme') || 'dark'
  const savedLang  = localStorage.getItem('lang')  || 'ar'
  applyTheme(savedTheme)
  applyLanguage(savedLang)
}
