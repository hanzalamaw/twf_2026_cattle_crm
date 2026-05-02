import { useCallback, useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { useAuth } from '../context/AuthContext';
import SharedChallanModal from '../components/SharedChallanModal';
import { API_BASE } from '../config/api';
import { getOperationsSocket } from '../utils/operationsSocket';
import QRCode from 'qrcode';

const REGENERATE_EMAIL = 'hanzalamawahab@gmail.com';

const ALLOWED_ORDER_TYPES = ['Hissa - Standard', 'Hissa Premium', 'Hissa - Waqf', 'Goat(Hissa)'];
const ORDER_TYPE_FILTERS = [
  { value: 'Hissa - Standard', label: 'Hissa Standard' },
  { value: 'Hissa Premium', label: 'Premium' },
  { value: 'Hissa - Waqf', label: 'Waqf' },
  { value: 'Goat(Hissa)', label: 'Goat' },
];
function normalizeOrderType(value) {
  const lower = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (lower === 'hissa - standard' || lower === 'hissa standard') return 'Hissa - Standard';
  if (lower === 'hissa premium' || lower === 'hissa - premium') return 'Hissa Premium';
  if (lower === 'hissa - waqf' || lower === 'hissa waqf') return 'Hissa - Waqf';
  if (lower === 'goat(hissa)' || lower === 'goat (hissa)' || lower === 'goat hissa') return 'Goat(Hissa)';
  return '';
}
function getChallanOrderTypes(row) {
  const values = [row.order_type, row.order_types, row.order_types_csv, row.types_csv, row.type];
  const direct = [...new Set(values.flatMap((value) => String(value || '').split(',')).map(normalizeOrderType).filter(Boolean))];
  if (direct.length) return direct;
  const inferred = [];
  if (Number(row.total_standard_hissa || row.standard_hissa_count || 0) > 0) inferred.push('Hissa - Standard');
  if (Number(row.total_premium_hissa || row.premium_hissa_count || 0) > 0) inferred.push('Hissa Premium');
  if (Number(row.total_waqf_hissa || row.waqf_hissa_count || 0) > 0) inferred.push('Hissa - Waqf');
  if (Number(row.total_goat_hissa || row.goat_hissa_count || 0) > 0) inferred.push('Goat(Hissa)');
  return inferred;
}

function formatTotalHissa(total, opts = {}) {
  const premium = Number(opts.premium || 0), standard = Number(opts.standard || 0), goat = Number(opts.goat || 0);
  const cleanTotal = Number(total ?? (premium + standard + goat));
  const parts = [];
  if (premium > 0) parts.push(premium + ' Premium');
  if (standard > 0) parts.push(standard + ' Standard');
  if (goat > 0) parts.push(goat + ' Goat');
  return parts.length ? cleanTotal + ' (' + parts.join(', ') + ')' : String(cleanTotal || 0);
}
function formatRiderCompact(rider, fallbackName = 'Unassigned') {
  if (!rider) return fallbackName;
  return String((rider.rider_name || fallbackName) + (rider.contact ? '(' + rider.contact + ')' : '') + (rider.vehicle ? ' ' + rider.vehicle : '')).trim();
}


const STATUS_STYLES = {
  Pending:            { bg: '#F5F5F5',  fg: '#666' },
  'Rider Assigned':   { bg: '#FFF8E1',  fg: '#F57C00' },
  Dispatched:         { bg: '#E3F2FD',  fg: '#1565C0' },
  Delivered:          { bg: '#E8F5E9',  fg: '#2E7D32' },
  'Returned to Farm': { bg: '#FFEBEE',  fg: '#C62828' },
};

function StatusBadge({ status }) {
  const st = status || 'Pending';
  const { bg, fg } = STATUS_STYLES[st] || STATUS_STYLES.Pending;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: '999px', fontSize: '10px', fontWeight: '600', background: bg, color: fg, whiteSpace: 'nowrap' }}>
      {st}
    </span>
  );
}


function getRiderDetails(rider, fallbackName = 'Unassigned') {
  return {
    name: formatRiderCompact(rider, fallbackName),
  };
}

function getUniqueValues(values) {
  return [...new Set((values || []).map((v) => String(v || '').trim()).filter(Boolean))];
}

function getUniqueDescriptionValues(values) {
  return [...new Set((values || []).map((v) => String(v || '').trim()).filter(Boolean))];
}

function getDescriptionText(source) {
  if (!source) return '';
  const direct = getUniqueDescriptionValues([
    source.description,
    source.descriptions,
    source.description_csv,
    source.descriptions_csv,
    source.special_request,
    source.specialRequest,
    source.request,
    source.remarks,
    source.notes,
    source.note,
  ]);
  const orderDescriptions = getUniqueDescriptionValues((source.orders || []).map((o) => o.description));
  return [...direct, ...orderDescriptions].filter(Boolean).join('\n');
}

