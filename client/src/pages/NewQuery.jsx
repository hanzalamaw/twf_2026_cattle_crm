import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const API = 'http://localhost:5000';

const ORDER_TYPES = [
  'Hissa - Standard',
  'Hissa - Premium',
  'Hissa - Waqf',
  'Goat',
  'Cow',
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

const NewQuery = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [keepFormData, setKeepFormData] = useState(false);
  const [duplicateError, setDuplicateError] = useState(null);

  const [formData, setFormData] = useState({
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
  });

  // ---------- Generate Lead ID (same pattern as order_id: L-0001-2026) ----------
  const generateLeadIdRef = useCallback(async (orderType) => {
    if (!orderType) {
      setFormData((prev) => ({ ...prev, lead_id: '' }));
      return;
    }

    const currentToken = localStorage.getItem('token');
    if (!currentToken) return;

    try {
      const res = await fetch(`${API}/api/leads/generate-lead-id`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        const data = await res.json();
        setFormData((prev) => ({ ...prev, lead_id: data.lead_id || '' }));
      }
    } catch (err) {
      console.error('Error generating lead ID:', err);
    }
  }, []);

  // ---------- Generate Customer ID (debounced, like NewOrder) ----------
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({ contact: String(contact).trim() }),
      });
      const data = await res.json();
      if (res.ok && data.customer_id) {
        setFormData((prev) => ({ ...prev, customer_id: data.customer_id }));
      } else {
        setFormData((prev) => ({ ...prev, customer_id: '' }));
      }
    } catch (err) {
      console.error('Error generating customer ID:', err);
    }
  }, []);

  const debounceTimeoutRef = useRef(null);
  const generateCustomerId = useCallback((contact) => {
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = setTimeout(() => generateCustomerIdRef(contact), 500);
  }, [generateCustomerIdRef]);

  // ---------- Preset Total Amount Based on Order Type ----------
  const getPresetAmount = (orderType) => {
    const amountMap = {
      'Hissa - Standard': '25000',
      'Hissa - Premium': '29700',
      'Hissa - Waqf': '21000',
      'Cow': '',
      'Goat (Hissa)': '',
      'Goat': '',
    };
    return amountMap[orderType] || '';
  };

  // ---------- Handle Order Type Change ----------
  const handleOrderTypeChange = (e) => {
    const value = e.target.value;
    const presetAmount = getPresetAmount(value);
    setFormData((prev) => {
      // Update state first
      const newData = { ...prev, order_type: value, total_amount: presetAmount };
      // Then trigger async operations
      generateLeadIdRef(value); // Generate Lead ID based on order type
      return newData;
    });
  };

  const handleContactChange = (e) => {
    const value = e.target.value;
    setFormData((prev) => ({ ...prev, contact: value }));
    generateCustomerId(value);
  };

  // ---------- Handle Form Submission ----------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setDuplicateError(null);
    setLoading(true);

    const currentToken = localStorage.getItem('token');
    if (!currentToken) {
      setError('You must be logged in to create a query');
      setLoading(false);
      return;
    }

    const contactStr = String(formData.contact || '').trim();
    const bookingNameStr = String(formData.booking_name || '').trim();
    if (!contactStr || contactStr.length < 3) {
      setError('Contact is required (minimum 3 characters)');
      setLoading(false);
      return;
    }
    if (!formData.order_type) {
      setError('Order type is required');
      setLoading(false);
      return;
    }
    if (!bookingNameStr) {
      setError('Booking name is required');
      setLoading(false);
      return;
    }
    if (!formData.booking_date) {
      setError('Booking date is required');
      setLoading(false);
      return;
    }
    const totalNum = Number(formData.total_amount);
    if (!Number.isFinite(totalNum) || totalNum < 0) {
      setError('Total amount must be a valid positive number');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API}/api/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess('Lead created successfully!');
        setFormData((prev) => ({ ...prev, lead_id: '', customer_id: '' }));
      } else if (res.status === 401) {
        setError('Session expired. Please log in again.');
        setTimeout(() => navigate('/login'), 1500);
      } else {
        setError(data.message || 'Failed to create lead');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '6px 10px',
    borderRadius: '6px',
    border: '1px solid #e0e0e0',
    fontSize: '11px',
    outline: 'none',
    background: '#FFFFFF',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
    fontFamily: 'inherit',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '10px',
    color: '#666',
    marginBottom: '3px',
    fontWeight: '500',
  };

  const sectionStyle = {
    background: '#FFFFFF',
    borderRadius: '6px',
    padding: '16px',
    marginBottom: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  };

  const sectionTitleStyle = {
    fontSize: '11px',
    fontWeight: '600',
    color: '#FF5722',
    marginBottom: '13px',
    paddingBottom: '8px',
    borderBottom: '1px solid #e0e0e0',
  };

  return (
    <div
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
      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', flexShrink: 0 }}>
        <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0 }}>New Lead</h2>
        <button
          type="button"
          onClick={() => navigate('/bookings/queries')}
          style={{
            padding: '6px 13px',
            borderRadius: '6px',
            border: '1px solid #e0e0e0',
            background: '#FFFFFF',
            color: '#666',
            fontSize: '11px',
            cursor: 'pointer',
            fontWeight: '500',
            transition: 'all 0.2s',
          }}
          onMouseOver={(e) => { e.target.style.background = '#F5F5F5'; }}
          onMouseOut={(e) => { e.target.style.background = '#FFFFFF'; }}
        >
          Back to Queries
        </button>
      </div>

      {error && (
        <div
          style={{
            background: '#FFF5F2',
            color: '#FF5722',
            padding: '8px 11px',
            borderRadius: '6px',
            marginBottom: '13px',
            fontSize: '10px',
            border: '1px solid #FFE0D6',
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            background: '#F0FDF4',
            color: '#166534',
            padding: '8px 11px',
            borderRadius: '6px',
            marginBottom: '13px',
            fontSize: '10px',
            border: '1px solid #BBF7D0',
          }}
        >
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Lead Information */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Lead Information</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '13px',
            }}
          >
            <div>
              <label style={labelStyle}>Lead ID <span style={{ color: '#FF5722' }}>*</span></label>
              <input
                type="text"
                value={formData.lead_id}
                readOnly
                style={{
                  ...inputStyle,
                  background: '#F5F5F5',
                  cursor: 'not-allowed',
                  color: '#666',
                }}
              />
            </div>

            <div>
              <label style={labelStyle}>Customer ID</label>
              <input
                type="text"
                value={formData.customer_id}
                readOnly
                style={{
                  ...inputStyle,
                  background: '#F5F5F5',
                  cursor: 'not-allowed',
                  color: '#666',
                }}
              />
            </div>

            <div>
              <label style={labelStyle}>Order Type <span style={{ color: '#FF5722' }}>*</span></label>
              <select
                value={formData.order_type}
                onChange={handleOrderTypeChange}
                style={inputStyle}
                required
                onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
              >
                <option value="" disabled>Select Order Type</option>
                {ORDER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Contact <span style={{ color: '#FF5722' }}>*</span></label>
              <input
                type="text"
                value={formData.contact}
                onChange={handleContactChange}
                required
                placeholder="e.g., 0300-1234567"
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
              />
            </div>

            <div>
              <label style={labelStyle}>Alt. Contact</label>
              <input
                type="text"
                value={formData.alt_contact}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, alt_contact: e.target.value }))
                }
                placeholder="e.g., 0300-1234567"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Booking Date <span style={{ color: '#FF5722' }}>*</span></label>
              <input
                type="date"
                value={formData.booking_date}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, booking_date: e.target.value }))
                }
                required
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
              />
            </div>

            <div>
              <label style={labelStyle}>Total Amount <span style={{ color: '#FF5722' }}>*</span></label>
              <input
                type="number"
                min="0"
                step="1"
                value={formData.total_amount}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, total_amount: e.target.value }))
                }
                required
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
              />
            </div>

            <div>
              <label style={labelStyle}>Order Source</label>
              <select
                value={formData.order_source}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, order_source: e.target.value }))
                }
                style={inputStyle}
              >
                <option value="" disabled>Select Order Source</option>
                {ORDER_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Reference</label>
              <select
                value={formData.reference}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, reference: e.target.value }))
                }
                style={inputStyle}
              >
                <option value="" disabled>Select Reference</option>
                {REFERENCES.map((ref) => (
                  <option key={ref} value={ref}>
                    {ref}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Day</label>
              <select
                value={formData.day}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, day: e.target.value }))
                }
                style={inputStyle}
              >
                <option value="" disabled>Select Day</option>
                {DAYS.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Customer Information */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Customer Information</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '13px',
            }}
          >
            <div>
              <label style={labelStyle}>Booking Name <span style={{ color: '#FF5722' }}>*</span></label>
              <input
                type="text"
                value={formData.booking_name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, booking_name: e.target.value }))
                }
                placeholder="Enter booking name"
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
              />
            </div>

            <div>
              <label style={labelStyle}>Shareholder Name</label>
              <input
                type="text"
                value={formData.shareholder_name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, shareholder_name: e.target.value }))
                }
                placeholder="Enter shareholder name"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Area</label>
              <input
                type="text"
                value={formData.area}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, area: e.target.value }))
                }
                placeholder="Enter area"
                style={inputStyle}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Address</label>
              <textarea
                value={formData.address}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, address: e.target.value }))
                }
                placeholder="Enter full address"
                rows="2"
                style={{
                  ...inputStyle,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          </div>
        </div>

        {/* Additional Information */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Additional Information</div>
          <textarea
            value={formData.description}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, description: e.target.value }))
            }
            placeholder="Enter any additional notes or description"
            rows="3"
            style={inputStyle}
          />
        </div>

        {/* Submit Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              border: 'none',
              background: loading ? '#94A3B8' : '#FF5722',
              color: '#FFFFFF',
              fontSize: '11px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: '600',
            }}
          >
            {loading ? 'Creating...' : 'Create Lead'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewQuery;