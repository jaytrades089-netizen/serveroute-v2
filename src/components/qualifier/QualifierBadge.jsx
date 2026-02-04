import React from 'react';
import { getBadgeStyle } from '@/components/services/QualifierService';

/**
 * Single Qualifier Badge
 */
export function QualifierBadge({ badge, size = 'default' }) {
  const style = getBadgeStyle(badge);
  
  const sizeClasses = {
    small: 'px-1.5 py-0.5 text-[10px]',
    default: 'px-2 py-1 text-xs',
    large: 'px-3 py-1.5 text-sm'
  };
  
  return (
    <span className={`
      inline-flex items-center rounded-full font-bold border
      ${style.bg} ${style.text} ${style.border}
      ${sizeClasses[size]}
    `}>
      {badge}
    </span>
  );
}

/**
 * Multiple Qualifier Badges
 */
export function QualifierBadges({ badges, size = 'default' }) {
  if (!badges || badges.length === 0) return null;
  
  return (
    <div className="flex gap-1 flex-wrap">
      {badges.map((badge, i) => (
        <QualifierBadge key={i} badge={badge} size={size} />
      ))}
    </div>
  );
}

/**
 * Qualifier Summary Box (HAS/DUE/NEEDS style)
 */
export function QualifierBox({ label, badges, emptyText = 'None', variant = 'default' }) {
  const variants = {
    default: 'bg-gray-50 border-gray-200',
    success: 'bg-green-50 border-green-200',
    warning: 'bg-amber-50 border-amber-200',
    info: 'bg-blue-50 border-blue-200',
    danger: 'bg-red-50 border-red-300'
  };
  
  const labelColors = {
    default: 'text-gray-700',
    success: 'text-green-700',
    warning: 'text-amber-700',
    info: 'text-blue-700',
    danger: 'text-red-700'
  };
  
  return (
    <div className={`rounded-lg p-2 border ${variants[variant]}`}>
      <p className={`text-xs font-semibold mb-1 ${labelColors[variant]}`}>{label}</p>
      {badges && badges.length > 0 ? (
        <QualifierBadges badges={badges} size="small" />
      ) : (
        <p className="text-xs text-gray-400">{emptyText}</p>
      )}
    </div>
  );
}

export default QualifierBadge;