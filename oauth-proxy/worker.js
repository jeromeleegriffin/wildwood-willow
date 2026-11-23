const CLIENT_ID = 'Ov23licq5KAD3YnxNc1R';
const CLIENT_SECRET = '4589d125800999bc9e4203fd3dbf7d8163f6c09e';

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/auth') {
      const authUrl = 'https://github.com/login/oauth/authorize?client_id=' + CLIENT_ID + '&scope=repo';
      return Response.redirect(authUrl, 302);
    }

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      if (!code) return new Response('Missing code', { status: 400 });

      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code: code
        })
      });

      const tokenData = await tokenRes.json();
      const token = tokenData.access_token;

      const html = `
        <html>
          <body>
            <script>
              window.opener.postMessage(
                'authorization:github:success:' + JSON.stringify({ token: '${token}' }),
                '*'
              );
              window.close();
            </script>
          </body>
        </html>
      `;
      return new Response(html, { headers: { 'Content-Type': 'text/html' } });
    }

    return new Response('Decap CMS OAuth Proxy', { status: 200 });
  }
};