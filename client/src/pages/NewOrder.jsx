import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const API = 'http://localhost:5000';

const ORDER_TYPES = [
  'Cow',
  'Goat (Hissa)',
  'Hissa - Standard',
  'Hissa - Premium',
  'Hissa - Waqf',
  'Goat',
];

const ORDER_SOURCES = [
  'Tele-Sales',
  'Social Media (Organic)',
  'Social Media (Ads)',
  'Previous Customer',
  'Website',
];

const SLOTS = ['SLOT 1', 'SLOT 2', 'SLOT 3', 'SLOT GOAT', 'SLOT WAQF'];

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

const NewOrder = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    order_id: '',
    customer_id: '',
    contact: '',
    order_type: '',
    booking_name: '',
    shareholder_name: '',
    cow_number: '',
    hissa_number: '',
    alt_contact: '',
    address: '',
    area: '',
    day: '',
    booking_date: '',
    total_amount: '',
    order_source: '',
    reference: '',
    description: '',
    slot: '',
  });

  // Generate customer ID when contact changes (with debouncing)
  const generateCustomerIdRef = useCallback(async (contact) => {
    if (!contact || contact.length < 3) {
      setFormData((prev) => ({ ...prev, customer_id: '' }));
      return;
    }

    const currentToken = localStorage.getItem('token');
    if (!currentToken) {
      return;
    }

    try {
      const res = await fetch(`${API}/api/booking/generate-customer-id`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({ contact }),
      });

      if (res.ok) {
        const data = await res.json();
        setFormData((prev) => ({ ...prev, customer_id: data.customer_id }));
      }
    } catch (err) {
      console.error('Error generating customer ID:', err);
    }
  }, []);

  // Debounced version - use ref to store timeout
  const debounceTimeoutRef = useRef(null);
  const generateCustomerId = useCallback((contact) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      generateCustomerIdRef(contact);
    }, 500);
  }, [generateCustomerIdRef]);

  // Generate order ID when order_type changes
  const generateOrderId = useCallback(async (orderType) => {
    if (!orderType) {
      setFormData((prev) => ({ ...prev, order_id: '' }));
      return;
    }

    const currentToken = localStorage.getItem('token');
    if (!currentToken) {
      return;
    }

    try {
      const res = await fetch(`${API}/api/booking/generate-order-id`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({ order_type: orderType }),
      });

      if (res.ok) {
        const data = await res.json();
        setFormData((prev) => ({ ...prev, order_id: data.order_id }));
      }
    } catch (err) {
      console.error('Error generating order ID:', err);
    }
  }, []);

  // Get available cow/hissa when order_type or day changes
  const getAvailableCowHissa = useCallback(async (orderType, day) => {
    if (!orderType) {
      setFormData((prev) => ({ ...prev, cow_number: '', hissa_number: '' }));
      return;
    }

    const currentToken = localStorage.getItem('token');
    if (!currentToken) {
      return;
    }

    try {
      const res = await fetch(`${API}/api/booking/get-available-cow-hissa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({ order_type: orderType, day: day || null }),
      });

      if (res.ok) {
        const data = await res.json();
        setFormData((prev) => ({
          ...prev,
          cow_number: data.cow_number,
          hissa_number: data.hissa_number,
        }));
      }
    } catch (err) {
      console.error('Error getting available cow/hissa:', err);
    }
  }, []);

  // Handle contact change
  const handleContactChange = (e) => {
    const value = e.target.value;
    setFormData((prev) => ({ ...prev, contact: value }));
    generateCustomerId(value);
  };

  // Handle order type change
  const handleOrderTypeChange = async (e) => {
    const value = e.target.value;
    setFormData((prev) => {
      // Update state first
      const newData = { ...prev, order_type: value };
      // Then trigger async operations
      generateOrderId(value);
      // Recalculate cow/hissa with current day value
      getAvailableCowHissa(value, prev.day);
      return newData;
    });
  };

  // Handle day change
  const handleDayChange = async (e) => {
    const value = e.target.value;
    setFormData((prev) => {
      // Update state first
      const newData = { ...prev, day: value };
      // Recalculate cow/hissa when day changes (if order_type is set)
      if (prev.order_type) {
        getAvailableCowHissa(prev.order_type, value);
      }
      return newData;
    });
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const currentToken = localStorage.getItem('token');
    if (!currentToken) {
      setError('You must be logged in to create an order');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API}/api/booking/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess('Order created successfully!');
        setTimeout(() => {
          navigate('/bookings/orders');
        }, 1500);
      } else {
        setError(data.message || 'Failed to create order');
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
      <div
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
        <h2
          style={{
            fontSize: '14px',
            fontWeight: '600',
            color: '#333',
            margin: 0,
          }}
        >
          New Booking Order
        </h2>
        <button
          onClick={() => navigate('/bookings/orders')}
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
          onMouseOver={(e) => {
            e.target.style.background = '#F5F5F5';
          }}
          onMouseOut={(e) => {
            e.target.style.background = '#FFFFFF';
          }}
        >
          Back to Orders
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
            flexShrink: 0,
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
            flexShrink: 0,
          }}
        >
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Order Information */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Order Information</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '13px' }}>
            <div>
              <label style={labelStyle}>
                Order ID <span style={{ color: '#FF5722' }}>*</span>
              </label>
              <input
                type="text"
                value={formData.order_id}
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
              <label style={labelStyle}>
                Customer ID <span style={{ color: '#FF5722' }}>*</span>
              </label>
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
              <label style={labelStyle}>
                Order Type <span style={{ color: '#FF5722' }}>*</span>
              </label>
              <select
                value={formData.order_type}
                onChange={handleOrderTypeChange}
                required
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
              >
                <option value="">Select Order Type</option>
                {ORDER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>
                Contact <span style={{ color: '#FF5722' }}>*</span>
              </label>
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
                onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
              />
            </div>
            <div>
              <label style={labelStyle}>
                Booking Date <span style={{ color: '#FF5722' }}>*</span>
              </label>
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
              <label style={labelStyle}>
                Total Amount <span style={{ color: '#FF5722' }}>*</span>
              </label>
              <input
                type="number"
                value={formData.total_amount}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, total_amount: e.target.value }))
                }
                required
                min="0"
                step="0.01"
                placeholder="0.00"
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
                onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
              >
                <option value="">Select Order Source</option>
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
                onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
              >
                <option value="">Select Reference</option>
                {REFERENCES.map((ref) => (
                  <option key={ref} value={ref}>
                    {ref}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Slot</label>
              <select
                value={formData.slot}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, slot: e.target.value }))
                }
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
              >
                <option value="">Select Slot</option>
                {SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Day</label>
              <select
                value={formData.day}
                onChange={handleDayChange}
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
              >
                <option value="">Select Day</option>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '13px' }}>
            <div>
              <label style={labelStyle}>
                Booking Name <span style={{ color: '#FF5722' }}>*</span>
              </label>
              <input
                type="text"
                value={formData.booking_name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, booking_name: e.target.value }))
                }
                required
                placeholder="Enter booking name"
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
              />
            </div>
            <div>
              <label style={labelStyle}>
                Shareholder Name <span style={{ color: '#FF5722' }}>*</span>
              </label>
              <input
                type="text"
                value={formData.shareholder_name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, shareholder_name: e.target.value }))
                }
                required
                placeholder="Enter shareholder name"
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
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
                onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
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
                onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
              />
            </div>
          </div>
        </div>

        {/* Livestock Information */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Livestock Information</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '13px' }}>
            <div>
              <label style={labelStyle}>Cow Number</label>
              <input
                type="text"
                value={formData.cow_number}
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
              <label style={labelStyle}>Hissa Number</label>
              <input
                type="text"
                value={formData.hissa_number}
                readOnly
                style={{
                  ...inputStyle,
                  background: '#F5F5F5',
                  cursor: 'not-allowed',
                  color: '#666',
                }}
              />
            </div>
          </div>
        </div>

        {/* Additional Information */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Additional Information</div>
            <div>
              <label style={labelStyle}>Description</label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Enter any additional notes or description"
                rows="3"
                style={{
                  ...inputStyle,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                onBlur={(e) => (e.target.style.borderColor = '#e0e0e0')}
              />
            </div>
        </div>

        {/* Submit Button */}
        <div
          style={{
            display: 'flex',
            gap: '10px',
            justifyContent: 'flex-end',
            marginTop: '16px',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => navigate('/bookings/orders')}
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
            onMouseOver={(e) => {
              e.target.style.background = '#F5F5F5';
            }}
            onMouseOut={(e) => {
              e.target.style.background = '#FFFFFF';
            }}
          >
            Cancel
          </button>
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
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => {
              if (!loading) e.target.style.background = '#E64A19';
            }}
            onMouseOut={(e) => {
              if (!loading) e.target.style.background = '#FF5722';
            }}
          >
            {loading ? 'Creating...' : 'Create Order'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewOrder;

