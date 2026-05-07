const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();

app.use(cors({
  origin: ['https://quicktext.github.io', 'http://localhost:3000', 'http://192.168.100.32:3000'],
  methods: ['POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

const MESOMB_APP_KEY = 'e18d9eeaca13e7a980f4cf788de3d340d611ea3e';
const MESOMB_ACCESS_KEY = '78c7de30-1966-4251-826c-1294d476de47';
const MESOMB_SECRET_KEY = '4c255aea-0b18-4c3b-846d-4656147c90d8';

app.post('/api/recharge', async (req, res) => {
  try {
    const { phone, amount } = req.body;

    if (!phone || !amount) {
      return res.status(400).json({ success: false, message: 'Numéro et montant requis' });
    }

    const service = phone.startsWith('6') ? 'MTN' : 'ORANGE';

    const payload = {
      payer: phone,
      amount: Number(amount),
      service: service,
      country: 'CM',
      currency: 'XAF',
      nonce: `${Date.now()}-${Math.floor(Math.random() * 100000)}`
    };

    const response = await fetch('https://mesomb.hachther.com/api/v1.0/payment/collect/', {
      method: 'POST',
      headers: {
        'X-MeSomb-Application': MESOMB_APP_KEY,
        'X-MeSomb-AccessKey': MESOMB_ACCESS_KEY,
        'X-MeSomb-SecretKey': MESOMB_SECRET_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    res.status(response.status).json(data);

  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur: ' + error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy MeSomb démarré sur le port ${PORT}`));