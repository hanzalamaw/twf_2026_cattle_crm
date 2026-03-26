import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_BASE as API } from '../config/api';

const ORDER_TYPES = ['Hissa - Standard', 'Hissa - Premium', 'Hissa - Waqf', 'Goat (Hissa)'];
const FARM_ORDER_TYPES = ['Cow', 'Goat', 'Hissa - Standard', 'Hissa - Premium', 'Hissa - Waqf', 'Goat (Hissa)'];
const ORDER_SOURCES = ['Tele-Sales', 'Social Media (Organic)', 'Social Media (Ads)', 'Previous Customer', 'Website'];
const SLOTS = ['SLOT 1', 'SLOT 2', 'SLOT 3', 'SLOT GOAT', 'SLOT WAQF'];
const REFERENCES = ['Ashhad Bhai', 'Ammar Bhai', 'Ashhal', 'Abuzar', 'Omer', 'Abdullah', 'Huzaifa', 'Hanzala', 'External'];
const DAYS = ['DAY 1', 'DAY 2', 'DAY 3'];

const EMPTY_FORM = {
  order_id: '', customer_id: '', contact: '', order_type: '', booking_name: '',
  shareholder_name: '', cow_number: '', hissa_number: '', alt_contact: '',
  address: '', area: '', day: '', booking_date: '', total_amount: '',
  order_source: '', reference: '', closed_by: '', description: '', slot: '',
};

