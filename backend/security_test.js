const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const API_BASE = 'http://127.0.0.1:8001';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const password = 'RideSec1234';
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK3sAAAAASUVORK5CYII=';
const nowTag = Date.now();
const emailA = `sec_user_a_${nowTag}@example.com`;
const emailB = `sec_user_b_${nowTag}@example.com`;

const results = [];
const add = (id, status, details = {}) => results.push({ id, status, ...details });

function createDataClient(token) {
  const global = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    ...(global ? { global } : {}),
  });
}

async function api(path, { method = 'GET', token, headers = {}, body } = {}) {
  const finalHeaders = { ...headers };
  if (token) finalHeaders.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { method, headers: finalHeaders, body });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }
  return { status: res.status, ok: res.ok, json, text };
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
  return { userId, token: session.access_token };
}

function formDataWithCreate(theme, intensity) {
  const fd = new FormData();
  fd.append('theme', theme);
  fd.append('intensity', String(intensity));
  fd.append('images', new Blob([Buffer.from(pngBase64, 'base64')], { type: 'image/png' }), 'security-create.png');
  return fd;
}

(async () => {
  let userA;
  let userB;
  let routeId = null;
  let spoofSubject = null;

  try {
    const protectedCases = [
      { id: 'SEC-001-GET-ME', path: '/api/users/me', method: 'GET' },
      { id: 'SEC-001-POST-ONBOARDING', path: '/api/users/onboarding', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) },
      { id: 'SEC-001-PUT-MILEAGE', path: '/api/health/mileage', method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mileage: 1234 }) },
      { id: 'SEC-001-GET-LATEST-ROUTE', path: '/api/explore/routes/latest', method: 'GET' },
      { id: 'SEC-001-POST-EXPLORE-ROUTES', path: '/api/explore/routes', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ time_limit_minutes: 60, latitude: 35.681236, longitude: 139.767125 }) },
      { id: 'SEC-001-POST-CREATE', path: '/api/create/generate', method: 'POST', body: formDataWithCreate('cyberpunk', 50) },
      { id: 'SEC-001-POST-ADMIN-SYNC', path: '/api/admin/announcements/sync', method: 'POST' },
    ];

    for (const testCase of protectedCases) {
      const response = await api(testCase.path, testCase);
      add(testCase.id, response.status === 401 ? 'PASS' : 'FAIL', {
        expected: 401,
        actual: response.status,
        response: response.json ?? response.text,
      });
    }

    const invalidTokenResponse = await api('/api/users/me', {
      token: 'invalid-token',
    });
    add('SEC-002-INVALID-TOKEN', invalidTokenResponse.status === 401 && !/stack|trace|prisma|select |from /i.test(invalidTokenResponse.text) ? 'PASS' : 'FAIL', {
      expected: 401,
      actual: invalidTokenResponse.status,
      response: invalidTokenResponse.json ?? invalidTokenResponse.text,
    });

    userA = await createUser(emailA);
    userB = await createUser(emailB);

    const onboardA = await api('/api/users/onboarding', {
      method: 'POST',
      token: userA.token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userB.userId,
        lastName: 'Security',
        firstName: 'TesterA',
        displayName: 'sec-a',
        email: emailA,
        vehicleMaker: 'Honda',
        vehicleName: 'CB250R',
      }),
    });
    const onboardB = await api('/api/users/onboarding', {
      method: 'POST',
      token: userB.token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lastName: 'Security',
        firstName: 'TesterB',
        displayName: 'sec-b',
        email: emailB,
        vehicleMaker: 'Yamaha',
        vehicleName: 'MT-07',
      }),
    });
    const profileA = await dbQuery('select id, display_name from public.profiles where id = $1', [userA.userId]);
    const profileB = await dbQuery('select id, display_name from public.profiles where id = $1', [userB.userId]);
    add('SEC-003-ONBOARDING-TAMPER', onboardA.status === 201 && onboardB.status === 201 && profileA.rowCount === 1 && profileB.rowCount === 1 && profileA.rows[0]?.id === userA.userId && profileB.rows[0]?.id === userB.userId ? 'PASS' : 'FAIL', {
      onboardingA: onboardA.status,
      onboardingB: onboardB.status,
      profileA: profileA.rows[0] ?? null,
      profileB: profileB.rows[0] ?? null,
    });

    const routeCreate = await api('/api/explore/routes', {
      method: 'POST',
      token: userA.token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time_limit_minutes: 60, latitude: 35.681236, longitude: 139.767125 }),
    });
    routeId = routeCreate.json?.data?.routes?.[0]?.route?.id ?? null;
    const unauthRoute = routeId
      ? await api(`/api/explore/routes/${routeId}`, { method: 'GET' })
      : { status: null, json: null, text: null };
    add('SEC-001-GET-ROUTE-DETAIL', routeId && unauthRoute.status === 401 ? 'PASS' : 'FAIL', {
      expected: 401,
      actual: unauthRoute.status,
      routeId,
      response: unauthRoute.json ?? unauthRoute.text,
    });
    const otherRoute = routeId
      ? await api(`/api/explore/routes/${routeId}`, { method: 'GET', token: userB.token })
      : { status: null, json: null, text: null };
    add('SEC-004-IDOR-ROUTE-DETAILS', routeCreate.status === 200 && otherRoute.status === 403 && !otherRoute.json?.data ? 'PASS' : 'FAIL', {
      routeCreateStatus: routeCreate.status,
      routeId,
      otherRouteStatus: otherRoute.status,
      otherRouteBody: otherRoute.json ?? otherRoute.text,
    });

    const adminSync = await api('/api/admin/announcements/sync', {
      method: 'POST',
      token: userA.token,
    });
    add('SEC-005-ADMIN-ENDPOINT', adminSync.status === 403 ? 'PASS' : 'FAIL', {
      expected: 403,
      actual: adminSync.status,
      response: adminSync.json ?? adminSync.text,
    });

    const beforeInvalidContact = await dbQuery('select count(*)::int as c from public.contact_messages');
    const invalidContactEmail = await api('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'bad-email',
        category: 'question',
        subject: 'valid subject',
        message: 'valid message',
      }),
    });
    const invalidContactCategory = await api('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `valid_${nowTag}@example.com`,
        category: 'invalid-category',
        subject: 'valid subject',
        message: 'valid message',
      }),
    });
    const invalidContactSubject = await api('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `valid_subject_${nowTag}@example.com`,
        category: 'question',
        subject: 'x'.repeat(61),
        message: 'valid message',
      }),
    });
    const invalidContactMessage = await api('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `valid_message_${nowTag}@example.com`,
        category: 'question',
        subject: 'valid subject',
        message: 'y'.repeat(2001),
      }),
    });
    const afterInvalidContact = await dbQuery('select count(*)::int as c from public.contact_messages');
    add('SEC-006A-CONTACT-INVALID-EMAIL', invalidContactEmail.status === 400 ? 'PASS' : 'FAIL', {
      expected: 400,
      actual: invalidContactEmail.status,
      response: invalidContactEmail.json ?? invalidContactEmail.text,
    });
    add('SEC-006B-CONTACT-INVALID-CATEGORY', invalidContactCategory.status === 400 ? 'PASS' : 'FAIL', {
      expected: 400,
      actual: invalidContactCategory.status,
      response: invalidContactCategory.json ?? invalidContactCategory.text,
    });
    add('SEC-006C-CONTACT-INVALID-SUBJECT', invalidContactSubject.status === 400 ? 'PASS' : 'FAIL', {
      expected: 400,
      actual: invalidContactSubject.status,
      response: invalidContactSubject.json ?? invalidContactSubject.text,
    });
    add('SEC-006D-CONTACT-INVALID-MESSAGE', invalidContactMessage.status === 400 ? 'PASS' : 'FAIL', {
      expected: 400,
      actual: invalidContactMessage.status,
      response: invalidContactMessage.json ?? invalidContactMessage.text,
    });
    add('SEC-006E-CONTACT-VALIDATION-NO-INSERT', beforeInvalidContact.rows[0]?.c === afterInvalidContact.rows[0]?.c ? 'PASS' : 'FAIL', {
      beforeCount: beforeInvalidContact.rows[0]?.c,
      afterCount: afterInvalidContact.rows[0]?.c,
    });

    spoofSubject = `SEC spoof ${nowTag}`;
    const spoofResponse = await api('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Unauth Spoof',
        email: `spoof_${nowTag}@example.com`,
        category: 'question',
        subject: spoofSubject,
        message: 'metadata userId spoof security test',
        metadata: {
          route: '/settings/contact',
          userId: userA.userId,
        },
      }),
    });
    const spoofRow = spoofResponse.json?.contactId
      ? await dbQuery('select metadata from public.contact_messages where id = $1', [spoofResponse.json.contactId])
      : { rows: [] };
    const spoofedUserId = spoofRow.rows[0]?.metadata?.userId ?? null;
    add('SEC-007-CONTACT-METADATA-SPOOF', spoofResponse.status === 201 && spoofedUserId === userA.userId ? 'FAIL' : 'PASS', {
      actualStatus: spoofResponse.status,
      contactId: spoofResponse.json?.contactId ?? null,
      storedMetadataUserId: spoofedUserId,
      expectedBehavior: 'Unauthenticated request should not be able to persist arbitrary userId metadata',
    });

    const announcementGlobalTitle = `SEC global ${nowTag}`;
    const announcementAOnlyTitle = `SEC userA ${nowTag}`;
    const announcementBOnlyTitle = `SEC userB ${nowTag}`;
    const announcementExpiredTitle = `SEC expired ${nowTag}`;
    await dbQuery(
      `insert into public.announcements (is_global, target_user_id, title, content, start_date, end_date)
       values
       (true, null, $1, 'global announcement', now() - interval '1 minute', now() + interval '1 day'),
       (false, $2, $3, 'targeted for user A', now() - interval '1 minute', now() + interval '1 day'),
       (false, $4, $5, 'targeted for user B', now() - interval '1 minute', now() + interval '1 day'),
       (true, null, $6, 'expired announcement', now() - interval '2 day', now() - interval '1 day')`,
      [announcementGlobalTitle, userA.userId, announcementAOnlyTitle, userB.userId, announcementBOnlyTitle, announcementExpiredTitle]
    );
    const anonAnnouncementClient = createDataClient();
    const userAAnnouncementClient = createDataClient(userA.token);
    const userBAnnouncementClient = createDataClient(userB.token);
    const anonAnnouncements = await anonAnnouncementClient
      .from('announcements')
      .select('title')
      .in('title', [announcementGlobalTitle, announcementAOnlyTitle, announcementBOnlyTitle, announcementExpiredTitle]);
    const userAAnnouncements = await userAAnnouncementClient
      .from('announcements')
      .select('title')
      .in('title', [announcementGlobalTitle, announcementAOnlyTitle, announcementBOnlyTitle, announcementExpiredTitle]);
    const userBAnnouncements = await userBAnnouncementClient
      .from('announcements')
      .select('title')
      .in('title', [announcementGlobalTitle, announcementAOnlyTitle, announcementBOnlyTitle, announcementExpiredTitle]);
    const anonTitles = (anonAnnouncements.data ?? []).map((row) => row.title).sort();
    const userATitles = (userAAnnouncements.data ?? []).map((row) => row.title).sort();
    const userBTitles = (userBAnnouncements.data ?? []).map((row) => row.title).sort();
    add('SEC-008-ANNOUNCEMENTS-RLS', anonTitles.length === 1
      && anonTitles.includes(announcementGlobalTitle)
      && userATitles.length === 2
      && userATitles.includes(announcementGlobalTitle)
      && userATitles.includes(announcementAOnlyTitle)
      && userBTitles.length === 2
      && userBTitles.includes(announcementGlobalTitle)
      && userBTitles.includes(announcementBOnlyTitle)
      && !anonTitles.includes(announcementExpiredTitle)
      && !userATitles.includes(announcementExpiredTitle)
      && !userBTitles.includes(announcementExpiredTitle)
      ? 'PASS' : 'FAIL', {
      anonTitles,
      userATitles,
      userBTitles,
      anonError: anonAnnouncements.error?.message ?? null,
      userAError: userAAnnouncements.error?.message ?? null,
      userBError: userBAnnouncements.error?.message ?? null,
    });

    const contactReadAnonClient = createDataClient();
    const contactReadAuthClient = createDataClient(userA.token);
    const anonContactRead = spoofSubject
      ? await contactReadAnonClient.from('contact_messages').select('id, subject').eq('subject', spoofSubject)
      : { data: null, error: null };
    const authContactRead = spoofSubject
      ? await contactReadAuthClient.from('contact_messages').select('id, subject').eq('subject', spoofSubject)
      : { data: null, error: null };
    add('SEC-009-CONTACT-RLS-DIRECT-READ', (anonContactRead.data ?? []).length === 0 && (authContactRead.data ?? []).length === 0 ? 'PASS' : 'FAIL', {
      anonRows: anonContactRead.data ?? null,
      authRows: authContactRead.data ?? null,
      anonError: anonContactRead.error?.message ?? null,
      authError: authContactRead.error?.message ?? null,
    });

    const bucketConfig = await dbQuery(
      `select public, file_size_limit, allowed_mime_types
       from storage.buckets
       where id = 'contact-attachments'`
    );
    const storagePolicies = await dbQuery(
      `select policyname, cmd, roles, qual, with_check
       from pg_policies
       where schemaname = 'storage'
         and tablename = 'objects'
         and policyname in (
           'Anyone can upload contact attachments',
           'Anyone can view contact attachments',
           'Anyone can update contact attachments',
           'Anyone can delete contact attachments'
         )
       order by policyname`
    );
    const bucketRow = bucketConfig.rows[0] ?? null;
    const permissivePolicies = storagePolicies.rows.filter((row) => ['SELECT', 'UPDATE', 'DELETE'].includes(String(row.cmd).toUpperCase()));
    add('SEC-010-CONTACT-ATTACHMENT-STORAGE-POLICY', bucketRow && bucketRow.public === false && permissivePolicies.length === 0 ? 'PASS' : 'FAIL', {
      bucket: bucketRow,
      policies: storagePolicies.rows,
      expectedBehavior: 'Contact attachment bucket should not be public, and anonymous broad read/update/delete should not be allowed',
    });
  } catch (error) {
    add('HARNESS', 'FAIL', { error: String(error && error.stack || error) });
  }

  console.log(JSON.stringify({
    executedAt: new Date().toISOString(),
    apiBase: API_BASE,
    results,
  }, null, 2));
})();
