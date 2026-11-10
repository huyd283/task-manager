import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Users, UserRoundCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client';

interface MirroredEmployee {
  partnerUserId: number;
  name: string;
  email: string;
  jobTitle: string;
  department: string;
  status: string;
  isActive: boolean;
  isSystemAccount: boolean;
}

function getErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'data' in error.response &&
    typeof error.response.data === 'object' &&
    error.response.data !== null &&
    'message' in error.response.data &&
    typeof error.response.data.message === 'string'
  ) {
    return error.response.data.message;
  }
  return 'Không thể tải danh sách nhân sự đã đồng bộ.';
}

function statusStyle(status: string) {
  switch (status.toUpperCase()) {
    case 'ACTIVE':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-600/15';
    case 'TERMINATED':
      return 'bg-rose-50 text-rose-700 ring-rose-600/15';
    case 'DELETED':
      return 'bg-slate-100 text-slate-600 ring-slate-500/15';
    case 'LOCKED':
      return 'bg-amber-50 text-amber-700 ring-amber-600/15';
    default:
      return 'bg-slate-100 text-slate-600 ring-slate-500/15';
  }
}

export default function EmployeeSyncManagement() {
  const [employees, setEmployees] = useState<MirroredEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<{ data: MirroredEmployee[] }>('/admin/employees');
      setEmployees(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const visibleEmployees = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return employees;
    return employees.filter((employee) =>
      [
        employee.name,
        employee.email,
        employee.department,
        employee.jobTitle,
        employee.status,
        String(employee.partnerUserId),
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [employees, search]);

  const activeCount = employees.filter((employee) => employee.status.toUpperCase() === 'ACTIVE').length;
  const inactiveCount = employees.length - activeCount;

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div>
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <UserRoundCheck size={22} />
          </span>
          <p className="mt-4 text-sm font-semibold text-blue-700">Đồng bộ Checkin</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Nhân sự mirror</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Danh sách tài khoản được liên kết với nhân sự từ Checkin, bao gồm cả trạng thái không hoạt động.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-2xl bg-emerald-50 px-4 py-3">
            <p className="text-xl font-bold text-emerald-700">{activeCount}</p>
            <p className="text-xs font-medium text-emerald-700/80">Đang hoạt động</p>
          </div>
          <div className="rounded-2xl bg-slate-100 px-4 py-3">
            <p className="text-xl font-bold text-slate-700">{inactiveCount}</p>
            <p className="text-xs font-medium text-slate-500">Khác / nghỉ việc</p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Users size={19} /></span>
            <div>
              <h2 className="font-bold text-slate-900">Danh sách nhân sự</h2>
              <p className="text-sm text-slate-500">{employees.length} tài khoản được liên kết</p>
            </div>
          </div>
          <div className="relative w-full sm:max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              placeholder="Tìm nhân sự, phòng ban, partner ID"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Nhân sự</th>
                <th className="px-5 py-3 font-semibold">Partner user ID</th>
                <th className="px-5 py-3 font-semibold">Chức danh</th>
                <th className="px-5 py-3 font-semibold">Phòng ban</th>
                <th className="px-5 py-3 font-semibold">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-slate-500">
                    <span className="inline-flex items-center gap-2"><Loader2 size={17} className="animate-spin" /> Đang tải...</span>
                  </td>
                </tr>
              ) : visibleEmployees.length === 0 ? (
                <tr><td colSpan={5} className="py-16 text-center text-slate-500">Không tìm thấy nhân sự nào.</td></tr>
              ) : visibleEmployees.map((employee) => (
                <tr key={employee.partnerUserId} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-slate-800">{employee.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{employee.email}</p>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-slate-600">{employee.partnerUserId}</td>
                  <td className="px-5 py-3.5 text-slate-600">{employee.jobTitle || '—'}</td>
                  <td className="px-5 py-3.5 text-slate-600">{employee.department || '—'}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyle(employee.status)}`}>
                      {employee.status || 'UNKNOWN'}
                    </span>
                    {employee.isSystemAccount && (
                      <span className="ml-2 text-xs text-slate-400">Tài khoản hệ thống</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && (
          <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            Hiển thị {visibleEmployees.length} / {employees.length} nhân sự
          </div>
        )}
      </section>
    </div>
  );
}
