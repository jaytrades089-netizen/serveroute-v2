import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  Loader2, 
  Upload, 
  FileText, 
  AlertCircle, 
  CheckCircle,
  ArrowLeft,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import BossBottomNav from '../components/boss/BossBottomNav';

const FILE_LIMITS = {
  maxFileSize: 5 * 1024 * 1024, // 5MB
  maxRows: 1000,
  allowedExtensions: ['.csv', '.txt']
};

function sanitizeCSVCell(value) {
  if (typeof value === 'string' && /^[=+\-@]/.test(value)) {
    return "'" + value;
  }
  return value?.trim() || '';
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => sanitizeCSVCell(v));
    if (values.length >= headers.length) {
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx];
      });
      row._rowNumber = i + 1;
      rows.push(row);
    }
  }
  
  return { headers, rows };
}

function validateCSV(headers, rows) {
  const errors = [];
  const requiredColumns = ['address', 'city', 'state', 'zip', 'serve_type'];
  
  for (const col of requiredColumns) {
    if (!headers.includes(col)) {
      errors.push(`Missing required column: '${col}'`);
    }
  }
  
  if (errors.length > 0) return errors;
  
  const validServeTypes = ['serve', 'garnishment', 'posting'];
  
  rows.forEach((row, idx) => {
    if (!row.address?.trim()) {
      errors.push(`Row ${row._rowNumber}: Address is required`);
    }
    if (row.serve_type && !validServeTypes.includes(row.serve_type.toLowerCase())) {
      errors.push(`Row ${row._rowNumber}: serve_type must be serve, garnishment, or posting`);
    }
  });
  
  return errors;
}

function getPayRate(serveType) {
  return serveType === 'posting' ? 10 : 24;
}

