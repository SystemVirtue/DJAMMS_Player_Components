import React from 'react'
import { ConnectPlayerModal } from '@shared/ConnectPlayerModal'
import { UnifiedAdmin } from '@components/admin/UnifiedAdmin'

const AdminApp: React.FC = () => {
  return <UnifiedAdmin />
}

export default function App() {
  return (
    <ConnectPlayerModal title="DJAMMS Web Admin Console">
      <AdminApp />
    </ConnectPlayerModal>
  )
}