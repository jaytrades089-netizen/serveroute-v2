import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Edit2,
  Loader2,
  Trash2,
  X,
  AlertCircle,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DOCUMENT_INFO,
  PAY_RATES,
  loadScanSession,
  saveScanSession,
  categorizeConfidence
} from '@/components/scanning/ScanningService';

const C = {
  bg: '#060914',
  card: '#1c1b1d',
  cardElevated: '#201f21',
  border: '#363436',
  textPrimary: '#e6e1e4',
  textSecondary: '#d0c3cb',
  textMuted: '#8a7f87',
  accentGold: '#e9c349',
  accentPlum: '#e5b9e1',
  containerPlum: '#502f50',
  green: '#22c55e',
  red: '#ef4444',
};

export default function ScanPreview() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [editingAddress, setEditingAddress] = useState(null);
  const [editForm, setEditForm] = useState({ street: '', city: '', state: 'MI', zip: '', defendantName: '' });

  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('sessionId');

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });

  const { data: companyAddresses = [] } = useQuery({
    queryKey: ['companyAddresses', user?.company_id],
    queryFn: () => base44.entities.Address.filter({ company_id: user?.company_id, deleted_at: null }),
    enabled: !!user?.company_id
  });

  useEffect(() => {
    if (sessionId) {
      const existingSession = loadScanSession(sessionId);
      if (existingSession) { setSession(existingSession); }
      else { navigate(createPageUrl('ScanDocumentType')); }
    } else { navigate(createPageUrl('ScanDocumentType')); }
  }, [sessionId, navigate]);

  const getRelatedAddresses = (normalizedKey) => {
    if (!normalizedKey || !companyAddresses.length) return [];
    return companyAddresses.filter(a => a.normalized_key === normalizedKey);
  };

  const handleEditClick = (address) => {
    setEditingAddress(address);
    setEditForm({
      street: address.extractedData?.street || '',
      city: address.extractedData?.city || '',
      state: address.extractedData?.state || 'MI',
      zip: address.extractedData?.zip || '',
      defendantName: address.defendantName || ''
    });
  };

  const handleSaveEdit = () => {
    if (!session || !editingAddress) return;
    const updatedAddresses = session.addresses.map(addr =>
      addr.tempId === editingAddress.tempId
        ? { ...addr, extractedData: { street: editForm.street, city: editForm.city, state: editForm.state, zip: editForm.zip, fullAddress: `${editForm.street}, ${editForm.city}, ${editForm.state} ${editForm.zip}` }, defendantName: editForm.defendantName, manuallyEdited: true, status: 'extracted' }
        : addr
    );
    const updatedSession = { ...session, addresses: updatedAddresses, lastUpdated: new Date().toISOString() };
    setSession(updatedSession);
    saveScanSession(updatedSession);
    setEditingAddress(null);
    toast.success('Address updated');
  };

  const handleRemove = (tempId) => {
    if (!session) return;
    const updatedAddresses = session.addresses.filter(a => a.tempId !== tempId);
    const updatedSession = { ...session, addresses: updatedAddresses, lastUpdated: new Date().toISOString() };
    setSession(updatedSession);
    saveScanSession(updatedSession);
    toast.success('Address removed');
  };

  const handleContinue = () => {
    if (!session) return;
    const validAddresses = session.addresses.filter(a => a.status === 'extracted' && a.extractedData?.street);
    if (validAddresses.length === 0) { toast.error('Please have at least one valid address before continuing'); return; }
    const updatedSession = { ...session, currentStep: 'route_setup', lastUpdated: new Date().toISOString() };
    saveScanSession(updatedSession);
    navigate(createPageUrl(`ScanRouteSetup?sessionId=${session.id}`));
  };

  if (!session) {
    return (
      <div style={{ minHeight: '100vh', background: '#060914', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: C.accentGold }} />
      </div>
    );
  }

  const docInfo = DOCUMENT_INFO[session.documentType];
  const validCount = session.addresses.filter(a => a.status === 'extracted' && a.extractedData?.street).length;
  const failedCount = session.addresses.filter(a => a.status === 'failed' || !a.extractedData?.street).length;
  const estimatedEarnings = validCount * PAY_RATES[session.documentType];

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: 88 }}>
      {/* Header */}
      <div style={{ background: 'rgba(6,9,20,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 50 }}>
        <Link to={createPageUrl(`ScanCamera?sessionId=${session.id}`)}>
          <button style={{ width: 40, height: 40, borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <ArrowLeft style={{ width: 20, height: 20, color: C.textPrimary }} />
          </button>
        </Link>
        <h1 style={{ fontSize: 17, fontWeight: 700, color: C.textPrimary }}>Review Addresses</h1>
      </div>

      {/* Summary */}
      <div style={{ background: 'rgba(14,20,44,0.55)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 22 }}>{docInfo?.icon}</span>
          <span style={{ fontWeight: 600, color: C.textPrimary }}>{validCount} {docInfo?.name} Addresses</span>
        </div>
        <p style={{ color: C.green, fontWeight: 600 }}>Estimated Earnings: ${estimatedEarnings.toFixed(2)}</p>
        {failedCount > 0 && <p style={{ color: '#f97316', fontSize: 13, marginTop: 4 }}>{failedCount} address{failedCount !== 1 ? 'es' : ''} need attention</p>}
      </div>

      {/* Address List */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {session.addresses.map((addr) => {
          const conf = categorizeConfidence(addr.confidence);
          const relatedAddresses = getRelatedAddresses(addr.normalizedKey);
          const isFailed = addr.status === 'failed' || !addr.extractedData?.street;
          const confColor = conf.level === 'high' ? C.green : conf.level === 'medium' ? '#eab308' : C.red;

          return (
            <div key={addr.tempId} style={{ background: isFailed ? 'rgba(239,68,68,0.10)' : C.card, border: `1px solid ${isFailed ? 'rgba(239,68,68,0.40)' : C.border}`, borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isFailed ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.red }}>
                      <X style={{ width: 18, height: 18 }} />
                      <span style={{ fontWeight: 600, fontSize: 13 }}>Could not extract address</span>
                    </div>
                  ) : (
                    <>
                      <p style={{ fontWeight: 600, fontSize: 13, color: C.textPrimary, marginBottom: 2 }}>{addr.extractedData?.fullAddress}</p>
                      {addr.defendantName && <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>{addr.defendantName}</p>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, background: confColor + '22', color: confColor, border: `1px solid ${confColor}`, borderRadius: 4, padding: '2px 6px' }}>
                          {Math.round(addr.confidence * 100)}% confidence
                        </span>
                        {addr.manuallyEdited && <span style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 6px' }}>Edited</span>}
                        {relatedAddresses.length > 0 && <span style={{ fontSize: 10, fontWeight: 600, color: C.accentPlum, background: 'rgba(229,185,225,0.12)', border: `1px solid rgba(229,185,225,0.35)`, borderRadius: 4, padding: '2px 6px' }}>📋 +{relatedAddresses.length} other doc(s)</span>}
                      </div>
                    </>
                  )}
                  {isFailed && addr.ocrRawText && (
                    <div style={{ marginTop: 8, padding: '6px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: 6, fontSize: 11, color: C.textMuted, maxHeight: 60, overflowY: 'auto' }}>
                      {addr.ocrRawText.substring(0, 200)}...
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => handleEditClick(addr)} style={{ width: 32, height: 32, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Edit2 style={{ width: 15, height: 15, color: C.textMuted }} />
                  </button>
                  <button onClick={() => handleRemove(addr.tempId)} style={{ width: 32, height: 32, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Trash2 style={{ width: 15, height: 15, color: C.red }} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Actions */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(6,9,20,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderTop: '1px solid rgba(255,255,255,0.08)', padding: '12px 16px', display: 'flex', gap: 10 }}>
        <button onClick={() => navigate(createPageUrl(`ScanCamera?sessionId=${session.id}`))} style={{ flex: 1, height: 48, borderRadius: 12, background: 'transparent', border: `1px solid ${C.border}`, color: C.textSecondary, fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}>
          <Camera style={{ width: 16, height: 16 }} /> Scan More
        </button>
        <button onClick={handleContinue} disabled={validCount === 0} style={{ flex: 1, height: 48, borderRadius: 12, background: 'rgba(233,195,73,0.20)', border: '1px solid rgba(233,195,73,0.50)', color: C.accentGold, fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: validCount === 0 ? 'not-allowed' : 'pointer', opacity: validCount === 0 ? 0.4 : 1 }}>
          Continue <ArrowRight style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingAddress} onOpenChange={() => setEditingAddress(null)}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()} style={{ background: 'rgba(11,15,30,0.97)', border: '1px solid rgba(255,255,255,0.12)', color: C.textPrimary }}>
          <DialogHeader>
            <DialogTitle style={{ color: C.textPrimary }}>{editingAddress?.extractedData?.street ? 'Edit Address' : 'Enter Address Manually'}</DialogTitle>
            <DialogDescription style={{ color: C.textMuted }}>{editingAddress?.extractedData?.street ? 'Make corrections to the extracted address.' : 'OCR could not extract this address. Please enter manually.'}</DialogDescription>
          </DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 0' }}>
            <div><Label style={{ color: C.textMuted, fontSize: 11 }}>STREET ADDRESS *</Label><Input value={editForm.street} onChange={(e) => setEditForm({ ...editForm, street: e.target.value })} placeholder="123 Main St" style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, color: C.textPrimary, marginTop: 4 }} /></div>
            <div><Label style={{ color: C.textMuted, fontSize: 11 }}>CITY *</Label><Input value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} placeholder="Detroit" style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, color: C.textPrimary, marginTop: 4 }} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><Label style={{ color: C.textMuted, fontSize: 11 }}>STATE *</Label>
                <Select value={editForm.state} onValueChange={(v) => setEditForm({ ...editForm, state: v })}>
                  <SelectTrigger style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, color: C.textPrimary, marginTop: 4 }}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="MI">MI</SelectItem><SelectItem value="OH">OH</SelectItem><SelectItem value="IN">IN</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label style={{ color: C.textMuted, fontSize: 11 }}>ZIP *</Label><Input value={editForm.zip} onChange={(e) => setEditForm({ ...editForm, zip: e.target.value })} placeholder="48201" style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, color: C.textPrimary, marginTop: 4 }} /></div>
            </div>
            <div><Label style={{ color: C.textMuted, fontSize: 11 }}>DEFENDANT NAME (optional)</Label><Input value={editForm.defendantName} onChange={(e) => setEditForm({ ...editForm, defendantName: e.target.value })} placeholder="John Smith" style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, color: C.textPrimary, marginTop: 4 }} /></div>
          </div>
          <DialogFooter style={{ gap: 8 }}>
            <button onClick={() => setEditingAddress(null)} style={{ flex: 1, height: 42, borderRadius: 10, background: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSaveEdit} disabled={!editForm.street || !editForm.city || !editForm.zip} style={{ flex: 1, height: 42, borderRadius: 10, background: 'rgba(233,195,73,0.20)', border: '1px solid rgba(233,195,73,0.50)', color: C.accentGold, fontWeight: 700, cursor: 'pointer', opacity: (!editForm.street || !editForm.city || !editForm.zip) ? 0.4 : 1 }}>Save Changes</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
