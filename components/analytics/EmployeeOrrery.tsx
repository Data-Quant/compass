'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useMemo } from 'react'
import {
  buildOrreryPoints,
  polygonPath,
  averagePolygonPath,
  unionLensOrder,
  MAX_LENS_SCORE,
} from '@/lib/analytics/employee-360'
import { RELATIONSHIP_TYPE_LABELS, type RelationshipType } from '@/types'

/** Short labels: the full relationship names are far too long to ring a circle. */
const LENS_SHORT: Record<string, string> = {
  TEAM_LEAD: 'Lead',
  PEER: 'Peer',
  HR: 'HR',
  DEPT: 'Dept',
  DIRECT_REPORT: 'Reports',
  C_LEVEL: 'C-Level',
  CROSS_DEPARTMENT: 'Cross-Dept',
}

interface OrreryClient {
  id: string
  name: string
  role: 'MANAGER' | 'MEMBER'
}

interface EmployeeOrreryProps {
  name: string
  perLens: Partial<Record<RelationshipType, number>>
  orgPerLensAverage: Partial<Record<RelationshipType, number>>
  overallScore: number | null
  clients: OrreryClient[]
  /** A second subject overlaid on the same axes for direct comparison. */
  compare?: { name: string; perLens: Partial<Record<RelationshipType, number>> } | null
  /** Scale factor, so the same component works as a hero and as a thumbnail. */
  size?: number
}

const SIZE = 600
const CENTRE = SIZE / 2
const INNER_RADIUS = 58
const OUTER_RADIUS = 170
/** Lens readings sit just outside the graticule... */
const LENS_LABEL_RADIUS = 196
/** ...and clients orbit well clear of them, or the two sets of text collide. */
const CLIENT_RADIUS = 252

