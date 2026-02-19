import { useState, useEffect, useCallback } from 'react';

const API = 'http://localhost:5000';

const ORDER_COLUMNS = [
  { key: 'customer_id', label: 'Customer ID' },
  { key: 'order_id', label: 'Order ID' },
  { key: 'cow', label: 'Cow' },
  { key: 'hissa', label: 'Hissa' },
  { key: 'slot', label: 'Slot' },
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

export default function Transactions() {
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
      const res = await fetch(`${API}/api/booking/orders?year=all&page=1&limit=500`, { headers: { Authorization: `Bearer ${token}` } });
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
  }, [token]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const openModal = (order) => {
    setModalOrder(order);
    setAddBank('');
    setAddCash('');
  };

  const handleSubmitPayment = async () => {
    if (!modalOrder) return;
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
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '20px' }}>Transactions</h2>
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Loading...</div>
      </div>
    );
  }

  const s = summary || {};
  const totalBank = Number(s.totalBank) ?? 0;
  const totalCash = Number(s.totalCash) ?? 0;
  const totalExpensesBank = Number(s.totalExpensesBank) ?? 0;
  const totalExpensesCash = Number(s.totalExpensesCash) ?? 0;
  const bankOnlyAmount = filterMode === 'onHand' ? totalBank - totalExpensesBank : totalBank;
  const cashAmount = filterMode === 'onHand' ? totalCash - totalExpensesCash : totalCash;

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
    <div style={{ padding: '24px', fontFamily: "'Poppins', 'Inter', sans-serif", display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333' }}>Transactions</h2>
      </div>

      {error && (
        <div style={{ padding: '12px', background: '#FFF5F2', color: '#C62828', borderRadius: '8px', marginBottom: '16px', flexShrink: 0 }}>{error}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', marginBottom: '12px', flexShrink: 0 }}>
        <label style={{ fontSize: '12px', color: '#666' }}>Filter:</label>
        <select value={filterMode} onChange={(e) => setFilterMode(e.target.value)} style={{ padding: '6px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#fff', minWidth: '120px', cursor: 'pointer' }}>
          <option value="onHand">On Hand</option>
          <option value="actual">Actual</option>
        </select>
        <button type="button" onClick={() => setAmountVisible((v) => !v)} style={{ padding: '6px 14px', fontSize: '13px', fontWeight: '500', background: amountVisible ? '#f0f0f0' : '#FF5722', color: amountVisible ? '#333' : '#fff', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: 'pointer' }}>
          {amountVisible ? 'Hide' : 'Show'}
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '20px', flexShrink: 0 }}>
        <div style={{ flex: '1 1 200px', minWidth: '180px', padding: '16px 20px', borderRadius: '8px', border: '1px solid #e0e0e0', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Bank only</div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#166534', minHeight: '28px' }}>
            {amountVisible ? <span>{formatAmount(bankOnlyAmount)}</span> : <span style={{ filter: 'blur(6px)', userSelect: 'none', color: '#999' }}>{formatAmount(bankOnlyAmount)}</span>}
          </div>
          <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>{filterMode === 'onHand' ? 'Total bank − Expenses from bank' : 'Total bank'}</div>
        </div>
        <div style={{ flex: '1 1 200px', minWidth: '180px', padding: '16px 20px', borderRadius: '8px', border: '1px solid #e0e0e0', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Cash</div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#b91c1c', minHeight: '28px' }}>
            {amountVisible ? <span>{formatAmount(cashAmount)}</span> : <span style={{ filter: 'blur(6px)', userSelect: 'none', color: '#999' }}>{formatAmount(cashAmount)}</span>}
          </div>
          <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>{filterMode === 'onHand' ? 'Total cash − Expenses from cash' : 'Total cash'}</div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: '400px', overflow: 'auto' }}>
        <div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', background: '#fff', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: '#f5f5f5', borderBottom: '1px solid #e0e0e0', fontWeight: '600', fontSize: '14px', color: '#333' }}>Orders</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  {ORDER_COLUMNS.map((col) => (
                    <th key={col.key} style={{ padding: '10px 8px', textAlign: ['total_amount', 'bank', 'cash', 'received', 'pending'].includes(col.key) ? 'right' : 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0' }}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr><td colSpan={ORDER_COLUMNS.length} style={{ padding: '24px', textAlign: 'center', color: '#666' }}>No orders.</td></tr>
                ) : (
                  orders.map((row) => (
                    <tr
                      key={row.order_id}
                      onClick={() => openModal(row)}
                      style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
                    >
                      {ORDER_COLUMNS.map((col) => (
                        <td key={col.key} style={{ padding: '8px', textAlign: ['total_amount', 'bank', 'cash', 'received', 'pending'].includes(col.key) ? 'right' : 'left' }}>
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
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: 'min(520px, 95vw)', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>Update Transaction</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', marginBottom: '16px', fontSize: '13px' }}>
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Add Cash</label>
                <input type="number" min="0" step="0.01" value={addCash} onChange={(e) => setAddCash(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e0e0e0' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Add Bank</label>
                <input type="number" min="0" step="0.01" value={addBank} onChange={(e) => setAddBank(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e0e0e0' }} />
              </div>
            </div>

            <div style={{ padding: '12px', background: '#f9fafb', borderRadius: '8px', marginBottom: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
              <div><span style={{ color: '#666' }}>New Bank Total</span><div style={{ fontWeight: '600' }}>{formatAmount(newBank)}</div></div>
              <div><span style={{ color: '#666' }}>New Cash Total</span><div style={{ fontWeight: '600' }}>{formatAmount(newCash)}</div></div>
              <div><span style={{ color: '#666' }}>New Received Total</span><div style={{ fontWeight: '600' }}>{formatAmount(newReceived)}</div></div>
              <div><span style={{ color: '#666' }}>New Pending</span><div style={{ fontWeight: '600' }}>{formatAmount(newPending)}</div></div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => !submitting && setModalOrder(null)} disabled={submitting} style={{ padding: '8px 16px', background: '#e0e0e0', color: '#333', border: 'none', borderRadius: '8px', cursor: submitting ? 'not-allowed' : 'pointer' }}>Close</button>
              <button type="button" onClick={handleSubmitPayment} disabled={submitting || (parseFloat(addBank) || 0) === 0 && (parseFloat(addCash) || 0) === 0} style={{ padding: '8px 16px', background: '#166534', color: '#fff', border: 'none', borderRadius: '8px', cursor: submitting ? 'not-allowed' : 'pointer' }}>{submitting ? 'Submitting...' : 'Submit'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
