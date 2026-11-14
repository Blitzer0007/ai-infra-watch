// Static inventory only. Source text is parsed, never imported or executed.
import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n'))]
  .filter(path => /\.(?:tsx?|[mc]?js|py|sql)$/.test(path) &&
    !/(^|\/)(?:node_modules|dist|docs|data|public|qa|tests?|fixtures|migration_recovery)(\/|$)/.test(path) &&
    !/(?:\.test\.|\.spec\.|\/test_|^test_)/.test(path));
const rows = [], failures = [];
const operators = new Set([ts.SyntaxKind.SlashToken, ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskAsteriskToken, ts.SyntaxKind.PercentToken]);
for (const file of files.filter(path => /\.(?:tsx?|[mc]?js)$/.test(path))) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length) failures.push({ file, errors: source.parseDiagnostics.length });
  const operations = [];
  function visit(node) {
    if ((ts.isBinaryExpression(node) && operators.has(node.operatorToken.kind)) ||
      (ts.isCallExpression(node) && /^Math\./.test(node.expression.getText(source)))) {
      operations.push({ line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, expression: node.getText(source).replace(/\s+/g, ' ').slice(0, 180) });
    }
    ts.forEachChild(node, visit);
  }
  visit(source); if (operations.length) rows.push({ file, language: 'javascript-typescript', operations });
}
const pythonScript = `import ast,json,sys
out=[]; failures=[]
for path in json.load(sys.stdin):
 try:
  source=open(path,encoding='utf8').read(); tree=ast.parse(source)
  ops=[{'line':node.lineno,'expression':(ast.get_source_segment(source,node) or '').replace('\\n',' ')[:180]} for node in ast.walk(tree) if isinstance(node,ast.BinOp)]
  if ops: out.append({'file':path,'language':'python','operations':ops})
 except (SyntaxError,UnicodeError) as exc: failures.append({'file':path,'error':type(exc).__name__})
print(json.dumps({'rows':out,'failures':failures}))`;
const python = JSON.parse(execFileSync('python3', ['-c', pythonScript], { input: JSON.stringify(files.filter(path => path.endsWith('.py'))), encoding: 'utf8' }));
rows.push(...python.rows); failures.push(...python.failures);
const sqlFiles = files.filter(path => path.endsWith('.sql'));
const result = { version: 1, sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  note: 'Candidate inventory, not proof of financial correctness. Arithmetic also includes dates, indexes and presentation. SQL is inventoried without semantic parsing. Working-tree edits are included.',
  scannedSourceFiles: files.length, arithmeticCandidateFiles: rows.length, parseFailures: failures,
  sqlFiles, modules: rows.sort((a,b) => a.file.localeCompare(b.file)) };
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ scannedSourceFiles: files.length, arithmeticCandidateFiles: rows.length, pythonCandidateFiles: python.rows.length, sqlFiles: sqlFiles.length, parseFailures: failures }));
