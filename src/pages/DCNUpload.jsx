import React, { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { 
  Loader2, ArrowLeft, Upload, FileText, Download, CheckCircle, 
  AlertCircle, Clock, FileCheck, X 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import BossBottomNav from '../components/boss/BossBottomNav';
import { 
  parseCSV, 
  generateNormalizedKey, 
  findAddressMatch, 
  CONFIDENCE_THRESHOLDS 
} from '../components/dcn/DCNMatchingService';

const BATCH_STATUS_CONFIG = {
  processing: { label: 'Processing', icon: Loader2, color: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Completed', icon: CheckCircle, color: 'bg-green-100 text-green-700' },
  failed: { label: 'Failed', icon: AlertCircle, color: 'bg-red-100 text-red-700' }
};

export default function DCNUpload() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStats, setUploadStats] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const companyId = user?.company_id;

  const { data: batches = [], isLoading: batchesLoading } = useQuery({
    queryKey: ['dcnBatches', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      return base44.entities.DCNUploadBatch.filter({ company_id: companyId }, '-uploaded_at', 20);
    },
    enabled: !!companyId
  });

  const { data: addresses = [] } = useQuery({
    queryKey: ['companyAddresses', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      return base44.entities.Address.filter({ company_id: companyId, deleted_at: null });
    },
    enabled: !!companyId
  });

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const processFile = async (file) => {
    if (!file) return;

    const validTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    const extension = file.name.split('.').pop().toLowerCase();
    
    if (!['csv', 'xlsx', 'xls'].includes(extension)) {
      toast.error('Please upload a CSV or Excel file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be under 10MB');
      return;
    }

    setUploading(true);
    setUploadProgress(5);

    try {
      // Read file content
      const text = await file.text();
      setUploadProgress(15);

      // Parse CSV
      const rows = parseCSV(text);
      if (rows.length === 0) {
        throw new Error('No data rows found in file');
      }
      setUploadProgress(25);

      // Create batch record
      const batch = await base44.entities.DCNUploadBatch.create({
        company_id: companyId,
        filename: file.name,
        file_size_bytes: file.size,
        uploaded_by: user.id,
        uploaded_at: new Date().toISOString(),
        status: 'processing',
        total_rows: rows.length,
        valid_rows: 0,
        invalid_rows: 0,
        auto_matched: 0,
        pending_review: 0,
        unmatched: 0,
        validation_errors: []
      });
      setUploadProgress(30);

      // Process rows
      const stats = {
        total: rows.length,
        valid: 0,
        invalid: 0,
        autoMatched: 0,
        pendingReview: 0,
        unmatched: 0
      };
      const errors = [];
      const existingDCNs = new Set();

      // Get existing DCNs for this company
      const existingRecords = await base44.entities.DCNRecord.filter({ company_id: companyId });
      existingRecords.forEach(r => existingDCNs.add(r.dcn));

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;
        setUploadProgress(30 + Math.floor((i / rows.length) * 60));

        // Validate required fields
        if (!row.dcn || row.dcn.trim() === '') {
          errors.push({ row: rowNum, field: 'DCN', error: 'DCN is required' });
          stats.invalid++;
          continue;
        }

        if (!row.address || row.address.trim() === '') {
          errors.push({ row: rowNum, field: 'Address', error: 'Address is required' });
          stats.invalid++;
          continue;
        }

        const dcnValue = row.dcn.trim();

        // Check for duplicate
        if (existingDCNs.has(dcnValue)) {
          errors.push({ row: rowNum, field: 'DCN', error: `Duplicate DCN '${dcnValue}' already exists` });
          stats.invalid++;
          continue;
        }

        // Generate normalized key
        const normalizedKey = generateNormalizedKey({
          street: row.address,
          city: row.city || '',
          state: 'MI',
          zip: ''
        });

        // Find match
        const match = findAddressMatch(addresses, row.address, row.city);

        // Determine status
        let matchStatus = 'unmatched';
        let addressId = null;
        let suggestedAddressId = null;

        if (match) {
          if (match.confidence >= CONFIDENCE_THRESHOLDS.auto_match) {
            matchStatus = 'auto_matched';
            addressId = match.address_id;
            stats.autoMatched++;
          } else if (match.confidence >= CONFIDENCE_THRESHOLDS.pending_review) {
            matchStatus = 'pending_review';
            suggestedAddressId = match.address_id;
            stats.pendingReview++;
          } else {
            stats.unmatched++;
          }
        } else {
          stats.unmatched++;
        }

        // Build metadata
        const metadata = {};
        if (row.defendant_first_name) metadata.defendant_first_name = row.defendant_first_name;
        if (row.defendant_last_name) metadata.defendant_last_name = row.defendant_last_name;
        if (row.court_name) metadata.court_name = row.court_name;
        if (row.case_number) metadata.case_number = row.case_number;

        // Create DCN record
        const dcnRecord = await base44.entities.DCNRecord.create({
          company_id: companyId,
          dcn: dcnValue,
          raw_address: row.address,
          normalized_key: normalizedKey,
          address_id: addressId,
          upload_batch_id: batch.id,
          uploaded_by: user.id,
          uploaded_at: new Date().toISOString(),
          source_filename: file.name,
          source_row_number: rowNum,
          match_status: matchStatus,
          match_confidence: match?.confidence || null,
          suggested_address_id: suggestedAddressId,
          matched_by: matchStatus === 'auto_matched' ? 'system' : null,
          matched_at: matchStatus === 'auto_matched' ? new Date().toISOString() : null,
          metadata: metadata
        });

        // If auto-matched, update address
        if (matchStatus === 'auto_matched' && addressId) {
          await base44.entities.Address.update(addressId, {
            dcn_id: dcnRecord.id,
            has_dcn: true,
            dcn_linked_at: new Date().toISOString(),
            dcn_linked_by: 'system'
          });
        }

        existingDCNs.add(dcnValue);
        stats.valid++;
      }

      setUploadProgress(95);

      // Update batch
      await base44.entities.DCNUploadBatch.update(batch.id, {
        status: 'completed',
        valid_rows: stats.valid,
        invalid_rows: stats.invalid,
        auto_matched: stats.autoMatched,
        pending_review: stats.pendingReview,
        unmatched: stats.unmatched,
        validation_errors: errors.slice(0, 50),
        completed_at: new Date().toISOString()
      });

      // Audit log
      await base44.entities.AuditLog.create({
        company_id: companyId,
        action_type: 'dcn_batch_uploaded',
        actor_id: user.id,
        actor_role: 'boss',
        target_type: 'dcn_upload_batch',
        target_id: batch.id,
        details: stats,
        timestamp: new Date().toISOString()
      });

      setUploadProgress(100);
      setUploadStats(stats);
      queryClient.invalidateQueries({ queryKey: ['dcnBatches'] });
      toast.success(`Uploaded ${stats.valid} DCNs successfully`);

    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files?.[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, [addresses, companyId, user]);

  const handleFileSelect = (e) => {
    if (e.target.files?.[0]) {
      processFile(e.target.files[0]);
    }
  };

  const downloadTemplate = () => {
    const csv = 'DCN,Address,City,Defendant First Name,Defendant Last Name,Court Name,Case Number\nABC-12345,123 Main Street,Detroit,John,Smith,Oakland County Circuit,2026-CV-1234\nABC-12346,456 Oak Avenue,Southfield,Jane,Doe,Wayne County Circuit,2026-CV-5678';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dcn_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const pendingReviewCount = batches.reduce((sum, b) => sum + (b.pending_review || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl('BossDashboard'))}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">DCN Upload</h1>
            {pendingReviewCount > 0 && (
              <p className="text-xs text-orange-600">{pendingReviewCount} pending review</p>
            )}
          </div>
          {pendingReviewCount > 0 && (
            <Button 
              size="sm" 
              onClick={() => navigate(createPageUrl('DCNMatching'))}
              className="bg-orange-500 hover:bg-orange-600"
            >
              Review Matches
            </Button>
          )}
        </div>
      </header>

      <main className="px-4 py-4 max-w-2xl mx-auto space-y-4">
        {/* Upload Zone */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload DCN File</CardTitle>
          </CardHeader>
          <CardContent>
            {uploading ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                  <span className="text-sm text-gray-600">Processing file...</span>
                </div>
                <Progress value={uploadProgress} />
                {uploadStats && (
                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="p-2 bg-green-50 rounded">
                      <p className="font-semibold text-green-700">{uploadStats.autoMatched}</p>
                      <p className="text-xs text-gray-500">Auto-matched</p>
                    </div>
                    <div className="p-2 bg-yellow-50 rounded">
                      <p className="font-semibold text-yellow-700">{uploadStats.pendingReview}</p>
                      <p className="text-xs text-gray-500">Pending Review</p>
                    </div>
                    <div className="p-2 bg-gray-50 rounded">
                      <p className="font-semibold text-gray-700">{uploadStats.unmatched}</p>
                      <p className="text-xs text-gray-500">Unmatched</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                    dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 mb-2">Drag & drop CSV or Excel file here</p>
                  <p className="text-sm text-gray-400 mb-4">or click to browse</p>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload">
                    <Button variant="outline" asChild>
                      <span>Select File</span>
                    </Button>
                  </label>
                  <p className="text-xs text-gray-400 mt-3">Accepted: .csv, .xlsx, .xls • Max: 10MB</p>
                </div>

                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-gray-700">Required Columns:</p>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• <strong>DCN</strong> - Document Control Number (required)</li>
                    <li>• <strong>Address</strong> - Street address (required)</li>
                    <li>• <strong>City</strong> - City name (recommended for better matching)</li>
                  </ul>
                  <p className="text-xs text-gray-400 mt-2">
                    Optional: Defendant First Name, Defendant Last Name, Court Name, Case Number
                  </p>
                </div>

                <Button variant="outline" size="sm" onClick={downloadTemplate} className="mt-4">
                  <Download className="w-4 h-4 mr-2" />
                  Download Template
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Recent Batches */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Uploads</CardTitle>
          </CardHeader>
          <CardContent>
            {batchesLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : batches.length === 0 ? (
              <div className="text-center py-6">
                <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">No uploads yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {batches.map((batch) => {
                  const statusConfig = BATCH_STATUS_CONFIG[batch.status];
                  const StatusIcon = statusConfig?.icon || Clock;
                  const totalMatched = (batch.auto_matched || 0) + 
                    ((batch.total_rows || 0) - (batch.pending_review || 0) - (batch.unmatched || 0) - (batch.invalid_rows || 0));

                  return (
                    <div
                      key={batch.id}
                      className="border rounded-lg p-3 hover:shadow-sm transition-shadow cursor-pointer"
                      onClick={() => navigate(createPageUrl(`DCNBatchDetail?batchId=${batch.id}`))}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="w-5 h-5 text-gray-400" />
                          <div>
                            <p className="font-medium text-sm">{batch.filename}</p>
                            <p className="text-xs text-gray-500">
                              {batch.uploaded_at && formatDistanceToNow(new Date(batch.uploaded_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                        <Badge className={statusConfig?.color}>
                          <StatusIcon className={`w-3 h-3 mr-1 ${batch.status === 'processing' ? 'animate-spin' : ''}`} />
                          {statusConfig?.label}
                        </Badge>
                      </div>
                      <div className="mt-2 flex gap-3 text-xs text-gray-600">
                        <span>{batch.total_rows || 0} DCNs</span>
                        <span className="text-green-600">
                          {batch.auto_matched || 0} auto-matched
                        </span>
                        {(batch.pending_review || 0) > 0 && (
                          <span className="text-orange-600">{batch.pending_review} pending</span>
                        )}
                        {(batch.unmatched || 0) > 0 && (
                          <span className="text-gray-500">{batch.unmatched} unmatched</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <BossBottomNav currentPage="BossDashboard" />
    </div>
  );
}