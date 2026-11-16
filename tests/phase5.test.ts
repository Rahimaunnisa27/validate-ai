import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApiApp } from '../server/app.ts';
import type { LlmDriver } from '../server/services/llmClient.ts';
import {
  ROADMAP_DISCLAIMER,
  type RoadmapPlanJson,
} from '../src/shared/phase5Schemas.ts';

async function registerUser(
  app: ReturnType<typeof createApiApp>,
  email: string,
  fullName: string,
) {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ email, fullName, password: 'Password#123' })
    .expect(201);
  return {
    cookies: res.headers['set-cookie'],
    token: res.body.accessToken as string,
  };
}

function buildMockRoadmapJson(durationDays: number): string {
  const plan: RoadmapPlanJson = {
    title: `${durationDays}-Day Execution Roadmap: Test Venture`,
    summary: 'Focused lean startup execution plan.',
    targetMarket: 'Indian B2B facility supervisors',
    keyRisks: ['Slower initial outreach conversion', 'Hardware supply chain delays'],
    phases: [
      {
        phaseNumber: 1,
        name: 'Phase 1: Discovery & Problem Validation',
        timeframe: 'Days 1-10',
        objective: 'Validate core pain points with 15 supervisors',
        milestones: ['15 discovery calls completed', 'Top 3 pain points ranked'],
        tasks: [
          {
            title: 'Identify 50 cold storage operators in Pune',
            description: 'Scrape and list contacts in regional logistics cluster',
            priority: 'high',
            dayOffsetStart: 0,
            dayOffsetDue: 3,
            expectedOutcome: 'Spreadsheet with 50 verified contact numbers',
            notes: 'Focus on dairy cold-rooms',
          },
          {
            title: 'Conduct initial discovery outreach',
            description: 'Reach out via WhatsApp & phone to book 15-minute interviews',
            priority: 'urgent',
            dayOffsetStart: 2,
            dayOffsetDue: 7,
            expectedOutcome: '15 booked discovery calls',
            notes: 'Use consultative tone',
          },
        ],
      },
      {
        phaseNumber: 2,
        name: 'Phase 2: MVP Prototype & Pilot Offer',
        timeframe: 'Days 11-20',
        objective: 'Deploy prototype sensor in 2 pilot sites',
        milestones: ['2 signed trial agreements', 'Live WhatsApp temperature alerts'],
        tasks: [
          {
            title: 'Assemble 2 hardware demo kits',
            description: 'Configure IoT sensor box with SIM connectivity',
            priority: 'medium',
            dayOffsetStart: 10,
            dayOffsetDue: 15,
            expectedOutcome: '2 operational demo kits tested in freezer',
            notes: 'Test below -18C',
          },
        ],
      },
    ],
  };

  return JSON.stringify(plan);
}

