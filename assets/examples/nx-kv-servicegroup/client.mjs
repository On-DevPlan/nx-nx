// nx-kv HTTP 契约验证 client：这条验证通过，就证明 servicegroup 套件可用。
// 新接口验证脚本照此文件复制一份，加入 clients 数组即可扩展。
heading('client 开始：验证 nx-kv HTTP 接口');

const ping = await getJson(BASE_URL + KV_ENDPOINTS.ping);
assertApi('GET /api/ping', ping, (d) => d?.pong === true, JSON.stringify(ping));

const health = await getJson(BASE_URL + KV_ENDPOINTS.health);
assertApi('GET /api/health', health, (d) => d?.status === 'ok', JSON.stringify(health));

const bootstrap = await getJson(BASE_URL + KV_ENDPOINTS.bootstrap);
assertApi(
  'GET /api/bootstrap',
  bootstrap,
  (d) => d?.app?.name === EXPECTED_APP && Array.isArray(d?.commands),
  `app=${bootstrap?.data?.app?.name}, commands=${bootstrap?.data?.commands?.length}`,
);

const contract = await getJson(BASE_URL + KV_ENDPOINTS.contract);
assertApi(
  'GET /api/contract',
  contract,
  (d) => typeof d?.hash === 'string' && Array.isArray(d?.actions),
  `hash=${contract?.data?.hash}, actions=${contract?.data?.actions?.length}`,
);

const tasks = await getJson(BASE_URL + KV_ENDPOINTS.localtasks);
assertApi(
  'GET /api/localtasks',
  tasks,
  (d) => Array.isArray(d?.topics) && Boolean(d?.settings),
  `topics=${tasks?.data?.topics?.length}`,
);
