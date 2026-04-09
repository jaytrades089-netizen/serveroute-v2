import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  ArrowLeft, 
  Send, 
  Image as ImageIcon, 
  User, 
  Plus,
  Loader2,
  Trash2,
  MessageCircle
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import BossBottomNav from '@/components/boss/BossBottomNav';
import BottomNav from '@/components/layout/BottomNav';
import { ChatSkeleton } from '@/components/ui/skeletons';
import { toast } from 'sonner';

export default function Chat() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: 80
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(229,185,225,0.2)',
        borderRadius: 20,
        padding: '40px 48px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        maxWidth: 280,
        textAlign: 'center'
      }}>
        <MessageCircle style={{ width: 40, height: 40, color: '#e5b9e1', opacity: 0.7 }} />
        <div>
          <div style={{ color: '#e6e1e4', fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            Chat
          </div>
          <div style={{ color: '#8a7f87', fontSize: 14, lineHeight: 1.5 }}>
            Team messaging is coming soon 😊
          </div>
        </div>
      </div>
      <BottomNav currentPage="Chat" />
    </div>
  );
}
