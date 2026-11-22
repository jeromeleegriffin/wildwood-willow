// Simple Cloudflare Worker OAuth proxy for Decap CMS
// Deploy this as a separate Worker, then set its URL as the base_url in admin/config.yml

const CLIENT_ID = 'Ov23licq5KAD3YnxNc1R'; // your GitHub OAuth Client ID
const CLIENT_SECRET = 'PASTE_YOUR_CLIENT_SECRET_HERE'; // you will get this from the GitHub OAuth app

export default {
  async fetch(request) {
    const url = new URL(request.url);
    
    if (url.pathname === '/auth') {
      const authUrl = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&scope=repo&state=${crypto.randomUUID()}`;
      return Response.redirect(authUrl, 302);
    }
    
    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      if (!code) return new Response('Missing code', { status: 400 });
      
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code
        })
      });
      
      const tokenData = await tokenRes.json();
      const token = tokenData.access_token;
      
      const html = `
        <script>
          window.opener.postMessage('authorization:github:success:${JSON.stringify({ token })}', '*');
          window.close();
        </script>
      `;
      return new Response(html, { headers: { 'Content-Type': 'text/html' } });
    }
    
    return new Response('Decap CMS OAuth Proxy', { status: 200 });
  }
};