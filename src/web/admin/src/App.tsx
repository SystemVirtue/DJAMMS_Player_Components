import React from 'react'
import { ConnectPlayerModal } from '@shared/ConnectPlayerModal'
import { AdminWindow } from '@components/admin/AdminWindow'

const AdminApp: React.FC = () => {
  return <AdminWindow />
}

export default function App() {
  return (
    <ConnectPlayerModal title="DJAMMS Web Admin Console">
      <AdminApp />
    </ConnectPlayerModal>
  )
}