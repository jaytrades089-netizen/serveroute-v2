import React, { useState, useEffect, useMemo } from 'react';
import { CheckCircle, ChevronDown, Clock, MapPin } from 'lucide-react';
import AddressCard from './AddressCard';

export default function AnimatedAddressList({
  addresses,
  attempts,
  routeId,
  onMessageBoss,
  lastAttemptMap,
  allAttemptsMap,
  editMode = false,
  route = null
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
    
    addresses.forEach(addr => {
      // Check if served/completed
      if (addr.served || addr.status === 'served' || addr.receipt_status === 'approved') {
        served.push(addr);
      } else {
        // Check if has a COMPLETED attempt today (not in_progress)
        const addressAttempts = attempts.filter(a => a.address_id === addr.id);
        const hasCompletedAttemptToday = addressAttempts.some(a => 
          a.status === 'completed' && new Date(a.attempt_time).toDateString() === today
        );
        
        if (hasCompletedAttemptToday) {
          attemptedToday.push(addr);
        } else {
          active.push(addr);
        }
      }
    });
    
    // Sort by order_index (original route order)
    const sortByOrder = (a, b) => (a.order_index || 999) - (b.order_index || 999);
    
    return {
      activeAddresses: active.sort(sortByOrder),
      attemptedTodayAddresses: attemptedToday.sort(sortByOrder),
      completedAddresses: served.sort(sortByOrder)
    };
  }, [addresses, attempts]);

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
            {activeAddresses.map((address, index) => (
              <div
                key={address.id}
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
            ))}
          </div>
        </div>
      )}

      {/* Attempted Today Section */}
      {attemptedTodayAddresses.length > 0 && (
        <div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
            <h2 className="text-sm font-bold text-amber-700 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              ATTEMPTED TODAY ({attemptedTodayAddresses.length})
            </h2>
            <p className="text-xs text-amber-600 mt-1">These addresses need another attempt on a different day</p>
          </div>
          
          <div className="space-y-4">
            {attemptedTodayAddresses.map((address, index) => (
              <div
                key={address.id}
                className={`
                  relative transition-all duration-300
                  ${animatingCardId === address.id ? 'animate-slide-out-right' : ''}
                  ${slidingUpCards.includes(address.id) ? 'animate-slide-up' : ''}
                  ${recentlyMovedId === address.id ? 'animate-slide-in-bottom' : ''}
                `}
              >
                {/* Order number badge - continues from active addresses */}
                <div className="absolute -top-2 -left-2 z-10 w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-sm shadow-lg border-2 border-white">
                  {activeAddresses.length + index + 1}
                </div>
                
                {/* Attempted Today Banner */}
                <div className="absolute -top-2 left-8 z-10">
                  <div className="bg-amber-500 text-white text-[10px] font-bold py-0.5 px-2 rounded-full flex items-center gap-1 animate-pulse-glow">
                    <Clock className="w-3 h-3" />
                    Attempted Today
                  </div>
                </div>
                
                <div className="pt-1 border-2 border-amber-300 rounded-2xl">
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
            ))}
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