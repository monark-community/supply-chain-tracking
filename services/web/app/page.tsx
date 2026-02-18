'use client';

import { useState } from 'react';
import { Nav } from '@/components/nav';
import { ProducerDashboard } from '@/components/dashboards/producer-dashboard';
import { TransporterDashboard } from '@/components/dashboards/transporter-dashboard';
import { ProcessorDashboard } from '@/components/dashboards/processor-dashboard';
import { CustomerDashboard } from '@/components/dashboards/customer-dashboard';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Role = 'producer' | 'transporter' | 'processor' | 'customer';

const ROLE_STORAGE_KEY = 'chainproof-role';

export default function Home() {
  const [role, setRole] = useState<Role>(() => {
    if (typeof window === 'undefined') {
      return 'producer';
    }
    const storedRole = window.localStorage.getItem(ROLE_STORAGE_KEY) as Role | null;
    return storedRole ?? 'producer';
  });

  const handleRoleChange = (value: string) => {
    const selectedRole = value as Role;
    setRole(selectedRole);
    window.localStorage.setItem(ROLE_STORAGE_KEY, selectedRole);
  };

  const renderDashboard = () => {
    switch (role) {
      case 'producer':
        return <ProducerDashboard />;
      case 'transporter':
        return <TransporterDashboard />;
      case 'processor':
        return <ProcessorDashboard />;
      case 'customer':
        return <CustomerDashboard />;
      default:
        return <ProducerDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex max-w-xs flex-col gap-2">
          <Label htmlFor="dashboard-role">Active dashboard</Label>
          <Select value={role} onValueChange={handleRoleChange}>
            <SelectTrigger id="dashboard-role" className="bg-white">
              <SelectValue placeholder="Select dashboard role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="producer">Producer</SelectItem>
              <SelectItem value="transporter">Transporter</SelectItem>
              <SelectItem value="processor">Processor</SelectItem>
              <SelectItem value="customer">Customer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {renderDashboard()}
      </main>
    </div>
  );
}
