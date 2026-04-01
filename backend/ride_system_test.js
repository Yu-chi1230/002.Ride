const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const API_BASE = 'http://127.0.0.1:8001';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const password = 'RideTest1234';
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK3sAAAAASUVORK5CYII=';
const wavBase64 = 'UklGRlQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTAAAAA=';

const nowTag = Date.now();
const emailA = `st_user_a_${nowTag}@example.com`;
const emailB = `st_user_b_${nowTag}@example.com`;
const emailLock = `st_lock_${nowTag}@example.com`;

const results = [];
const add = (id, status, details = {}) => results.push({ id, status, ...details });

async function api(path, { method = 'GET', token, headers = {}, body } = {}) {
  const finalHeaders = { ...headers };
  if (token) finalHeaders.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { method, headers: finalHeaders, body });
  let json = null;
  try { json = await res.json(); } catch (_) {}
  return { status: res.status, ok: res.ok, json };
}

async function dbQuery(sql, params = []) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

async function createUser(email) {
  const signUp = await supabase.auth.signUp({ email, password });
  if (signUp.error) throw new Error(`signUp failed for ${email}: ${signUp.error.message}`);
  const userId = signUp.data.user && signUp.data.user.id;
  let session = signUp.data.session;
  if (!session) {
    const signIn = await supabase.auth.signInWithPassword({ email, password });
    if (signIn.error) throw new Error(`signIn failed for ${email}: ${signIn.error.message}`);
    session = signIn.data.session;
  }
  if (!userId || !session || !session.access_token) {
    throw new Error(`No session for ${email}`);
  }
  return { userId, token: session.access_token, refreshToken: session.refresh_token };
}

function formDataWithImage(logType) {
  const fd = new FormData();
  fd.append('log_type', logType);
  fd.append('image', new Blob([Buffer.from(pngBase64, 'base64')], { type: 'image/png' }), 'sample.png');
  return fd;
}

function formDataWithCreate(theme, intensity) {
  const fd = new FormData();
  fd.append('theme', theme);
  fd.append('intensity', String(intensity));
  fd.append('images', new Blob([Buffer.from(pngBase64, 'base64')], { type: 'image/png' }), 'create.png');
  return fd;
}

function formDataWithAudio() {
  const fd = new FormData();
  fd.append('audio', new Blob([Buffer.from(wavBase64, 'base64')], { type: 'audio/wav' }), 'sample.wav');
  return fd;
}

