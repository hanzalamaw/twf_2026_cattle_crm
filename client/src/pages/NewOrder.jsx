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
  const [keepFormData, setKeepFormData] = useState(false);
  const [duplicateError, setDuplicateError] = useState(null);

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
  const getAvailableCowHissa = useCallback(async (orderType, day, bookingDate) => {
    if (!orderType) {
      setFormData((prev) => ({ ...prev, cow_number: '', hissa_number: '' }));
      return;
    }

    // For Goat (Hissa) - set to '0' and make editable (no duplicate check when both are 0)
    const editableTypes = ['Goat (Hissa)'];
    if (editableTypes.includes(orderType)) {
      setFormData((prev) => ({
        ...prev,
        cow_number: '0',
        hissa_number: '0',
      }));
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
        body: JSON.stringify({ order_type: orderType, day: day || null, booking_date: bookingDate || null }),
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

  // Preset total amounts based on order type
  const getPresetAmount = (orderType) => {
    const amountMap = {
      'Hissa - Standard': '25000',
      'Hissa - Premium': '29700',
      'Hissa - Waqf': '21000',
      'Goat (Hissa)': '',
    };
    return amountMap[orderType] || '';
  };

  // When Goat (Hissa) is selected and cow/hissa are both 0, skip duplicate check
  const shouldSkipCowHissaDuplicate = (orderType, cowNumber, hissaNumber) => {
    if (orderType !== 'Goat (Hissa)') return false;
    const c = String(cowNumber ?? '').trim();
    const h = String(hissaNumber ?? '').trim();
    return (c === '0' || c === '') && (h === '0' || h === '');
  };

  // Handle order type change
  const handleOrderTypeChange = async (e) => {
    const value = e.target.value;
    const presetAmount = getPresetAmount(value);
    setFormData((prev) => {
      // Update state first
      const newData = { ...prev, order_type: value, total_amount: presetAmount };
      // Then trigger async operations
      generateOrderId(value);
      // Recalculate cow/hissa with current day value
      getAvailableCowHissa(value, prev.day, prev.booking_date);
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
        getAvailableCowHissa(prev.order_type, value, prev.booking_date);
      }
      return newData;
    });
  };

  // Check if cow/hissa combination already exists
  const checkCowHissaDuplicate = useCallback(async (cowNumber, hissaNumber, orderType, day, bookingDate) => {
    if (!cowNumber || !hissaNumber || !orderType) {
      return null;
    }
    if (shouldSkipCowHissaDuplicate(orderType, cowNumber, hissaNumber)) {
      return null;
    }

    const currentToken = localStorage.getItem('token');
    if (!currentToken) {
      return null;
    }

    try {
      const res = await fetch(`${API}/api/booking/check-cow-hissa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({
          cow_number: cowNumber,
          hissa_number: hissaNumber,
          order_type: orderType,
          day: day || null,
          booking_date: bookingDate || null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        return data.exists ? data : null;
      }
    } catch (err) {
      console.error('Error checking cow/hissa duplicate:', err);
    }
    return null;
  }, []);

  // Handle cow number change
  const handleCowNumberChange = (e) => {
    const value = e.target.value;
    setFormData((prev) => ({ ...prev, cow_number: value }));
    setDuplicateError(null);
  };

  // Handle cow number blur (validate on blur)
  const handleCowNumberBlur = async () => {
    const { cow_number, hissa_number, order_type, day, booking_date } = formData;
    if (cow_number && hissa_number && order_type && !shouldSkipCowHissaDuplicate(order_type, cow_number, hissa_number)) {
      const duplicate = await checkCowHissaDuplicate(cow_number, hissa_number, order_type, day, booking_date);
      if (duplicate) {
        setDuplicateError(duplicate);
      }
    }
  };

  // Handle hissa number change
  const handleHissaNumberChange = (e) => {
    const value = e.target.value;
    setFormData((prev) => ({ ...prev, hissa_number: value }));
    setDuplicateError(null);
  };

  // Handle hissa number blur (validate on blur)
  const handleHissaNumberBlur = async () => {
    const { cow_number, hissa_number, order_type, day, booking_date } = formData;
    if (cow_number && hissa_number && order_type && !shouldSkipCowHissaDuplicate(order_type, cow_number, hissa_number)) {
      const duplicate = await checkCowHissaDuplicate(cow_number, hissa_number, order_type, day, booking_date);
      if (duplicate) {
        setDuplicateError(duplicate);
      }
    }
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setDuplicateError(null);
    setLoading(true);

    // Check for duplicate cow/hissa before submission (skip when Goat (Hissa) with cow/hissa both 0)
    const { cow_number, hissa_number, order_type, day, booking_date } = formData;
    if (cow_number && hissa_number && order_type && !shouldSkipCowHissaDuplicate(order_type, cow_number, hissa_number)) {
      const duplicate = await checkCowHissaDuplicate(cow_number, hissa_number, order_type, day, booking_date);
      if (duplicate) {
        setDuplicateError(duplicate);
        setLoading(false);
        return;
      }
    }

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
        
        if (keepFormData) {
          // Regenerate order ID, cow/hissa numbers, and keep other fields
          const currentOrderType = formData.order_type;
          const currentDay = formData.day;
          
          // Regenerate order ID
          generateOrderId(currentOrderType);
          
          // Regenerate cow/hissa numbers
          getAvailableCowHissa(currentOrderType, currentDay, formData.booking_date);
          
          // Clear only order_id, cow_number, and hissa_number (they will be regenerated)
          // Keep all other fields
          setTimeout(() => {
            setSuccess('');
          }, 2000);
        } else {
          // Stay on same page; success message already shown
          setTimeout(() => setSuccess(''), 3000);
        }
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

      {/* Duplicate Error Dialog */}
      {duplicateError && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setDuplicateError(null)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '8px',
              padding: '20px',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: '#FEE2E2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '12px',
                }}
              >
                <span style={{ fontSize: '20px', color: '#DC2626' }}>⚠️</span>
              </div>
              <h3
                style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#1F2937',
                  margin: 0,
                }}
              >
                Duplicate Cow/Hissa Combination
              </h3>
            </div>
            <p
              style={{
                fontSize: '11px',
                color: '#6B7280',
                marginBottom: '16px',
                lineHeight: '1.5',
              }}
            >
              This cow number and hissa number combination already exists for the selected order type and day.
            </p>
            <div
              style={{
                background: '#F9FAFB',
                borderRadius: '6px',
                padding: '12px',
                marginBottom: '16px',
              }}
            >
              <div style={{ fontSize: '10px', color: '#6B7280', marginBottom: '4px' }}>
                Existing Order Details:
              </div>
              <div style={{ fontSize: '11px', color: '#1F2937' }}>
                <div><strong>Order ID:</strong> {duplicateError.order_id}</div>
                <div><strong>Booking Name:</strong> {duplicateError.booking_name || '—'}</div>
                <div><strong>Shareholder:</strong> {duplicateError.shareholder_name || '—'}</div>
                <div><strong>Contact:</strong> {duplicateError.contact || '—'}</div>
              </div>
            </div>
            <button
              onClick={() => setDuplicateError(null)}
              style={{
                width: '100%',
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                background: '#FF5722',
                color: '#FFFFFF',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseOver={(e) => {
                e.target.style.background = '#E64A19';
              }}
              onMouseOut={(e) => {
                e.target.style.background = '#FF5722';
              }}
            >
              Close
            </button>
          </div>
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
                <option value="" disabled>Select Order Type</option>
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
                <option value="" disabled={formData.order_source !== ''}>Select Order Source</option>
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
                <option value="" disabled={formData.reference !== ''}>Select Reference</option>
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
                <option value="" disabled={formData.slot !== ''}>Select Slot</option>
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
                <option value="" disabled={formData.day !== ''}>Select Day</option>
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

        {/* Livestock Information (disabled for Goat (Hissa)) */}
        {(() => {
          const isGoatHissa = formData.order_type === 'Goat (Hissa)';
          return (
            <div style={{ ...sectionStyle, opacity: isGoatHissa ? 0.6 : 1, pointerEvents: isGoatHissa ? 'none' : 'auto' }}>
              <div style={sectionTitleStyle}>Livestock Information</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '13px' }}>
                <div>
                  <label style={labelStyle}>Cow Number</label>
                  <input
                    type="text"
                    value={formData.cow_number}
                    onChange={handleCowNumberChange}
                    placeholder="Enter cow number"
                    style={inputStyle}
                    disabled={isGoatHissa}
                    onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e0e0e0';
                      handleCowNumberBlur();
                    }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Hissa Number</label>
                  <input
                    type="text"
                    value={formData.hissa_number}
                    onChange={handleHissaNumberChange}
                    placeholder="Enter hissa number"
                    style={inputStyle}
                    disabled={isGoatHissa}
                    onFocus={(e) => (e.target.style.borderColor = '#FF5722')}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e0e0e0';
                      handleHissaNumberBlur();
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })()}

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

        {/* Keep Form Data Option */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '13px',
            padding: '10px',
            background: '#F9FAFB',
            borderRadius: '6px',
            border: '1px solid #e0e0e0',
          }}
        >
          <input
            type="checkbox"
            id="keepFormData"
            checked={keepFormData}
            onChange={(e) => setKeepFormData(e.target.checked)}
            style={{
              width: '14px',
              height: '14px',
              cursor: 'pointer',
              accentColor: '#FF5722',
            }}
          />
          <label
            htmlFor="keepFormData"
            style={{
              fontSize: '10px',
              color: '#666',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            Keep form data after submission (regenerate Order ID, Cow & Hissa numbers)
          </label>
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

