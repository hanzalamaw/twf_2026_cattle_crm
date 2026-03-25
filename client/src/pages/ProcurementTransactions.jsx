import { useCallback, useEffect, useMemo, useState } from 'react';

const API = 'http://localhost:5000';
const PAGE_SIZE = 50;

function formatAmount(val) {
  const n = Number(val || 0);
  return `Rs ${Math.round(n).toLocaleString('en-PK')}`;
}

function StatusPill({ status }) {
  const isPending = status === 'Pending';
  return (
    <span style={{
      display: 'inline-block', minWidth: '72px', height: '22px', padding: '0 10px',
      borderRadius: '4px', fontSize: '10px', fontWeight: '600', whiteSpace: 'nowrap',
      border: '1px solid', textAlign: 'center', lineHeight: '20px', boxSizing: 'border-box',
      ...(isPending ? { color: '#C30730', background: '#FBEDF0', borderColor: '#C30730' } : { color: '#07C339', background: '#E6F9EB', borderColor: '#07C339' }),
    }}>{isPending ? 'Pending' : 'Paid'}</span>
  );
}

export default function ProcurementTransactions() {
  const token = localStorage.getItem('token');
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [amountVisible, setAmountVisible] = useState(false);
  const [yearFilter, setYearFilter] = useState('2026');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [modalRow, setModalRow] = useState(null);
  const [addBank, setAddBank] = useState('');
  const [addCash, setAddCash] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/procurement/transactions`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const d = await res.json();
        setSummary(d.summary || null);
      }
    } catch {
      // ignore
    }
  }, [token]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
      if (typeFilter) params.set('type', typeFilter);
      if (search.trim()) params.set('search', search.trim());
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));

      const res = await fetch(`${API}/api/procurement/transactions/list?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setError('Failed to load procurements'); return; }
      const d = await res.json();
      setRows(Array.isArray(d.data) ? d.data : []);
      setTotalCount(typeof d.total === 'number' ? d.total : 0);
    } catch {
      setError('Failed to load procurements');
    } finally {
      setLoading(false);
    }
  }, [token, yearFilter, typeFilter, search, page]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchRows(); }, [fetchRows]);
  useEffect(() => { setPage(1); }, [yearFilter, typeFilter, search]);

  const typeOptions = useMemo(() => [...new Set(rows.map((r) => r.type).filter(Boolean))], [rows]);

  const submitPayment = async () => {
    if (!modalRow) return;
    const bank = Math.max(0, Number(addBank) || 0);
    const cash = Math.max(0, Number(addCash) || 0);
    if (bank + cash <= 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/procurement/${encodeURIComponent(modalRow.procurement_id)}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bank, cash }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setModalRow(null); setAddBank(''); setAddCash('');
        fetchSummary(); fetchRows();
      } else {
        setError(d.message || 'Failed to add payment');
      }
    } catch {
      setError('Failed to add payment');
    } finally {
      setSubmitting(false);
    }
  };

  const s = summary || {};
  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;

  return (
    <div style={{ padding: '19px', fontFamily: "'Poppins','Inter',sans-serif", display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#333' }}>Transactions</h2>
        <button type="button" onClick={() => setAmountVisible((v) => !v)} style={{ padding: '6px 8px', background: '#f0f0f0', border: '1px solid #e0e0e0', borderRadius: '6px' }}>
          <img src={amountVisible ? '/icons/hide.png' : '/icons/show.png'} alt="" style={{ width: '18px', height: '18px' }} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {[['Bank Only', s.onHand], ['Cash', s.actual]].map(([label, val]) => (
          <div key={label} style={{ flex: '1 1 180px', padding: '12px', border: '1px solid #eee', borderRadius: '8px', background: '#fff' }}>
            <div style={{ fontSize: '11px', color: '#666' }}>{label}</div>
            <div style={{ fontWeight: 700, fontSize: '16px' }}>{amountVisible ? formatAmount(val) : '••••••'}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '10px' }}>
          <option value="all">All</option><option value="2026">2026</option><option value="2025">2025</option><option value="2024">2024</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '10px' }}>
          <option value="">All Types</option>{typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '10px', minWidth: '180px' }} />
      </div>

      {error && <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', marginBottom: '13px', fontSize: '10px' }}>{error}</div>}

      <div style={{ flex: 1, overflow: 'auto', border: '1px solid #e0e0e0', borderRadius: '8px', background: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
          <thead><tr style={{ background: '#fafafa' }}>
            <th style={{ padding: '10px 8px', textAlign: 'left' }}>Procurement ID</th>
            <th style={{ padding: '10px 8px', textAlign: 'left' }}>Type</th>
            <th style={{ padding: '10px 8px', textAlign: 'left' }}>Date</th>
            <th style={{ padding: '10px 8px', textAlign: 'right' }}>Total</th>
            <th style={{ padding: '10px 8px', textAlign: 'right' }}>Bank</th>
            <th style={{ padding: '10px 8px', textAlign: 'right' }}>Cash</th>
            <th style={{ padding: '10px 8px', textAlign: 'right' }}>Received</th>
            <th style={{ padding: '10px 8px', textAlign: 'right' }}>Pending</th>
            <th style={{ padding: '10px 8px', textAlign: 'left' }}>Status</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center' }}>Loading...</td></tr> : rows.length === 0 ? <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center' }}>No records.</td></tr> : rows.map((r) => (
              <tr key={r.procurement_id} style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }} onClick={() => { setModalRow(r); setAddBank(''); setAddCash(''); }}>
                <td style={{ padding: '8px' }}>{r.procurement_id}</td>
                <td style={{ padding: '8px' }}>{r.type}</td>
                <td style={{ padding: '8px' }}>{String(r.date || '').split('T')[0]}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{formatAmount(r.total_price)}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{formatAmount(r.bank)}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{formatAmount(r.cash)}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{formatAmount(r.received)}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{formatAmount(r.pending)}</td>
                <td style={{ padding: '8px' }}><StatusPill status={r.payment_status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && totalCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px' }}>
          <span>Showing {rows.length} of {totalCount}</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
          </div>
        </div>
      )}

      {modalRow && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => !submitting && setModalRow(null)}>
          <div style={{ background: '#fff', padding: '16px', borderRadius: '10px', width: 'min(420px, 95vw)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, fontSize: '13px' }}>Update Transaction</h3>
            <div style={{ fontSize: '10px', color: '#666', marginBottom: '10px' }}>Procurement: {modalRow.procurement_id}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
              <input type="number" min="0" step="0.01" value={addCash} onChange={(e) => setAddCash(e.target.value)} placeholder="Add Cash" />
              <input type="number" min="0" step="0.01" value={addBank} onChange={(e) => setAddBank(e.target.value)} placeholder="Add Bank" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
              <button onClick={() => !submitting && setModalRow(null)}>Close</button>
              <button disabled={submitting} onClick={submitPayment}>{submitting ? 'Submitting...' : 'Submit'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

