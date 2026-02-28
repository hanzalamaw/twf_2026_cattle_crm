// src/pages/Dashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const fmt = (n) => Number(n || 0).toLocaleString("en-PK");

// ✅ DEV ONLY: set a number here to preview donut (e.g. 1999 / 2089). Keep null to use real API value.
const DEV_PREVIEW_TOTAL_ORDERS = null;

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

const useCountUp = (value, { duration = 600 } = {}) => {
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
      const eased = 1 - Math.pow(1 - t, 3);
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
  duration = 600,
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
          duration={600}
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

        {/* ✅ When hidden, blur like Bank field (only value area) */}
        <div className={`kpiValue ${reveal ? "" : "kpiBlurField"}`}>
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
  color = "#FF5722",
  overflowColor = "#E64A19",
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
    <div className="donutShell animFade" style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} className="donutSvg">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={track} strokeWidth={stroke} fill="none" />

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
          <AnimatedNumber value={achieved} duration={750} format={(n) => fmt(Math.round(n))} />
        </div>

        {!isAchieved ? (
          <div className="donutRed">
            Remaining:{" "}
            <AnimatedNumber value={Math.max(0, target - achieved)} duration={750} format={(n) => fmt(Math.round(n))} />
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
          <AnimatedNumber value={Number(value || 0)} duration={600} format={(n) => fmt(Math.round(n))} />{" "}
          <span className="progressPct">({pct.toFixed(1)}%)</span>
        </div>
      </div>

      <div className="progressTrack">
        <div className="progressFill progressAnim" style={{ width: `${clamped}%` }} />
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
            <ProgressRow key={b.key} label={b.label} value={b.value} percentage={b.percentage} />
          ))}
        </div>
      </div>
    </div>
  );
};

/* -----------------------------
   Day Wise Summary (single table: row headers + DAY 1 | DAY 2 | DAY 3 columns)
------------------------------ */

