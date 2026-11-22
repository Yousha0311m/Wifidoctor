// App.tsx | SignalFLoor | Root route registry for spatial RF mapping and Wi-Fi utilities

import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import Dashboard from '@/pages/Dashboard'
import FloorPlans from '@/pages/FloorPlans'
import Scans from '@/pages/Scans'
import Heatmap from '@/pages/Heatmap'
import Utilities from '@/pages/Utilities'

export default function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/floor-plans" element={<FloorPlans />} />
        <Route path="/scans" element={<Scans />} />
        <Route path="/heatmap" element={<Heatmap />} />
        <Route path="/reports" element={<Navigate to="/heatmap" replace />} />
        <Route path="/utilities" element={<Utilities />} />
      </Routes>
    </AppLayout>
  )
}
