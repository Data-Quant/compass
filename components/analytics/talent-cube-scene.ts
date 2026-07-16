/**
 * Vanilla three.js scene for the Talent Cube. Deliberately contains NO React.
 *
 * The previous cube used @react-three/fiber, which renders through
 * react-reconciler and reads React's private internals key. Next 15's App
 * Router vendors React 19 while this app declares React 18, so that read
 * returned undefined and threw at chunk init. three.js itself has zero
 * dependencies and no React coupling, so driving it imperatively from a
 * useEffect sidesteps that entire class of failure.
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { TalentGridEntry } from '@/lib/analytics/talent-grid'

/**
 * Hex equivalents of the 2D grid's BAND_COLORS (hsl(142 71% 45%) etc). THREE.Color
 * cannot parse space-separated modern CSS hsl(), so the same validated hues are
 * expressed as hex here. Colorblind separation was validated on these values
 * (worst adjacent pair dE 30.5 deutan).
 */
const BAND_HEX: Record<string, number> = {
  HIGH: 0x22c55e,
  MID: 0x3b82f6,
  LOW: 0xef4444,
}

/** Half-extent of the plotted cube in world units. */
const CUBE = 10
/** Momentum beyond this many points is clamped to the cube wall. */
const MOMENTUM_CLAMP = 20

export interface CubeHandle {
  dispose: () => void
  setTheme: (dark: boolean) => void
}

export interface HoverTarget {
  entry: TalentGridEntry
  name: string
  /** Container-relative pixel position for the HTML tooltip. */
  left: number
  top: number
}

interface SceneOptions {
  container: HTMLDivElement
  entries: TalentGridEntry[]
  resolveName: (employeeId: string) => string
  onHover: (target: HoverTarget | null) => void
  onSelect: (employeeId: string) => void
  reducedMotion: boolean
  dark: boolean
}

/** Maps a 0-100 performance score onto the cube's vertical axis. */
function performanceToY(score: number): number {
  return (score / 100) * CUBE * 2 - CUBE
}

/** Maps a momentum delta (points) onto the cube's horizontal axis, clamped. */
function momentumToX(delta: number | null): number {
  const clamped = Math.max(-MOMENTUM_CLAMP, Math.min(MOMENTUM_CLAMP, delta ?? 0))
  return (clamped / MOMENTUM_CLAMP) * CUBE
}

/** Maps 0-1 consensus onto the cube's depth axis. Unknown consensus sits at the front. */
function consensusToZ(consensus: number | null): number {
  if (consensus === null) return -CUBE
  return consensus * CUBE * 2 - CUBE
}

/** Renders text to a canvas texture so axis labels stay readable at any angle. */
function makeLabel(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.font = 'bold 56px system-ui, sans-serif'
    context.fillStyle = color
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(text, canvas.width / 2, canvas.height / 2)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  const material = new THREE.SpriteMaterial({ transparent: true, map: texture, depthTest: false })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(6, 1.5, 1)
  return sprite
}

