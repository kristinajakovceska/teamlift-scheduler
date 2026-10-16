// End-to-end smoke test against a running API: `npm run smoke` (API_URL defaults to localhost:3000).
// Covers the core rules: create, list, book, no double booking (incl. a race), validation.
const API = process.env.API_URL ?? 'http://localhost:3000/api';

let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`);
  if (!ok) failures++;
};

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

// Pick a random far-future day so repeated runs don't collide with each other.
const day = new Date(Date.now() + (200 + Math.floor(Math.random() * 3000)) * 86_400_000).toISOString().slice(0, 10);

const health = await call('GET', '/health');
check('health endpoint', health.status === 200, health.data?.database);

const created = await call('POST', '/host/slots', { date: day, startTime: '10:00', durationMinutes: 30, count: 3 });
check('create 3 back-to-back slots', created.status === 201 && created.data.length === 3,
  created.data?.map?.((s) => s.startsAt.slice(11)).join(', '));
const [first, second] = created.data;

const overlap = await call('POST', '/host/slots', { date: day, startTime: '10:45', durationMinutes: 30 });
check('reject overlapping slot', overlap.status === 409, overlap.data?.message);

const past = await call('POST', '/host/slots', { date: '2020-01-01', startTime: '10:00', durationMinutes: 30 });
check('reject slot in the past', past.status === 400, past.data?.message);

const badDate = await call('POST', '/host/slots', { date: '2027-02-31', startTime: '10:00', durationMinutes: 30 });
check('reject impossible date', badDate.status === 400, badDate.data?.message);

const badEmail = await call('POST', `/slots/${first.id}/bookings`, { name: 'Sam', email: 'nope' });
check('reject invalid email', badEmail.status === 400, [].concat(badEmail.data?.message).join('; '));

const booked = await call('POST', `/slots/${first.id}/bookings`, { name: 'Sam Lee', email: 'Sam@Example.com', topic: 'Prompting for sales emails' });
check('book a free slot', booked.status === 201, booked.data?.id);

const again = await call('POST', `/slots/${first.id}/bookings`, { name: 'Kim', email: 'kim@example.com' });
check('second booking of same slot is rejected', again.status === 409, again.data?.message);

const list = await call('GET', '/slots');
const listed = list.data.find((s) => s.id === first.id);
check('public list marks slot as booked', listed?.isBooked === true);
check('public list hides booker details', listed && !('booking' in listed) && !JSON.stringify(list.data).includes('example.com'));

// Race: 8 people hit "Book" on the same slot at the same moment. Exactly one must win.
const race = await Promise.all(
  Array.from({ length: 8 }, (_, i) =>
    call('POST', `/slots/${second.id}/bookings`, { name: `Racer ${i}`, email: `racer${i}@example.com` }),
  ),
);
const wins = race.filter((r) => r.status === 201).length;
const conflicts = race.filter((r) => r.status === 409).length;
check('concurrent bookings: exactly one wins', wins === 1 && conflicts === 7, `${wins} won, ${conflicts} got 409`);

const msg = await call('POST', `/bookings/${booked.data.id}/confirmation-message`);
check('confirmation message endpoint', msg.status === 201 && msg.data.message.length > 0, `source=${msg.data?.source}`);
console.log(`      "${msg.data?.message}"`);

const host = await call('GET', '/host/slots');
const hostSlot = host.data.find((s) => s.id === first.id);
check('host dashboard shows booking details', hostSlot?.booking?.email === 'sam@example.com');

for (const s of created.data) await call('DELETE', `/host/slots/${s.id}`);
const afterDelete = await call('GET', '/slots');
check('host can remove slots', !afterDelete.data.some((s) => created.data.some((c) => c.id === s.id)));

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
