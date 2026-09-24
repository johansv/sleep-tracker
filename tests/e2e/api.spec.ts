import { test, expect } from '@playwright/test';

test('Worker and D1 enforce record structure, isolation and uniqueness', async ({ request }) => {
  const created = await request.post('/api/profiles', {
    data: { name: 'API test', is_active: true },
  });
  expect(created.status()).toBe(201);
  const profile = await created.json();
  const base = `/api/profiles/${profile.id}/sessions`;
  const input = {
    night_date: '2026-09-25',
    bedtime_local: '2026-09-24T23:35',
    wake_time_local: '2026-09-25T07:10',
  };
  expect(
    (
      await request.post(base, { data: { ...input, bedtime_local: null, wake_time_local: null } })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post(base, { data: { ...input, wake_time_local: '2026-09-24T07:00' } })
    ).status(),
  ).toBe(400);
  expect(
    (await request.post(base, { data: { ...input, bedtime_local: '2026-09-24T23:00Z' } })).status(),
  ).toBe(400);
  expect((await request.post('/api/profiles/missing/sessions', { data: input })).status()).toBe(
    404,
  );
  const stored = await request.post(base, { data: input });
  expect(stored.status()).toBe(201);
  const row = await stored.json();
  expect((await request.post(base, { data: input })).status()).toBe(409);
  expect(
    (await request.put(`/api/profiles/demo-alex/sessions/${row.id}`, { data: input })).status(),
  ).toBe(404);
  expect(
    (
      await request.post(base, { data: input, headers: { Origin: 'https://unrelated.example' } })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post('/api/profiles', { data: { name: 'x'.repeat(9000), is_active: true } })
    ).status(),
  ).toBe(413);
  const stats = await (await request.get('/api/statistics?kind=rolling&anchor=2026-09-25')).json();
  expect(
    stats.find((p: { profile: { id: string } }) => p.profile.id === profile.id).statistics,
  ).toMatchObject({ mean: 455, median: 455, count: 1, total: 7 });
  await request.put(`${base}/${row.id}`, { data: { ...input, wake_time_local: null } });
  const after = await (await request.get('/api/statistics?kind=rolling&anchor=2026-09-25')).json();
  expect(
    after.find((p: { profile: { id: string } }) => p.profile.id === profile.id).statistics,
  ).toMatchObject({ mean: null, count: 0, incomplete: 1, missing: 6 });
  await request.delete(`${base}/${row.id}`);
  expect(await (await request.get(base)).json()).toEqual([]);
});
