const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const execFileAsync = promisify(execFile);

async function executarPythonJson(scriptPath, dados) {
  const tempDir = path.join(os.tmpdir(), 'gpcredito-python');
  fs.mkdirSync(tempDir, { recursive: true });
  const payload = typeof dados === 'string' ? dados : JSON.stringify(dados);
  const nome = `${path.basename(scriptPath, '.py')}-${Date.now()}-${crypto.randomUUID()}.json`;
  const tempPath = path.join(tempDir, nome);
  fs.writeFileSync(tempPath, payload, 'utf8');

  const tentativas = process.env.PYTHON_BIN
    ? [{ comando: process.env.PYTHON_BIN, args: [scriptPath, tempPath] }]
    : [
        { comando: 'python', args: [scriptPath, tempPath] },
        { comando: 'py', args: ['-3', scriptPath, tempPath] },
        { comando: 'python3', args: [scriptPath, tempPath] },
      ];

  let ultimoErro = null;
  try {
    for (const tentativa of tentativas) {
      try {
        return await execFileAsync(tentativa.comando, tentativa.args);
      } catch (error) {
        ultimoErro = error;
        if (error.code !== 'ENOENT') throw error;
      }
    }
    throw ultimoErro;
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

module.exports = { executarPythonJson };
