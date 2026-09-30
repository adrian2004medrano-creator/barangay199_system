export default function StatCard({ label, value, tone = "primary", icon: Icon }) {
  const toneMap = {
    primary: "bg-primary-light text-primary-dark",
    amber: "bg-amber-light text-amber",
    risk: "bg-risk-light text-risk",
  };

  return (
    <div className="flex items-center gap-4 rounded-lg border border-[#e3e6e9] bg-white p-5 shadow-[0_1px_2px_rgba(22,28,33,0.04)]">
      <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${toneMap[tone]}`}>
        {Icon && <Icon size={20} strokeWidth={2} />}
      </div>
      <div>
        <p className="text-2xl font-display font-bold text-ink900 leading-none">{value}</p>
        <p className="text-sm text-muted mt-1">{label}</p>
      </div>
    </div>
  );
}
