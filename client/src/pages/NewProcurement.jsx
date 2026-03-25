import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { API_BASE as API } from '../config/api';

const TYPE_OPTIONS = ['Cow (Premium)', 'Cow(Standard)', 'Goat'];

const EMPTY_FORM = {
  procurement_id: '',
  type: '',
  no_of_animals: '',
  price_per_unit: '',
  total_price: '',
  price_paid: '',
  price_due: '',
  per_unit_weight: '',
  date: '',
};

function n2(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function money(n) {
  if (!Number.isFinite(n)) return '';
  return (Math.round(n * 100) / 100).toFixed(2);
}

export default function NewProcurement() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [keepFormData, setKeepFormData] = useState(false);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  const lastPriceEditedRef = useRef('total'); // 'total' | 'ppu'
  const lastPayEditedRef = useRef('paid'); // 'paid' | 'due'

  const noAnimalsNum = useMemo(() => {
    const n = parseInt(formData.no_of_animals, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }, [formData.no_of_animals]);

  const generateProcurementId = async (dateStr) => {
    if (!token) return;
    try {
      const res = await fetch(`${API}/procurement/generate-procurement-id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ date: dateStr || null }),
      });
      if (res.ok) {
        const d = await res.json();
        setFormData((p) => ({ ...p, procurement_id: d.procurement_id }));
      }
    } catch {
      // ignore
    }
  };

  // On mount, generate ID (year-based)
  useEffect(() => {
    generateProcurementId(null);
  }, []);

  // Recalculate unit/total when animals/amount change (based on last edited field)
  useEffect(() => {
    const animals = noAnimalsNum;
    const total = n2(formData.total_price);
    const ppu = n2(formData.price_per_unit);

    if (animals <= 0) return;

    if (lastPriceEditedRef.current === 'total' && total != null) {
      const nextPpu = total / animals;
      const next = money(nextPpu);
      if (formData.price_per_unit !== next) {
        setFormData((p) => ({ ...p, price_per_unit: next }));
      }
      return;
    }
    if (lastPriceEditedRef.current === 'ppu' && ppu != null) {
      const nextTotal = ppu * animals;
      const next = money(nextTotal);
      if (formData.total_price !== next) {
        setFormData((p) => ({ ...p, total_price: next }));
      }
    }
  }, [noAnimalsNum, formData.total_price, formData.price_per_unit]);

  // Recalculate paid/due based on last edited payment field
  useEffect(() => {
    const total = n2(formData.total_price) ?? 0;
    const paid = n2(formData.price_paid);
    const due = n2(formData.price_due);

    if (lastPayEditedRef.current === 'paid') {
      if (paid == null) {
        if (formData.price_due !== money(total)) setFormData((p) => ({ ...p, price_due: money(total) }));
        return;
      }
      const nextDue = Math.max(0, total - paid);
      const next = money(nextDue);
      if (formData.price_due !== next) setFormData((p) => ({ ...p, price_due: next }));
      return;
    }

    if (due == null) {
      if (formData.price_paid !== money(0)) setFormData((p) => ({ ...p, price_paid: money(0) }));
      return;
    }
    const nextPaid = Math.max(0, total - due);
    const next = money(nextPaid);
    if (formData.price_paid !== next) setFormData((p) => ({ ...p, price_paid: next }));
  }, [formData.total_price, formData.price_paid, formData.price_due]);

  const inputStyle = {
    width: '100%', padding: '6px 10px', borderRadius: '6px',
    border: '1px solid #e0e0e0', fontSize: '11px', outline: 'none',
    background: '#FFFFFF', boxSizing: 'border-box',
    transition: 'border-color 0.2s', fontFamily: 'inherit',
  };
  const labelStyle = { display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px', fontWeight: '500' };
  const sectionStyle = { background: '#FFFFFF', borderRadius: '6px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' };
  const sectionTitleStyle = { fontSize: '11px', fontWeight: '600', color: '#1565C0', marginBottom: '13px', paddingBottom: '8px', borderBottom: '1px solid #e0e0e0' };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!token) { setError('You must be logged in'); return; }
    setLoading(true);
    try {
      const payload = {
        procurement_id: formData.procurement_id,
        type: formData.type,
        no_of_animals: formData.no_of_animals,
        price_per_unit: formData.price_per_unit,
        total_price: formData.total_price,
        price_paid: formData.price_paid,
        price_due: formData.price_due,
        per_unit_weight: formData.per_unit_weight,
        date: formData.date,
      };
      const res = await fetch(`${API}/procurement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || 'Failed to create procurement');
        return;
      }
      setSuccess('Procurement created successfully!');
      if (keepFormData) {
        await generateProcurementId(formData.date);
        setTimeout(() => setSuccess(''), 2000);
      } else {
        setFormData({ ...EMPTY_FORM });
        setTimeout(() => setSuccess(''), 2500);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @media (max-width: 767px) {
          .np-root  { padding: 14px 12px 32px !important; }
          .np-header-back { display: none !important; }
          .np-title { font-size: 16px !important; }
          .np-section { padding: 14px 12px !important; margin-bottom: 12px !important; border-radius: 10px !important; }
          .np-section-title { font-size: 12px !important; margin-bottom: 12px !important; }
          .np-grid { grid-template-columns: 1fr !important; gap: 10px !important; }
          .np-input { padding: 10px 12px !important; font-size: 13px !important; border-radius: 8px !important; }
          .np-label { font-size: 11px !important; margin-bottom: 4px !important; }
          .np-keep  { padding: 10px 12px !important; border-radius: 8px !important; }
          .np-keep label { font-size: 11px !important; }
          .np-keep input[type="checkbox"] { width: 16px !important; height: 16px !important; }
          .np-actions { flex-direction: column !important; gap: 8px !important; margin-top: 14px !important; }
          .np-btn { width: 100% !important; padding: 12px !important; font-size: 13px !important; border-radius: 10px !important; justify-content: center !important; }
        }
      `}</style>

      <div
        className="np-root"
        style={{
          padding: '19px', fontFamily: "'Poppins', 'Inter', sans-serif",
          display: 'flex', flexDirection: 'column', minHeight: 0,
          height: '100%', overflow: 'auto', boxSizing: 'border-box', background: '#F9FAFB',
        }}
      >
        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', flexShrink: 0 }}>
          <h2 className="np-title" style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0 }}>New Procurement</h2>
          <button
            className="np-header-back"
            type="button"
            onClick={() => navigate('/procurement/manage')}
            style={{ padding: '6px 13px', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#FFFFFF', color: '#666', fontSize: '11px', cursor: 'pointer', fontWeight: '500' }}
            onMouseOver={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = '#FFFFFF'; }}
          >
            Back to Management
          </button>
        </div>

        {error && (
          <div style={{ background: '#FFF5F2', color: '#FF5722', padding: '8px 11px', borderRadius: '6px', marginBottom: '13px', fontSize: '10px', border: '1px solid #FFE0D6', flexShrink: 0 }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ background: '#F0FDF4', color: '#166534', padding: '8px 11px', borderRadius: '6px', marginBottom: '13px', fontSize: '10px', border: '1px solid #BBF7D0', flexShrink: 0 }}>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="np-section" style={sectionStyle}>
            <div className="np-section-title" style={sectionTitleStyle}>Procurement Information</div>
            <div className="np-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '13px' }}>
              <div>
                <label className="np-label" style={labelStyle}>Procurement ID <span style={{ color: '#1565C0' }}>*</span></label>
                <input className="np-input" type="text" value={formData.procurement_id} readOnly style={{ ...inputStyle, background: '#F5F5F5', cursor: 'not-allowed', color: '#666' }} />
              </div>

              <div>
                <label className="np-label" style={labelStyle}>Type <span style={{ color: '#1565C0' }}>*</span></label>
                <select
                  className="np-input"
                  value={formData.type}
                  onChange={(e) => setFormData((p) => ({ ...p, type: e.target.value }))}
                  required
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#1565C0')}
                  onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
                >
                  <option value="" disabled>Select Type</option>
                  {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="np-label" style={labelStyle}>No. of animals <span style={{ color: '#1565C0' }}>*</span></label>
                <input
                  className="np-input"
                  type="number"
                  min="0"
                  step="1"
                  value={formData.no_of_animals}
                  onChange={(e) => setFormData((p) => ({ ...p, no_of_animals: e.target.value }))}
                  required
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#1565C0')}
                  onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
                />
              </div>

              <div>
                <label className="np-label" style={labelStyle}>Total price <span style={{ color: '#1565C0' }}>*</span></label>
                <input
                  className="np-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.total_price}
                  onChange={(e) => { lastPriceEditedRef.current = 'total'; setFormData((p) => ({ ...p, total_price: e.target.value })); }}
                  required
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#1565C0')}
                  onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
                />
              </div>

              <div>
                <label className="np-label" style={labelStyle}>Price per unit</label>
                <input
                  className="np-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.price_per_unit}
                  onChange={(e) => { lastPriceEditedRef.current = 'ppu'; setFormData((p) => ({ ...p, price_per_unit: e.target.value })); }}
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#1565C0')}
                  onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
                />
              </div>

              <div>
                <label className="np-label" style={labelStyle}>Price paid</label>
                <input
                  className="np-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.price_paid}
                  onChange={(e) => { lastPayEditedRef.current = 'paid'; setFormData((p) => ({ ...p, price_paid: e.target.value })); }}
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#1565C0')}
                  onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
                />
              </div>

              <div>
                <label className="np-label" style={labelStyle}>Price due</label>
                <input
                  className="np-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.price_due}
                  onChange={(e) => { lastPayEditedRef.current = 'due'; setFormData((p) => ({ ...p, price_due: e.target.value })); }}
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#1565C0')}
                  onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
                />
              </div>

              <div>
                <label className="np-label" style={labelStyle}>Per unit weight</label>
                <input
                  className="np-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.per_unit_weight}
                  onChange={(e) => setFormData((p) => ({ ...p, per_unit_weight: e.target.value }))}
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#1565C0')}
                  onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
                />
              </div>

              <div>
                <label className="np-label" style={labelStyle}>Date <span style={{ color: '#1565C0' }}>*</span></label>
                <input
                  className="np-input"
                  type="date"
                  value={formData.date}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFormData((p) => ({ ...p, date: v }));
                    generateProcurementId(v);
                  }}
                  required
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#1565C0')}
                  onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
                />
              </div>
            </div>
          </div>

          <div className="np-keep" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '13px', padding: '10px', background: '#F9FAFB', borderRadius: '6px', border: '1px solid #e0e0e0' }}>
            <input
              type="checkbox"
              id="keepFormDataNP"
              checked={keepFormData}
              onChange={(e) => setKeepFormData(e.target.checked)}
              style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#1565C0' }}
            />
            <label htmlFor="keepFormDataNP" style={{ fontSize: '10px', color: '#666', cursor: 'pointer', userSelect: 'none' }}>
              Keep form data after submission (regenerate Procurement ID)
            </label>
          </div>

          <div className="np-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px', flexShrink: 0 }}>
            <button
              type="button"
              className="np-btn"
              onClick={() => navigate('/procurement/manage')}
              style={{ padding: '6px 13px', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#FFFFFF', color: '#666', fontSize: '11px', cursor: 'pointer', fontWeight: '500' }}
              onMouseOver={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = '#FFFFFF'; }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="np-btn"
              disabled={loading}
              style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', background: loading ? '#94A3B8' : '#1565C0', color: '#FFFFFF', fontSize: '11px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: '600' }}
              onMouseOver={(e) => { if (!loading) e.currentTarget.style.background = '#0D47A1'; }}
              onMouseOut={(e) => { if (!loading) e.currentTarget.style.background = '#1565C0'; }}
            >
              {loading ? 'Creating...' : 'Create Procurement'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

