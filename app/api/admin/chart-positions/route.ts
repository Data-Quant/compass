import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Save chart positions
export async function POST(request: NextRequest) {
  try {
    const { positions } = await request.json()
    
    if (!positions || !Array.isArray(positions)) {
      return NextResponse.json({ error: 'Invalid positions data' }, { status: 400 })
    }
    
    // Update each user's chart position
    const updates = positions.map((pos: { id: string; x: number; y: number }) => 
      prisma.user.update({
        where: { id: pos.id },
        data: { chartX: pos.x, chartY: pos.y },
      })
    )
    
    await Promise.all(updates)
    
    return NextResponse.json({ success: true, updated: positions.length })
  } catch (error) {
    console.error('Failed to save positions:', error)
    return NextResponse.json({ error: 'Failed to save positions' }, { status: 500 })
  }
}

// Reset all chart positions
export async function DELETE() {
  try {
    await prisma.user.updateMany({
      data: { chartX: null, chartY: null },
    })
    
    return NextResponse.json({ success: true, message: 'All positions reset' })
  } catch (error) {
    console.error('Failed to reset positions:', error)
    return NextResponse.json({ error: 'Failed to reset positions' }, { status: 500 })
  }
}
