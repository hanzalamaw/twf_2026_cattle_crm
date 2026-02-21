import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";

const fmt = (n) => (Number(n || 0)).toLocaleString("en-PK");

const KPICard = ({ title, value, icon, background }) => {
  return (
    <div
      style={{
        flex: "1 1 240px",
        minWidth: "240px",
        background: "#fff",
        borderRadius: "14px",
        padding: "18px",
        display: "flex",
        alignItems: "center",
        gap: "16px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
        border: "1px solid #f1f1f1",
      }}
    >
      <div
        style={{
          width: "54px",
          height: "54px",
          borderRadius: "50%",
          background: background || "#eef6ff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "22px",
        }}
      >
        {icon}
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: "12px", color: "#666" }}>{title}</span>
        <span style={{ fontSize: "18px", fontWeight: "600", color: "#222" }}>
          {value}
        </span>
      </div>
    </div>
  );
};

// ✅ Donut that supports "overflow" arc after 100%
const TargetDonut = ({
  achieved = 0,
  target = 2000,
  size = 220,
  stroke = 18,
  color = "#0B8A6A",     // main green
  overflowColor = "#0A5B47", // dark green
  track = "#EAEAEA",
}) => {
  const radius = (size - stroke) / 2;
  const c = 2 * Math.PI * radius;

  // base progress [0..1]
  const baseRatio = Math.min(achieved / target, 1);
  const baseDash = c * baseRatio;

  // overflow ratio (start new arc from top after full circle)
  // Example: achieved=2089, target=2000 => overflowRatio=0.0445 (4.45%)
  const overflowRatio = achieved > target ? (achieved - target) / target : 0;
  // you can cap overflow to 100% extra if you want:
  const overflowCapped = Math.min(overflowRatio, 1);
  const overflowDash = c * overflowCapped;

  // Start point from top
  const rotate = `rotate(-90 ${size / 2} ${size / 2})`;

  const isAchieved = achieved >= target;

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size}>
        {/* track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={track}
          strokeWidth={stroke}
          fill="none"
        />

        {/* base arc */}
        <circle
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

        {/* overflow arc (starts again from top, overlays) */}
        {overflowDash > 0 && (
          <circle
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

      {/* center text */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          textAlign: "center",
          padding: 10,
        }}
      >
        <div style={{ fontSize: 14, color: "#333" }}>Total Orders:</div>
        <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: 0.5 }}>
          {fmt(achieved)}
        </div>
        {!isAchieved ? (
          <div style={{ fontSize: 14, color: "#B91C1C", fontStyle: "italic" }}>
            Remaining: {fmt(Math.max(0, target - achieved))}
          </div>
        ) : (
          <div style={{ fontSize: 14, color: "#B91C1C", fontStyle: "italic" }}>
            Target Achieved!
          </div>
        )}
      </div>
    </div>
  );
};

const ProgressRow = ({ label, value, target, percentage }) => {
  const pct = Number.isFinite(percentage) ? percentage : (target ? (value / target) * 100 : 0);
  const clamped = Math.min(pct, 100);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontWeight: 700, color: "#111", fontSize: 16 }}>{label}</div>
        <div style={{ fontWeight: 700, color: "#111", fontSize: 16 }}>
          {fmt(value)}{" "}
          <span style={{ fontWeight: 600, color: "#333" }}>
            ({pct.toFixed(1)}%)
          </span>
        </div>
      </div>

      <div
        style={{
          height: 8,
          borderRadius: 999,
          background: "#DCDCDC",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${clamped}%`,
            height: "100%",
            background: "#0B8A6A",
            borderRadius: 999,
          }}
        />
      </div>
    </div>
  );
};

const TargetAchievementCard = ({ achieved, target, breakdown }) => {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        border: "1px solid #f1f1f1",
        boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
        padding: 22,
      }}
    >
      <div
        style={{
          textAlign: "center",
          fontSize: 34,
          fontWeight: 900,
          letterSpacing: 1,
          marginBottom: 18,
        }}
      >
        TARGET ACHIEVEMENT
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "320px 1fr",
          gap: 28,
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center" }}>
          <TargetDonut achieved={achieved} target={target} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {(breakdown || []).map((b) => (
            <ProgressRow
              key={b.key || b.label}
              label={b.label}
              value={b.value}
              target={b.target}
              percentage={b.percentage}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const { user } = useAuth();
  const [year, setYear] = useState("2026");

  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);

  const token = useMemo(() => {
    // adjust if you store token differently
    return localStorage.getItem("token");
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/dashboard/booking/summary?year=${encodeURIComponent(year)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || "Failed to load dashboard");
        setSummary(data);
      } catch (e) {
        console.error(e);
        setSummary(null);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [year, token]);

  const kpis = summary?.kpis || {};
  const target = summary?.target || { targetTotal: 2000, achievedTotal: 0, remaining: 2000 };
  const breakdown = summary?.breakdown || [];

  return (
    <div
      style={{
        padding: "24px",
        fontFamily: "'Poppins', sans-serif",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "20px",
              fontWeight: "600",
              color: "#333",
              margin: 0,
            }}
          >
            Dashboard
          </h1>

          <p style={{ fontSize: "14px", color: "#666" }}>
            Welcome, {user?.username || "Manager"}
          </p>
        </div>

        <div>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              border: "1px solid #e5e7eb",
              fontSize: "12px",
            }}
          >
            <option value="all">All Year</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
          </select>
        </div>
      </div>

      {/* KPI Grid */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "18px" }}>
        <KPICard title="Total Orders" value={fmt(kpis.totalOrders)} icon="📦" background="#e8f6ff" />
        <KPICard
          title="Payments Clearance"
          value={`${(Number(kpis.clearanceRate || 0)).toFixed(1)}%`}
          icon="✔"
          background="#e6f9eb"
        />
        <KPICard title="Pending Payments" value={fmt(kpis.pendingPaymentsCount)} icon="⏳" background="#fce7ef" />
        <KPICard title="Total Sales" value={`PKR ${fmt(kpis.totalSales)}`} icon="💰" background="#fff4e5" />
        <KPICard title="Received Payments" value={`PKR ${fmt(kpis.receivedPayments)}`} icon="💵" background="#e6f9eb" />
        <KPICard title="Pending Amount" value={`PKR ${fmt(kpis.pendingAmount)}`} icon="📉" background="#fde8e8" />
      </div>

      {/* Target Achievement Card */}
      {loading ? (
        <div
          style={{
            borderRadius: "14px",
            border: "1px solid #eee",
            background: "#fff",
            padding: "20px",
            minHeight: "220px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#999",
            fontSize: "13px",
          }}
        >
          Loading dashboard...
        </div>
      ) : (
        <TargetAchievementCard
          achieved={Number(target.achievedTotal || 0)}
          target={Number(target.targetTotal || 2000)}
          breakdown={breakdown}
        />
      )}
    </div>
  );
};

export default Dashboard;