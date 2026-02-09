import { prisma } from '@/lib/db'
import { calculateWeightedScore, EvaluationReport } from '@/lib/scoring'
import { RelationshipType, RELATIONSHIP_TYPE_LABELS, RATING_LABELS } from '@/types'
import { escapeHtml } from '@/lib/sanitize'

export interface DetailedEvaluationSection {
  relationshipType: RelationshipType
  evaluatorName: string
  evaluatorId: string
  categories: Array<{
    questionText: string
    rating: number | null
    maxRating: number
    feedback: string | null
  }>
  totalScore: number
  maxTotalScore: number
  averageScore: number
}

export interface DetailedReport extends EvaluationReport {
  employeeDepartment?: string
  employeePosition?: string
  detailedSections: DetailedEvaluationSection[]
}

export async function generateDetailedReport(
  employeeId: string,
  periodId: string,
  anonymize: boolean = false
): Promise<DetailedReport> {
  // Get employee and period info first
  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
  })

  const period = await prisma.evaluationPeriod.findUnique({
    where: { id: periodId },
  })

  if (!employee || !period) {
    throw new Error('Employee or period not found')
  }

  // Try to calculate score, but handle incomplete scores gracefully
  let report: EvaluationReport
  try {
    report = await calculateWeightedScore(employeeId, periodId)
  } catch (error) {
    // If calculation fails (e.g., no evaluations), create empty report
    report = {
      employeeId: employee.id,
      employeeName: employee.name,
      periodId: period.id,
      periodName: period.name,
      overallScore: 0,
      breakdown: [],
      qualitativeFeedback: {},
    }
  }
  
  // Get all evaluations with evaluator info (include drafts for incomplete reports)
  const evaluations = await prisma.evaluation.findMany({
    where: {
      evaluateeId: employeeId,
      periodId: periodId,
      // Don't filter by submittedAt - include drafts too for incomplete reports
    },
    include: {
      question: true,
      evaluator: true,
    },
    orderBy: [
      { evaluator: { name: 'asc' } },
      { question: { orderIndex: 'asc' } },
    ],
  })

  // Get mappings to determine relationship types
  const mappings = await prisma.evaluatorMapping.findMany({
    where: { evaluateeId: employeeId },
    include: {
      evaluator: true,
    },
  })

  const evaluatorToTypeMap = new Map<string, RelationshipType>()
  mappings.forEach((m) => {
    evaluatorToTypeMap.set(m.evaluatorId, m.relationshipType)
  })

  // Group evaluations by evaluator and relationship type
  const evaluationsByEvaluator = new Map<string, typeof evaluations>()
  for (const evaluation of evaluations) {
    const key = evaluation.evaluatorId
    if (!evaluationsByEvaluator.has(key)) {
      evaluationsByEvaluator.set(key, [])
    }
    evaluationsByEvaluator.get(key)!.push(evaluation)
  }

  // Build detailed sections
  const detailedSections: DetailedEvaluationSection[] = []
  
  for (const [evaluatorId, evaluatorEvaluations] of evaluationsByEvaluator.entries()) {
    const relationshipType = evaluatorToTypeMap.get(evaluatorId)
    if (!relationshipType) continue

    const evaluator = evaluatorEvaluations[0].evaluator
    const categories = evaluatorEvaluations.map((evaluation) => ({
      questionText: evaluation.question.questionText,
      rating: evaluation.ratingValue,
      maxRating: evaluation.question.maxRating,
      feedback: evaluation.textResponse,
    }))

    const ratingQuestions = categories.filter((c) => c.rating !== null)
    const totalScore = ratingQuestions.reduce((sum, c) => sum + (c.rating || 0), 0)
    const maxTotalScore = ratingQuestions.reduce((sum, c) => sum + c.maxRating, 0)
    const averageScore = maxTotalScore > 0 ? (totalScore / maxTotalScore) * 4 : 0

    // Anonymize evaluator names if requested
    const displayName = anonymize 
      ? `${RELATIONSHIP_TYPE_LABELS[relationshipType]} Evaluator` 
      : evaluator.name

    detailedSections.push({
      relationshipType,
      evaluatorName: displayName,
      evaluatorId: anonymize ? 'anonymous' : evaluator.id,
      categories,
      totalScore,
      maxTotalScore,
      averageScore,
    })
  }

  return {
    ...report,
    employeeDepartment: employee?.department || undefined,
    employeePosition: employee?.position || undefined,
    detailedSections,
  }
}

