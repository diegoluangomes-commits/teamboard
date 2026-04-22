const express  = require('express');
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');
const { getOAuthClient } = require('./auth');
const router = express.Router();

// Middleware — exige login
function requireAuth(req, res, next) {
  if (!req.session.tokens) {
    return res.status(401).json({ error: 'Não autenticado. Faça login com o Google primeiro.' });
  }
  next();
}

function buildCalendarClient(tokens) {
  const auth = getOAuthClient();
  auth.setCredentials(tokens);
  // Auto-refresh do token quando expirado
  auth.on('tokens', (newTokens) => {
    if (newTokens.refresh_token) tokens.refresh_token = newTokens.refresh_token;
    tokens.access_token  = newTokens.access_token;
    tokens.expiry_date   = newTokens.expiry_date;
  });
  return google.calendar({ version: 'v3', auth });
}

// POST /meet/create
// Body: { title, date, time, duration, participants, taskId }
router.post('/create', requireAuth, async (req, res) => {
  const {
    title        = 'Reunião TeamBoard',
    date,
    time         = '09:00',
    duration     = 60,
    participants = [],
    taskId
  } = req.body;

  try {
    const calendar = buildCalendarClient(req.session.tokens);

    // Monta data/hora de início e fim com fuso de Brasília (UTC-3)
    // Usa offset fixo -03:00 para evitar conversão automática do servidor (que está em UTC)
    const startLocal = date
      ? `${date}T${time}:00-03:00`
      : new Date().toISOString();
    const startISO = new Date(startLocal).toISOString();
    const endISO   = new Date(new Date(startISO).getTime() + duration * 60000).toISOString();

    // Lista de e-mails dos participantes
    const attendees = (Array.isArray(participants) ? participants : participants.split(','))
      .map(e => e.trim())
      .filter(Boolean)
      .map(email => ({ email }));

    // Adiciona o próprio usuário como organizador
    if (req.session.userInfo?.email) {
      const alreadyIn = attendees.some(a => a.email === req.session.userInfo.email);
      if (!alreadyIn) attendees.unshift({ email: req.session.userInfo.email, responseStatus: 'accepted' });
    }

    const event = {
      summary: title,
      start:   { dateTime: startISO, timeZone: 'America/Sao_Paulo' },
      end:     { dateTime: endISO,   timeZone: 'America/Sao_Paulo' },
      attendees,
      conferenceData: {
        createRequest: {
          requestId:             uuidv4(),
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email',  minutes: 30 },
          { method: 'popup',  minutes: 10 }
        ]
      }
    };

    const { data } = await calendar.events.insert({
      calendarId:               'primary',
      resource:                 event,
      conferenceDataVersion:    1,
      sendUpdates:              attendees.length > 1 ? 'all' : 'none'
    });

    const meetLink = data.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri
                  || data.hangoutLink
                  || null;

    res.json({
      success:    true,
      meetUrl:    meetLink,
      eventId:    data.id,
      eventLink:  data.htmlLink,
      title:      data.summary,
      start:      data.start.dateTime,
      end:        data.end.dateTime,
      taskId
    });
  } catch (err) {
    console.error('Erro ao criar Meet:', err.message);
    const msg = err.code === 401
      ? 'Sessão expirada. Faça login novamente.'
      : err.message;
    res.status(500).json({ error: msg });
  }
});

// DELETE /meet/delete/:eventId  — remove o evento do Google Calendar
router.delete('/delete/:eventId', requireAuth, async (req, res) => {
  try {
    const calendar = buildCalendarClient(req.session.tokens);
    await calendar.events.delete({ calendarId: 'primary', eventId: req.params.eventId });
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir evento:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /meet/list — lista eventos futuros com Meet
router.get('/list', requireAuth, async (req, res) => {
  try {
    const calendar = buildCalendarClient(req.session.tokens);
    const { data } = await calendar.events.list({
      calendarId:   'primary',
      timeMin:      new Date().toISOString(),
      maxResults:   20,
      singleEvents: true,
      orderBy:      'startTime',
      q:            'TeamBoard'
    });

    const events = (data.items || [])
      .filter(e => e.conferenceData)
      .map(e => ({
        eventId:   e.id,
        title:     e.summary,
        start:     e.start?.dateTime,
        end:       e.end?.dateTime,
        meetUrl:   e.conferenceData?.entryPoints?.find(p => p.entryPointType === 'video')?.uri || e.hangoutLink,
        eventLink: e.htmlLink
      }));

    res.json({ events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
