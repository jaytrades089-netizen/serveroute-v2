import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays, subWeeks, subMonths } from 'date-fns';
import { 
  ArrowLeft, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Download,
  FileText,
  Loader2,
  Calendar,
  Users,
  MapPin,
  Clock,
  CheckCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BossBottomNav from '@/components/boss/BossBottomNav';
import AnalyticsCharts from '@/components/analytics/AnalyticsCharts';
import WorkerPerformanceTable from '@/components/analytics/WorkerPerformanceTable';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';

const TIME_PERIODS = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'This Week', value: 'this_week' },
  { label: 'Last Week', value: 'last_week' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Last Month', value: 'last_month' },
  { label: 'This Year', value: 'this_year' },
  { label: 'Custom', value: 'custom' }
];

function getDateRange(period, customStart, customEnd) {
  const now = new Date();
  
  switch (period) {
    case 'today':
      return { startDate: startOfDay(now), endDate: endOfDay(now) };
    case 'yesterday':
      const yesterday = subDays(now, 1);
      return { startDate: startOfDay(yesterday), endDate: endOfDay(yesterday) };
    case 'this_week':
      return { startDate: startOfWeek(now, { weekStartsOn: 0 }), endDate: endOfWeek(now, { weekStartsOn: 0 }) };
    case 'last_week':
      const lastWeek = subWeeks(now, 1);
      return { startDate: startOfWeek(lastWeek, { weekStartsOn: 0 }), endDate: endOfWeek(lastWeek, { weekStartsOn: 0 }) };
    case 'this_month':
      return { startDate: startOfMonth(now), endDate: endOfMonth(now) };
    case 'last_month':
      const lastMonth = subMonths(now, 1);
      return { startDate: startOfMonth(lastMonth), endDate: endOfMonth(lastMonth) };
    case 'this_year':
      return { startDate: startOfYear(now), endDate: endOfYear(now) };
    case 'custom':
      return { 
        startDate: customStart ? startOfDay(customStart) : startOfDay(now), 
        endDate: customEnd ? endOfDay(customEnd) : endOfDay(now) 
      };
    default:
      return { startDate: startOfDay(now), endDate: endOfDay(now) };
  }
}

function getPreviousDateRange(period) {
  const now = new Date();
  
  switch (period) {
    case 'today':
      const yesterday = subDays(now, 1);
      return { startDate: startOfDay(yesterday), endDate: endOfDay(yesterday) };
    case 'yesterday':
      const twoDaysAgo = subDays(now, 2);
      return { startDate: startOfDay(twoDaysAgo), endDate: endOfDay(twoDaysAgo) };
    case 'this_week':
      const lastWeek = subWeeks(now, 1);
      return { startDate: startOfWeek(lastWeek, { weekStartsOn: 0 }), endDate: endOfWeek(lastWeek, { weekStartsOn: 0 }) };
    case 'last_week':
      const twoWeeksAgo = subWeeks(now, 2);
      return { startDate: startOfWeek(twoWeeksAgo, { weekStartsOn: 0 }), endDate: endOfWeek(twoWeeksAgo, { weekStartsOn: 0 }) };
    case 'this_month':
      const lastMonth = subMonths(now, 1);
      return { startDate: startOfMonth(lastMonth), endDate: endOfMonth(lastMonth) };
    case 'last_month':
      const twoMonthsAgo = subMonths(now, 2);
      return { startDate: startOfMonth(twoMonthsAgo), endDate: endOfMonth(twoMonthsAgo) };
    case 'this_year':
      const lastYear = new Date(now.getFullYear() - 1, 0, 1);
      return { startDate: startOfYear(lastYear), endDate: endOfYear(lastYear) };
    default:
      return null;
  }
}

