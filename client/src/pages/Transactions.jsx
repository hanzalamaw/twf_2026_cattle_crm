import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

const API = 'http://localhost:5000';

const HIDDEN_TYPES_BOOKING = ['Cow', 'Goat'];

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

const AMOUNT_KEYS = ['total_amount', 'bank', 'cash', 'received', 'pending'];

const TYPE_COLORS = {
  'Hissa - Premium':  { bg: '#fff4f0', color: '#FF5722' },
  'Hissa - Standard': { bg: '#e8f4ff', color: '#2196F3' },
  'Hissa - Waqf':     { bg: '#edfbee', color: '#4CAF50' },
  'Goat (Hissa)':     { bg: '#fff8e8', color: '#FF9800' },
};

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

function StatusPill({ status }) {
  const isPending = status === 'Pending';
  return (
    <span
      style={{
        display: 'inline-block',
        minWidth: '72px',
        height: '22px',
        padding: '0 10px',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: '600',
        whiteSpace: 'nowrap',
        border: '1px solid',
        textAlign: 'center',
        lineHeight: '20px',
        boxSizing: 'border-box',
        ...(isPending
          ? { color: '#C30730', background: '#FBEDF0', borderColor: '#C30730' }
          : { color: '#07C339', background: '#E6F9EB', borderColor: '#07C339' }),
      }}
    >
      {isPending ? 'Pending' : (status ? 'Received' : '—')}
    </span>
  );
}

// Search icon SVG
function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const PAGE_SIZE = 50;

