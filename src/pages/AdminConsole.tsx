// src/pages/AdminConsole.tsx
import React from 'react';
import { AdminWindow } from '../components/admin/AdminWindow';

interface AdminConsoleProps {
  className?: string;
}

export const AdminConsole: React.FC<AdminConsoleProps> = ({ className = '' }) => {
  // Use the admin window component for consistent functionality across platforms
  return (
    <div className={className}>
      <AdminWindow />
    </div>
  );
};
