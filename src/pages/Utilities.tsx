// Utilities.tsx | Wi-Ma | Wi-Fi utilities: always-on monitoring from the ESP32, plus survey-based channel advice

import { useState } from 'react'
import { Activity, Radar } from 'lucide-react'
import { Segmented, type SegOption } from '@/components/ui/Kit'
import MonitorTab from '@/pages/utilities/MonitorTab'
import SurveyTab from '@/pages/utilities/SurveyTab'

type Tab = 'monitor' | 'survey'
const TABS: SegOption<Tab>[] = [
  { value: 'monitor', label: 'Monitor', icon: <Activity size={13} /> },
  { value: 'survey', label: 'Survey', icon: <Radar size={13} /> },
]

const KEY = 'wima.utilities.tab'
function loadTab(): Tab {
  try {
    return localStorage.getItem(KEY) === 'survey' ? 'survey' : 'monitor'
  } catch {
    return 'monitor'
  }
}

export default function Utilities() {
  const [tab, setTab] = useState<Tab>(loadTab)

  const pick = (t: Tab) => {
    setTab(t)
    try {
      localStorage.setItem(KEY, t)
    } catch {
      // remembering the tab is optional
    }
  }

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Wi-Fi Utilities</h1>
          <p>
            {tab === 'monitor'
              ? 'Leave the board plugged in near your router and see how your Wi-Fi behaves over time.'
              : 'Nearby networks, channel congestion and the best channel, from your survey scans.'}
          </p>
        </div>
        <Segmented options={TABS} value={tab} onChange={pick} />
      </div>

      {tab === 'monitor' ? <MonitorTab /> : <SurveyTab />}
    </>
  )
}