function hasDescription(source) {
  return getDescriptionText(source).length > 0;
}

function RedDot() {
  return <span title="Special request" style={{ display:'inline-block', width:'8px', height:'8px', borderRadius:'999px', background:'#D32F2F', flexShrink:0 }} />;
}

function SpecialRequestPatch() {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'4px 9px', borderRadius:'999px', background:'#FFEBEE', color:'#C62828', border:'1px solid #FFCDD2', fontSize:'10px', fontWeight:'700', whiteSpace:'nowrap', textTransform:'uppercase', letterSpacing:'0.2px' }}>
      <RedDot /> Special Request
    </span>
  );
}


const PAGE_SIZE = 50;

function formatAddress(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function short(v, n = 64) {
  const s = String(v ?? '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/* ─────────────────────────────────────────────
   generatePdf  –  exact challan design
   ───────────────────────────────────────────── */
   async function generatePdf(items) {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  
    const PW = 595.28;
    const PH = 841.89;
    const ML = 36;
    const MR = PW - 36;
    const CONTENT_W = MR - ML;
  
    const safe = (v, fallback = '') => {
      const s = String(v ?? '').trim();
      return s || fallback;
    };
  
    const split = (text, maxWidth) => {
      return doc.splitTextToSize(safe(text), maxWidth);
    };
  
    const drawWrappedLabelValue = (label, value, x, y, valueMaxWidth, lineHeight = 12) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(20, 20, 20);
      doc.text(`${label}:`, x, y);
  
      const labelW = doc.getTextWidth(`${label}: `);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(35, 35, 35);
  
      const lines = split(value, valueMaxWidth - labelW - 4);
      doc.text(lines, x + labelW + 2, y);
  
      return Math.max(lineHeight, lines.length * lineHeight);
    };
  
    const drawLineValue = (label, value, x, y, lineEndX) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(20, 20, 20);
      doc.text(`${label}:`, x, y);
  
      const labelW = doc.getTextWidth(`${label}: `);
      const valueX = x + labelW + 6;
  
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(35, 35, 35);
  
      const valueLines = split(value || '', lineEndX - valueX - 4).slice(0, 1);
      if (valueLines.length) doc.text(valueLines, valueX, y);
  
      doc.setDrawColor(30, 30, 30);
      doc.setLineWidth(0.8);
      doc.line(valueX, y + 4, lineEndX, y + 4);
    };
  
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const item = items[itemIndex] || {};
      const c = item.challan || {};
      const orders = Array.isArray(item.orders) ? item.orders : [];
      const rider = item.rider || {};
  
      const premium = Number(c.total_premium_hissa || 0);
      const standard = Number(c.total_standard_hissa || 0);
      const goat = Number(c.total_goat_hissa || 0);
      const totalHissa = Number(c.total_hissa || c.order_count || premium + standard + goat || 0);
  
      const waqf = Number(c.total_waqf_hissa || 0);
      const totalHissaText = formatTotalHissa(totalHissa, { premium, standard, goat, waqf });
  
      const uniqueJoin = (arr) =>
        [...new Set(arr.map((v) => String(v || '').trim()).filter(Boolean))].join(', ');
      
      const customerId =
        c.customer_ids_csv ||
        c.customer_id ||
        uniqueJoin(orders.map((o) => o.customer_id)) ||
        '—';
      
      const customerName =
        c.booking_name ||
        uniqueJoin(orders.map((o) => o.booking_name)) ||
        '—';
      
      const contact =
        [c.contacts_csv, c.alt_contacts_csv].filter(Boolean).join(' & ') ||
        uniqueJoin([
          ...orders.map((o) => o.contact),
          ...orders.map((o) => o.alt_contact),
        ]) ||
        '—';
  
      let pageNo = 0;
      let orderIndex = 0;
  
      while (orderIndex < Math.max(orders.length, 1)) {
        if (itemIndex > 0 || pageNo > 0) doc.addPage();
        pageNo++;
  
        // Header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(19);
        doc.setTextColor(20, 20, 20);
        doc.text(`CHALLAN # ${safe(c.challan_id, '')}`, ML, 42);
  
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('THE WARSI FARM', ML, 58);
  
        // QR
        const qrToken = c.qr_token || c.challan_token || '';
        const qrText = qrToken
          ? `${window.location.origin}/operations/deliveries?challan=${encodeURIComponent(qrToken)}`
          : `CHALLAN-${safe(c.challan_id, '')}`;
  
        try {
          const qrDataUrl = await QRCode.toDataURL(qrText, {
            margin: 0,
            width: 90,
            errorCorrectionLevel: 'M',
          });
          doc.addImage(qrDataUrl, 'PNG', MR - 70, 24, 58, 58);
        } catch {
          doc.rect(MR - 70, 24, 58, 58);
          doc.setFontSize(7);
          doc.text('QR', MR - 41, 55, { align: 'center' });
        }
  
        let y = 112;
  
        // Print customer/rider info ONLY ON FIRST PAGE
        if (pageNo === 1) {
          const boxX = ML;
const boxY = y;
const boxH = 118;
const midX = ML + CONTENT_W / 2;

doc.setFillColor(252, 252, 252);
doc.setDrawColor(215, 215, 215);
doc.setLineWidth(0.8);
doc.roundedRect(boxX, boxY, CONTENT_W, boxH, 6, 6, 'FD');

// subtle middle separator
doc.setDrawColor(235, 235, 235);
doc.line(midX, boxY + 14, midX, boxY + boxH - 14);

const leftX = boxX + 28;
const rightX = midX + 28;
const rowGap = 28;

const drawInfoRow = (label, value, x, yPos, maxWidth) => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(25, 25, 25);
  doc.text(`${label}:`, x, yPos);

  const labelW = doc.getTextWidth(`${label}: `);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(45, 45, 45);

  const lines = doc.splitTextToSize(
    safe(value),
    maxWidth - labelW - 6
  ).slice(0, 2);

  doc.text(lines, x + labelW + 4, yPos);
};

drawInfoRow('Customer ID', customerId, leftX, boxY + 30, CONTENT_W / 2 - 52);
drawInfoRow('Customer Name', customerName, leftX, boxY + 58, CONTENT_W / 2 - 52);
drawInfoRow('Contact', contact, leftX, boxY + 86, CONTENT_W / 2 - 52);

drawInfoRow('Address', c.address || '—', rightX, boxY + 30, CONTENT_W / 2 - 52);
drawInfoRow('Area', c.area || '—', rightX, boxY + 58, CONTENT_W / 2 - 52);

// Total hissa better layout
doc.setFont('helvetica', 'bold');
doc.setFontSize(9.5);
doc.setTextColor(25, 25, 25);
doc.text('Total Hissa:', rightX, boxY + 86);

doc.setFont('helvetica', 'bold');
doc.setFontSize(10);
doc.setFont('helvetica', 'bold');
doc.setFontSize(9.5);
doc.setTextColor(25, 25, 25);

const label = 'Total Hissa:';
doc.text(label, rightX, boxY + 86);

const labelW = doc.getTextWidth(label + ' ');

// SINGLE clean line — no color, no weird spacing
doc.setFont('helvetica', 'normal');
doc.setFontSize(9.5);
doc.setTextColor(35, 35, 35);

doc.text(
  totalHissaText,
  rightX + labelW + 4,
  boxY + 86
);

y = boxY + boxH + 32;
  
          y = boxY + boxH + 32;
  
          drawLineValue('Rider Name', '', ML + 4, y, ML + 250);
          drawLineValue('Vehicle', '', midX + 18, y, MR);
  
          y += 28;
        } else {
          // continuation pages start higher, no repeated info block
          y = 96;
  
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(90, 90, 90);
          doc.text(`Continuation of Challan # ${safe(c.challan_id, '')}`, ML, y - 18);
        }
  
        // Table header
        const tableY = y;
        const headerH = 28;
  
        doc.setFillColor(250, 250, 250);
        doc.roundedRect(ML, tableY, CONTENT_W, headerH, 4, 4, 'F');
        doc.setDrawColor(215, 215, 215);
        doc.roundedRect(ML, tableY, CONTENT_W, headerH, 4, 4);
  
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(30, 30, 30);
  
        const col1X = ML + 16;
        const col2X = ML + 235;
        const col3X = MR - 44;
  
        doc.text('SHAREHOLDER NAME', col1X, tableY + 18);
        doc.text('DESCRIPTION', col2X, tableY + 18);
        doc.text('QUANTITY', col3X, tableY + 18, { align: 'center' });
  
        y = tableY + headerH + 14;
  
        const footerSpace = 88;
        const maxY = PH - footerSpace;
        const rowH = 48;
  
        if (!orders.length) {
          doc.setFillColor(247, 248, 250);
          doc.roundedRect(ML, y, CONTENT_W, rowH, 4, 4, 'F');
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(120, 120, 120);
          doc.text('No orders linked to this challan.', ML + CONTENT_W / 2, y + 28, { align: 'center' });
          orderIndex = 1;
        } else {
          while (orderIndex < orders.length && y + rowH <= maxY) {
            const o = orders[orderIndex];
  
            doc.setFillColor(247, 248, 250);
            doc.roundedRect(ML, y, CONTENT_W, rowH, 4, 4, 'F');
  
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9.5);
            doc.setTextColor(25, 25, 25);
  
            const nameLines = split(o.shareholder_name || o.booking_name || '—', 180).slice(0, 2);
            doc.text(nameLines, col1X, y + 20);
  
            const orderType = safe(o.order_type, 'Hissa');
            const day = o.day ? ` (${o.day})` : '';
            const mainDesc = `${orderType}${day}`;
  
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9.5);
            doc.setTextColor(25, 25, 25);
            doc.text(split(mainDesc, 250).slice(0, 1), col2X, y + 17);
  
            const subDesc = [
              o.cow_number ? `Cow: ${o.cow_number}` : null,
              o.hissa_number ? `Hissa: ${o.hissa_number}` : null,
            ].filter(Boolean).join('  |  ');
  
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(95, 95, 95);
            doc.text(split(subDesc || '—', 250).slice(0, 1), col2X, y + 32);
  
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(25, 25, 25);
            doc.text('1', col3X, y + 24, { align: 'center' });
  
            y += rowH + 10;
            orderIndex++;
          }
        }
  
        // Approval/signature ONLY after all rows printed
        if (orderIndex >= Math.max(orders.length, 1)) {
          const footerY = PH - 48;
  
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(20, 20, 20);
  
          doc.text('Approval:', ML + 4, footerY);
          doc.setDrawColor(30, 30, 30);
          doc.setLineWidth(0.8);
          doc.line(ML + 58, footerY + 3, ML + 220, footerY + 3);
  
          doc.text('Customer Signature:', ML + CONTENT_W / 2 + 18, footerY);
          doc.line(ML + CONTENT_W / 2 + 130, footerY + 3, MR - 8, footerY + 3);
        }
  
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(160, 160, 160);
        doc.text(`Page ${pageNo}`, MR, PH - 20, { align: 'right' });
      }
    }
  
    doc.save(`challan-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px', background: '#fff' };

function MultiSelectDropdown({ label, options = [], values = [], onChange, placeholder = 'All', width = 170 }) {
  const [open, setOpen] = useState(false);
  const selectedValues = Array.isArray(values) ? values : [];
  const selectedCount = selectedValues.length;
  const toggleValue = (value) => {
    onChange(selectedValues.includes(value)
      ? selectedValues.filter((v) => v !== value)
      : [...selectedValues, value]
    );
  };
  return (
    <div style={{ width, minWidth: width, position: 'relative' }}>
      {label && <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>{label}</label>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: '6px', border: `1px solid ${open ? '#FF5722' : '#e0e0e0'}`, background: '#fff', fontSize: '11px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', color: selectedCount ? '#FF5722' : '#555', fontWeight: selectedCount ? '600' : '400' }}
      >
        <span>{selectedCount ? `${selectedCount} selected` : placeholder}</span>
        <span style={{ fontSize: '8px', opacity: 0.5 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 80, left: 0, top: 'calc(100% + 4px)', minWidth: '100%', width: 'max-content', maxWidth: '280px', maxHeight: '220px', overflow: 'auto', border: '1px solid #e0e0e0', borderRadius: '8px', background: '#fff', padding: '6px 4px', boxShadow: '0 6px 18px rgba(0,0,0,0.1)' }}>
          {selectedCount > 0 && (
            <div
              onClick={() => onChange([])}
              style={{ padding: '5px 10px', fontSize: '10px', color: '#FF5722', cursor: 'pointer', fontWeight: '600', borderBottom: '1px solid #f5f5f5', marginBottom: '2px' }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#fff4f0'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              Clear selection
            </div>
          )}
          {options.length === 0 ? (
            <div style={{ padding: '8px 10px', fontSize: '10px', color: '#aaa' }}>No options available</div>
          ) : options.map((opt) => {
            const isSelected = selectedValues.includes(opt.value);
            return (
              <label
                key={opt.value}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', fontSize: '10px', cursor: 'pointer', borderRadius: '5px', background: isSelected ? '#FFF4F0' : 'transparent', color: isSelected ? '#FF5722' : '#333', fontWeight: isSelected ? '600' : '400' }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#fafafa'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? '#FFF4F0' : 'transparent'; }}
              >
                <input type="checkbox" checked={isSelected} onChange={() => toggleValue(opt.value)} style={{ cursor: 'pointer', accentColor: '#FF5722' }} />
                {opt.label}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function normalizeForCompare(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function splitUniqueCsvValues(values) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .flatMap((v) => Array.isArray(v) ? v : String(v || '').split(','))
    .map((v) => String(v || '').trim())
    .filter(Boolean))];
}

function MultiLineCell({ values, empty = '—', style = {} }) {
  const list = splitUniqueCsvValues(values);
  if (!list.length) return <span style={{ color: '#ccc' }}>{empty}</span>;
  return (
    <div style={{ whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.45, ...style }}>
      {list.map((v, i) => <div key={`${v}-${i}`}>{v}</div>)}
    </div>
  );
}


export default function OperationsChallan() {
  const { user, authFetch } = useAuth();
  const emailOk = (user?.email || '').trim().toLowerCase() === REGENERATE_EMAIL;

  const [challans,      setChallans]      = useState([]);
  const [batches,       setBatches]       = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [riders,        setRiders]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [msg,           setMsg]           = useState('');
  const [err,           setErr]           = useState('');
  const [busy,          setBusy]          = useState(false);
  const [confirmRegen,  setConfirmRegen]  = useState(false);

  const [search,      setSearch]      = useState('');
  const [filterDay,   setFilterDay]   = useState('');
  const [filterSlot,  setFilterSlot]  = useState([]);
  const [filterStatus, setFilterStatus] = useState([]);
  const [filterOrderType, setFilterOrderType] = useState([]);
  const [page,        setPage]        = useState(1);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [modal,       setModal]       = useState(null);

  const loadBatches = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/operations/batches`);
      if (!res.ok) return;
      const data = await res.json();
      setBatches(data.batches || []);
      if (data.batches?.length && selectedBatch === null) setSelectedBatch(data.batches[0].batch_id);
    } catch { /* silent */ }
  }, [authFetch, selectedBatch]);

  const loadRiders = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/operations/riders`);
      if (res.ok) setRiders(await res.json());
    } catch { /* silent */ }
  }, [authFetch]);

  const load = useCallback(async () => {
    setErr(''); setLoading(true);
    try {
      const qs = selectedBatch ? `?batch_id=${selectedBatch}` : '';
      const res = await authFetch(`${API_BASE}/operations/challans${qs}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to load challans');
      const data = await res.json();
      setChallans(data.challans || []);
    } catch (e) {
      setErr(e.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [authFetch, selectedBatch]);

  useEffect(() => { loadBatches(); loadRiders(); }, []);
  useEffect(() => { if (selectedBatch !== null) load(); }, [load, selectedBatch]);

  useEffect(() => {
    const socket = getOperationsSocket();
    const refresh = () => { loadBatches(); loadRiders(); if (selectedBatch !== null) load(); };
    socket.on('operations:changed', refresh);
    socket.on('challans:changed', refresh);
    socket.on('riders:changed', refresh);
    return () => {
      socket.off('operations:changed', refresh);
      socket.off('challans:changed', refresh);
      socket.off('riders:changed', refresh);
    };
  }, [load, loadBatches, loadRiders, selectedBatch]);

  const riderMap = useMemo(() => {
    const m = {};
    riders.forEach((r) => { m[r.rider_id] = r.rider_name; });
    return m;
  }, [riders]);

  const riderDetailMap = useMemo(() => {
    const m = {};
    riders.forEach((r) => { m[r.rider_id] = r; });
    return m;
  }, [riders]);

  const modalCustomerIds = useMemo(() => {
    const fromOrders = getUniqueValues((modal?.orders || []).map((o) => o.customer_id));
    const fromChallan = getUniqueValues(String(modal?.challan?.customer_ids_csv || modal?.challan?.customer_id || '').split(','));
    return fromOrders.length ? fromOrders : fromChallan;
  }, [modal]);

  const modalRiderDetails = useMemo(() => {
    if (!modal) return getRiderDetails(null);
    const rider = modal.rider || riderDetailMap[modal.challan?.rider_id];
    return getRiderDetails(
      rider,
      modal.challan?.rider_count > 1 ? 'Multiple Riders' : 'Unassigned'
    );
  }, [modal, riderDetailMap]);

  const dayOptions  = useMemo(() => [...new Set(challans.map((c) => String(c.day || '').trim()).filter(Boolean))].sort(), [challans]);
  const slotOptions = useMemo(() => {
    const all = new Set();
    challans.forEach((c) => String(c.slot || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => all.add(s)));
    return [...all].sort();
  }, [challans]);
  const slotFilterOptions = useMemo(() => slotOptions.map((s) => ({ value: s, label: s })), [slotOptions]);
  const statusFilterOptions = useMemo(() => STATUS_STYLES ? Object.keys(STATUS_STYLES).map((s) => ({ value: s, label: s })) : [], []);

  const displayRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return challans.filter((c) => {
      if (filterDay && normalizeForCompare(c.day) !== normalizeForCompare(filterDay)) return false;
      if (filterSlot.length) {
        const slots = String(c.slot || '').split(',').map((v) => v.trim()).filter(Boolean);
        if (!filterSlot.some((slot) => slots.some((s) => normalizeForCompare(s) === normalizeForCompare(slot)))) return false;
      }
      if (filterOrderType.length) {
        const rowTypes = getChallanOrderTypes(c);
        if (!filterOrderType.some((t) => rowTypes.includes(t))) return false;
      }
      if (filterStatus.length && !filterStatus.includes(challanDerivedStatus(c))) return false;
      if (!q) return true;
      const hay = [c.address, c.area, c.day, c.slot, c.booking_name, c.shareholders_csv, c.contacts_csv, c.alt_contacts_csv, c.customer_ids_csv, c.description].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [challans, search, filterDay, filterSlot, filterStatus, filterOrderType]);

  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  const pagedRows  = useMemo(() => displayRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [displayRows, page]);
  useEffect(() => { setPage(1); }, [search, filterDay, filterSlot, filterStatus, filterOrderType, selectedBatch]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const toggleOne = (id) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = () => {
    const allSel = displayRows.length > 0 && displayRows.every((c) => selectedIds.has(c.challan_id));
    setSelectedIds(allSel ? new Set() : new Set(displayRows.map((c) => c.challan_id)));
  };
  const allFilteredSelected = displayRows.length > 0 && displayRows.every((c) => selectedIds.has(c.challan_id));

  const modalDescription = useMemo(() => getDescriptionText({ ...(modal?.challan || {}), orders: modal?.orders || [] }), [modal]);

  const openChallanModal = async (token) => {
    if (!token) return;
    setErr('');
    const res = await authFetch(`${API_BASE}/operations/challans/by-token/${encodeURIComponent(token)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.message || 'Challan not found'); return; }
    setModal(data);
  };

  const doRegenerate = async () => {
    setConfirmRegen(false); setBusy(true); setErr('');
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/regenerate-from-orders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Regenerate failed');
      setMsg(`Batch "${data.batch_label}" created — ${data.groups ?? 0} challan groups.`);
      const bRes = await authFetch(`${API_BASE}/operations/batches`);
      if (bRes.ok) {
        const bData = await bRes.json();
        setBatches(bData.batches || []);
        if (bData.batches?.length) setSelectedBatch(bData.batches[0].batch_id);
      }
    } catch (e) { setErr(e.message || 'Regenerate failed'); }
    setBusy(false);
  };

  const onPrintPdf = async () => {
    const ids = selectedIds.size ? [...selectedIds] : displayRows.map((c) => c.challan_id);
    if (!ids.length) return alert('No challans to print.');
    setBusy(true); setErr('');
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/bulk-detail`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challan_ids: ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not build PDF');
      if (!Array.isArray(data.items) || data.items.length === 0) throw new Error('No data to print');
      await generatePdf(data.items);
    } catch (e) { setErr(e.message || 'PDF generation failed'); }
    setBusy(false);
  };

  function challanDerivedStatus(c) {
    const total     = Number(c.orders_total     || 0);
    const delivered = Number(c.orders_delivered || 0);
    if (total === 0)            return 'Pending';
    if (delivered === total)    return 'Delivered';
    if (delivered > 0)          return 'Dispatched';
    if (c.rider_id)             return 'Rider Assigned';
    return 'Pending';
  }

  return (
    <>
      <style>{`
        .ops-data-table { width: max-content !important; min-width: 100% !important; table-layout: auto !important; }
        .ops-data-table th, .ops-data-table td { max-width: 240px; white-space: normal !important; word-break: break-word; overflow-wrap: anywhere; vertical-align: top; }
        .ops-data-table th { white-space: nowrap !important; }
        @media (max-width: 767px) { .ops-data-table th, .ops-data-table td { max-width: 180px; } }
      `}</style>
      <div style={{ padding: '19px', fontFamily: "'Poppins','Inter',sans-serif", display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333' }}>Challan Management</h2>
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#888' }}>
              Showing challans for the selected batch. Print PDF respects active filters; selected rows only if any are checked.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {busy && <span style={{ fontSize: '10px', color: '#999', fontWeight: '600' }}>Working…</span>}
            {batches.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '11px', color: '#666', whiteSpace: 'nowrap' }}>Batch:</label>
                <select
                  value={selectedBatch ?? ''}
                  onChange={(e) => setSelectedBatch(Number(e.target.value))}
                  style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #e0e0e0', background: '#fff', fontSize: '11px', fontWeight: '600', color: '#333', cursor: 'pointer' }}
                >
                  {batches.map((b) => (
                    <option key={b.batch_id} value={b.batch_id}>{b.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        <div style={{ borderTop: '1px solid #e6e6e6', marginBottom: '12px' }} />

        {/* Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '14px', alignItems: 'flex-end', flexShrink: 0 }}>
          <div style={{ flex: '1 1 280px', minWidth: 200 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Search</label>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} style={inputStyle} placeholder="Address, area, shareholders…" />
          </div>
          <div style={{ width: 130 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Day</label>
            <select value={filterDay} onChange={(e) => setFilterDay(e.target.value)} style={inputStyle}>
              <option value="">All</option>
              {dayOptions.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <MultiSelectDropdown label="Slots" options={slotFilterOptions} values={filterSlot} onChange={setFilterSlot} placeholder="All slots" width={150} />
          <MultiSelectDropdown label="Status" options={statusFilterOptions} values={filterStatus} onChange={setFilterStatus} placeholder="All status" width={150} />
          <MultiSelectDropdown label="Order Type" options={ORDER_TYPE_FILTERS} values={filterOrderType} onChange={setFilterOrderType} placeholder="All types" width={160} />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" disabled={busy} onClick={onPrintPdf}
              style={{ padding: '6px 13px', height: '29px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
              Print PDF
            </button>
            <button type="button" onClick={load}
              style={{ padding: '6px 13px', height: '29px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>
              Refresh
            </button>
            {emailOk && (
              <button type="button" onClick={() => setConfirmRegen(true)}
                style={{ padding: '6px 13px', height: '29px', background: '#FFEBEE', color: '#C62828', border: '1px solid #FFCDD2', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>
                Generate data (new batch)
              </button>
            )}
          </div>
        </div>

        {msg && <div style={{ padding: '10px', background: '#E8F5E9', color: '#2E7D32', borderRadius: '6px', marginBottom: '12px', fontSize: '10px', fontWeight: '600' }}>{msg}</div>}
        {err && <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', marginBottom: '13px', fontSize: '10px', fontWeight: '600' }}>{err}</div>}

        {!loading && (
          <div style={{ fontSize: '10px', color: '#999', marginBottom: '8px', flexShrink: 0 }}>
            Showing {displayRows.length} of {challans.length} challan{challans.length !== 1 ? 's' : ''}
          </div>
        )}

        {/* Table */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', borderRadius: '10px', border: '1px solid #ececec' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading…</div>
          ) : (
            <table className="ops-data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', tableLayout: 'auto' }}>
              
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: '#fafafa' }}>
                  <th style={{ padding: '10px 10px', borderBottom: '1px solid #e0e0e0' }}>
                    <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} />
                  </th>
                  {['Description', 'Customer ID', 'Booking Name', 'Address', 'Phone', 'Day / Slot', 'Area', 'Standard', 'Premium', 'Waqf', 'Goat (Hissa)', 'Total Hissa', 'Shareholders'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 10px', borderBottom: '1px solid #e0e0e0', color: '#555', fontWeight: '600', whiteSpace: 'nowrap', fontSize: '10px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedRows.length === 0 ? (
                  <tr><td colSpan={14} style={{ padding: '40px', textAlign: 'center', color: '#666', fontSize: '11px' }}>No rows found.</td></tr>
                ) : pagedRows.map((c, idx) => {
                  const st          = challanDerivedStatus(c);
                  const descriptionText = getDescriptionText(c);
                  const rowHasDescription = Boolean(descriptionText);
                  const names       = c.shareholders_csv  || '—';
                  const contacts    = c.contacts_csv      || '—';
                  const altContacts = c.alt_contacts_csv  || '';
                  const customerIds = c.customer_ids_csv  || '—';
                  return (
                    <tr key={c.challan_id}
                      style={{ borderBottom: '1px solid #f3f3f3', background: rowHasDescription ? '#FFF7F7' : (idx % 2 === 0 ? '#fff' : '#FAFAFA'), borderLeft: rowHasDescription ? '3px solid #D32F2F' : '3px solid transparent', cursor: c.qr_token ? 'pointer' : 'default' }}
                      onClick={() => c.qr_token && openChallanModal(c.qr_token)}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f5f9ff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = rowHasDescription ? '#FFF7F7' : (idx % 2 === 0 ? '#fff' : '#FAFAFA'); }}
                    >
                      <td style={{ padding: '9px 10px' }} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.has(c.challan_id)} onChange={() => toggleOne(c.challan_id)} />
                      </td>
                      <td style={{ padding: '9px 10px', color: '#555', verticalAlign:'top' }}>
                        {rowHasDescription ? (
                          <div style={{ whiteSpace:'pre-line', wordBreak:'break-word', overflowWrap:'anywhere', lineHeight:1.45, color:'#333', fontWeight:500 }}>{descriptionText}</div>
                        ) : <span style={{ color: '#ccc' }}>—</span>}
                      </td>
                      <td style={{ padding: '9px 10px', color: '#777', fontWeight: '500' }}><MultiLineCell values={customerIds} /></td>
                      <td style={{ padding: '9px 10px', fontWeight: '500', color: '#333', whiteSpace:'normal', wordBreak:'break-word', overflowWrap:'anywhere', verticalAlign:'top' }}>{c.booking_name || '—'}</td>
                      <td style={{ padding: '9px 10px', color: '#555', whiteSpace:'normal', wordBreak:'break-word', overflowWrap:'anywhere', verticalAlign:'top' }}>
                        <div>{formatAddress(c.address) || '—'}</div>
                      </td>
                      <td style={{ padding: '9px 10px', color: '#555' }}><MultiLineCell values={[contacts, altContacts]} /></td>
                      <td style={{ padding: '9px 10px', color: '#555', whiteSpace: 'nowrap' }}>
                        <div>{c.day || '—'}</div>
                        {c.slot && <div style={{ fontSize: '9px', color: '#aaa' }}>{c.slot}</div>}
                      </td>
                      <td style={{ padding: '9px 10px', color: '#555', whiteSpace:'normal', wordBreak:'break-word', overflowWrap:'anywhere', verticalAlign:'top' }}>{c.area || '—'}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{c.total_standard_hissa || 0}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{c.total_premium_hissa || 0}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{c.total_waqf_hissa || 0}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{c.total_goat_hissa || 0}</td>
                      <td style={{ padding: '9px 10px', color: '#555', fontWeight: '600' }}>{Number(c.total_hissa ?? c.order_count ?? 0)}</td>
                      <td style={{ padding: '9px 10px', color: '#666', whiteSpace:'normal', wordBreak:'break-word', overflowWrap:'anywhere', verticalAlign:'top' }} title={names}>
                        {names}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {/* Pagination */}
{!loading && displayRows.length > 0 && (
  <div
    className="om-pagination"
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '12px',
      padding: '12px 0',
      borderTop: '1px solid #e0e0e0',
      marginTop: '8px',
      flexShrink: 0,
    }}
  >
    <span style={{ fontSize: '13px', color: '#666' }}>
      Showing {pagedRows.length} of {displayRows.length} challans
    </span>

    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => setPage((p) => Math.max(1, p - 1))}
        style={{
          padding: '6px 12px',
          fontSize: '10px',
          background: page <= 1 ? '#f0f0f0' : '#fff',
          color: page <= 1 ? '#999' : '#333',
          border: '1px solid #e0e0e0',
          borderRadius: '6px',
          cursor: page <= 1 ? 'not-allowed' : 'pointer',
        }}
      >
        Previous
      </button>

      {(() => {
        const sp = 5;
        let start = Math.max(1, page - Math.floor(sp / 2));
        let end = Math.min(totalPages, start + sp - 1);

        if (end - start + 1 < sp) {
          start = Math.max(1, end - sp + 1);
        }

        const pages = [];
        for (let i = start; i <= end; i++) pages.push(i);

        return pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPage(p)}
            style={{
              minWidth: '32px',
              padding: '6px 10px',
              fontSize: '10px',
              background: p === page ? '#FF5722' : '#fff',
              color: p === page ? '#fff' : '#333',
              border: '1px solid #e0e0e0',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: p === page ? 600 : 400,
            }}
          >
            {p}
          </button>
        ));
      })()}

      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        style={{
          padding: '6px 12px',
          fontSize: '10px',
          background: page >= totalPages ? '#f0f0f0' : '#fff',
          color: page >= totalPages ? '#999' : '#333',
          border: '1px solid #e0e0e0',
          borderRadius: '6px',
          cursor: page >= totalPages ? 'not-allowed' : 'pointer',
        }}
      >
        Next
      </button>
    </div>
  </div>
)}
      </div>

      {/* Confirm regenerate */}
      {confirmRegen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setConfirmRegen(false)}>
          <div style={{ background: '#fff', borderRadius: '18px', border: '1.5px solid #F0F0F0', padding: '20px', maxWidth: '440px', width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.12)' }}
            onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: '600', color: '#333' }}>Generate new batch of challans?</h2>
            <p style={{ margin: '0 0 18px', fontSize: '12px', color: '#666' }}>
              This creates a <strong>new batch</strong> from current 2026 orders. Existing batches and their challans are preserved.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setConfirmRegen(false)}
                style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #e0e0e0', background: '#fff', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
              <button type="button" onClick={doRegenerate}
                style={{ padding: '9px 18px', borderRadius: '8px', background: '#C62828', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Yes, generate</button>
            </div>
          </div>
        </div>
      )}

      {/* Challan detail modal — view only */}
      {modal && (
        <SharedChallanModal
          challanId={modal.challan?.challan_id}
          customerId={modalCustomerIds.length ? modalCustomerIds.join(', ') : '—'}
          description={modalDescription}
          statusBadge={<StatusBadge status={modal.challan?.derived_status} />}
          onClose={() => setModal(null)}
          maxWidth="1240px"
          infoRows={[
            ['Address', modal.challan?.address ? formatAddress(modal.challan.address) : '—'],
            ['Booking Name', modal.challan?.booking_name || [...new Set((modal.orders || []).map((o) => o.booking_name).filter(Boolean))].join(', ') || '—'],
            ['Area', modal.challan?.area || '—'],
            ['Day', modal.challan?.day || '—'],
            ['Slot', modal.challan?.slot || '—'],
            ['Rider', modalRiderDetails.name],
                        ['Total Hissa', formatTotalHissa(modal.challan?.total_hissa ?? modal.challan?.order_count ?? 0, { premium: modal.challan?.total_premium_hissa, standard: modal.challan?.total_standard_hissa, goat: modal.challan?.total_goat_hissa })],
          ]}
          orders={(modal.orders || []).filter((o) => ALLOWED_ORDER_TYPES.includes(normalizeOrderType(o.order_type)))}
          renderOrderStatus={(o) => <StatusBadge status={o.delivery_status} />}
        />
      )}
    </>
  );
}