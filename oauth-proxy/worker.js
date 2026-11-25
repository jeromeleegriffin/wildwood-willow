const adminOrigin = 'https://wwbotanicals.org';
const callback = 'https://dawn-recipe-9862wildwood-oauth.jeromeleegriffin.workers.dev/callback';
const cookieName = '__Host-ww-oauth-state';
const cookieFlags = 'Path=/; Secure; HttpOnly; SameSite=Lax';
const baseHeaders = {'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};

function reply(message, status, headers = {}) {
  return new Response(message,{status,headers:{...baseHeaders,...headers}});
}

function sendToAdmin(kind, data, cookie) {
  const nonce = crypto.randomUUID();
  const message = 'authorization:github:' + kind + ':' + JSON.stringify(data);
  const scriptMessage = JSON.stringify(message).replaceAll('<','\\u003c');
  const script = 'if (window.opener) { window.opener.postMessage(' + scriptMessage + ', ' +
    JSON.stringify(adminOrigin) + '); window.close(); }';
  return reply('<!doctype html><meta charset="utf-8"><title>Administrator sign-in</title>' +
    '<p>Return to the administrator panel.</p><script nonce="' + nonce + '">' + script + '</script>',200,{
      'Content-Type':'text/html; charset=utf-8',
      'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; script-src 'nonce-" + nonce + "'",
      'Set-Cookie':cookie
    });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.origin !== new URL(callback).origin) return reply('Not found',404);
    if (request.method !== 'GET') return reply('Method not allowed',405,{Allow:'GET'});
    if (!['/auth','/callback'].includes(url.pathname)) return reply('Not found',404);
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return reply('Sign-in is temporarily unavailable',503);

    if (url.pathname === '/auth') {
      const state = crypto.randomUUID() + crypto.randomUUID();
      const authUrl = new URL('https://github.com/login/oauth/authorize');
      authUrl.search = new URLSearchParams({
        client_id:env.GITHUB_CLIENT_ID,redirect_uri:callback,scope:'repo',state
      });
      return reply(null,302,{Location:authUrl.href,'Set-Cookie':cookieName+'='+state+'; Max-Age=600; '+cookieFlags});
    }

    const clear = cookieName + '=; Max-Age=0; ' + cookieFlags;
    const expected = (request.headers.get('Cookie') || '').split(/;\s*/).find(part=>part.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    const state = url.searchParams.get('state');
    if (!expected || !state || expected !== state) return reply('Invalid sign-in state. Please try again.',400,{'Set-Cookie':clear});
    const code = url.searchParams.get('code');
    if (!code) return sendToAdmin('error',{error:'GitHub sign-in was cancelled.'},clear);
    try {
      const response = await fetch('https://github.com/login/oauth/access_token',{
        method:'POST',
        headers:{Accept:'application/json','Content-Type':'application/json'},
        body:JSON.stringify({
          client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code,redirect_uri:callback
        })
      });
      const {access_token:token} = await response.json();
      if (!response.ok || typeof token !== 'string' || !token) throw Error('Token exchange failed');
      return sendToAdmin('success',{token},clear);
    } catch {
      return sendToAdmin('error',{error:'GitHub sign-in failed. Please try again.'},clear);
    }
  }
};