export default function Analytics() {
  const [period, setPeriod] = useState('this_week');
  const [customDateRange, setCustomDateRange] = useState({ start: null, end: null });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const companyId = user?.company_id;
  const dateRange = getDateRange(period, customDateRange.start, customDateRange.end);
  const prevDateRange = getPreviousDateRange(period);

  // Fetch addresses for current period
  const { data: addresses = [], isLoading: addressesLoading } = useQuery({
    queryKey: ['analyticsAddresses', companyId, dateRange.startDate?.toISOString(), dateRange.endDate?.toISOString()],
    queryFn: async () => {
      if (!companyId) return [];
      const all = await base44.entities.Address.filter({ company_id: companyId, deleted_at: null });
      return all.filter(a => {
        if (!a.served_at) return false;
        const servedDate = new Date(a.served_at);
        return servedDate >= dateRange.startDate && servedDate <= dateRange.endDate;
      });
    },
    enabled: !!companyId
  });

  // Fetch routes for current period
  const { data: routes = [], isLoading: routesLoading } = useQuery({
    queryKey: ['analyticsRoutes', companyId, dateRange.startDate?.toISOString(), dateRange.endDate?.toISOString()],
    queryFn: async () => {
      if (!companyId) return [];
      const all = await base44.entities.Route.filter({ company_id: companyId, deleted_at: null });
      return all.filter(r => {
        if (!r.completed_at) return false;
        const completedDate = new Date(r.completed_at);
        return completedDate >= dateRange.startDate && completedDate <= dateRange.endDate;
      });
    },
    enabled: !!companyId
  });

  // Fetch previous period data for comparison
  const { data: prevAddresses = [] } = useQuery({
    queryKey: ['analyticsPrevAddresses', companyId, prevDateRange?.startDate?.toISOString()],
    queryFn: async () => {
      if (!companyId || !prevDateRange) return [];
      const all = await base44.entities.Address.filter({ company_id: companyId, deleted_at: null });
      return all.filter(a => {
        if (!a.served_at) return false;
        const servedDate = new Date(a.served_at);
        return servedDate >= prevDateRange.startDate && servedDate <= prevDateRange.endDate;
      });
    },
    enabled: !!companyId && !!prevDateRange
  });

  const { data: prevRoutes = [] } = useQuery({
    queryKey: ['analyticsPrevRoutes', companyId, prevDateRange?.startDate?.toISOString()],
    queryFn: async () => {
      if (!companyId || !prevDateRange) return [];
      const all = await base44.entities.Route.filter({ company_id: companyId, deleted_at: null });
      return all.filter(r => {
        if (!r.completed_at) return false;
        const completedDate = new Date(r.completed_at);
        return completedDate >= prevDateRange.startDate && completedDate <= prevDateRange.endDate;
      });
    },
    enabled: !!companyId && !!prevDateRange
  });

  // Fetch workers
  const { data: workers = [] } = useQuery({
    queryKey: ['analyticsWorkers', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const users = await base44.entities.User.list();
      return users.filter(u => u.company_id === companyId && u.role === 'server');
    },
    enabled: !!companyId
  });

  // Calculate stats
  const served = addresses.length;
  const routesCompleted = routes.length;
  const prevServed = prevAddresses.length;
  const prevRoutesCompleted = prevRoutes.length;

  // Average time calculation
  const totalTime = addresses.reduce((sum, a) => sum + (a.completion_time_minutes || 8), 0);
  const avgTime = served > 0 ? (totalTime / served).toFixed(1) : 0;
  const prevTotalTime = prevAddresses.reduce((sum, a) => sum + (a.completion_time_minutes || 8), 0);
  const prevAvgTime = prevServed > 0 ? (prevTotalTime / prevServed).toFixed(1) : 0;

  // On-time rate
  const onTimeRoutes = routes.filter(r => {
    if (!r.completed_at || !r.due_date) return false;
    return new Date(r.completed_at) <= new Date(r.due_date);
  }).length;
  const onTimeRate = routesCompleted > 0 ? Math.round((onTimeRoutes / routesCompleted) * 100) : 0;
  
  const prevOnTimeRoutes = prevRoutes.filter(r => {
    if (!r.completed_at || !r.due_date) return false;
    return new Date(r.completed_at) <= new Date(r.due_date);
  }).length;
  const prevOnTimeRate = prevRoutesCompleted > 0 ? Math.round((prevOnTimeRoutes / prevRoutesCompleted) * 100) : 0;

  const calcChange = (current, previous) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const stats = {
    served: { value: served, change: calcChange(served, prevServed) },
    routes: { value: routesCompleted, change: calcChange(routesCompleted, prevRoutesCompleted) },
    avgTime: { value: avgTime, change: calcChange(parseFloat(avgTime), parseFloat(prevAvgTime)) },
    onTimeRate: { value: onTimeRate, change: onTimeRate - prevOnTimeRate }
  };

  const handleExportCSV = () => {
    const data = workers.map(w => {
      const workerAddresses = addresses.filter(a => a.served_by === w.id || a.scanned_by === w.id);
      const workerRoutes = routes.filter(r => r.worker_id === w.id);
      return {
        Name: w.full_name,
        Served: workerAddresses.length,
        Routes: workerRoutes.length,
        'Avg Time (min)': w.avg_completion_time_minutes || 0,
        'Reliability Score': w.reliability_score || 0
      };
    });

    const headers = Object.keys(data[0] || {}).join(',');
    const rows = data.map(row => Object.values(row).join(','));
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analytics_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.text('ServeRoute Analytics Report', 20, 20);

    doc.setFontSize(12);
    doc.text(`Period: ${TIME_PERIODS.find(p => p.value === period)?.label}`, 20, 35);
    doc.text(`Generated: ${format(new Date(), 'MMMM d, yyyy')}`, 20, 42);

    doc.setFontSize(14);
    doc.text('Overview', 20, 55);

    doc.setFontSize(11);
    doc.text(`Addresses Served: ${stats.served.value}`, 25, 65);
    doc.text(`Routes Completed: ${stats.routes.value}`, 25, 72);
    doc.text(`Average Time: ${stats.avgTime.value} min`, 25, 79);
    doc.text(`On-Time Rate: ${stats.onTimeRate.value}%`, 25, 86);

    doc.setFontSize(14);
    doc.text('Worker Performance', 20, 100);

    let y = 110;
    workers.slice(0, 10).forEach((w, i) => {
      const workerAddresses = addresses.filter(a => a.served_by === w.id || a.scanned_by === w.id);
      doc.setFontSize(10);
      doc.text(`${i + 1}. ${w.full_name}: ${workerAddresses.length} served`, 25, y);
      y += 7;
    });

    doc.save(`analytics_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const isLoading = addressesLoading || routesLoading;

  const StatCard = ({ title, value, change, icon: Icon, suffix = '' }) => (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase">{title}</p>
            <p className="text-2xl font-bold text-gray-900">{value}{suffix}</p>
            {change !== undefined && (
              <div className={`flex items-center gap-1 text-xs ${
                change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-500'
              }`}>
                {change > 0 ? <TrendingUp className="w-3 h-3" /> : 
                 change < 0 ? <TrendingDown className="w-3 h-3" /> : 
                 <Minus className="w-3 h-3" />}
                {Math.abs(change)}%
              </div>
            )}
          </div>
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
            <Icon className="w-5 h-5 text-blue-600" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-blue-500 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to={createPageUrl('BossDashboard')}>
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="font-bold text-lg">📊 Analytics</h1>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={handleExportCSV}>
            <Download className="w-4 h-4 mr-1" /> CSV
          </Button>
          <Button size="sm" variant="secondary" onClick={handleExportPDF}>
            <FileText className="w-4 h-4 mr-1" /> PDF
          </Button>
        </div>
      </header>

      <main className="px-4 py-4 max-w-4xl mx-auto">
        {/* Time Period Selector */}
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">TIME PERIOD</p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {TIME_PERIODS.map(p => (
              <Button
                key={p.value}
                variant={period === p.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  if (p.value === 'custom') {
                    setShowDatePicker(true);
                  } else {
                    setPeriod(p.value);
                  }
                }}
                className={period === p.value ? 'bg-orange-500 hover:bg-orange-600' : ''}
              >
                {p.value === 'custom' && <Calendar className="w-4 h-4 mr-1" />}
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatCard title="Served" value={stats.served.value} change={stats.served.change} icon={CheckCircle} />
              <StatCard title="Routes" value={stats.routes.value} change={stats.routes.change} icon={MapPin} />
              <StatCard title="Avg Time" value={stats.avgTime.value} change={-stats.avgTime.change} icon={Clock} suffix=" min" />
              <StatCard title="On-Time" value={stats.onTimeRate.value} change={stats.onTimeRate.change} icon={TrendingUp} suffix="%" />
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full mb-4">
                <TabsTrigger value="overview" className="flex-1">Charts</TabsTrigger>
                <TabsTrigger value="workers" className="flex-1">Workers</TabsTrigger>
              </TabsList>

              <TabsContent value="overview">
                <AnalyticsCharts 
                  addresses={addresses} 
                  routes={routes} 
                  period={period}
                  dateRange={dateRange}
                />
              </TabsContent>

              <TabsContent value="workers">
                <WorkerPerformanceTable 
                  workers={workers} 
                  addresses={addresses} 
                  routes={routes}
                  onExport={handleExportCSV}
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>

      {/* Custom Date Picker Dialog */}
      <Dialog open={showDatePicker} onOpenChange={setShowDatePicker}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Date Range</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Start Date</p>
              <CalendarPicker
                mode="single"
                selected={customDateRange.start}
                onSelect={(date) => setCustomDateRange(prev => ({ ...prev, start: date }))}
              />
            </div>
            <div>
              <p className="text-sm font-medium mb-2">End Date</p>
              <CalendarPicker
                mode="single"
                selected={customDateRange.end}
                onSelect={(date) => setCustomDateRange(prev => ({ ...prev, end: date }))}
              />
            </div>
            <Button 
              className="w-full" 
              onClick={() => {
                setPeriod('custom');
                setShowDatePicker(false);
              }}
              disabled={!customDateRange.start || !customDateRange.end}
            >
              Apply
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <BossBottomNav currentPage="Analytics" />
    </div>
  );
}