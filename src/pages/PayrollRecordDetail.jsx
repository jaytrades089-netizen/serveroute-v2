import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { 
  Loader2, ChevronLeft, DollarSign, CheckCircle, Clock, RotateCcw, 
  ChevronRight, Edit2, Check, X, Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import BottomNav from '@/components/layout/BottomNav';

export default function PayrollRecordDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const recordId = urlParams.get('id');

  const [editMode, setEditMode] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState('saved');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: record, isLoading } = useQuery({
    queryKey: ['payrollRecord', recordId],
    queryFn: async () => {
      if (!recordId) return null;
      const records = await base44.entities.PayrollRecord.filter({ id: recordId });
      return records[0] || null;
    },
    enabled: !!recordId,
    staleTime: 2 * 60 * 1000
  });

  // Initialize edit fields when record loads
  React.useEffect(() => {
    if (record) {
      setEditNotes(record.notes || '');
      setEditStatus(record.status || 'saved');
    }
  }, [record]);

  const snapshotAddresses = useMemo(() => {
    if (!record?.snapshot_data) return [];
    try {
      return JSON.parse(record.snapshot_data);
    } catch {
      return [];
    }
  }, [record]);

  const instantItems = snapshotAddresses.filter(a => a.bucket === 'instant');
  const pendingItems = snapshotAddresses.filter(a => a.bucket === 'pending');
  const rtoItems = snapshotAddresses.filter(a => a.bucket === 'rto');

  const handleSaveEdit = async () => {
    if (!record?.id) return;
    setSaving(true);
    try {
      await base44.entities.PayrollRecord.update(record.id, {
        notes: editNotes,
        status: editStatus
      });
      queryClient.invalidateQueries({ queryKey: ['payrollRecord', recordId] });
      queryClient.invalidateQueries({ queryKey: ['payrollHistory', user?.id] });
      setEditMode(false);
      toast.success('Record updated');
    } catch (err) {
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!record?.id) return;
    try {
      await base44.entities.PayrollRecord.delete(record.id);
      queryClient.invalidateQueries({ queryKey: ['payrollHistory', user?.id] });
      toast.success('Record deleted');
      navigate(-1);
    } catch (err) {
      toast.error('Failed to delete record');
    }
  };

  const handleAddressPress = (addressId) => {
    if (!addressId) return;
    navigate(createPageUrl(`AddressDetail?addressId=${addressId}`));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!record) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ChevronLeft className="w-5 h-5 mr-1" /> Back
        </Button>
        <p className="text-center text-gray-500 mt-10">Record not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-blue-500 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div>
            <p className="font-bold text-sm">Payroll Record</p>
            <p className="text-xs text-blue-200">
              {record.period_start && format(new Date(record.period_start), 'MMM d')} — {record.period_end && format(new Date(record.period_end), 'MMM d, yyyy')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {record.status === 'paid' && (
            <Badge className="bg-green-500 text-white text-xs">PAID</Badge>
          )}
          {!editMode ? (
            <button
              onClick={() => setEditMode(true)}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-lg"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex gap-1">
              <button
                onClick={() => setEditMode(false)}
                className="p-2 bg-white/20 hover:bg-white/30 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="p-2 bg-green-500 hover:bg-green-600 rounded-lg"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>
      </div>

      <main className="px-4 py-5 max-w-lg mx-auto">
        {/* Summary totals */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white border border-green-200 rounded-xl p-3">
            <p className="text-xs text-green-600 font-medium flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Instant
            </p>
            <p className="text-lg font-bold text-green-700">${record.instant_total?.toFixed(2)}</p>
            <p className="text-xs text-gray-400">{instantItems.length} items</p>
          </div>
          <div className="bg-white border border-orange-200 rounded-xl p-3">
            <p className="text-xs text-orange-600 font-medium flex items-center gap-1">
              <Clock className="w-3 h-3" /> Next
            </p>
            <p className="text-lg font-bold text-orange-700">${record.pending_total?.toFixed(2)}</p>
            <p className="text-xs text-gray-400">{pendingItems.length} items</p>
          </div>
          <div className="bg-white border border-purple-200 rounded-xl p-3">
            <p className="text-xs text-purple-600 font-medium flex items-center gap-1">
              <DollarSign className="w-3 h-3" /> Total
            </p>
            <p className="text-lg font-bold text-purple-700">${record.total_amount?.toFixed(2)}</p>
            <p className="text-xs text-gray-400">{record.address_count} items</p>
          </div>
        </div>

        {/* Meta info */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-500">Saved</p>
              <p className="font-medium text-gray-900 text-xs">
                {record.created_at && format(new Date(record.created_at), 'MMM d, yyyy h:mm a')}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Turned In</p>
              <p className="font-medium text-gray-900 text-xs">
                {record.turn_in_date ? format(new Date(record.turn_in_date), 'MMM d, yyyy h:mm a') : '—'}
              </p>
            </div>
          </div>

          {/* Edit mode: status + notes */}
          {editMode && (
            <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">STATUS</label>
                <div className="flex gap-2">
                  {['saved', 'paid'].map(s => (
                    <button
                      key={s}
                      onClick={() => setEditStatus(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${
                        editStatus === s
                          ? s === 'paid' ? 'bg-green-100 border-green-400 text-green-700' : 'bg-blue-100 border-blue-400 text-blue-700'
                          : 'bg-gray-50 border-gray-200 text-gray-400'
                      }`}
                    >
                      {s.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">NOTES</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Add notes about this pay period..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* Notes display (not edit mode) */}
          {!editMode && record.notes && (
            <div className="mt-3 border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-500 mb-1">Notes</p>
              <p className="text-sm text-gray-700">{record.notes}</p>
            </div>
          )}
        </div>

        {/* Instant Payouts */}
        {instantItems.length > 0 && (
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-green-700 mb-2 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> Instant Payouts
            </h3>
            <div className="space-y-2">
              {instantItems.map((item, i) => (
                <div
                  key={i}
                  onClick={() => handleAddressPress(item.id)}
                  className="bg-white border border-green-200 rounded-xl p-3 flex items-center justify-between cursor-pointer active:bg-green-50"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{item.address}</p>
                    {item.defendant && <p className="text-xs text-gray-500">{item.defendant}</p>}
                    {item.served_at && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {format(new Date(item.served_at), 'MMM d, h:mm a')}
                      </p>
                    )}
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full capitalize mt-1 inline-block">
                      {item.serve_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <p className="font-bold text-green-600">${item.amount?.toFixed(2)}</p>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending / Next Check */}
        {pendingItems.length > 0 && (
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-orange-700 mb-2 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Next Check Items
            </h3>
            <div className="space-y-2">
              {pendingItems.map((item, i) => (
                <div
                  key={i}
                  onClick={() => handleAddressPress(item.id)}
                  className="bg-white border border-orange-200 rounded-xl p-3 flex items-center justify-between cursor-pointer active:bg-orange-50"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{item.address}</p>
                    {item.defendant && <p className="text-xs text-gray-500">{item.defendant}</p>}
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full mt-1 inline-block">
                      {item.rto_at ? 'RTO' : 'Attempt'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <p className="font-bold text-orange-600">${item.amount?.toFixed(2)}</p>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RTO items */}
        {rtoItems.length > 0 && (
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2">
              <RotateCcw className="w-4 h-4" /> Returned to Office
            </h3>
            <div className="space-y-2">
              {rtoItems.map((item, i) => (
                <div
                  key={i}
                  onClick={() => handleAddressPress(item.id)}
                  className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between cursor-pointer active:bg-red-100"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{item.address}</p>
                    {item.defendant && <p className="text-xs text-gray-500">{item.defendant}</p>}
                    {item.rto_reason && (
                      <p className="text-xs text-red-500 mt-0.5 italic">"{item.rto_reason}"</p>
                    )}
                    {item.rto_at && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {format(new Date(item.rto_at), 'MMM d, h:mm a')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <p className="font-bold text-red-600">${item.amount?.toFixed(2)}</p>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Delete */}
        <div className="mt-8 border-t border-gray-200 pt-6">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full text-sm text-red-500 hover:text-red-700 flex items-center justify-center gap-2 py-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete This Record
            </button>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-700 font-semibold mb-3 text-center">
                Delete this payroll record permanently?
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleDelete}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                >
                  Delete
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      <BottomNav currentPage="WorkerRoutes" />
    </div>
  );
}