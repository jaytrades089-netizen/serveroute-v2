import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ChevronRight, MapPin } from 'lucide-react';
import { format } from 'date-fns';

export default function ActiveRoutesList({ routes = [] }) {
  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-xl font-bold text-gray-900">Active Routes</h2>
        <Link 
          to={createPageUrl('WorkerRoutes')} 
          className="text-blue-600 text-sm font-medium hover:underline flex items-center"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {routes.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-8 text-center">
          <MapPin className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500">No active routes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {routes.slice(0, 3).map((route) => (
            <Link
              key={route.id}
              to={createPageUrl(`WorkerRouteDetail?id=${route.id}`)}
              className="block bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-gray-900">{route.folder_name}</h3>
                  <p className="text-sm text-gray-500">
                    {route.served_count}/{route.total_addresses} served
                  </p>
                </div>
                <div className="text-right">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    route.status === 'active' 
                      ? 'bg-blue-100 text-blue-700' 
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {route.status}
                  </span>
                  {route.due_date && (
                    <p className="text-xs text-gray-500 mt-1">
                      Due: {format(new Date(route.due_date), 'MMM d')}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}