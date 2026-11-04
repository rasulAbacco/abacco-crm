import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend, PieChart, Pie, Cell } from 'recharts';
import { EmptyState } from '../common/ui';
import { FiBarChart2 } from 'react-icons/fi';

export const PALETTE = ['#1d4ed8', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b', '#14b8a6', '#ec4899', '#84cc16'];
const axis = { fontSize: 11, fill: '#64748b' };

function Empty() {
  return <EmptyState icon={FiBarChart2} title="No data for this period" />;
}

export function BarChartBox({ data, x, bars, height = 260, layout }) {
  if (!data?.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout} margin={{ top: 8, right: 8, left: layout === 'vertical' ? 40 : -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={layout !== 'vertical'} horizontal={layout === 'vertical' ? false : true} />
        {layout === 'vertical' ? <><XAxis type="number" tick={axis} allowDecimals={false} /><YAxis type="category" dataKey={x} tick={axis} width={90} /></> : <><XAxis dataKey={x} tick={axis} /><YAxis tick={axis} allowDecimals={false} /></>}
        <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        {bars.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {bars.map((b, i) => <Bar key={b.key} dataKey={b.key} name={b.label} fill={b.color ?? PALETTE[i]} radius={layout === 'vertical' ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={36} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LineChartBox({ data, x, lines, height = 260 }) {
  if (!data?.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey={x} tick={axis} />
        <YAxis tick={axis} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        {lines.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {lines.map((l, i) => <Line key={l.key} type="monotone" dataKey={l.key} name={l.label} stroke={l.color ?? PALETTE[i]} strokeWidth={2} dot={false} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DonutBox({ data, nameKey, valueKey, height = 260 }) {
  if (!data?.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius="55%" outerRadius="80%" paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
