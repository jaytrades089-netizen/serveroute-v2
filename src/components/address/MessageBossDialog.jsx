import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Camera, Loader2, X, AlertTriangle, Ban, Shield, FileQuestion, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatAddress } from './AddressCard';

const QUESTION_CATEGORIES = [
  { id: 'wrong_address', label: 'Wrong Address', icon: AlertTriangle },
  { id: 'cant_access', label: "Can't Access", icon: Ban },
  { id: 'safety_concern', label: 'Safety Concern', icon: Shield },
  { id: 'missing_documents', label: 'Missing Documents', icon: FileQuestion },
  { id: 'other', label: 'Other', icon: HelpCircle }
];

export default function MessageBossDialog({ 
  open, 
  onOpenChange, 
  address, 
  route,
  user 
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const formatted = address ? formatAddress(address) : { line1: '', line2: '' };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setPhotoUrl(file_url);
    } catch (error) {
      console.error('Error uploading photo:', error);
      toast.error('Failed to upload photo');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleSend = async () => {
    if (!category || !message.trim() || !address || !user) return;

    setIsSending(true);
    try {
      await base44.entities.AddressQuestion.create({
        company_id: user.company_id,
        address_id: address.id,
        route_id: route?.id || address.route_id,
        asked_by: user.id,
        asked_at: new Date().toISOString(),
        category,
        message: message.trim(),
        photo_url: photoUrl || null,
        status: 'pending'
      });

      // Create notification for boss
      const bosses = await base44.entities.User.filter({ 
        company_id: user.company_id, 
        role: 'boss' 
      });
      
      for (const boss of bosses) {
        await base44.entities.Notification.create({
          user_id: boss.id,
          company_id: user.company_id,
          recipient_role: 'boss',
          type: 'address_flagged',
          title: 'Address Question',
          body: `${user.full_name} has a question about ${formatted.line1}`,
          related_id: address.id,
          related_type: 'address',
          priority: 'normal'
        });
      }

      toast.success('Message sent to boss');
      queryClient.invalidateQueries({ queryKey: ['addressQuestions'] });
      onOpenChange(false);
      
      // Reset form
      setCategory('');
      setMessage('');
      setPhotoUrl('');
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Message About Address</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Address Info */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">ADDRESS:</p>
            <p className="font-bold text-sm">{formatted.line1}</p>
            <p className="text-sm text-gray-700">{formatted.line2}</p>
            {route && (
              <p className="text-xs text-gray-500 mt-1">Route: {route.folder_name}</p>
            )}
          </div>

          {/* Category Selection */}
          <div>
            <p className="text-sm font-medium mb-2">Quick Questions:</p>
            <div className="flex flex-wrap gap-2">
              {QUESTION_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                return (
                  <Button
                    key={cat.id}
                    variant={category === cat.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCategory(cat.id)}
                    className={category === cat.id ? 'bg-orange-500 hover:bg-orange-600' : ''}
                  >
                    <Icon className="w-3 h-3 mr-1" />
                    {cat.label}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Message */}
          <div>
            <p className="text-sm font-medium mb-2">Your Message:</p>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your question or issue..."
              rows={4}
            />
          </div>

          {/* Photo Upload */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />
            
            {photoUrl ? (
              <div className="relative inline-block">
                <img 
                  src={photoUrl} 
                  alt="Attached" 
                  className="w-20 h-20 object-cover rounded-lg"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 w-6 h-6"
                  onClick={() => setPhotoUrl('')}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4 mr-2" />
                )}
                Attach Photo
              </Button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!category || !message.trim() || isSending}
            className="bg-orange-500 hover:bg-orange-600"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : null}
            Send to Boss
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}