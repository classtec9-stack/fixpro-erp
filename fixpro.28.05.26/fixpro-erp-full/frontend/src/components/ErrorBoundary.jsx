import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '60vh', padding: 40, textAlign: 'center'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>
            حدث خطأ غير متوقع
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, maxWidth: 400 }}>
            {this.props.message || 'نأسف على هذا الإزعاج. يمكنك المحاولة مجدداً أو العودة للصفحة الرئيسية.'}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              className="btn btn-primary"
              onClick={() => this.setState({ hasError: false, error: null })}>
              إعادة المحاولة
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => { window.location.href = '/' }}>
              الصفحة الرئيسية
            </button>
          </div>
          {process.env.NODE_ENV !== 'production' && this.state.error && (
            <details style={{ marginTop: 24, fontSize: 11, color: 'var(--muted)', textAlign: 'left', maxWidth: 600 }}>
              <summary style={{ cursor: 'pointer', color: 'var(--red)' }}>تفاصيل الخطأ (dev only)</summary>
              <pre style={{ marginTop: 8, padding: 12, background: 'var(--ink-3)', borderRadius: 6, overflow: 'auto' }}>
                {this.state.error.toString()}
              </pre>
            </details>
          )}
        </div>
      )
    }
    return this.props.children
  }
}
