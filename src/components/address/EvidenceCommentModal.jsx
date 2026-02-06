import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Camera, Loader2 } from 'lucide-react';

export default function EvidenceCommentModal({ 
  open, 
  onClose, 
  onSave, 
  photoPreview,
  saving = false,
  requireComment = true
}) {
  const [comment, setComment] = useState('');

  const handleSave = () => {
    if (requireComment && !comment.trim()) {
      return; // Don't save if comment is required but empty
    }
    onSave(comment);
    setComment('');
  };
  
  const canSave = !requireComment || comment.trim().length > 0;

  const handleClose = () => {
    setComment('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-blue-500" />
            Add Description
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

        <p className="text-sm text-gray-500 mb-2">
          Describe what you observed (vehicles, occupants, house details, license plates, etc.)
          {requireComment && <span className="text-red-500 font-bold"> *Required</span>}
        </p>
        
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="No answer at door. Blue Honda Civic in driveway, plate ABC-1234. House appears occupied, lights on inside."
          className={`h-32 resize-none ${requireComment && !comment.trim() ? 'border-red-300 focus:border-red-500' : ''}`}
          autoFocus
        />
        
        {requireComment && !comment.trim() && (
          <p className="text-xs text-red-500 mt-1">
            A description is required before saving evidence
          </p>
        )}

        <div className="flex gap-3 mt-4">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={handleClose}
            disabled={saving}
          >
            Cancel
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
              'Save Evidence'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}