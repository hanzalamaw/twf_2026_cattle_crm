import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_BASE as API } from '../config/api';

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
const QUERY_BY_OPTIONS = ['Ashhad Bhai', 'Ammar Bhai', 'Ashhal', 'Abuzar', 'Omer', 'Abdullah', 'Huzaifa', 'Hanzala', 'External'];

const EMPTY_FORM = {
  lead_id: '',
  customer_id: '',
  contact: '',
  booking_name: '',
  alt_contact: '',
  booking_date: '',
  order_source: '',
  reference: '',
  closed_by: '',
  description: '',
};

const NewQuery = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isFarm = location.pathname.startsWith('/farm');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [keepFormData, setKeepFormData] = useState(false);
  const [referenceSuggestions, setReferenceSuggestions] = useState(REFERENCES);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  const generateLeadIdRef = useCallback(async () => {
    const currentToken = localStorage.getItem('token');
    if (!currentToken) return;
    try {
      const res = await fetch(`${API}/leads/generate-lead-id`, {
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
      const res = await fetch(`${API}/booking/generate-customer-id`, {
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

  useEffect(() => {
    generateLeadIdRef();
  }, [generateLeadIdRef]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const fetchReferenceSuggestions = async () => {
      try {
        const [leadsRes, ordersRes] = await Promise.all([
          fetch(`${API}/booking/leads/filters?year=all`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/booking/orders/filters?year=all`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const [leadsJson, ordersJson] = await Promise.all([
          leadsRes.ok ? leadsRes.json() : {},
          ordersRes.ok ? ordersRes.json() : {},
        ]);
        const merged = Array.from(new Set([
          ...REFERENCES,
          ...((leadsJson?.references || []).filter(Boolean)),
          ...((ordersJson?.references || []).filter(Boolean)),
        ]));
        if (merged.length > 0) setReferenceSuggestions(merged);
      } catch (err) {
        console.error('Failed to load reference suggestions', err);
      }
    };
    fetchReferenceSuggestions();
  }, []);

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
    if (!bookingNameStr) { setError('Booking name is required'); setLoading(false); return; }
    if (!formData.booking_date) { setError('Booking date is required'); setLoading(false); return; }
    try {
      const payload = isFarm ? { ...formData, order_source: 'Farm' } : formData;
      const res = await fetch(`${API}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentToken}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('Lead created successfully!');
        if (keepFormData) {
          generateLeadIdRef();
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

          .nq-root { padding: 20px 12px 32px !important; }

          .nq-header {
            margin-bottom: 22px !important; padding: 6px 0 18px 0 !important; min-height: 62px !important;
            align-items: center !important; box-sizing: border-box !important;
            justify-content: flex-start !important; gap: 0 !important; flex-wrap: nowrap !important;
          }
          .nq-header-back { display: none !important; }
          .nq-mobile-fab-spacer { display: block !important; width: 46px !important; height: 46px !important; flex-shrink: 0 !important; }
          .nq-title {
            padding: 0 10px 0 0 !important; margin: 0 !important;
            font-size: clamp(15px, 4.3vw, 17px) !important; font-weight: 600 !important; color: #333 !important;
            line-height: 1.3 !important; display: flex !important; align-items: center !important; flex: 1 !important; min-width: 0 !important; box-sizing: border-box !important;
          }

          /* Extra air below heading / above first form section */
          .nq-root form > .nq-section:first-of-type { margin-top: 14px !important; }

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
          <h2 className="nq-title" style={{ fontSize: '18px', fontWeight: '600', color: '#333', margin: 0 }}>
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
          <div className="nq-mobile-fab-spacer" aria-hidden style={{ display: 'none', width: 46, height: 46, flexShrink: 0 }} />
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
                <input
                  className="nq-input"
                  type="text"
                  list="new-query-reference-suggestions"
                  value={formData.reference}
                  onChange={(e) => setFormData((p) => ({ ...p, reference: e.target.value }))}
                  style={inputStyle}
                  placeholder="Type or select reference"
                  required
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                  onBlur={(e)  => (e.target.style.borderColor = '#e0e0e0')}
                />
                <datalist id="new-query-reference-suggestions">
                  {referenceSuggestions.map((r) => <option key={r} value={r} />)}
                </datalist>
              </div>

              <div>
                <label className="nq-label" style={labelStyle}>Query By <span style={{ color: '#FF5722' }}>*</span></label>
                <select className="nq-input" value={formData.closed_by}
                  onChange={(e) => setFormData((p) => ({ ...p, closed_by: e.target.value }))}
                  style={inputStyle} required
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                  onBlur={(e)  => (e.target.style.borderColor = '#e0e0e0')}>
                  <option value="" disabled>Select Query By</option>
                  {QUERY_BY_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
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