const NewOrder = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isFarm = location.pathname.startsWith('/farm');
  const orderTypes = isFarm ? FARM_ORDER_TYPES : ORDER_TYPES;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [keepFormData, setKeepFormData] = useState(false);
  const [duplicateError, setDuplicateError] = useState(null);
  const [referenceSuggestions, setReferenceSuggestions] = useState(REFERENCES);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const fetchReferenceSuggestions = async () => {
      try {
        const [ordersRes, leadsRes] = await Promise.all([
          fetch(`${API}/booking/orders/filters?year=all`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/booking/leads/filters?year=all`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const [ordersJson, leadsJson] = await Promise.all([
          ordersRes.ok ? ordersRes.json() : {},
          leadsRes.ok ? leadsRes.json() : {},
        ]);
        const merged = Array.from(new Set([
          ...REFERENCES,
          ...((ordersJson?.references || []).filter(Boolean)),
          ...((leadsJson?.references || []).filter(Boolean)),
        ]));
        if (merged.length > 0) setReferenceSuggestions(merged);
      } catch (err) {
        console.error('Failed to load reference suggestions', err);
      }
    };
    fetchReferenceSuggestions();
  }, []);

  const generateCustomerIdRef = useCallback(async (contact) => {
    if (!contact || contact.length < 3) { setFormData((p) => ({ ...p, customer_id: '' })); return; }
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${API}/booking/generate-customer-id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ contact }),
      });
      if (res.ok) { const d = await res.json(); setFormData((p) => ({ ...p, customer_id: d.customer_id })); }
    } catch (err) { console.error(err); }
  }, []);

  const debounceTimeoutRef = useRef(null);
  const generateCustomerId = useCallback((contact) => {
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = setTimeout(() => generateCustomerIdRef(contact), 500);
  }, [generateCustomerIdRef]);

  const generateOrderId = useCallback(async (orderType) => {
    if (!orderType) { setFormData((p) => ({ ...p, order_id: '' })); return; }
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${API}/booking/generate-order-id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ order_type: orderType }),
      });
      if (res.ok) { const d = await res.json(); setFormData((p) => ({ ...p, order_id: d.order_id })); }
    } catch (err) { console.error(err); }
  }, []);

  const getAvailableCowHissa = useCallback(async (orderType, day, bookingDate) => {
    if (!orderType) { setFormData((p) => ({ ...p, cow_number: '', hissa_number: '' })); return; }
    if (orderType === 'Goat (Hissa)') { setFormData((p) => ({ ...p, cow_number: '0', hissa_number: '0' })); return; }
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${API}/booking/get-available-cow-hissa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ order_type: orderType, day: day || null, booking_date: bookingDate || null }),
      });
      if (res.ok) { const d = await res.json(); setFormData((p) => ({ ...p, cow_number: d.cow_number, hissa_number: d.hissa_number })); }
    } catch (err) { console.error(err); }
  }, []);

  const shouldSkipCowHissaDuplicate = (orderType, cow, hissa) => {
    if (orderType !== 'Goat (Hissa)') return false;
    const c = String(cow ?? '').trim(); const h = String(hissa ?? '').trim();
    return (c === '0' || c === '') && (h === '0' || h === '');
  };

  const checkCowHissaDuplicate = useCallback(async (cow, hissa, orderType, day, bookingDate) => {
    if (!cow || !hissa || !orderType) return null;
    if (shouldSkipCowHissaDuplicate(orderType, cow, hissa)) return null;
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
      const res = await fetch(`${API}/booking/check-cow-hissa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cow_number: cow, hissa_number: hissa, order_type: orderType, day: day || null, booking_date: bookingDate || null }),
      });
      if (res.ok) { const d = await res.json(); return d.exists ? d : null; }
    } catch (err) { console.error(err); }
    return null;
  }, []);

  const handleContactChange = (e) => {
    const v = e.target.value;
    setFormData((p) => ({ ...p, contact: v }));
    generateCustomerId(v);
  };

  const getPresetAmount = (t) => ({ 'Hissa - Standard': '25000', 'Hissa - Premium': '29700', 'Hissa - Waqf': '21000' })[t] || '';

  const handleOrderTypeChange = (e) => {
    const v = e.target.value;
    setFormData((p) => { generateOrderId(v); getAvailableCowHissa(v, p.day, p.booking_date); return { ...p, order_type: v, total_amount: getPresetAmount(v) }; });
  };

  const handleDayChange = (e) => {
    const v = e.target.value;
    setFormData((p) => { if (p.order_type) getAvailableCowHissa(p.order_type, v, p.booking_date); return { ...p, day: v }; });
  };

  const handleCowNumberChange = (e) => { setFormData((p) => ({ ...p, cow_number: e.target.value })); setDuplicateError(null); };
  const handleHissaNumberChange = (e) => { setFormData((p) => ({ ...p, hissa_number: e.target.value })); setDuplicateError(null); };

  const handleCowNumberBlur = async () => {
    const { cow_number, hissa_number, order_type, day, booking_date } = formData;
    if (cow_number && hissa_number && order_type && !shouldSkipCowHissaDuplicate(order_type, cow_number, hissa_number)) {
      const dup = await checkCowHissaDuplicate(cow_number, hissa_number, order_type, day, booking_date);
      if (dup) setDuplicateError(dup);
    }
  };

  const handleHissaNumberBlur = async () => {
    const { cow_number, hissa_number, order_type, day, booking_date } = formData;
    if (cow_number && hissa_number && order_type && !shouldSkipCowHissaDuplicate(order_type, cow_number, hissa_number)) {
      const dup = await checkCowHissaDuplicate(cow_number, hissa_number, order_type, day, booking_date);
      if (dup) setDuplicateError(dup);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setSuccess(''); setDuplicateError(null); setLoading(true);
    const { cow_number, hissa_number, order_type, day, booking_date } = formData;
    if (cow_number && hissa_number && order_type && !shouldSkipCowHissaDuplicate(order_type, cow_number, hissa_number)) {
      const dup = await checkCowHissaDuplicate(cow_number, hissa_number, order_type, day, booking_date);
      if (dup) { setDuplicateError(dup); setLoading(false); return; }
    }
    const token = localStorage.getItem('token');
    if (!token) { setError('You must be logged in to create an order'); setLoading(false); return; }
    try {
      const res = await fetch(`${API}/booking/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('Order created successfully!');
        if (keepFormData) {
          generateOrderId(formData.order_type);
          getAvailableCowHissa(formData.order_type, formData.day, formData.booking_date);
          setTimeout(() => setSuccess(''), 2000);
        } else {
          setFormData({ ...EMPTY_FORM });
          setTimeout(() => setSuccess(''), 3000);
        }
      } else {
        setError(data.message || 'Failed to create order');
      }
    } catch (err) { setError('Network error. Please try again.'); }
    finally { setLoading(false); }
  };

  const inputStyle = {
    width: '100%', padding: '6px 10px', borderRadius: '6px',
    border: '1px solid #e0e0e0', fontSize: '11px', outline: 'none',
    background: '#FFFFFF', boxSizing: 'border-box',
    transition: 'border-color 0.2s', fontFamily: 'inherit',
  };
  const labelStyle = { display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px', fontWeight: '500' };
  const sectionStyle = { background: '#FFFFFF', borderRadius: '6px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' };
  const sectionTitleStyle = { fontSize: '11px', fontWeight: '600', color: '#FF5722', marginBottom: '13px', paddingBottom: '8px', borderBottom: '1px solid #e0e0e0' };

  const isGoat = formData.order_type === 'Goat (Hissa)';

  return (
    <>
      <style>{`
        @keyframes modalSlideInFromLeft {
          from { transform: translateX(-18px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }

        @media (max-width: 767px) {
          .no-root  { padding: 14px 12px 32px !important; }
          .no-header-back { display: none !important; }
          .no-title { font-size: 16px !important; }
          .no-section { padding: 14px 12px !important; margin-bottom: 12px !important; border-radius: 10px !important; }
          .no-section-title { font-size: 12px !important; margin-bottom: 12px !important; }
          .no-grid { grid-template-columns: 1fr !important; gap: 10px !important; }
          .no-input { padding: 10px 12px !important; font-size: 13px !important; border-radius: 8px !important; }
          .no-label { font-size: 11px !important; margin-bottom: 4px !important; }
          .no-keep  { padding: 10px 12px !important; border-radius: 8px !important; }
          .no-keep label { font-size: 11px !important; }
          .no-keep input[type="checkbox"] { width: 16px !important; height: 16px !important; }
          .no-actions { flex-direction: column !important; gap: 8px !important; margin-top: 14px !important; }
          .no-btn-cancel, .no-btn-submit { width: 100% !important; padding: 12px !important; font-size: 13px !important; border-radius: 10px !important; text-align: center !important; justify-content: center !important; }
          .no-btn-submit { order: -1; }
          .no-alert { font-size: 12px !important; padding: 10px 12px !important; border-radius: 8px !important; }
          /* duplicate modal responsive */
          .no-dup-modal { padding: 16px !important; border-radius: 12px !important; }
          .no-dup-modal { animation: modalSlideInFromLeft .25s ease-out both !important; }
          .no-dup-modal h3 { font-size: 13px !important; }
          .no-dup-modal p { font-size: 12px !important; }
          .no-dup-detail { font-size: 12px !important; }
        }
      `}</style>

      <div
        className="no-root"
        style={{
          padding: '19px', fontFamily: "'Poppins', 'Inter', sans-serif",
          display: 'flex', flexDirection: 'column', minHeight: 0,
          height: '100%', overflow: 'auto', boxSizing: 'border-box', background: '#F9FAFB',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', flexShrink: 0 }}>
          <h2 className="no-title" style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0 }}>New Booking Order</h2>
          <button
            className="no-header-back"
            type="button"
            onClick={() => navigate('/bookings/orders')}
            style={{ padding: '6px 13px', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#FFFFFF', color: '#666', fontSize: '11px', cursor: 'pointer', fontWeight: '500' }}
            onMouseOver={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
            onMouseOut={(e)  => { e.currentTarget.style.background = '#FFFFFF'; }}
          >
            Back to Orders
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="no-alert" style={{ background: '#FFF5F2', color: '#FF5722', padding: '8px 11px', borderRadius: '6px', marginBottom: '13px', fontSize: '10px', border: '1px solid #FFE0D6', flexShrink: 0 }}>
            {error}
          </div>
        )}
        {success && (
          <div className="no-alert" style={{ background: '#F0FDF4', color: '#166534', padding: '8px 11px', borderRadius: '6px', marginBottom: '13px', fontSize: '10px', border: '1px solid #BBF7D0', flexShrink: 0 }}>
            {success}
          </div>
        )}

        {/* Duplicate Error Modal */}
        {duplicateError && (
          <div
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
            onClick={() => setDuplicateError(null)}
          >
            <div
              className="no-dup-modal"
              style={{ background: '#FFFFFF', borderRadius: '8px', padding: '20px', maxWidth: '500px', width: '100%', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '12px', flexShrink: 0 }}>
                  <span style={{ fontSize: '20px' }}>⚠️</span>
                </div>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#1F2937', margin: 0 }}>Duplicate Cow/Hissa Combination</h3>
              </div>
              <p style={{ fontSize: '11px', color: '#6B7280', marginBottom: '16px', lineHeight: '1.5' }}>
                This cow number and hissa number combination already exists for the selected order type and day.
              </p>
              <div style={{ background: '#F9FAFB', borderRadius: '6px', padding: '12px', marginBottom: '16px' }}>
                <div style={{ fontSize: '10px', color: '#6B7280', marginBottom: '4px' }}>Existing Order Details:</div>
                <div className="no-dup-detail" style={{ fontSize: '11px', color: '#1F2937' }}>
                  <div><strong>Order ID:</strong> {duplicateError.order_id}</div>
                  <div><strong>Booking Name:</strong> {duplicateError.booking_name || '—'}</div>
                  <div><strong>Shareholder:</strong> {duplicateError.shareholder_name || '—'}</div>
                  <div><strong>Contact:</strong> {duplicateError.contact || '—'}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDuplicateError(null)}
                style={{ width: '100%', padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#FF5722', color: '#FFFFFF', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                onMouseOver={(e) => { e.currentTarget.style.background = '#E64A19'; }}
                onMouseOut={(e)  => { e.currentTarget.style.background = '#FF5722'; }}
              >
                Close
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>

          {/* Order Information */}
          <div className="no-section" style={sectionStyle}>
            <div className="no-section-title" style={sectionTitleStyle}>Order Information</div>
            <div className="no-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '13px' }}>

              <div>
                <label className="no-label" style={labelStyle}>Order ID <span style={{ color: '#FF5722' }}>*</span></label>
                <input className="no-input" type="text" value={formData.order_id} readOnly style={{ ...inputStyle, background: '#F5F5F5', cursor: 'not-allowed', color: '#666' }} />
              </div>
              <div>
                <label className="no-label" style={labelStyle}>Customer ID <span style={{ color: '#FF5722' }}>*</span></label>
                <input className="no-input" type="text" value={formData.customer_id} readOnly style={{ ...inputStyle, background: '#F5F5F5', cursor: 'not-allowed', color: '#666' }} />
              </div>
              <div>
                <label className="no-label" style={labelStyle}>Order Type <span style={{ color: '#FF5722' }}>*</span></label>
                <select className="no-input" value={formData.order_type} onChange={handleOrderTypeChange} required style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')} onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}>
                  <option value="" disabled>Select Order Type</option>
                  {orderTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="no-label" style={labelStyle}>Contact <span style={{ color: '#FF5722' }}>*</span></label>
                <input className="no-input" type="text" value={formData.contact} onChange={handleContactChange} required placeholder="e.g., 0300-1234567" style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')} onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')} />
              </div>
              <div>
                <label className="no-label" style={labelStyle}>Alt. Contact</label>
                <input className="no-input" type="text" value={formData.alt_contact} onChange={(e) => setFormData((p) => ({ ...p, alt_contact: e.target.value }))} placeholder="e.g., 0300-1234567" style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')} onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')} />
              </div>
              <div>
                <label className="no-label" style={labelStyle}>Booking Date <span style={{ color: '#FF5722' }}>*</span></label>
                <input className="no-input" type="date" value={formData.booking_date} onChange={(e) => setFormData((p) => ({ ...p, booking_date: e.target.value }))} required style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')} onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')} />
              </div>
              <div>
                <label className="no-label" style={labelStyle}>Total Amount <span style={{ color: '#FF5722' }}>*</span></label>
                <input className="no-input" type="number" value={formData.total_amount} onChange={(e) => setFormData((p) => ({ ...p, total_amount: e.target.value }))} required min="0" step="0.01" placeholder="0.00" style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')} onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')} />
              </div>
              <div>
                <label className="no-label" style={labelStyle}>Order Source <span style={{ color: '#FF5722' }}>*</span></label>
                <select className="no-input" value={formData.order_source} onChange={(e) => setFormData((p) => ({ ...p, order_source: e.target.value }))} required style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')} onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}>
                  <option value="" disabled>Select Order Source</option>
                  {ORDER_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="no-label" style={labelStyle}>Reference <span style={{ color: '#FF5722' }}>*</span></label>
                <input
                  className="no-input"
                  type="text"
                  list="new-order-reference-suggestions"
                  value={formData.reference}
                  onChange={(e) => setFormData((p) => ({ ...p, reference: e.target.value }))}
                  placeholder="Type or select reference"
                  required
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')} onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
                />
                <datalist id="new-order-reference-suggestions">
                  {referenceSuggestions.map((r) => <option key={r} value={r} />)}
                </datalist>
              </div>
              <div>
                <label className="no-label" style={labelStyle}>Closed By <span style={{ color: '#FF5722' }}>*</span></label>
                <select className="no-input" value={formData.closed_by} onChange={(e) => setFormData((p) => ({ ...p, closed_by: e.target.value }))} required style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')} onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}>
                  <option value="" disabled>Select Closed By</option>
                  {REFERENCES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="no-label" style={labelStyle}>Slot <span style={{ color: '#FF5722' }}>*</span></label>
                <select className="no-input" value={formData.slot} onChange={(e) => setFormData((p) => ({ ...p, slot: e.target.value }))} required style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')} onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}>
                  <option value="" disabled>Select Slot</option>
                  {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="no-label" style={labelStyle}>Day <span style={{ color: '#FF5722' }}>*</span></label>
                <select className="no-input" value={formData.day} onChange={handleDayChange} required style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')} onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}>
                  <option value="" disabled>Select Day</option>
                  {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

            </div>
          </div>

          {/* Customer Information */}
          <div className="no-section" style={sectionStyle}>
            <div className="no-section-title" style={sectionTitleStyle}>Customer Information</div>
            <div className="no-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '13px' }}>
              <div>
                <label className="no-label" style={labelStyle}>Booking Name <span style={{ color: '#FF5722' }}>*</span></label>
                <input className="no-input" type="text" value={formData.booking_name} onChange={(e) => setFormData((p) => ({ ...p, booking_name: e.target.value }))} required placeholder="Enter booking name" style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')} onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')} />
              </div>
              <div>
                <label className="no-label" style={labelStyle}>Shareholder Name <span style={{ color: '#FF5722' }}>*</span></label>
                <input className="no-input" type="text" value={formData.shareholder_name} onChange={(e) => setFormData((p) => ({ ...p, shareholder_name: e.target.value }))} required placeholder="Enter shareholder name" style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')} onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')} />
              </div>
              <div>
                <label className="no-label" style={labelStyle}>Area <span style={{ color: '#FF5722' }}>*</span></label>
                <input className="no-input" type="text" value={formData.area} onChange={(e) => setFormData((p) => ({ ...p, area: e.target.value }))} placeholder="Enter area" style={inputStyle} required
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')} onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="no-label" style={labelStyle}>Address <span style={{ color: '#FF5722' }}>*</span></label>
                <textarea className="no-input" value={formData.address} onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))} placeholder="Enter full address" rows="2"
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} required
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')} onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')} />
              </div>
            </div>
          </div>

          {/* Livestock Information */}
          <div className="no-section" style={{ ...sectionStyle, opacity: isGoat ? 0.6 : 1, pointerEvents: isGoat ? 'none' : 'auto' }}>
            <div className="no-section-title" style={sectionTitleStyle}>Livestock Information</div>
            <div className="no-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '13px' }}>
              <div>
                <label className="no-label" style={labelStyle}>Cow Number</label>
                <input className="no-input" type="text" value={formData.cow_number} onChange={handleCowNumberChange} placeholder="Enter cow number" style={inputStyle} disabled={isGoat}
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')} onBlur={(e) => { e.target.style.borderColor = '#e0e0e0'; handleCowNumberBlur(); }} />
              </div>
              <div>
                <label className="no-label" style={labelStyle}>Hissa Number</label>
                <input className="no-input" type="text" value={formData.hissa_number} onChange={handleHissaNumberChange} placeholder="Enter hissa number" style={inputStyle} disabled={isGoat}
                  onFocus={(e) => (e.target.style.borderColor = '#FF5722')} onBlur={(e) => { e.target.style.borderColor = '#e0e0e0'; handleHissaNumberBlur(); }} />
              </div>
            </div>
          </div>

          {/* Additional Information */}
          <div className="no-section" style={sectionStyle}>
            <div className="no-section-title" style={sectionTitleStyle}>Additional Information</div>
            <div>
              <label className="no-label" style={labelStyle}>Description</label>
              <textarea className="no-input" value={formData.description} onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))} placeholder="Enter any additional notes or description" rows="3"
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                onFocus={(e) => (e.target.style.borderColor = '#FF5722')} onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')} />
            </div>
          </div>

          {/* Keep Form Data */}
          <div className="no-keep" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '13px', padding: '10px', background: '#F9FAFB', borderRadius: '6px', border: '1px solid #e0e0e0' }}>
            <input type="checkbox" id="keepFormData" checked={keepFormData} onChange={(e) => setKeepFormData(e.target.checked)}
              style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#FF5722' }} />
            <label htmlFor="keepFormData" style={{ fontSize: '10px', color: '#666', cursor: 'pointer', userSelect: 'none' }}>
              Keep form data after submission (regenerate Order ID, Cow &amp; Hissa numbers)
            </label>
          </div>

          {/* Actions */}
          <div className="no-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px', flexShrink: 0 }}>
            <button type="button" className="no-btn-cancel" onClick={() => navigate('/bookings/orders')}
              style={{ padding: '6px 13px', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#FFFFFF', color: '#666', fontSize: '11px', cursor: 'pointer', fontWeight: '500' }}
              onMouseOver={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
              onMouseOut={(e)  => { e.currentTarget.style.background = '#FFFFFF'; }}>
              Cancel
            </button>
            <button type="submit" className="no-btn-submit" disabled={loading}
              style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', background: loading ? '#94A3B8' : '#FF5722', color: '#FFFFFF', fontSize: '11px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: '600' }}
              onMouseOver={(e) => { if (!loading) e.currentTarget.style.background = '#E64A19'; }}
              onMouseOut={(e)  => { if (!loading) e.currentTarget.style.background = '#FF5722'; }}>
              {loading ? 'Creating...' : 'Create Order'}
            </button>
          </div>

        </form>
      </div>
    </>
  );
};

export default NewOrder;