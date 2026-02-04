import React from 'react';

export function RouteSkeleton() {
  return (
    <div className="bg-white rounded-lg border p-4 animate-pulse">
      <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
      <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
      <div className="h-2 bg-gray-200 rounded w-full mb-4" />
      <div className="flex gap-2">
        <div className="h-6 bg-gray-200 rounded w-12" />
        <div className="h-6 bg-gray-200 rounded w-12" />
        <div className="h-6 bg-gray-200 rounded w-12" />
      </div>
    </div>
  );
}

export function AddressSkeleton() {
  return (
    <div className="bg-white rounded-lg border p-4 animate-pulse">
      <div className="h-5 bg-gray-200 rounded w-full mb-2" />
      <div className="h-4 bg-gray-200 rounded w-2/3" />
    </div>
  );
}

export function WorkerSkeleton() {
  return (
    <div className="bg-white rounded-lg border p-4 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-10 w-10 bg-gray-200 rounded-full" />
        <div className="h-5 bg-gray-200 rounded w-32" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="h-8 bg-gray-200 rounded" />
        <div className="h-8 bg-gray-200 rounded" />
        <div className="h-8 bg-gray-200 rounded" />
      </div>
    </div>
  );
}

export function ReceiptSkeleton() {
  return (
    <div className="bg-white rounded-lg border p-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="h-16 w-16 bg-gray-200 rounded" />
        <div className="flex-1">
          <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
          <div className="h-4 bg-gray-200 rounded w-1/3" />
        </div>
      </div>
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="bg-white rounded-lg border p-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 bg-gray-200 rounded-full" />
        <div className="flex-1">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
          <div className="h-3 bg-gray-200 rounded w-2/3" />
        </div>
        <div className="h-3 bg-gray-200 rounded w-12" />
      </div>
    </div>
  );
}

export function StatSkeleton() {
  return (
    <div className="bg-white rounded-lg border p-4 animate-pulse">
      <div className="h-3 bg-gray-200 rounded w-1/2 mb-2" />
      <div className="h-8 bg-gray-200 rounded w-1/3" />
    </div>
  );
}

export function TableRowSkeleton({ cols = 5 }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-200 rounded w-full" />
        </td>
      ))}
    </tr>
  );
}

export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 animate-pulse">
      <div className="h-14 bg-gray-200" />
      <div className="p-4 space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <StatSkeleton key={i} />)}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => <RouteSkeleton key={i} />)}
        </div>
      </div>
    </div>
  );
}

export function AddressDetailSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden mx-4 my-4 animate-pulse">
      {/* Tab Navigation */}
      <div className="flex gap-1 p-3 bg-gray-50">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-10 w-12 bg-gray-200 rounded-lg" />
        ))}
      </div>
      
      {/* Address Header */}
      <div className="flex items-start gap-4 p-4 border-b border-gray-200">
        <div className="w-12 h-12 rounded-xl bg-gray-200" />
        <div className="flex-1">
          <div className="h-6 bg-gray-200 rounded w-3/4 mb-2" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
        </div>
      </div>
      
      {/* Details Section */}
      <div className="p-4 border-b border-gray-200">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gray-200" />
          <div>
            <div className="h-3 bg-gray-200 rounded w-20 mb-1" />
            <div className="h-5 bg-gray-200 rounded w-40" />
          </div>
        </div>
      </div>
      
      {/* Action Buttons */}
      <div className="p-4 space-y-3">
        <div className="h-14 bg-gray-200 rounded-xl" />
        <div className="flex gap-3">
          <div className="flex-1 h-14 bg-gray-200 rounded-xl" />
          <div className="flex-1 h-14 bg-gray-200 rounded-xl" />
        </div>
        <div className="h-12 bg-gray-200 rounded-xl" />
      </div>
    </div>
  );
}