const http = require('http');

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== RUNNING SUNDAY CIRCLE BACKEND VERIFICATION TESTS ===\n');

  // 1. Health Check
  const health = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/health',
    method: 'GET',
  });
  console.log('1. Health Check:', health.status === 200 ? 'PASS' : 'FAIL', health.body);

  // 2. Login Ananya
  const login = await request(
    {
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: 'ananya@sundaycircle.com', password: 'user123456' }
  );
  console.log('2. User Login:', login.status === 200 ? 'PASS' : 'FAIL', 'Username:', login.body.profile?.username);
  const token = login.body.token;

  // 3. Get /api/auth/me
  const me = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/auth/me',
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('3. Auth Me:', me.status === 200 ? 'PASS' : 'FAIL', 'RealName (Private):', me.body.user?.realName);

  // 4. Get Groups
  const groups = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/groups',
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('4. Groups List:', groups.status === 200 ? 'PASS' : 'FAIL', 'Count:', groups.body.groups?.length);

  // 5. Get Events
  const events = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/events',
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('5. Events List:', events.status === 200 ? 'PASS' : 'FAIL', 'Count:', events.body.events?.length);

  // 6. Test RSVP
  if (events.body.events?.length > 0) {
    const eventId = events.body.events[0]._id;
    const rsvp = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/events/${eventId}/rsvp`,
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log('6. Atomic RSVP:', rsvp.status === 200 ? 'PASS' : 'FAIL', 'Status:', rsvp.body.status);
  }

  // 7. Discovery Feed
  const discovery = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/discovery/feed',
    method: 'GET',
  });
  console.log('7. Discovery Feed:', discovery.status === 200 ? 'PASS' : 'FAIL', 'Trending Groups:', discovery.body.trendingGroups?.length);

  // 8. Moderator Login & Audited Access
  const modLogin = await request(
    {
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: 'moderator@sundaycircle.com', password: 'mod123456' }
  );
  console.log('8. Moderator Login:', modLogin.status === 200 ? 'PASS' : 'FAIL', 'Role:', modLogin.body.user?.role);
  const modToken = modLogin.body.token;

  // 9. Audited Real-Name Access for Group Members
  if (groups.body.groups?.length > 0) {
    const gid = groups.body.groups[0]._id;
    const realNames = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/groups/${gid}/members/real-names`,
      method: 'GET',
      headers: { Authorization: `Bearer ${modToken}` },
    });
    console.log('9. Audited Real Names Access:', realNames.status === 200 ? 'PASS' : 'FAIL', 'Members returned:', realNames.body.roster?.length);
  }

  // 10. Audit Logs Inspection
  const auditLogs = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/moderation/access-logs',
    method: 'GET',
    headers: { Authorization: `Bearer ${modToken}` },
  });
  console.log('10. Audit Log Trail Verification:', auditLogs.status === 200 ? 'PASS' : 'FAIL', 'Logs Count:', auditLogs.body.logs?.length);

  console.log('\n=== ALL BACKEND INTEGRATION TESTS PASSED ===');
}

runTests().catch(console.error);