export async function generateReport(
  employeeId: string,
  periodId: string
): Promise<EvaluationReport> {
  // Check if report already exists
  const existingReport = await prisma.report.findUnique({
    where: {
      employeeId_periodId: {
        employeeId,
        periodId,
      },
    },
  })

  if (existingReport) {
    return existingReport.breakdownJson as unknown as EvaluationReport
  }

  // Calculate score
  const report = await calculateWeightedScore(employeeId, periodId)

  // Save to database
  await prisma.report.upsert({
    where: {
      employeeId_periodId: {
        employeeId,
        periodId,
      },
    },
    create: {
      employeeId,
      periodId,
      overallScore: report.overallScore,
      breakdownJson: report as any,
    },
    update: {
      overallScore: report.overallScore,
      breakdownJson: report as any,
    },
  })

  return report
}

export function formatReportAsHTML(
  detailedReport: DetailedReport,
  period: { startDate: Date; endDate: Date }
): string {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(date))
  }

  const periodRange = `${formatDate(period.startDate)} - ${formatDate(period.endDate)}`
  const overallScorePercent = detailedReport.overallScore.toFixed(2)
  const aggregateScore = detailedReport.overallScore / 25 // Convert percentage to 0-4 scale

  // Group detailed sections by relationship type
  const sectionsByType = new Map<RelationshipType, DetailedEvaluationSection[]>()
  for (const section of detailedReport.detailedSections) {
    if (!sectionsByType.has(section.relationshipType)) {
      sectionsByType.set(section.relationshipType, [])
    }
    sectionsByType.get(section.relationshipType)!.push(section)
  }

  // Helper to get section label
  const getSectionTitle = (type: RelationshipType): string => {
    const labels: Record<RelationshipType, string> = {
      C_LEVEL: 'CEO/Leadership Evaluation',
      TEAM_LEAD: 'Evaluation as a Team Lead',
      DIRECT_REPORT: 'Evaluation as a Reporting Team Member',
      PEER: 'Evaluation as a Peer',
      HR: 'HR Evaluation',
      DEPT: 'Department Evaluation',
      SELF: 'Self-Evaluation',
    }
    return labels[type]
  }

  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Performance Evaluation ${detailedReport.periodName}</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          line-height: 1.6; 
          color: #333; 
          max-width: 900px; 
          margin: 0 auto; 
          padding: 20px; 
        }
        h1 { 
          color: #2c3e50; 
          border-bottom: 3px solid #3498db; 
          padding-bottom: 10px; 
          margin-bottom: 10px;
        }
        h2 { 
          color: #34495e; 
          margin-top: 30px; 
          margin-bottom: 15px;
          font-size: 1.3em;
        }
        h3 { 
          color: #555; 
          margin-top: 20px;
          margin-bottom: 10px;
          font-size: 1.1em;
        }
        table { 
          width: 100%; 
          border-collapse: collapse; 
          margin: 20px 0; 
          font-size: 0.95em;
        }
        th, td { 
          padding: 10px 12px; 
          text-align: left; 
          border: 1px solid #ddd; 
        }
        th { 
          background-color: #3498db; 
          color: white; 
          font-weight: bold;
        }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .section { margin: 30px 0; }
        .feedback-item { 
          margin: 10px 0; 
          padding: 10px; 
          background-color: #f8f9fa; 
          border-left: 4px solid #3498db; 
          font-style: italic;
        }
        .evaluator-name { 
          font-weight: bold; 
          color: #2c3e50; 
          margin-bottom: 10px;
        }
        .total-row { 
          font-weight: bold; 
          background-color: #e8f4f8 !important; 
        }
        .aggregate-table th {
          background-color: #2c3e50;
        }
        .key-table {
          margin-top: 30px;
          font-size: 0.9em;
        }
        .key-table th {
          background-color: #7f8c8d;
        }
        @media print {
          body { 
            max-width: 100%; 
            padding: 10px; 
          }
          .section { 
            page-break-inside: avoid; 
            margin: 20px 0;
          }
          table { 
            page-break-inside: avoid; 
          }
          h2 { 
            page-break-after: avoid; 
          }
        }
      </style>
    </head>
    <body>
      <h1>Performance Evaluation ${detailedReport.periodName}</h1>
      
      <div class="section">
        <table>
          <tr>
            <td style="width: 200px;"><strong>Team Member Name:</strong></td>
            <td>${escapeHtml(detailedReport.employeeName)}</td>
          </tr>
          ${detailedReport.employeeDepartment ? `
          <tr>
            <td><strong>Department:</strong></td>
            <td>${escapeHtml(detailedReport.employeeDepartment)}</td>
          </tr>
          ` : ''}
        </table>
      </div>

      <p style="font-size: 0.9em; color: #666; margin: 20px 0;">
        <em>Please note that the scores from the team represent the average of all the scores received, rather than individual assessments from each evaluator.</em>
      </p>
  `

  // Show message if no evaluations exist
  if (detailedReport.detailedSections.length === 0) {
    html += `
      <div class="section" style="padding: 20px; background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 5px;">
        <p style="margin: 0; color: #856404;">
          <strong>No evaluations submitted yet.</strong> This report will be updated as evaluations are completed.
        </p>
      </div>
    `
  }

  // Render each evaluation section
  const sectionOrder: RelationshipType[] = ['C_LEVEL', 'TEAM_LEAD', 'DIRECT_REPORT', 'PEER', 'HR', 'DEPT']
  
  for (const type of sectionOrder) {
    const sections = sectionsByType.get(type)
    if (!sections || sections.length === 0) continue

    html += `<div class="section">`
    html += `<h2>${getSectionTitle(type)}</h2>`

    for (const section of sections) {
      html += `<div class="evaluator-name">${getSectionTitle(type)} by ${escapeHtml(section.evaluatorName)}</div>`

      // Check if this is a rating-based evaluation
      const hasRatings = section.categories.some((c) => c.rating !== null)

      if (hasRatings) {
        html += `<table>`
        html += `<thead><tr><th>Categories</th><th>Rating</th>${section.categories.some(c => c.feedback) ? '<th>Feedback</th>' : ''}</tr></thead>`
        html += `<tbody>`

        for (const category of section.categories) {
          if (category.rating !== null) {
            html += `<tr>`
            html += `<td>${escapeHtml(category.questionText)}</td>`
            html += `<td>${category.rating.toFixed(2)}</td>`
            if (section.categories.some(c => c.feedback)) {
              html += `<td>${escapeHtml(category.feedback) || '—'}</td>`
            }
            html += `</tr>`
          }
        }

        html += `<tr class="total-row">`
        html += `<td><strong>Total (Out of ${section.maxTotalScore})</strong></td>`
        html += `<td><strong>${section.totalScore.toFixed(2)}</strong></td>`
        if (section.categories.some(c => c.feedback)) {
          html += `<td></td>`
        }
        html += `</tr>`
        html += `</tbody></table>`
      }

      // Add feedback sections
      const feedbackCategories = section.categories.filter((c) => c.feedback && c.feedback.trim())
      if (feedbackCategories.length > 0) {
        for (const category of feedbackCategories) {
          if (category.feedback && category.feedback.trim()) {
            html += `<div class="feedback-item"><strong>${escapeHtml(category.questionText)}:</strong> ${escapeHtml(category.feedback)}</div>`
          }
        }
      }
    }

    html += `</div>`
  }

  // Aggregate Performance Score Table
  html += `<div class="section">`
  html += `<h2>Aggregate Performance Score</h2>`
  html += `<table class="aggregate-table">`
  html += `<thead><tr><th>Categories</th><th>Weightage</th><th>Aggregate</th></tr></thead>`
  html += `<tbody>`

  // Map relationship types to display names
  const displayNames: Record<RelationshipType, string> = {
    TEAM_LEAD: 'Evaluation As Team Lead',
    DIRECT_REPORT: 'Evaluation As Reporting Team Member',
    PEER: 'Evaluation As Peer',
    HR: 'HR Evaluation',
    C_LEVEL: 'CEO Evaluation',
    DEPT: 'Department Evaluation',
    SELF: 'Self-Evaluation',
  }

  // Get breakdown for aggregate table
  if (detailedReport.breakdown && detailedReport.breakdown.length > 0) {
    for (const breakdown of detailedReport.breakdown) {
      const displayName = displayNames[breakdown.relationshipType] || RELATIONSHIP_TYPE_LABELS[breakdown.relationshipType]
      const weightPercent = (breakdown.weight * 100).toFixed(0)
      const aggregateScore = breakdown.normalizedScore.toFixed(2)
      
      html += `<tr>`
      html += `<td>${displayName}${breakdown.evaluatorCount > 0 ? ` (${breakdown.evaluatorCount})` : ''}</td>`
      html += `<td>${weightPercent}%</td>`
      html += `<td>${aggregateScore}</td>`
      html += `</tr>`
    }
  } else {
    // Show default weightages even if no evaluations
    const defaultWeightages: Record<RelationshipType, number> = {
      C_LEVEL: 0.35,
      TEAM_LEAD: 0.20,
      DIRECT_REPORT: 0.15,
      PEER: 0.10,
      HR: 0.05,
      DEPT: 0.15,
      SELF: 0.00,
    }
    
    for (const [type, weight] of Object.entries(defaultWeightages)) {
      html += `<tr>`
      html += `<td>${displayNames[type as RelationshipType] || RELATIONSHIP_TYPE_LABELS[type as RelationshipType]}</td>`
      html += `<td>${(weight * 100).toFixed(0)}%</td>`
      html += `<td>0.00</td>`
      html += `</tr>`
    }
  }

  html += `<tr class="total-row">`
  html += `<td><strong>Aggregate (Out of 4)</strong></td>`
  html += `<td><strong>100%</strong></td>`
  html += `<td><strong>${aggregateScore.toFixed(2)}</strong></td>`
  html += `</tr>`
  html += `<tr class="total-row">`
  html += `<td><strong>Percentage</strong></td>`
  html += `<td></td>`
  html += `<td><strong>${overallScorePercent}%</strong></td>`
  html += `</tr>`
  html += `</tbody></table>`
  html += `</div>`

  // Rating Key
  html += `<div class="section">`
  html += `<h3>Key</h3>`
  html += `<table class="key-table">`
  html += `<thead><tr><th>Rating</th><th>Description</th></tr></thead>`
  html += `<tbody>`
  for (const [rating, label] of Object.entries(RATING_LABELS).reverse()) {
    html += `<tr>`
    html += `<td>${rating}</td>`
    html += `<td>${label.label} - ${label.description}</td>`
    html += `</tr>`
  }
  html += `</tbody></table>`
  html += `</div>`

  html += `
      </body>
    </html>
  `

  return html
}

// Keep the old function for backward compatibility but enhance it
export async function formatReportAsHTMLLegacy(
  report: EvaluationReport,
  period: { startDate: Date; endDate: Date }
): Promise<string> {
  const detailedReport = await generateDetailedReport(report.employeeId, report.periodId)
  return formatReportAsHTML(detailedReport, period)
}

export async function generateHRSpreadsheet(periodId: string): Promise<Buffer> {
  const ExcelJS = require('exceljs')
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Evaluation Data')

  // Get all employees
  const employees = await prisma.user.findMany({
    where: { role: 'EMPLOYEE' },
  })

  // Get period
  const period = await prisma.evaluationPeriod.findUnique({
    where: { id: periodId },
  })

  if (!period) {
    throw new Error('Period not found')
  }

  // Generate reports for all employees
  const reports = []
  for (const employee of employees) {
    try {
      const report = await generateReport(employee.id, periodId)
      reports.push(report)
    } catch (error) {
      console.error(`Error generating report for ${employee.name}:`, error)
    }
  }

  // Set up headers
  worksheet.columns = [
    { header: 'Employee Name', key: 'name', width: 20 },
    { header: 'Department', key: 'department', width: 15 },
    { header: 'Position', key: 'position', width: 20 },
    { header: 'Overall Score %', key: 'overallScore', width: 15 },
    { header: 'C-Level (Hamiz) Score', key: 'cLevel', width: 15 },
    { header: 'Team Lead Score', key: 'teamLead', width: 15 },
    { header: 'Direct Report Score', key: 'directReport', width: 15 },
    { header: 'Peer Score', key: 'peer', width: 15 },
    { header: 'HR Score', key: 'hr', width: 15 },
    { header: 'Department (Hamiz) Score', key: 'dept', width: 18 },
  ]

  // Add data rows
  for (const report of reports) {
    const employee = employees.find((e) => e.id === report.employeeId)
    const cLevelBreakdown = report.breakdown.find((b) => b.relationshipType === 'C_LEVEL')
    const teamLeadBreakdown = report.breakdown.find((b) => b.relationshipType === 'TEAM_LEAD')
    const directReportBreakdown = report.breakdown.find((b) => b.relationshipType === 'DIRECT_REPORT')
    const peerBreakdown = report.breakdown.find((b) => b.relationshipType === 'PEER')
    const hrBreakdown = report.breakdown.find((b) => b.relationshipType === 'HR')
    const deptBreakdown = report.breakdown.find((b) => b.relationshipType === 'DEPT')

    worksheet.addRow({
      name: report.employeeName,
      department: employee?.department || '',
      position: employee?.position || '',
      overallScore: report.overallScore.toFixed(2),
      cLevel: cLevelBreakdown ? cLevelBreakdown.normalizedScore.toFixed(2) : 'N/A',
      teamLead: teamLeadBreakdown ? teamLeadBreakdown.normalizedScore.toFixed(2) : 'N/A',
      directReport: directReportBreakdown ? directReportBreakdown.normalizedScore.toFixed(2) : 'N/A',
      peer: peerBreakdown ? peerBreakdown.normalizedScore.toFixed(2) : 'N/A',
      hr: hrBreakdown ? hrBreakdown.normalizedScore.toFixed(2) : 'N/A',
      dept: deptBreakdown ? deptBreakdown.normalizedScore.toFixed(2) : 'N/A',
    })
  }

  // Style header row
  worksheet.getRow(1).font = { bold: true }
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF3498DB' },
  }

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
