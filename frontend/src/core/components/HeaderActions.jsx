import React from 'react';
import NotificationBell from './NotificationBell.jsx';
import './HeaderActions.css';

export default function HeaderActions({
  onNavigateTab,
}) {
  return (
    <div className="header-actions-wrapper">
      <NotificationBell onNavigateTab={onNavigateTab} />
    </div>
  );
}


