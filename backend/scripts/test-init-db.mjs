import { initDatabase, pool } from '../src/db/mysql.js';

async function main() {
  console.log('Testing MySQL initialization...');
  let connected = false;
  let attempts = 0;
  while (!connected && attempts < 10) {
    try {
      attempts++;
      const [res] = await pool.query('SELECT 1 as ping;');
      if (res) connected = true;
    } catch (err) {
      console.log(`Waiting for MySQL ready state... attempt ${attempts}/10 (${err.message})`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  await initDatabase();
  const [tables] = await pool.query('SHOW TABLES;');
  const [capsuleCols] = await pool.query('DESCRIBE capsules;');
  const colNames = capsuleCols.map((c) => c.Field);
  console.log('Columns in capsules:', colNames);
  if (!colNames.includes('user_id')) {
    throw new Error('Column "user_id" missing from capsules table!');
  }

  const [usersCount] = await pool.query('SELECT COUNT(*) as total FROM users;');
  console.log('Total users:', usersCount[0].total);
  const [circleCount] = await pool.query('SELECT COUNT(*) as total FROM circle_connections;');
  console.log('Total circle connections:', circleCount[0].total);
  await pool.end();
  console.log('Test completed successfully!');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