export default function Transactions() {
  const [summary, setSummary] = useState(null);
  const [ordersSummary, setOrdersSummary] = useState(null);
  const [orders, setOrders] = useState([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [amountVisible, setAmountVisible] = useState(false);
  const [filterMode, setFilterMode] = useState('onHand');
  const [modalOrder, setModalOrder] = useState(null);
  const [addBank, setAddBank] = useState('');
  const [addCash, setAddCash] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [paymentErrors, setPaymentErrors] = useState({});
  const [yearFilter, setYearFilter] = useState('2026');
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [appliedTypes, setAppliedTypes] = useState([]);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const [filters, setFilters] = useState({ order_types: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all'); // 'all' | 'received' | 'pending'
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const typeDropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  const token = localStorage.getItem('token');
  const location = useLocation();
  const isFarm = location.pathname.startsWith('/farm');

  // On Hand is only available when year === '2026'
  const onHandAvailable = yearFilter === '2026';
  const effectiveFilterMode = !onHandAvailable ? 'actual' : (appliedTypes.length > 0 ? 'actual' : filterMode);

  const fetchFilters = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/booking/orders/filters`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setFilters(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, [token]);

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

  const BOOKING_SUMMARY_TYPES = ['Hissa - Premium', 'Hissa - Standard', 'Hissa - Waqf', 'Goat (Hissa)'];
  const FARM_SUMMARY_TYPES = ['Cow', 'Goat'];

const fetchOrdersSummary = useCallback(async () => {
  try {
    const params = new URLSearchParams();
    if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
    // Filter summary to the relevant order types
    const summaryTypes = isFarm ? FARM_SUMMARY_TYPES : BOOKING_SUMMARY_TYPES;
    summaryTypes.forEach((t) => params.append('order_type', t));
      const res = await fetch(`${API}/api/booking/orders/summary?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setOrdersSummary(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, [token, yearFilter, appliedTypes, isFarm]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
      appliedTypes.forEach((t) => params.append('order_type', t));
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      const res = await fetch(`${API}/api/booking/orders?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.data) ? data.data : [];
        // Booking: remove Cow/Goat rows. Farm: show only Cow/Goat rows.
        const filtered = list.filter((row) => {
          if (isFarm) {
            return ['Cow', 'Goat'].includes(row.type) && String(row.source ?? '').trim() === 'Farm';
          }
          return !HIDDEN_TYPES_BOOKING.includes(row.type);
        });
        setOrders(filtered);
        setTotalCount(isFarm ? filtered.length : (typeof data.total === 'number' ? data.total : filtered.length));
      } else {
        setError('Failed to load orders');
      }
    } catch (e) {
      setError('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [token, yearFilter, appliedTypes, page, isFarm]);

  useEffect(() => { fetchFilters(); }, [fetchFilters]);
  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchOrdersSummary(); }, [fetchOrdersSummary]);
  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => { setPage(1); }, [yearFilter, appliedTypes]);

  // Reset filterMode to 'onHand' when switching back to 2026, force 'actual' otherwise
  useEffect(() => {
    if (!onHandAvailable) {
      setFilterMode('actual');
    }
  }, [onHandAvailable]);

  useEffect(() => {
    if (!typeDropdownOpen) return;
    const onDocClick = (e) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target)) setTypeDropdownOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [typeDropdownOpen]);

  // Client-side filtering: search + payment status
  const displayedOrders = useMemo(() => {
    let result = orders;

    // Payment status filter
    if (paymentStatusFilter === 'received') {
      result = result.filter((o) => o.payment_status !== 'Pending');
    } else if (paymentStatusFilter === 'pending') {
      result = result.filter((o) => o.payment_status === 'Pending');
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((row) =>
        ORDER_COLUMNS.some((col) => {
          const val = row[col.key];
          if (val == null) return false;
          return String(val).toLowerCase().includes(q);
        })
      );
    }

    return result;
  }, [orders, searchQuery, paymentStatusFilter]);

  const openModal = (order) => {
    setModalOrder(order);
    setAddBank('');
    setAddCash('');
    setPaymentErrors({});
  };

  const getPaymentRealtimeError = useCallback(() => {
    if (!modalOrder) return null;
    const bankVal = parseFloat(addBank);
    const cashVal = parseFloat(addCash);
    if (!Number.isNaN(bankVal) && bankVal < 0) return 'Amount cannot be negative.';
    if (!Number.isNaN(cashVal) && cashVal < 0) return 'Amount cannot be negative.';
    const pendingAmount = Number(modalOrder.pending) || 0;
    const addB = Math.max(0, Number.isNaN(bankVal) ? 0 : bankVal);
    const addC = Math.max(0, Number.isNaN(cashVal) ? 0 : cashVal);
    if (addB + addC > pendingAmount) return `Total added (Bank + Cash) cannot exceed pending (${formatAmount(pendingAmount)}).`;
    return null;
  }, [modalOrder, addBank, addCash]);

  const validatePayment = () => {
    const err = {};
    const bank = parseFloat(addBank);
    const cash = parseFloat(addCash);
    const addB = Math.max(0, Number.isNaN(bank) ? 0 : bank);
    const addC = Math.max(0, Number.isNaN(cash) ? 0 : cash);
    if (!Number.isNaN(bank) && bank < 0) err.addBank = 'Amount cannot be negative.';
    if (!Number.isNaN(cash) && cash < 0) err.addCash = 'Amount cannot be negative.';
    if (addB + addC === 0) err.add = 'Enter at least one amount (Add Bank or Add Cash ≥ 0).';
    const totalAmountVal = Number(modalOrder?.total_amount) || 0;
    const currentReceivedVal = Number(modalOrder?.received) || 0;
    const newReceivedVal = currentReceivedVal + addB + addC;
    if (newReceivedVal > totalAmountVal) err.add = err.add || `Total received cannot exceed total amount (${formatAmount(totalAmountVal)}).`;
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
      <div style={{ padding: '19px', fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif" }}>
        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '16px' }}>Transactions</h2>
        <div style={{ padding: '32px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading...</div>
      </div>
    );
  }

  // Booking: never show Cow/Goat. Farm: show only Cow/Goat.
  const typeOptions = (
    filters.order_types && filters.order_types.length > 0
      ? filters.order_types
      : [...new Set(orders.map((o) => o.type).filter(Boolean))].sort()
  ).filter((t) => (isFarm ? ['Cow', 'Goat'].includes(t) : !HIDDEN_TYPES_BOOKING.includes(t)));
  const s = summary || {};
  const totalExpensesBank = Number(s.totalExpensesBank) ?? 0;
  const totalExpensesCash = Number(s.totalExpensesCash) ?? 0;
  const os = ordersSummary || {};
  const fullDataTotalBank = Number(os.totalBank) ?? 0;
  const fullDataTotalCash = Number(os.totalCash) ?? 0;
  const bankOnlyAmount = effectiveFilterMode === 'onHand' ? fullDataTotalBank - totalExpensesBank : fullDataTotalBank;
  const cashAmount = effectiveFilterMode === 'onHand' ? fullDataTotalCash - totalExpensesCash : fullDataTotalCash;

  const currentBank = modalOrder ? Number(modalOrder.bank) || 0 : 0;
  const currentCash = modalOrder ? Number(modalOrder.cash) || 0 : 0;
  const newBank = currentBank + Math.max(0, parseFloat(addBank) || 0);
  const newCash = currentCash + Math.max(0, parseFloat(addCash) || 0);
  const currentReceived = modalOrder ? Number(modalOrder.received) || 0 : 0;
  const addTotal = Math.max(0, parseFloat(addBank) || 0) + Math.max(0, parseFloat(addCash) || 0);
  const newReceived = currentReceived + addTotal;
  const totalAmount = modalOrder ? Number(modalOrder.total_amount) || 0 : 0;
  const newPending = Math.max(0, totalAmount - newReceived);

  const isOnHandDisabled = !onHandAvailable || appliedTypes.length > 0;

  return (
    <>
      {/* ── Mobile-only styles ── */}
      <style>{`
        @keyframes modalSlideInFromLeft {
          from { transform: translateX(-18px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @media (max-width: 767px) {
          .txn-root              { padding: 64px 12px 24px !important; overflow: auto !important; }

          /* Top bar — title left, leave right edge clear for parent hamburger */
          .txn-topbar           { flex-wrap: nowrap !important; gap: 8px !important; margin-bottom: 12px !important; align-items: center !important; }
          .txn-topbar h2        { font-size: 16px !important; flex-shrink: 0 !important; }
          .txn-topbar-controls  { display: none !important; }

          /* Mobile filter/controls row */
          .txn-mobile-row       { display: none !important; }

          /* Summary cards — compact side by side */
          .txn-cards            { gap: 8px !important; margin-bottom: 12px !important; }
          .txn-card             { min-width: 0 !important; flex: 1 1 calc(50% - 4px) !important; padding: 10px 10px !important; }
          .txn-card-icon-wrap   { width: 44px !important; height: 44px !important; }
          .txn-card-icon-wrap img { width: 36px !important; height: 36px !important; }
          .txn-card-label       { font-size: 10px !important; }
          .txn-card-amount      { font-size: 13px !important; }
          .txn-card-amount span { min-width: unset !important; padding: 4px 6px !important; }

          /* Search + status: single clean row, no stacking */
          .txn-search-row                 { flex-direction: row !important; align-items: center !important; flex-wrap: nowrap !important; gap: 8px !important; margin-bottom: 10px !important; }
          .txn-search-bar                 { flex: 1 1 0 !important; min-width: 0 !important; max-width: none !important; }
          .txn-search-bar input           { font-size: 13px !important; padding: 10px 32px 10px 34px !important; border-radius: 8px !important; }
          .txn-status-wrap                { flex-shrink: 0 !important; width: auto !important; gap: 0 !important; }
          .txn-status-wrap label          { display: none !important; }
          .txn-status-wrap select         { padding: 10px 8px !important; font-size: 12px !important; min-width: 88px !important; max-width: 100px !important; border-radius: 8px !important; width: auto !important; cursor: pointer !important; }

          /* Hide chips + count on mobile */
          .txn-filter-chips     { display: none !important; }
          .txn-result-count     { display: none !important; }

          /* Table shown, cards hidden */
          .txn-table-wrap       { display: block !important; }
          .txn-mobile-cards     { display: none !important; }

          /* Pagination */
          .txn-pagination       { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }

          /* Payment modal — bottom sheet */
          .txn-modal-wrap       { align-items: flex-end !important; padding: 0 !important; }
          .txn-modal-box        {
            border-radius: 20px 20px 0 0 !important;
            width: 100vw !important;
            max-width: 100vw !important;
            max-height: 92dvh !important;
            padding: 20px 16px 36px !important;
            animation: modalSlideInFromLeft .25s ease-out both !important;
          }
          .txn-modal-grid       { grid-template-columns: 1fr 1fr !important; gap: 8px 12px !important; font-size: 12px !important; }
          .txn-modal-input-grid { grid-template-columns: 1fr 1fr !important; gap: 10px !important; }
          .txn-modal-summary    { grid-template-columns: 1fr 1fr !important; }
          .txn-modal-actions    { gap: 10px !important; }
          .txn-modal-actions button { flex: 1 !important; padding: 13px !important; font-size: 13px !important; border-radius: 10px !important; }
          .txn-drag-handle      { display: block !important; }
        }
      `}</style>

    <div className="txn-root" style={{ padding: '19px', fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif", display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>

      {/* ── Top bar ── */}
      <div className="txn-topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0, flexWrap: 'nowrap', gap: '10px' }}>
        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#333', flexShrink: 0 }}>Transactions</h2>
        <div className="txn-topbar-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap', marginLeft: 'auto' }} ref={typeDropdownRef}>

          {/* Year filter */}
          <label style={{ fontSize: '10px', color: '#666', whiteSpace: 'nowrap' }}>Year</label>
          <select
            value={yearFilter}
            onChange={(e) => {
              setYearFilter(e.target.value);
              setAppliedTypes([]);
              setSelectedTypes([]);
            }}
            style={{ padding: '6px 10px', fontSize: '10px', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#fff', minWidth: '96px', cursor: 'pointer' }}
          >
            <option value="all">All</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
          </select>

          {/* Type multi-select */}
          <label style={{ fontSize: '12px', color: '#666', whiteSpace: 'nowrap' }}>Type</label>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setTypeDropdownOpen((v) => !v)}
              style={{ padding: '6px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#fff', minWidth: '140px', maxWidth: '200px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: selectedTypes.length === 0 ? '10px' : '13px' }}>
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
                      <input
                        type="checkbox"
                        checked={selectedTypes.includes(t)}
                        onChange={() => setSelectedTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])}
                      />
                      <span>{t}</span>
                    </label>
                  ))
                )}
                <div style={{ borderTop: '1px solid #eee', marginTop: '6px', paddingTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => { setAppliedTypes([...selectedTypes]); setTypeDropdownOpen(false); }}
                    style={{ width: '100%', padding: '5px 10px', fontSize: '10px', fontWeight: '500', background: '#166534', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Amount / On Hand filter — only enabled for 2026 */}
          <label style={{ fontSize: '10px', color: isOnHandDisabled ? '#bbb' : '#666', whiteSpace: 'nowrap' }}>Amount</label>
          <select
            value={effectiveFilterMode}
            onChange={(e) => setFilterMode(e.target.value)}
            disabled={isOnHandDisabled}
            style={{
              padding: '6px 10px',
              fontSize: '10px',
              borderRadius: '6px',
              border: '1px solid #e0e0e0',
              background: isOnHandDisabled ? '#f5f5f5' : '#fff',
              minWidth: '80px',
              cursor: isOnHandDisabled ? 'not-allowed' : 'pointer',
              color: isOnHandDisabled ? '#aaa' : undefined,
            }}
          >
            <option value="onHand" disabled={isOnHandDisabled}>On Hand</option>
            <option value="actual">Actual</option>
          </select>

          {/* Show/hide amounts */}
          <button
            type="button"
            onClick={() => setAmountVisible((v) => !v)}
            title={amountVisible ? 'Hide' : 'Show'}
            style={{ padding: '6px 8px', fontSize: '10px', fontWeight: '500', background: '#f0f0f0', color: '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <img src={amountVisible ? '/icons/hide.png' : '/icons/show.png'} alt={amountVisible ? 'Hide' : 'Show'} style={{ width: '18px', height: '18px', display: 'block' }} />
          </button>
        </div>

        {/* ── Mobile top controls row (hidden on desktop) ── */}
        <div className="txn-mobile-row" style={{ display: 'none', alignItems: 'center', gap: '8px', marginLeft: 'auto', marginRight: '44px' }}>
          {/* Year */}
          <select
            value={yearFilter}
            onChange={(e) => { setYearFilter(e.target.value); setAppliedTypes([]); setSelectedTypes([]); }}
            style={{ padding: '7px 8px', fontSize: '12px', borderRadius: '8px', border: '1px solid #e0e0e0', background: '#fff', minWidth: '80px' }}
          >
            <option value="all">All</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
          </select>

          {/* Filters toggle */}
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((v) => !v)}
            style={{ padding: '7px 12px', borderRadius: '8px', border: `1px solid ${mobileFiltersOpen ? '#FF5722' : '#e0e0e0'}`, background: mobileFiltersOpen ? '#fff4f0' : '#fff', color: mobileFiltersOpen ? '#FF5722' : '#555', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            ⚙ Filters
          </button>
        </div>
      </div>

      {/* ── Mobile filter panel (hidden on desktop) ── */}
      <div className="txn-mobile-row" style={{ display: 'none' }}>
        {mobileFiltersOpen && (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px', marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', boxSizing: 'border-box' }}>
            {/* Type multi-select */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '6px', fontWeight: '500' }}>Order Type</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {typeOptions.length === 0 ? (
                  <div style={{ color: '#999', fontSize: '12px' }}>No types available</div>
                ) : typeOptions.map((t) => {
                  const tc = TYPE_COLORS[t] || { bg: '#f3f4f6', color: '#374151' };
                  const checked = selectedTypes.includes(t);
                  return (
                    <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${checked ? tc.color : '#e5e7eb'}`, background: checked ? tc.bg : '#fafafa', cursor: 'pointer' }}>
                      <input type="checkbox" checked={checked} onChange={() => setSelectedTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])} style={{ accentColor: tc.color }} />
                      <span style={{ fontSize: '13px', fontWeight: checked ? '600' : '400', color: checked ? tc.color : '#374151' }}>{t}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Amount mode */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '6px', fontWeight: '500' }}>Amount Mode</label>
              <select
                value={effectiveFilterMode}
                onChange={(e) => setFilterMode(e.target.value)}
                disabled={isOnHandDisabled}
                style={{ width: '100%', padding: '10px 12px', fontSize: '13px', borderRadius: '8px', border: '1px solid #e0e0e0', background: isOnHandDisabled ? '#f5f5f5' : '#fff', color: isOnHandDisabled ? '#aaa' : '#333' }}
              >
                <option value="onHand" disabled={isOnHandDisabled}>On Hand</option>
                <option value="actual">Actual</option>
              </select>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => { setAppliedTypes([...selectedTypes]); setMobileFiltersOpen(false); }}
                style={{ flex: 1, padding: '11px', background: '#166534', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => { setSelectedTypes([]); setAppliedTypes([]); setMobileFiltersOpen(false); }}
                style={{ flex: 1, padding: '11px', background: '#fff', color: '#555', border: '1px solid #e0e0e0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: '12px', background: '#FFF5F2', color: '#C62828', borderRadius: '8px', marginBottom: '16px', flexShrink: 0 }}>{error}</div>
      )}

      {/* ── Summary cards ── */}
      <div className="txn-cards" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px', flexShrink: 0 }}>
        {/* Bank Only card */}
        <div className="txn-card" style={{ flex: '1 1 160px', minWidth: '160px', padding: '14px 12px', borderRadius: '10px', border: '1px solid #f1f1f1', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '8px', position: 'relative', overflow: 'hidden' }}>
          <div className="txn-card-icon-wrap" style={{ width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img src="/icons/total_orders_amount.png" alt="" style={{ width: '50px', height: '50px', objectFit: 'contain' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2px' }}>
            <div className="txn-card-label" style={{ fontSize: '11px', fontWeight: '400', color: '#6b7280' }}>Bank Only</div>
            <div className="txn-card-amount" style={{ fontSize: '18px', fontWeight: '600', color: '#111827', lineHeight: '1.2' }}>
              {amountVisible
                ? <span>{formatAmount(bankOnlyAmount)}</span>
                : <span style={{ filter: 'blur(6px)', userSelect: 'none', display: 'inline-block', minWidth: '120px', background: 'rgba(0,0,0,0.03)', borderRadius: '10px', padding: '6px 10px' }}>{formatAmount(bankOnlyAmount)}</span>}
            </div>
          </div>
        </div>

        {/* Cash card */}
        <div className="txn-card" style={{ flex: '1 1 160px', minWidth: '160px', padding: '14px 12px', borderRadius: '10px', border: '1px solid #f1f1f1', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '8px', position: 'relative', overflow: 'hidden' }}>
          <div className="txn-card-icon-wrap" style={{ width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img src="/icons/total_orders_amount.png" alt="" style={{ width: '50px', height: '50px', objectFit: 'contain' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2px' }}>
            <div className="txn-card-label" style={{ fontSize: '11px', fontWeight: '400', color: '#6b7280' }}>Cash</div>
            <div className="txn-card-amount" style={{ fontSize: '18px', fontWeight: '600', color: '#111827', lineHeight: '1.2' }}>
              {amountVisible
                ? <span>{formatAmount(cashAmount)}</span>
                : <span style={{ filter: 'blur(6px)', userSelect: 'none', display: 'inline-block', minWidth: '120px', background: 'rgba(0,0,0,0.03)', borderRadius: '10px', padding: '6px 10px' }}>{formatAmount(cashAmount)}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile-only: show/hide button below cards, right-aligned ── */}
      <div className="txn-mobile-row" style={{ display: 'none', justifyContent: 'flex-end', marginTop: '-10px', marginBottom: '10px' }}>
        <button
          type="button"
          onClick={() => setAmountVisible((v) => !v)}
          title={amountVisible ? 'Hide' : 'Show'}
          style={{ padding: '6px 8px', fontSize: '10px', fontWeight: '500', background: '#f0f0f0', color: '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <img src={amountVisible ? '/icons/hide.png' : '/icons/show.png'} alt={amountVisible ? 'Hide' : 'Show'} style={{ width: '18px', height: '18px', display: 'block' }} />
        </button>
      </div>

      {/* ── Search + Status filter row ── */}
      <div className="txn-search-row" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {/* Search bar */}
        <div className="txn-search-bar" style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px', maxWidth: '380px' }}>
          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
            <SearchIcon />
          </span>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search orders..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '7px 32px 7px 30px',
              fontSize: '10px',
              borderRadius: '6px',
              border: '1px solid #e0e0e0',
              background: '#fff',
              outline: 'none',
              color: '#333',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
              style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
            >
              <XIcon />
            </button>
          )}
        </div>

        {/* Payment status filter */}
        <div className="txn-status-wrap" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '10px', color: '#666', whiteSpace: 'nowrap' }}>Status</label>
          <select
            value={paymentStatusFilter}
            onChange={(e) => { setPaymentStatusFilter(e.target.value); setPage(1); }}
            style={{ padding: '7px 10px', fontSize: '10px', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#fff', minWidth: '130px', cursor: 'pointer' }}
          >
            <option value="all">All</option>
            <option value="received">Received Payments</option>
            <option value="pending">Pending Payments</option>
          </select>
        </div>

        {/* Active filter chips */}
        {(searchQuery || paymentStatusFilter !== 'all') && (
          <div className="txn-filter-chips" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            {searchQuery && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', background: '#EFF6FF', color: '#1D4ED8', borderRadius: '4px', fontSize: '10px', fontWeight: '500' }}>
                "{searchQuery}"
                <button type="button" onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, color: '#1D4ED8' }}>×</button>
              </span>
            )}
            {paymentStatusFilter !== 'all' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', background: paymentStatusFilter === 'pending' ? '#FBEDF0' : '#E6F9EB', color: paymentStatusFilter === 'pending' ? '#C30730' : '#07C339', borderRadius: '4px', fontSize: '10px', fontWeight: '500' }}>
                {paymentStatusFilter === 'pending' ? 'Pending Payments' : 'Received Payments'}
                <button type="button" onClick={() => setPaymentStatusFilter('all')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, color: 'inherit' }}>×</button>
              </span>
            )}
          </div>
        )}

        {/* Result count when filtered */}
        {(searchQuery || paymentStatusFilter !== 'all') && (
          <span className="txn-result-count" style={{ fontSize: '10px', color: '#888', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            {displayedOrders.length} result{displayedOrders.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Desktop Table ── */}
      <div className="txn-table-wrap" style={{ flex: 1, minHeight: '260px', overflow: 'auto' }}>
        <div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', background: '#fff', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', whiteSpace: 'nowrap' }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  {ORDER_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      style={{
                        padding: '10px 8px',
                        textAlign: ['total_amount', 'bank', 'cash', 'received', 'pending'].includes(col.key) ? 'right' : 'left',
                        fontWeight: '600',
                        color: '#333',
                        borderBottom: '2px solid #e0e0e0',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedOrders.length === 0 ? (
                  <tr>
                    <td colSpan={ORDER_COLUMNS.length} style={{ padding: '32px', textAlign: 'center', color: '#666', fontSize: '11px' }}>
                      {searchQuery || paymentStatusFilter !== 'all' ? 'No orders match your filters.' : 'No orders.'}
                    </td>
                  </tr>
                ) : (
                  displayedOrders.map((row) => (
                    <tr
                      key={row.order_id}
                      onClick={() => openModal(row)}
                      style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#fafafa'}
                      onMouseLeave={(e) => e.currentTarget.style.background = ''}
                    >
                      {ORDER_COLUMNS.map((col) => (
                        <td
                          key={col.key}
                          style={{
                            padding: '8px',
                            textAlign: ['total_amount', 'bank', 'cash', 'received', 'pending'].includes(col.key) ? 'right' : 'left',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {col.key === 'payment_status' ? (
                            <StatusPill status={row[col.key]} />
                          ) : ['total_amount', 'bank', 'cash', 'received', 'pending'].includes(col.key) ? (
                            formatAmount(row[col.key])
                          ) : (
                            row[col.key] != null ? String(row[col.key]) : '—'
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

      {/* ── Mobile order cards (hidden on desktop) ── */}
      <div className="txn-mobile-cards" style={{ display: 'none', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Loading orders…</div>
        ) : displayedOrders.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
            {searchQuery || paymentStatusFilter !== 'all' ? 'No orders match your filters.' : 'No orders.'}
          </div>
        ) : displayedOrders.map((row) => {
          const tc = TYPE_COLORS[row.type] || { bg: '#f3f4f6', color: '#374151' };
          const isPending = row.payment_status === 'Pending';
          return (
            <div
              key={row.order_id}
              onClick={() => openModal(row)}
              style={{ background: '#fff', borderRadius: '12px', border: '1.5px solid #e5e7eb', padding: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
            >
              {/* Card top row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px', gap: '8px' }}>
                <div>
                  <div style={{ fontWeight: '700', fontSize: '13px', color: '#111827', lineHeight: 1.2 }}>{row.booking_name || '—'}</div>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{row.order_id}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                  <span style={{ background: tc.bg, color: tc.color, fontSize: '10px', fontWeight: '600', padding: '3px 8px', borderRadius: '20px', whiteSpace: 'nowrap' }}>{row.type || '—'}</span>
                  <StatusPill status={row.payment_status} />
                </div>
              </div>

              {/* Info grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 16px' }}>
                {[
                  { label: 'Shareholder', val: row.shareholder_name },
                  { label: 'Phone',       val: row.phone_number },
                  { label: 'Total',       val: formatAmount(row.total_amount) },
                  { label: 'Received',    val: formatAmount(row.received) },
                  { label: 'Bank',        val: formatAmount(row.bank) },
                  { label: 'Cash',        val: formatAmount(row.cash) },
                  { label: 'Pending',     val: formatAmount(row.pending) },
                  { label: 'Reference',   val: row.reference },
                ].map(({ label, val }) => (
                  <div key={label}>
                    <div style={{ fontSize: '9px', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '1px' }}>{label}</div>
                    <div style={{ fontSize: '12px', fontWeight: '500', color: label === 'Pending' && isPending ? '#C30730' : '#111827' }}>{val || '—'}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f3f4f6', fontSize: '11px', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                <span>Tap to update payment</span>
                <span>→</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Pagination ── */}
      {!loading && totalCount > 0 && !searchQuery && paymentStatusFilter === 'all' && (
        <div className="txn-pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', padding: '12px 0', borderTop: '1px solid #e0e0e0', marginTop: '8px' }}>
          <span style={{ fontSize: '13px', color: '#666' }}>
            Showing {orders.length} of {totalCount} orders
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{ padding: '6px 12px', fontSize: '10px', background: page <= 1 ? '#f0f0f0' : '#fff', color: page <= 1 ? '#999' : '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
            >
              Previous
            </button>
            {(() => {
              const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
              const showPages = 5;
              let start = Math.max(1, page - Math.floor(showPages / 2));
              let end = Math.min(totalPages, start + showPages - 1);
              if (end - start + 1 < showPages) start = Math.max(1, end - showPages + 1);
              const pages = [];
              for (let i = start; i <= end; i++) pages.push(i);
              return pages.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  style={{ minWidth: '32px', padding: '6px 10px', fontSize: '10px', background: p === page ? '#FF5722' : '#fff', color: p === page ? '#fff' : '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: 'pointer', fontWeight: p === page ? 600 : 400 }}
                >
                  {p}
                </button>
              ));
            })()}
            <button
              type="button"
              disabled={page >= Math.ceil(totalCount / PAGE_SIZE)}
              onClick={() => setPage((p) => Math.min(Math.ceil(totalCount / PAGE_SIZE) || 1, p + 1))}
              style={{ padding: '6px 12px', fontSize: '10px', background: page >= Math.ceil(totalCount / PAGE_SIZE) ? '#f0f0f0' : '#fff', color: page >= Math.ceil(totalCount / PAGE_SIZE) ? '#999' : '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: page >= Math.ceil(totalCount / PAGE_SIZE) ? 'not-allowed' : 'pointer' }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ── Payment modal ── */}
      {modalOrder && (
        <div
          className="txn-modal-wrap"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => !submitting && setModalOrder(null)}
        >
          <div
            className="txn-modal-box"
            style={{ background: '#fff', borderRadius: '12px', padding: '16px 20px', width: 'min(520px, 95vw)', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle — visible on mobile only */}
            <div className="txn-drag-handle" style={{ display: 'none', width: '40px', height: '4px', background: '#e0e0e0', borderRadius: '2px', margin: '0 auto 16px' }} />

            <h3 style={{ margin: '0 0 13px 0', fontSize: '13px', fontWeight: '600' }}>Update Transaction</h3>

            <div style={{ fontSize: '11px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>Previous (current state)</div>
            <div className="txn-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: '13px', fontSize: '10px', padding: '8px 10px', background: '#f5f5f5', borderRadius: '6px', border: '1px solid #e8e8e8' }}>
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

            <div className="txn-modal-input-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Add Cash</label>
                <input
                  type="number" min="0" step="0.01" value={addCash}
                  onChange={(e) => { setAddCash(e.target.value); setPaymentErrors((p) => ({ ...p, addCash: undefined, addBank: undefined, add: undefined })); }}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '8px', border: (getPaymentRealtimeError() || paymentErrors.addCash) ? '1px solid #dc2626' : '1px solid #e0e0e0' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Add Bank</label>
                <input
                  type="number" min="0" step="0.01" value={addBank}
                  onChange={(e) => { setAddBank(e.target.value); setPaymentErrors((p) => ({ ...p, addBank: undefined, addCash: undefined, add: undefined })); }}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '8px', border: (getPaymentRealtimeError() || paymentErrors.addBank) ? '1px solid #dc2626' : '1px solid #e0e0e0' }}
                />
              </div>
            </div>

            <div className="txn-modal-summary" style={{ padding: '10px', background: '#f9fafb', borderRadius: '6px', marginBottom: '13px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '10px' }}>
              <div><span style={{ color: '#666' }}>New Bank Total</span><div style={{ fontWeight: '600' }}>{formatAmount(newBank)}</div></div>
              <div><span style={{ color: '#666' }}>New Cash Total</span><div style={{ fontWeight: '600' }}>{formatAmount(newCash)}</div></div>
              <div><span style={{ color: '#666' }}>New Received Total</span><div style={{ fontWeight: '600' }}>{formatAmount(newReceived)}</div></div>
              <div><span style={{ color: '#666' }}>New Pending</span><div style={{ fontWeight: '600' }}>{formatAmount(newPending)}</div></div>
            </div>

            <div className="txn-modal-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => !submitting && setModalOrder(null)} disabled={submitting} style={{ padding: '8px 16px', background: '#e0e0e0', color: '#333', border: 'none', borderRadius: '8px', cursor: submitting ? 'not-allowed' : 'pointer' }}>Close</button>
              <button
                type="button"
                onClick={handleSubmitPayment}
                disabled={submitting || !!getPaymentRealtimeError() || ((parseFloat(addBank) || 0) === 0 && (parseFloat(addCash) || 0) === 0)}
                style={{ padding: '8px 16px', background: '#166534', color: '#fff', border: 'none', borderRadius: '8px', cursor: submitting ? 'not-allowed' : 'pointer' }}
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}