import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";

const fmt = (n) => Number(n || 0).toLocaleString("en-PK");

// ✅ DEV ONLY: set a number here to preview donut (e.g. 1999 / 2089). Keep null to use real API value.
const DEV_PREVIEW_TOTAL_ORDERS = null; // example: 2089

// Fixed labels everywhere (must always render these 4)
const FIXED_TYPES = [
  { key: "premium", label: "Hissa - Premium" },
  { key: "standard", label: "Hissa - Standard" },
  { key: "waqf", label: "Hissa - Waqf" },
  { key: "goat", label: "Goat (Hissa)" },
];

/* -----------------------------
   Animations (Counters)
------------------------------ */

/**
 * Smooth count-up using requestAnimationFrame.
 * - Re-animates when "value" changes.
 */
const useCountUp = (value, { duration = 700 } = {}) => {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(0);
  const fromRef = useRef(0);
  const toRef = useRef(0);

  useEffect(() => {
    const to = Number(value || 0);
    const from = Number(display || 0);

    if (!Number.isFinite(to)) {
      setDisplay(0);
      return;
    }
    if (to === from) return;

    fromRef.current = from;
    toRef.current = to;
    startRef.current = performance.now();

    const tick = (now) => {
      const t = Math.min(1, (now - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const next = fromRef.current + (toRef.current - fromRef.current) * eased;

      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return display;
};

const AnimatedNumber = ({
  value,
  format = (n) => fmt(Math.round(n)),
  duration = 700,
  className,
}) => {
  const n = useCountUp(value, { duration });
  return <span className={className}>{format(n)}</span>;
};

/* -----------------------------
   KPI Card (with blur mode)
------------------------------ */

const KPIBox = ({
  title,
  value,
  icon,
  bubble,
  isMoney,
  isPercent,
  reveal = true,
}) => {
  const numeric = Number(
    String(value ?? "")
      .replace(/[^0-9.-]/g, "")
      .trim()
  );

  const canAnimate = Number.isFinite(numeric);

  const renderFormatted = () => {
    if (value === "—" || value === null || value === undefined) return "—";

    if (canAnimate) {
      return (
        <AnimatedNumber
          value={numeric}
          duration={650}
          format={(n) => {
            const rounded = isPercent ? Number(n).toFixed(1) : Math.round(n);
            if (isPercent) return `${rounded}%`;
            if (isMoney) return `PKR ${fmt(rounded)}`;
            return fmt(rounded);
          }}
        />
      );
    }
    return value;
  };

  return (
    <div className="kpiCard animPop">
      <div className="kpiIcon" style={{ background: bubble }}>
        {icon}
      </div>

      <div className="kpiText">
        <div className="kpiTitle">{title}</div>
        <div className={`kpiValue ${reveal ? "" : "kpiBlur"}`}>
          {renderFormatted()}
        </div>
      </div>
    </div>
  );
};

/* -----------------------------
   Donut + Progress
------------------------------ */

const TargetDonut = ({
  achieved = 0,
  target = 2000,
  size = 200,
  stroke = 16,
  color = "#0B8A6A",
  overflowColor = "#0A5B47",
  track = "#EAEAEA",
}) => {
  const radius = (size - stroke) / 2;
  const c = 2 * Math.PI * radius;

  const baseRatio = Math.min(achieved / target, 1);
  const baseDash = c * baseRatio;

  const overflowRatio = achieved > target ? (achieved - target) / target : 0;
  const overflowCapped = Math.min(overflowRatio, 1);
  const overflowDash = c * overflowCapped;

  const rotate = `rotate(-90 ${size / 2} ${size / 2})`;
  const isAchieved = achieved >= target;

  return (
    <div
      className="donutShell animFade"
      style={{ position: "relative", width: size, height: size }}
    >
      <svg width={size} height={size} className="donutSvg">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={track}
          strokeWidth={stroke}
          fill="none"
        />

        <circle
          className="donutArc donutArcBase"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="butt"
          fill="none"
          strokeDasharray={`${baseDash} ${c - baseDash}`}
          transform={rotate}
        />

        {overflowDash > 0 && (
          <circle
            className="donutArc donutArcOverflow"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={overflowColor}
            strokeWidth={stroke}
            strokeLinecap="butt"
            fill="none"
            strokeDasharray={`${overflowDash} ${c - overflowDash}`}
            transform={rotate}
          />
        )}
      </svg>

      <div className="donutCenter">
        <div className="donutSmall">Total Orders:</div>
        <div className="donutBig">
          <AnimatedNumber
            value={achieved}
            duration={850}
            format={(n) => fmt(Math.round(n))}
          />
        </div>
        {!isAchieved ? (
          <div className="donutRed">
            Remaining:{" "}
            <AnimatedNumber
              value={Math.max(0, target - achieved)}
              duration={850}
              format={(n) => fmt(Math.round(n))}
            />
          </div>
        ) : (
          <div className="donutRed">Target Achieved!</div>
        )}
      </div>
    </div>
  );
};

const ProgressRow = ({ label, value, percentage }) => {
  const pct = Number.isFinite(percentage) ? percentage : 0;
  const clamped = Math.min(pct, 100);

  return (
    <div className="progressRow animSlide">
      <div className="progressHead">
        <div className="progressLabel">{label}</div>
        <div className="progressVal">
          <AnimatedNumber
            value={Number(value || 0)}
            duration={700}
            format={(n) => fmt(Math.round(n))}
          />{" "}
          <span className="progressPct">({pct.toFixed(1)}%)</span>
        </div>
      </div>

      <div className="progressTrack">
        <div
          className="progressFill progressAnim"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
};

const TargetAchievement = ({ achieved, target, breakdown }) => {
  return (
    <div className="card animCard">
      <div className="cardTitleBig">TARGET ACHIEVEMENT</div>

      <div className="targetGrid">
        <div className="donutWrap">
          <TargetDonut achieved={achieved} target={target} />
        </div>

        <div className="progressWrap">
          {(breakdown || []).map((b) => (
            <ProgressRow
              key={b.key}
              label={b.label}
              value={b.value}
              percentage={b.percentage}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

/* -----------------------------
   Day Wise Summary
------------------------------ */

const DayWiseSummary = ({ days }) => {
  const renderCell = (val) => {
    const num = Number(val);
    if (Number.isFinite(num)) {
      return (
        <AnimatedNumber
          value={num}
          duration={650}
          format={(n) => fmt(Math.round(n))}
        />
      );
    }
    return val ?? "—";
  };

  return (
    <div className="card animCard">
      <div className="cardTitleBig">DAY WISE SUMMARY</div>

      <div className="dayGrid">
        {(days || []).map((d) => (
          <div key={d.key} className="dayCard animPop">
            <div className="dayHeader">{d.title}</div>

            <table className="tblCompact">
              <thead>
                <tr>
                  <th></th>
                  <th>Premium</th>
                  <th>Standard</th>
                  <th>Waqf</th>
                  <th>Goat</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {(d.data || []).map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td>{renderCell(r.premium)}</td>
                    <td>{renderCell(r.standard)}</td>
                    <td>{renderCell(r.waqf)}</td>
                    <td>{renderCell(r.goat)}</td>
                    <td>{renderCell(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
};

/* -----------------------------
   Reference Wise Summary
------------------------------ */

const ReferenceWiseSummary = ({ references }) => {
  const renderCell = (val) => {
    const num = Number(val);
    if (Number.isFinite(num)) {
      return (
        <AnimatedNumber
          value={num}
          duration={650}
          format={(n) => fmt(Math.round(n))}
        />
      );
    }
    return val ?? "—";
  };

  return (
    <div className="card animCard">
      <div className="cardTitleBig">REFERENCE WISE SUMMARY</div>

      <div className="tableWrapRef">
        <table className="tblRefOld">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Leads Generated</th>
              <th>Leads Converted</th>
              <th>Total Revenue Generated</th>
              <th>Conversion Rate</th>
            </tr>
          </thead>
          <tbody>
            {(references || []).map((r) => (
              <tr key={r.name} className="animRow">
                <td>{r.name}</td>
                <td>{renderCell(r.leadsGenerated)}</td>
                <td>{renderCell(r.leadsConverted)}</td>
                <td>
                  Rs.{" "}
                  <AnimatedNumber
                    value={Number(r.totalRevenueGenerated || 0)}
                    duration={700}
                    format={(n) => fmt(Math.round(n))}
                  />
                </td>
                <td>
                  <AnimatedNumber
                    value={Number(r.conversionRate || 0)}
                    duration={650}
                    format={(n) => `${Math.round(n)}%`}
                  />
                </td>
              </tr>
            ))}
            {(!references || references.length === 0) && (
              <tr>
                <td>—</td>
                <td>0</td>
                <td>0</td>
                <td>Rs. 0</td>
                <td>0%</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* -----------------------------
   Dashboard
------------------------------ */

const Dashboard = () => {
  const { user } = useAuth();
  const [year, setYear] = useState("2026");
  const [loading, setLoading] = useState(true);

  const [kpis, setKpis] = useState(null);
  const [targetData, setTargetData] = useState(null);
  const [days, setDays] = useState([]);
  const [references, setReferences] = useState([]);

  // ✅ Blur/unblur KPI values (like Transactions amountVisible)
  const [kpiValuesVisible, setKpiValuesVisible] = useState(false);

  const token = useMemo(() => localStorage.getItem("token"), []);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const [k, t, d, r] = await Promise.all([
          fetch(`/api/dashboard/kpis?year=${encodeURIComponent(year)}`, {
            headers,
          }),
          fetch(
            `/api/dashboard/target-achievement?year=${encodeURIComponent(year)}`,
            { headers }
          ),
          fetch(`/api/dashboard/day-wise?year=${encodeURIComponent(year)}`, {
            headers,
          }),
          fetch(`/api/dashboard/reference-wise?year=${encodeURIComponent(year)}`, {
            headers,
          }),
        ]);

        const kj = await k.json();
        const tj = await t.json();
        const dj = await d.json();
        const rj = await r.json();

        if (!k.ok) throw new Error(kj?.message || "KPIs failed");
        if (!t.ok) throw new Error(tj?.message || "Target failed");
        if (!d.ok) throw new Error(dj?.message || "Day-wise failed");
        if (!r.ok) throw new Error(rj?.message || "Reference-wise failed");

        setKpis(kj.kpis || null);
        setTargetData(tj || null);
        setDays(dj.days || []);
        setReferences(rj.references || []);
      } catch (e) {
        console.error(e);
        setKpis(null);
        setTargetData(null);
        setDays([]);
        setReferences([]);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [year, token]);

  const achievedReal = Number(targetData?.target?.achievedTotal || 0);

  const achievedForDonut =
    Number.isFinite(Number(DEV_PREVIEW_TOTAL_ORDERS)) &&
    DEV_PREVIEW_TOTAL_ORDERS !== null
      ? Number(DEV_PREVIEW_TOTAL_ORDERS)
      : achievedReal;

  const targetTotal = Number(targetData?.target?.targetTotal || 2000);

  const breakdownFromApi = Array.isArray(targetData?.breakdown)
    ? targetData.breakdown
    : [];
  const apiMap = new Map(breakdownFromApi.map((b) => [String(b.key), b]));

  const fixedBreakdown = FIXED_TYPES.map((t) => {
    const found = apiMap.get(t.key);
    const value = Number(found?.value || 0);
    const pct = achievedReal > 0 ? (value / achievedReal) * 100 : 0;
    return { key: t.key, label: t.label, value, percentage: pct };
  });

  return (
    <div className="page">
      <style>{`
        * { box-sizing: border-box; }

        .page{
          padding: 24px;
          font-family: 'Poppins', sans-serif;
          display:flex;
          flex-direction:column;
          gap: 18px;
        }

        /* ---------------- Animations ---------------- */
        .animCard{ animation: cardIn .45s ease-out both; }
        .animPop{ animation: popIn .45s ease-out both; }
        .animFade{ animation: fadeIn .55s ease-out both; }
        .animSlide{ animation: slideIn .50s ease-out both; }
        .animRow{ animation: fadeUp .45s ease-out both; }

        @keyframes cardIn{ from{opacity:0; transform:translateY(8px);} to{opacity:1; transform:translateY(0);} }
        @keyframes popIn{ from{opacity:0; transform:scale(.985);} to{opacity:1; transform:scale(1);} }
        @keyframes fadeIn{ from{opacity:0;} to{opacity:1;} }
        @keyframes slideIn{ from{opacity:0; transform:translateX(-6px);} to{opacity:1; transform:translateX(0);} }
        @keyframes fadeUp{ from{opacity:0; transform:translateY(6px);} to{opacity:1; transform:translateY(0);} }

        .progressAnim{ animation: barGrow .7s ease-out both; transform-origin:left; }
        @keyframes barGrow{ from{transform:scaleX(0);} to{transform:scaleX(1);} }

        /* Header */
        .header{
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .hTitle{ margin:0; font-size:28px; font-weight:800; color:#111827; }
        .hSub{ margin:8px 0 0; font-size:18px; color:#6b7280; }

        .headerRight{
          display:flex;
          align-items:center;
          gap: 10px;
        }

        .select{
          padding: 10px 14px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          font-size: 16px;
          background: #fff;
          cursor:pointer;
        }

        /* Toggle button */
        .kpiToggleBtn{
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          background: #fff;
          cursor: pointer;
          display:flex;
          align-items:center;
          justify-content:center;
          box-shadow: 0 6px 14px rgba(0,0,0,0.05);
        }
        .kpiToggleBtn:hover{ background:#f9fafb; }
        .kpiToggleIcon{ width:22px; height:22px; display:block; }

        /* KPI */
        .kpiGrid{
          display:grid;
          grid-template-columns: repeat(3, minmax(260px, 1fr));
          gap: 18px;
        }
        @media (max-width: 1100px){
          .kpiGrid{ grid-template-columns: repeat(2, minmax(240px, 1fr)); }
        }
        @media (max-width: 720px){
          .kpiGrid{ grid-template-columns: 1fr; }
        }

        .kpiCard{
          background:#fff;
          border-radius: 18px;
          padding: 18px;
          display:flex;
          align-items:center;
          gap: 16px;
          box-shadow: 0 10px 22px rgba(0,0,0,0.06);
          border: 1px solid #f1f1f1;
        }
        .kpiIcon{
          width: 62px; height: 62px; border-radius: 999px;
          display:flex; align-items:center; justify-content:center;
          font-size: 28px;
          flex: 0 0 auto;
        }
        .kpiTitle{ font-size: 16px; color:#6b7280; }
        .kpiValue{ font-size: 34px; font-weight: 900; color:#111827; }

        /* ✅ Blur values like Transactions */
        .kpiBlur{
          filter: blur(6px);
          user-select: none;
          color: #9ca3af;
        }

        .card{
          background:#fff;
          border-radius: 18px;
          padding: 22px;
          border: 1px solid #f1f1f1;
          box-shadow: 0 10px 22px rgba(0,0,0,0.06);
        }

        .cardTitleBig{
          text-align:center;
          font-size: 44px;
          font-weight: 900;
          letter-spacing: 1px;
          color:#243447;
          margin-bottom: 18px;
          white-space:nowrap;
        }
        @media(max-width:720px){
          .cardTitleBig{ font-size: 30px; white-space:normal; }
        }

        /* Target */
        .targetGrid{
          display:grid;
          grid-template-columns: 260px 1fr;
          gap: 18px;
          align-items:center;
        }
        @media(max-width:980px){ .targetGrid{ grid-template-columns:1fr; } }
        .donutWrap{ display:flex; justify-content:center; }
        .donutCenter{
          position:absolute;
          inset:0;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          text-align:center;
          white-space:nowrap;
        }
        .donutSmall{ font-size: 13px; color:#374151; }
        .donutBig{ font-size: 40px; font-weight: 900; color:#1f2937; }
        .donutRed{ font-size: 13px; color:#b91c1c; font-style: italic; }

        .progressWrap{ display:flex; flex-direction:column; gap: 14px; }
        .progressRow{ display:flex; flex-direction:column; gap: 8px; }
        .progressHead{ display:flex; justify-content:space-between; align-items:baseline; gap: 10px; }
        .progressLabel{ font-size: 16px; font-weight: 800; color:#111827; white-space:nowrap; }
        .progressVal{ font-size: 16px; font-weight: 900; color:#111827; white-space:nowrap; }
        .progressPct{ font-weight: 700; color:#374151; }

        .progressTrack{
          height: 10px;
          border-radius: 999px;
          background:#d9d9d9;
          overflow:hidden;
        }
        .progressFill{
          height:100%;
          background:#0B8A6A;
          border-radius: 999px;
        }

        /* Day Wise */
        .dayGrid{
          display:grid;
          grid-template-columns: repeat(3, minmax(320px,1fr));
          gap:20px;
        }
        @media(max-width:1200px){ .dayGrid{ grid-template-columns:1fr; } }

        .dayHeader{
          background:#0B8A6A;
          color:#fff;
          font-size:24px;
          font-weight:900;
          text-align:center;
          padding:14px;
          border-radius:12px;
          margin-bottom:12px;
        }

        .tblCompact{
          width:100%;
          border-collapse:separate;
          border-spacing:0;
          background:#f7f7f7;
          border:1px solid #ededed;
          border-radius:14px;
          overflow:hidden;
          table-layout:fixed;
        }

        .tblCompact th,
        .tblCompact td{
          padding:10px 8px;
          font-size:13px;
          text-align:center;
          border-bottom:1px solid #ededed;
          border-right:1px solid #ededed;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }

        .tblCompact th{
          background:#f0f0f0;
          font-weight:900;
          overflow:visible;
          text-overflow:clip;
          letter-spacing:0.2px;
        }

        .tblCompact tr:last-child td{ border-bottom:none; }
        .tblCompact th:last-child,
        .tblCompact td:last-child{ border-right:none; }

        .tblCompact th:first-child,
        .tblCompact td:first-child{
          width:38%;
          text-align:left;
          font-weight:800;
          background:#fafafa;
        }

        .tblCompact th:not(:first-child),
        .tblCompact td:not(:first-child){
          width:12.4%;
        }

        /* Reference */
        .tableWrapRef{ width:100%; overflow-x:auto; border-radius:14px; }
        .tblRefOld{
          width:100%;
          border-collapse: separate;
          border-spacing:0;
          background:#f7f7f7;
          border:1px solid #ededed;
          border-radius:14px;
          overflow:hidden;
          min-width: 900px;
        }
        .tblRefOld th, .tblRefOld td{
          padding: 14px 12px;
          font-size: 14px;
          color:#243447;
          text-align:center;
          border-bottom:1px solid #ededed;
          border-right:1px solid #ededed;
          white-space:nowrap;
        }
        .tblRefOld th{ background:#f0f0f0; font-weight:900; }
        .tblRefOld tr:last-child td{ border-bottom:none; }
        .tblRefOld th:last-child, .tblRefOld td:last-child{ border-right:none; }

        .tblRefOld th:first-child,
        .tblRefOld td:first-child{
          text-align:left;
          width:240px;
          font-weight:800;
          background:#fafafa;
        }
      `}</style>

      {/* Header */}
      <div className="header">
        <div>
          <h1 className="hTitle">Dashboard</h1>
          <p className="hSub">Welcome, {user?.username || "Manager"}</p>
        </div>

        <div className="headerRight">
          <select className="select" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="all">All Year</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
          </select>

          {/* ✅ Blur/unblur KPI values */}
          <button
            type="button"
            onClick={() => setKpiValuesVisible((v) => !v)}
            title={kpiValuesVisible ? "Hide Amounts" : "Show Amounts"}
            className="kpiToggleBtn"
          >
            <img
              src={kpiValuesVisible ? "/icons/hide.png" : "/icons/show.png"}
              alt={kpiValuesVisible ? "Hide" : "Show"}
              className="kpiToggleIcon"
            />
          </button>
        </div>
      </div>

      {/* KPI Cards (always visible; values blur/unblur) */}
      <div className="kpiGrid">
        <KPIBox title="Total Orders" value={kpis ? kpis.totalOrders : "—"} icon="📦" bubble="#e8f6ff" reveal={kpiValuesVisible} />
        <KPIBox title="Payments Clearance" value={kpis ? kpis.clearanceRate : "—"} icon="✔" bubble="#e6f9eb" isPercent reveal={kpiValuesVisible} />
        <KPIBox title="Pending Payments" value={kpis ? kpis.pendingPaymentsCount : "—"} icon="⏳" bubble="#fce7ef" reveal={kpiValuesVisible} />
        <KPIBox title="Total Sales" value={kpis ? kpis.totalSales : "—"} icon="💰" bubble="#fff4e5" isMoney reveal={kpiValuesVisible} />
        <KPIBox title="Received Payments" value={kpis ? kpis.receivedPayments : "—"} icon="💵" bubble="#e6f9eb" isMoney reveal={kpiValuesVisible} />
        <KPIBox title="Pending Amount" value={kpis ? kpis.pendingAmount : "—"} icon="📉" bubble="#fde8e8" isMoney reveal={kpiValuesVisible} />
      </div>

      {loading ? (
        <div className="card animCard" style={{ textAlign: "center", color: "#6b7280" }}>
          Loading dashboard...
        </div>
      ) : (
        <>
          <TargetAchievement achieved={achievedForDonut} target={targetTotal} breakdown={fixedBreakdown} />
          <DayWiseSummary days={days} />
          <ReferenceWiseSummary references={references} />
        </>
      )}
    </div>
  );
};

export default Dashboard;