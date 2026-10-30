import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AssigneeStat } from '../types';

export default function Reports() {
  const [stats, setStats] = useState<AssigneeStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/tasks/stats/by-assignee')
      .then((res) => setStats(res.data.data))
      .catch((err) => {
        const message =
          (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
          'Không tải được báo cáo';
        setError(message);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-slate-500">Đang tải…</p>;
  if (error) return <p className="text-rose-600">{error}</p>;

  const totals = stats.reduce(
    (acc, s) => ({
      total: acc.total + s.total,
      done: acc.done + s.done,
      overdue: acc.overdue + s.overdue,
    }),
    { total: 0, done: 0, overdue: 0 },
  );
  const overallRate = totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0;

  const summaryCards = [
    { label: 'Tổng công việc', value: totals.total, tone: 'text-slate-900' },
    { label: 'Đã hoàn thành', value: totals.done, tone: 'text-emerald-600' },
    { label: 'Trễ hạn', value: totals.overdue, tone: 'text-rose-600' },
    { label: 'Tỉ lệ hoàn thành', value: `${overallRate}%`, tone: 'text-blue-600' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Báo cáo theo nhân sự</h1>
      <p className="text-sm text-slate-500 mb-6">Thống kê số lượng công việc và tiến độ của từng người.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">{card.label}</div>
            <div className={`mt-1 text-2xl font-bold ${card.tone}`}>{card.value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-3 font-medium">Nhân sự</th>
              <th className="px-4 py-3 font-medium text-center">Tổng</th>
              <th className="px-4 py-3 font-medium text-center">To Do</th>
              <th className="px-4 py-3 font-medium text-center">In Progress</th>
              <th className="px-4 py-3 font-medium text-center">Dev Done</th>
              <th className="px-4 py-3 font-medium text-center">Testing</th>
              <th className="px-4 py-3 font-medium text-center">Test Fail</th>
              <th className="px-4 py-3 font-medium text-center">Done</th>
              <th className="px-4 py-3 font-medium text-center">Pending</th>
              <th className="px-4 py-3 font-medium text-center">Trễ hạn</th>
              <th className="px-4 py-3 font-medium">Hoàn thành</th>
            </tr>
          </thead>
          <tbody>
            {stats.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-slate-400">
                  Chưa có dữ liệu
                </td>
              </tr>
            ) : (
              stats.map((s) => (
                <tr key={s.assignee} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-900">{s.assignee}</td>
                  <td className="px-4 py-3 text-center">{s.total}</td>
                  <td className="px-4 py-3 text-center text-slate-500">{s.todo}</td>
                  <td className="px-4 py-3 text-center text-blue-600">{s.inProgress}</td>
                  <td className="px-4 py-3 text-center text-violet-600">{s.devDone}</td>
                  <td className="px-4 py-3 text-center text-amber-600">{s.testing}</td>
                  <td className="px-4 py-3 text-center text-rose-600">{s.testFail}</td>
                  <td className="px-4 py-3 text-center text-emerald-600">{s.done}</td>
                  <td className="px-4 py-3 text-center text-rose-500">{s.pending}</td>
                  <td className="px-4 py-3 text-center">
                    {s.overdue > 0 ? (
                      <span className="font-medium text-rose-600">{s.overdue}</span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${s.completionRate}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500">{s.completionRate}%</span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
