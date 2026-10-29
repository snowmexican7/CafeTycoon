import { main } from './balanceCore';

try {
  const r = main(process.argv.slice(2));
  process.stdout.write(r.output + '\n');
  process.exitCode = r.code;
} catch (e) {
  console.error(e);
  process.exitCode = 1;
}
