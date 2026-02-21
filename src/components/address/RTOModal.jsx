import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, RotateCcw } from 'lucide-react';

export default function RTOModal({ 
  open, 
  onClose, 
  onSubmit, 
  address,
  saving = false 
}) {
  const [comment, setComment] = useState('');

  const handleSubmit = () => {
    onSubmit(comment);
    setComment('');
  };

  const handleClose = () => {
    setComment('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md mx-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <RotateCcw className="w-5 h-5" />
            <span className="text-red-600">RTO</span> - Return To Office
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700 font-medium">
              This address will be marked as returned and paid on your next check (not instant).
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">
              {address?.normalized_address || address?.legal_address}
            </p>
            <p className="text-xs text-gray-500">
              {address?.city}, {address?.state} {address?.zip}
            </p>
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">
              Reason for Return <span className="text-red-500">*</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Why is this being returned to office? (e.g., Law office requested return, bad address, etc.)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
              rows={4}
              maxLength={1000}
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1 text-right">
              {comment.length}/1000
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={handleClose}
              className="flex-1"
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!comment.trim() || saving}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Confirm RTO
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}