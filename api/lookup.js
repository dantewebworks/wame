const twilio = require('twilio');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return res.status(500).json({
      error: 'Twilio credentials not configured on server',
      code: 'MISSING_CREDENTIALS'
    });
  }

  let numbers = [];
  try {
    const body = req.body || {};
    if (Array.isArray(body.numbers)) {
      numbers = body.numbers;
    } else if (typeof body.number === 'string') {
      numbers = [body.number];
    }
  } catch (e) {
    // In case body parsing failed
  }

  numbers = (numbers || [])
    .filter(Boolean)
    .map((n) => String(n).trim());

  if (!numbers.length) {
    return res.status(400).json({ error: 'No numbers provided' });
  }

  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

  try {
    const results = await Promise.all(
      numbers.map(async (number) => {
        try {
          // Prefer Lookups v2 to get line_type_intelligence with fixed/nonfixedVoIP
          const resp = await client.lookups.v2
            .phoneNumbers(number)
            .fetch({ fields: ['line_type_intelligence', 'carrier'] });

          const type = resp.lineTypeIntelligence?.type || resp.carrier?.type || 'unknown';
          return {
            number,
            type,
            carrier: resp.carrier?.name || resp.carrier || 'Unknown',
            country: resp.countryCode || 'Unknown',
            valid: typeof resp.valid === 'boolean' ? resp.valid : true
          };
        } catch (err) {
          return {
            number,
            error: err?.message || 'Lookup failed'
          };
        }
      })
    );

    return res.status(200).json({ results });
  } catch (error) {
    console.error('Lookup API error:', error);
    return res.status(503).json({
      error: 'Unable to look up numbers right now, please try again later.'
    });
  }
};