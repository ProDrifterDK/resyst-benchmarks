# Resyst Labs Benchmarks

Standalone public site for Resyst Labs model rankings and Resyst Arena evidence.

Canonical target domain: `https://benchmarks.resyst.cl/`

## Local commands

```bash
npm run test
npm run build
python3 -m http.server 4174 --directory dist --bind 127.0.0.1
```

## Public contract

- Self-contained public copy.
- No dependency on any publishing-platform context.
- Rankings are backed by versioned JSON artifacts in `src/data/`.
- Arena matches are presented as evidence artifacts, not final universal claims.