export default function AddressImport() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  
  const [step, setStep] = useState('upload'); // upload, preview, importing, complete
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [duplicateAction, setDuplicateAction] = useState('skip');
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: existingAddresses = [] } = useQuery({
    queryKey: ['existingAddresses', user?.company_id],
    queryFn: async () => {
      if (!user?.company_id) return [];
      return base44.entities.Address.filter({
        company_id: user.company_id,
        deleted_at: null
      });
    },
    enabled: !!user?.company_id && step === 'preview'
  });

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    // Validate file size
    if (selectedFile.size > FILE_LIMITS.maxFileSize) {
      toast.error('File too large. Maximum size is 5MB.');
      return;
    }
    
    // Validate extension
    const ext = '.' + selectedFile.name.split('.').pop().toLowerCase();
    if (!FILE_LIMITS.allowedExtensions.includes(ext)) {
      toast.error('Invalid file type. Please upload a CSV file.');
      return;
    }
    
    setFile(selectedFile);
    
    // Read and parse file
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      const { headers, rows } = parseCSV(text);
      
      if (rows.length > FILE_LIMITS.maxRows) {
        toast.error(`Too many rows. Maximum is ${FILE_LIMITS.maxRows}.`);
        return;
      }
      
      const errors = validateCSV(headers, rows);
      setValidationErrors(errors);
      
      if (errors.length === 0) {
        setParsedData({ headers, rows });
        setStep('preview');
      }
    };
    reader.readAsText(selectedFile);
  };

  const checkDuplicates = (rows) => {
    const duplicates = [];
    
    rows.forEach((row, idx) => {
      const fullAddress = `${row.address}, ${row.city}, ${row.state} ${row.zip}`.toLowerCase();
      
      const existing = existingAddresses.find(addr => {
        const existingFull = `${addr.legal_address}`.toLowerCase();
        return existingFull.includes(row.address.toLowerCase()) || 
               fullAddress.includes(addr.normalized_address?.toLowerCase() || '');
      });
      
      if (existing) {
        duplicates.push({
          rowNumber: row._rowNumber,
          address: fullAddress,
          existingId: existing.id
        });
      }
    });
    
    return duplicates;
  };

  const importAddresses = async () => {
    if (!parsedData || !user) return;
    
    if (!user.company_id) {
      toast.error('Your account is not associated with a company. Please contact your administrator.');
      return;
    }
    
    setStep('importing');
    setImportProgress(0);
    
    const results = {
      success: 0,
      failed: 0,
      duplicates: 0,
      failedRows: []
    };
    
    const duplicates = checkDuplicates(parsedData.rows);
    const duplicateRowNumbers = new Set(duplicates.map(d => d.rowNumber));
    
    const rowsToImport = parsedData.rows.filter(row => {
      if (duplicateRowNumbers.has(row._rowNumber)) {
        if (duplicateAction === 'skip') {
          results.duplicates++;
          return false;
        }
      }
      return true;
    });
    
    // Create ImportJob record
    const importJob = await base44.entities.ImportJob.create({
      company_id: user.company_id,
      boss_id: user.id,
      filename: file.name,
      total_rows: parsedData.rows.length,
      status: 'processing',
      duplicate_action: duplicateAction
    });
    
    for (let i = 0; i < rowsToImport.length; i++) {
      const row = rowsToImport[i];
      
      try {
        const serveType = row.serve_type?.toLowerCase() || 'serve';
        const fullAddress = `${row.address}, ${row.city}, ${row.state} ${row.zip}`;
        
        await base44.entities.Address.create({
          company_id: user.company_id,
          legal_address: fullAddress,
          normalized_address: fullAddress,
          city: row.city,
          state: row.state,
          zip: row.zip,
          serve_type: serveType,
          pay_rate: getPayRate(serveType),
          geocode_status: 'pending',
          status: 'pending'
        });
        
        results.success++;
      } catch (error) {
        results.failed++;
        results.failedRows.push({
          rowNumber: row._rowNumber,
          address: row.address,
          error: error.message
        });
      }
      
      setImportProgress(Math.round(((i + 1) / rowsToImport.length) * 100));
    }
    
    // Update ImportJob
    await base44.entities.ImportJob.update(importJob.id, {
      status: 'completed',
      success_count: results.success,
      failed_count: results.failed,
      duplicate_count: results.duplicates,
      failed_rows: results.failedRows,
      completed_at: new Date().toISOString()
    });
    
    // Audit log
    await base44.entities.AuditLog.create({
      company_id: user.company_id,
      action_type: 'addresses_imported',
      actor_id: user.id,
      actor_role: user.role || 'boss',
      target_type: 'import_job',
      target_id: importJob.id,
      details: {
        filename: file.name,
        total_rows: parsedData.rows.length,
        success_count: results.success,
        duplicate_count: results.duplicates,
        failed_count: results.failed,
        duplicate_action: duplicateAction
      },
      timestamp: new Date().toISOString()
    });
    
    setImportResults(results);
    setStep('complete');
    queryClient.invalidateQueries({ queryKey: ['poolAddresses'] });
  };

  const getSummary = () => {
    if (!parsedData) return null;
    
    const summary = {
      serves: 0,
      garnishments: 0,
      postings: 0
    };
    
    parsedData.rows.forEach(row => {
      const type = row.serve_type?.toLowerCase() || 'serve';
      if (type === 'serve') summary.serves++;
      else if (type === 'garnishment') summary.garnishments++;
      else if (type === 'posting') summary.postings++;
    });
    
    return summary;
  };

  const summary = getSummary();
  const duplicates = parsedData ? checkDuplicates(parsedData.rows) : [];

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl('BossDashboard'))}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-semibold text-lg">Import Addresses</h1>
      </header>

      <main className="px-4 py-6 max-w-2xl mx-auto">
        {/* Upload Step */}
        {step === 'upload' && (
          <Card>
            <CardHeader>
              <CardTitle>Upload CSV File</CardTitle>
            </CardHeader>
            <CardContent>
              <div 
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600 mb-2">Click to upload or drag and drop</p>
                <p className="text-sm text-gray-400">CSV files only, max 5MB, max 1000 rows</p>
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={handleFileSelect}
              />
              
              {validationErrors.length > 0 && (
                <div className="mt-4 p-4 bg-red-50 rounded-lg">
                  <div className="flex items-center gap-2 text-red-600 font-medium mb-2">
                    <AlertCircle className="w-5 h-5" />
                    Validation Errors
                  </div>
                  <ul className="text-sm text-red-600 space-y-1">
                    {validationErrors.slice(0, 5).map((error, idx) => (
                      <li key={idx}>• {error}</li>
                    ))}
                    {validationErrors.length > 5 && (
                      <li>... and {validationErrors.length - 5} more errors</li>
                    )}
                  </ul>
                </div>
              )}
              
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <p className="font-medium mb-2">Required CSV format:</p>
                <code className="text-sm text-gray-600 block">
                  address,city,state,zip,serve_type
                </code>
                <p className="text-sm text-gray-500 mt-2">
                  serve_type options: serve, garnishment, posting
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Preview Step */}
        {step === 'preview' && parsedData && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Import Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">File:</span>
                <span className="font-medium">{file?.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Total Rows:</span>
                <span className="font-medium">{parsedData.rows.length}</span>
              </div>
              
              <div className="border-t pt-4">
                <p className="font-medium mb-2">By Type:</p>
                <div className="space-y-1 text-sm">
                  <p>• Serves: {summary.serves} (${summary.serves * 24})</p>
                  <p>• Garnishments: {summary.garnishments} (${summary.garnishments * 24})</p>
                  <p>• Postings: {summary.postings} (${summary.postings * 10})</p>
                </div>
              </div>
              
              <div className="border-t pt-4">
                <p className="font-medium mb-2">Preview:</p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {parsedData.rows.slice(0, 5).map((row, idx) => (
                    <div key={idx} className="text-sm p-2 bg-gray-50 rounded">
                      {idx + 1}. {row.address}, {row.city}, {row.state} {row.zip} - {row.serve_type}
                    </div>
                  ))}
                  {parsedData.rows.length > 5 && (
                    <p className="text-sm text-gray-500">... and {parsedData.rows.length - 5} more</p>
                  )}
                </div>
              </div>
              
              {duplicates.length > 0 && (
                <div className="border-t pt-4">
                  <div className="flex items-center gap-2 text-amber-600 mb-3">
                    <AlertCircle className="w-5 h-5" />
                    <span className="font-medium">{duplicates.length} potential duplicates found</span>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-3">Duplicate handling:</p>
                  <RadioGroup value={duplicateAction} onValueChange={setDuplicateAction}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="skip" id="skip" />
                      <Label htmlFor="skip">Skip duplicates</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="import" id="import" />
                      <Label htmlFor="import">Import anyway (create duplicates)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="replace" id="replace" />
                      <Label htmlFor="replace">Replace existing addresses</Label>
                    </div>
                  </RadioGroup>
                </div>
              )}
              
              <div className="flex gap-3 pt-4">
                <Button variant="outline" onClick={() => {
                  setStep('upload');
                  setFile(null);
                  setParsedData(null);
                }}>
                  Cancel
                </Button>
                <Button onClick={importAddresses} className="flex-1">
                  Import {parsedData.rows.length} Addresses
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Importing Step */}
        {step === 'importing' && (
          <Card>
            <CardContent className="p-8 text-center">
              <Loader2 className="w-12 h-12 mx-auto animate-spin text-blue-500 mb-4" />
              <h2 className="text-xl font-semibold mb-4">Importing Addresses</h2>
              <Progress value={importProgress} className="mb-4" />
              <p className="text-gray-600">
                Processing... {importProgress}%
              </p>
              <p className="text-sm text-gray-400 mt-2">
                Please wait. This may take a few minutes.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Complete Step */}
        {step === 'complete' && importResults && (
          <Card>
            <CardContent className="p-8">
              <div className="text-center mb-6">
                <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-4" />
                <h2 className="text-xl font-semibold">Import Complete</h2>
              </div>
              
              <div className="space-y-2 mb-6">
                <p className="text-green-600">✓ Successfully imported: {importResults.success} addresses</p>
                {importResults.duplicates > 0 && (
                  <p className="text-amber-600">⚠ Skipped (duplicates): {importResults.duplicates}</p>
                )}
                {importResults.failed > 0 && (
                  <p className="text-red-600">✗ Failed: {importResults.failed}</p>
                )}
              </div>
              
              {importResults.failedRows.length > 0 && (
                <div className="mb-6 p-4 bg-red-50 rounded-lg">
                  <p className="font-medium text-red-600 mb-2">Failed addresses:</p>
                  <ul className="text-sm text-red-600 space-y-1">
                    {importResults.failedRows.map((row, idx) => (
                      <li key={idx}>• Row {row.rowNumber}: "{row.address}" - {row.error}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => navigate(createPageUrl('AddressPool'))}>
                  View Address Pool
                </Button>
                <Button variant="outline" onClick={() => {
                  setStep('upload');
                  setFile(null);
                  setParsedData(null);
                  setImportResults(null);
                }}>
                  Import More
                </Button>
                <Button onClick={() => navigate(createPageUrl('BossDashboard'))}>
                  Done
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <BossBottomNav currentPage="BossDashboard" />
    </div>
  );
}