const DayWiseSummary = ({ days }) => {
  const renderCell = (val) => {
    const num = Number(val);
    if (Number.isFinite(num)) {
      return <AnimatedNumber value={num} duration={600} format={(n) => fmt(Math.round(n))} />;
    }
    return val ?? "—";
  };

  const dayList = days || [];
  const rowLabels = ["Total Orders", "Payment Cleared", "Pending (Completely)", "Pending (Partially)"];
  const colLabels = ["Premium", "Standard", "Waqf", "Goat", "Total"];

  return (
    <div className="card animCard">
      <div className="cardTitleBig">DAY WISE SUMMARY</div>

      <div className="dayWiseTableWrap">
        <table className="tblDayWise">
          <thead>
            <tr>
              <th className="dayWiseRowHeader">&nbsp;</th>
              {(dayList).map((d) => (
                <th key={d.key} colSpan={5} className="dayWiseDayHeader">
                  {d.title}
                </th>
              ))}
            </tr>
            <tr>
              <th className="dayWiseRowHeader">&nbsp;</th>
              {(dayList).map((d) =>
                colLabels.map((col) => (
                  <th key={`${d.key}-${col}`} className="dayWiseColHeader">
                    {col}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {rowLabels.map((label) => (
              <tr key={label}>
                <td className="dayWiseRowLabel">{label}</td>
                {(dayList).map((d) => {
                  const row = (d.data || []).find((r) => r.label === label);
                  if (!row)
                    return colLabels.map((col) => (
                      <td key={`${d.key}-${label}-${col}`} className="dayWiseCell">—</td>
                    ));
                  return (
                    <React.Fragment key={d.key}>
                      <td className="dayWiseCell">{renderCell(row.premium)}</td>
                      <td className="dayWiseCell">{renderCell(row.standard)}</td>
                      <td className="dayWiseCell">{renderCell(row.waqf)}</td>
                      <td className="dayWiseCell">{renderCell(row.goat)}</td>
                      <td className="dayWiseCell">{renderCell(row.total)}</td>
                    </React.Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
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
      return <AnimatedNumber value={num} duration={600} format={(n) => fmt(Math.round(n))} />;
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
                  <AnimatedNumber value={Number(r.totalRevenueGenerated || 0)} duration={650} format={(n) => fmt(Math.round(n))} />
                </td>
                <td>
                  <AnimatedNumber value={Number(r.conversionRate || 0)} duration={600} format={(n) => `${Math.round(n)}%`} />
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
   Source Wise Summary (card grid)
------------------------------ */

const SourceWiseSummary = ({ sources }) => {
  return (
    <div className="card animCard">
      <div className="cardTitle">SOURCE WISE SUMMARY</div>
      <div className="sourceGrid">
        {(sources || []).map((s, i) => (
          <div key={s.sourceName + i} className="sourceCard animPop">
            <div className="sourceIcon">
              <span className="sourcePin">📍</span>
            </div>
            <div className="sourceName">{s.sourceName}</div>
            <div className="sourceCount">
              <AnimatedNumber value={Number(s.count || 0)} duration={500} format={(n) => fmt(Math.round(n))} />
            </div>
          </div>
        ))}
        {(!sources || sources.length === 0) && (
          <div className="sourceCard sourceCardEmpty">No source data</div>
        )}
      </div>
    </div>
  );
};

/* -----------------------------
   Sales Overview (line chart + tooltip)
------------------------------ */

const SalesOverviewChart = ({ series, reveal }) => {
  const data = useMemo(() => (series || []).map((d) => ({ ...d, name: d.date })), [series]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length || !label) return null;
    const p = payload[0]?.payload || {};
    return (
      <div className="chartTooltip">
        <div className="chartTooltipTitle">{label}</div>
        <div className="chartTooltipRow">
          <span>Orders:</span>
          <span>{fmt(Number(p.orders || 0))}</span>
        </div>
        <div className="chartTooltipRow green">
          <span>Total Sales:</span>
          <span>Rs {fmt(Number(p.totalSales || 0))}</span>
        </div>
        <div className="chartTooltipRow green">
          <span>Received Payments:</span>
          <span>Rs {fmt(Number(p.receivedPayments || 0))}</span>
        </div>
        <div className="chartTooltipRow red">
          <span>Pending Payments:</span>
          <span>Rs {fmt(Number(p.pendingPayments || 0))}</span>
        </div>
        <div className="chartTooltipRow">
          <span>Total Quantity:</span>
          <span>{fmt(Number(p.totalQuantity || 0))}</span>
        </div>
        <div className="chartTooltipRow">
          <span>Avg Order Value:</span>
          <span>Rs {fmt(Number(p.avgOrderValue || 0))}</span>
        </div>
      </div>
    );
  };

  if (!data.length) {
    return (
      <div className="card animCard">
        <div className="cardTitle">SALES OVERVIEW</div>
        <div className="chartPlaceholder">No data for selected year</div>
      </div>
    );
  }

  return (
    <div className="card animCard">
      <div className="cardTitle">SALES OVERVIEW</div>
      <div className="chartWrap">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#6b7280" />
            <YAxis tick={{ fontSize: 10 }} stroke="#6b7280" tickFormatter={(v) => fmt(v)} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#FF5722", strokeWidth: 1 }} />
            <Line
              type="monotone"
              dataKey={reveal ? "totalSales" : "orders"}
              stroke="#FF5722"
              strokeWidth={2}
              dot={{ fill: "#FF5722", r: 3 }}
              activeDot={{ r: 5, fill: "#FF5722", stroke: "#fff", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
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
  const [sources, setSources] = useState([]);
  const [references, setReferences] = useState([]);
  const [salesOverview, setSalesOverview] = useState([]);

  const [kpiValuesVisible, setKpiValuesVisible] = useState(false);

  const token = useMemo(() => localStorage.getItem("token"), []);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const y = encodeURIComponent(year);

        const [k, t, d, src, r, sales] = await Promise.all([
          fetch(`/api/dashboard/kpis?year=${y}`, { headers }),
          fetch(`/api/dashboard/target-achievement?year=${y}`, { headers }),
          fetch(`/api/dashboard/day-wise?year=${y}`, { headers }),
          fetch(`/api/dashboard/source-wise?year=${y}`, { headers }),
          fetch(`/api/dashboard/reference-wise?year=${y}`, { headers }),
          fetch(`/api/dashboard/sales-overview?year=${y}`, { headers }),
        ]);

        const kj = await k.json();
        const tj = await t.json();
        const dj = await d.json();
        const srcj = await src.json();
        const rj = await r.json();
        const salesj = await sales.json();

        if (!k.ok) throw new Error(kj?.message || "KPIs failed");
        if (!t.ok) throw new Error(tj?.message || "Target failed");
        if (!d.ok) throw new Error(dj?.message || "Day-wise failed");
        if (!src.ok) throw new Error(srcj?.message || "Source-wise failed");
        if (!r.ok) throw new Error(rj?.message || "Reference-wise failed");
        if (!sales.ok) throw new Error(salesj?.message || "Sales overview failed");

        setKpis(kj.kpis || null);
        setTargetData(tj || null);
        setDays(dj.days || []);
        setSources(srcj.sources || []);
        setReferences(rj.references || []);
        setSalesOverview(salesj.series || []);
      } catch (e) {
        console.error(e);
        setKpis(null);
        setTargetData(null);
        setDays([]);
        setSources([]);
        setReferences([]);
        setSalesOverview([]);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [year, token]);

  const achievedReal = Number(targetData?.target?.achievedTotal || 0);

  const achievedForDonut =
    Number.isFinite(Number(DEV_PREVIEW_TOTAL_ORDERS)) && DEV_PREVIEW_TOTAL_ORDERS !== null
      ? Number(DEV_PREVIEW_TOTAL_ORDERS)
      : achievedReal;

  const targetTotal = Number(targetData?.target?.targetTotal || 2000);

  const breakdownFromApi = Array.isArray(targetData?.breakdown) ? targetData.breakdown : [];
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
        *{ box-sizing:border-box; }

        .page{
          padding: 12px 16px;
          font-family: 'Poppins', 'Inter', sans-serif;
          display:flex;
          flex-direction:column;
          gap: 10px;
        }

        /* ---------------- Animations ---------------- */
        .animCard{ animation: cardIn .35s ease-out both; }
        .animPop{ animation: popIn .35s ease-out both; }
        .animFade{ animation: fadeIn .45s ease-out both; }
        .animSlide{ animation: slideIn .40s ease-out both; }
        .animRow{ animation: fadeUp .35s ease-out both; }

        @keyframes cardIn{ from{opacity:0; transform:translateY(6px);} to{opacity:1; transform:translateY(0);} }
        @keyframes popIn{ from{opacity:0; transform:scale(.99);} to{opacity:1; transform:scale(1);} }
        @keyframes fadeIn{ from{opacity:0;} to{opacity:1;} }
        @keyframes slideIn{ from{opacity:0; transform:translateX(-4px);} to{opacity:1; transform:translateX(0);} }
        @keyframes fadeUp{ from{opacity:0; transform:translateY(4px);} to{opacity:1; transform:translateY(0);} }

        .progressAnim{ animation: barGrow .6s ease-out both; transform-origin:left; }
        @keyframes barGrow{ from{transform:scaleX(0);} to{transform:scaleX(1);} }

        /* Header */
        .header{
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .hTitle{ margin:0; font-size:18px; font-weight:700; color:#111827; }
        .hSub{ margin:4px 0 0; font-size:12px; color:#6b7280; }

        .headerRight{ display:flex; align-items:center; gap: 8px; }
        .select{
          padding: 6px 10px;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
          font-size: 12px;
          background: #fff;
          cursor:pointer;
        }

        /* Toggle button */
        .kpiToggleBtn{
          padding: 8px 10px;
          border-radius: 10px;
          border: 1px solid #e5e7eb;
          background: #fff;
          cursor: pointer;
          display:flex;
          align-items:center;
          justify-content:center;
          box-shadow: 0 6px 14px rgba(0,0,0,0.05);
        }
        .kpiToggleBtn:hover{ background:#f9fafb; }
        .kpiToggleIcon{ width:18px; height:18px; display:block; }

        /* KPI */
        .kpiGrid{
          display:grid;
          grid-template-columns: repeat(3, minmax(160px, 1fr));
          gap: 8px;
        }
        @media (max-width: 1100px){
          .kpiGrid{ grid-template-columns: repeat(2, minmax(160px, 1fr)); }
        }
        @media (max-width: 720px){
          .kpiGrid{ grid-template-columns: 1fr; }
        }

        .kpiCard{
          background:#fff;
          border-radius: 10px;
          padding: 8px 10px;
          display:flex;
          align-items:center;
          gap: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
          border: 1px solid #f1f1f1;
        }
        .kpiIcon{
          width: 36px; height: 36px; border-radius: 8px;
          display:flex; align-items:center; justify-content:center;
          font-size: 16px;
          flex: 0 0 auto;
        }
        .kpiTitle{ font-size: 11px; color:#6b7280; }
        .kpiValue{ font-size: 16px; font-weight: 800; color:#111827; line-height: 1.1; }

        /* Blur like "Bank" field */
        .kpiBlurField{
          filter: blur(6px);
          opacity: .35;
          user-select:none;
          pointer-events:none;
          background: rgba(0,0,0,0.03);
          border-radius: 10px;
          padding: 6px 10px;
          display:inline-block;
          min-width: 140px;
        }

        .card{
          background:#fff;
          border-radius: 10px;
          padding: 12px;
          border: 1px solid #f1f1f1;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        }

        .cardTitle, .cardTitleBig{
          text-align:center;
          font-size: 16px;
          font-weight: 700;
          letter-spacing: .5px;
          color:#243447;
          margin-bottom: 10px;
          white-space:nowrap;
        }
        .cardTitleBig{ font-size: 16px; }
        @media(max-width:720px){
          .cardTitleBig, .cardTitle{ font-size: 14px; white-space:normal; }
        }

        /* Target */
        .targetGrid{
          display:grid;
          grid-template-columns: 220px 1fr;
          gap: 16px;
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
        .donutBig{ font-size: 42px; font-weight: 800; color:#1f2937; }
        .donutRed{ font-size: 11px; color:#b91c1c; font-style: italic; }
        .donutRed *{ font-style: inherit; }

        .progressWrap{ display:flex; flex-direction:column; gap: 14px; }
        .progressRow{ display:flex; flex-direction:column; gap: 4px; }
        .progressHead{ display:flex; justify-content:space-between; align-items:baseline; gap: 8px; }
        .progressLabel{ font-size: 11px; font-weight: 700; color:#111827; white-space:nowrap; }
        .progressVal{ font-size: 11px; font-weight: 800; color:#111827; white-space:nowrap; }
        .progressPct{ font-weight: 600; color:#374151; font-size: 10px; }

        .progressTrack{
          height: 6px;
          border-radius: 999px;
          background:#e5e7eb;
          overflow:hidden;
        }
        .progressFill{
          height:100%;
          background:#FF5722;
          border-radius: 999px;
        }

        /* Day Wise Summary - single table (image 2 style) */
        .dayWiseTableWrap{ width: 100%; overflow-x: auto; border-radius: 12px; border: 1px solid #e5e7eb; }
        .tblDayWise{
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          background: #fff;
          min-width: 640px;
        }
        .tblDayWise th, .tblDayWise td{
          padding: 8px 10px;
          font-size: 12px;
          border: 1px solid #e5e7eb;
        }
        .dayWiseRowHeader{ background: #f3f4f6; font-weight: 600; color: #374151; text-align: left; width: 160px; }
        .dayWiseDayHeader{
          background: #FF5722;
          color: #fff;
          font-weight: 700;
          text-align: center;
          letter-spacing: 0.5px;
          padding: 10px 8px;
        }
        .dayWiseColHeader{
          background: #f9fafb;
          color: #6b7280;
          font-weight: 600;
          text-align: center;
        }
        .dayWiseRowLabel{
          background: #f3f4f6;
          color: #374151;
          font-weight: 500;
        }
        .dayWiseCell{ text-align: center; color: #4b5563; }

        /* Table compact (legacy / other uses) */
        .tblCompact{
          width:100%;
          border-collapse:separate;
          border-spacing:0;
          background:#f7f7f7;
          border:1px solid #ededed;
          border-radius:12px;
          overflow:hidden;
          table-layout:fixed;
        }

        .tblCompact th,
        .tblCompact td{
          padding: 6px 6px;
          font-size: 11px;
          text-align:center;
          border-bottom:1px solid #ededed;
          border-right:1px solid #ededed;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }

        .tblCompact th{
          background:#f0f0f0;
          font-weight:900;
          letter-spacing:0.15px;
          white-space:normal;
          line-height:1.15;
          padding:10px 6px;
        }

        .tblCompact tr:last-child td{ border-bottom:none; }
        .tblCompact th:last-child,
        .tblCompact td:last-child{ border-right:none; }

        /* ✅ FIX: reduce first column width (label column) */
        .tblCompact th:first-child,
        .tblCompact td:first-child{
          width:26%;
          text-align:left;
          font-weight:800;
          background:#fafafa;
          white-space:normal;
          line-height:1.2;
        }

        .tblCompact th:not(:first-child),
        .tblCompact td:not(:first-child){
          width:14.8%;
        }

        /* Reference */
        .tableWrapRef{ width:100%; overflow-x:auto; border-radius:12px; }
        .tblRefOld{
          width:100%;
          border-collapse: separate;
          border-spacing:0;
          background:#f7f7f7;
          border:1px solid #ededed;
          border-radius: 10px;
          overflow:hidden;
          min-width: 560px;
          table-layout: fixed;
        }
        .tblRefOld th, .tblRefOld td{
          padding: 6px 8px;
          font-size: 11px;
          color:#243447;
          text-align:center;
          border-bottom:1px solid #ededed;
          border-right:1px solid #ededed;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .tblRefOld th{
          background:#f0f0f0;
          font-weight:900;
          white-space:normal;
          line-height:1.15;
        }
        .tblRefOld tr:last-child td{ border-bottom:none; }
        .tblRefOld th:last-child, .tblRefOld td:last-child{ border-right:none; }

        .tblRefOld th:first-child,
        .tblRefOld td:first-child{
          text-align:left;
          width: 140px;
          font-weight:700;
          background:#fafafa;
          white-space:nowrap;
        }

        /* Source Wise Summary - card grid */
        .sourceGrid{
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 8px;
        }
        .sourceCard{
          background: #f8f9fa;
          border-radius: 6px;
          padding: 4px 8px;
          display: flex;
          align-items: center;
          gap: 6px;
          border: 1px solid #e5e7eb;
          outline: 1px solid rgba(0,0,0,0.06);
          min-height: 28px;
        }
        .sourceCardEmpty{ justify-content: center; color: #6b7280; font-size: 11px; }
        .sourceIcon{
          width: 22px; height: 22px;
          border-radius: 4px;
          background: #FF5722;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .sourcePin{ font-size: 10px; filter: brightness(0) invert(1); }
        .sourceName{ font-size: 11px; font-weight: 600; color: #374151; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sourceCount{ font-size: 14px; font-weight: 800; color: #111827; white-space: nowrap; flex-shrink: 0; }

        /* Sales Overview Chart */
        .chartWrap{ width: 100%; min-height: 260px; }
        .chartPlaceholder{ padding: 24px; text-align: center; color: #6b7280; font-size: 12px; }
        .chartTooltip{
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 10px 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          font-size: 11px;
          min-width: 180px;
        }
        .chartTooltipTitle{ font-weight: 700; margin-bottom: 6px; color: #111827; border-bottom: 1px solid #eee; padding-bottom: 4px; }
        .chartTooltipRow{ display: flex; justify-content: space-between; gap: 12px; margin-top: 4px; }
        .chartTooltipRow.green{ color: #166534; }
        .chartTooltipRow.red{ color: #b91c1c; }
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

          {/* Blur/unblur KPI values */}
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

      {/* KPI Cards */}
      <div className="kpiGrid">
        <KPIBox title="Total Orders" value={kpis ? kpis.totalOrders : "—"} icon="📦" bubble="#e8f6ff" reveal={kpiValuesVisible} />
        <KPIBox title="Payments Clearance" value={kpis ? kpis.clearanceRate : "—"} icon="✔" bubble="#e6f9eb" isPercent reveal={kpiValuesVisible} />
        <KPIBox title="Pending Payments" value={kpis ? kpis.pendingPaymentsCount : "—"} icon="⏳" bubble="#fce7ef" reveal={kpiValuesVisible} />
        <KPIBox title="Total Sales" value={kpis ? kpis.totalSales : "—"} icon="💰" bubble="#fff4e5" isMoney reveal={kpiValuesVisible} />
        <KPIBox title="Received Payments" value={kpis ? kpis.receivedPayments : "—"} icon="💵" bubble="#e6f9eb" isMoney reveal={kpiValuesVisible} />
        <KPIBox title="Pending Payments Amount" value={kpis ? kpis.pendingAmount : "—"} icon="📉" bubble="#fde8e8" isMoney reveal={kpiValuesVisible} />
      </div>

      {loading ? (
        <div className="card animCard" style={{ textAlign: "center", color: "#6b7280" }}>
          Loading dashboard...
        </div>
      ) : (
        <>
          <TargetAchievement achieved={achievedForDonut} target={targetTotal} breakdown={fixedBreakdown} />
          <DayWiseSummary days={days} />
          <SourceWiseSummary sources={sources} />
          <ReferenceWiseSummary references={references} />
          <SalesOverviewChart series={salesOverview} reveal={kpiValuesVisible} />
        </>
      )}
    </div>
  );
};

export default Dashboard;