describe('Phase 5 — Tasks, Roadmap, Expenses & 404 Ownership', () => {
  it('supports tasks CRUD, Kanban status transitions, priority filtering, and 404 ownership', async () => {
    const app = createApiApp({ dbPath: ':memory:' });
    const userA = await registerUser(app, 'founder.tasks.a@example.in', 'Task Founder A');
    const userB = await registerUser(app, 'founder.tasks.b@example.in', 'Task Founder B');

    // 1. Create Task for User A
    const createRes = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({
        title: 'Draft FSSAI Compliance Checklist',
        description: 'Compile regulatory temperature recording requirements',
        priority: 'high',
        startDate: '2026-11-20',
        dueDate: '2026-11-25',
        status: 'todo',
        notes: 'Review Schedule IV requirements',
        expectedOutcome: 'Completed 2-page reference checklist',
      })
      .expect(201);

    expect(createRes.body.task).toBeDefined();
    const taskId = createRes.body.task.id;
    expect(createRes.body.task.title).toBe('Draft FSSAI Compliance Checklist');
    expect(createRes.body.task.priority).toBe('high');
    expect(createRes.body.task.status).toBe('todo');

    // 2. Fetch Tasks list
    const listRes = await request(app)
      .get('/api/v1/tasks?priority=high')
      .set('Authorization', `Bearer ${userA.token}`)
      .expect(200);

    expect(listRes.body.items).toHaveLength(1);
    expect(listRes.body.items[0].id).toBe(taskId);

    // 3. Move status to in_progress
    const inProgressRes = await request(app)
      .patch(`/api/v1/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ status: 'in_progress', sortOrder: 2 })
      .expect(200);

    expect(inProgressRes.body.task.status).toBe('in_progress');
    expect(inProgressRes.body.task.sortOrder).toBe(2);

    // 4. Move status to completed
    const completedRes = await request(app)
      .patch(`/api/v1/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ status: 'completed' })
      .expect(200);

    expect(completedRes.body.task.status).toBe('completed');

    // 5. Update task details
    const patchRes = await request(app)
      .patch(`/api/v1/tasks/${taskId}`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({
        title: 'Draft FSSAI Compliance Checklist (Revised)',
        priority: 'urgent',
      })
      .expect(200);

    expect(patchRes.body.task.title).toBe('Draft FSSAI Compliance Checklist (Revised)');
    expect(patchRes.body.task.priority).toBe('urgent');

    // 6. Cross-User Ownership Isolation (404)
    await request(app)
      .get(`/api/v1/tasks/${taskId}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .expect(404);

    await request(app)
      .patch(`/api/v1/tasks/${taskId}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ title: 'Hacked Title' })
      .expect(404);

    await request(app)
      .patch(`/api/v1/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ status: 'todo' })
      .expect(404);

    await request(app)
      .delete(`/api/v1/tasks/${taskId}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .expect(404);

    // Verify User B's list is empty
    const userBList = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${userB.token}`)
      .expect(200);
    expect(userBList.body.items).toHaveLength(0);

    // 7. Delete task by User A
    await request(app)
      .delete(`/api/v1/tasks/${taskId}`)
      .set('Authorization', `Bearer ${userA.token}`)
      .expect(200);

    await request(app)
      .get(`/api/v1/tasks/${taskId}`)
      .set('Authorization', `Bearer ${userA.token}`)
      .expect(404);
  });

  it('generates roadmap with stand-in driver, syncs tasks into tasks table, tracks completion %, and enforces 404 ownership', async () => {
    const mockDriver: LlmDriver = {
      async generateJson() {
        return buildMockRoadmapJson(30);
      },
      async embedText() {
        return [0.1, 0.2, 0.3];
      },
    };

    const app = createApiApp({ dbPath: ':memory:', roadmapOptions: { driver: mockDriver } });
    const userA = await registerUser(app, 'founder.roadmap.a@example.in', 'Roadmap Founder A');
    const userB = await registerUser(app, 'founder.roadmap.b@example.in', 'Roadmap Founder B');

    // 1. Generate 30-day Roadmap
    const genRes = await request(app)
      .post('/api/v1/roadmap/generate')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ durationDays: 30 })
      .expect(201);

    expect(genRes.body.plan).toBeDefined();
    expect(genRes.body.evidenceLabel).toBe(ROADMAP_DISCLAIMER);
    expect(genRes.body.tasksCreatedCount).toBe(3); // 2 tasks in phase 1 + 1 in phase 2

    const planId = genRes.body.plan.id;

    // 2. Verify tasks table contains the generated tasks
    const tasksRes = await request(app)
      .get(`/api/v1/tasks?roadmapPlanId=${planId}`)
      .set('Authorization', `Bearer ${userA.token}`)
      .expect(200);

    expect(tasksRes.body.items).toHaveLength(3);
    const firstTask = tasksRes.body.items[0];
    expect(firstTask.title).toBe('Identify 50 cold storage operators in Pune');
    expect(firstTask.status).toBe('todo');
    expect(firstTask.roadmapPlanId).toBe(planId);

    // 3. Inspect Roadmap details with completion percentage
    const planDetailRes = await request(app)
      .get(`/api/v1/roadmap/${planId}`)
      .set('Authorization', `Bearer ${userA.token}`)
      .expect(200);

    expect(planDetailRes.body.plan.id).toBe(planId);
    expect(planDetailRes.body.tasks).toHaveLength(3);
    expect(planDetailRes.body.completionPercentage).toBe(0);

    // 4. Complete 1 of the 3 tasks
    await request(app)
      .patch(`/api/v1/tasks/${firstTask.id}/status`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ status: 'completed' })
      .expect(200);

    // Recheck completion percentage: 1/3 = 33%
    const updatedPlanRes = await request(app)
      .get(`/api/v1/roadmap/${planId}`)
      .set('Authorization', `Bearer ${userA.token}`)
      .expect(200);

    expect(updatedPlanRes.body.completionPercentage).toBe(33);

    // 5. Cross-User Ownership Isolation (404)
    await request(app)
      .get(`/api/v1/roadmap/${planId}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .expect(404);

    await request(app)
      .delete(`/api/v1/roadmap/${planId}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .expect(404);

    // 6. Delete Roadmap by User A
    await request(app)
      .delete(`/api/v1/roadmap/${planId}`)
      .set('Authorization', `Bearer ${userA.token}`)
      .expect(200);

    await request(app)
      .get(`/api/v1/roadmap/${planId}`)
      .set('Authorization', `Bearer ${userA.token}`)
      .expect(404);
  });

  it('records expenses, computes summaries & trends, manages category budgets with comparison, and enforces 404 ownership', async () => {
    const app = createApiApp({ dbPath: ':memory:' });
    const userA = await registerUser(app, 'founder.expenses.a@example.in', 'Expense Founder A');
    const userB = await registerUser(app, 'founder.expenses.b@example.in', 'Expense Founder B');

    const testMonth = '2026-11';

    // 1. Record expenses for User A
    const exp1Res = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({
        amount: 8000,
        category: 'Software & Tools',
        date: '2026-11-05',
        paymentMethod: 'Credit Card',
        description: 'AWS Cloud Services',
      })
      .expect(201);

    const exp1Id = exp1Res.body.expense.id;
    expect(exp1Res.body.expense.amount).toBe(8000);

    await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({
        amount: 5000,
        category: 'Software & Tools',
        date: '2026-11-12',
        paymentMethod: 'UPI',
        description: 'Google Workspace and domain renewal',
      })
      .expect(201);

    await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({
        amount: 12000,
        category: 'Marketing & Ads',
        date: '2026-11-15',
        paymentMethod: 'Credit Card',
        description: 'LinkedIn outreach sponsored campaigns',
      })
      .expect(201);

    // 2. Fetch expenses list and summary
    const expListRes = await request(app)
      .get(`/api/v1/expenses?month=${testMonth}`)
      .set('Authorization', `Bearer ${userA.token}`)
      .expect(200);

    expect(expListRes.body.items).toHaveLength(3);
    expect(expListRes.body.summary.totalAmount).toBe(25000); // 8000 + 5000 + 12000
    expect(expListRes.body.summary.byCategory['Software & Tools']).toBe(13000);
    expect(expListRes.body.summary.byCategory['Marketing & Ads']).toBe(12000);

    // 3. Set category budgets
    const budget1Res = await request(app)
      .post('/api/v1/expenses/budgets')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({
        category: 'Software & Tools',
        month: testMonth,
        amount: 15000,
      })
      .expect(201);

    const budget1Id = budget1Res.body.budget.id;
    expect(budget1Res.body.budget.amount).toBe(15000);

    await request(app)
      .post('/api/v1/expenses/budgets')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({
        category: 'Marketing & Ads',
        month: testMonth,
        amount: 10000, // Budget 10,000 but actual spent 12,000 -> status: over
      })
      .expect(201);

    // 4. Fetch Budget vs Actual comparison
    const budgetCompRes = await request(app)
      .get(`/api/v1/expenses/budgets?month=${testMonth}`)
      .set('Authorization', `Bearer ${userA.token}`)
      .expect(200);

    expect(budgetCompRes.body.items).toHaveLength(2);

    const softwareComp = budgetCompRes.body.comparison.find(
      (c: { category: string }) => c.category === 'Software & Tools',
    );
    expect(softwareComp).toBeDefined();
    expect(softwareComp.budgeted).toBe(15000);
    expect(softwareComp.actual).toBe(13000);
    expect(softwareComp.variance).toBe(2000); // under budget
    expect(softwareComp.status).toBe('on_track'); // 13000/15000 = 86.7%

    const mktComp = budgetCompRes.body.comparison.find(
      (c: { category: string }) => c.category === 'Marketing & Ads',
    );
    expect(mktComp).toBeDefined();
    expect(mktComp.budgeted).toBe(10000);
    expect(mktComp.actual).toBe(12000);
    expect(mktComp.variance).toBe(-2000); // over budget
    expect(mktComp.status).toBe('over');

    // 5. Cross-User Ownership Isolation (404)
    await request(app)
      .get(`/api/v1/expenses/${exp1Id}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .expect(404);

    await request(app)
      .patch(`/api/v1/expenses/${exp1Id}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ amount: 99999 })
      .expect(404);

    await request(app)
      .delete(`/api/v1/expenses/${exp1Id}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .expect(404);

    await request(app)
      .delete(`/api/v1/expenses/budgets/${budget1Id}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .expect(404);

    // User B's expense summary should be zero
    const userBExp = await request(app)
      .get('/api/v1/expenses')
      .set('Authorization', `Bearer ${userB.token}`)
      .expect(200);
    expect(userBExp.body.items).toHaveLength(0);
    expect(userBExp.body.summary.totalAmount).toBe(0);

    // 6. Delete Budget and Expense by User A
    await request(app)
      .delete(`/api/v1/expenses/budgets/${budget1Id}`)
      .set('Authorization', `Bearer ${userA.token}`)
      .expect(200);

    await request(app)
      .delete(`/api/v1/expenses/${exp1Id}`)
      .set('Authorization', `Bearer ${userA.token}`)
      .expect(200);
  });

  it('updates dashboard with real pending tasks, upcoming tasks, task completion %, and total expenses', async () => {
    const app = createApiApp({ dbPath: ':memory:' });
    const user = await registerUser(app, 'founder.dash.p5@example.in', 'Dash Founder P5');

    // Create 3 tasks (2 pending, 1 completed)
    await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        title: 'Task 1: Setup database',
        status: 'completed',
        dueDate: '2026-11-20',
      })
      .expect(201);

    await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        title: 'Task 2: Build auth middleware',
        status: 'in_progress',
        dueDate: '2026-11-22',
      })
      .expect(201);

    await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        title: 'Task 3: Launch beta test',
        status: 'todo',
        dueDate: '2026-11-28',
      })
      .expect(201);

    // Record 2 expenses
    await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        amount: 4500,
        category: 'Software & Tools',
        date: '2026-11-10',
      })
      .expect(201);

    await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        amount: 3500,
        category: 'Office & Operations',
        date: '2026-11-11',
      })
      .expect(201);

    // Query Dashboard
    const dashRes = await request(app)
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const s = dashRes.body.summary;
    expect(s.totalTasks).toBe(3);
    expect(s.pendingTasks).toBe(2);
    expect(s.completedTasks).toBe(1);
    expect(s.taskCompletionRate).toBe(33); // 1/3 = 33%
    expect(s.totalExpenses).toBe(8000); // 4500 + 3500

    expect(dashRes.body.upcomingTasks).toHaveLength(2); // Only non-completed tasks
    expect(dashRes.body.upcomingTasks[0].title).toBe('Task 2: Build auth middleware');
    expect(dashRes.body.upcomingTasks[1].title).toBe('Task 3: Launch beta test');
  });
});
