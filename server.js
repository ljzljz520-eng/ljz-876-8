const path = require('path');
const express = require('express');
const db = require('./src/db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', require('./src/routes/api'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`消防安全演练考试台已启动: http://localhost:${PORT}`);
});
