const express = require('express');
const { google } = require('googleapis');
const router = express.Router();

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// Inicia o fluxo OAuth — redireciona para a tela de login Google
router.get('/google', (req, res) => {
  const oauth2Client = getOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ]
  });
  res.redirect(url);
});

// Callback do Google — troca o code pelo access_token
router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.redirect('/?auth=error&reason=' + encodeURIComponent(error));
  }

  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Busca dados do usuário
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    // Salva na sessão
    req.session.tokens   = tokens;
    req.session.userInfo = {
      name:    userInfo.name,
      email:   userInfo.email,
      picture: userInfo.picture
    };

    res.redirect('/?auth=success');
  } catch (err) {
    console.error('Erro no callback OAuth:', err.message);
    res.redirect('/?auth=error&reason=token_exchange');
  }
});

// Logout — limpa sessão
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Status — retorna se o usuário está logado
router.get('/status', (req, res) => {
  if (req.session.tokens && req.session.userInfo) {
    res.json({ loggedIn: true, user: req.session.userInfo });
  } else {
    res.json({ loggedIn: false });
  }
});

module.exports = router;
module.exports.getOAuthClient = getOAuthClient;