export function createTalentCubeScene(options: SceneOptions): CubeHandle {
  const { container, entries, resolveName, onHover, onSelect, reducedMotion } = options

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / Math.max(1, container.clientHeight),
    0.1,
    500
  )
  camera.position.set(21, 15, 23)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.setClearColor(0x000000, 0)
  container.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 14
  controls.maxDistance = 60
  controls.autoRotate = !reducedMotion
  controls.autoRotateSpeed = 0.5

  scene.add(new THREE.AmbientLight(0xffffff, 1.4))
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.5)
  keyLight.position.set(20, 30, 20)
  scene.add(keyLight)

  // Cube frame + floor grid give the eye a reference for depth.
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(CUBE * 2, CUBE * 2, CUBE * 2)),
    new THREE.LineBasicMaterial({ transparent: true, opacity: 0.28 })
  )
  scene.add(frame)

  const grid = new THREE.GridHelper(CUBE * 2, 8)
  grid.position.y = -CUBE
  const gridMaterial = grid.material as THREE.Material
  gridMaterial.transparent = true
  gridMaterial.opacity = 0.22
  scene.add(grid)

  const labels: THREE.Sprite[] = []
  const labelColor = options.dark ? '#a1a1aa' : '#52525b'
  // Labels sit just inside the cube bounds so they survive any camera distance.
  const momentumLabel = makeLabel('Momentum →', labelColor)
  momentumLabel.position.set(0, -CUBE - 1, CUBE)
  const performanceLabel = makeLabel('Performance →', labelColor)
  performanceLabel.position.set(-CUBE - 1.5, 0, CUBE)
  const consensusLabel = makeLabel('Consensus →', labelColor)
  consensusLabel.position.set(CUBE + 1.5, -CUBE - 1, 0)
  labels.push(momentumLabel, performanceLabel, consensusLabel)
  labels.forEach((label) => scene.add(label))

  // One mesh per employee: cheap at this cohort size (~150) and lets the
  // raycaster hand back the exact entry on hover without index bookkeeping.
  const geometry = new THREE.SphereGeometry(0.42, 24, 24)
  const dots: THREE.Mesh[] = []
  const plotted = entries.filter((entry) => !entry.isNew)

  plotted.forEach((entry, index) => {
    const material = new THREE.MeshStandardMaterial({
      color: BAND_HEX[entry.performanceBand] ?? 0x94a3b8,
      roughness: 0.35,
      metalness: 0.1,
      emissive: new THREE.Color(BAND_HEX[entry.performanceBand] ?? 0x94a3b8),
      emissiveIntensity: 0.18,
    })
    const dot = new THREE.Mesh(geometry, material)
    const targetY = performanceToY(entry.performanceScore)
    dot.position.set(momentumToX(entry.momentumDelta), reducedMotion ? targetY : -CUBE, consensusToZ(entry.consensus))
    dot.userData = { entry, targetY, delay: reducedMotion ? 0 : index * 0.012 }
    scene.add(dot)
    dots.push(dot)
  })

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let hovered: THREE.Mesh | null = null
  let pointerInside = false

  function updatePointer(event: PointerEvent): void {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }

  function handlePointerMove(event: PointerEvent): void {
    pointerInside = true
    updatePointer(event)
  }

  function handlePointerLeave(): void {
    pointerInside = false
    onHover(null)
    if (hovered) {
      hovered.scale.setScalar(1)
      hovered = null
    }
  }

  function handleClick(): void {
    if (hovered) {
      const { entry } = hovered.userData as { entry: TalentGridEntry }
      onSelect(entry.employeeId)
    }
  }

  renderer.domElement.addEventListener('pointermove', handlePointerMove)
  renderer.domElement.addEventListener('pointerleave', handlePointerLeave)
  renderer.domElement.addEventListener('click', handleClick)

  const resizeObserver = new ResizeObserver(() => {
    const width = container.clientWidth
    const height = container.clientHeight
    if (width === 0 || height === 0) return
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
  })
  resizeObserver.observe(container)

  const clock = new THREE.Clock()
  let frameId = 0
  let disposed = false

  function tick(): void {
    if (disposed) return
    frameId = requestAnimationFrame(tick)
    const elapsed = clock.getElapsedTime()

    // Staggered entrance: each dot eases up to its performance height.
    for (const dot of dots) {
      const { targetY, delay } = dot.userData as { targetY: number; delay: number }
      const progress = Math.min(1, Math.max(0, (elapsed - delay) / 0.9))
      const eased = 1 - Math.pow(1 - progress, 3)
      dot.position.y = -CUBE + (targetY + CUBE) * eased
    }

    if (pointerInside) {
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(dots, false)[0]
      const target = (hit?.object as THREE.Mesh) ?? null

      if (target !== hovered) {
        if (hovered) hovered.scale.setScalar(1)
        hovered = target
        if (hovered) hovered.scale.setScalar(1.6)
        renderer.domElement.style.cursor = hovered ? 'pointer' : 'grab'
      }

      if (hovered) {
        const { entry } = hovered.userData as { entry: TalentGridEntry }
        const projected = hovered.position.clone().project(camera)
        onHover({
          entry,
          name: resolveName(entry.employeeId),
          left: ((projected.x + 1) / 2) * container.clientWidth,
          top: ((-projected.y + 1) / 2) * container.clientHeight,
        })
      } else {
        onHover(null)
      }
    }

    controls.update()
    renderer.render(scene, camera)
  }
  tick()

  return {
    setTheme(dark: boolean) {
      const line = frame.material as THREE.LineBasicMaterial
      line.color.set(dark ? 0x3f3f46 : 0xd4d4d8)
      const gridColor = grid.material as THREE.LineBasicMaterial
      gridColor.color.set(dark ? 0x3f3f46 : 0xd4d4d8)
    },
    dispose() {
      disposed = true
      cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave)
      renderer.domElement.removeEventListener('click', handleClick)
      controls.dispose()

      geometry.dispose()
      for (const dot of dots) (dot.material as THREE.Material).dispose()
      frame.geometry.dispose()
      ;(frame.material as THREE.Material).dispose()
      grid.geometry.dispose()
      gridMaterial.dispose()
      for (const label of labels) {
        label.material.map?.dispose()
        label.material.dispose()
      }

      renderer.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
    },
  }
}
