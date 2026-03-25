import { useCallback, useEffect, useState } from 'react';

import { API_BASE as API } from '../config/api';

function formatAmount(val) {
  const n = Number(val || 0);
  return `Rs ${Math.round(n).toLocaleString('en-PK')}`;
}

export default function ProcurementExpenses() {
  const token = localStorage.getItem('token');
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [amountVisible, setAmountVisible] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [addOpen, setAddOpen] = useState(false);
  const [expenseId, setExpenseId] = useState('');
  const [bank, setBank] = useState('');
  const [cash, setCash] = useState('');
  const [description, setDescription] = useState('');
  const [doneAt, setDoneAt] = useState('');
  const [doneBy, setDoneBy] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/procurement/expenses/summary`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setSummary(await res.json());
    } catch {
      // ignore
    }
  }, [token]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/procurement/expenses?page=${page}&limit=50`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.message || 'Failed to load expenses'); return; }
      setRows(Array.isArray(d.data) ? d.data : []);
      setTotalCount(typeof d.total === 'number' ? d.total : 0);
    } catch {
      setError('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [token, page]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchRows(); }, [fetchRows]);

  const openAdd = async () => {
    setBank(''); setCash(''); setDescription(''); setDoneAt(''); setDoneBy('');
    try {
      const res = await fetch(`${API}/api/procurement/expenses/next-id`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json().catch(() => ({}));
      setExpenseId(res.ok ? (d.expense_id || '') : '');
    } catch {
      setExpenseId('');
    }
    setAddOpen(true);
  };

  const addExpense = async () => {
    const b = Math.max(0, Number(bank) || 0);
    const c = Math.max(0, Number(cash) || 0);
    if (b + c <= 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/procurement/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bank: b, cash: c, description, done_at: doneAt || null, done_by: doneBy || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setAddOpen(false);
        fetchSummary(); fetchRows();
      } else setError(d.message || 'Failed to add expense');
    } catch {
      setError('Failed to add expense');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete ${row.expense_id}?`)) return;
    try {
      const res = await fetch(`${API}/api/procurement/expenses/${encodeURIComponent(row.expense_id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        fetchSummary(); fetchRows();
      } else setError(d.message || 'Failed to delete');
    } catch {
      setError('Failed to delete');
    }
  };

  const s = summary || {};
  const totalPages = Math.ceil(totalCount / 50) || 1;

  return (
    <div style={{ padding: '19px', fontFamily: "'Poppins','Inter',sans-serif", display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#333' }}>Expenses</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={() => setAmountVisible((v) => !v)} style={{ padding: '6px 8px', background: '#f0f0f0', border: '1px solid #e0e0e0', borderRadius: '6px' }}>
            <img src={amountVisible ? '/icons/hide.png' : '/icons/show.png'} alt="" style={{ width: '18px', height: '18px' }} />
          </button>
          <button type="button" onClick={openAdd} style={{ padding: '6px 13px', fontSize: '11px', fontWeight: '600', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px' }}>Add Expense</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {[['Bank', s.totalBank], ['Cash', s.totalCash]].map(([label, val]) => (
          <div key={label} style={{ flex: '1 1 180px', padding: '12px', border: '1px solid #eee', borderRadius: '8px', background: '#fff' }}>
            <div style={{ fontSize: '11px', color: '#666' }}>{label}</div>
            <div style={{ fontWeight: 700, fontSize: '16px' }}>{amountVisible ? formatAmount(val) : '••••••'}</div>
          </div>
        ))}
      </div>

      {error && <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', marginBottom: '13px', fontSize: '10px' }}>{error}</div>}

      <div style={{ flex: 1, overflow: 'auto', border: '1px solid #e0e0e0', borderRadius: '8px', background: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
          <thead><tr style={{ background: '#fafafa' }}>
            <th style={{ padding: '10px 8px', textAlign: 'left' }}>Expense ID</th>
            <th style={{ padding: '10px 8px', textAlign: 'left' }}>Date</th>
            <th style={{ padding: '10px 8px', textAlign: 'left' }}>Description</th>
            <th style={{ padding: '10px 8px', textAlign: 'right' }}>Bank</th>
            <th style={{ padding: '10px 8px', textAlign: 'right' }}>Cash</th>
            <th style={{ padding: '10px 8px', textAlign: 'right' }}>Total</th>
            <th style={{ padding: '10px 8px', textAlign: 'left' }}>Done By</th>
            <th style={{ padding: '10px 8px', textAlign: 'center' }}>Action</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center' }}>Loading...</td></tr> : rows.length === 0 ? <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center' }}>No expenses.</td></tr> : rows.map((r) => (
              <tr key={r.expense_id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '8px' }}>{r.expense_id}</td>
                <td style={{ padding: '8px' }}>{String(r.done_at || '').split('T')[0]}</td>
                <td style={{ padding: '8px' }}>{r.description || '—'}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{formatAmount(r.bank)}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{formatAmount(r.cash)}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{formatAmount(r.total)}</td>
                <td style={{ padding: '8px' }}>{r.done_by || '—'}</td>
                <td style={{ padding: '8px', textAlign: 'center' }}>
                  <button type="button" onClick={() => remove(r)} style={{ background: 'none', border: 'none' }}>
                    <img src="/icons/delete.png" alt="Delete" style={{ width: '18px', height: '18px' }} />
                  </button>
                </td>
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

      {addOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => !submitting && setAddOpen(false)}>
          <div style={{ background: '#fff', padding: '16px', borderRadius: '10px', width: 'min(420px, 95vw)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, fontSize: '13px' }}>Add Expense</h3>
            <div style={{ fontSize: '10px', color: '#666', marginBottom: '10px' }}>Expense ID: {expenseId || 'Loading...'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <input type="number" min="0" step="0.01" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Bank" />
              <input type="number" min="0" step="0.01" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="Cash" />
            </div>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" style={{ width: '100%', marginBottom: '8px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
              <input type="date" value={doneAt} onChange={(e) => setDoneAt(e.target.value)} />
              <input value={doneBy} onChange={(e) => setDoneBy(e.target.value)} placeholder="Done by" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
              <button onClick={() => !submitting && setAddOpen(false)}>Close</button>
              <button disabled={submitting} onClick={addExpense}>{submitting ? 'Submitting...' : 'Add'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

