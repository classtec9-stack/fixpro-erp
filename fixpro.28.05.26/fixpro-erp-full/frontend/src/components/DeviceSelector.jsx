import { BRANDS, getTypesForBrand, getModelsForType, normalizeDeviceType } from '../data/deviceCatalog'

/**
 * منتقي الأجهزة المتدرّج: الشركة ← النوع ← الموديل
 * props:
 *   brand, type, model — القيم الحالية
 *   onChange({ brand, type, model, dbType }) — عند أي تغيير
 */
export default function DeviceSelector({ brand, type, model, onChange }) {
  const types  = brand ? getTypesForBrand(brand) : []
  const models = (brand && type) ? getModelsForType(brand, type) : []

  const pickBrand = (b) => onChange({ brand: b, type: '', model: '', dbType: 'other' })
  const pickType  = (t) => onChange({ brand, type: t, model: '', dbType: normalizeDeviceType(t) })
  const pickModel = (m) => onChange({ brand, type, model: m, dbType: normalizeDeviceType(type) })

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
      {/* الشركة */}
      <div className="form-group">
        <label className="form-label">الشركة *</label>
        <select className="form-select" value={brand || ''} onChange={e => pickBrand(e.target.value)}>
          <option value="">اختر الشركة...</option>
          {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {/* نوع المنتج */}
      <div className="form-group">
        <label className="form-label">نوع المنتج *</label>
        <select className="form-select" value={type || ''} onChange={e => pickType(e.target.value)}
          disabled={!brand}>
          <option value="">اختر النوع...</option>
          {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* الموديل */}
      <div className="form-group">
        <label className="form-label">الموديل *</label>
        <select className="form-select" value={model || ''} onChange={e => pickModel(e.target.value)}
          disabled={!type}>
          <option value="">اختر الموديل...</option>
          {models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
    </div>
  )
}
