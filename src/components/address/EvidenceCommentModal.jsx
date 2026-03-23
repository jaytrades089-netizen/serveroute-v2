import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Camera, Loader2, Copy } from 'lucide-react';
import { toast } from 'sonner';

export default function EvidenceCommentModal({ 
  open, 
  onClose, 
  onSave, 
  photoPreview,
  saving = false,
  requireComment = true,
  title = 'Add Comment',
  placeholder = 'Blue Honda Civic in driveway, plate ABC-1234. Lights on inside.',
  buttonText = 'Save Evidence'
}) {
  const [comment, setComment] = useState('');

  const handleSave = () => {
    if (requireComment && !comment.trim()) {
      return; // Don't save if comment is required but empty
    }
    // Pass the comment to parent - don't clear here, parent will close modal
    onSave(comment);
  };
  
  const canSave = !requireComment || comment.trim().length > 0;

  const handleClose = () => {
    if (!saving) {
      setComment('');
      onClose();
    }
  };
  
  // Reset comment when modal opens fresh
  React.useEffect(() => {
    if (open) {
      setComment('');
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-blue-500" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {/* Photo Preview */}
        {photoPreview && (
          <div className="rounded-lg overflow-hidden border mb-4">
            <img 
              src={photoPreview} 
              alt="Evidence" 
              className="w-full h-40 object-cover"
            />
          </div>
        )}
        
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={placeholder}
          className={`h-24 resize-none ${requireComment && !comment.trim() ? 'border-red-300 focus:border-red-500' : ''}`}
          autoFocus
        />
        
        {requireComment && !comment.trim() && (
          <p className="text-xs text-red-500 mt-1">
            Comment required
          </p>
        )}

        {saving && (
          <div className="mt-2">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="w-4 h-4 animate-spin text-green-600" />
              <span className="text-sm font-semibold text-green-700">Uploading evidence...</span>
            </div>
            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-500 rounded-full transition-all duration-500 ease-out"
                style={{ 
                  width: '90%',
                  animation: 'progress-fill 3s ease-out forwards'
                }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1.5 text-center">Please wait — do not close</p>
            <style>{`
              @keyframes progress-fill {
                0% { width: 5%; }
                30% { width: 40%; }
                60% { width: 65%; }
                80% { width: 80%; }
                100% { width: 90%; }
              }
            `}</style>
          </div>
        )}

        <div className="flex gap-3 mt-4">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={() => {
              if (comment.trim()) {
                try {
                  navigator.clipboard.writeText(comment);
                  toast.success('Copied!');
                } catch (err) {
                  toast.error('Failed to copy');
                }
              }
            }}
            disabled={saving || !comment.trim()}
          >
            <Copy className="w-4 h-4 mr-1" />
            Copy
          </Button>
          <Button 
            className={`flex-1 ${canSave ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-300 cursor-not-allowed'}`}
            onClick={handleSave}
            disabled={saving || !canSave}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              buttonText
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}