export function EmployeeOrrery({
  name,
  perLens,
  orgPerLensAverage,
  overallScore,
  clients,
  compare = null,
  size = SIZE,
}: EmployeeOrreryProps) {
  const reduceMotion = useReducedMotion()

  // Both subjects plot against one axis list, or the outlines would sit at
  // different bearings and the overlay would compare nothing.
  const axes = useMemo(
    () => (compare ? unionLensOrder(perLens, compare.perLens) : unionLensOrder(perLens)),
    [perLens, compare]
  )

  const points = useMemo(
    () =>
      buildOrreryPoints({
        perLens,
        orgAverage: orgPerLensAverage,
        innerRadius: INNER_RADIUS,
        outerRadius: OUTER_RADIUS,
        lensOrder: axes,
      }),
    [perLens, orgPerLensAverage, axes]
  )

  const comparePoints = useMemo(
    () =>
      compare
        ? buildOrreryPoints({
            perLens: compare.perLens,
            innerRadius: INNER_RADIUS,
            outerRadius: OUTER_RADIUS,
            lensOrder: axes,
          })
        : [],
    [compare, axes]
  )

  const comparePath = useMemo(() => polygonPath(comparePoints), [comparePoints])

  const scorePath = useMemo(() => polygonPath(points), [points])
  const averagePath = useMemo(() => averagePolygonPath(points), [points])

  // Clients ride an outer orbit, spaced evenly and starting opposite the first
  // lens so the two rings do not collide visually.
  const clientPoints = useMemo(
    () =>
      clients.map((client, index) => {
        const angle = -Math.PI / 2 + ((index + 0.5) / Math.max(clients.length, 1)) * Math.PI * 2
        return {
          ...client,
          x: Math.cos(angle) * CLIENT_RADIUS,
          y: Math.sin(angle) * CLIENT_RADIUS,
        }
      }),
    [clients]
  )

  const initials = name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')

  // Each arrival is a real measurement landing, so the sequence carries meaning
  // rather than being decoration. Honoured only when motion is welcome.
  const step = reduceMotion ? 0 : 0.14

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={{ maxWidth: size }}
      className="w-full mx-auto overflow-visible"
      role="img"
      aria-label={`Evaluation orbit for ${name}. ${points
        .map((point) => `${LENS_SHORT[point.lens] ?? point.lens} ${point.score.toFixed(2)} out of 4`)
        .join('. ')}`}
    >
      <defs>
        <radialGradient id="orrery-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#E8C25A" stopOpacity="0.30" />
          <stop offset="70%" stopColor="#C9A227" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#C9A227" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="orrery-shape" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E8C25A" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#7FB2D9" stopOpacity="0.22" />
        </linearGradient>
      </defs>

      <g transform={`translate(${CENTRE}, ${CENTRE})`}>
        {/* Graticule: one ring per whole rating point, so radius is readable. */}
        {[1, 2, 3, 4].map((tick, index) => (
          <motion.circle
            key={tick}
            r={INNER_RADIUS + (tick / MAX_LENS_SCORE) * (OUTER_RADIUS - INNER_RADIUS)}
            fill="none"
            stroke="#E9E4D6"
            strokeOpacity={tick === MAX_LENS_SCORE ? 0.22 : 0.09}
            strokeWidth={0.75}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * step * 0.4, duration: reduceMotion ? 0 : 0.5 }}
          />
        ))}

        {/* Spokes, drawn under everything so labels stay legible. */}
        {points.map((point, index) => (
          <motion.line
            key={`spoke-${point.lens}`}
            x1={0}
            y1={0}
            x2={Math.cos(point.angle) * OUTER_RADIUS}
            y2={Math.sin(point.angle) * OUTER_RADIUS}
            stroke="#E9E4D6"
            strokeOpacity={0.07}
            strokeWidth={0.75}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.2 + index * step * 0.3, duration: reduceMotion ? 0 : 0.4 }}
          />
        ))}

        {/* The org average, dashed. Present only when every lens has one. */}
        {averagePath && (
          <motion.path
            d={averagePath}
            fill="none"
            stroke="#9AA3B2"
            strokeOpacity={0.55}
            strokeWidth={1.25}
            strokeDasharray="5 4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45, duration: reduceMotion ? 0 : 0.6 }}
          />
        )}

        {/* The comparison subject, in cool blue so the two never read as one. */}
        {comparePath && (
          <motion.path
            d={comparePath}
            fill="#7FB2D9"
            fillOpacity={0.12}
            stroke="#7FB2D9"
            strokeWidth={1.5}
            strokeLinejoin="round"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: reduceMotion ? 0 : 0.7, ease: [0.16, 1, 0.3, 1] }}
          />
        )}
        {comparePoints.map((point) => (
          <circle key={`cmp-${point.lens}`} cx={point.x} cy={point.y} r={3.5} fill="#7FB2D9" />
        ))}

        {/* The person's own shape. A regular outline means the groups agree. */}
        {scorePath && (
          <motion.path
            d={scorePath}
            fill="url(#orrery-shape)"
            stroke="#E8C25A"
            strokeWidth={1.75}
            strokeLinejoin="round"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              delay: 0.55,
              duration: reduceMotion ? 0 : 0.8,
              ease: [0.16, 1, 0.3, 1],
            }}
          />
        )}

        {/* Lens readings, arriving one at a time. */}
        {points.map((point, index) => {
          const lx = Math.cos(point.angle) * LENS_LABEL_RADIUS
          const ly = Math.sin(point.angle) * LENS_LABEL_RADIUS
          const anchor = Math.abs(lx) < 12 ? 'middle' : lx > 0 ? 'start' : 'end'

          return (
            <motion.g
              key={point.lens}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 + index * step, duration: reduceMotion ? 0 : 0.45 }}
            >
              <motion.circle
                cx={point.x}
                cy={point.y}
                r={5}
                fill="#E8C25A"
                initial={{ cx: 0, cy: 0 }}
                animate={{ cx: point.x, cy: point.y }}
                transition={{
                  delay: 0.7 + index * step,
                  duration: reduceMotion ? 0 : 0.7,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
              <text
                x={lx}
                y={ly - 4}
                textAnchor={anchor}
                className="fill-[#9AA3B2] text-[10px] uppercase"
                style={{ letterSpacing: '0.14em' }}
              >
                {LENS_SHORT[point.lens] ?? RELATIONSHIP_TYPE_LABELS[point.lens]}
              </text>
              <text
                x={lx}
                y={ly + 12}
                textAnchor={anchor}
                className="fill-[#E9E4D6] text-[15px] font-semibold"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {point.score.toFixed(2)}
              </text>
            </motion.g>
          )
        })}

        {/* Clients on the outer orbit; filled marks the ones they lead. */}
        {!compare && clientPoints.map((client, index) => (
          <motion.g
            key={client.id}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              delay: 0.7 + points.length * step + index * step * 0.6,
              duration: reduceMotion ? 0 : 0.5,
            }}
          >
            <circle
              cx={client.x}
              cy={client.y}
              r={4.5}
              fill={client.role === 'MANAGER' ? '#7FB2D9' : 'transparent'}
              stroke="#7FB2D9"
              strokeWidth={1.25}
            />
            <text
              x={client.x}
              y={client.y + (client.y > 0 ? 18 : -11)}
              textAnchor="middle"
              className="fill-[#7FB2D9] text-[10px]"
              style={{ letterSpacing: '0.06em' }}
            >
              {client.name}
            </text>
          </motion.g>
        ))}

        {/* The person at the centre. */}
        <circle r={INNER_RADIUS - 6} fill="url(#orrery-core)" />
        <motion.g
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <circle r={INNER_RADIUS - 14} fill="#0D1424" stroke="#C9A227" strokeOpacity={0.5} strokeWidth={1} />
          <text
            textAnchor="middle"
            y={-4}
            className="fill-[#E9E4D6] text-[26px]"
            style={{ fontFamily: 'var(--font-display, Instrument Serif), Georgia, serif' }}
          >
            {initials}
          </text>
          <text
            textAnchor="middle"
            y={20}
            className="fill-[#E8C25A] text-[15px] font-semibold"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {overallScore === null ? '—' : `${overallScore.toFixed(0)}%`}
          </text>
        </motion.g>
      </g>
    </svg>
  )
}
