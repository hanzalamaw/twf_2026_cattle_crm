import { useState, useEffect, useCallback, useRef } from 'react';

const API = 'http://localhost:5000';

const ORDER_COLUMNS = [
  { key: 'customer_id', label: 'Customer ID' },
  { key: 'order_id', label: 'Order ID' },
  { key: 'type', label: 'Type' },
  { key: 'booking_name', label: 'Booking Name' },
  { key: 'shareholder_name', label: 'Shareholder Name' },
  { key: 'phone_number', label: 'Phone' },
  { key: 'total_amount', label: 'Total Amount' },
  { key: 'bank', label: 'Bank' },
  { key: 'cash', label: 'Cash' },
  { key: 'received', label: 'Received' },
  { key: 'pending', label: 'Pending' },
  { key: 'reference', label: 'Reference' },
  { key: 'payment_status', label: 'Status' },
];

function formatAmount(val) {
  if (val == null || val === '') return '—';
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  return `Rs ${Math.round(n).toLocaleString('en-PK')}`;
}

function formatDate(val) {
  if (val == null || val === '') return '—';
  const s = String(val);
  if (s.includes('T')) return s.split('T')[0];
  return s;
}

export default function Expenses() {
  const [summary, setSummary] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [amountVisible, setAmountVisible] = useState(false);
  const [filterMode, setFilterMode] = useState('onHand');
  const [modalOrder, setModalOrder] = useState(null);
  const [addBank, setAddBank] = useState('');
  const [addCash, setAddCash] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [paymentErrors, setPaymentErrors] = useState({});
  const [yearFilter, setYearFilter] = useState('all');
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [appliedTypes, setAppliedTypes] = useState([]);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const typeDropdownRef = useRef(null);

  const token = localStorage.getItem('token');

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/booking/transactions`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary || null);
      }
    } catch (e) {
      console.error(e);
    }
  }, [token]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const year = yearFilter || 'all';
      const res = await fetch(`${API}/api/booking/orders?year=${encodeURIComponent(year)}&page=1&limit=500`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setOrders(Array.isArray(data.data) ? data.data : []);
      } else {
        setError('Failed to load orders');
      }
    } catch (e) {
      setError('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [token, yearFilter]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (!typeDropdownOpen) return;
    const onDocClick = (e) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target)) setTypeDropdownOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [typeDropdownOpen]);

  const openModal = (order) => {
    setModalOrder(order);
    setAddBank('');
    setAddCash('');
    setPaymentErrors({});
  };

  const getPaymentRealtimeError = useCallback(() => {
    if (!modalOrder) return null;
    const pendingAmount = Number(modalOrder.pending) || 0;
    const addB = Math.max(0, parseFloat(addBank) || 0);
    const addC = Math.max(0, parseFloat(addCash) || 0);
    if (addB + addC > pendingAmount) return `Total added (Bank + Cash) cannot exceed pending (${formatAmount(pendingAmount)}).`;
    return null;
  }, [modalOrder, addBank, addCash]);

  const validatePayment = () => {
    const err = {};
    const bank = parseFloat(addBank);
    const cash = parseFloat(addCash);
    const addB = Math.max(0, Number.isNaN(bank) ? 0 : bank);
    const addC = Math.max(0, Number.isNaN(cash) ? 0 : cash);
    if (!Number.isNaN(bank) && bank < 0) err.addBank = 'Must be ≥ 0';
    if (!Number.isNaN(cash) && cash < 0) err.addCash = 'Must be ≥ 0';
    if (addB + addC === 0) err.add = 'Enter at least one amount (Add Bank or Add Cash ≥ 0).';
    const totalAmount = Number(modalOrder?.total_amount) || 0;
    const currentReceived = Number(modalOrder?.received) || 0;
    const newReceived = currentReceived + addB + addC;
    if (newReceived > totalAmount) err.add = err.add || `Total received cannot exceed total amount (${formatAmount(totalAmount)}).`;
    const pendingAmount = Number(modalOrder?.pending) || 0;
    if (addB + addC > pendingAmount) err.add = err.add || `Total added (Bank + Cash) cannot exceed pending (${formatAmount(pendingAmount)}).`;
    setPaymentErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSubmitPayment = async () => {
    if (!modalOrder) return;
    if (!validatePayment()) return;
    const bank = Math.max(0, parseFloat(addBank) || 0);
    const cash = Math.max(0, parseFloat(addCash) || 0);
    if (bank === 0 && cash === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/booking/orders/${encodeURIComponent(modalOrder.order_id)}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bank, cash }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setModalOrder(null);
        setAddBank('');
        setAddCash('');
        fetchSummary();
        fetchOrders();
      } else {
        setError(data.message || 'Failed to add payment');
      }
    } catch (e) {
      setError('Failed to add payment');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && orders.length === 0) {
    return (
      <div style={{ padding: '24px', fontFamily: "'Poppins', 'Inter', sans-serif" }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '20px' }}>Expenses</h2>
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Loading...</div>
      </div>
    );
  }

  const displayedOrders = appliedTypes.length > 0 ? orders.filter((o) => appliedTypes.includes(o.type)) : orders;
  const typeOptions = [...new Set(orders.map((o) => o.type).filter(Boolean))].sort();
  const s = summary || {};
  const totalExpensesBank = Number(s.totalExpensesBank) ?? 0;
  const totalExpensesCash = Number(s.totalExpensesCash) ?? 0;
  const totalBankFiltered = displayedOrders.reduce((sum, o) => sum + (Number(o.bank) || 0), 0);
  const totalCashFiltered = displayedOrders.reduce((sum, o) => sum + (Number(o.cash) || 0), 0);
  const typeFilterActive = appliedTypes.length > 0;
  const effectiveFilterMode = typeFilterActive ? 'actual' : filterMode;
  const bankOnlyAmount = effectiveFilterMode === 'onHand' ? totalBankFiltered - totalExpensesBank : totalBankFiltered;
  const cashAmount = effectiveFilterMode === 'onHand' ? totalCashFiltered - totalExpensesCash : totalCashFiltered;

  const currentBank = modalOrder ? Number(modalOrder.bank) || 0 : 0;
  const currentCash = modalOrder ? Number(modalOrder.cash) || 0 : 0;
  const newBank = currentBank + Math.max(0, parseFloat(addBank) || 0);
  const newCash = currentCash + Math.max(0, parseFloat(addCash) || 0);
  const currentReceived = modalOrder ? Number(modalOrder.received) || 0 : 0;
  const addTotal = Math.max(0, parseFloat(addBank) || 0) + Math.max(0, parseFloat(addCash) || 0);
  const newReceived = currentReceived + addTotal;
  const totalAmount = modalOrder ? Number(modalOrder.total_amount) || 0 : 0;
  const newPending = Math.max(0, totalAmount - newReceived);

  return (
    <div style={{ padding: '19px', fontFamily: "'Poppins', 'Inter', sans-serif", display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0, flexWrap: 'nowrap', gap: '10px' }}>
        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#333', flexShrink: 0 }}>Expenses</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap', marginLeft: 'auto' }} ref={typeDropdownRef}>
          <label style={{ fontSize: '10px', color: '#666', whiteSpace: 'nowrap' }}>Year</label>
          <select value={yearFilter} onChange={(e) => { setYearFilter(e.target.value); setAppliedTypes([]); setSelectedTypes([]); }} style={{ padding: '6px 10px', fontSize: '10px', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#fff', minWidth: '96px', cursor: 'pointer' }}>
            <option value="all">All</option>
            <option value="2026">Year 2026</option>
            <option value="2025">Year 2025</option>
            <option value="2024">Before 2025</option>
          </select>
          <label style={{ fontSize: '10px', color: '#666', whiteSpace: 'nowrap' }}>Type</label>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setTypeDropdownOpen((v) => !v)}
              style={{ padding: '6px 10px', fontSize: '10px', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#fff', minWidth: '112px', maxWidth: '160px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedTypes.length === 0 ? 'Select types...' : selectedTypes.length === 1 ? selectedTypes[0] : `${selectedTypes.length} selected`}
              </span>
              <span style={{ flexShrink: 0 }}>{typeDropdownOpen ? '▲' : '▼'}</span>
            </button>
            {typeDropdownOpen && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '3px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '6px', boxShadow: '0 3px 10px rgba(0,0,0,0.12)', padding: '6px', minWidth: '144px', zIndex: 100 }}>
                {typeOptions.length === 0 ? (
                  <div style={{ padding: '6px', color: '#666', fontSize: '10px' }}>No types in this year</div>
                ) : (
                  typeOptions.map((t) => (
                    <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 6px', cursor: 'pointer', borderRadius: '3px', fontSize: '10px' }}>
                      <input type="checkbox" checked={selectedTypes.includes(t)} onChange={() => setSelectedTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])} />
                      <span>{t}</span>
                    </label>
                  ))
                )}
                <div style={{ borderTop: '1px solid #eee', marginTop: '6px', paddingTop: '6px' }}>
                  <button type="button" onClick={() => { setAppliedTypes([...selectedTypes]); setFilterMode('actual'); setTypeDropdownOpen(false); }} style={{ width: '100%', padding: '5px 10px', fontSize: '10px', fontWeight: '500', background: '#166534', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Apply</button>
                </div>
              </div>
            )}
          </div>
          <label style={{ fontSize: '10px', color: '#666', whiteSpace: 'nowrap' }}>Amount</label>
          <select value={effectiveFilterMode} onChange={(e) => setFilterMode(e.target.value)} disabled={typeFilterActive} style={{ padding: '6px 10px', fontSize: '10px', borderRadius: '6px', border: '1px solid #e0e0e0', background: typeFilterActive ? '#f5f5f5' : '#fff', minWidth: '80px', cursor: typeFilterActive ? 'not-allowed' : 'pointer', color: typeFilterActive ? '#888' : undefined }}>
            <option value="onHand" disabled={typeFilterActive}>On Hand</option>
            <option value="actual">Actual</option>
          </select>
          <button type="button" onClick={() => setAmountVisible((v) => !v)} style={{ padding: '6px 11px', fontSize: '10px', fontWeight: '500', background: amountVisible ? '#f0f0f0' : '#FF5722', color: amountVisible ? '#333' : '#fff', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {amountVisible ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px', background: '#FFF5F2', color: '#C62828', borderRadius: '8px', marginBottom: '16px', flexShrink: 0 }}>{error}</div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '13px', marginBottom: '16px', flexShrink: 0 }}>
        <div style={{ flex: '1 1 200px', minWidth: '180px', padding: '13px 16px', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '10px', color: '#666', marginBottom: '3px' }}>Bank only</div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#166534', minHeight: '28px' }}>
            {amountVisible ? <span>{formatAmount(bankOnlyAmount)}</span> : <span style={{ filter: 'blur(6px)', userSelect: 'none', color: '#999' }}>{formatAmount(bankOnlyAmount)}</span>}
          </div>
        </div>
        <div style={{ flex: '1 1 200px', minWidth: '180px', padding: '13px 16px', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '10px', color: '#666', marginBottom: '3px' }}>Cash</div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#b91c1c', minHeight: '22px' }}>
            {amountVisible ? <span>{formatAmount(cashAmount)}</span> : <span style={{ filter: 'blur(6px)', userSelect: 'none', color: '#999' }}>{formatAmount(cashAmount)}</span>}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: '400px', overflow: 'auto' }}>
        <div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', background: '#fff', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', whiteSpace: 'nowrap' }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  {ORDER_COLUMNS.map((col) => (
                    <th key={col.key} style={{ padding: '10px 8px', textAlign: ['total_amount', 'bank', 'cash', 'received', 'pending'].includes(col.key) ? 'right' : 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' }}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedOrders.length === 0 ? (
                  <tr><td colSpan={ORDER_COLUMNS.length} style={{ padding: '19px', textAlign: 'center', color: '#666', fontSize: '11px' }}>No orders.</td></tr>
                ) : (
                  displayedOrders.map((row) => (
                    <tr
                      key={row.order_id}
                      onClick={() => openModal(row)}
                      style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
                    >
                      {ORDER_COLUMNS.map((col) => (
                        <td key={col.key} style={{ padding: '8px', textAlign: ['total_amount', 'bank', 'cash', 'received', 'pending'].includes(col.key) ? 'right' : 'left', whiteSpace: 'nowrap' }}>
                          {col.key === 'payment_status' ? (
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '600', background: row[col.key] === 'Pending' ? '#fef2f2' : '#f0fdf4', color: row[col.key] === 'Pending' ? '#b91c1c' : '#166534' }}>{row[col.key] || '—'}</span>
                          ) : ['total_amount', 'bank', 'cash', 'received', 'pending'].includes(col.key) ? (
                            formatAmount(row[col.key])
                          ) : (
                            (row[col.key] != null ? String(row[col.key]) : '—')
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modalOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => !submitting && setModalOrder(null)}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '16px 20px', width: 'min(520px, 95vw)', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>Update Transaction</h3>

            <div style={{ fontSize: '11px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>Previous (current state)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: '13px', fontSize: '10px', padding: '8px 10px', background: '#f5f5f5', borderRadius: '6px', border: '1px solid #e8e8e8' }}>
              <div><span style={{ color: '#666' }}>Customer ID</span><div style={{ fontWeight: '600' }}>{modalOrder.customer_id ?? '—'}</div></div>
              <div><span style={{ color: '#666' }}>Order ID</span><div style={{ fontWeight: '600' }}>{modalOrder.order_id ?? '—'}</div></div>
              <div><span style={{ color: '#666' }}>Name</span><div style={{ fontWeight: '600' }}>{modalOrder.shareholder_name ?? modalOrder.booking_name ?? '—'}</div></div>
              <div><span style={{ color: '#666' }}>Contact</span><div style={{ fontWeight: '600' }}>{modalOrder.phone_number ?? '—'}</div></div>
              <div><span style={{ color: '#666' }}>Booking Date</span><div style={{ fontWeight: '600' }}>{formatDate(modalOrder.booking_date)}</div></div>
              <div><span style={{ color: '#666' }}>Total Price</span><div style={{ fontWeight: '600' }}>{formatAmount(modalOrder.total_amount)}</div></div>
              <div><span style={{ color: '#666' }}>Current Bank</span><div style={{ fontWeight: '600' }}>{formatAmount(modalOrder.bank)}</div></div>
              <div><span style={{ color: '#666' }}>Current Cash</span><div style={{ fontWeight: '600' }}>{formatAmount(modalOrder.cash)}</div></div>
              <div><span style={{ color: '#666' }}>Current Received</span><div style={{ fontWeight: '600' }}>{formatAmount(modalOrder.received)}</div></div>
              <div><span style={{ color: '#666' }}>Current Pending</span><div style={{ fontWeight: '600' }}>{formatAmount(modalOrder.pending)}</div></div>
            </div>

            {(getPaymentRealtimeError() || paymentErrors.add || paymentErrors.addBank || paymentErrors.addCash) && (
              <div style={{ marginBottom: '10px', padding: '6px', background: '#fef2f2', color: '#b91c1c', borderRadius: '6px', fontSize: '10px' }}>
                {getPaymentRealtimeError()}
                {!getPaymentRealtimeError() && paymentErrors.add}
                {paymentErrors.addBank && <div>Add Bank: {paymentErrors.addBank}</div>}
                {paymentErrors.addCash && <div>Add Cash: {paymentErrors.addCash}</div>}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Add Cash</label>
                <input type="number" min="0" step="0.01" value={addCash} onChange={(e) => { setAddCash(e.target.value); setPaymentErrors((p) => ({ ...p, addCash: undefined, addBank: undefined, add: undefined })); }} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: (getPaymentRealtimeError() || paymentErrors.addCash) ? '1px solid #dc2626' : '1px solid #e0e0e0', fontSize: '10px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Add Bank</label>
                <input type="number" min="0" step="0.01" value={addBank} onChange={(e) => { setAddBank(e.target.value); setPaymentErrors((p) => ({ ...p, addBank: undefined, addCash: undefined, add: undefined })); }} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: (getPaymentRealtimeError() || paymentErrors.addBank) ? '1px solid #dc2626' : '1px solid #e0e0e0', fontSize: '10px' }} />
              </div>
            </div>

            <div style={{ padding: '10px', background: '#f9fafb', borderRadius: '6px', marginBottom: '13px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '10px' }}>
              <div><span style={{ color: '#666' }}>New Bank Total</span><div style={{ fontWeight: '600' }}>{formatAmount(newBank)}</div></div>
              <div><span style={{ color: '#666' }}>New Cash Total</span><div style={{ fontWeight: '600' }}>{formatAmount(newCash)}</div></div>
              <div><span style={{ color: '#666' }}>New Received Total</span><div style={{ fontWeight: '600' }}>{formatAmount(newReceived)}</div></div>
              <div><span style={{ color: '#666' }}>New Pending</span><div style={{ fontWeight: '600' }}>{formatAmount(newPending)}</div></div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => !submitting && setModalOrder(null)} disabled={submitting} style={{ padding: '8px 16px', background: '#e0e0e0', color: '#333', border: 'none', borderRadius: '8px', cursor: submitting ? 'not-allowed' : 'pointer' }}>Close</button>
              <button type="button" onClick={handleSubmitPayment} disabled={submitting || getPaymentRealtimeError() || ((parseFloat(addBank) || 0) === 0 && (parseFloat(addCash) || 0) === 0)} style={{ padding: '8px 16px', background: '#166534', color: '#fff', border: 'none', borderRadius: '8px', cursor: submitting ? 'not-allowed' : 'pointer' }}>{submitting ? 'Submitting...' : 'Submit'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
