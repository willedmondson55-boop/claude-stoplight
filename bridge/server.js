#!/usr/bin/env node
// Claude Code stoplight bridge.
// Accepts state reports from Claude Code hooks and serves them to the
// Chrome extension over plain JSON and Server-Sent Events.
// No dependencies beyond Node built-ins.

const http = require('http');

const PORT = Number(process.env.STOPLIGHT_PORT) || 4747;
const HOST = '127.0.0.1';
const EXPIRY_MS = 15 * 60 * 1000; // no update in 15 min -> grey
const VALID_STATES = new Set(['green', 'yellow', 'red', 'grey']);

let current = {
  state: 'grey',
  session: null,
  detail: 'no active session',
  since: Date.now(), // when this state was entered
  updatedAt: Date.now(), // last report of any kind
};

const sseClients = new Set();

function corsHeaders() {
  // The extension's contexts have a chrome-extension:// origin; hooks use curl
  // (no origin). The bridge only binds to loopback, so a wildcard is fine.
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function snapshot() {
  return {
    state: current.state,
    session: current.session,
    detail: current.detail,
    since: current.since,
    updatedAt: current.updatedAt,
  };
}

function broadcast() {
  const payload = `data: ${JSON.stringify(snapshot())}\n\n`;
  for (const res of sseClients) {
    res.write(payload);
  }
}

function setState(state, session, detail) {
  const now = Date.now();
  const changed = state !== current.state;
  if (changed) current.since = now;
  current.state = state;
  current.session = session ?? current.session;
  if (detail !== undefined) current.detail = detail;
  current.updatedAt = now;
  broadcast();
  console.log(`[${new Date(now).toISOString()}] ${state}${detail ? ` — ${detail}` : ''}`);
}

// Auto-expire to grey when nothing has reported for a while.
setInterval(() => {
  if (current.state !== 'grey' && Date.now() - current.updatedAt > EXPIRY_MS) {
    setState('grey', null, 'no active session');
  }
}, 30 * 1000).unref();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/state') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders() });
    res.end(JSON.stringify(snapshot()));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/state') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) req.destroy(); // sanity cap
    });
    req.on('end', () => {
      let parsed;
      try {
        parsed = JSON.parse(body || '{}');
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders() });
        res.end(JSON.stringify({ error: 'invalid JSON' }));
        return;
      }
      if (!VALID_STATES.has(parsed.state)) {
        res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders() });
        res.end(JSON.stringify({ error: `state must be one of: ${[...VALID_STATES].join(', ')}` }));
        return;
      }
      setState(parsed.state, parsed.session, parsed.detail);
      res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders() });
      res.end(JSON.stringify(snapshot()));
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/clients') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders() });
    res.end(JSON.stringify({ sseClients: sseClients.size }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...corsHeaders(),
    });
    res.write(`data: ${JSON.stringify(snapshot())}\n\n`); // initial state
    sseClients.add(res);
    const keepalive = setInterval(() => res.write(': ping\n\n'), 25 * 1000);
    req.on('close', () => {
      clearInterval(keepalive);
      sseClients.delete(res);
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json', ...corsHeaders() });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, HOST, () => {
  console.log(`Claude Code stoplight bridge listening on http://${HOST}:${PORT}`);
  console.log('  POST /state  {"state":"green|yellow|red|grey","session":"...","detail":"..."}');
  console.log('  GET  /state  current state as JSON');
  console.log('  GET  /events SSE stream of state changes');
});
