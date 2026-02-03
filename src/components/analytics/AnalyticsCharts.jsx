import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell,
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';
import { format, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, startOfDay } from 'date-fns';

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#6B7280', '#EF4444'];

export default function AnalyticsCharts({ addresses, routes, period, dateRange }) {
  // Prepare line chart data (addresses served over time)
  const getLineChartData = () => {
    if (!dateRange.startDate || !dateRange.endDate) return [];
    
    let intervals;
    let formatStr;
    
    if (['today', 'yesterday'].includes(period)) {
      // Hourly for single day
      const hours = [];
      for (let h = 0; h < 24; h++) {
        hours.push({ hour: h, label: `${h}:00` });
      }
      return hours.map(({ hour, label }) => {
        const count = addresses.filter(a => {
          if (!a.served_at) return false;
          return new Date(a.served_at).getHours() === hour;
        }).length;
        return { date: label, served: count };
      });
    } else if (['this_week', 'last_week'].includes(period)) {
      intervals = eachDayOfInterval({ start: dateRange.startDate, end: dateRange.endDate });
      formatStr = 'EEE';
    } else if (['this_month', 'last_month'].includes(period)) {
      intervals = eachDayOfInterval({ start: dateRange.startDate, end: dateRange.endDate });
      formatStr = 'd';
    } else {
      intervals = eachMonthOfInterval({ start: dateRange.startDate, end: dateRange.endDate });
      formatStr = 'MMM';
    }

    return intervals.map(date => {
      const dayStart = startOfDay(date);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      
      const count = addresses.filter(a => {
        if (!a.served_at) return false;
        const servedDate = new Date(a.served_at);
        return servedDate >= dayStart && servedDate < dayEnd;
      }).length;

      return {
        date: format(date, formatStr),
        served: count
      };
    });
  };

  // Prepare pie chart data (route status)
  const getPieChartData = () => {
    const statusCounts = {
      completed: 0,
      active: 0,
      assigned: 0,
      draft: 0
    };

    routes.forEach(r => {
      if (statusCounts[r.status] !== undefined) {
        statusCounts[r.status]++;
      }
    });

    return Object.entries(statusCounts)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value
      }));
  };

  // Prepare bar chart data (serve types)
  const getServeTypeData = () => {
    const typeCounts = { serve: 0, garnishment: 0, posting: 0 };
    
    addresses.forEach(a => {
      const type = a.serve_type || 'serve';
      if (typeCounts[type] !== undefined) {
        typeCounts[type]++;
      }
    });

    return Object.entries(typeCounts).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      count: value
    }));
  };

  const lineData = getLineChartData();
  const pieData = getPieChartData();
  const barData = getServeTypeData();

  return (
    <div className="space-y-4">
      {/* Line Chart - Addresses Served Over Time */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Addresses Served</CardTitle>
        </CardHeader>
        <CardContent>
          {lineData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={lineData}>
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="served" 
                  stroke="#F97316" 
                  strokeWidth={2}
                  dot={{ fill: '#F97316', r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-gray-500">
              No data for this period
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Pie Chart - Route Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Route Status</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie 
                    data={pieData} 
                    dataKey="value" 
                    nameKey="name" 
                    cx="50%" 
                    cy="50%" 
                    outerRadius={70}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-gray-500">
                No routes data
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bar Chart - Serve Types */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">By Document Type</CardTitle>
          </CardHeader>
          <CardContent>
            {barData.some(d => d.count > 0) ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={barData}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-gray-500">
                No data
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}