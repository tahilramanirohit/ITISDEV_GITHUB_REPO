const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const playerStats = {
  player: "Alex Garcia",
  skillLevel: "Intermediate",
  wins: 18,
  losses: 7,
  lastMatch: "2026-07-08",
  kpis: [
    { label: "Avg Dink Rate", value: "76.4%", target: "80%" },
    { label: "Unforced Err/Match", value: "4.8", trend: "Improving" },
    { label: "Kitchen Time", value: "34%", target: "45%" },
    { label: "Target Goal", value: "85% Volley", eta: "12 weeks" }
  ]
};

app.get('/api/player-stats', (req, res) => {
  res.json(playerStats);
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});