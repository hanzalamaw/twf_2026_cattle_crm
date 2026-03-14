import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const API = 'http://localhost:5000';

const ORDER_TYPES = [
  'Hissa - Standard',
  'Hissa - Premium',
  'Hissa - Waqf',
  'Goat (Hissa)',
];

const ORDER_SOURCES = [
  'Tele-Sales',
  'Social Media (Organic)',
  'Social Media (Ads)',
  'Previous Customer',
  'Website',
];

const REFERENCES = [
  'Ashhad Bhai',
  'Ammar Bhai',
  'Ashhal',
  'Abuzar',
  'Omer',
  'Abdullah',
  'Huzaifa',
  'Hanzala',
  'External',
];

const DAYS = ['DAY 1', 'DAY 2', 'DAY 3'];

const EMPTY_FORM = {
  lead_id: '',
  customer_id: '',
  contact: '',
  order_type: '',
  booking_name: '',
  shareholder_name: '',
  alt_contact: '',
  address: '',
  area: '',
  day: '',
  booking_date: '',
  total_amount: '',
  order_source: '',
  reference: '',
  description: '',
};

const NewQuery = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [keepFormData, setKeepFormData] = useState(false);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  const generateLeadIdRef = useCallback(async () => {
    const currentToken = localStorage.getItem('token');
    if (!currentToken) return;
    try {
      const res = await fetch(`${API}/api/leads/generate-lead-id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentToken}` },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setFormData((prev) => ({ ...prev, lead_id: data.lead_id || '' }));
      }
    } catch (err) { console.error('Error generating lead ID:', err); }
  }, []);

  const generateCustomerIdRef = useCallback(async (contact) => {
    if (!contact || String(contact).trim().length < 3) {
      setFormData((prev) => ({ ...prev, customer_id: '' }));
      return;
    }
    const currentToken = localStorage.getItem('token');
    if (!currentToken) return;
    try {
      const res = await fetch(`${API}/api/booking/generate-customer-id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentToken}` },
        body: JSON.stringify({ contact: String(contact).trim() }),
      });
      const data = await res.json();
      setFormData((prev) => ({ ...prev, customer_id: res.ok && data.customer_id ? data.customer_id : '' }));
    } catch (err) { console.error('Error generating customer ID:', err); }
  }, []);

  const debounceTimeoutRef = useRef(null);
  const generateCustomerId = useCallback((contact) => {
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = setTimeout(() => generateCustomerIdRef(contact), 500);
  }, [generateCustomerIdRef]);

  const getPresetAmount = (orderType) => {
    const map = { 'Hissa - Standard': '25000', 'Hissa - Premium': '29700', 'Hissa - Waqf': '21000' };
    return map[orderType] || '';
  };

  const handleOrderTypeChange = (e) => {
    const value = e.target.value;
    setFormData((prev) => ({ ...prev, order_type: value, total_amount: getPresetAmount(value) }));
    generateLeadIdRef();
  };

  const handleContactChange = (e) => {
    const value = e.target.value;
    setFormData((prev) => ({ ...prev, contact: value }));
    generateCustomerId(value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess(''); setLoading(true);
    const currentToken = localStorage.getItem('token');
    if (!currentToken) { setError('You must be logged in to create a query'); setLoading(false); return; }
    const contactStr = String(formData.contact || '').trim();
    const bookingNameStr = String(formData.booking_name || '').trim();
    if (!contactStr || contactStr.length < 3) { setError('Contact is required (minimum 3 characters)'); setLoading(false); return; }
    if (!formData.order_type) { setError('Order type is required'); setLoading(false); return; }
    if (!bookingNameStr) { setError('Booking name is required'); setLoading(false); return; }
    if (!formData.booking_date) { setError('Booking date is required'); setLoading(false); return; }
    const totalNum = Number(formData.total_amount);
    if (!Number.isFinite(totalNum) || totalNum < 0) { setError('Total amount must be a valid positive number'); setLoading(false); return; }
    try {
      const res = await fetch(`${API}/api/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentToken}` },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('Lead created successfully!');
        if (keepFormData) {
          generateLeadIdRef(formData.order_type);
          generateCustomerIdRef(formData.contact);
          setTimeout(() => setSuccess(''), 2000);
        } else {
          setFormData({ ...EMPTY_FORM });
          setTimeout(() => setSuccess(''), 3000);
        }
      } else if (res.status === 401) {
        setError('Session expired. Please log in again.');
        setTimeout(() => navigate('/login'), 1500);
      } else {
        setError(data.message || 'Failed to create lead');
      }
    } catch (err) { setError('Network error. Please try again.'); }
    finally { setLoading(false); }
  };

  /* ─────────────────────────────────────────────
     Shared input / label / section styles
     (desktop = original, mobile overrides below)
  ───────────────────────────────────────────── */
  const inputStyle = {
    width: '100%', padding: '6px 10px', borderRadius: '6px',
    border: '1px solid #e0e0e0', fontSize: '11px', outline: 'none',
    background: '#FFFFFF', boxSizing: 'border-box',
    transition: 'border-color 0.2s', fontFamily: 'inherit',
  };
  const labelStyle = {
    display: 'block', fontSize: '10px', color: '#666',
    marginBottom: '3px', fontWeight: '500',
  };
  const sectionStyle = {
    background: '#FFFFFF', borderRadius: '6px', padding: '16px',
    marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  };
  const sectionTitleStyle = {
    fontSize: '11px', fontWeight: '600', color: '#FF5722',
    marginBottom: '13px', paddingBottom: '8px', borderBottom: '1px solid #e0e0e0',
  };

  return (
    <>
      <style>{`
        /* ── Mobile overrides ── */
        @media (max-width: 767px) {

          /* push content below the FAB */
          .nq-root { padding: 14px 12px 32px !important; }

          /* header: title left, no back button (FAB is the nav) */
          .nq-header { margin-bottom: 14px !important; }
          .nq-header-back { display: none !important; }
          .nq-title { font-size: 16px !important; }

          /* sections */
          .nq-section { padding: 14px 12px !important; margin-bottom: 12px !important; border-radius: 10px !important; }
          .nq-section-title { font-size: 12px !important; margin-bottom: 12px !important; }

          /* grid — single column on mobile */
          .nq-grid { grid-template-columns: 1fr !important; gap: 10px !important; }

          /* inputs — larger tap targets */
          .nq-input {
            padding: 10px 12px !important;
            font-size: 13px !important;
            border-radius: 8px !important;
          }
          .nq-label { font-size: 11px !important; margin-bottom: 4px !important; }

          /* keep-data row */
          .nq-keep { padding: 10px 12px !important; border-radius: 8px !important; }
          .nq-keep label { font-size: 11px !important; }
          .nq-keep input[type="checkbox"] { width: 16px !important; height: 16px !important; }

          /* action buttons — full width stack */
          .nq-actions {
            flex-direction: column !important;
            gap: 8px !important;
            margin-top: 14px !important;
          }
          .nq-btn-cancel,
          .nq-btn-submit {
            width: 100% !important;
            padding: 12px !important;
            font-size: 13px !important;
            border-radius: 10px !important;
            text-align: center !important;
            justify-content: center !important;
          }
          .nq-btn-submit { order: -1; } /* submit on top */

          /* alerts */
          .nq-alert { font-size: 12px !important; padding: 10px 12px !important; border-radius: 8px !important; }
        }
      `}</style>

      <div
        className="nq-root"
        style={{
          padding: '19px',
          fontFamily: "'Poppins', 'Inter', sans-serif",
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          height: '100%',
          overflow: 'auto',
          boxSizing: 'border-box',
          background: '#F9FAFB',
        }}
      >
        {/* Header */}
        <div
          className="nq-header"
          style={{
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            flexShrink: 0,
          }}
        >
          <h2 className="nq-title" style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0 }}>
            New Lead
          </h2>
          <button
            type="button"
            className="nq-header-back"
            onClick={() => navigate('/bookings/queries')}
            style={{
              padding: '6px 13px', borderRadius: '6px', border: '1px solid #e0e0e0',
              background: '#FFFFFF', color: '#666', fontSize: '11px', cursor: 'pointer', fontWeight: '500',
            }}
            onMouseOver={(e) => { e.target.style.background = '#F5F5F5'; }}
            onMouseOut={(e)  => { e.target.style.background = '#FFFFFF'; }}
          >
            Back to Queries
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="nq-alert" style={{ background: '#FFF5F2', color: '#FF5722', padding: '8px 11px', borderRadius: '6px', marginBottom: '13px', fontSize: '10px', border: '1px solid #FFE0D6' }}>
            {error}
          </div>
        )}
        {success && (
          <div className="nq-alert" style={{ background: '#F0FDF4', color: '#166534', padding: '8px 11px', borderRadius: '6px', marginBottom: '13px', fontSize: '10px', border: '1px solid #BBF7D0' }}>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>

          {/* ── Lead Information ── */}
          <div className="nq-section" style={sectionStyle}>
            <div className="nq-section-title" style={sectionTitleStyle}>Lead Information</div>
            <div className="nq-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '13px' }}>

              <div>
                <label className="nq-label" style={labelStyle}>Lead ID <span style={{ color: '#FF5722' }}>*</span></label>
                <input className="nq-input" type="text" value={formData.lead_id} readOnly
                  style={{ ...inputStyle, background: '#F5F5F5', cursor: 'not-allowed', color: '#666' }} />
              </div>

              <div>
                <label className="nq-label" style={labelStyle}>Customer ID</label>
                <input className="nq-input" type="text" value={formData.customer_id} readOnly
                  style={{ ...inputStyle, background: '#F5F5F5', cursor: 'not-allowed', color: '#666' }} />
              </div>

              <div>
                <label className="nq-label" style={labelStyle}>Order Type <span style={{ color: '#FF5722' }}>*</span></label>
                <select className="nq-input" value={formData.order_type} onChange={handleOrderTypeChange} style={inputStyle} required
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                  onBlur={(e)  => (e.target.style.borderColor = '#e0e0e0')}>
                  <option value="" disabled>Select Order Type</option>
                  {ORDER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="nq-label" style={labelStyle}>Contact <span style={{ color: '#FF5722' }}>*</span></label>
                <input className="nq-input" type="text" value={formData.contact} onChange={handleContactChange}
                  required placeholder="e.g., 0300-1234567" style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                  onBlur={(e)  => (e.target.style.borderColor = '#e0e0e0')} />
              </div>

              <div>
                <label className="nq-label" style={labelStyle}>Alt. Contact</label>
                <input className="nq-input" type="text" value={formData.alt_contact}
                  onChange={(e) => setFormData((p) => ({ ...p, alt_contact: e.target.value }))}
                  placeholder="e.g., 0300-1234567" style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                  onBlur={(e)  => (e.target.style.borderColor = '#e0e0e0')} />
              </div>

              <div>
                <label className="nq-label" style={labelStyle}>Booking Date <span style={{ color: '#FF5722' }}>*</span></label>
                <input className="nq-input" type="date" value={formData.booking_date}
                  onChange={(e) => setFormData((p) => ({ ...p, booking_date: e.target.value }))}
                  required style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                  onBlur={(e)  => (e.target.style.borderColor = '#e0e0e0')} />
              </div>

              <div>
                <label className="nq-label" style={labelStyle}>Total Amount <span style={{ color: '#FF5722' }}>*</span></label>
                <input className="nq-input" type="number" min="0" step="1" value={formData.total_amount}
                  onChange={(e) => setFormData((p) => ({ ...p, total_amount: e.target.value }))}
                  required style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                  onBlur={(e)  => (e.target.style.borderColor = '#e0e0e0')} />
              </div>

              <div>
                <label className="nq-label" style={labelStyle}>Order Source <span style={{ color: '#FF5722' }}>*</span></label>
                <select className="nq-input" value={formData.order_source}
                  onChange={(e) => setFormData((p) => ({ ...p, order_source: e.target.value }))}
                  style={inputStyle} required
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                  onBlur={(e)  => (e.target.style.borderColor = '#e0e0e0')}>
                  <option value="" disabled>Select Order Source</option>
                  {ORDER_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="nq-label" style={labelStyle}>Reference <span style={{ color: '#FF5722' }}>*</span></label>
                <select className="nq-input" value={formData.reference}
                  onChange={(e) => setFormData((p) => ({ ...p, reference: e.target.value }))}
                  style={inputStyle} required
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                  onBlur={(e)  => (e.target.style.borderColor = '#e0e0e0')}>
                  <option value="" disabled>Select Reference</option>
                  {REFERENCES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <label className="nq-label" style={labelStyle}>Day <span style={{ color: '#FF5722' }}>*</span></label>
                <select className="nq-input" value={formData.day}
                  onChange={(e) => setFormData((p) => ({ ...p, day: e.target.value }))}
                  style={inputStyle} required
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                  onBlur={(e)  => (e.target.style.borderColor = '#e0e0e0')}>
                  <option value="" disabled>Select Day</option>
                  {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

            </div>
          </div>

          {/* ── Customer Information ── */}
          <div className="nq-section" style={sectionStyle}>
            <div className="nq-section-title" style={sectionTitleStyle}>Customer Information</div>
            <div className="nq-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '13px' }}>

              <div>
                <label className="nq-label" style={labelStyle}>Booking Name <span style={{ color: '#FF5722' }}>*</span></label>
                <input className="nq-input" type="text" value={formData.booking_name}
                  onChange={(e) => setFormData((p) => ({ ...p, booking_name: e.target.value }))}
                  placeholder="Enter booking name" style={inputStyle} required
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                  onBlur={(e)  => (e.target.style.borderColor = '#e0e0e0')} />
              </div>

              <div>
                <label className="nq-label" style={labelStyle}>Shareholder Name <span style={{ color: '#FF5722' }}>*</span></label>
                <input className="nq-input" type="text" value={formData.shareholder_name}
                  onChange={(e) => setFormData((p) => ({ ...p, shareholder_name: e.target.value }))}
                  placeholder="Enter shareholder name" style={inputStyle} required
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                  onBlur={(e)  => (e.target.style.borderColor = '#e0e0e0')} />
              </div>

              <div>
                <label className="nq-label" style={labelStyle}>Area <span style={{ color: '#FF5722' }}>*</span></label>
                <input className="nq-input" type="text" value={formData.area}
                  onChange={(e) => setFormData((p) => ({ ...p, area: e.target.value }))}
                  placeholder="Enter area" style={inputStyle} required
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                  onBlur={(e)  => (e.target.style.borderColor = '#e0e0e0')} />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label className="nq-label" style={labelStyle}>Address <span style={{ color: '#FF5722' }}>*</span></label>
                <textarea className="nq-input" value={formData.address}
                  onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Enter full address" rows="2"
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} required
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                  onBlur={(e)  => (e.target.style.borderColor = '#e0e0e0')} />
              </div>

            </div>
          </div>

          {/* ── Additional Information ── */}
          <div className="nq-section" style={sectionStyle}>
            <div className="nq-section-title" style={sectionTitleStyle}>Additional Information</div>
            <div>
              <label className="nq-label" style={labelStyle}>Description</label>
              <textarea className="nq-input" value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                placeholder="Enter any additional notes or description" rows="3"
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                onBlur={(e)  => (e.target.style.borderColor = '#e0e0e0')} />
            </div>
          </div>

          {/* ── Keep Form Data ── */}
          <div
            className="nq-keep"
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              marginBottom: '13px', padding: '10px',
              background: '#F9FAFB', borderRadius: '6px', border: '1px solid #e0e0e0',
            }}
          >
            <input
              type="checkbox" id="keepFormData" checked={keepFormData}
              onChange={(e) => setKeepFormData(e.target.checked)}
              style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#FF5722' }}
            />
            <label htmlFor="keepFormData" style={{ fontSize: '10px', color: '#666', cursor: 'pointer', userSelect: 'none' }}>
              Keep form data after submission (regenerate Lead ID &amp; Customer ID)
            </label>
          </div>

          {/* ── Actions ── */}
          <div
            className="nq-actions"
            style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}
          >
            <button
              type="button"
              className="nq-btn-cancel"
              onClick={() => navigate('/bookings/queries')}
              style={{
                padding: '6px 13px', borderRadius: '6px', border: '1px solid #e0e0e0',
                background: '#FFFFFF', color: '#666', fontSize: '11px', cursor: 'pointer', fontWeight: '500',
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
              onMouseOut={(e)  => { e.currentTarget.style.background = '#FFFFFF'; }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="nq-btn-submit"
              disabled={loading}
              style={{
                padding: '6px 16px', borderRadius: '6px', border: 'none',
                background: loading ? '#94A3B8' : '#FF5722',
                color: '#FFFFFF', fontSize: '11px',
                cursor: loading ? 'not-allowed' : 'pointer', fontWeight: '600',
              }}
              onMouseOver={(e) => { if (!loading) e.currentTarget.style.background = '#E64A19'; }}
              onMouseOut={(e)  => { if (!loading) e.currentTarget.style.background = '#FF5722'; }}
            >
              {loading ? 'Creating...' : 'Create Lead'}
            </button>
          </div>

        </form>
      </div>
    </>
  );
};

export default NewQuery;