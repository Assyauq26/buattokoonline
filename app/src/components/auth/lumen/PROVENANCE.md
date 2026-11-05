# Lumen registry subset for React 18

Source: @santi020k/lumen-react4.1.0 and @santi020k/lumen4.1.0, MIT, Santiago Molina. Public contracts checked against connected Lumen MCP snapshot 7113faa8466fe24529069b1918abbbfdf18c101d00341b2824cba2149c416e77.

The published React adapter requires React>=19 (including older0.4/1.8/3 releases) and4.1 adds motion14. Gheverhan uses React18.3.1. Rather than upgrade React/Next or force peer dependencies, this auth-only registry adoption retains the upstream Button/Input/Label/Checkbox markup/classes and native props, with forwardRef for React18 and a static existing-Lucide Icon mapping. It intentionally exposes only the primitives used here, not asChild or the full Lumen runtime. No dependency or backend change.

styles.css is the upstream primitive CSS subset scoped under .auth-ui; root tokens are scoped too. No body/reset or unrelated components. Imported once in the auth layout before product theme overrides. Upstream CSS SHA256: e2678034d0fe7300ad152ceb7697d42e6fe281a3fb4818791bde43a348cdb353. Source packages fetched from npm and their types/implementation inspected. Keep LICENSE.
