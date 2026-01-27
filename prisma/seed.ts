import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Create users
  const hrUser = await prisma.user.upsert({
    where: { email: 'hr@example.com' },
    update: {},
    create: {
      name: 'HR Admin',
      email: 'hr@example.com',
      department: 'Human Resources',
      position: 'HR Manager',
      role: 'HR',
    },
  })

  const ceo = await prisma.user.upsert({
    where: { email: 'ceo@example.com' },
    update: {},
    create: {
      name: 'John CEO',
      email: 'ceo@example.com',
      department: 'Executive',
      position: 'Chief Executive Officer',
      role: 'EMPLOYEE',
    },
  })

  const manager1 = await prisma.user.upsert({
    where: { email: 'manager1@example.com' },
    update: {},
    create: {
      name: 'Alice Manager',
      email: 'manager1@example.com',
      department: 'Engineering',
      position: 'Engineering Manager',
      role: 'EMPLOYEE',
    },
  })

  const employee1 = await prisma.user.upsert({
    where: { email: 'employee1@example.com' },
    update: {},
    create: {
      name: 'Bob Developer',
      email: 'employee1@example.com',
      department: 'Engineering',
      position: 'Senior Developer',
      role: 'EMPLOYEE',
    },
  })

  const employee2 = await prisma.user.upsert({
    where: { email: 'employee2@example.com' },
    update: {},
    create: {
      name: 'Carol Designer',
      email: 'employee2@example.com',
      department: 'Design',
      position: 'UI/UX Designer',
      role: 'EMPLOYEE',
    },
  })

  // Add more dummy users for testing
  const manager2 = await prisma.user.upsert({
    where: { email: 'manager2@example.com' },
    update: {},
    create: {
      name: 'David Sales Manager',
      email: 'manager2@example.com',
      department: 'Sales',
      position: 'Sales Manager',
      role: 'EMPLOYEE',
    },
  })

  const employee3 = await prisma.user.upsert({
    where: { email: 'employee3@example.com' },
    update: {},
    create: {
      name: 'Emma Marketing',
      email: 'employee3@example.com',
      department: 'Marketing',
      position: 'Marketing Specialist',
      role: 'EMPLOYEE',
    },
  })

  const employee4 = await prisma.user.upsert({
    where: { email: 'employee4@example.com' },
    update: {},
    create: {
      name: 'Frank Developer',
      email: 'employee4@example.com',
      department: 'Engineering',
      position: 'Junior Developer',
      role: 'EMPLOYEE',
    },
  })

  const employee5 = await prisma.user.upsert({
    where: { email: 'employee5@example.com' },
    update: {},
    create: {
      name: 'Grace Product Manager',
      email: 'employee5@example.com',
      department: 'Product',
      position: 'Product Manager',
      role: 'EMPLOYEE',
    },
  })

  const cto = await prisma.user.upsert({
    where: { email: 'cto@example.com' },
    update: {},
    create: {
      name: 'Henry CTO',
      email: 'cto@example.com',
      department: 'Executive',
      position: 'Chief Technology Officer',
      role: 'EMPLOYEE',
    },
  })

  // Create evaluation period
  let period = await prisma.evaluationPeriod.findUnique({
    where: { id: 'q3-2025' },
  })

  if (!period) {
    period = await prisma.evaluationPeriod.create({
      data: {
        id: 'q3-2025',
        name: 'Q3 2025',
        startDate: new Date('2025-10-01'),
        endDate: new Date('2025-12-31'),
        isActive: true,
      },
    })
  }

  // Create evaluation questions
  const cLevelQuestions = [
    {
      relationshipType: 'C_LEVEL' as const,
      questionText: 'Task Prioritization & Accountability',
      questionType: 'RATING' as const,
      maxRating: 4,
      orderIndex: 1,
    },
    {
      relationshipType: 'C_LEVEL' as const,
      questionText: 'Accuracy & Attention to Detail',
      questionType: 'RATING' as const,
      maxRating: 4,
      orderIndex: 2,
    },
    {
      relationshipType: 'C_LEVEL' as const,
      questionText: 'Continuous Learning & Innovation',
      questionType: 'RATING' as const,
      maxRating: 4,
      orderIndex: 3,
    },
    {
      relationshipType: 'C_LEVEL' as const,
      questionText: 'Guidance & Collaboration',
      questionType: 'RATING' as const,
      maxRating: 4,
      orderIndex: 4,
    },
    {
      relationshipType: 'C_LEVEL' as const,
      questionText: 'Overall Impact',
      questionType: 'RATING' as const,
      maxRating: 4,
      orderIndex: 5,
    },
    {
      relationshipType: 'C_LEVEL' as const,
      questionText: 'Areas for Improvement',
      questionType: 'TEXT' as const,
      maxRating: 4,
      orderIndex: 6,
    },
  ]

  const teamLeadQuestions = [
    {
      relationshipType: 'TEAM_LEAD' as const,
      questionText: 'Clarity in Communication',
      questionType: 'RATING' as const,
      maxRating: 4,
      orderIndex: 1,
    },
    {
      relationshipType: 'TEAM_LEAD' as const,
      questionText: 'Support for Professional Growth',
      questionType: 'RATING' as const,
      maxRating: 4,
      orderIndex: 2,
    },
    {
      relationshipType: 'TEAM_LEAD' as const,
      questionText: 'Recognition & Appreciation',
      questionType: 'RATING' as const,
      maxRating: 4,
      orderIndex: 3,
    },
    {
      relationshipType: 'TEAM_LEAD' as const,
      questionText: 'Leadership & Problem Solving',
      questionType: 'RATING' as const,
      maxRating: 4,
      orderIndex: 4,
    },
    {
      relationshipType: 'TEAM_LEAD' as const,
      questionText: 'Additional Comments',
      questionType: 'TEXT' as const,
      maxRating: 4,
      orderIndex: 5,
    },
  ]

  const directReportQuestions = [
    {
      relationshipType: 'DIRECT_REPORT' as const,
      questionText: 'Quality of Work',
      questionType: 'RATING' as const,
      maxRating: 4,
      orderIndex: 1,
    },
    {
      relationshipType: 'DIRECT_REPORT' as const,
      questionText: 'Initiative & Proactivity',
      questionType: 'RATING' as const,
      maxRating: 4,
      orderIndex: 2,
    },
    {
      relationshipType: 'DIRECT_REPORT' as const,
      questionText: 'Team Collaboration',
      questionType: 'RATING' as const,
      maxRating: 4,
      orderIndex: 3,
    },
    {
      relationshipType: 'DIRECT_REPORT' as const,
      questionText: 'Feedback',
      questionType: 'TEXT' as const,
      maxRating: 4,
      orderIndex: 4,
    },
  ]

  const peerQuestions = [
    {
      relationshipType: 'PEER' as const,
      questionText: 'Collaboration & Teamwork',
      questionType: 'RATING' as const,
      maxRating: 4,
      orderIndex: 1,
    },
    {
      relationshipType: 'PEER' as const,
      questionText: 'Communication',
      questionType: 'RATING' as const,
      maxRating: 4,
      orderIndex: 2,
    },
    {
      relationshipType: 'PEER' as const,
      questionText: 'Reliability',
      questionType: 'RATING' as const,
      maxRating: 4,
      orderIndex: 3,
    },
    {
      relationshipType: 'PEER' as const,
      questionText: 'Comments',
      questionType: 'TEXT' as const,
      maxRating: 4,
      orderIndex: 4,
    },
  ]

  const hrQuestions = [
    {
      relationshipType: 'HR' as const,
      questionText: 'Policy Adherence',
      questionType: 'RATING' as const,
      maxRating: 4,
      orderIndex: 1,
    },
    {
      relationshipType: 'HR' as const,
      questionText: 'Participation in Meetings & Discussions',
      questionType: 'RATING' as const,
      maxRating: 4,
      orderIndex: 2,
    },
    {
      relationshipType: 'HR' as const,
      questionText: 'Alignment with Company Values',
      questionType: 'RATING' as const,
      maxRating: 4,
      orderIndex: 3,
    },
    {
      relationshipType: 'HR' as const,
      questionText: 'Availability during Core Hours',
      questionType: 'RATING' as const,
      maxRating: 4,
      orderIndex: 4,
    },
    {
      relationshipType: 'HR' as const,
      questionText: 'HR Feedback',
      questionType: 'TEXT' as const,
      maxRating: 4,
      orderIndex: 5,
    },
  ]

  const allQuestions = [
    ...cLevelQuestions,
    ...teamLeadQuestions,
    ...directReportQuestions,
    ...peerQuestions,
    ...hrQuestions,
  ]

  for (const question of allQuestions) {
    await prisma.evaluationQuestion.upsert({
      where: {
        relationshipType_orderIndex: {
          relationshipType: question.relationshipType,
          orderIndex: question.orderIndex,
        },
      },
      update: {},
      create: question,
    })
  }

  // Create evaluator mappings
  // CEO evaluates manager1
  await prisma.evaluatorMapping.upsert({
    where: {
      evaluatorId_evaluateeId_relationshipType: {
        evaluatorId: ceo.id,
        evaluateeId: manager1.id,
        relationshipType: 'C_LEVEL',
      },
    },
    update: {},
    create: {
      evaluatorId: ceo.id,
      evaluateeId: manager1.id,
      relationshipType: 'C_LEVEL',
    },
  })

  // Manager1 evaluates employee1 (direct report)
  await prisma.evaluatorMapping.upsert({
    where: {
      evaluatorId_evaluateeId_relationshipType: {
        evaluatorId: manager1.id,
        evaluateeId: employee1.id,
        relationshipType: 'TEAM_LEAD',
      },
    },
    update: {},
    create: {
      evaluatorId: manager1.id,
      evaluateeId: employee1.id,
      relationshipType: 'TEAM_LEAD',
    },
  })

  // Employee1 evaluates manager1 (team lead)
  await prisma.evaluatorMapping.upsert({
    where: {
      evaluatorId_evaluateeId_relationshipType: {
        evaluatorId: employee1.id,
        evaluateeId: manager1.id,
        relationshipType: 'DIRECT_REPORT',
      },
    },
    update: {},
    create: {
      evaluatorId: employee1.id,
      evaluateeId: manager1.id,
      relationshipType: 'DIRECT_REPORT',
    },
  })

  // Employee1 and employee2 evaluate each other (peers)
  await prisma.evaluatorMapping.upsert({
    where: {
      evaluatorId_evaluateeId_relationshipType: {
        evaluatorId: employee1.id,
        evaluateeId: employee2.id,
        relationshipType: 'PEER',
      },
    },
    update: {},
    create: {
      evaluatorId: employee1.id,
      evaluateeId: employee2.id,
      relationshipType: 'PEER',
    },
  })

  await prisma.evaluatorMapping.upsert({
    where: {
      evaluatorId_evaluateeId_relationshipType: {
        evaluatorId: employee2.id,
        evaluateeId: employee1.id,
        relationshipType: 'PEER',
      },
    },
    update: {},
    create: {
      evaluatorId: employee2.id,
      evaluateeId: employee1.id,
      relationshipType: 'PEER',
    },
  })

  // HR evaluates employee1
  await prisma.evaluatorMapping.upsert({
    where: {
      evaluatorId_evaluateeId_relationshipType: {
        evaluatorId: hrUser.id,
        evaluateeId: employee1.id,
        relationshipType: 'HR',
      },
    },
    update: {},
    create: {
      evaluatorId: hrUser.id,
      evaluateeId: employee1.id,
      relationshipType: 'HR',
    },
  })

  // Additional evaluator mappings for comprehensive testing
  
  // CEO evaluates CTO (C-Level)
  await prisma.evaluatorMapping.upsert({
    where: {
      evaluatorId_evaluateeId_relationshipType: {
        evaluatorId: ceo.id,
        evaluateeId: cto.id,
        relationshipType: 'C_LEVEL',
      },
    },
    update: {},
    create: {
      evaluatorId: ceo.id,
      evaluateeId: cto.id,
      relationshipType: 'C_LEVEL',
    },
  })

  // CTO evaluates manager1 (C-Level)
  await prisma.evaluatorMapping.upsert({
    where: {
      evaluatorId_evaluateeId_relationshipType: {
        evaluatorId: cto.id,
        evaluateeId: manager1.id,
        relationshipType: 'C_LEVEL',
      },
    },
    update: {},
    create: {
      evaluatorId: cto.id,
      evaluateeId: manager1.id,
      relationshipType: 'C_LEVEL',
    },
  })

  // Manager1 evaluates employee4 (direct report)
  await prisma.evaluatorMapping.upsert({
    where: {
      evaluatorId_evaluateeId_relationshipType: {
        evaluatorId: manager1.id,
        evaluateeId: employee4.id,
        relationshipType: 'TEAM_LEAD',
      },
    },
    update: {},
    create: {
      evaluatorId: manager1.id,
      evaluateeId: employee4.id,
      relationshipType: 'TEAM_LEAD',
    },
  })

  // Employee4 evaluates manager1 (team lead)
  await prisma.evaluatorMapping.upsert({
    where: {
      evaluatorId_evaluateeId_relationshipType: {
        evaluatorId: employee4.id,
        evaluateeId: manager1.id,
        relationshipType: 'DIRECT_REPORT',
      },
    },
    update: {},
    create: {
      evaluatorId: employee4.id,
      evaluateeId: manager1.id,
      relationshipType: 'DIRECT_REPORT',
    },
  })

  // Manager2 evaluates employee3 (team lead)
  await prisma.evaluatorMapping.upsert({
    where: {
      evaluatorId_evaluateeId_relationshipType: {
        evaluatorId: manager2.id,
        evaluateeId: employee3.id,
        relationshipType: 'TEAM_LEAD',
      },
    },
    update: {},
    create: {
      evaluatorId: manager2.id,
      evaluateeId: employee3.id,
      relationshipType: 'TEAM_LEAD',
    },
  })

  // Employee3 evaluates manager2 (direct report)
  await prisma.evaluatorMapping.upsert({
    where: {
      evaluatorId_evaluateeId_relationshipType: {
        evaluatorId: employee3.id,
        evaluateeId: manager2.id,
        relationshipType: 'DIRECT_REPORT',
      },
    },
    update: {},
    create: {
      evaluatorId: employee3.id,
      evaluateeId: manager2.id,
      relationshipType: 'DIRECT_REPORT',
    },
  })

  // More peer evaluations
  await prisma.evaluatorMapping.upsert({
    where: {
      evaluatorId_evaluateeId_relationshipType: {
        evaluatorId: employee1.id,
        evaluateeId: employee4.id,
        relationshipType: 'PEER',
      },
    },
    update: {},
    create: {
      evaluatorId: employee1.id,
      evaluateeId: employee4.id,
      relationshipType: 'PEER',
    },
  })

  await prisma.evaluatorMapping.upsert({
    where: {
      evaluatorId_evaluateeId_relationshipType: {
        evaluatorId: employee4.id,
        evaluateeId: employee1.id,
        relationshipType: 'PEER',
      },
    },
    update: {},
    create: {
      evaluatorId: employee4.id,
      evaluateeId: employee1.id,
      relationshipType: 'PEER',
    },
  })

  await prisma.evaluatorMapping.upsert({
    where: {
      evaluatorId_evaluateeId_relationshipType: {
        evaluatorId: employee2.id,
        evaluateeId: employee5.id,
        relationshipType: 'PEER',
      },
    },
    update: {},
    create: {
      evaluatorId: employee2.id,
      evaluateeId: employee5.id,
      relationshipType: 'PEER',
    },
  })

  await prisma.evaluatorMapping.upsert({
    where: {
      evaluatorId_evaluateeId_relationshipType: {
        evaluatorId: employee5.id,
        evaluateeId: employee2.id,
        relationshipType: 'PEER',
      },
    },
    update: {},
    create: {
      evaluatorId: employee5.id,
      evaluateeId: employee2.id,
      relationshipType: 'PEER',
    },
  })

  // HR evaluates more employees
  await prisma.evaluatorMapping.upsert({
    where: {
      evaluatorId_evaluateeId_relationshipType: {
        evaluatorId: hrUser.id,
        evaluateeId: employee2.id,
        relationshipType: 'HR',
      },
    },
    update: {},
    create: {
      evaluatorId: hrUser.id,
      evaluateeId: employee2.id,
      relationshipType: 'HR',
    },
  })

  await prisma.evaluatorMapping.upsert({
    where: {
      evaluatorId_evaluateeId_relationshipType: {
        evaluatorId: hrUser.id,
        evaluateeId: manager1.id,
        relationshipType: 'HR',
      },
    },
    update: {},
    create: {
      evaluatorId: hrUser.id,
      evaluateeId: manager1.id,
      relationshipType: 'HR',
    },
  })

  await prisma.evaluatorMapping.upsert({
    where: {
      evaluatorId_evaluateeId_relationshipType: {
        evaluatorId: hrUser.id,
        evaluateeId: employee3.id,
        relationshipType: 'HR',
      },
    },
    update: {},
    create: {
      evaluatorId: hrUser.id,
      evaluateeId: employee3.id,
      relationshipType: 'HR',
    },
  })

  await prisma.evaluatorMapping.upsert({
    where: {
      evaluatorId_evaluateeId_relationshipType: {
        evaluatorId: hrUser.id,
        evaluateeId: employee4.id,
        relationshipType: 'HR',
      },
    },
    update: {},
    create: {
      evaluatorId: hrUser.id,
      evaluateeId: employee4.id,
      relationshipType: 'HR',
    },
  })

  await prisma.evaluatorMapping.upsert({
    where: {
      evaluatorId_evaluateeId_relationshipType: {
        evaluatorId: hrUser.id,
        evaluateeId: employee5.id,
        relationshipType: 'HR',
      },
    },
    update: {},
    create: {
      evaluatorId: hrUser.id,
      evaluateeId: employee5.id,
      relationshipType: 'HR',
    },
  })

  console.log('Seeding completed!')
  console.log(`Created ${await prisma.user.count()} users`)
  console.log(`Created ${await prisma.evaluatorMapping.count()} evaluator mappings`)
  console.log(`Created ${await prisma.evaluationQuestion.count()} evaluation questions`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
