// SurveyTab.tsx | Wi-Ma | Nearby networks, 2.4 GHz channel congestion and best-channel advisor from survey scans

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database, Radar, Radio, Wifi } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts'
import StatCard from '@/components/dashboard/StatCard'
import { Badge, Button, GlassCard } from '@/components/ui/Kit'
import { useScan } from '@/hooks/useScan'
import { CLEAN_CHANNELS, collectNetworks, findYourNetwork, scoreChannels } from '@/lib/channels'
import { levelBg, levelText, rssiToPercent, signalLevel } from '@/lib/signal'
import { toast } from '@/lib/toast'
import { loadDemoWorkspace } from '@/lib/workspace'

const axis = {
  stroke: 'var(--edge)',
  tick: { fill: 'var(--text-3)', fontSize: 11 },
  tickLine: false as const,
}
const tip = {
  contentStyle: {
    background: 'var(--glass-solid)',
    border: '1px solid var(--edge-strong)',
    borderRadius: 10,
    fontSize: 12,
  },
  labelStyle: { color: 'var(--text-3)' },
  itemStyle: { color: 'var(--text)' },
}

const loadColor = (load: number) => (load < 35 ? 'var(--strong)' : load < 65 ? 'var(--fair)' : 'var(--weak)')

export default function SurveyTab() {
  const navigate = useNavigate()
  const { points } = useScan()

  const nets = useMemo(() => collectNetworks(points), [points])
  const mine = useMemo(() => findYourNetwork(points, nets), [points, nets])
  const channels = useMemo(() => scoreChannels(nets, mine?.ssid ?? null), [nets, mine])

  if (nets.length === 0) {
    return (
      <>
        <GlassCard className="items-center text-center py-12">
          <Wifi size={36} className="text-[var(--text-2)] opacity-75 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-[var(--text)]">No nearby-network data yet</h2>
          <p className="text-sm text-[var(--text-2)] max-w-sm mx-auto mt-1 mb-4">
            Scan with the ESP32 and every scan records the networks around it. Switch the source on the Scans page,
            or load the demo to see how this page looks.
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <Button
              variant="primary"
              onClick={() => {
                const res = loadDemoWorkspace()
                toast(`Loaded ${res.rooms} rooms & ${res.points} sample scans.`, 'success')
              }}
            >
              <Database size={14} /> Load Demo Home
            </Button>
            <Button onClick={() => navigate('/scans')}>
              <Radar size={14} /> Go to Scans
            </Button>
          </div>
        </GlassCard>
      </>
    )
  }

  const best = channels.find(c => c.best)!
  const yours = channels.find(c => c.yours) ?? null
  const yourChannel = mine?.channel ?? null

  let advice: { tone: 'strong' | 'fair'; text: string }
  if (yourChannel === null) {
    advice = { tone: 'fair', text: `Channel ${best.channel} is the least crowded of 1, 6 and 11 right now.` }
  } else if (yourChannel === best.channel) {
    advice = { tone: 'strong', text: `Your network is already on the best channel (${best.channel}). No change needed.` }
  } else if (!CLEAN_CHANNELS.includes(yourChannel)) {
    advice = {
      tone: 'fair',
      text: `Your router is on channel ${yourChannel}, which overlaps its neighbours. Move it to channel ${best.channel}, the least crowded of 1, 6 and 11.`,
    }
  } else if (yours && best.load < yours.load - 5) {
    advice = {
      tone: 'fair',
      text: `Channel ${best.channel} is less crowded than your channel ${yourChannel} (${best.load}% vs ${yours.load}% load). Moving your router there should reduce interference.`,
    }
  } else {
    advice = { tone: 'strong', text: `Channel ${yourChannel} is about as clean as the best option (${best.channel}). No change needed.` }
  }

  const mix = (['strong', 'fair', 'weak'] as const).map(level => ({
    level,
    count: nets.filter(n => signalLevel(n.rssi) === level).length,
  }))
  const chartData = channels.map(c => ({ ...c, name: String(c.channel) }))
  const crowded = [...channels].sort((a, b) => b.load - a.load)[0]

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatCard label="Networks Seen" value={nets.length} sub={`${points.length} scan${points.length === 1 ? '' : 's'}`} icon={<Radio size={16} />} />
        <StatCard
          label="Your Network"
          value={mine?.ssid || '--'}
          unit={mine ? `${mine.avgRssi} dBm` : undefined}
          tone={mine ? signalLevel(mine.avgRssi) : 'neutral'}
          sub="Average over your scans"
          icon={<Wifi size={16} />}
        />
        <StatCard label="Your Channel" value={yourChannel ?? '--'} sub={yours ? `${yours.load}% crowded` : 'Not detected'} />
        <StatCard
          label="Best Channel"
          value={best.channel}
          tone="strong"
          sub={`${best.load}% crowded (of 1 / 6 / 11)`}
        />
      </div>

      <GlassCard eyebrow="Advisor" title="Channel Recommendation" icon={<Radio size={16} />} action={<Badge tone={advice.tone}>Ch {best.channel}</Badge>}>
        <p className="text-sm text-[var(--text-2)] leading-relaxed">{advice.text}</p>
        <p className="text-[11px] text-[var(--text-3)] border-t border-[var(--edge)] pt-3 mt-3">
          Only channels 1, 6 and 11 are recommended because they do not overlap each other. Load counts neighbouring
          networks on the same and nearby channels, weighted by how strong they are. Your own router is not counted against itself.
        </p>
      </GlassCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 items-start">
        <GlassCard eyebrow="Spectrum" title="Channel Congestion" sub={`Most crowded: channel ${crowded.channel}`}>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="var(--edge)" vertical={false} />
                <XAxis dataKey="name" {...axis} interval={0} />
                <YAxis domain={[0, 100]} {...axis} unit="%" />
                <Tooltip
                  {...tip}
                  cursor={{ fill: 'var(--glass-2)' }}
                  formatter={(v, _n, item) => [`${v}% load · ${item.payload.networks} on this channel`, `Channel ${item.payload.channel}`]}
                  labelFormatter={() => ''}
                />
                <Bar dataKey="load" isAnimationActive={false} radius={[5, 5, 0, 0]}>
                  {chartData.map(c => (
                    <Cell
                      key={c.channel}
                      fill={loadColor(c.load)}
                      stroke={c.best ? 'var(--text)' : c.yours ? 'var(--accent-2)' : 'none'}
                      strokeWidth={c.best || c.yours ? 2 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-[var(--text-3)] mt-2">
            White outline = best channel{yourChannel !== null ? ` · coloured outline = your channel (${yourChannel})` : ''}
          </p>
        </GlassCard>

        <GlassCard eyebrow="Neighbourhood" title="Signal Strength of Nearby Networks">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mix} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="var(--edge)" vertical={false} />
                <XAxis dataKey="level" {...axis} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip {...tip} cursor={{ fill: 'var(--glass-2)' }} />
                <Bar dataKey="count" name="Networks" isAnimationActive={false} radius={[5, 5, 0, 0]}>
                  {mix.map(d => (
                    <Cell key={d.level} fill={`var(--${d.level})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-[var(--text-3)] mt-2">
            Strong is above -50 dBm, weak is below -67 dBm. Many strong neighbours means more interference for you.
          </p>
        </GlassCard>
      </div>

      <GlassCard eyebrow="Scan Results" title={`Nearby Networks (${nets.length})`}>
        <ul className="flex flex-col gap-2.5">
          {nets.slice(0, 15).map(n => {
            const lvl = signalLevel(n.rssi)
            const isMine = mine?.ssid !== undefined && n.ssid === mine.ssid
            return (
              <li key={n.bssid || `${n.ssid}-${n.channel}`}>
                <div className="flex items-center justify-between gap-3 text-xs mb-1">
                  <span className="text-[var(--text)] font-medium truncate">
                    {n.ssid || '(hidden network)'}
                    {isMine && <span className="chip ml-2 !h-[18px]">yours</span>}
                  </span>
                  <span className="flex items-center gap-2 shrink-0 font-mono">
                    <span className="text-[var(--text-3)]">ch {n.channel}</span>
                    <span className={levelText[lvl]}>{n.rssi} dBm</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className={`h-full rounded-full ${levelBg[lvl]}`} style={{ width: `${rssiToPercent(n.rssi)}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
        {nets.length > 15 && (
          <p className="text-[11px] text-[var(--text-3)] mt-3">Showing the 15 strongest of {nets.length}.</p>
        )}
      </GlassCard>
    </>
  )
}
