'use client'

import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, OrbitControls, Text } from '@react-three/drei'
import { Vector3, type Mesh } from 'three'
import type { TalentGridEntry } from '@/lib/analytics/talent-grid'
import type { NameResolver } from '@/components/analytics/types'

const CUBE_SIZE = 10

/**
 * Matches the 2D grid's band colors so the two views read as one system.
 * Validated for colorblind separation (worst adjacent pair dE 30.5 deutan).
 */
const BAND_COLORS: Record<string, string> = {
  HIGH: '#21c45d',
  MID: '#3c83f6',
  LOW: '#dc2828',
}

/** Momentum beyond this many points is clamped to the cube edge. */
const MOMENTUM_CLAMP = 20

interface TalentCubeProps {
  entries: TalentGridEntry[]
  resolveName: NameResolver
  onSelect: (employeeId: string) => void
}

interface Placed {
  entry: TalentGridEntry
  position: [number, number, number]
  color: string
  name: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function PersonDot({
  placed,
  isHovered,
  onHover,
  onSelect,
}: {
  placed: Placed
  isHovered: boolean
  onHover: (employeeId: string | null) => void
  onSelect: (employeeId: string) => void
}) {
  const meshRef = useRef<Mesh>(null)
  const hoverScale = useRef(new Vector3(1.8, 1.8, 1.8))
  const restScale = useRef(new Vector3(1, 1, 1))

  useFrame(() => {
    if (!meshRef.current) return
    // Ease toward the target scale rather than snapping.
    meshRef.current.scale.lerp(isHovered ? hoverScale.current : restScale.current, 0.15)
  })

  return (
    <mesh
      ref={meshRef}
      position={placed.position}
      onPointerOver={(event) => {
        event.stopPropagation()
        onHover(placed.entry.employeeId)
      }}
      onPointerOut={() => onHover(null)}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(placed.entry.employeeId)
      }}
    >
      <sphereGeometry args={[0.18, 24, 24]} />
      <meshStandardMaterial
        color={placed.color}
        emissive={placed.color}
        emissiveIntensity={isHovered ? 0.6 : 0.15}
        roughness={0.35}
      />
      {isHovered && (
        <Html distanceFactor={12} position={[0, 0.45, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground shadow-lg">
            <div className="font-semibold">{placed.name}</div>
            <div>{placed.entry.performanceScore.toFixed(1)}%</div>
            <div>
              {placed.entry.momentumDelta === null
                ? 'no prior period'
                : `${placed.entry.momentumDelta > 0 ? '+' : ''}${placed.entry.momentumDelta.toFixed(1)} pts`}
            </div>
            <div>
              consensus{' '}
              {placed.entry.consensus === null
                ? 'n/a'
                : `${(placed.entry.consensus * 100).toFixed(0)}%`}
            </div>
            <div className="text-muted-foreground">click for 360 radar</div>
          </div>
        </Html>
      )}
    </mesh>
  )
}

function AxisLabel({ position, label }: { position: [number, number, number]; label: string }) {
  return (
    <Text position={position} fontSize={0.45} color="#94a3b8" anchorX="center" anchorY="middle">
      {label}
    </Text>
  )
}

export default function TalentCube({ entries, resolveName, onSelect }: TalentCubeProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const placed = useMemo<Placed[]>(
    () =>
      entries
        .filter((entry) => !entry.isNew)
        .map((entry) => {
          const half = CUBE_SIZE / 2
          // X: momentum, clamped so outliers stay inside the cube.
          const x =
            (clamp(entry.momentumDelta ?? 0, -MOMENTUM_CLAMP, MOMENTUM_CLAMP) / MOMENTUM_CLAMP) *
            half
          // Y: performance 0-100 mapped across the cube height.
          const y = (entry.performanceScore / 100) * CUBE_SIZE - half
          // Z: consensus 0-1; null (too few lenses) sits at the neutral centre.
          const z = entry.consensus === null ? 0 : entry.consensus * CUBE_SIZE - half

          return {
            entry,
            position: [x, y, z] as [number, number, number],
            color: BAND_COLORS[entry.performanceBand],
            name: resolveName(entry.employeeId),
          }
        }),
    [entries, resolveName]
  )

  return (
    <div className="h-[520px] w-full rounded-lg bg-gradient-to-b from-slate-950 to-slate-900">
      <Canvas camera={{ position: [12, 8, 14], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 12, 8]} intensity={1.1} />

        <mesh>
          <boxGeometry args={[CUBE_SIZE, CUBE_SIZE, CUBE_SIZE]} />
          <meshBasicMaterial color="#1e293b" wireframe transparent opacity={0.35} />
        </mesh>

        <AxisLabel position={[0, -CUBE_SIZE / 2 - 0.9, CUBE_SIZE / 2]} label="Momentum →" />
        <AxisLabel position={[-CUBE_SIZE / 2 - 0.9, 0, CUBE_SIZE / 2]} label="Performance ↑" />
        <AxisLabel position={[CUBE_SIZE / 2 + 0.9, -CUBE_SIZE / 2 - 0.9, 0]} label="Consensus" />

        {placed.map((entry) => (
          <PersonDot
            key={entry.entry.employeeId}
            placed={entry}
            isHovered={hoveredId === entry.entry.employeeId}
            onHover={setHoveredId}
            onSelect={onSelect}
          />
        ))}

        <OrbitControls
          enablePan={false}
          minDistance={8}
          maxDistance={30}
          autoRotate={!hoveredId}
          autoRotateSpeed={0.4}
        />
      </Canvas>
      <p className="sr-only">
        Interactive 3D talent cube plotting performance against momentum and evaluator consensus. A
        two-dimensional grid with the same data is available via the 2D toggle.
      </p>
    </div>
  )
}