(async () => {
  let userA, userB, userLock;
  let routeIdA = null;
  let contactId = null;

  try {
    const unauth = await api('/api/users/me');
    add('ST-001-API-UNAUTH', unauth.status === 401 ? 'PASS' : 'FAIL', { expected: 401, actual: unauth.status });

    userA = await createUser(emailA);
    userB = await createUser(emailB);
    userLock = await createUser(emailLock);
    add('SETUP-USERS', 'PASS', { emailA, emailB, emailLock, userA: userA.userId, userB: userB.userId });

    const onboardA = await api('/api/users/onboarding', {
      method: 'POST',
      token: userA.token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'tamper-attempt',
        lastName: 'System',
        firstName: 'TesterA',
        displayName: 'st-a',
        email: emailA,
        vehicleMaker: 'Honda',
        vehicleName: 'CBR250R'
      })
    });
    const onboardB = await api('/api/users/onboarding', {
      method: 'POST',
      token: userB.token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lastName: 'System',
        firstName: 'TesterB',
        displayName: 'st-b',
        email: emailB,
        vehicleMaker: 'Yamaha',
        vehicleName: 'MT-07'
      })
    });
    const onboardRows = await dbQuery('select id, display_name from public.profiles where id = any($1::uuid[]) order by id', [[userA.userId, userB.userId]]);
    const vehicleRows = await dbQuery('select user_id, maker, model_name from public.vehicles where user_id = any($1::uuid[]) order by user_id', [[userA.userId, userB.userId]]);
    add('ST-002-ONBOARDING', onboardA.status === 201 && onboardB.status === 201 && onboardRows.rowCount === 2 && vehicleRows.rowCount === 2 ? 'PASS' : 'FAIL', {
      onboardingA: onboardA.status,
      onboardingB: onboardB.status,
      profiles: onboardRows.rowCount,
      vehicles: vehicleRows.rowCount
    });

    const loginOk = await api('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailA, password })
    });
    add('ST-001-LOGIN', loginOk.status === 200 && !!loginOk.json?.session?.access_token ? 'PASS' : 'FAIL', { actual: loginOk.status });

    let statuses = [];
    for (let i = 0; i < 5; i += 1) {
      const r = await api('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailLock, password: 'WrongPass1234' })
      });
      statuses.push(r.status);
    }
    add('ST-013A-LOGIN-RATE-LIMIT', statuses.slice(0, 4).every((s) => s === 401) && statuses[4] === 429 ? 'PASS' : 'FAIL', { statuses });

    const updateMe = await api('/api/users/me', {
      method: 'PUT',
      token: userA.token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: 'Updated',
        last_name: 'Tester',
        display_name: 'updated-system-a',
        vehicle_maker: 'Suzuki',
        vehicle_model_name: 'GSX250R',
        last_oil_change_mileage: 1200,
        last_oil_change_date: '2026-03-01',
        monthly_avg_mileage: 250,
        oil_change_interval_km: 3000
      })
    });
    const meAfterUpdate = await api('/api/users/me', { token: userA.token });
    const maintenanceRows = await dbQuery('select count(*)::int as c from public.maintenance_history mh join public.vehicles v on v.id = mh.vehicle_id where v.user_id = $1', [userA.userId]);
    add('ST-010-ST-011-SETTINGS', updateMe.status === 200 && meAfterUpdate.status === 200 && meAfterUpdate.json?.data?.display_name === 'updated-system-a' && meAfterUpdate.json?.data?.vehicles?.[0]?.maker === 'Suzuki' && maintenanceRows.rows[0]?.c >= 1 ? 'PASS' : 'FAIL', {
      updateStatus: updateMe.status,
      getStatus: meAfterUpdate.status,
      maintenanceHistoryCount: maintenanceRows.rows[0]?.c
    });

    const invalidMileage = await api('/api/health/mileage', {
      method: 'PUT',
      token: userA.token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mileage: -1 })
    });
    const validMileage = await api('/api/health/mileage', {
      method: 'PUT',
      token: userA.token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mileage: 1500 })
    });
    const mileageDb = await dbQuery('select current_mileage from public.vehicles where user_id = $1 order by created_at desc limit 1', [userA.userId]);
    const mileageLogs = await dbQuery("select count(*)::int as c from public.health_logs hl join public.vehicles v on v.id = hl.vehicle_id where v.user_id = $1 and hl.log_type = 'manual'", [userA.userId]).catch(() => ({ rows: [{ c: null }] }));
    add('ST-006-ST-013A-ODO', invalidMileage.status === 400 && validMileage.status === 200 && mileageDb.rows[0]?.current_mileage === 1500 ? 'PASS' : 'FAIL', {
      invalidStatus: invalidMileage.status,
      validStatus: validMileage.status,
      dbMileage: mileageDb.rows[0]?.current_mileage,
      manualLogCount: mileageLogs.rows[0]?.c
    });

    const healthImage = await api('/api/health/analyze', {
      method: 'POST',
      token: userA.token,
      body: formDataWithImage('tire')
    });
    add('ST-005-HEALTH-IMAGE', healthImage.status === 200 ? 'PASS' : 'FAIL', {
      actual: healthImage.status,
      error: healthImage.json?.error || null
    });

    const healthAudio = await api('/api/health/analyze-audio', {
      method: 'POST',
      token: userA.token,
      body: formDataWithAudio()
    });
    add('ST-004-HEALTH-AUDIO', healthAudio.status === 200 ? 'PASS' : 'FAIL', {
      actual: healthAudio.status,
      error: healthAudio.json?.error || null
    });

    const createA = await api('/api/create/generate', {
      method: 'POST',
      token: userA.token,
      body: formDataWithCreate('cyberpunk', 70)
    });
    const createB = await api('/api/create/generate', {
      method: 'POST',
      token: userB.token,
      body: formDataWithCreate('vintage', 40)
    });
    const creationRowsB = await dbQuery('select count(*)::int as c from public.creations where user_id = $1', [userB.userId]);
    add('ST-009-CREATE', createA.status === 200 && createB.status === 200 && creationRowsB.rows[0]?.c >= 1 ? 'PASS' : 'FAIL', {
      createA: createA.status,
      createB: createB.status,
      creationIdA: createA.json?.data?.creation_id || null,
      creationCountB: creationRowsB.rows[0]?.c
    });

    const explore = await api('/api/explore/routes', {
      method: 'POST',
      token: userA.token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time_limit_minutes: 60, latitude: 35.681236, longitude: 139.767125 })
    });
    routeIdA = explore.json?.data?.routes?.[0]?.route?.id || null;
    const latest = await api('/api/explore/routes/latest', { token: userA.token });
    const ownRoute = routeIdA ? await api(`/api/explore/routes/${routeIdA}`, { token: userA.token }) : { status: null, json: null };
    const otherRoute = routeIdA ? await api(`/api/explore/routes/${routeIdA}`, { token: userB.token }) : { status: null, json: null };
    const routeRows = routeIdA ? await dbQuery('select count(*)::int as c from public.routes where id = $1 and user_id = $2', [routeIdA, userA.userId]) : { rows: [{ c: 0 }] };
    add('ST-007-ST-003-ST-008-ST-008A-EXPLORE', explore.status === 200 && latest.status === 200 && ownRoute.status === 200 && otherRoute.status === 403 && routeRows.rows[0]?.c === 1 ? 'PASS' : 'FAIL', {
      exploreStatus: explore.status,
      latestStatus: latest.status,
      ownRouteStatus: ownRoute.status,
      otherRouteStatus: otherRoute.status,
      routeIdA
    });

    const beforeContact = await dbQuery('select count(*)::int as c from public.contact_messages', []);
    const contact = await api('/api/contact', {
      method: 'POST',
      token: userA.token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailA,
        category: 'question',
        subject: `ST contact ${nowTag}`,
        message: 'system test contact message',
        metadata: { route: '/settings/contact', userId: userA.userId }
      })
    });
    contactId = contact.json?.contactId || null;
    const afterContact = await dbQuery('select count(*)::int as c from public.contact_messages', []);
    const contactRow = contactId ? await dbQuery('select notion_sync_status, notion_sync_error from public.contact_messages where id = $1', [contactId]) : { rows: [] };
    add('ST-012A-CONTACT', contact.status === 201 && afterContact.rows[0].c === beforeContact.rows[0].c + 1 ? 'PASS' : 'FAIL', {
      status: contact.status,
      notionSyncStatus: contact.json?.notionSyncStatus || contactRow.rows[0]?.notion_sync_status || null
    });

    const invalidContact = await api('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'bad-email', category: 'question', subject: 'x', message: 'y' })
    });
    add('ST-013A-CONTACT-VALIDATION', invalidContact.status === 400 ? 'PASS' : 'FAIL', { actual: invalidContact.status });

    const deleteB = await api('/api/users/me', {
      method: 'DELETE',
      token: userB.token
    });
    const deletedRows = await dbQuery('select (select count(*)::int from auth.users where id = $1) as auth_count, (select count(*)::int from public.profiles where id = $1) as profile_count, (select count(*)::int from public.vehicles where user_id = $1) as vehicle_count, (select count(*)::int from public.creations where user_id = $1) as creation_count', [userB.userId]);
    add('ST-014-DELETE', deleteB.status === 200 && deletedRows.rows[0]?.auth_count === 0 && deletedRows.rows[0]?.profile_count === 0 && deletedRows.rows[0]?.vehicle_count === 0 && deletedRows.rows[0]?.creation_count === 0 ? 'PASS' : 'FAIL', {
      deleteStatus: deleteB.status,
      counts: deletedRows.rows[0]
    });
  } catch (error) {
    add('HARNESS', 'FAIL', { error: String(error && error.stack || error) });
  }

  console.log(JSON.stringify({ executedAt: new Date().toISOString(), results }, null, 2));
})();
