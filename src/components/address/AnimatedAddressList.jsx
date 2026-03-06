import React, { useState, useEffect, useMemo } from 'react';
import { CheckCircle, ChevronDown, Clock, MapPin } from 'lucide-react';
import AddressCard from './AddressCard';
import { getNeededQualifiers } from '@/components/services/QualifierService';

// Zone divider component - non-interactive label row
function ZoneDivider({ label }) {
  return (
    <div className="flex items-center gap-3 py-2 px-1">
      <div className="flex-1 h-px bg-gray-300" />
      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-gray-300" />
    </div>
  );
}

export default function AnimatedAddressList({
  addresses,
  attempts,
  routeId,
  onMessageBoss,
  lastAttemptMap,
  allAttemptsMap,
  editMode = false,
  route = null,
  showZoneLabels = true
}) {
  // Animation state
  const [animatingCardId, setAnimatingCardId] = useState(null);
  const [slidingUpCards, setSlidingUpCards] = useState([]);
  const [recentlyMovedId, setRecentlyMovedId] = useState(null);
  const [showCompletedDropdown, setShowCompletedDropdown] = useState(false);
  
  // Track which address should have flashing nav button (next to complete)
  const [highlightedAddressId, setHighlightedAddressId] = useState(null);

  // Categorize addresses into sections
  const { activeAddresses, attemptedTodayAddresses, completedAddresses } = useMemo(() => {
    const today = new Date().toDateString();
    
    const served = [];
    const attemptedToday = [];
    const active = [];
    
    // Get route requirements (default to AM + PM + WEEKEND)
    const requiredAttempts = route?.required_attempts || 3;
    const minimumDaysSpread = route?.minimum_days_spread || 10;
    
    addresses.forEach(addr => {
      // Check if served/completed
      if (addr.served || addr.status === 'served' || addr.status === 'returned' || addr.receipt_status === 'approved') {
        served.push(addr);
      } else {
        // Get attempts for this address
        const addressAttempts = attempts.filter(a => a.address_id === addr.id && a.status === 'completed');
        
        // Check if qualifiers are complete using getNeededQualifiers
        const qualifierStatus = getNeededQualifiers(addressAttempts);
        
        // Check spread requirement (first to last attempt >= minimum_days_spread)
        // Use calendar days (date difference) not exact milliseconds
        const spreadMet = (() => {
          if (addressAttempts.length < 2) return false;
          const attemptDates = addressAttempts.map(a => {
            const d = new Date(a.attempt_time);
            return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
          });
          const firstDate = Math.min(...attemptDates);
          const lastDate = Math.max(...attemptDates);
          const daysDiff = (lastDate - firstDate) / (1000 * 60 * 60 * 24);
          return daysDiff >= minimumDaysSpread;
        })();
        
        // Address is "ready for turn-in" if:
        // 1. All qualifiers are met (AM + PM + WEEKEND), AND
        // 2. Has at least required_attempts attempts, AND
        // 3. Spread requirement is met (10+ days between first and last attempt)
        const qualifiersComplete = qualifierStatus.isComplete;
        const hasEnoughAttempts = addressAttempts.length >= requiredAttempts;
        const isReadyForTurnIn = qualifiersComplete && hasEnoughAttempts && spreadMet;
        
        if (isReadyForTurnIn) {
          // This address has met ALL requirements - keep in attemptedToday with special flag
          addr._requirementsMet = true;
          attemptedToday.push(addr);
        } else {
          // Check if has a COMPLETED attempt today (not in_progress)
          const hasCompletedAttemptToday = addressAttempts.some(a => 
            new Date(a.attempt_time).toDateString() === today
          );
          
          if (hasCompletedAttemptToday) {
            attemptedToday.push(addr);
          } else {
            active.push(addr);
          }
        }
      }
    });
    
    // Sort attemptedToday: requirements met addresses first, then by spread due
    attemptedToday.sort((a, b) => {
      if (a._requirementsMet && !b._requirementsMet) return -1;
      if (!a._requirementsMet && b._requirementsMet) return 1;
      return 0;
    });
    
    // Sort by spread due date (first attempt date + spread days)
    // Addresses with earlier spread due dates come first
    const sortBySpreadDue = (a, b) => {
      // Get first attempt dates for each address
      const aAttempts = attempts.filter(att => att.address_id === a.id && att.status === 'completed');
      const bAttempts = attempts.filter(att => att.address_id === b.id && att.status === 'completed');
      
      const aFirstAttempt = aAttempts.length > 0 
        ? Math.min(...aAttempts.map(att => new Date(att.attempt_time).getTime()))
        : null;
      const bFirstAttempt = bAttempts.length > 0 
        ? Math.min(...bAttempts.map(att => new Date(att.attempt_time).getTime()))
        : null;
      
      // Get spread days from route
      const spreadDays = route?.minimum_days_spread || 14;
      
      // Calculate spread due dates
      const aSpreadDue = aFirstAttempt ? aFirstAttempt + (spreadDays * 24 * 60 * 60 * 1000) : Infinity;
      const bSpreadDue = bFirstAttempt ? bFirstAttempt + (spreadDays * 24 * 60 * 60 * 1000) : Infinity;
      
      // Sort by spread due date (earliest first)
      // If no attempts, fall back to order_index
      if (aSpreadDue === Infinity && bSpreadDue === Infinity) {
        return (a.order_index || 999) - (b.order_index || 999);
      }
      
      return aSpreadDue - bSpreadDue;
    };
    
    // Sort by order_index for original route order (fallback)
    const sortByOrder = (a, b) => (a.order_index || 999) - (b.order_index || 999);
    
    return {
      activeAddresses: active.sort(sortBySpreadDue),
      attemptedTodayAddresses: attemptedToday.sort(sortBySpreadDue),
      completedAddresses: served.sort(sortByOrder)
    };
  }, [addresses, attempts, route?.minimum_days_spread]);

  // Handle when an attempt is logged (card moves to "attempted today")
  const handleAttemptLogged = async (addressId) => {
    if (!addressId) {
      console.warn('handleAttemptLogged called without addressId');
      return;
    }
    
    // Find the card in active addresses
    const currentIndex = activeAddresses.findIndex(a => a.id === addressId);
    
    if (currentIndex === -1) {
      // Card not in active list - might already be in attempted today
      console.log('Address not in active list, skipping animation');
      return;
    }
    
    try {
      // Trigger slide-out animation
      setAnimatingCardId(addressId);
      
      // Find cards below this one that need to slide up
      const cardsBelow = activeAddresses.slice(currentIndex + 1).map(a => a.id);
      setSlidingUpCards(cardsBelow);
      
      // Wait for animation to complete
      await new Promise(resolve => setTimeout(resolve, 400));
      
      // Mark as recently moved for slide-in animation
      setRecentlyMovedId(addressId);
      
    } catch (error) {
      console.error('Animation error:', error);
    } finally {
      // Always reset animation states
      setAnimatingCardId(null);
      setSlidingUpCards([]);
      
      // Clear recently moved after animation
      setTimeout(() => setRecentlyMovedId(null), 500);
    }
  };

  // Handle when an address is served/finalized
  const handleAddressServed = async (addressId) => {
    // Trigger slide-out animation
    setAnimatingCardId(addressId);
    
    // Find cards below this one in both sections
    const allVisibleCards = [...activeAddresses, ...attemptedTodayAddresses];
    const currentIndex = allVisibleCards.findIndex(a => a.id === addressId);
    if (currentIndex >= 0) {
      const cardsBelow = allVisibleCards.slice(currentIndex + 1).map(a => a.id);
      setSlidingUpCards(cardsBelow);
    }
    
    // Wait for animation
    await new Promise(resolve => setTimeout(resolve, 400));
    
    // Reset animation states
    setAnimatingCardId(null);
    setSlidingUpCards([]);
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Highlight next address after a short delay
    setTimeout(() => {
      // Find next active address to highlight
      const remainingActive = activeAddresses.filter(a => a.id !== addressId);
      if (remainingActive.length > 0) {
        setHighlightedAddressId(remainingActive[0].id);
      } else if (attemptedTodayAddresses.length > 0) {
        // If no active, highlight first attempted today
        const remainingAttempted = attemptedTodayAddresses.filter(a => a.id !== addressId);
        if (remainingAttempted.length > 0) {
          setHighlightedAddressId(remainingAttempted[0].id);
        }
      }
    }, 500);
  };
  
  // Set initial highlighted address (first active address) on mount
  useEffect(() => {
    if (activeAddresses.length > 0) {
      setHighlightedAddressId(activeAddresses[0].id);
    } else if (attemptedTodayAddresses.length > 0) {
      setHighlightedAddressId(attemptedTodayAddresses[0].id);
    }
  }, [activeAddresses.length, attemptedTodayAddresses.length]);

  return (
    <div className="space-y-6">
      {/* Active Addresses - TO DO */}
      {activeAddresses.length > 0 && (
        <div>
          <div className="space-y-4">
            {activeAddresses.map((address, index) => {
              // Check if this address starts a new zone
              const prevAddress = index > 0 ? activeAddresses[index - 1] : null;
              const showZoneDivider = showZoneLabels && 
                address.zone_label && 
                (!prevAddress || prevAddress.zone_label !== address.zone_label);
              
              return (
                <React.Fragment key={address.id}>
                  {/* Zone divider - appears before first address of each zone */}
                  {showZoneDivider && (
                    <ZoneDivider label={address.zone_label} />
                  )}
                  <div
                    className={`
                      relative transition-all duration-300
                      ${animatingCardId === address.id ? 'animate-slide-out-right' : ''}
                      ${slidingUpCards.includes(address.id) ? 'animate-slide-up' : ''}
                    `}
                  >
                    {/* Order number badge - use visual position (index + 1) */}
                    <div className="absolute -top-2 -left-2 z-10 w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-sm shadow-lg border-2 border-white">
                      {index + 1}
                    </div>
                    <AddressCard
                      address={address}
                      routeId={routeId}
                      showActions={true}
                      onMessageBoss={onMessageBoss}
                      lastAttempt={lastAttemptMap[address.id]}
                      allAttempts={allAttemptsMap[address.id] || []}
                      onAttemptLogged={() => handleAttemptLogged(address.id)}
                      onServed={() => handleAddressServed(address.id)}
                      editMode={editMode}
                      isHighlighted={highlightedAddressId === address.id}
                    />
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Attempted Today / Ready for Decision Section */}
      {attemptedTodayAddresses.length > 0 && (
        <div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
            <h2 className="text-sm font-bold text-amber-700 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              ATTEMPTED TODAY / READY ({attemptedTodayAddresses.length})
            </h2>
            <p className="text-xs text-amber-600 mt-1">Attempted today or all qualifiers complete — ready for serve/RTO decision</p>
          </div>
          
          <div className="space-y-4">
            {attemptedTodayAddresses.map((address, index) => {
              const isRequirementsMet = address._requirementsMet;
              
              return (
              <div
                key={address.id}
                className={`
                  relative transition-all duration-300
                  ${animatingCardId === address.id ? 'animate-slide-out-right' : ''}
                  ${slidingUpCards.includes(address.id) ? 'animate-slide-up' : ''}
                  ${recentlyMovedId === address.id ? 'animate-slide-in-bottom' : ''}
                `}
              >
                {/* Order number badge - green if requirements met */}
                <div className={`absolute -top-2 -left-2 z-10 w-8 h-8 rounded-full text-white flex items-center justify-center font-bold text-sm shadow-lg border-2 border-white ${
                  isRequirementsMet ? 'bg-green-500' : 'bg-amber-500'
                }`}>
                  {activeAddresses.length + index + 1}
                </div>
                
                {/* Status Banner */}
                <div className="absolute -top-2 left-8 z-10">
                  {isRequirementsMet ? (
                    <div className="bg-green-500 text-white text-[10px] font-bold py-0.5 px-2 rounded-full flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      READY FOR TURN-IN
                    </div>
                  ) : (
                    <div className="bg-amber-500 text-white text-[10px] font-bold py-0.5 px-2 rounded-full flex items-center gap-1 animate-pulse-glow">
                      <Clock className="w-3 h-3" />
                      Attempted Today
                    </div>
                  )}
                </div>
                
                <div className={`pt-1 border-2 rounded-2xl ${
                  isRequirementsMet ? 'border-green-400 bg-green-50/50' : 'border-amber-300'
                }`}>
                  <AddressCard
                    address={address}
                    routeId={routeId}
                    showActions={true}
                    onMessageBoss={onMessageBoss}
                    lastAttempt={lastAttemptMap[address.id]}
                    allAttempts={allAttemptsMap[address.id] || []}
                    onAttemptLogged={() => handleAttemptLogged(address.id)}
                    onServed={() => handleAddressServed(address.id)}
                    isAttemptedToday={true}
                    editMode={editMode}
                    isHighlighted={highlightedAddressId === address.id}
                  />
                </div>
              </div>
            );
            })}
          </div>
        </div>
      )}

      {/* Completed Dropdown Section */}
      {completedAddresses.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompletedDropdown(!showCompletedDropdown)}
            className="w-full bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between hover:bg-green-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div className="text-left">
                <h2 className="font-semibold text-green-700">
                  COMPLETED ({completedAddresses.length})
                </h2>
                <p className="text-xs text-green-600">Tap to view served addresses</p>
              </div>
            </div>
            <ChevronDown className={`w-6 h-6 text-green-500 transition-transform duration-300 ${
              showCompletedDropdown ? 'rotate-180' : ''
            }`} />
          </button>
          
          {/* Dropdown Content */}
          {showCompletedDropdown && (
            <div className="mt-3 space-y-4 animate-fade-in">
              {completedAddresses.map((address) => (
                <div key={address.id} className="relative">
                  {/* Order number badge */}
                  <div className="absolute -top-2 -left-2 z-10 w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center font-bold text-sm shadow-lg border-2 border-white">
                    {address.order_index || '?'}
                  </div>
                  
                  {/* Served Banner */}
                  <div className="absolute -top-2 left-8 z-10">
                    <div className="bg-green-500 text-white text-[10px] font-bold py-0.5 px-2 rounded-full flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Served
                    </div>
                  </div>
                  
                  <div className="pt-1 opacity-75 border-2 border-green-300 rounded-2xl">
                    <AddressCard
                      address={address}
                      routeId={routeId}
                      showActions={false}
                      onMessageBoss={onMessageBoss}
                      lastAttempt={lastAttemptMap[address.id]}
                      allAttempts={allAttemptsMap[address.id] || []}
                      isCompleted={true}
                      editMode={editMode}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {activeAddresses.length === 0 && attemptedTodayAddresses.length === 0 && completedAddresses.length === 0 && (
        <div className="bg-gray-100 rounded-xl p-6 text-center">
          <MapPin className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">No addresses in this route</p>
        </div>
      )}
    </div>
  );
}