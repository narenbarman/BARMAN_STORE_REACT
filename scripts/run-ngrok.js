const { spawn } = require('child_process');

const args = ['http', '5000', '--url=https://techiest-really-delicia.ngrok-free.dev'];
const child = spawn('ngrok', args, {
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

child.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
