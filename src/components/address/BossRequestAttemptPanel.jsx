import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getCompanyId } from '@/components/utils/companyUtils';

const QUALIFIER_OPTIONS = [
  { value: 'AM', label: 'AM', desc: 'Before noon', bg: 'bg-sky-100 text-sky-700 border-sky-300' },
  { value: 'PM', label: 'PM', desc: '5 PM - 9 PM', bg: 'bg-indigo-100 text-indigo-700 border-indigo-300' },
  { value: 'WEEKEND', label: 'WKND', desc: 'Sat or Sun', bg: 'bg-orange-100 text-orange-700 border-orange-300' },
  { value: 'ANYTIME', label: 'ANY', desc: 'Any time', bg: 'bg-gray-100 text-gray-700 border-gray-300' },
];

export default function BossRequestAttemptPanel({
  address,
  routeId,
  user,
  onClose,
  queryClient
}) {
  const [qualifiers, setQualifiers] = useState([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSend = async () => {
    if (qualifiers.length === 0) return;
    setSaving(true);
    try {
      const companyId = getCompanyId(user) || address.company_id;

      await base44.entities.AttemptRequest.create({
        address_id: address.id,
        route_id: routeId,
        company_id: companyId,
        requested_by: user.id,
        assigned_to: address.server_id || null,
        required_qualifiers: qualifiers,
        status: 'pending',
        boss_note: note || null
      });

      await base44.entities.Address.update(address.id, {
        has_pending_request: true,
        pending_request_qualifiers: qualifiers
      });

      if (address.server_id) {
        try {
          await base44.entities.Notification.create({
            user_id: address.server_id,
            company_id: companyId,
            recipient_role: 'server',
            type: 'attempt_requested',
            title: 'New Attempt Requested',
            body: `${qualifiers.join(' + ')} attempt needed at ${address.normalized_address || address.legal_address}`,
            priority: 'urgent',
            data: { address_id: address.id, route_id: routeId, qualifiers }
          });
        } catch (e) {
          console.warn('Request notification failed (non-fatal):', e);
        }
      }

      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: 'attempt_requested',
        actor_id: user.id,
        actor_role: 'boss',
        target_type: 'address',
        target_id: address.id,
        details: { qualifiers, note, route_id: routeId },
        timestamp: new Date().toISOString()
      });

      toast.success(`Request sent: ${qualifiers.join(' + ')}`);
      queryClient.refetchQueries({ queryKey: ['routeAddresses', routeId] });
      queryClient.refetchQueries({ queryKey: ['attemptRequest', address.id] });
      onClose();
    } catch (error) {
      console.error('Failed to create request:', error);
      toast.error('Failed to send request');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-4 pb-4">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <h4 className="text-sm font-bold text-red-800 mb-3">Request New Attempt</h4>
        <p className="text-xs text-red-600 mb-3">
          Worker will see this request highlighted on their route
        </p>

        <div className="mb-3">
          <label className="text-xs font-semibold text-gray-600 block mb-2">
            REQUIRED TIME FRAME (tap all that apply)
          </label>
          <div className="grid grid-cols-4 gap-2">
            {QUALIFIER_OPTIONS.map(q => {
              const isSelected = qualifiers.includes(q.value);
              const isAnytime = q.value === 'ANYTIME';
              return (
                <button
                  key={q.value}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isAnytime) {
                      setQualifiers(['ANYTIME']);
                    } else {
                      setQualifiers(prev => {
                        const filtered = prev.filter(v => v !== 'ANYTIME');
                        return filtered.includes(q.value)
                          ? filtered.filter(v => v !== q.value)
                          : [...filtered, q.value];
                      });
                    }
                  }}
                  className={`p-3 rounded-xl text-center border-2 transition-all ${
                    isSelected
                      ? `${q.bg} border-current ring-2 ring-offset-1`
                      : 'bg-gray-50 text-gray-400 border-gray-200'
                  }`}
                >
                  <span className="block text-sm font-bold">{q.label}</span>
                  <span className="block text-[10px] mt-0.5">{q.desc}</span>
                </button>
              );
            })}
          </div>

          <div className="flex gap-2 mt-2">
            <button
              onClick={(e) => { e.stopPropagation(); setQualifiers(['WEEKEND', 'PM']); }}
              className="text-[10px] px-2 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
            >
              WKND + PM
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setQualifiers(['WEEKEND', 'AM']); }}
              className="text-[10px] px-2 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
            >
              WKND + AM
            </button>
          </div>
        </div>

        <div className="mb-3">
          <label className="text-xs font-semibold text-gray-600 block mb-1">NOTE TO WORKER</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Law office requires another attempt because..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
            rows={2}
            maxLength={500}
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={(e) => { e.stopPropagation(); handleSend(); }}
            disabled={qualifiers.length === 0 || saving}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Send Request
          </Button>
        </div>
      </div>
    </div>
  );
}