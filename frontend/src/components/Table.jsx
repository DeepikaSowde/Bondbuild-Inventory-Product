// components/Table.jsx — Tailwind version
export function Table({ columns, children }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} className={`whitespace-nowrap border-b border-[#E5E7EB] bg-[#F9FAFB] px-[14px] py-3 text-[10.5px] font-bold uppercase tracking-wide text-[#9CA3AF] ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, mono, align, bold, className = "" }) {
  return (
    <td className={`border-b border-[#F3F4F6] px-[14px] py-[11px] text-[13px] text-[#374151]
      ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"}
      ${bold ? "font-bold" : ""} ${mono ? "font-mono whitespace-nowrap" : ""} ${className}`}>
      {children}
    </td>
  );
}

export function KPICard({ label, value, sub, color = "#6366F1", icon }) {
  return (
    <div className="min-w-[150px] flex-1 rounded-2xl bg-white px-[22px] py-[18px] shadow-[0_1px_4px_rgba(0,0,0,0.07)]"
      style={{ border: `2px solid ${color}22` }}>
      <div className="mb-1.5 flex items-center gap-2.5">
        {icon && <span className="text-xl">{icon}</span>}
        <span className="text-[11px] font-bold uppercase tracking-wide text-[#9CA3AF]">{label}</span>
      </div>
      <div className="text-[26px] font-extrabold" style={{ color }}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[#9CA3AF]">{sub}</div>}
    </div>
  );
}
